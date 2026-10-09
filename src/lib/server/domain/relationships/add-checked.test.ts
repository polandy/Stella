import { describe, expect, it } from 'bun:test';
import { SelfRelationshipError } from '../../../relationships/endpoints';
import { encodeRelationshipChoice } from '../../../relationships/type-options';
import type { Contact } from '../contacts/contacts';
import { ContactGoneError } from '../contacts/require-visible';
import {
	DuplicateRelationshipError,
	type NewRelationship,
	type RelationshipType
} from './relationships';
import {
	addRelationshipChecked,
	UnknownRelationshipTypeError,
	type AddCheckedDeps
} from './add-checked';

import { inMemoryKinshipGraph, inMemoryRelationshipTies } from '../testing';
/*
 * Linking two people from one of their pages (docs/02 §2.4) as one use-case, so a link kept on
 * a phone (docs/02 §2.18.2) is judged exactly like one entered online:
 * both people must still be visible, the type must still exist, and every guardrail — no
 * duplicate, no contradiction, no excluded tie — answers with a reason, never a crash that
 * the phone would retry for ever.
 */

const parentChild: RelationshipType = {
	id: 'parent_child',
	householdId: null,
	key: 'parent_child',
	forwardLabel: 'Parent of',
	reverseLabel: 'Child of',
	category: 'family',
	symmetric: false,
	sortOrder: 0
};
const author = { userId: 'u1', householdId: 'h1' };

function fakes(
	opts: { visible?: string[]; exists?: boolean; type?: RelationshipType | null } = {}
) {
	const inserted: NewRelationship[] = [];
	const visible = opts.visible ?? ['anna', 'bert'];
	const deps: AddCheckedDeps = {
		contacts: {
			findByIdVisibleTo: async (_v, id) => (visible.includes(id) ? ({ id } as Contact) : null)
		},
		relationships: {
			exists: async () => opts.exists ?? false,
			insert: async (r) => void inserted.push(r)
		},
		kinship: inMemoryKinshipGraph(),
		ties: inMemoryRelationshipTies(),
		types: { getType: async () => (opts.type === undefined ? parentChild : opts.type) },
		ids: { next: () => 'rel-1' },
		clock: { now: () => 1 }
	};
	return { deps, inserted };
}

const link = (side: 'forward' | 'reverse' = 'reverse') => ({
	contactId: 'anna',
	targetId: 'bert',
	typeChoice: encodeRelationshipChoice('parent_child', side),
	description: null,
	sinceDate: null,
	status: null
});

describe('addRelationshipChecked', () => {
	it('stores the link the way round the page said it: "Anna is a child of Bert"', async () => {
		const f = fakes();
		expect(await addRelationshipChecked(f.deps, author, link('reverse'))).toEqual({
			relationshipId: 'rel-1'
		});
		expect(f.inserted[0]).toMatchObject({
			fromContactId: 'bert',
			toContactId: 'anna',
			typeId: 'parent_child'
		});
	});

	it('refuses with a reason when either person, or the type, is gone', async () => {
		await expect(
			addRelationshipChecked(fakes({ visible: ['anna'] }).deps, author, link())
		).rejects.toBeInstanceOf(ContactGoneError);
		await expect(
			addRelationshipChecked(fakes({ visible: ['bert'] }).deps, author, link())
		).rejects.toBeInstanceOf(ContactGoneError);
		await expect(
			addRelationshipChecked(fakes({ type: null }).deps, author, link())
		).rejects.toBeInstanceOf(UnknownRelationshipTypeError);
		await expect(
			addRelationshipChecked(fakes().deps, author, { ...link(), typeChoice: 'garbage' })
		).rejects.toBeInstanceOf(UnknownRelationshipTypeError);
	});

	it('keeps the guardrails: a link that already exists is refused, not stored twice', async () => {
		const f = fakes({ exists: true });
		await expect(addRelationshipChecked(f.deps, author, link())).rejects.toBeInstanceOf(
			DuplicateRelationshipError
		);
		expect(f.inserted).toHaveLength(0);
	});

	/* A sentence, not a crash: a link kept on a phone is refused, never retried for ever. */
	it('refuses a link from a person to themselves with a reason, and stores nothing', async () => {
		const f = fakes();
		await expect(
			addRelationshipChecked(f.deps, author, { ...link(), targetId: 'anna' })
		).rejects.toBeInstanceOf(SelfRelationshipError);
		expect(f.inserted).toHaveLength(0);

		await addRelationshipChecked(f.deps, author, link());
		expect(f.inserted).toHaveLength(1);
	});
});
