import type { IDataObject } from 'n8n-workflow';

import { EVENTS } from './events';

/**
 * The delivery envelope is { id, event, created_at, workspace_id, data }.
 * The item a workflow gets is `data` itself, plus:
 *   id           the delivery id (whd_...), unique per delivery
 *   event        the event name
 *   occurred_at  the envelope's created_at
 *   workspace_id
 * An `id` inside data moves to `record_id` (`export_id` for exports) so it is not lost.
 */
export function toItem(envelope: IDataObject): IDataObject {
	const data =
		envelope.data && typeof envelope.data === 'object' && !Array.isArray(envelope.data)
			? { ...(envelope.data as IDataObject) }
			: {};
	const definition = EVENTS.find((event) => event.value === envelope.event);
	if (data.id !== undefined) {
		data[definition?.idKey ?? 'record_id'] = data.id;
		delete data.id;
	}
	return {
		id: envelope.id,
		event: envelope.event,
		occurred_at: envelope.created_at,
		workspace_id: envelope.workspace_id,
		...data,
	};
}

/** The site a payload belongs to (uptime payloads keep it on the check). */
export function siteOf(item: IDataObject): string | null {
	const check = item.check as IDataObject | undefined;
	return (item.site_id as string) || (check && (check.site_id as string)) || null;
}

const ratingOf = (item: IDataObject): number => {
	const testimonial = item.testimonial as IDataObject | undefined;
	const rating = testimonial ? testimonial.rating : item.rating;
	return Number(rating) || 0;
};

export interface TriggerFilters {
	siteId?: string;
	alertId?: string;
	formId?: string;
	requestId?: string;
	minRating?: number | string;
}

/**
 * True when a delivery passes the filters of the trigger. A filter only
 * applies to the events that carry that field, so one trigger can listen to
 * several kinds of events.
 */
export function matchesFilters(item: IDataObject, filters: TriggerFilters): boolean {
	const definition = EVENTS.find((event) => event.value === item.event);
	if (!definition) return false;
	if (definition.site && filters.siteId && siteOf(item) !== filters.siteId) return false;
	if (
		definition.filters.includes('alertId') &&
		filters.alertId &&
		item.alert_id !== filters.alertId
	) {
		return false;
	}
	if (definition.filters.includes('formId') && filters.formId && item.form_id !== filters.formId) {
		return false;
	}
	if (
		definition.filters.includes('requestId') &&
		filters.requestId &&
		item.request_id !== filters.requestId
	) {
		return false;
	}
	if (
		definition.filters.includes('minRating') &&
		filters.minRating &&
		ratingOf(item) < Number(filters.minRating)
	) {
		return false;
	}
	return true;
}
