#!/usr/bin/env node
// Trims the Privatus Analytics OpenAPI document to the operations this
// package calls (scripts/operations.json) and writes nodes/shared/spec.json.
// Labels, descriptions, choices and types of every field come from that file,
// so they say what the API reference says. It is a development script and is
// not part of the published package.
//
//   node scripts/sync-spec.mjs                                   # production /openapi.json
//   node scripts/sync-spec.mjs http://localhost:3008/openapi.json
//   node scripts/sync-spec.mjs ./openapi.json

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OPERATIONS = JSON.parse(fs.readFileSync(path.join(here, 'operations.json'), 'utf8'));
const source = process.argv[2] || 'https://privatusanalytics.com/openapi.json';

const load = async () => {
	if (/^https?:\/\//.test(source)) {
		const response = await fetch(source, { headers: { Accept: 'application/json' } });
		if (!response.ok) throw new Error(`${source} responded with ${response.status}`);
		return response.json();
	}
	return JSON.parse(fs.readFileSync(source, 'utf8'));
};

// The first non-null branch of an anyOf.
const plain = (schema = {}) => {
	if (Array.isArray(schema.anyOf)) {
		const branch = schema.anyOf.find((b) => b.type !== 'null') || {};
		return {
			...branch,
			description:
				schema.description || (schema.anyOf.find((b) => b.description) || {}).description,
		};
	}
	return schema;
};

const field = (name, rawSchema, required, description) => {
	const schema = plain(rawSchema);
	const items = schema.type === 'array' ? plain(schema.items || {}) : null;
	const out = { name, type: schema.type || 'string' };
	if (required) out.required = true;
	const text = description || schema.description || (rawSchema && rawSchema.description);
	if (text) out.description = text;
	if (schema.enum) out.enum = schema.enum;
	if (items) {
		out.items = items.type || 'string';
		if (items.enum) out.itemsEnum = items.enum;
	}
	if (schema.default !== undefined) out.default = schema.default;
	return out;
};

const main = async () => {
	const document = await load();
	const byId = {};
	Object.entries(document.paths).forEach(([route, methods]) => {
		Object.entries(methods).forEach(([method, operation]) => {
			if (operation && operation.operationId)
				byId[operation.operationId] = { method, route, operation };
		});
	});

	const missing = OPERATIONS.filter((id) => !byId[id]);
	if (missing.length) throw new Error(`Not in the OpenAPI document: ${missing.join(', ')}`);

	const spec = {};
	OPERATIONS.forEach((id) => {
		const { method, route, operation } = byId[id];
		const seen = new Set();
		const inputs = [];
		(operation.parameters || []).forEach((p) => {
			if (seen.has(p.name)) return;
			seen.add(p.name);
			inputs.push({ ...field(p.name, p.schema, p.required, p.description), in: p.in });
		});
		const body =
			(((operation.requestBody || {}).content || {})['application/json'] || {}).schema || {};
		const required = new Set(body.required || []);
		Object.entries(body.properties || {}).forEach(([name, s]) => {
			if (seen.has(name)) return;
			seen.add(name);
			inputs.push({ ...field(name, s, required.has(name)), in: 'body' });
		});
		spec[id] = { method: method.toUpperCase(), path: route, summary: operation.summary, inputs };
	});

	const target = path.join(here, '..', 'nodes', 'shared', 'spec.json');
	fs.writeFileSync(target, `${JSON.stringify(spec, null, 1)}\n`);
	process.stdout.write(
		`Wrote ${OPERATIONS.length} operations to ${path.relative(process.cwd(), target)}\n`,
	);
};

main().catch((error) => {
	process.stderr.write(`${error.message}\n`);
	process.exit(1);
});
