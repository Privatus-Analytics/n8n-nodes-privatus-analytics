'use strict';

const assert = require('node:assert');
const crypto = require('node:crypto');
const { describe, it } = require('node:test');
const {
	PrivatusAnalyticsTrigger,
} = require('../dist/nodes/PrivatusAnalyticsTrigger/PrivatusAnalyticsTrigger.node');
const { toItem, matchesFilters } = require('../dist/nodes/shared/payload');
const { EVENTS } = require('../dist/nodes/shared/events');
const { fakeExecute, withWorkspace, apiFailure } = require('./helpers');

const trigger = new PrivatusAnalyticsTrigger();
const methods = trigger.webhookMethods.default;
const WEBHOOK_URL = 'https://n8n.example.com/webhook/abc/webhook';
const SECRET = 'whsec_0123456789abcdef0123456789abcdef0123456789abcdef';

/** A hook context with static data kept between calls. */
function hook({ params, routes, saved = {} }) {
	const ctx = fakeExecute({ params, routes });
	ctx.getWorkflowStaticData = () => saved;
	ctx.getNodeWebhookUrl = () => WEBHOOK_URL;
	ctx.saved = saved;
	return ctx;
}

/** A webhook context for one delivery. */
function delivery({
	envelope,
	params,
	saved = { secret: SECRET },
	header,
	raw,
	time = Math.floor(Date.now() / 1000),
}) {
	const rawBody = raw ?? JSON.stringify(envelope);
	const signature =
		header === undefined
			? `t=${time},v1=${crypto
					.createHmac('sha256', saved.secret || SECRET)
					.update(`${time}.${rawBody}`)
					.digest('hex')}`
			: header;
	const response = {
		code: null,
		body: null,
		status(code) {
			this.code = code;
			return this;
		},
		json(body) {
			this.body = body;
			return this;
		},
	};
	return {
		response,
		getRequestObject: () => ({ rawBody: Buffer.from(rawBody) }),
		getResponseObject: () => response,
		getHeaderData: () => (signature ? { 'privatus-signature': signature } : {}),
		getBodyData: () => JSON.parse(rawBody),
		getWorkflowStaticData: () => saved,
		getNodeParameter: (name, fallback) => (name in params ? params[name] : fallback),
		helpers: { returnJsonArray: (item) => [{ json: item }] },
	};
}

const received = {
	id: 'whd_1',
	event: 'testimonial.received',
	created_at: '2026-10-20T10:15:00Z',
	workspace_id: 'ws_1',
	data: { site_id: 'pa_1', testimonial: { id: 'tm_1', rating: 5 }, source: 'form' },
};

describe('webhook lifecycle', () => {
	it('creates one webhook for the chosen events and keeps its id and secret', async () => {
		const ctx = hook({
			params: { events: ['alert.triggered', 'site.created'] },
			routes: withWorkspace(() => ({ data: { id: 'wh_1', secret: 'whsec_abc' } })),
		});
		assert.strictEqual(await methods.checkExists.call(ctx), false);
		assert.strictEqual(await methods.create.call(ctx), true);
		const post = ctx.calls[ctx.calls.length - 1];
		assert.strictEqual(post.method, 'POST');
		assert.strictEqual(post.url, 'https://privatusanalytics.com/workspaces/ws_TEST/webhooks.json');
		assert.deepStrictEqual(post.body, {
			url: WEBHOOK_URL,
			events: ['alert.triggered', 'site.created'],
			enabled: true,
		});
		assert.deepStrictEqual(ctx.saved, {
			webhookId: 'wh_1',
			secret: 'whsec_abc',
			workspaceId: 'ws_TEST',
			webhookUrl: WEBHOOK_URL,
			events: ['alert.triggered', 'site.created'],
		});
		assert.strictEqual(await methods.checkExists.call(ctx), true);
	});

	it('does not reuse a webhook made for other events', async () => {
		const saved = {
			webhookId: 'wh_1',
			secret: 's',
			webhookUrl: WEBHOOK_URL,
			events: ['site.created'],
		};
		const ctx = hook({ params: { events: ['site.deleted'] }, routes: () => ({}), saved });
		assert.strictEqual(await methods.checkExists.call(ctx), false);
	});

	it('removes an older webhook before it creates a new one', async () => {
		const saved = {
			webhookId: 'wh_old',
			secret: 's',
			workspaceId: 'ws_TEST',
			webhookUrl: 'https://old',
			events: ['site.created'],
		};
		const ctx = hook({
			params: { events: ['site.deleted'] },
			saved,
			routes: withWorkspace((options) =>
				options.method === 'DELETE' ? null : { data: { id: 'wh_new', secret: 'whsec_new' } },
			),
		});
		await methods.create.call(ctx);
		const methodsUsed = ctx.calls
			.filter((c) => !c.url.endsWith('/workspaces.json'))
			.map((c) => `${c.method} ${new URL(c.url).pathname}`);
		assert.deepStrictEqual(methodsUsed, [
			'DELETE /workspaces/ws_TEST/webhooks/wh_old.json',
			'POST /workspaces/ws_TEST/webhooks.json',
		]);
		assert.strictEqual(ctx.saved.webhookId, 'wh_new');
	});

	it('refuses to start with no event or without a secret in the response', async () => {
		const none = hook({ params: { events: [] }, routes: () => ({}) });
		await assert.rejects(() => methods.create.call(none), /Choose at least one event/);
		const noSecret = hook({
			params: { events: ['site.created'] },
			routes: withWorkspace(() => ({ data: { id: 'wh_1' } })),
		});
		await assert.rejects(() => methods.create.call(noSecret), /signing secret/);
	});

	it('deletes the webhook, and a webhook that is already gone is fine', async () => {
		const saved = {
			webhookId: 'wh_1',
			secret: 's',
			workspaceId: 'ws_TEST',
			webhookUrl: WEBHOOK_URL,
			events: ['site.created'],
		};
		const ctx = hook({ params: { events: ['site.created'] }, saved, routes: () => null });
		assert.strictEqual(await methods.delete.call(ctx), true);
		assert.strictEqual(ctx.calls[0].method, 'DELETE');
		assert.strictEqual(
			ctx.calls[0].url,
			'https://privatusanalytics.com/workspaces/ws_TEST/webhooks/wh_1.json',
		);
		assert.deepStrictEqual(saved, {});

		const gone = hook({
			params: { events: [] },
			saved: { webhookId: 'wh_1', workspaceId: 'ws_TEST' },
			routes: () => {
				throw apiFailure(404, { error: { message: 'Not found' } });
			},
		});
		assert.strictEqual(await methods.delete.call(gone), true);
		assert.deepStrictEqual(gone.saved, {});
	});

	it('keeps the webhook when the delete fails for another reason', async () => {
		const saved = { webhookId: 'wh_1', workspaceId: 'ws_TEST' };
		const ctx = hook({
			params: { events: [] },
			saved,
			routes: () => {
				throw apiFailure(500, { error: { message: 'Boom' } });
			},
		});
		await assert.rejects(() => methods.delete.call(ctx), /Boom/);
		assert.strictEqual(saved.webhookId, 'wh_1');
	});
});

describe('webhook delivery', () => {
	it('starts the workflow with the flattened payload for a signed delivery', async () => {
		const ctx = delivery({
			envelope: received,
			params: { events: ['testimonial.received'], filters: {} },
		});
		const result = await trigger.webhook.call(ctx);
		assert.deepStrictEqual(result.workflowData[0][0].json, {
			id: 'whd_1',
			event: 'testimonial.received',
			occurred_at: '2026-10-20T10:15:00Z',
			workspace_id: 'ws_1',
			site_id: 'pa_1',
			testimonial: { id: 'tm_1', rating: 5 },
			source: 'form',
		});
	});

	it('answers 401 and starts nothing without a valid signature', async () => {
		const events = { events: ['testimonial.received'], filters: {} };
		for (const [name, options] of Object.entries({
			missing: { header: '' },
			garbage: { header: 't=1,v1=zz' },
			expired: { time: Math.floor(Date.now() / 1000) - 3600 },
			'wrong secret': {
				saved: { secret: SECRET },
				header: `t=${Math.floor(Date.now() / 1000)},v1=${'a'.repeat(64)}`,
			},
			'no secret known': { saved: {} },
		})) {
			const ctx = delivery({ envelope: received, params: events, ...options });
			const result = await trigger.webhook.call(ctx);
			assert.deepStrictEqual(result, { noWebhookResponse: true }, name);
			assert.strictEqual(ctx.response.code, 401, name);
		}
	});

	it('refuses a body changed after signing', async () => {
		const time = Math.floor(Date.now() / 1000);
		const original = JSON.stringify(received);
		const header = `t=${time},v1=${crypto.createHmac('sha256', SECRET).update(`${time}.${original}`).digest('hex')}`;
		const ctx = delivery({
			envelope: received,
			raw: original.replace('"rating":5', '"rating":1'),
			header,
			params: { events: ['testimonial.received'], filters: {} },
		});
		assert.deepStrictEqual(await trigger.webhook.call(ctx), { noWebhookResponse: true });
		assert.strictEqual(ctx.response.code, 401);
	});

	it('ignores events the node did not choose and deliveries the filters exclude', async () => {
		const other = delivery({
			envelope: { ...received, event: 'site.created', data: { site_id: 'pa_1' } },
			params: { events: ['testimonial.received'], filters: {} },
		});
		assert.deepStrictEqual(await trigger.webhook.call(other), { webhookResponse: 'Ignored' });

		const site = delivery({
			envelope: received,
			params: { events: ['testimonial.received'], filters: { siteId: 'pa_2' } },
		});
		assert.deepStrictEqual(await trigger.webhook.call(site), { webhookResponse: 'Ignored' });

		const rating = delivery({
			envelope: received,
			params: { events: ['testimonial.received'], filters: { minRating: 5 } },
		});
		assert.ok((await trigger.webhook.call(rating)).workflowData);
		const low = delivery({
			envelope: { ...received, data: { ...received.data, testimonial: { id: 'tm_1', rating: 3 } } },
			params: { events: ['testimonial.received'], filters: { minRating: 4 } },
		});
		assert.deepStrictEqual(await trigger.webhook.call(low), { webhookResponse: 'Ignored' });
	});
});

describe('payload helpers', () => {
	it('moves an id inside data aside so the delivery id stays', () => {
		const item = toItem({
			id: 'whd_2',
			event: 'export.ready',
			created_at: 't',
			workspace_id: 'ws',
			data: { id: 'exp_1', site_id: 'pa_1' },
		});
		assert.strictEqual(item.id, 'whd_2');
		assert.strictEqual(item.export_id, 'exp_1');
		const other = toItem({ id: 'whd_3', event: 'import.completed', data: { id: 'imp_1' } });
		assert.strictEqual(other.record_id, 'imp_1');
	});

	it('finds the site of an uptime delivery on the check', () => {
		const item = { event: 'uptime.down', check: { site_id: 'pa_9' } };
		assert.strictEqual(matchesFilters(item, { siteId: 'pa_9' }), true);
		assert.strictEqual(matchesFilters(item, { siteId: 'pa_1' }), false);
	});

	it('applies the alert, form and request filters only to the events that carry them', () => {
		assert.strictEqual(
			matchesFilters({ event: 'alert.triggered', alert_id: 'a1' }, { alertId: 'a2' }),
			false,
		);
		assert.strictEqual(
			matchesFilters({ event: 'site.created', site_id: 'pa_1' }, { alertId: 'a2', siteId: 'pa_1' }),
			true,
		);
		assert.strictEqual(
			matchesFilters(
				{ event: 'testimonial_form.submitted', form_id: 'f1', rating: 5 },
				{ formId: 'f2' },
			),
			false,
		);
		assert.strictEqual(
			matchesFilters({ event: 'testimonial_request.sent', request_id: 'r1' }, { requestId: 'r1' }),
			true,
		);
		assert.strictEqual(matchesFilters({ event: 'unknown.event' }, {}), false);
	});

	it('knows which events belong to a site', () => {
		assert.strictEqual(EVENTS.filter((e) => e.site).length, 21);
	});
});
