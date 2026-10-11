import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { ensureMailHeaderSchema } from './mail-header-schema.js';

function d1(database) {
	return {
		prepare(sql) {
			return { sql, all: async () => ({ results: database.prepare(sql).all() }) };
		},
		async batch(statements) {
			for (const statement of statements) database.exec(statement.sql);
		},
	};
}

test('migration preserves existing messages and can initialize twice', async () => {
	const database = new DatabaseSync(':memory:');
	try {
		database.exec("CREATE TABLE email (email_id INTEGER PRIMARY KEY, subject TEXT); INSERT INTO email VALUES (22, '123test');");
		await ensureMailHeaderSchema(d1(database));
		await ensureMailHeaderSchema(d1(database));
		const row = database.prepare('SELECT * FROM email WHERE email_id = 22').get();
		assert.equal(row.subject, '123test');
		assert.equal(row.headers, '[]');
		assert.equal(row.raw_headers, '');
		assert.equal(row.envelope_from, '');
		database.prepare('INSERT INTO email (email_id, headers, raw_headers, envelope_from) VALUES (?, ?, ?, ?)')
			.run(23, '[{"key":"x-original-to","value":"hidden+task1@icloud.com"}]', 'X-Original-To: hidden+task1@icloud.com', 'bounce@example.test');
		assert.equal(database.prepare('SELECT raw_headers FROM email WHERE email_id = 23').get().raw_headers, 'X-Original-To: hidden+task1@icloud.com');
	} finally {
		database.close();
	}
});

test('standalone SQL migration is compatible with the idempotent initializer', async () => {
	const database = new DatabaseSync(':memory:');
	try {
		database.exec('CREATE TABLE email (email_id INTEGER PRIMARY KEY);');
		database.exec(await readFile(new URL('../../migrations/mail-headers.sql', import.meta.url), 'utf8'));
		await ensureMailHeaderSchema(d1(database));
		const names = database.prepare('PRAGMA table_info(email)').all().map(column => column.name);
		assert.deepEqual(names, ['email_id', 'headers', 'raw_headers', 'envelope_from']);
	} finally {
		database.close();
	}
});
