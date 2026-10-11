import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ensureMailHeaderSchema } from '../src/lib/mail-header-schema.js';

export function d1Results(output) {
	const responses = JSON.parse(output);
	if (!Array.isArray(responses) || responses.length === 0 || responses.some(response => response.success !== true || !Array.isArray(response.results))) {
		throw new Error('D1 did not return a successful JSON query result');
	}
	return responses.flatMap(response => response.results);
}

export async function migrateMailHeaders(execute) {
	const columns = d1Results(await execute('PRAGMA table_info(email)'));
	if (columns.length === 0) {
		return 'Fresh database: post-deploy initialization will create the email table and header columns.';
	}
	await ensureMailHeaderSchema({
		prepare(sql) {
			return { sql, all: async () => ({ results: d1Results(await execute(sql)) }) };
		},
		async batch(statements) {
			for (const statement of statements) d1Results(await execute(statement.sql));
		},
	});
	const verified = new Set(d1Results(await execute('PRAGMA table_info(email)')).map(column => column.name));
	for (const name of ['headers', 'raw_headers', 'envelope_from']) {
		if (!verified.has(name)) throw new Error(`Mail header migration did not create ${name}`);
	}
	return 'Mail header schema verified. Existing messages were preserved.';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	try {
		const config = process.argv[2] || 'wrangler-action.toml';
		const status = await migrateMailHeaders(sql => execFileSync('pnpm', [
			'exec', 'wrangler', 'd1', 'execute', 'db', '--remote', '--config', config,
			'--command', sql, '--json', '--yes',
		], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
		console.log(status);
	} catch {
		console.error('Mail header migration failed. Deployment stopped; check D1 binding and API token permissions.');
		process.exitCode = 1;
	}
}
