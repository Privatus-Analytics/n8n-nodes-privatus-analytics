'use strict';

const assert = require('node:assert');
const { describe, it } = require('node:test');
const {
	buildRequest,
	queryString,
	normalizeDomain,
	toDate,
	toMonth,
	toList,
	coerce,
	apiErrorMessage,
	BASE_URL,
} = require('../dist/nodes/shared/request');

describe('request building', () => {
	it('always targets the Privatus Analytics host', () => {
		assert.strictEqual(BASE_URL, 'https://privatusanalytics.com');
		const request = buildRequest('sites_get', { id: 'pa_ABC' });
		assert.strictEqual(request.url, 'https://privatusanalytics.com/sites/pa_ABC.json');
		assert.strictEqual(request.method, 'GET');
	});

	it('sends lists as Rails style status[]= arrays', () => {
		const request = buildRequest('testimonials_list', {
			site_id: 'pa_ABC',
			status: ['pending', 'approved'],
			rating: ['4', '5'],
			q: 'great product',
			per_page: 100,
			page: 2,
		});
		assert.strictEqual(
			request.url,
			'https://privatusanalytics.com/sites/pa_ABC/testimonials.json?q=great%20product&status[]=pending&status[]=approved&rating[]=4&rating[]=5&page=2&per_page=100',
		);
	});

	it('turns comma separated text into a list', () => {
		const request = buildRequest('testimonials_list', {
			site_id: 'pa_ABC',
			tag_id: 'onboarding, launch',
		});
		assert.match(request.url, /tag_id\[\]=onboarding&tag_id\[\]=launch/);
	});

	it('sends filters as JSON', () => {
		const filters = '[["country","is","US"],["page","starts_with","/blog"]]';
		const request = buildRequest('stats_aggregate', { site_id: 'pa_ABC', period: '30d', filters });
		const query = new URL(request.url).searchParams;
		assert.strictEqual(query.get('filters'), filters.replace(/\s/g, ''));
		assert.strictEqual(query.get('period'), '30d');
		assert.deepStrictEqual(JSON.parse(query.get('filters')), [
			['country', 'is', 'US'],
			['page', 'starts_with', '/blog'],
		]);
	});

	it('keeps a colon in a path parameter (prop:plan)', () => {
		const request = buildRequest('stats_breakdown', {
			site_id: 'pa_ABC',
			dimension: 'prop:plan',
			period: '7d',
		});
		assert.strictEqual(
			request.url,
			'https://privatusanalytics.com/sites/pa_ABC/breakdown/prop:plan.json?period=7d',
		);
	});

	it('escapes a path parameter', () => {
		const request = buildRequest('sites_get', { id: 'a/b?c' });
		assert.strictEqual(request.url, 'https://privatusanalytics.com/sites/a%2Fb%3Fc.json');
	});

	it('types a JSON body as documented and leaves blank values out', () => {
		const request = buildRequest('goals_create', {
			site_id: 'pa_ABC',
			name: ' Signed up ',
			kind: 'event',
			event_name: 'Signup',
			conditions: '[{"key":"plan","operator":"is","value":"pro"}]',
			scroll_threshold: '50',
			fixed_value: '49.5',
			pattern: '',
			hostname: undefined,
			not_documented: 'x',
		});
		assert.strictEqual(request.method, 'POST');
		assert.strictEqual(request.url, 'https://privatusanalytics.com/sites/pa_ABC/goals.json');
		assert.deepStrictEqual(request.body, {
			name: 'Signed up',
			kind: 'event',
			event_name: 'Signup',
			conditions: [{ key: 'plan', operator: 'is', value: 'pro' }],
			scroll_threshold: 50,
			fixed_value: 49.5,
		});
	});

	it('keeps false and zero', () => {
		const request = buildRequest('invitations_create', {
			workspace_id: 'ws_1',
			emails: 'a@example.com, b@example.com',
			all_sites: false,
		});
		assert.deepStrictEqual(request.body, {
			emails: ['a@example.com', 'b@example.com'],
			all_sites: false,
		});
		assert.deepStrictEqual(buildRequest('alerts_mute', { id: 'alr_1', minutes: 0 }).body, {
			minutes: 0,
		});
	});

	it('refuses a missing path parameter and an unknown operation', () => {
		assert.throws(() => buildRequest('sites_get', {}), /id is required/);
		assert.throws(() => buildRequest('nothing_here', {}), /Unknown operation/);
	});

	it('rejects JSON that does not parse', () => {
		assert.throws(
			() =>
				buildRequest('goals_create', {
					site_id: 'pa_1',
					name: 'x',
					kind: 'event',
					conditions: '[oops',
				}),
			/conditions must be valid JSON/,
		);
	});

	it('builds the webhook calls', () => {
		const create = buildRequest('webhooks_create', {
			workspace_id: 'ws_1',
			url: 'https://n8n.example.com/webhook/abc/webhook',
			events: ['alert.triggered', 'site.created'],
			enabled: true,
		});
		assert.strictEqual(create.method, 'POST');
		assert.strictEqual(create.url, 'https://privatusanalytics.com/workspaces/ws_1/webhooks.json');
		assert.deepStrictEqual(create.body, {
			url: 'https://n8n.example.com/webhook/abc/webhook',
			events: ['alert.triggered', 'site.created'],
			enabled: true,
		});
		const remove = buildRequest('webhooks_delete', { workspace_id: 'ws_1', id: 'wh_9' });
		assert.strictEqual(remove.method, 'DELETE');
		assert.strictEqual(
			remove.url,
			'https://privatusanalytics.com/workspaces/ws_1/webhooks/wh_9.json',
		);
	});
});

describe('value helpers', () => {
	it('normalizes domains', () => {
		assert.strictEqual(normalizeDomain('https://www.Example.com/pricing?x=1'), 'example.com');
		assert.strictEqual(normalizeDomain('example.com:8080'), 'example.com');
		assert.strictEqual(normalizeDomain('www.com'), 'www.com');
		assert.strictEqual(normalizeDomain(undefined), '');
	});

	it('reads dates and months', () => {
		assert.strictEqual(toDate('2026-10-20T10:15:00.000+02:00'), '2026-10-20');
		assert.strictEqual(toDate(''), undefined);
		assert.strictEqual(toDate('nonsense'), undefined);
		assert.strictEqual(toMonth('2026-09-15'), '2026-09');
		assert.strictEqual(toMonth('2026-09'), '2026-09');
	});

	it('reads lists', () => {
		assert.deepStrictEqual(toList('a, b,,c'), ['a', 'b', 'c']);
		assert.deepStrictEqual(toList('["a","b"]'), ['a', 'b']);
		assert.deepStrictEqual(toList(['a', 'b, c']), ['a', 'b', 'c']);
		assert.strictEqual(toList(''), undefined);
	});

	it('coerces booleans and numbers', () => {
		assert.strictEqual(coerce({ name: 'x', type: 'boolean' }, 'yes'), true);
		assert.strictEqual(coerce({ name: 'x', type: 'integer' }, '12'), 12);
		assert.strictEqual(coerce({ name: 'x', type: 'integer' }, ''), undefined);
	});

	it('builds query strings', () => {
		assert.strictEqual(
			queryString({ a: 'x y', b: ['1', '2'], c: { d: 1 } }),
			'a=x%20y&b[]=1&b[]=2&c=%7B%22d%22%3A1%7D',
		);
	});

	it('reads the API error envelope', () => {
		assert.strictEqual(
			apiErrorMessage({
				error: {
					code: 'invalid',
					message: 'Invalid input',
					details: { domain: ['is taken', 'is short'] },
				},
			}),
			'Invalid input (domain: is taken, is short)',
		);
		assert.strictEqual(apiErrorMessage('x'), undefined);
	});
});
