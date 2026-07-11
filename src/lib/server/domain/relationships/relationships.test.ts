import { describe, expect, it } from 'bun:test';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import { BUILT_IN_RELATIONSHIP_TYPES } from './built-in-types';
import {
	canonicalEndpoints,
	createRelationship,
	describeRelationshipFor,
	DuplicateRelationshipError,
	type NewRelationship,
	type RelationshipRepository,
	type RelationshipType
} from './relationships';

/*
 * Pure relationship logic (docs/02 §2.4): canonical storage direction (symmetric links are
 * order-independent; self-links are rejected) and perspective-aware label resolution.
 */

const parentChild: RelationshipType = {
	id: 'parent_child',
	key: 'parent_child',
	forwardLabel: 'Parent of',
	reverseLabel: 'Child of',
	category: 'family',
	symmetric: false,
	sortOrder: 0
};

const sibling: RelationshipType = {
	id: 'sibling',
	key: 'sibling',
	forwardLabel: 'Sibling of',
	reverseLabel: 'Sibling of',
	category: 'family',
	symmetric: true,
	sortOrder: 1
};

describe('canonicalEndpoints', () => {
	it('keeps the given order for an asymmetric type', () => {
		expect(canonicalEndpoints('a', 'b', false)).toEqual({ fromContactId: 'a', toContactId: 'b' });
	});

	it('orders endpoints deterministically for a symmetric type', () => {
		expect(canonicalEndpoints('b', 'a', true)).toEqual({ fromContactId: 'a', toContactId: 'b' });
		expect(canonicalEndpoints('a', 'b', true)).toEqual({ fromContactId: 'a', toContactId: 'b' });
	});

	it('rejects a self relationship', () => {
		expect(() => canonicalEndpoints('a', 'a', false)).toThrow();
	});
});

describe('describeRelationshipFor', () => {
	const endpoints = { fromContactId: 'hans', toContactId: 'bettina' };

	it('shows the forward label from the "from" side', () => {
		expect(describeRelationshipFor('hans', endpoints, parentChild)).toEqual({
			otherContactId: 'bettina',
			label: 'Parent of',
			category: 'family'
		});
	});

	it('shows the reverse label from the "to" side', () => {
		expect(describeRelationshipFor('bettina', endpoints, parentChild)).toEqual({
			otherContactId: 'hans',
			label: 'Child of',
			category: 'family'
		});
	});

	it('shows the same label both ways for a symmetric type', () => {
		const e = { fromContactId: 'x', toContactId: 'y' };
		expect(describeRelationshipFor('x', e, sibling).label).toBe('Sibling of');
		expect(describeRelationshipFor('y', e, sibling).label).toBe('Sibling of');
	});

	it('throws when the viewed contact is not an endpoint', () => {
		expect(() => describeRelationshipFor('someone-else', endpoints, parentChild)).toThrow();
	});
});

function fakeRepo(opts: { type?: RelationshipType | null; exists?: boolean }) {
	let inserted: NewRelationship | null = null;
	const repo: RelationshipRepository = {
		listTypes: async () => [],
		getType: async () => opts.type ?? null,
		exists: async () => opts.exists ?? false,
		insert: async (r) => {
			inserted = r;
		},
		listForContactVisibleTo: async () => []
	};
	return {
		repo,
		get inserted() {
			return inserted;
		}
	};
}

const idGen = (v: string): IdGenerator => ({ next: () => v });
const clock: Clock = { now: () => 1_700_000_000_000 };

describe('createRelationship', () => {
	it('inserts a relationship for a valid type, returning the id', async () => {
		const f = fakeRepo({ type: parentChild });
		const id = await createRelationship(
			{ relationships: f.repo, ids: idGen('rel-1'), clock },
			'household-1',
			'user-1',
			{ fromContactId: 'hans', toContactId: 'bettina', typeId: 'parent_child', description: ' met at reunion ' }
		);
		expect(id).toBe('rel-1');
		expect(f.inserted).toMatchObject({
			id: 'rel-1',
			fromContactId: 'hans',
			toContactId: 'bettina',
			typeId: 'parent_child',
			description: 'met at reunion',
			householdId: 'household-1',
			createdBy: 'user-1'
		});
	});

	it('stores symmetric relationships in canonical order', async () => {
		const f = fakeRepo({ type: sibling });
		await createRelationship({ relationships: f.repo, ids: idGen('rel-2'), clock }, 'h', 'u', {
			fromContactId: 'y',
			toContactId: 'x',
			typeId: 'sibling'
		});
		expect(f.inserted).toMatchObject({ fromContactId: 'x', toContactId: 'y' });
	});

	it('rejects an unknown type', async () => {
		const f = fakeRepo({ type: null });
		await expect(
			createRelationship({ relationships: f.repo, ids: idGen('x'), clock }, 'h', 'u', {
				fromContactId: 'a',
				toContactId: 'b',
				typeId: 'nope'
			})
		).rejects.toThrow();
	});

	it('rejects a duplicate relationship', async () => {
		const f = fakeRepo({ type: parentChild, exists: true });
		await expect(
			createRelationship({ relationships: f.repo, ids: idGen('x'), clock }, 'h', 'u', {
				fromContactId: 'a',
				toContactId: 'b',
				typeId: 'parent_child'
			})
		).rejects.toBeInstanceOf(DuplicateRelationshipError);
	});

	it('rejects a self relationship', async () => {
		const f = fakeRepo({ type: parentChild });
		await expect(
			createRelationship({ relationships: f.repo, ids: idGen('x'), clock }, 'h', 'u', {
				fromContactId: 'a',
				toContactId: 'a',
				typeId: 'parent_child'
			})
		).rejects.toThrow();
	});
});

describe('BUILT_IN_RELATIONSHIP_TYPES', () => {
	it('is a non-empty set with unique ids', () => {
		const ids = BUILT_IN_RELATIONSHIP_TYPES.map((t) => t.id);
		expect(ids.length).toBeGreaterThan(0);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('gives symmetric types the same forward and reverse label', () => {
		for (const t of BUILT_IN_RELATIONSHIP_TYPES.filter((t) => t.symmetric)) {
			expect(t.forwardLabel).toBe(t.reverseLabel);
		}
	});
});
