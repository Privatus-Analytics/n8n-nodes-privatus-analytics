import {
	NodeConnectionTypes,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
} from 'n8n-workflow';

import { loadOptions } from '../shared/loaders';
import { execute } from './execute';
import { buildProperties } from './properties';

export class PrivatusAnalytics implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Privatus Analytics',
		name: 'privatusAnalytics',
		icon: {
			light: 'file:privatusAnalytics.svg',
			dark: 'file:privatusAnalytics.dark.svg',
		},
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Read and manage web analytics, goals, uptime checks, experiments and testimonials in Privatus Analytics',
		defaults: {
			name: 'Privatus Analytics',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'privatusAnalyticsApi',
				required: true,
			},
		],
		properties: buildProperties(),
	};

	methods = { loadOptions };

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return await execute(this);
	}
}
