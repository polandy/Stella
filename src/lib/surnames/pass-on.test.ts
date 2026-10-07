import { describe, expect, it } from 'bun:test';
import { passOnOffer, type PassOnMap } from './pass-on';

/*
 * Passing a last name on (docs/02 §2.2.4.5): after someone is given a name, their
 * children and siblings who have none are offered it — one generation at a time, only ever
 * filling a blank, and never a name the household declined for them.
 */

const map: PassOnMap = {
	peter: [
		{ id: 'lea', name: 'Lea', declined: [] },
		{ id: 'max', name: 'Max', declined: ['brunner'] }
	],
	lea: [
		{ id: 'max', name: 'Max', declined: ['brunner'] },
		{ id: 'kid', name: 'Kid', declined: [] }
	]
};

describe('passOnOffer', () => {
	it('offers the children and siblings with no name yet, minus a declined name', () => {
		expect(passOnOffer(map, ['peter'], 'Brunner', new Set())).toEqual([{ id: 'lea', name: 'Lea' }]);
		expect(passOnOffer(map, ['peter'], 'Weber', new Set()).map((p) => p.id)).toEqual([
			'lea',
			'max'
		]);
	});

	it('leaves out the people of the batch itself and anyone named during this visit', () => {
		expect(passOnOffer(map, ['peter', 'lea'], 'Weber', new Set())).toEqual([
			{ id: 'max', name: 'Max' },
			{ id: 'kid', name: 'Kid' }
		]);
		expect(passOnOffer(map, ['lea'], 'Weber', new Set(['kid']))).toEqual([
			{ id: 'max', name: 'Max' }
		]);
	});

	it('offers nothing for someone with no such relatives', () => {
		expect(passOnOffer(map, ['nobody'], 'Brunner', new Set())).toEqual([]);
	});
});
