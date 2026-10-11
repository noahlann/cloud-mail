import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { d1Results, migrateMailHeaders } from './migrate-mail-headers.mjs';

function executor(database) {
	return sql => {
		const results = /^PRAGMA/.test(sql) ? database.prepare(sql).all() : (database.exec(sql), []);
		return JSON.stringify([{ success: true, results }]);
	};
}

test('pre-deploy migration keeps mail and can safely run on every deployment', async () => {
	const database = new DatabaseSync(':memory:');
	try {
		database.exec("CREATE TABLE email (email_id INTEGER PRIMARY KEY, subject TEXT); INSERT INTO email VALUES (22, '123test');");
		assert.match(await migrateMailHeaders(executor(database)), /verified/);
		assert.match(await migrateMailHeaders(executor(database)), /verified/);
		const row = database.prepare('SELECT * FROM email WHERE email_id = 22').get();
		assert.equal(row.subject, '123test');
		assert.equal(row.headers, '[]');
		assert.equal(row.raw_headers, '');
		assert.equal(row.envelope_from, '');
	} finally {
		database.close();
	}
});

test('a partially applied migration resumes without duplicate-column errors', async () => {
	const database = new DatabaseSync(':memory:');
	try {
		database.exec("CREATE TABLE email (email_id INTEGER PRIMARY KEY, headers TEXT NOT NULL DEFAULT '[]');");
		assert.match(await migrateMailHeaders(executor(database)), /verified/);
		assert.equal(database.prepare('PRAGMA table_info(email)').all().length, 4);
	} finally {
		database.close();
	}
});

test('fresh deployments leave initial table creation to the existing initializer', async () => {
	const database = new DatabaseSync(':memory:');
	try {
		assert.match(await migrateMailHeaders(executor(database)), /Fresh database/);
		assert.equal(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().length, 0);
	} finally {
		database.close();
	}
});

test('query failures stop the migration', async () => {
	for (const result of ['invalid', '[]', '[{"success":false,"results":[]}]', '[{"success":true}]']) {
		assert.throws(() => d1Results(result));
		await assert.rejects(migrateMailHeaders(() => result));
	}
	await assert.rejects(migrateMailHeaders(() => { throw new Error('authorization failed'); }));
});

test('verification fails when a query reports success but creates no columns', async () => {
	const existing = JSON.stringify([{ success: true, results: [{ name: 'email_id' }] }]);
	await assert.rejects(migrateMailHeaders(sql => /^PRAGMA/.test(sql) ? existing : '[{"success":true,"results":[]}]'), /did not create/);
});
