import { describe, expect, it } from 'bun:test';
import { foundByFormerName } from './former-name';

/*
 * Whether a person was found by their former name rather than by the name they are shown by
 * (docs/02 §2.9): then a result says *Franziska Abab (formerly Widmer)*, so finding someone
 * under a name they no longer carry is not a puzzle. Shared by every place that finds people.
 */

const franziska = { displayName: 'Franziska Abab', formerName: 'Widmer' };

describe('foundByFormerName', () => {
	it('gives the former name when the query matches it and not the shown name', () => {
		expect(foundByFormerName(franziska, 'widm')).toBe('Widmer');
	});

	it('folds case and accents as the rest of the matching does', () => {
		expect(foundByFormerName({ displayName: 'Lea Abab', formerName: 'Müller' }, 'MULLER')).toBe('Müller');
	});

	it('says nothing when the shown name matches too', () => {
		expect(foundByFormerName({ displayName: 'Anna Widmer-Abab', formerName: 'Widmer' }, 'widmer')).toBeNull();
		expect(foundByFormerName(franziska, 'franz')).toBeNull();
	});

	it('reads each word of the query, so a full former name still says so', () => {
		expect(foundByFormerName(franziska, 'Franziska Widmer')).toBe('Widmer');
	});

	it('says nothing without a former name or a query', () => {
		expect(foundByFormerName({ displayName: 'Lea' }, 'lea')).toBeNull();
		expect(foundByFormerName(franziska, '  ')).toBeNull();
	});
});
