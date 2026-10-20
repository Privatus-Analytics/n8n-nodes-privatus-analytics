import type { IDataObject, ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';

import { listAll } from './client';

interface LoaderSpec {
	operationId: string;
	/** The loader needs the chosen site first. */
	needsSite?: boolean;
	params?: IDataObject;
	name: (record: IDataObject) => string;
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

const siteName = (site: IDataObject): string =>
	site.name && site.name !== site.domain
		? `${str(site.name)} (${str(site.domain)})`
		: str(site.domain);

const withStatus = (record: IDataObject): string => `${str(record.name)} (${str(record.status)})`;

const LOADERS: Record<string, LoaderSpec> = {
	getSites: { operationId: 'sites_list', name: siteName },
	getAlerts: { operationId: 'alerts_list', name: (a) => str(a.name) },
	getUptimeChecks: { operationId: 'uptime_checks_list', needsSite: true, name: withStatus },
	getExperiments: { operationId: 'experiments_list', needsSite: true, name: withStatus },
	getStatusPages: { operationId: 'status_pages_list', name: (p) => str(p.name) },
	getSegments: { operationId: 'segments_list', needsSite: true, name: (s) => str(s.name) },
	getTestimonialForms: {
		operationId: 'testimonial_forms_list',
		needsSite: true,
		name: (f) => str(f.name),
	},
	getTestimonialRequests: {
		operationId: 'testimonial_requests_list',
		needsSite: true,
		name: withStatus,
	},
	getTestimonialTags: {
		operationId: 'testimonial_tags_list',
		needsSite: true,
		name: (t) => str(t.name),
	},
	getTestimonialCollections: {
		operationId: 'testimonial_collections_list',
		needsSite: true,
		name: (c) => str(c.name),
	},
	getTestimonials: {
		operationId: 'testimonials_list',
		needsSite: true,
		params: { sort: 'added_desc' },
		name: (t) => {
			const person = t.person as IDataObject | undefined;
			const who = str(person?.name) || 'Unknown';
			const words = str(t.body || t.title)
				.replace(/\s+/g, ' ')
				.trim();
			return `${who}: ${words.length > 60 ? `${words.slice(0, 57)}...` : words} (${str(t.status)})`;
		},
	},
};

/** The dropdown methods of the nodes, by name. */
export const loadOptions: Record<
	string,
	(this: ILoadOptionsFunctions) => Promise<INodePropertyOptions[]>
> = Object.fromEntries(
	Object.entries(LOADERS).map(([method, spec]) => [
		method,
		async function (this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
			const values: IDataObject = { ...(spec.params ?? {}) };
			if (spec.needsSite) {
				// The site can be a value or an expression that is not resolved yet.
				// Operations keep it in siteId, the trigger in its Filters collection.
				const siteId =
					this.getCurrentNodeParameter('siteId') ?? this.getCurrentNodeParameter('filters.siteId');
				if (typeof siteId !== 'string' || !/^pa_[A-Za-z0-9]+$/.test(siteId)) return [];
				values.site_id = siteId;
			}
			const records = await listAll(this, spec.operationId, values, 300);
			return records
				.filter((record) => typeof record.id === 'string')
				.map((record) => ({ name: spec.name(record), value: record.id as string }));
		},
	]),
);
