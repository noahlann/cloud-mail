export async function ensureMailHeaderSchema(db) {
	const { results } = await db.prepare('PRAGMA table_info(email)').all();
	const existing = new Set(results.map(column => column.name));
	const columns = [
		['headers', "TEXT NOT NULL DEFAULT '[]'"],
		['raw_headers', "TEXT NOT NULL DEFAULT ''"],
		['envelope_from', "TEXT NOT NULL DEFAULT ''"],
	];
	const statements = columns.filter(([name]) => !existing.has(name))
		.map(([name, definition]) => db.prepare(`ALTER TABLE email ADD COLUMN ${name} ${definition}`));
	if (statements.length) await db.batch(statements);
}
