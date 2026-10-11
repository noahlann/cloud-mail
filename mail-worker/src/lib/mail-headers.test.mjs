import assert from 'node:assert/strict';
import { test } from 'node:test';
import PostalMime from 'postal-mime';
import { mailHeaderFields } from './mail-headers.js';

test('retains all headers, repeated recipients, folding, and SMTP sender', async () => {
	const header = [
		'From: Sender <sender@example.test>',
		'To: Hide My Email <hidden@icloud.com>',
		'X-Original-To: hidden+task1@icloud.com',
		'Delivered-To: forward@example.test',
		'Delivered-To: hidden+task1@icloud.com',
		'Received: from relay.example.test by mx.example.test',
		'\tfor <hidden+task1@icloud.com>; Sun, 11 Oct 2026 14:40:46 +0000',
		'Subject: 123test',
	].join('\r\n');
	const bytes = new TextEncoder().encode(header + '\r\n\r\n123456 code verify');
	const parsed = await PostalMime.parse(bytes);
	const fields = mailHeaderFields(parsed, bytes, 'bounce@example.test');
	assert.equal(fields.rawHeaders, header);
	assert.equal(fields.envelopeFrom, 'bounce@example.test');
	const headers = JSON.parse(fields.headers);
	assert.equal(headers.filter(item => item.key === 'delivered-to').length, 2);
	assert.ok(headers.some(item => item.key === 'x-original-to' && item.value === 'hidden+task1@icloud.com'));
	assert.ok(headers.some(item => item.key === 'received' && item.value.includes('for <hidden+task1@icloud.com>')));
	assert.equal(parsed.to[0].address, 'hidden@icloud.com');
});

test('LF input retains headers while body addresses remain outside headers', async () => {
	const header = 'From: sender@example.test\nTo: hidden@icloud.com\nSubject: no route';
	const bytes = new TextEncoder().encode(header + '\n\nOld mail to hidden+task1@icloud.com');
	const parsed = await PostalMime.parse(bytes);
	const fields = mailHeaderFields(parsed, bytes.buffer, '');
	assert.equal(fields.rawHeaders, header);
	assert.ok(!fields.headers.includes('hidden+task1@icloud.com'));
});

test('byte parsing does not corrupt a Unicode header across stream chunks', async () => {
	const bytes = new TextEncoder().encode('From: sender@example.test\r\nTo: hidden@icloud.com\r\nSubject: 邮件测试\r\n\r\n正文');
	const stream = new ReadableStream({
		start(controller) {
			for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
			controller.close();
		},
	});
	const content = await new Response(stream).arrayBuffer();
	const parsed = await PostalMime.parse(content);
	assert.equal(parsed.subject, '邮件测试');
	assert.equal(parsed.text.trim(), '正文');
	assert.ok(mailHeaderFields(parsed, content, '').rawHeaders.includes('Subject: 邮件测试'));
});
