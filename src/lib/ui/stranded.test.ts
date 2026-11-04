import { describe, expect, it } from 'bun:test';
import { strandedPlace } from './stranded';

/*
 * An address that leads nowhere still lands inside Stella (docs/design/screens/across-screens.md):
 * the error screen names what was asked for and offers the way to its list. Pure, so which
 * address gets which way back is stated here.
 */

describe('strandedPlace', () => {
	it('sends a missing person, their journal or brief back to the people', () => {
		expect(strandedPlace(404, '/contacts/does-not-exist')).toBe('person');
		expect(strandedPlace(404, '/contacts/gone/journal')).toBe('person');
		expect(strandedPlace(404, '/contacts/gone/brief')).toBe('person');
	});

	it('sends a missing circle back to the circles', () => {
		expect(strandedPlace(404, '/circles/gone')).toBe('circle');
		expect(strandedPlace(404, '/circles/gone/arrange')).toBe('circle');
	});

	it('tells the Immich address apart from any other setting', () => {
		expect(strandedPlace(404, '/settings/immich')).toBe('immich');
		expect(strandedPlace(404, '/settings/immich/')).toBe('immich');
		expect(strandedPlace(404, '/settings/nextcloud-conflicts')).toBe('settings');
	});

	it('sends anything else that is not there home', () => {
		expect(strandedPlace(404, '/')).toBe('elsewhere');
		expect(strandedPlace(404, '/graph')).toBe('elsewhere');
		// Only the address the list lives under, not a word that starts the same.
		expect(strandedPlace(404, '/contactsx/1')).toBe('elsewhere');
		expect(strandedPlace(404, '/settingsx')).toBe('elsewhere');
	});

	it('reads any other failure as one, wherever it happened', () => {
		expect(strandedPlace(500, '/contacts/anna')).toBe('failed');
		expect(strandedPlace(403, '/settings/export')).toBe('failed');
		expect(strandedPlace(400, '/')).toBe('failed');
	});
});
