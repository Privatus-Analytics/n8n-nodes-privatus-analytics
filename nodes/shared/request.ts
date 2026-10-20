import type { IDataObject, IHttpRequestMethods, IHttpRequestOptions } from 'n8n-workflow';

import spec from './spec.json';

/** The Privatus Analytics API host. Credentials never choose a host. */
export const BASE_URL = 'https://privatusanalytics.com';

export interface SpecInput {
	name: string;
	type: string;
	required?: boolean;
	description?: string;
	enum?: string[];
	items?: string;
	itemsEnum?: string[];
	default?: unknown;
	in?: string;
}

export interface SpecOperation {
	method: string;
	path: string;
	summary?: string;
	inputs: SpecInput[];
}

export const SPEC = spec as unknown as Record<string, SpecOperation>;

export type Values = Record<string, unknown>;

const enc = encodeURIComponent;

/** A problem with what the user entered. The nodes turn it into a NodeOperationError. */
export class InputError extends Error {}

export const blank = (value: unknown): boolean =>
	value === undefined ||
	value === null ||
	value === '' ||
	(Array.isArray(value) && value.length === 0);

/** "https://www.Example.com/x" becomes "example.com". */
export function normalizeDomain(input: unknown): string {
	let s = String(input ?? '')
		.trim()
		.toLowerCase();
	s = s
		.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
		.split(/[/?#]/)[0]
		.replace(/:\d+$/, '')
		.replace(/\.+$/, '');
	if (s.startsWith('www.') && s.split('.').length > 2) s = s.slice(4);
	return s;
}

/** Accepts a date or a date and time and returns YYYY-MM-DD. */
export function toDate(value: unknown): string | undefined {
	if (blank(value)) return undefined;
	const s = String(value).trim();
	const match = /^(\d{4}-\d{2}-\d{2})/.exec(s);
	if (match) return match[1];
	const date = new Date(s);
	if (Number.isNaN(date.getTime())) return undefined;
	return date.toISOString().slice(0, 10);
}

/** Accepts a date or a date and time and returns YYYY-MM. */
export function toMonth(value: unknown): string | undefined {
	const s = String(value ?? '').trim();
	if (/^\d{4}-\d{2}$/.test(s)) return s;
	const day = toDate(s);
	return day ? day.slice(0, 7) : undefined;
}

/** A list from a list value, a comma separated string or JSON text for an array. */
export function toList(value: unknown): unknown[] | undefined {
	if (blank(value)) return undefined;
	if (Array.isArray(value)) return value.flatMap((entry) => toList(entry) ?? []);
	const s = String(value).trim();
	if (s.startsWith('[')) {
		try {
			const parsed = JSON.parse(s);
			if (Array.isArray(parsed)) return parsed;
		} catch {
			// Not JSON, so it is text.
		}
	}
	return s
		.split(',')
		.map((part) => part.trim())
		.filter(Boolean);
}

export function toBoolean(value: unknown): boolean | undefined {
	if (blank(value)) return undefined;
	if (typeof value === 'boolean') return value;
	const s = String(value).trim().toLowerCase();
	if (['true', 'yes', '1', 'on'].includes(s)) return true;
	if (['false', 'no', '0', 'off'].includes(s)) return false;
	return undefined;
}

/** JSON text or a value that is already parsed. Bad JSON is an InputError. */
export function toJson(value: unknown, name: string): unknown {
	if (blank(value)) return undefined;
	if (typeof value === 'object') return value;
	let parsed: unknown;
	let valid = true;
	try {
		parsed = JSON.parse(String(value));
	} catch {
		valid = false;
	}
	if (!valid) throw new InputError(`${name} must be valid JSON`);
	return parsed;
}

const isStructured = (input: SpecInput): boolean =>
	input.items === 'object' || input.items === 'array' || input.name === 'filters';

/** Converts a filled in value to what the API expects for that input. */
export function coerce(input: SpecInput, value: unknown): unknown {
	if (blank(value)) return undefined;
	switch (input.type) {
		case 'integer': {
			const n = parseInt(String(value), 10);
			return Number.isNaN(n) ? value : n;
		}
		case 'number': {
			const n = Number(value);
			return Number.isNaN(n) ? value : n;
		}
		case 'boolean':
			return toBoolean(value);
		case 'object':
			return toJson(value, input.name);
		case 'array':
			if (isStructured(input)) {
				const parsed = toJson(value, input.name);
				return Array.isArray(parsed) ? parsed : [parsed];
			}
			return toList(value);
		default:
			return typeof value === 'string' ? value.trim() : value;
	}
}

export interface BuiltRequest extends IHttpRequestOptions {
	method: IHttpRequestMethods;
	url: string;
	body?: IDataObject;
}

/** A query string. A list of plain values goes as status[]=a&status[]=b, the way Rails reads it. */
export function queryString(params: Record<string, unknown>): string {
	const parts: string[] = [];
	for (const [key, value] of Object.entries(params)) {
		if (
			Array.isArray(value) &&
			key !== 'filters' &&
			value.every((v) => v === null || typeof v !== 'object')
		) {
			value.forEach((v) => parts.push(`${enc(key)}[]=${enc(String(v))}`));
		} else if (typeof value === 'object' && value !== null) {
			// Filters and other structures go as JSON, as the filters documentation shows.
			parts.push(`${enc(key)}=${enc(JSON.stringify(value))}`);
		} else {
			parts.push(`${enc(key)}=${enc(String(value))}`);
		}
	}
	return parts.join('&');
}

/**
 * Builds one API call by its operationId. Path parameters come from `values`
 * (site_id, id, workspace_id and so on), the other inputs become the query
 * string (GET) or the JSON body, coerced to their documented types. Only
 * inputs the operation documents are sent, and blank values are left out.
 */
export function buildRequest(operationId: string, values: Values): BuiltRequest {
	const operation = SPEC[operationId];
	if (!operation) throw new InputError(`Unknown operation ${operationId}`);

	const path = operation.path.replace(/\{(\w+)\}/g, (_match, name: string) => {
		const value = values[name];
		if (blank(value)) throw new InputError(`${name} is required`);
		// A colon stays as it is: a breakdown of prop:plan is routed only that way.
		return enc(String(value).trim()).replace(/%3A/gi, ':');
	});

	const payload: Record<string, unknown> = {};
	for (const input of operation.inputs) {
		if (input.in === 'path') continue;
		const value = coerce(input, values[input.name]);
		if (value !== undefined) payload[input.name] = value;
	}

	const method = operation.method as IHttpRequestMethods;
	if (method === 'GET' || method === 'DELETE') {
		const query = queryString(payload);
		return { method, url: `${BASE_URL}${path}${query ? `?${query}` : ''}`, json: true };
	}
	return { method, url: `${BASE_URL}${path}`, body: payload as IDataObject, json: true };
}

/** Text for a failed call, from the API error envelope { error: { code, message, details } }. */
export function apiErrorMessage(body: unknown): string | undefined {
	const error = body && typeof body === 'object' ? (body as IDataObject).error : undefined;
	if (!error || typeof error !== 'object') return undefined;
	const { message, details } = error as IDataObject;
	let text = typeof message === 'string' ? message : undefined;
	if (text && details && typeof details === 'object' && !Array.isArray(details)) {
		const lines = Object.entries(details as IDataObject).map(
			([field, problems]) => `${field}: ${([] as unknown[]).concat(problems).join(', ')}`,
		);
		if (lines.length) text = `${text} (${lines.join(', ')})`;
	}
	return text;
}
