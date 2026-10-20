import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class PrivatusAnalyticsApi implements ICredentialType {
	name = 'privatusAnalyticsApi';

	displayName = 'Privatus Analytics API';

	icon: Icon = {
		light: 'file:privatusAnalytics.svg',
		dark: 'file:privatusAnalytics.dark.svg',
	};

	documentationUrl = 'https://github.com/privatus-analytics/n8n-nodes-privatus-analytics#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Token',
			name: 'apiToken',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				'In Privatus Analytics, open Workspace settings, then API tokens, and create a token. It starts with pat_ and works in one workspace. For every operation and trigger to work, keep all permissions, choose every site you can access, and set the expiry to never. The trigger adds a webhook, which needs the workspace settings permission and every site.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiToken}}',
			},
		},
	};

	// GET /workspaces.json lists only the workspace of the token.
	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://privatusanalytics.com',
			url: '/workspaces.json',
		},
	};
}
