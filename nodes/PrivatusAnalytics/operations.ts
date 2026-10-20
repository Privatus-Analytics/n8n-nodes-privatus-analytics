/**
 * Every resource and operation of the Privatus Analytics node.
 *
 * An operation names the API operation it calls (`call`, an operationId of the
 * OpenAPI document, see nodes/shared/spec.json) and lists the fields it shows.
 * Labels, descriptions, choices and types come from that document, and a field
 * only needs a tweak where the API text would not be clear in n8n. Fields
 * marked `extra` go into the Additional Fields (or Filters) collection.
 */

export type Loader =
	| 'getSites'
	| 'getAlerts'
	| 'getUptimeChecks'
	| 'getExperiments'
	| 'getTestimonials'
	| 'getStatusPages'
	| 'getTestimonialRequests'
	| 'getSegments'
	| 'getTestimonialForms'
	| 'getTestimonialTags'
	| 'getTestimonialCollections';

export interface FieldDef {
	/** The API name of the input (snake case), or the name of a field the node adds itself. */
	name: string;
	/** True for a field in the Additional Fields or Filters collection. */
	extra?: boolean;
	label?: string;
	description?: string;
	required?: boolean;
	/** Overrides the type found in the API document. */
	type?:
		| 'string'
		| 'text'
		| 'number'
		| 'boolean'
		| 'dateTime'
		| 'json'
		| 'options'
		| 'multiOptions';
	/** Fills the list from the API (a dropdown with the sites, alerts and so on). */
	loader?: Loader;
	/** The fields the loader needs first, by node parameter name. */
	dependsOn?: string[];
	choices?: Array<[value: string, label: string]>;
	default?: unknown;
	/** Show this field only when other parameters have these values. */
	showWhen?: Record<string, string[]>;
	/** day: YYYY-MM-DD, month: YYYY-MM, iso: sent as picked. The field is a date picker. */
	format?: 'day' | 'month' | 'iso';
	placeholder?: string;
}

export interface OperationDef {
	resource: string;
	value: string;
	name: string;
	action: string;
	description: string;
	/** The operationId in the OpenAPI document. */
	call: string;
	fields: FieldDef[];
	/** Name and label of the collection that holds the `extra` fields. */
	collection?: { name: string; label: string };
	/** A list that is paged: adds Return All and Limit. */
	list?: boolean;
	/** Values sent whatever the user picks. */
	fixed?: Record<string, unknown>;
	/** The name of the special handling in execute.ts. */
	special?: string;
}

export const RESOURCES: Array<{ value: string; name: string; description: string }> = [
	{ value: 'alert', name: 'Alert', description: 'Alert rules and their incidents' },
	{
		value: 'apiRequest',
		name: 'Custom API Call',
		description: 'Call any endpoint of the Privatus Analytics API',
	},
	{ value: 'campaign', name: 'Campaign', description: 'Campaign links and costs' },
	{
		value: 'note',
		name: 'Chart Note',
		description: 'Notes on the charts of a site or of every site',
	},
	{ value: 'experiment', name: 'Experiment', description: 'A/B and split URL experiments' },
	{ value: 'export', name: 'Export', description: 'Data exports' },
	{ value: 'goal', name: 'Goal', description: 'Conversion goals' },
	{ value: 'member', name: 'Member', description: 'People in the workspace' },
	{ value: 'site', name: 'Site', description: 'Websites tracked in the workspace' },
	{ value: 'siteAudit', name: 'Site Audit', description: 'SEO audits of a site' },
	{
		value: 'stats',
		name: 'Stats',
		description: 'Visitors, pageviews, top lists and live visitors',
	},
	{
		value: 'statusPage',
		name: 'Status Page',
		description: 'Public status pages and their updates',
	},
	{ value: 'testimonial', name: 'Testimonial', description: 'Testimonials and their moderation' },
	{
		value: 'testimonialPerson',
		name: 'Testimonial Person',
		description: 'People who give testimonials',
	},
	{
		value: 'testimonialRequest',
		name: 'Testimonial Request',
		description: 'Requests that ask people for a testimonial',
	},
	{ value: 'uptimeCheck', name: 'Uptime Check', description: 'Uptime monitoring of a site' },
];

const SITE: FieldDef = {
	name: 'site_id',
	label: 'Site',
	required: true,
	loader: 'getSites',
	description: 'The site to use. Choose from the list, or enter a site ID such as pa_7Q2K9XH3AB',
};

const OPTIONAL_SITE: FieldDef = {
	...SITE,
	extra: true,
	required: false,
	description: 'Only this site',
};

const ADDITIONAL = { name: 'additionalFields', label: 'Additional Fields' };
const FILTERS = { name: 'filters', label: 'Filters' };
const OPTIONS = { name: 'options', label: 'Options' };

const PERIOD: FieldDef = {
	name: 'period',
	label: 'Period',
	required: true,
	description: 'The date range, in the time zone of the site',
	choices: [
		['today', 'Today'],
		['yesterday', 'Yesterday'],
		['24h', 'Last 24 Hours'],
		['7d', 'Last 7 Days'],
		['14d', 'Last 14 Days'],
		['28d', 'Last 28 Days'],
		['30d', 'Last 30 Days'],
		['90d', 'Last 90 Days'],
		['mtd', 'Month to Date'],
		['last_month', 'Last Month'],
		['qtd', 'Quarter to Date'],
		['last_quarter', 'Last Quarter'],
		['ytd', 'Year to Date'],
		['12mo', 'Last 12 Months'],
		['last_year', 'Last Year'],
		['all', 'All Time'],
		['custom', 'Custom (Use From and To)'],
	],
	default: '7d',
};
const FROM: FieldDef = {
	name: 'from',
	label: 'From',
	type: 'dateTime',
	format: 'day',
	showWhen: { period: ['custom'] },
	description: 'The first day of a custom period',
};
const TO: FieldDef = {
	name: 'to',
	label: 'To',
	type: 'dateTime',
	format: 'day',
	showWhen: { period: ['custom'] },
	description: 'The last day of a custom period, included',
};
const STAT_FILTERS: FieldDef = {
	name: 'filters',
	extra: true,
	label: 'Filters',
	type: 'json',
	description:
		'Conditions that must all match, as a JSON list of [dimension, operator, value] like [["country","is","US"],["page","starts_with","/blog"]]',
};
const SEGMENT: FieldDef = {
	name: 'segment_id',
	extra: true,
	label: 'Segment',
	loader: 'getSegments',
	dependsOn: ['siteId'],
	description: 'A saved segment of the site. Its filters are added to the filters above',
};

const SORT_LABELS: Array<[string, string]> = [
	['received_desc', 'Received (Newest First)'],
	['received_asc', 'Received (Oldest First)'],
	['added_desc', 'Added (Newest First)'],
	['added_asc', 'Added (Oldest First)'],
	['rating_desc', 'Rating (Highest First)'],
	['rating_asc', 'Rating (Lowest First)'],
	['person_asc', 'Person (A to Z)'],
	['relevance', 'Relevance (Best Match First)'],
];

const DIMENSIONS: Array<[string, string]> = [
	['page', 'Page'],
	['entry_page', 'Entry Page'],
	['exit_page', 'Exit Page'],
	['channel', 'Channel'],
	['referrer', 'Referrer'],
	['utm_source', 'UTM Source'],
	['utm_medium', 'UTM Medium'],
	['utm_campaign', 'UTM Campaign'],
	['utm_content', 'UTM Content'],
	['utm_term', 'UTM Term'],
	['country', 'Country'],
	['language', 'Language'],
	['device', 'Device'],
	['browser', 'Browser'],
	['os', 'Operating System'],
	['hostname', 'Hostname'],
	['event', 'Custom Event'],
	['goal', 'Goal'],
	['prop', 'Custom Event Property'],
];

const ID = (
	label: string,
	loader: Loader,
	description: string,
	dependsOn?: string[],
): FieldDef => ({
	name: 'id',
	label,
	required: true,
	loader,
	dependsOn,
	description,
});

const TESTIMONIAL_ID = ID(
	'Testimonial',
	'getTestimonials',
	'The testimonial. The list shows the newest ones, so use an expression for an older one',
	['siteId'],
);
const ALERT_ID = ID('Alert Rule', 'getAlerts', 'The alert rule');
const CHECK_ID = ID('Uptime Check', 'getUptimeChecks', 'The uptime check', ['siteId']);
const EXPERIMENT_ID = ID('Experiment', 'getExperiments', 'The experiment', ['siteId']);

const siteOnly = (
	resource: string,
	value: string,
	name: string,
	call: string,
	description: string,
	action = description,
): OperationDef => ({ resource, value, name, action, description, call, fields: [SITE] });

const MODERATION = (
	value: string,
	name: string,
	call: string,
	text: string,
	fixed?: Record<string, unknown>,
): OperationDef => ({
	resource: 'testimonial',
	value,
	name,
	action: text,
	description: text,
	call,
	fixed,
	fields: [SITE, TESTIMONIAL_ID],
});

export const OPERATIONS: OperationDef[] = [
	// Site
	{
		resource: 'site',
		value: 'create',
		name: 'Create',
		action: 'Create a site',
		description: 'Add a website to the workspace and get its tracking snippet',
		call: 'sites_create',
		collection: ADDITIONAL,
		special: 'siteCreate',
		fields: [
			{
				name: 'domain',
				required: true,
				description:
					'The domain to track, like example.com. A pasted address such as https://www.example.com/pricing is shortened to example.com',
			},
			{ name: 'name', extra: true },
			{ name: 'timezone', extra: true },
			{ name: 'currency', extra: true },
		],
	},
	{
		resource: 'site',
		value: 'get',
		name: 'Get',
		action: 'Get a site',
		description: 'Get one site',
		call: 'sites_get',
		fields: [{ ...SITE, name: 'id' }],
	},
	{
		resource: 'site',
		value: 'getMany',
		name: 'Get Many',
		action: 'Get many sites',
		description: 'List the sites of the workspace',
		call: 'sites_list',
		list: true,
		collection: FILTERS,
		fields: [
			{ name: 'query', extra: true, label: 'Search' },
			{ name: 'label', extra: true },
			{ name: 'sort', extra: true },
		],
	},
	{
		resource: 'site',
		value: 'findByDomain',
		name: 'Find by Domain',
		action: 'Find a site by domain',
		description: 'Find a site by its main domain or an extra domain',
		call: 'sites_list',
		special: 'siteFind',
		fields: [
			{
				name: 'domain',
				required: true,
				type: 'string',
				description: 'Like example.com. A full address works too',
			},
		],
	},

	// Stats
	{
		resource: 'stats',
		value: 'getOverview',
		name: 'Get Overview',
		action: 'Get the stats of a site',
		description:
			'Get visitors, visits, pageviews, bounce rate, visit duration and revenue for a period, optionally compared with an earlier one',
		call: 'stats_aggregate',
		collection: ADDITIONAL,
		fields: [
			SITE,
			PERIOD,
			FROM,
			TO,
			{ name: 'compare', extra: true, label: 'Compare With' },
			{ name: 'compare_from', extra: true, type: 'dateTime', format: 'day' },
			{ name: 'compare_to', extra: true, type: 'dateTime', format: 'day' },
			{ name: 'match_weekday', extra: true },
			STAT_FILTERS,
			SEGMENT,
			{ name: 'include_imported', extra: true },
		],
	},
	{
		resource: 'stats',
		value: 'getTopValues',
		name: 'Get Top Values',
		action: 'Get the top pages, sources or countries of a site',
		description:
			'Get the top values of one report (pages, referrers, campaigns, countries, devices, events, goals and more), one item for each row',
		call: 'stats_breakdown',
		special: 'statsBreakdown',
		collection: ADDITIONAL,
		fields: [
			SITE,
			{
				name: 'dimension',
				label: 'Report',
				required: true,
				default: 'page',
				choices: DIMENSIONS,
				description: 'What to group by',
			},
			{
				name: 'property_key',
				label: 'Property Key',
				type: 'string',
				required: true,
				showWhen: { dimension: ['prop'] },
				description: 'The key of the custom event property, like plan',
			},
			PERIOD,
			FROM,
			TO,
			{
				name: 'limit',
				extra: true,
				label: 'Rows',
				default: 10,
				description: 'How many rows, from 1 to 100',
			},
			{
				name: 'sort',
				extra: true,
				choices: [
					['visitors', 'Visitors'],
					['visits', 'Visits'],
					['pageviews', 'Pageviews'],
					['revenue', 'Revenue'],
				],
			},
			{ name: 'search', extra: true, description: 'Only rows whose value contains this text' },
			STAT_FILTERS,
			SEGMENT,
			{ name: 'include_imported', extra: true },
		],
	},
	{
		resource: 'stats',
		value: 'getTimeSeries',
		name: 'Get Time Series',
		action: 'Get the daily stats of a site',
		description:
			'Get visitors, visits and pageviews for each hour, day, week or month of a period, one item for each point',
		call: 'stats_timeseries',
		special: 'statsSeries',
		collection: ADDITIONAL,
		fields: [
			SITE,
			PERIOD,
			FROM,
			TO,
			{
				name: 'interval',
				extra: true,
				choices: [
					['auto', 'Automatic'],
					['hour', 'Hour'],
					['day', 'Day'],
					['week', 'Week'],
					['month', 'Month'],
				],
				default: 'day',
			},
			STAT_FILTERS,
			SEGMENT,
			{ name: 'include_imported', extra: true },
		],
	},
	{
		resource: 'stats',
		value: 'getLiveVisitors',
		name: 'Get Live Visitors',
		action: 'Get the live visitors of a site',
		description:
			'Get how many visitors are on a site right now (the last 30 minutes) and its latest activity',
		call: 'live_get',
		collection: ADDITIONAL,
		fields: [
			SITE,
			{ name: 'feed', extra: true, label: 'Activity Feed' },
			{ name: 'limit', extra: true, label: 'Feed Entries', default: 10 },
			STAT_FILTERS,
		],
	},

	// Goal
	{
		resource: 'goal',
		value: 'create',
		name: 'Create',
		action: 'Create a goal',
		description:
			'Create a conversion goal on a site. It counts matching events across all existing history at once.',
		call: 'goals_create',
		collection: ADDITIONAL,
		fields: [
			SITE,
			{ name: 'name', required: true },
			{ name: 'kind', required: true, default: 'page' },
			{ name: 'match_type', extra: true },
			{ name: 'pattern', extra: true },
			{ name: 'hostname', extra: true },
			{ name: 'event_name', extra: true },
			{
				name: 'conditions',
				extra: true,
				type: 'json',
				description:
					'Event goals only. A JSON list of property tests that must all match, like [{"key":"plan","operator":"is","value":"pro"}]. Operators: is, is_not, contains, gt, lt',
			},
			{ name: 'scroll_threshold', extra: true },
			{ name: 'time_threshold_seconds', extra: true },
			{ name: 'value_mode', extra: true },
			{
				name: 'fixed_value',
				extra: true,
				description:
					'The value of one completion in the site currency, like 49.5. Used when Value Mode is fixed',
			},
			{ name: 'count_mode', extra: true },
		],
	},
	{
		resource: 'goal',
		value: 'getMany',
		name: 'Get Many',
		action: 'Get many goals',
		description: 'List the goals of a site with their completions for a period',
		call: 'goals_list',
		list: true,
		special: 'goalFind',
		collection: ADDITIONAL,
		fields: [
			SITE,
			{
				name: 'name',
				extra: true,
				type: 'string',
				description: 'Only goals with this name, not case sensitive',
			},
			{ name: 'status', extra: true },
			{ ...PERIOD, extra: true, required: false },
			{ ...FROM, showWhen: undefined, extra: true },
			{ ...TO, showWhen: undefined, extra: true },
		],
	},

	// Chart notes
	{
		resource: 'note',
		value: 'create',
		name: 'Create',
		action: 'Create a chart note',
		description:
			'Add a note to the charts of a site, such as a deploy, a campaign launch or an outage',
		call: 'notes_create',
		special: 'noteDates',
		collection: ADDITIONAL,
		fields: [
			SITE,
			{ name: 'title', required: true, description: 'Short title shown on the chart' },
			{
				name: 'date',
				extra: true,
				type: 'dateTime',
				format: 'day',
				description: 'The day the note is shown on. Defaults to today',
			},
			{
				name: 'end_date',
				extra: true,
				type: 'dateTime',
				format: 'day',
				description: 'For a note that covers several days, the last day',
			},
			{ name: 'body', extra: true },
			{ name: 'url', extra: true, label: 'Link' },
			{ name: 'color', extra: true },
			{ name: 'source', extra: true },
			{ name: 'version', extra: true },
		],
	},
	{
		resource: 'note',
		value: 'createForWorkspace',
		name: 'Create for Workspace',
		action: 'Create a chart note for every site',
		description:
			'Add a note to the charts of every site in the workspace, such as a release that touched them all',
		call: 'workspace_notes_create',
		special: 'noteDates',
		collection: ADDITIONAL,
		fields: [
			{ name: 'title', required: true, description: 'Short title shown on the chart' },
			{
				name: 'date',
				extra: true,
				type: 'dateTime',
				format: 'day',
				description: 'The day the note is shown on. Defaults to today',
			},
			{
				name: 'end_date',
				extra: true,
				type: 'dateTime',
				format: 'day',
				description: 'For a note that covers several days, the last day',
			},
			{ name: 'body', extra: true },
			{ name: 'url', extra: true, label: 'Link' },
			{ name: 'color', extra: true },
			{ name: 'source', extra: true },
			{ name: 'version', extra: true },
		],
	},

	// Campaign
	{
		resource: 'campaign',
		value: 'createLink',
		name: 'Create Link',
		action: 'Create a campaign link',
		description:
			'Save a tagged campaign link (with UTM parameters) in the campaign URL builder and get the full URL',
		call: 'links_create',
		collection: ADDITIONAL,
		fields: [
			SITE,
			{ name: 'name', required: true },
			{ name: 'destination', required: true, label: 'Destination URL' },
			{ name: 'utm_source', extra: true },
			{ name: 'utm_medium', extra: true },
			{ name: 'utm_campaign', extra: true },
			{ name: 'utm_content', extra: true },
			{ name: 'utm_term', extra: true },
			{
				name: 'tags',
				extra: true,
				description: 'Tags for finding the link later, separated by commas',
			},
			{ name: 'notes', extra: true },
		],
	},
	{
		resource: 'campaign',
		value: 'addCost',
		name: 'Add Cost',
		action: 'Add a campaign cost',
		description:
			'Record what a campaign cost in a month, for cost per acquisition and return on ad spend (Business plan)',
		call: 'campaign_costs_create',
		collection: ADDITIONAL,
		fields: [
			SITE,
			{
				name: 'campaign',
				required: true,
				description:
					'The utm_campaign value the cost belongs to, exactly as it arrives on the site',
			},
			{
				name: 'month',
				required: true,
				type: 'dateTime',
				format: 'month',
				description: 'The month the money was spent. Any day in it works, like 2026-10-01',
			},
			{
				name: 'amount',
				required: true,
				description: 'The spend for the month in major currency units, like 1250.50',
			},
			{ name: 'currency', extra: true },
		],
	},

	// Uptime checks
	{
		resource: 'uptimeCheck',
		value: 'create',
		name: 'Create',
		action: 'Create an uptime check',
		description: 'Start monitoring a URL, a keyword on a page, a TCP port or a DNS name for a site',
		call: 'uptime_checks_create',
		collection: ADDITIONAL,
		fields: [
			SITE,
			{
				name: 'name',
				description: 'Display name, up to 100 characters. Defaults to the target hostname',
			},
			{ name: 'kind', default: 'http' },
			{ name: 'url', label: 'URL' },
			{ name: 'host', extra: true },
			{ name: 'port', extra: true },
			{ name: 'keyword', extra: true },
			{ name: 'expected_status', extra: true },
			{ name: 'http_method', extra: true, label: 'HTTP Method' },
			{ name: 'interval_seconds', extra: true },
			{ name: 'timeout_seconds', extra: true },
			{ name: 'public', extra: true },
		],
	},
	{
		resource: 'uptimeCheck',
		value: 'getMany',
		name: 'Get Many',
		action: 'Get many uptime checks',
		description: 'List the uptime checks of a site with their status and uptime',
		call: 'uptime_checks_list',
		list: true,
		collection: FILTERS,
		fields: [
			SITE,
			{ name: 'status', extra: true },
			{ name: 'query', extra: true, label: 'Name or URL' },
		],
	},
	{
		resource: 'uptimeCheck',
		value: 'pause',
		name: 'Pause',
		action: 'Pause an uptime check',
		description: 'Pause an uptime check, for example during planned maintenance',
		call: 'uptime_checks_pause',
		fields: [SITE, CHECK_ID],
	},
	{
		resource: 'uptimeCheck',
		value: 'resume',
		name: 'Resume',
		action: 'Resume an uptime check',
		description: 'Resume a paused uptime check',
		call: 'uptime_checks_resume',
		fields: [SITE, CHECK_ID],
	},

	// Alerts
	{
		resource: 'alert',
		value: 'getMany',
		name: 'Get Many',
		action: 'Get many alert rules',
		description: 'List the alert rules of the workspace with their state',
		call: 'alerts_list',
		list: true,
		special: 'alertFind',
		collection: FILTERS,
		fields: [
			{
				name: 'name',
				extra: true,
				type: 'string',
				description: 'Part of the rule name, not case sensitive',
			},
			OPTIONAL_SITE,
			{ name: 'state', extra: true },
			{ name: 'kind', extra: true },
		],
	},
	{
		resource: 'alert',
		value: 'getHistory',
		name: 'Get History',
		action: 'Get the incidents of an alert rule',
		description: 'List the incidents of an alert rule, newest first',
		call: 'alerts_history',
		list: true,
		collection: FILTERS,
		fields: [
			ALERT_ID,
			{
				name: 'open',
				extra: true,
				label: 'Open Only',
				description: 'Whether to list only the incident that is open now',
			},
		],
	},
	{
		resource: 'alert',
		value: 'acknowledge',
		name: 'Acknowledge',
		action: 'Acknowledge an alert rule',
		description:
			'Acknowledge the open incident of an alert rule, so the team knows someone is on it',
		call: 'alerts_acknowledge',
		fields: [ALERT_ID],
	},
	{
		resource: 'alert',
		value: 'mute',
		name: 'Mute',
		action: 'Mute an alert rule',
		description:
			'Silence the notifications of an alert rule for a number of minutes. It keeps recording incidents.',
		call: 'alerts_mute',
		collection: ADDITIONAL,
		fields: [ALERT_ID, { name: 'minutes', label: 'Minutes', default: 60 }],
	},

	// Status pages
	{
		resource: 'statusPage',
		value: 'getMany',
		name: 'Get Many',
		action: 'Get many status pages',
		description: 'List the status pages of the workspace',
		call: 'status_pages_list',
		list: true,
		collection: FILTERS,
		fields: [{ name: 'query', extra: true, label: 'Search' }],
	},
	{
		resource: 'statusPage',
		value: 'postUpdate',
		name: 'Post Update',
		action: 'Post a status page update',
		description:
			"Publish an incident update on a status page and, by default, email the page's subscribers",
		call: 'status_page_posts_create',
		collection: ADDITIONAL,
		fields: [
			{
				name: 'status_page_id',
				label: 'Status Page',
				required: true,
				loader: 'getStatusPages',
				description: 'The status page',
			},
			{ name: 'title', required: true },
			{ name: 'body', extra: true },
			{ name: 'status', extra: true },
			{
				name: 'posted_at',
				extra: true,
				type: 'dateTime',
				format: 'iso',
				description: 'When it happened. Defaults to now. Posts are sorted by this time',
			},
			{ name: 'notify', extra: true, label: 'Email Subscribers' },
		],
	},

	// Exports
	{
		resource: 'export',
		value: 'create',
		name: 'Create',
		action: 'Create an export',
		description:
			'Queue a data export (CSV, JSON, XLSX, NDJSON or a ZIP of dashboard panels). Use the Export Ready trigger to act when its file is ready.',
		call: 'exports_create',
		collection: ADDITIONAL,
		fields: [
			SITE,
			{
				name: 'from',
				required: true,
				type: 'dateTime',
				format: 'day',
				description: 'The first day to include',
			},
			{
				name: 'to',
				required: true,
				type: 'dateTime',
				format: 'day',
				description:
					'The last day to include, included. At most 400 days after the first (93 days for raw)',
			},
			{ name: 'kind', extra: true },
			{ name: 'file_format', extra: true, label: 'File Format' },
			{ name: 'timezone', extra: true },
			{ name: 'grouping', extra: true },
			{ name: 'dimensions', extra: true },
			{ name: 'metrics', extra: true },
			{ name: 'fields', extra: true },
			{
				name: 'filters',
				extra: true,
				type: 'json',
				description:
					'A JSON list of filters, each [dimension, operator, value], like [["country","is","US"]]',
			},
			SEGMENT,
		],
	},
	{
		resource: 'export',
		value: 'getMany',
		name: 'Get Many',
		action: 'Get many exports',
		description: 'List the exports of the workspace',
		call: 'exports_list',
		list: true,
		collection: FILTERS,
		fields: [OPTIONAL_SITE, { name: 'status', extra: true }, { name: 'kind', extra: true }],
	},

	// Members
	{
		resource: 'member',
		value: 'getMany',
		name: 'Get Many',
		action: 'Get many members',
		description: 'List the members of the workspace with their role',
		call: 'members_list',
		list: true,
		collection: FILTERS,
		fields: [
			{ name: 'query', extra: true, label: 'Search' },
			{ name: 'role', extra: true },
		],
	},
	{
		resource: 'member',
		value: 'invite',
		name: 'Invite',
		action: 'Invite members',
		description:
			'Invite people to the workspace by email. Each gets an invitation link valid for 14 days.',
		call: 'invitations_create',
		collection: ADDITIONAL,
		fields: [
			{
				name: 'emails',
				required: true,
				label: 'Emails',
				description:
					'Up to 50 email addresses, separated by commas. Addresses that are already members are skipped',
			},
			{
				name: 'role',
				extra: true,
				default: 'viewer',
				choices: [
					['admin', 'Admin'],
					['editor', 'Editor'],
					['analyst', 'Analyst'],
					['viewer', 'Viewer'],
					['billing', 'Billing'],
				],
			},
			{
				name: 'all_sites',
				extra: true,
				default: true,
				description:
					'Whether they may open every site, including future ones. Turn off to limit them to the sites below',
			},
			{
				name: 'site_ids',
				extra: true,
				label: 'Sites',
				type: 'multiOptions',
				loader: 'getSites',
				description: 'The sites they may open. Only used when All Sites is off',
			},
		],
	},

	// Site audits
	siteOnly(
		'siteAudit',
		'run',
		'Run',
		'site_audit_run',
		'Start an SEO audit of a site now',
		'Run a site audit',
	),
	{
		resource: 'siteAudit',
		value: 'get',
		name: 'Get',
		action: 'Get a site audit',
		description: 'Get the latest audit of a site, or a specific one',
		call: 'site_audit_get',
		collection: ADDITIONAL,
		fields: [SITE, { name: 'audit_id', extra: true, label: 'Audit ID' }],
	},
	{
		resource: 'siteAudit',
		value: 'getLatest',
		name: 'Get Latest Finished',
		action: 'Get the latest finished site audit',
		description:
			'Get the latest finished SEO audit of a site: its score, the pages crawled and the issues found and fixed',
		call: 'site_audit_history',
		fixed: { status: 'complete', per_page: 1 },
		special: 'firstOnly',
		fields: [SITE],
	},
	{
		resource: 'siteAudit',
		value: 'getMany',
		name: 'Get Many',
		action: 'Get many site audits',
		description: 'List the audits of a site, newest first',
		call: 'site_audit_history',
		list: true,
		collection: FILTERS,
		fields: [SITE, { name: 'status', extra: true }],
	},

	// Experiments
	{
		resource: 'experiment',
		value: 'getMany',
		name: 'Get Many',
		action: 'Get many experiments',
		description: 'List the experiments of a site with their status',
		call: 'experiments_list',
		list: true,
		special: 'experimentFind',
		collection: FILTERS,
		fields: [
			SITE,
			{
				name: 'name',
				extra: true,
				type: 'string',
				description: 'Part of the experiment name, not case sensitive',
			},
			{ name: 'status', extra: true },
			{ name: 'kind', extra: true },
		],
	},
	{
		resource: 'experiment',
		value: 'get',
		name: 'Get',
		action: 'Get an experiment',
		description: 'Get one experiment with its variants and results',
		call: 'experiments_get',
		collection: OPTIONS,
		fields: [
			SITE,
			EXPERIMENT_ID,
			{ name: 'split', extra: true, label: 'Split Results By' },
			{ name: 'humans_only', extra: true },
		],
	},
	{
		resource: 'experiment',
		value: 'start',
		name: 'Start',
		action: 'Start an experiment',
		description: 'Start an A/B or split URL experiment',
		call: 'experiments_start',
		fields: [SITE, EXPERIMENT_ID],
	},
	{
		resource: 'experiment',
		value: 'pause',
		name: 'Pause',
		action: 'Pause an experiment',
		description: 'Pause an experiment',
		call: 'experiments_pause',
		fields: [SITE, EXPERIMENT_ID],
	},
	{
		resource: 'experiment',
		value: 'end',
		name: 'End',
		action: 'End an experiment',
		description: 'End an experiment, with or without a winner',
		call: 'experiments_end',
		fields: [SITE, EXPERIMENT_ID],
	},

	// Testimonials
	{
		resource: 'testimonial',
		value: 'create',
		name: 'Create',
		action: 'Create a testimonial',
		description:
			"Add a text testimonial, for example from a review, a support chat or a survey reply. It counts toward the plan's monthly testimonials.",
		call: 'testimonials_create',
		fixed: { kind: 'text' },
		collection: ADDITIONAL,
		fields: [
			SITE,
			{
				name: 'body',
				label: 'Text',
				required: true,
				type: 'string',
				description: 'The words, up to 10,000 characters',
			},
			{ name: 'person_name', required: true, description: 'Who gave it' },
			{ name: 'person_email', extra: true },
			{ name: 'person_title', extra: true, label: 'Person Job Title' },
			{ name: 'person_company', extra: true },
			{ name: 'person_company_url', extra: true, label: 'Person Company URL' },
			{ name: 'person_social_url', extra: true, label: 'Person Social URL' },
			{
				name: 'rating',
				extra: true,
				choices: [
					['1', '1 Star'],
					['2', '2 Stars'],
					['3', '3 Stars'],
					['4', '4 Stars'],
					['5', '5 Stars'],
				],
				default: '5',
				description: 'The stars, 1 to 5. Leave it out for no rating',
			},
			{ name: 'title', extra: true },
			{ name: 'highlight', extra: true },
			{
				name: 'received_at',
				extra: true,
				type: 'dateTime',
				format: 'iso',
				description: 'When it was given. Defaults to now',
			},
			{ name: 'source_name', extra: true },
			{ name: 'source_url', extra: true, label: 'Source URL' },
			{ name: 'language', extra: true },
			{ name: 'status', extra: true },
			{
				name: 'tags',
				extra: true,
				description:
					'Tag names or IDs, separated by commas. A name that does not exist yet is created',
			},
			{
				name: 'collection_ids',
				extra: true,
				label: 'Collections',
				type: 'multiOptions',
				loader: 'getTestimonialCollections',
				dependsOn: ['siteId'],
				description: 'Manual collections to add it to',
			},
			{
				name: 'properties',
				extra: true,
				type: 'json',
				description:
					'Custom property values by key, as set up in the testimonial settings of the site. For example {"plan":"pro"}',
			},
			{ name: 'pinned', extra: true },
			{
				name: 'external_id',
				extra: true,
				label: 'External ID',
				description:
					'Your own ID for it, such as the review or ticket ID. Sending the same one again returns the testimonial already stored instead of a copy',
			},
			{ name: 'allow_duplicate', extra: true },
		],
	},
	{
		resource: 'testimonial',
		value: 'get',
		name: 'Get',
		action: 'Get a testimonial',
		description:
			'Get one testimonial with everything about it, such as the person, the media and the tags',
		call: 'testimonials_get',
		fields: [SITE, TESTIMONIAL_ID],
	},
	{
		resource: 'testimonial',
		value: 'getMany',
		name: 'Get Many',
		action: 'Get many testimonials',
		description:
			'Find testimonials of a site by their words, status, rating, tag or person, newest first',
		call: 'testimonials_list',
		list: true,
		special: 'testimonialFind',
		collection: FILTERS,
		fields: [
			SITE,
			{
				name: 'q',
				extra: true,
				label: 'Search',
				description: 'Words in the testimonial or the name or company of the person',
			},
			{
				name: 'status',
				extra: true,
				type: 'multiOptions',
				choices: [
					['pending', 'Pending'],
					['approved', 'Approved'],
					['rejected', 'Rejected'],
				],
			},
			{
				name: 'min_rating',
				extra: true,
				label: 'Minimum Rating',
				type: 'options',
				choices: [
					['1', '1 Star'],
					['2', '2 Stars'],
					['3', '3 Stars'],
					['4', '4 Stars'],
					['5', '5 Stars'],
				],
				default: '4',
				description: 'Only testimonials with at least this many stars',
			},
			{ name: 'kind', extra: true, type: 'multiOptions' },
			{
				name: 'tag_id',
				extra: true,
				label: 'Tags',
				type: 'multiOptions',
				loader: 'getTestimonialTags',
				dependsOn: ['siteId'],
				description: 'Only testimonials with one of these tags',
			},
			{
				name: 'form_id',
				extra: true,
				label: 'Forms',
				type: 'multiOptions',
				loader: 'getTestimonialForms',
				dependsOn: ['siteId'],
				description: 'Only testimonials that came through one of these forms',
			},
			{
				name: 'person_id',
				extra: true,
				label: 'Person IDs',
				description: 'Person IDs (per_...), separated by commas',
			},
			{ name: 'received_from', extra: true, type: 'dateTime', format: 'day' },
			{ name: 'received_to', extra: true, type: 'dateTime', format: 'day' },
			{ name: 'pinned', extra: true },
			{ name: 'sort', extra: true, choices: SORT_LABELS, default: 'received_desc' },
		],
	},
	{
		resource: 'testimonial',
		value: 'update',
		name: 'Update',
		action: 'Update a testimonial',
		description:
			'Change the words, rating, tags, custom properties and more of a testimonial. Only the fields filled in are changed.',
		call: 'testimonials_update',
		collection: ADDITIONAL,
		fields: [
			SITE,
			TESTIMONIAL_ID,
			{ name: 'body', extra: true, label: 'Text' },
			{ name: 'title', extra: true },
			{
				name: 'rating',
				extra: true,
				choices: [
					['1', '1 Star'],
					['2', '2 Stars'],
					['3', '3 Stars'],
					['4', '4 Stars'],
					['5', '5 Stars'],
				],
				default: '5',
			},
			{ name: 'highlight', extra: true },
			{ name: 'language', extra: true },
			{ name: 'received_at', extra: true, type: 'dateTime', format: 'iso' },
			{ name: 'source_name', extra: true },
			{ name: 'source_url', extra: true, label: 'Source URL' },
			{
				name: 'properties',
				extra: true,
				type: 'json',
				description: 'Custom property values to change, by key. An empty value clears one',
			},
			{
				name: 'add_tags',
				extra: true,
				description:
					'Tag names or IDs to add, separated by commas. A name that does not exist yet is created',
			},
			{
				name: 'remove_tags',
				extra: true,
				description: 'Tag names or IDs to remove, separated by commas',
			},
			{ name: 'edit_note', extra: true },
			{ name: 'permalink', extra: true, label: 'Public Page' },
		],
	},
	MODERATION('approve', 'Approve', 'testimonials_approve', 'Approve a testimonial'),
	MODERATION('reject', 'Reject', 'testimonials_reject', 'Reject a testimonial'),
	MODERATION(
		'returnToPending',
		'Return to Pending',
		'testimonials_pend',
		'Return a testimonial to pending',
	),
	MODERATION('pin', 'Pin', 'testimonials_pin', 'Pin a testimonial so it is shown first', {
		pinned: true,
	}),
	MODERATION('unpin', 'Unpin', 'testimonials_pin', 'Unpin a testimonial', { pinned: false }),

	// Testimonial people
	{
		resource: 'testimonialPerson',
		value: 'create',
		name: 'Create',
		action: 'Create a testimonial person',
		description: 'Add a person (a customer who gives testimonials) to a site',
		call: 'testimonial_people_create',
		collection: ADDITIONAL,
		fields: [
			SITE,
			{ name: 'name', required: true },
			{ name: 'email', extra: true },
			{ name: 'title', extra: true, label: 'Job Title' },
			{ name: 'company', extra: true },
			{ name: 'company_url', extra: true, label: 'Company URL' },
			{ name: 'social_url', extra: true, label: 'Social URL' },
		],
	},
	{
		resource: 'testimonialPerson',
		value: 'getMany',
		name: 'Get Many',
		action: 'Get many testimonial people',
		description: 'Find the people of a site who give testimonials, by email or name',
		call: 'testimonial_people_list',
		list: true,
		collection: FILTERS,
		fields: [
			SITE,
			{ name: 'query', extra: true, label: 'Email or Name' },
			{ name: 'company', extra: true },
			{ name: 'has_email', extra: true, label: 'Has Email' },
		],
	},

	// Testimonial requests
	{
		resource: 'testimonialRequest',
		value: 'addRecipient',
		name: 'Add Recipient',
		action: 'Ask a person for a testimonial',
		description:
			'Add a person to a testimonial request. In a running request they get the first email at once, in a draft they wait for it to be sent. Request emails need the Business plan and a connected email provider',
		call: 'testimonial_request_recipients_create',
		special: 'recipient',
		collection: ADDITIONAL,
		fields: [
			SITE,
			{
				name: 'request_id',
				label: 'Request',
				required: true,
				loader: 'getTestimonialRequests',
				dependsOn: ['siteId'],
				description: 'The request',
			},
			{
				name: 'email',
				type: 'string',
				required: true,
				label: 'Email',
				description: 'The address the request email goes to',
			},
			{
				name: 'name',
				extra: true,
				type: 'string',
				label: 'Name',
				description: 'Used in the email greeting and to fill in the form',
			},
			{ name: 'company', extra: true, type: 'string', label: 'Company' },
			{ name: 'title', extra: true, type: 'string', label: 'Job Title' },
			{
				name: 'properties',
				extra: true,
				type: 'json',
				label: 'Properties',
				description:
					'Custom property values for the testimonial, by key, as set up in the testimonial settings of the site',
			},
		],
	},
	{
		resource: 'testimonialRequest',
		value: 'getMany',
		name: 'Get Many',
		action: 'Get many testimonial requests',
		description: 'List the testimonial requests of a site',
		call: 'testimonial_requests_list',
		list: true,
		collection: FILTERS,
		fields: [
			SITE,
			{ name: 'q', extra: true, label: 'Search' },
			{ name: 'status', extra: true },
			{ name: 'period', extra: true },
		],
	},

	// Custom API call
	{
		resource: 'apiRequest',
		value: 'send',
		name: 'Send',
		action: 'Send a custom API call',
		description:
			'Call any endpoint of the Privatus Analytics API with this credential, for what the other operations do not cover',
		call: '',
		special: 'apiRequest',
		collection: ADDITIONAL,
		fields: [
			{
				name: 'method',
				label: 'HTTP Method',
				required: true,
				choices: [
					['GET', 'GET'],
					['PATCH', 'PATCH'],
					['POST', 'POST'],
					['PUT', 'PUT'],
				],
				default: 'GET',
			},
			{
				name: 'path',
				label: 'URL Path',
				type: 'string',
				required: true,
				placeholder: '/sites/pa_7Q2K9XH3AB/stats/aggregate.json',
				description:
					'The path of the endpoint. .json is added when missing. Every endpoint is listed at https://privatusanalytics.com/docs/api',
			},
			{
				name: 'query',
				extra: true,
				type: 'json',
				label: 'Query Parameters',
				description: 'A JSON object, like {"period":"30d"}',
			},
			{
				name: 'body',
				extra: true,
				type: 'json',
				label: 'Body',
				description: 'A JSON object, for POST, PATCH and PUT',
			},
		],
	},
];
