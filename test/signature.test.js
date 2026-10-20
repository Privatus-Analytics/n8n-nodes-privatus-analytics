'use strict';

// The webhooks API signs every delivery (https://privatusanalytics.com/docs/api/webhooks):
//
//   Privatus-Signature: t=<unix time>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">
//
// keyed with the signing secret returned when the webhook was created.

const assert = require('node:assert');
const crypto = require('node:crypto');
const { describe, it } = require('node:test');
const { verifySignature } = require('../dist/nodes/shared/signature');
const ruby = require('./fixtures-ruby-signature.json');

const SECRET = 'whsec_0123456789abcdef0123456789abcdef0123456789abcdef';
const NOW = 1790000000;
const body = JSON.stringify({
	id: 'whd_1',
	event: 'testimonial.received',
	data: { site_id: 'pa_1' },
});

const sign = (content, time = NOW, secret = SECRET) =>
	`t=${time},v1=${crypto.createHmac('sha256', secret).update(`${time}.${content}`).digest('hex')}`;
const check = (header, content = body, secret = SECRET, now = NOW) =>
	verifySignature(secret, content, header, now * 1000);

describe('webhook signature', () => {
	it('accepts a signature made by the Rails app itself (Webhook.signature_header)', () => {
		const t = Number(/t=(\d+)/.exec(ruby.header)[1]);
		assert.strictEqual(check(ruby.header, ruby.body, ruby.secret, t), true);
	});

	it('accepts a delivery signed the way the webhooks API signs, as text or bytes', () => {
		assert.strictEqual(check(sign(body)), true);
		assert.strictEqual(check(sign(body), Buffer.from(body)), true);
	});

	it('refuses a missing or malformed header', () => {
		assert.strictEqual(check(undefined), false);
		assert.strictEqual(check(''), false);
		assert.strictEqual(check('v1=abc'), false);
		assert.strictEqual(check(`t=${NOW}`), false);
		assert.strictEqual(check(`t=${NOW},v1=${'0'.repeat(63)}`), false);
		assert.strictEqual(check(`t=abc,v1=${'0'.repeat(64)}`), false);
	});

	it('refuses a changed body, another secret, no secret and no body', () => {
		assert.strictEqual(check(sign(body), `${body} `), false);
		assert.strictEqual(check(sign(body), body, 'whsec_other'), false);
		assert.strictEqual(check(sign(body), body, ''), false);
		assert.strictEqual(verifySignature(undefined, body, sign(body), NOW * 1000), false);
		assert.strictEqual(verifySignature(SECRET, undefined, sign(body), NOW * 1000), false);
	});

	it('refuses a signature made for another time', () => {
		const valid = sign(body);
		const replayed = valid.replace(`t=${NOW}`, `t=${NOW + 1}`);
		assert.strictEqual(check(replayed), false);
	});

	it('allows five minutes of difference and no more, in both directions', () => {
		assert.strictEqual(check(sign(body, NOW - 300)), true);
		assert.strictEqual(check(sign(body, NOW - 301)), false);
		assert.strictEqual(check(sign(body, NOW + 300)), true);
		assert.strictEqual(check(sign(body, NOW + 301)), false);
	});

	it('refuses an uppercase signature', () => {
		const header = sign(body).toUpperCase().replace('T=', 't=').replace('V1=', 'v1=');
		assert.strictEqual(check(header), false);
	});
});
