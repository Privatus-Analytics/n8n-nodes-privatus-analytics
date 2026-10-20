import {
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
	type IDataObject,
	type IHookFunctions,
	type INodeType,
	type INodeTypeDescription,
	type IWebhookFunctions,
	type IWebhookResponseData,
} from 'n8n-workflow';

import { apiRequest, asNodeError, unwrap, workspaceId } from '../shared/client';
import { EVENTS } from '../shared/events';
import { loadOptions } from '../shared/loaders';
import { matchesFilters, toItem, type TriggerFilters } from '../shared/payload';
import { buildRequest } from '../shared/request';
import { verifySignature } from '../shared/signature';

/** What the trigger remembers about its webhook in the workflow static data. */
interface Subscription {
	webhookId?: string;
	secret?: string;
	workspaceId?: string;
	webhookUrl?: string;
	events?: string[];
}

const sameEvents = (a: string[] = [], b: string[] = []): boolean =>
	a.length === b.length && [...a].sort().every((event, index) => event === [...b].sort()[index]);

/** Deletes the webhook of a subscription. A webhook that is already gone is fine. */
async function removeWebhook(ctx: IHookFunctions, saved: Subscription): Promise<void> {
	if (!saved.webhookId) return;
	try {
		await apiRequest(
			ctx,
			buildRequest('webhooks_delete', {
				workspace_id: saved.workspaceId ?? (await workspaceId(ctx)),
				id: saved.webhookId,
			}),
		);
	} catch (error) {
		if (error instanceof NodeApiError && String(error.httpCode) === '404') return;
		throw asNodeError(ctx, error);
	}
}

export class PrivatusAnalyticsTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Privatus Analytics Trigger',
		name: 'privatusAnalyticsTrigger',
		icon: {
			light: 'file:privatusAnalytics.svg',
			dark: 'file:privatusAnalytics.dark.svg',
		},
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].length + " event(s)"}}',
		description: 'Starts a workflow when something happens in Privatus Analytics',
		defaults: {
			name: 'Privatus Analytics Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'privatusAnalyticsApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				required: true,
				default: [],
				description:
					'The events that start the workflow. Choose from the list, or specify event names using an expression.',
				options: EVENTS.map(({ value, name, description }) => ({ name, value, description })),
			},
			{
				displayName: 'Filters',
				name: 'filters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				description:
					'Only start for deliveries that match. A filter applies to the events that carry that field, and the other events pass.',
				options: [
					{
						displayName: 'Alert Rule Name or ID',
						name: 'alertId',
						type: 'options',
						typeOptions: { loadOptionsMethod: 'getAlerts' },
						default: '',
						description:
							'Only for this alert rule. It applies to the alert events. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
					{
						displayName: 'Form Name or ID',
						name: 'formId',
						type: 'options',
						typeOptions: {
							loadOptionsMethod: 'getTestimonialForms',
							loadOptionsDependsOn: ['filters.siteId'],
						},
						default: '',
						description:
							'Only for this testimonial form. Choose a site first. It applies to Testimonial Form Submitted. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
					{
						displayName: 'Minimum Rating',
						name: 'minRating',
						type: 'options',
						options: [
							{ name: '1 Star', value: 1 },
							{ name: '2 Stars', value: 2 },
							{ name: '3 Stars', value: 3 },
							{ name: '4 Stars', value: 4 },
							{ name: '5 Stars', value: 5 },
						],
						default: 4,
						description:
							'Only for ratings of at least this many stars. It applies to New Testimonial, Testimonial Approved and Testimonial Form Submitted.',
					},
					{
						displayName: 'Request Name or ID',
						name: 'requestId',
						type: 'options',
						typeOptions: {
							loadOptionsMethod: 'getTestimonialRequests',
							loadOptionsDependsOn: ['filters.siteId'],
						},
						default: '',
						description:
							'Only for this testimonial request. Choose a site first. It applies to Testimonial Request Sent and Finished. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
					{
						displayName: 'Site Name or ID',
						name: 'siteId',
						type: 'options',
						typeOptions: { loadOptionsMethod: 'getSites' },
						default: '',
						description:
							'Only for this site. It applies to every event that belongs to a site. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
				],
			},
		],
	};

	methods = { loadOptions };

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const saved = this.getWorkflowStaticData('node') as Subscription;
				const events = this.getNodeParameter('events', []) as string[];
				return Boolean(
					saved.webhookId &&
						saved.secret &&
						saved.webhookUrl === this.getNodeWebhookUrl('default') &&
						sameEvents(saved.events, events),
				);
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const saved = this.getWorkflowStaticData('node') as Subscription;
				const events = this.getNodeParameter('events', []) as string[];
				if (events.length === 0) {
					throw new NodeOperationError(this.getNode(), 'Choose at least one event');
				}
				const webhookUrl = this.getNodeWebhookUrl('default');
				if (!webhookUrl) {
					throw new NodeOperationError(this.getNode(), 'The webhook URL is not available');
				}

				// An older webhook of this node (other events or another URL) goes first.
				await removeWebhook(this, saved);

				const workspace = await workspaceId(this);
				const body = await apiRequest(
					this,
					buildRequest('webhooks_create', {
						workspace_id: workspace,
						url: webhookUrl,
						events,
						enabled: true,
					}),
				);
				const hook = unwrap(body) as IDataObject;
				if (typeof hook?.id !== 'string' || typeof hook?.secret !== 'string') {
					throw new NodeOperationError(
						this.getNode(),
						'Privatus Analytics did not return a webhook with a signing secret',
					);
				}
				// The secret signs every delivery: webhook() checks it.
				saved.webhookId = hook.id;
				saved.secret = hook.secret;
				saved.workspaceId = workspace;
				saved.webhookUrl = webhookUrl;
				saved.events = events;
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const saved = this.getWorkflowStaticData('node') as Subscription;
				await removeWebhook(this, saved);
				delete saved.webhookId;
				delete saved.secret;
				delete saved.workspaceId;
				delete saved.webhookUrl;
				delete saved.events;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const request = this.getRequestObject();
		const response = this.getResponseObject();
		const saved = this.getWorkflowStaticData('node') as Subscription;

		// Every delivery must carry a valid signature at most five minutes old, or it starts nothing.
		const rawBody = (request as unknown as { rawBody?: Buffer | string }).rawBody;
		const header = this.getHeaderData()['privatus-signature'];
		if (!verifySignature(saved.secret, rawBody, header)) {
			response.status(401).json({ error: 'Webhook signature missing or invalid' });
			return { noWebhookResponse: true };
		}

		const item = toItem(this.getBodyData());
		const events = this.getNodeParameter('events', []) as string[];
		const filters = this.getNodeParameter('filters', {}) as TriggerFilters;
		if (!events.includes(item.event as string) || !matchesFilters(item, filters)) {
			return { webhookResponse: 'Ignored' };
		}
		return { workflowData: [this.helpers.returnJsonArray(item)] };
	}
}
