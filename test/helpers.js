'use strict';

// Fakes for the n8n execution contexts, so the compiled nodes run without n8n.

const { NodeApiError } = require('n8n-workflow');

const NODE = {
	name: 'Privatus Analytics',
	type: 'n8n-nodes-privatus-analytics.privatusAnalytics',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
	id: 'n1',
};

/**
 * routes: function (options) => response body (or throws). Every request is
 * kept in `calls`.
 */
function fakeExecute({ params = {}, routes, items = [{ json: {} }], continueOnFail = false }) {
	const calls = [];
	const ctx = {
		calls,
		getInputData: () => items,
		getNode: () => NODE,
		continueOnFail: () => continueOnFail,
		getNodeParameter: (name, _i, fallback) => (name in params ? params[name] : fallback),
		getCurrentNodeParameter: (name) => params[name],
		helpers: {
			httpRequestWithAuthentication: async (credential, options) => {
				calls.push({ credential, ...options });
				return routes(options);
			},
		},
	};
	return ctx;
}

const WORKSPACES = { data: [{ id: 'ws_TEST', name: 'Test' }], meta: { total_pages: 1 } };

/** Routes that answer GET /workspaces.json and hand everything else to `handler`. */
const withWorkspace = (handler) => (options) => {
	if (options.url.endsWith('/workspaces.json')) return WORKSPACES;
	return handler(options);
};

function apiFailure(status, body) {
	const error = new Error(`Request failed with status code ${status}`);
	error.response = { status, data: body };
	error.httpCode = String(status);
	return error;
}

module.exports = { fakeExecute, withWorkspace, apiFailure, NODE, NodeApiError };
