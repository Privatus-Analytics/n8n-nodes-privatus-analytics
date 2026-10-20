'use strict';

const assert = require('node:assert');
const { describe, it } = require('node:test');
const { PrivatusAnalytics } = require('../dist/nodes/PrivatusAnalytics/PrivatusAnalytics.node');
const {
	PrivatusAnalyticsTrigger,
} = require('../dist/nodes/PrivatusAnalyticsTrigger/PrivatusAnalyticsTrigger.node');
const { PrivatusAnalyticsApi } = require('../dist/credentials/PrivatusAnalyticsApi.credentials');
const { OPERATIONS, RESOURCES } = require('../dist/nodes/PrivatusAnalytics/operations');
const { EVENTS } = require('../dist/nodes/shared/events');
const { SPEC } = require('../dist/nodes/shared/request');
const pkg = require('../package.json');

const node = new PrivatusAnalytics();
const trigger = new PrivatusAnalyticsTrigger();

/** Every string the user can read in a node description. */
function strings(value, out = []) {
	if (typeof value === 'string') out.push(value);
	else if (Array.isArray(value)) value.forEach((entry) => strings(entry, out));
	else if (value && typeof value === 'object') {
		for (const [key, entry] of Object.entries(value)) {
			if (
				['displayName', 'description', 'name', 'action', 'subtitle', 'placeholder'].includes(key) ||
				typeof entry === 'object'
			) {
				strings(entry, out);
			}
		}
	}
	return out;
}

describe('package', () => {
	it('follows the community node rules', () => {
		assert.match(pkg.name, /^n8n-nodes-/);
		assert.ok(pkg.keywords.includes('n8n-community-node-package'));
		assert.strictEqual(pkg.license, 'MIT');
		assert.strictEqual(pkg.dependencies, undefined, 'no runtime dependencies');
		assert.strictEqual(pkg.n8n.strict, true);
		assert.deepStrictEqual(pkg.n8n.nodes.length, 2);
		assert.deepStrictEqual(pkg.n8n.credentials.length, 1);
	});
});

describe('node description', () => {
	it('names the product Privatus Analytics', () => {
		assert.strictEqual(node.description.displayName, 'Privatus Analytics');
		assert.strictEqual(trigger.description.displayName, 'Privatus Analytics Trigger');
		assert.strictEqual(new PrivatusAnalyticsApi().displayName, 'Privatus Analytics API');
	});

	it('uses one credential with an API token and a test request', () => {
		const credential = new PrivatusAnalyticsApi();
		assert.strictEqual(credential.name, 'privatusAnalyticsApi');
		assert.deepStrictEqual(
			credential.properties.map((p) => [p.name, p.typeOptions && p.typeOptions.password]),
			[['apiToken', true]],
		);
		assert.strictEqual(
			credential.authenticate.properties.headers.Authorization,
			'=Bearer {{$credentials.apiToken}}',
		);
		assert.strictEqual(credential.test.request.baseURL, 'https://privatusanalytics.com');
		assert.strictEqual(credential.test.request.url, '/workspaces.json');
		assert.strictEqual(node.description.credentials[0].name, credential.name);
		assert.strictEqual(trigger.description.credentials[0].name, credential.name);
	});

	it('has the 16 resources, each with operations', () => {
		assert.strictEqual(RESOURCES.length, 16);
		for (const resource of RESOURCES) {
			assert.ok(
				OPERATIONS.some((def) => def.resource === resource.value),
				resource.value,
			);
		}
		const operationLists = node.description.properties.filter((p) => p.name === 'operation');
		assert.strictEqual(operationLists.length, RESOURCES.length);
		for (const list of operationLists) {
			for (const option of list.options) assert.ok(option.action, `${option.name} needs an action`);
		}
	});

	it('backs every operation with a documented API operation and covers its required inputs', () => {
		for (const def of OPERATIONS) {
			if (def.special === 'apiRequest') continue;
			const operation = SPEC[def.call];
			assert.ok(operation, `${def.resource}.${def.value} calls ${def.call}`);
			const known = new Set(operation.inputs.map((input) => input.name));
			const handled = new Set([
				...def.fields.map((f) => f.name),
				...Object.keys(def.fixed || {}),
				'workspace_id',
				'page',
				'per_page',
			]);
			// A field either maps to an input or is added by the node and used by its special handling.
			for (const field of def.fields) {
				assert.ok(
					known.has(field.name) || def.special || field.name === 'site_id',
					`${def.value}: ${field.name} is not an input of ${def.call}`,
				);
			}
			for (const input of operation.inputs.filter((i) => i.required)) {
				const special = def.special && ['recipient', 'siteFind'].includes(def.special);
				assert.ok(
					handled.has(input.name) || special,
					`${def.resource}.${def.value} misses required ${input.name}`,
				);
			}
		}
	});

	it('leaves out everything that deletes data', () => {
		for (const def of OPERATIONS) {
			if (def.special === 'apiRequest') continue;
			assert.notStrictEqual(SPEC[def.call].method, 'DELETE', `${def.resource}.${def.value}`);
			assert.doesNotMatch(def.value + def.name, /delete|remove|trash|reset/i);
		}
		const custom = node.description.properties.find((p) => p.name === 'method');
		assert.deepStrictEqual(
			custom.options.map((o) => o.value),
			['GET', 'PATCH', 'POST', 'PUT'],
		);
	});

	it('has no ingest operation', () => {
		assert.ok(!OPERATIONS.some((def) => /ingest|collect|track_event/i.test(def.call)));
	});

	it('is dependency free at the call level: every field has a unique name per operation', () => {
		for (const def of OPERATIONS) {
			const names = def.fields.map((f) => f.name);
			assert.strictEqual(new Set(names).size, names.length, `${def.resource}.${def.value}`);
		}
	});

	it('follows the copy rules in every label and description', () => {
		const all = [
			...strings(node.description),
			...strings(trigger.description),
			...strings(new PrivatusAnalyticsApi().properties),
		];
		assert.ok(all.length > 500);
		for (const text of all) {
			assert.doesNotMatch(text, /—|–/, `em or en dash in: ${text}`);
			assert.doesNotMatch(text, /;/, `semicolon in: ${text}`);
			assert.doesNotMatch(text, /\banswer/i, `answer in: ${text}`);
			assert.doesNotMatch(text, /Privatus(?! Analytics)/, `Privatus alone in: ${text}`);
			assert.doesNotMatch(
				text,
				/[a-z]+_(list|get|create|update)\b(?!\.)/,
				`API tool name in: ${text}`,
			);
		}
	});
});

describe('trigger description', () => {
	it('offers the 25 events once each', () => {
		assert.strictEqual(EVENTS.length, 25);
		assert.strictEqual(new Set(EVENTS.map((e) => e.value)).size, 25);
		const events = trigger.description.properties.find((p) => p.name === 'events');
		assert.deepStrictEqual(
			events.options.map((o) => o.value).sort(),
			EVENTS.map((e) => e.value).sort(),
		);
		const names = events.options.map((o) => o.name);
		assert.deepStrictEqual(
			names,
			[...names].sort((a, b) => a.localeCompare(b)),
		);
	});

	it('has a site filter and one signed webhook', () => {
		const filters = trigger.description.properties.find((p) => p.name === 'filters');
		assert.ok(filters.options.some((o) => o.name === 'siteId'));
		assert.strictEqual(trigger.description.webhooks.length, 1);
		assert.strictEqual(trigger.description.webhooks[0].httpMethod, 'POST');
	});
});
