import { describe, expect, it } from 'bun:test';
import { renameOffer, type NamedKin } from './rename-offer';

/*
 * Correcting a last name (docs/dev/02 §2.2.4.7): after a person's last name is changed, their
 * family who still carry the old one are offered the new one — never anyone with another name,
 * nor a name the household declined for them.
 */

const family: NamedKin[] = [
	{ id: 'peter', name: 'Peter Bruner', lastName: 'Bruner', declined: [] },
	{ id: 'lea', name: 'Lea Bruner', lastName: 'bruner ', declined: [] },
	{ id: 'max', name: 'Max Bruner', lastName: 'Bruner', declined: ['brunner'] },
	{ id: 'anna', name: 'Anna Keller', lastName: 'Keller', declined: [] }
];

describe('renameOffer', () => {
	it('offers the new name to the family still carrying the old one, minus a declined name', () => {
		expect(renameOffer(family, 'Bruner', 'Brunner')).toEqual([
			{ id: 'peter', name: 'Peter Bruner' },
			{ id: 'lea', name: 'Lea Bruner' }
		]);
	});

	it('matches the old name folded, but leaves out who already has the new spelling', () => {
		const accents: NamedKin[] = [
			{ id: 'a', name: 'A', lastName: 'Muller', declined: [] },
			{ id: 'b', name: 'B', lastName: 'Müller', declined: [] }
		];
		expect(renameOffer(accents, 'Muller', 'Müller')).toEqual([{ id: 'a', name: 'A' }]);
	});

	it('offers nothing when the name was given for the first time, taken away or kept', () => {
		expect(renameOffer(family, '', 'Brunner')).toEqual([]);
		expect(renameOffer(family, 'Bruner', ' ')).toEqual([]);
		expect(renameOffer(family, 'Bruner', ' Bruner ')).toEqual([]);
	});
});
