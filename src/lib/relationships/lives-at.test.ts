import { describe, expect, it } from 'bun:test';
import { livesAtOffer, type LivesAtInput } from './lives-at';

/*
 * The new child's or partner's address (docs/02 §2.4, *Lives at …*): created from the
 * relationship form of someone with one address, they are offered that address — the home
 * itself, so a move later changes it once for everyone.
 */

const PARENT_OF = { type: { key: 'parent_child' }, side: 'forward' as const };
const CHILD_OF = { type: { key: 'parent_child' }, side: 'reverse' as const };
const PARTNER_OF = { type: { key: 'partner' }, side: 'forward' as const };
const FRIEND_OF = { type: { key: 'friend' }, side: 'forward' as const };

const HOME = {
	id: 'h-1',
	value: 'Lindenweg 4\n8800 Thalwil',
	livesWith: [{ id: 'c-peter', displayName: 'Peter Brunner' }]
};

const input = (over: Partial<LivesAtInput> = {}): LivesAtInput => ({
	choice: PARENT_OF,
	pickedIds: ['c-mia'],
	createdIds: ['c-mia'],
	homes: [HOME],
	fields: [],
	...over
});

describe('offering the address to someone just created', () => {
	it('offers the one home to a new child, naming everyone who lives there', () => {
		expect(livesAtOffer(input())).toEqual({
			address: 'home:h-1',
			line: 'Lindenweg 4, 8800 Thalwil',
			livesWith: HOME.livesWith,
			newIds: ['c-mia']
		});
	});

	it('offers it to a new partner', () => {
		expect(livesAtOffer(input({ choice: PARTNER_OF }))?.newIds).toEqual(['c-mia']);
	});

	it('offers a single own address too, which becomes a home on the save', () => {
		const offer = livesAtOffer(
			input({ homes: [], fields: [{ id: 'f-1', kind: 'address', value: 'Seeweg 2' }] })
		);
		expect(offer).toEqual({
			address: 'field:f-1',
			line: 'Seeweg 2',
			livesWith: [],
			newIds: ['c-mia']
		});
	});

	it('takes every new person picked, and only them', () => {
		const offer = livesAtOffer(
			input({ pickedIds: ['c-mia', 'c-tim', 'c-noah'], createdIds: ['c-mia', 'c-noah', 'c-gone'] })
		);
		expect(offer?.newIds).toEqual(['c-mia', 'c-noah']);
	});
});

describe('when there is nothing to offer', () => {
	it('stays away from someone already in Stella: they may well live elsewhere', () => {
		expect(livesAtOffer(input({ createdIds: [] }))).toBeNull();
	});

	it('stays away from the other relationships: a parent, a friend', () => {
		expect(livesAtOffer(input({ choice: CHILD_OF }))).toBeNull();
		expect(livesAtOffer(input({ choice: FRIEND_OF }))).toBeNull();
		expect(livesAtOffer(input({ choice: null }))).toBeNull();
	});

	it('does not guess between two addresses, nor offer none', () => {
		const second = { id: 'f-1', kind: 'address', value: 'Seeweg 2' };
		expect(livesAtOffer(input({ fields: [second] }))).toBeNull();
		expect(livesAtOffer(input({ homes: [] }))).toBeNull();
	});

	it('counts only addresses among the fields', () => {
		const phone = { id: 'f-2', kind: 'phone', value: '+41 79' };
		expect(livesAtOffer(input({ fields: [phone] }))?.address).toBe('home:h-1');
	});
});
