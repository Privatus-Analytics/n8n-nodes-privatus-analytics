import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { apiRequest, asNodeError, callOperation, listAll } from '../shared/client';
import {
	BASE_URL,
	blank,
	InputError,
	normalizeDomain,
	toDate,
	toJson,
	toList,
	toMonth,
	queryString,
	type Values,
} from '../shared/request';
import { OPERATIONS, type FieldDef, type OperationDef } from './operations';
import { camel } from './properties';

const lower = (value: unknown): string =>
	String(value ?? '')
		.trim()
		.toLowerCase();

/** Operations that fetch every page first, because they filter on a field the API cannot filter on. */
const FILTERED = new Set(['goalFind', 'alertFind', 'experimentFind']);

const METHODS = ['GET', 'PATCH', 'POST', 'PUT'];

/** Turns the date a user picked into what the API reads. */
function formatValue(field: FieldDef, value: unknown): unknown {
	if (!field.format || blank(value)) return value;
	if (field.format === 'day') return toDate(value);
	if (field.format === 'month') return toMonth(value);
	return String(value);
}

/** The API values of one item: the fields of the operation by their API names. */
export function readValues(ctx: IExecuteFunctions, i: number, def: OperationDef): Values {
	const values: Values = {};
	const collection = def.collection?.name ?? 'additionalFields';
	let bag: IDataObject | undefined;
	for (const field of def.fields) {
		let raw: unknown;
		if (field.extra) {
			bag = bag ?? (ctx.getNodeParameter(collection, i, {}) as IDataObject);
			raw = bag[camel(field.name)];
		} else {
			raw = ctx.getNodeParameter(camel(field.name), i, '');
		}
		values[field.name] = formatValue(field, raw);
	}
	return { ...values, ...(def.fixed ?? {}) };
}

/** Changes to the values an operation needs before the call. */
export function prepare(def: OperationDef, values: Values): Values {
	switch (def.special) {
		case 'siteCreate':
			return { ...values, domain: normalizeDomain(values.domain) };
		case 'noteDates':
			return { ...values, date: toDate(values.date) ?? new Date().toISOString().slice(0, 10) };
		case 'statsBreakdown': {
			const dimension =
				values.dimension === 'prop'
					? `prop:${String(values.property_key ?? '').trim()}`
					: values.dimension;
			const limit = Math.min(Math.max(parseInt(String(values.limit ?? 10), 10) || 10, 1), 100);
			return { ...values, dimension, limit };
		}
		case 'siteFind':
			return { query: normalizeDomain(values.domain) };
		case 'goalFind':
			return { ...values, name: undefined };
		case 'alertFind':
		case 'experimentFind':
			return { ...values, name: undefined };
		case 'testimonialFind': {
			const minimum = parseInt(String(values.min_rating ?? ''), 10);
			const rating = minimum
				? ['1', '2', '3', '4', '5'].filter((r) => Number(r) >= minimum)
				: toList(values.rating);
			return {
				...values,
				rating,
				min_rating: undefined,
				sort: values.sort || (values.q ? 'relevance' : 'received_desc'),
			};
		}
		case 'recipient': {
			const recipient: IDataObject = {};
			for (const key of ['email', 'name', 'company', 'title']) {
				if (!blank(values[key])) recipient[key] = String(values[key]).trim();
			}
			if (!blank(values.properties)) {
				const properties = toJson(values.properties, 'Properties');
				if (properties && Object.keys(properties as object).length)
					recipient.properties = properties as IDataObject;
			}
			return { site_id: values.site_id, request_id: values.request_id, recipients: [recipient] };
		}
		default:
			return values;
	}
}

/** The items one response becomes. */
function toItems(def: OperationDef, data: unknown): IDataObject[] {
	if (def.special === 'statsBreakdown' && data && typeof data === 'object') {
		const rows = ((data as IDataObject).rows as IDataObject[]) ?? [];
		return rows.map((row, index) => ({ rank: index + 1, ...row }));
	}
	if (def.special === 'statsSeries' && data && typeof data === 'object') {
		return ((data as IDataObject).series as IDataObject[]) ?? [];
	}
	if (Array.isArray(data)) return data as IDataObject[];
	if (data === null || data === undefined) return [{ success: true }];
	if (typeof data === 'object') return [data as IDataObject];
	return [{ data } as IDataObject];
}

/** Rows a client side filter keeps. */
function keep(def: OperationDef, row: IDataObject, original: Values): boolean {
	switch (def.special) {
		case 'siteFind': {
			const domain = normalizeDomain(original.domain);
			const extra = ((row.extra_domains as string[]) ?? []).map(normalizeDomain);
			return normalizeDomain(row.domain) === domain || extra.includes(domain);
		}
		case 'goalFind':
			return blank(original.name) || lower(row.name) === lower(original.name);
		case 'alertFind':
		case 'experimentFind':
			return blank(original.name) || lower(row.name).includes(lower(original.name));
		default:
			return true;
	}
}

/** The custom API call: only paths on the Privatus Analytics host are accepted, so the token never leaves it. */
export function apiPath(raw: unknown): string {
	let path = String(raw ?? '').trim();
	if (/^https?:\/\//i.test(path)) path = path.replace(/^https?:\/\/[^/]+/i, '');
	if (
		!path.startsWith('/') ||
		path.startsWith('//') ||
		/[\s\\]/.test(path) ||
		path.split('/').includes('..')
	) {
		throw new InputError('URL Path must be a path like /sites/pa_7Q2K9XH3AB/goals.json');
	}
	const [base, query] = path.split('?');
	const withJson = base.endsWith('.json') ? base : `${base.replace(/\/$/, '')}.json`;
	return query ? `${withJson}?${query}` : withJson;
}

async function customCall(ctx: IExecuteFunctions, values: Values): Promise<IDataObject[]> {
	const method = String(values.method ?? 'GET').toUpperCase();
	if (!METHODS.includes(method))
		throw new InputError(`HTTP Method must be one of ${METHODS.join(', ')}`);
	const path = apiPath(values.path);
	const query = toJson(values.query, 'Query Parameters') as Record<string, unknown> | undefined;
	const body = toJson(values.body, 'Body') as IDataObject | undefined;
	const [base, existing] = path.split('?');
	const extra = query && typeof query === 'object' ? queryString(query) : '';
	const search = [existing, extra].filter(Boolean).join('&');
	const response = await apiRequest(ctx, {
		method: method as 'GET' | 'PATCH' | 'POST' | 'PUT',
		url: `${BASE_URL}${base}${search ? `?${search}` : ''}`,
		body: method === 'GET' ? undefined : body,
		json: true,
	});
	// The body as the API sent it, { data, meta } for a list, so a workflow reads it the way the API reference shows.
	if (response && typeof response === 'object' && !Array.isArray(response))
		return [response as IDataObject];
	return [{ data: response } as IDataObject];
}

/** Runs one operation for one input item and returns the items it produces. */
export async function runOperation(
	ctx: IExecuteFunctions,
	i: number,
	def: OperationDef,
): Promise<IDataObject[]> {
	const original = readValues(ctx, i, def);
	if (def.special === 'apiRequest') return customCall(ctx, original);
	const values = prepare(def, original);

	if (def.list) {
		const returnAll = ctx.getNodeParameter('returnAll', i, false) as boolean;
		const limit = returnAll ? Infinity : (ctx.getNodeParameter('limit', i, 50) as number);
		const filtered = FILTERED.has(def.special ?? '');
		const rows = await listAll(ctx, def.call, values, returnAll || filtered ? Infinity : limit);
		return rows.filter((row) => keep(def, row, original)).slice(0, limit);
	}
	if (def.special === 'siteFind') {
		const rows = await listAll(ctx, def.call, values);
		return rows.filter((row) => keep(def, row, original));
	}

	const { data } = await callOperation(ctx, def.call, values);
	if (def.special === 'firstOnly')
		return Array.isArray(data) ? (data as IDataObject[]).slice(0, 1) : [];
	return toItems(def, data);
}

/** The node's execute method. */
export async function execute(ctx: IExecuteFunctions): Promise<INodeExecutionData[][]> {
	const items = ctx.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i += 1) {
		try {
			const resource = ctx.getNodeParameter('resource', i) as string;
			const operation = ctx.getNodeParameter('operation', i) as string;
			const def = OPERATIONS.find(
				(candidate) => candidate.resource === resource && candidate.value === operation,
			);
			if (!def) {
				throw new NodeOperationError(ctx.getNode(), `Unknown operation ${resource}.${operation}`, {
					itemIndex: i,
				});
			}
			const rows = await runOperation(ctx, i, def);
			for (const row of rows) returnData.push({ json: row, pairedItem: { item: i } });
		} catch (error) {
			if (ctx.continueOnFail()) {
				returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
				continue;
			}
			throw asNodeError(ctx, error, i);
		}
	}
	return [returnData];
}
