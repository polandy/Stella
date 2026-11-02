import { describe, expect, it } from 'bun:test';
import type { Viewer } from '../access/visibility';
import { createImmichMediaSigner } from '../domain/immich/signed-media';
import { testLibrary } from '../domain/immich/test-library';
import { createFakeImmichGateway } from './fake-gateway';
import { answerImmichMemories } from './memories-route';
import { IMMICH_MEDIA_CACHE_CONTROL } from './routes';

/*
 * What `/immich/on-this-day` answers (docs/02 §2.12.1): every earlier year's photos of a day, or a
 * further page of one year. Every refusal is checked against a gateway that records its calls, so
 * "refused" also means "Immich was never asked".
 */

const viewer: Viewer = { id: 'u-anna', householdId: 'h1' };
const signer = createImmichMediaSigner({
	secret: 'test-secret',
	clock: { now: () => 1_700_000_000_000 }
});

function setup() {
	// Bert's photos run a day apart back from 1 September 2026, past three of its earlier years.
	const gateway = createFakeImmichGateway(testLibrary());
	return { gateway, deps: { gateway, signer, publicUrl: 'https://immich.example.test' } };
}

const query = (day: string | null, year: string | null = null, from: string | null = null) => ({
	day,
	year,
	from
});

async function bodyOf(answer: Response | { status: number }) {
	if (!(answer instanceof Response)) throw new Error(`refused with ${answer.status}`);
	expect(answer.headers.get('cache-control')).toBe(IMMICH_MEDIA_CACHE_CONTROL);
	return answer.json();
}

describe('answerImmichMemories', () => {
	it('answers every earlier year of the day as JSON that no cache keeps', async () => {
		const { deps } = setup();
		const body = await bodyOf(await answerImmichMemories(deps, viewer, query('2026-09-01')));
		expect(body.state).toBe('years');
		expect(body.years.map((year: { year: number }) => year.year)).toEqual([2025, 2024, 2023]);
	});

	it('answers a further page of one year', async () => {
		const { deps } = setup();
		const body = await bodyOf(
			await answerImmichMemories(deps, viewer, query('2026-09-01', '2025', '0'))
		);
		expect([body.state, body.photos.length]).toEqual(['photos', 1]);
	});

	it('refuses a visitor who is not signed in, an instance without Immich, and a query that is none', async () => {
		const { deps, gateway } = setup();
		expect(await answerImmichMemories(deps, null, query('2026-09-01'))).toEqual({
			status: 401,
			message: 'errors.notSignedIn'
		});
		expect(await answerImmichMemories(null, viewer, query('2026-09-01'))).toEqual({
			status: 404,
			message: 'errors.notFound'
		});
		for (const refused of [
			query(null),
			query('2026-02-30'),
			query('01.09.2026'),
			query('2026-09-01', '2025'),
			query('2026-09-01', null, '12'),
			query('2026-09-01', 'last', '12'),
			query('2026-09-01', '2025', '-12'),
			query('2026-09-01', '2025', '1.5')
		])
			expect(await answerImmichMemories(deps, viewer, refused)).toEqual({
				status: 404,
				message: 'errors.notFound'
			});
		expect(gateway.calls).toEqual([]);
	});
});
