import { describe, expect, it } from 'bun:test';
import { routeEvent } from '$lib/server/testing';
import type { HealthReport } from '$lib/server/services/health';
import { GET } from './+server';

/* `/healthz` (docs/dev/07 §7.5.1): 200 only while the database reads and writes, 503 otherwise. */

async function probe(report: HealthReport) {
	const response = await GET(routeEvent({ services: { health: { check: () => report } } }));
	return { status: response.status, body: await response.json() };
}

describe('GET /healthz', () => {
	it('answers ok with the version and the migrations applied', async () => {
		expect(await probe({ ok: true, version: '0.1.10', migrations: 46 })).toEqual({
			status: 200,
			body: { status: 'ok', version: '0.1.10', migrations: 46 }
		});
	});

	it('answers 503 when the database cannot be used', async () => {
		expect(await probe({ ok: false, version: '0.1.10' })).toEqual({
			status: 503,
			body: { status: 'unavailable', version: '0.1.10' }
		});
	});
});
