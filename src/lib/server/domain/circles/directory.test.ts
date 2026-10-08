import { describe, expect, it } from 'bun:test';
import { inMemoryCircleDirectory, someCircle } from '../testing';
import { listCircles } from './directory';

/* The circles overview (docs/02 §2.4.2), over the in-memory directory read model. */

describe('listCircles', () => {
	it('lists the circles the viewer may see, by name', async () => {
		const deps = {
			directory: inMemoryCircleDirectory([someCircle('club', 'Club'), someCircle('choir', 'Choir')])
		};
		expect((await listCircles(deps, { id: 'u1', householdId: 'h' })).map((c) => c.name)).toEqual([
			'Choir',
			'Club'
		]);
	});
});
