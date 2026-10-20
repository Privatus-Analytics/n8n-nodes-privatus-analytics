import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

import { apiErrorMessage, BASE_URL, buildRequest, InputError, SPEC, type Values } from './request';

export const CREDENTIAL = 'privatusAnalyticsApi';

export type ApiContext = IExecuteFunctions | ILoadOptionsFunctions | IHookFunctions;

const asObject = (value: unknown): IDataObject | undefined => {
	if (typeof value === 'string') {
		try {
			return asObject(JSON.parse(value));
		} catch {
			return undefined;
		}
	}
	return value && typeof value === 'object' ? (value as IDataObject) : undefined;
};

/** The response body of a failed call, wherever n8n put it. */
function errorBody(error: IDataObject): IDataObject | undefined {
	const response = asObject(error.response) ?? asObject(asObject(error.cause)?.response);
	return (
		asObject(response?.data) ??
		asObject(response?.body) ??
		asObject(error.body) ??
		asObject(asObject(error.cause)?.body)
	);
}

function statusOf(error: IDataObject): number | undefined {
	const response = asObject(error.response) ?? asObject(asObject(error.cause)?.response);
	const status = response?.status ?? response?.statusCode ?? error.httpCode ?? error.statusCode;
	return status === undefined ? undefined : Number(status) || undefined;
}

/** Sends one authenticated call and returns the parsed JSON body. */
export async function apiRequest(ctx: ApiContext, options: IHttpRequestOptions): Promise<unknown> {
	try {
		return await ctx.helpers.httpRequestWithAuthentication.call(ctx, CREDENTIAL, options);
	} catch (caught) {
		// n8n wraps a failed call in a NodeApiError. The response is on the error it wraps.
		const wrapped =
			caught instanceof NodeApiError ? (caught.cause as IDataObject | undefined) : undefined;
		const error = wrapped ?? (caught as IDataObject);
		const status = statusOf(error) ?? statusOf(caught as IDataObject);
		const apiMessage = apiErrorMessage(errorBody(error));
		let message = apiMessage;
		if (status === 401) {
			message = `The API token was refused${apiMessage ? `: ${apiMessage}` : ''}`;
		} else if (status === 402) {
			message = `${apiMessage ?? 'This is not included in the plan'}. It needs a higher Privatus Analytics plan`;
		}
		if (message || status) {
			throw new NodeApiError(ctx.getNode(), error as JsonObject, {
				message: message ?? `Privatus Analytics responded with HTTP ${status}`,
				httpCode: status === undefined ? undefined : String(status),
			});
		}
		throw new NodeApiError(ctx.getNode(), error as JsonObject);
	}
}

/** The data member of the JSON envelope, or the whole body. */
export function unwrap(body: unknown): unknown {
	if (body && typeof body === 'object' && !Array.isArray(body) && 'data' in (body as IDataObject)) {
		return (body as IDataObject).data;
	}
	return body;
}

const workspaces = new WeakMap<object, string>();

/**
 * The workspace of the API token. A token belongs to one workspace and
 * GET /workspaces.json lists only that one, so nobody has to choose it.
 */
export async function workspaceId(ctx: ApiContext): Promise<string> {
	const known = workspaces.get(ctx);
	if (known) return known;
	const body = await apiRequest(ctx, {
		method: 'GET',
		url: `${BASE_URL}/workspaces.json`,
		json: true,
	});
	const list = unwrap(body);
	const first = Array.isArray(list) ? (list[0] as IDataObject | undefined) : undefined;
	if (!first || typeof first.id !== 'string') {
		throw new InputError('This API token cannot see any workspace');
	}
	workspaces.set(ctx, first.id);
	return first.id;
}

/** Runs one API operation by operationId. The workspace is filled in when the path needs it. */
export async function callOperation(
	ctx: ApiContext,
	operationId: string,
	values: Values,
): Promise<{ data: unknown; meta?: IDataObject }> {
	const withWorkspace = { ...values };
	// Built once without it, so only operations with {workspace_id} look it up.
	if (!withWorkspace.workspace_id && /\{workspace_id\}/.test(pathOf(operationId))) {
		withWorkspace.workspace_id = await workspaceId(ctx);
	}
	const body = await apiRequest(ctx, buildRequest(operationId, withWorkspace));
	const meta =
		body && typeof body === 'object' && !Array.isArray(body)
			? ((body as IDataObject).meta as IDataObject | undefined)
			: undefined;
	return { data: unwrap(body), meta };
}

const pathOf = (operationId: string): string => SPEC[operationId]?.path ?? '';

/** Every page of a collection (100 per page), up to `max` items. */
export async function listAll(
	ctx: ApiContext,
	operationId: string,
	values: Values,
	max = Infinity,
): Promise<IDataObject[]> {
	const all: IDataObject[] = [];
	for (let page = 1; page <= 200; page += 1) {
		const { data, meta } = await callOperation(ctx, operationId, {
			...values,
			page,
			per_page: 100,
		});
		const items = Array.isArray(data) ? (data as IDataObject[]) : [];
		all.push(...items);
		const totalPages = Number(meta?.total_pages ?? 0);
		if (all.length >= max || items.length === 0 || !totalPages || page >= totalPages) break;
	}
	return all.slice(0, max);
}

/**
 * The error to throw for anything that went wrong: an API failure stays a
 * NodeApiError, a problem with the input becomes a NodeOperationError.
 */
export function asNodeError(
	ctx: ApiContext,
	error: unknown,
	itemIndex?: number,
): NodeApiError | NodeOperationError {
	if (error instanceof NodeApiError || error instanceof NodeOperationError) return error;
	const message = error instanceof Error ? error.message : String(error);
	return new NodeOperationError(
		ctx.getNode(),
		message,
		itemIndex === undefined ? {} : { itemIndex },
	);
}
