'use strict';

const assert = require('node:assert');
const { describe, it } = require('node:test');
const { PrivatusAnalytics } = require('../dist/nodes/PrivatusAnalytics/PrivatusAnalytics.node');
const { apiPath } = require('../dist/nodes/PrivatusAnalytics/execute');
const { loadOptions } = require('../dist/nodes/shared/loaders');
const { fakeExecute, withWorkspace, apiFailure } = require('./helpers');

const node = new PrivatusAnalytics();
const run = async (ctx) => (await node.execute.call(ctx))[0].map((item) => item.json);
const last = (ctx) => ctx.calls[ctx.calls.length - 1];

describe('operations', () => {
	it('creates a site in the workspace of the token, with a clean domain', async () => {
		const ctx = fakeExecute({
			params: {
				resource: 'site',
				operation: 'create',
				domain: 'https://www.Example.com/pricing',
				additionalFields: { timezone: 'Europe/Paris' },
			},
			routes: withWorkspace(() => ({ data: { id: 'pa_NEW', domain: 'example.com' } })),
		});
		const result = await run(ctx);
		assert.deepStrictEqual(result, [{ id: 'pa_NEW', domain: 'example.com' }]);
		assert.strictEqual(ctx.calls[0].url, 'https://privatusanalytics.com/workspaces.json');
		assert.strictEqual(last(ctx).method, 'POST');
		assert.strictEqual(
			last(ctx).url,
			'https://privatusanalytics.com/workspaces/ws_TEST/sites.json',
		);
		assert.deepStrictEqual(last(ctx).body, { domain: 'example.com', timezone: 'Europe/Paris' });
		assert.ok(ctx.calls.every((c) => c.credential === 'privatusAnalyticsApi'));
	});

	it('finds a site by domain, including extra domains', async () => {
		const ctx = fakeExecute({
			params: { resource: 'site', operation: 'findByDomain', domain: 'WWW.Shop.example.com' },
			routes: withWorkspace(() => ({
				data: [
					{ id: 'pa_1', domain: 'other.com', extra_domains: [] },
					{ id: 'pa_2', domain: 'example.com', extra_domains: ['shop.example.com'] },
				],
				meta: { total_pages: 1 },
			})),
		});
		const result = await run(ctx);
		assert.deepStrictEqual(
			result.map((r) => r.id),
			['pa_2'],
		);
		assert.match(
			last(ctx).url,
			/\/workspaces\/ws_TEST\/sites\.json\?query=shop\.example\.com&page=1&per_page=100$/,
		);
	});

	it('gets top values, one item per row, with a custom property as the report', async () => {
		const ctx = fakeExecute({
			params: {
				resource: 'stats',
				operation: 'getTopValues',
				siteId: 'pa_ABC',
				dimension: 'prop',
				propertyKey: 'plan',
				period: 'custom',
				from: '2026-10-01T00:00:00.000Z',
				to: '2026-10-07T00:00:00.000Z',
				additionalFields: { limit: 5, filters: '[["country","is","US"]]' },
			},
			routes: () => ({
				data: {
					rows: [
						{ value: 'pro', visitors: 10 },
						{ value: 'free', visitors: 4 },
					],
				},
			}),
		});
		const result = await run(ctx);
		assert.deepStrictEqual(result, [
			{ rank: 1, value: 'pro', visitors: 10 },
			{ rank: 2, value: 'free', visitors: 4 },
		]);
		const url = new URL(last(ctx).url);
		assert.strictEqual(url.pathname, '/sites/pa_ABC/breakdown/prop:plan.json');
		assert.strictEqual(url.searchParams.get('period'), 'custom');
		assert.strictEqual(url.searchParams.get('from'), '2026-10-01');
		assert.strictEqual(url.searchParams.get('to'), '2026-10-07');
		assert.strictEqual(url.searchParams.get('limit'), '5');
		assert.strictEqual(url.searchParams.get('filters'), '[["country","is","US"]]');
	});

	it('returns every point of a time series as an item', async () => {
		const ctx = fakeExecute({
			params: {
				resource: 'stats',
				operation: 'getTimeSeries',
				siteId: 'pa_ABC',
				period: '7d',
				additionalFields: {},
			},
			routes: () => ({
				data: {
					series: [
						{ date: '2026-10-18', visitors: 1 },
						{ date: '2026-10-19', visitors: 2 },
					],
				},
			}),
		});
		assert.strictEqual((await run(ctx)).length, 2);
	});

	it('pages through a list for Return All, and stops at the limit otherwise', async () => {
		const page = (n, total) => ({
			data: Array.from({ length: 3 }, (_, i) => ({ id: `tm_${n}_${i}` })),
			meta: { total_pages: total },
		});
		const routes = (options) =>
			/page=1&/.test(options.url)
				? page(1, 3)
				: /page=2&/.test(options.url)
					? page(2, 3)
					: page(3, 3);
		const all = fakeExecute({
			params: {
				resource: 'testimonial',
				operation: 'getMany',
				siteId: 'pa_ABC',
				returnAll: true,
				filters: { status: ['approved', 'pending'] },
			},
			routes,
		});
		assert.strictEqual((await run(all)).length, 9);
		assert.strictEqual(all.calls.length, 3);
		assert.match(all.calls[0].url, /status\[\]=approved&status\[\]=pending/);

		const limited = fakeExecute({
			params: {
				resource: 'testimonial',
				operation: 'getMany',
				siteId: 'pa_ABC',
				returnAll: false,
				limit: 4,
				filters: {},
			},
			routes,
		});
		assert.strictEqual((await run(limited)).length, 4);
		assert.strictEqual(limited.calls.length, 2);
	});

	it('turns Minimum Rating into a rating list and sorts by relevance for a search', async () => {
		const ctx = fakeExecute({
			params: {
				resource: 'testimonial',
				operation: 'getMany',
				siteId: 'pa_ABC',
				returnAll: false,
				limit: 5,
				filters: { minRating: '4', q: 'fast' },
			},
			routes: () => ({ data: [], meta: { total_pages: 1 } }),
		});
		await run(ctx);
		assert.match(last(ctx).url, /rating\[\]=4&rating\[\]=5/);
		assert.match(last(ctx).url, /sort=relevance/);
	});

	it('filters goals by name and alerts by part of the name on the client', async () => {
		const goals = fakeExecute({
			params: {
				resource: 'goal',
				operation: 'getMany',
				siteId: 'pa_ABC',
				returnAll: false,
				limit: 50,
				additionalFields: { name: 'signed up' },
			},
			routes: () => ({
				data: [
					{ id: 'g1', name: 'Signed up' },
					{ id: 'g2', name: 'Signed up twice' },
				],
				meta: { total_pages: 1 },
			}),
		});
		assert.deepStrictEqual(
			(await run(goals)).map((g) => g.id),
			['g1'],
		);

		const alerts = fakeExecute({
			params: {
				resource: 'alert',
				operation: 'getMany',
				returnAll: true,
				filters: { name: 'DROP', state: 'triggered' },
			},
			routes: withWorkspace(() => ({
				data: [
					{ id: 'a1', name: 'Traffic drop' },
					{ id: 'a2', name: 'Spike' },
				],
				meta: { total_pages: 1 },
			})),
		});
		assert.deepStrictEqual(
			(await run(alerts)).map((a) => a.id),
			['a1'],
		);
		assert.match(last(alerts).url, /state=triggered/);
	});

	it('fills in today for a chart note and sends the fields documented', async () => {
		const ctx = fakeExecute({
			params: {
				resource: 'note',
				operation: 'create',
				siteId: 'pa_ABC',
				title: 'Deploy',
				additionalFields: { body: 'v2' },
			},
			routes: () => ({ data: { id: 'note_1' } }),
		});
		await run(ctx);
		assert.strictEqual(last(ctx).body.title, 'Deploy');
		assert.match(last(ctx).body.date, /^\d{4}-\d{2}-\d{2}$/);
	});

	it('adds a campaign cost for a month', async () => {
		const ctx = fakeExecute({
			params: {
				resource: 'campaign',
				operation: 'addCost',
				siteId: 'pa_ABC',
				campaign: 'spring',
				month: '2026-09-15T00:00:00.000Z',
				amount: 1250.5,
				additionalFields: {},
			},
			routes: () => ({ data: { id: 'cost_1' } }),
		});
		await run(ctx);
		assert.deepStrictEqual(last(ctx).body, {
			campaign: 'spring',
			month: '2026-09',
			amount: 1250.5,
		});
	});

	it('runs the experiment, uptime and testimonial actions on the right endpoints', async () => {
		const cases = [
			[
				{ resource: 'experiment', operation: 'end', siteId: 'pa_ABC', id: 'exp_1' },
				'POST',
				'/sites/pa_ABC/experiments/exp_1/end.json',
				{},
			],
			[
				{ resource: 'uptimeCheck', operation: 'pause', siteId: 'pa_ABC', id: 'upc_1' },
				'POST',
				'/uptime/checks/upc_1/pause.json',
				{},
			],
			[
				{ resource: 'uptimeCheck', operation: 'resume', siteId: 'pa_ABC', id: 'upc_1' },
				'POST',
				'/uptime/checks/upc_1/resume.json',
				{},
			],
			[
				{ resource: 'testimonial', operation: 'approve', siteId: 'pa_ABC', id: 'tm_1' },
				'POST',
				'/sites/pa_ABC/testimonials/tm_1/approve.json',
				{},
			],
			[
				{ resource: 'testimonial', operation: 'pin', siteId: 'pa_ABC', id: 'tm_1' },
				'POST',
				'/sites/pa_ABC/testimonials/tm_1/pin.json',
				{ pinned: true },
			],
			[
				{ resource: 'testimonial', operation: 'unpin', siteId: 'pa_ABC', id: 'tm_1' },
				'POST',
				'/sites/pa_ABC/testimonials/tm_1/pin.json',
				{ pinned: false },
			],
			[
				{ resource: 'alert', operation: 'acknowledge', id: 'alr_1' },
				'POST',
				'/alerts/alr_1/acknowledge.json',
				{},
			],
			[
				{ resource: 'alert', operation: 'mute', id: 'alr_1', minutes: 30 },
				'POST',
				'/alerts/alr_1/mute.json',
				{ minutes: 30 },
			],
			[
				{ resource: 'siteAudit', operation: 'run', siteId: 'pa_ABC' },
				'POST',
				'/sites/pa_ABC/audit.json',
				{},
			],
		];
		for (const [params, method, path, body] of cases) {
			const ctx = fakeExecute({
				params: { additionalFields: {}, ...params },
				routes: () => ({ data: { ok: true } }),
			});
			await run(ctx);
			assert.strictEqual(last(ctx).method, method, params.operation);
			assert.strictEqual(new URL(last(ctx).url).pathname, path);
			assert.deepStrictEqual(last(ctx).body, body, params.operation);
		}
	});

	it('creates a testimonial as text and asks a person through a request', async () => {
		const create = fakeExecute({
			params: {
				resource: 'testimonial',
				operation: 'create',
				siteId: 'pa_ABC',
				body: 'Great',
				person_name: 'Ann',
				personName: 'Ann',
				additionalFields: { rating: '5', tags: 'launch, vip', properties: '{"plan":"pro"}' },
			},
			routes: () => ({ data: { id: 'tm_1' } }),
		});
		await run(create);
		assert.deepStrictEqual(last(create).body, {
			kind: 'text',
			body: 'Great',
			person_name: 'Ann',
			rating: 5,
			tags: ['launch', 'vip'],
			properties: { plan: 'pro' },
		});

		const ask = fakeExecute({
			params: {
				resource: 'testimonialRequest',
				operation: 'addRecipient',
				siteId: 'pa_ABC',
				requestId: 'req_1',
				email: 'a@example.com',
				additionalFields: { name: 'Ann' },
			},
			routes: () => ({ data: { added: 1, skipped: 0 } }),
		});
		await run(ask);
		assert.strictEqual(
			new URL(last(ask).url).pathname,
			'/sites/pa_ABC/testimonials/requests/req_1/recipients.json',
		);
		assert.deepStrictEqual(last(ask).body, {
			recipients: [{ email: 'a@example.com', name: 'Ann' }],
		});
	});

	it('takes the first finished audit', async () => {
		const ctx = fakeExecute({
			params: { resource: 'siteAudit', operation: 'getLatest', siteId: 'pa_ABC' },
			routes: () => ({ data: [{ id: 'aud_1', score: 91 }, { id: 'aud_0' }] }),
		});
		assert.deepStrictEqual(await run(ctx), [{ id: 'aud_1', score: 91 }]);
		assert.match(last(ctx).url, /status=complete&per_page=1/);
	});

	it('returns success for an empty response', async () => {
		const ctx = fakeExecute({
			params: { resource: 'alert', operation: 'acknowledge', id: 'alr_1' },
			routes: () => null,
		});
		assert.deepStrictEqual(await run(ctx), [{ success: true }]);
	});
});

describe('custom API call', () => {
	it('keeps the token on the API host', () => {
		assert.strictEqual(apiPath('/sites/pa_1/goals'), '/sites/pa_1/goals.json');
		assert.strictEqual(
			apiPath('https://evil.example.net/sites/pa_1/goals.json?x=1'),
			'/sites/pa_1/goals.json?x=1',
		);
		for (const bad of ['', 'sites', '//evil.example.net/x', '/a/../b', '/a b', '/a\\b']) {
			assert.throws(() => apiPath(bad), /URL Path/, bad);
		}
	});

	it('sends the request to the Privatus Analytics host only', async () => {
		const ctx = fakeExecute({
			params: {
				resource: 'apiRequest',
				operation: 'send',
				method: 'POST',
				path: 'https://evil.example.net/sites/pa_1/goals',
				additionalFields: { query: '{"a":["1","2"]}', body: '{"name":"X"}' },
			},
			routes: () => ({ data: { id: 'goal_1' } }),
		});
		const result = await run(ctx);
		assert.deepStrictEqual(result, [{ data: { id: 'goal_1' } }]);
		assert.strictEqual(
			last(ctx).url,
			'https://privatusanalytics.com/sites/pa_1/goals.json?a[]=1&a[]=2',
		);
		assert.deepStrictEqual(last(ctx).body, { name: 'X' });
	});

	it('does not offer DELETE', async () => {
		const ctx = fakeExecute({
			params: {
				resource: 'apiRequest',
				operation: 'send',
				method: 'DELETE',
				path: '/sites/pa_1',
				additionalFields: {},
			},
			routes: () => ({}),
		});
		await assert.rejects(() => run(ctx), /HTTP Method must be one of GET, PATCH, POST, PUT/);
		assert.strictEqual(ctx.calls.length, 0);
	});
});

describe('errors', () => {
	it('shows the API message and details of a 422', async () => {
		const ctx = fakeExecute({
			params: {
				resource: 'goal',
				operation: 'create',
				siteId: 'pa_ABC',
				name: 'X',
				kind: 'page',
				additionalFields: {},
			},
			routes: () => {
				throw apiFailure(422, {
					error: {
						code: 'invalid',
						message: 'Invalid goal',
						details: { pattern: ['is required'] },
					},
				});
			},
		});
		await assert.rejects(
			() => run(ctx),
			(error) => {
				assert.strictEqual(error.name, 'NodeApiError');
				assert.match(error.message, /Invalid goal \(pattern: is required\)/);
				return true;
			},
		);
	});

	it('explains a refused token and a plan limit', async () => {
		const refused = fakeExecute({
			params: { resource: 'site', operation: 'get', id: 'pa_1' },
			routes: () => {
				throw apiFailure(401, { error: { message: 'Invalid token' } });
			},
		});
		await assert.rejects(() => run(refused), /The API token was refused: Invalid token/);
		const plan = fakeExecute({
			params: { resource: 'site', operation: 'get', id: 'pa_1' },
			routes: () => {
				throw apiFailure(402, { error: { message: 'Uptime checks are not in your plan' } });
			},
		});
		await assert.rejects(() => run(plan), /needs a higher Privatus Analytics plan/);
	});

	it('reports a problem with the input as an operation error and continues on fail', async () => {
		const bad = fakeExecute({
			params: { resource: 'site', operation: 'get', id: '' },
			routes: () => ({}),
		});
		await assert.rejects(
			() => run(bad),
			(error) => error.name === 'NodeOperationError' && /id is required/.test(error.message),
		);
		const forgiving = fakeExecute({
			params: { resource: 'site', operation: 'get', id: '' },
			routes: () => ({}),
			continueOnFail: true,
		});
		const result = await run(forgiving);
		assert.match(result[0].error, /id is required/);
	});
});

describe('errors from n8n itself', () => {
	it('uses the API message when n8n has already wrapped the failure', async () => {
		const { NodeApiError } = require('n8n-workflow');
		const { NODE } = require('./helpers');
		const ctx = fakeExecute({
			params: { resource: 'site', operation: 'get', id: 'pa_X' },
			routes: () => {
				throw new NodeApiError(
					NODE,
					apiFailure(404, { error: { code: 'not_found', message: "We couldn't find that." } }),
					{ httpCode: '404' },
				);
			},
		});
		await assert.rejects(
			() => run(ctx),
			(error) =>
				error.name === 'NodeApiError' &&
				error.message === "We couldn't find that." &&
				error.httpCode === '404',
		);
	});
});

describe('dropdowns', () => {
	it('lists sites with their names', async () => {
		const ctx = fakeExecute({
			params: {},
			routes: withWorkspace(() => ({
				data: [
					{ id: 'pa_1', name: 'Shop', domain: 'shop.com' },
					{ id: 'pa_2', name: 'a.com', domain: 'a.com' },
				],
				meta: { total_pages: 1 },
			})),
		});
		const options = await loadOptions.getSites.call(ctx);
		assert.deepStrictEqual(options, [
			{ name: 'Shop (shop.com)', value: 'pa_1' },
			{ name: 'a.com', value: 'pa_2' },
		]);
	});

	it('lists nothing for a site dropdown until a site is chosen', async () => {
		const ctx = fakeExecute({ params: {}, routes: () => ({ data: [] }) });
		assert.deepStrictEqual(await loadOptions.getExperiments.call(ctx), []);
		assert.strictEqual(ctx.calls.length, 0);
		const expression = fakeExecute({
			params: { siteId: '={{ $json.site }}' },
			routes: () => ({ data: [] }),
		});
		assert.deepStrictEqual(await loadOptions.getExperiments.call(expression), []);
	});

	it('lists the experiments of the chosen site', async () => {
		const ctx = fakeExecute({
			params: { siteId: 'pa_ABC' },
			routes: () => ({
				data: [{ id: 'exp_1', name: 'Headline', status: 'running' }],
				meta: { total_pages: 1 },
			}),
		});
		assert.deepStrictEqual(await loadOptions.getExperiments.call(ctx), [
			{ name: 'Headline (running)', value: 'exp_1' },
		]);
	});
});
