import { createHmac, timingSafeEqual } from 'crypto';

/** Seconds a signature stays valid. The webhooks documentation asks for five minutes. */
export const SIGNATURE_TOLERANCE = 300;

/**
 * Checks the signature of a webhook delivery
 * (https://privatusanalytics.com/docs/api/webhooks).
 *
 * The header `Privatus-Signature` is `t=<unix time>,v1=<hex>`, where v1 is the
 * HMAC-SHA256 of "<t>.<raw body>" keyed with the signing secret of the endpoint
 * (returned when the webhook was created). True only for a matching signature
 * that is at most five minutes old. A delivery with no signature, no secret or
 * no raw body cannot be checked, so it is refused.
 */
export function verifySignature(
	secret: unknown,
	rawBody: string | Uint8Array | undefined,
	header: unknown,
	nowMs: number = Date.now(),
): boolean {
	if (typeof secret !== 'string' || !secret || typeof header !== 'string') return false;
	if (rawBody === undefined || rawBody === null) return false;

	const parts: Record<string, string> = {};
	header.split(',').forEach((part) => {
		const at = part.indexOf('=');
		if (at > 0) parts[part.slice(0, at).trim()] = part.slice(at + 1).trim();
	});
	if (!/^\d{1,12}$/.test(parts.t ?? '') || !/^[0-9a-f]{64}$/.test(parts.v1 ?? '')) return false;
	if (Math.abs(nowMs / 1000 - Number(parts.t)) > SIGNATURE_TOLERANCE) return false;

	const body = typeof rawBody === 'string' ? rawBody : Buffer.from(rawBody).toString('utf8');
	const expected = createHmac('sha256', secret).update(`${parts.t}.${body}`).digest('hex');
	// Both are 64 hex characters here, so the buffers have the same length.
	return timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
}
