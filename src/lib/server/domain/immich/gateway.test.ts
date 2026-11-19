import { describe, expect, it } from 'bun:test';
import { isImmichId } from './gateway';

const ANNA = '6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b';

describe('isImmichId', () => {
	it('accepts the UUIDs Immich gives its people', () => {
		expect(isImmichId(ANNA)).toBe(true);
		expect(isImmichId(ANNA.toUpperCase())).toBe(true);
	});

	it('refuses anything that could change the path it is put into', () => {
		for (const raw of [
			'',
			'..',
			'../users/me',
			`${ANNA}/thumbnail`,
			`${ANNA}?x=1`,
			'anna',
			42,
			null
		]) {
			expect(isImmichId(raw)).toBe(false);
		}
	});
});
