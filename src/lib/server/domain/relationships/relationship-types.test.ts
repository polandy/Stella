import { describe, expect, it } from 'bun:test';
import type { Viewer } from '../../access/visibility';
import { BUILT_IN_RELATIONSHIP_TYPES } from './built-in-types';
import {
	BuiltInRelationshipTypeError,
	CUSTOM_TYPE_SORT_ORDER,
	InvalidRelationshipTypeError,
	RelationshipTypeInUseError,
	createRelationshipType,
	editRelationshipType,
	parseRelationshipTypeFields,
	claimTypeKey,
	removeRelationshipType
} from './relationship-types';
import type { RelationshipType } from './relationships';

/*
 * A household names its own kind of link (docs/02 §2.4). The rules that matter: a machine
 * key is derived rather than typed, it may never be one the kinship engine reasons about,
 * the built-in set is read-only, and a type still in use is not deleted out from under the
 * relationships that point at it.
 */

const viewer: Viewer = { id: 'u1', householdId: 'h1' };

describe('parseRelationshipTypeFields', () => {
	const fields = {
		forwardLabel: '  Godparent of  ',
		reverseLabel: ' Godchild of ',
		category: 'family',
		symmetric: false
	};

	it('trims the labels and keeps the category', () => {
		expect(parseRelationshipTypeFields(fields)).toEqual({
			forwardLabel: 'Godparent of',
			reverseLabel: 'Godchild of',
			category: 'family',
			symmetric: false
		});
	});

	it('gives a symmetric type one label on both sides', () => {
		// "Sings with" reads the same from either end, so a reverse label cannot disagree.
		const parsed = parseRelationshipTypeFields({
			forwardLabel: 'Sings with',
			reverseLabel: 'ignored',
			category: 'social',
			symmetric: true
		});
		expect(parsed.reverseLabel).toBe('Sings with');
	});

	it('rejects a missing forward label', () => {
		expect(() => parseRelationshipTypeFields({ ...fields, forwardLabel: '   ' })).toThrow(
			InvalidRelationshipTypeError
		);
	});

	it('rejects an asymmetric type without a reverse label', () => {
		expect(() => parseRelationshipTypeFields({ ...fields, reverseLabel: '' })).toThrow(
			InvalidRelationshipTypeError
		);
	});

	it('rejects a label longer than the column is meant to hold', () => {
		expect(() =>
			parseRelationshipTypeFields({ ...fields, forwardLabel: 'x'.repeat(200) })
		).toThrow(InvalidRelationshipTypeError);
	});

	it('rejects a category it does not know', () => {
		expect(() => parseRelationshipTypeFields({ ...fields, category: 'imaginary' })).toThrow(
			InvalidRelationshipTypeError
		);
	});
});

describe('claimTypeKey', () => {
	const named = (id: string, key: string, forwardLabel: string) => ({ id, key, forwardLabel });

	it('derives a machine key from the forward label', () => {
		expect(claimTypeKey('Godparent of', [])).toBe('godparent_of');
	});

	it('folds accents and punctuation rather than dropping the word', () => {
		expect(claimTypeKey('Nähtür & Co.', [])).toBe('nahtur_co');
	});

	it('rejects a label with nothing to build a key from', () => {
		expect(() => claimTypeKey('!!! ???', [])).toThrow(InvalidRelationshipTypeError);
	});

	it('rejects a key another type in this household already uses', () => {
		expect(() =>
			claimTypeKey('Godparent of', [named('t1', 'godparent_of', 'Godparent of')])
		).toThrow(InvalidRelationshipTypeError);
	});

	it('rejects a label already on offer, even where the derived keys differ', () => {
		// The built-in `friend` is labelled "Friend of", which slugs to `friend_of`: checking
		// only the key would put a second, indistinguishable "Friend of" in the picker.
		expect(() => claimTypeKey('Friend of', [named('friend', 'friend', 'Friend of')])).toThrow(
			InvalidRelationshipTypeError
		);
		expect(() => claimTypeKey('friend OF', [named('friend', 'friend', 'Friend of')])).toThrow(
			InvalidRelationshipTypeError
		);
	});

	it('lets a type keep its own name while being renamed', () => {
		expect(claimTypeKey('Sings with', [named('t1', 'sings_with', 'Sings with')], 't1')).toBe(
			'sings_with'
		);
	});

	it('rejects a key the kinship engine reasons about', () => {
		// `kinship-graph-read` switches on these keys; a custom type carrying one would be
		// read as a parent, sibling or partner link and silently feed derived kinship.
		for (const label of ['Parent child', 'Sibling', 'Partner', 'Spouse']) {
			expect(() => claimTypeKey(label, [])).toThrow(InvalidRelationshipTypeError);
		}
	});
});

// ── Use-cases over a fake repository ──────────────────────────────────────

interface Recorded {
	inserted: unknown[];
	updated: unknown[];
	deleted: string[];
}

function fakeRepo(opts: { types?: RelationshipType[]; usageCount?: number } = {}) {
	const recorded: Recorded = { inserted: [], updated: [], deleted: [] };
	const types = opts.types ?? [];
	const repo = {
		listTypes: async () => types,
		getType: async (_v: Viewer, id: string) => types.find((t) => t.id === id) ?? null,
		insertType: async (type: unknown) => {
			recorded.inserted.push(type);
		},
		updateTypeVisibleTo: async (_v: Viewer, id: string, fields: unknown) => {
			recorded.updated.push({ id, fields });
			return types.some((t) => t.id === id && t.householdId !== null);
		},
		deleteTypeVisibleTo: async (_v: Viewer, id: string) => {
			recorded.deleted.push(id);
			return types.some((t) => t.id === id && t.householdId !== null);
		},
		countRelationshipsOfType: async () => opts.usageCount ?? 0
	};
	return { recorded, deps: { types: repo, ids: { next: () => 'type-1' } } };
}

const custom: RelationshipType = {
	id: 'type-own',
	householdId: 'h1',
	key: 'sings_with',
	forwardLabel: 'Sings with',
	reverseLabel: 'Sings with',
	category: 'social',
	symmetric: true,
	sortOrder: CUSTOM_TYPE_SORT_ORDER
};

const builtIn = BUILT_IN_RELATIONSHIP_TYPES[0];

describe('createRelationshipType', () => {
	it('stores the type for this household, sorted after the built-in set', async () => {
		const f = fakeRepo({ types: [...BUILT_IN_RELATIONSHIP_TYPES] });
		const id = await createRelationshipType(f.deps, viewer, {
			forwardLabel: 'Godparent of',
			reverseLabel: 'Godchild of',
			category: 'family',
			symmetric: false
		});
		expect(id).toBe('type-1');
		expect(f.recorded.inserted).toEqual([
			{
				id: 'type-1',
				householdId: 'h1',
				key: 'godparent_of',
				forwardLabel: 'Godparent of',
				reverseLabel: 'Godchild of',
				category: 'family',
				symmetric: false,
				sortOrder: CUSTOM_TYPE_SORT_ORDER
			}
		]);
	});

	it('writes nothing when the key collides with a built-in type', async () => {
		const f = fakeRepo({ types: [...BUILT_IN_RELATIONSHIP_TYPES] });
		await expect(
			createRelationshipType(f.deps, viewer, {
				forwardLabel: 'Friend',
				reverseLabel: '',
				category: 'social',
				symmetric: true
			})
		).rejects.toThrow(InvalidRelationshipTypeError);
		expect(f.recorded.inserted).toEqual([]);
	});
});

describe('editRelationshipType', () => {
	it('rewrites the labels of a custom type, keeping its key', async () => {
		const f = fakeRepo({ types: [custom] });
		expect(
			await editRelationshipType(f.deps, viewer, 'type-own', {
				forwardLabel: 'Sings in the choir with',
				reverseLabel: '',
				category: 'social',
				symmetric: true
			})
		).toBe(true);
		expect(f.recorded.updated).toEqual([
			{
				id: 'type-own',
				fields: {
					forwardLabel: 'Sings in the choir with',
					reverseLabel: 'Sings in the choir with',
					category: 'social',
					symmetric: true
				}
			}
		]);
	});

	it('refuses a rename onto a name the household already reads', async () => {
		const f = fakeRepo({ types: [custom, builtIn] });
		await expect(
			editRelationshipType(f.deps, viewer, 'type-own', {
				forwardLabel: builtIn.forwardLabel,
				reverseLabel: builtIn.reverseLabel,
				category: builtIn.category,
				symmetric: builtIn.symmetric
			})
		).rejects.toThrow(InvalidRelationshipTypeError);
		expect(f.recorded.updated).toEqual([]);
	});

	it('refuses to edit a built-in type', async () => {
		const f = fakeRepo({ types: [builtIn] });
		await expect(
			editRelationshipType(f.deps, viewer, builtIn.id, {
				forwardLabel: 'Progenitor of',
				reverseLabel: 'Offspring of',
				category: 'family',
				symmetric: false
			})
		).rejects.toThrow(BuiltInRelationshipTypeError);
		expect(f.recorded.updated).toEqual([]);
	});

	it('reports a type this viewer cannot reach without writing', async () => {
		const f = fakeRepo({ types: [] });
		expect(
			await editRelationshipType(f.deps, viewer, 'type-elsewhere', {
				forwardLabel: 'Anything',
				reverseLabel: '',
				category: 'other',
				symmetric: true
			})
		).toBe(false);
		expect(f.recorded.updated).toEqual([]);
	});

	it('will not flip symmetry while relationships are stored under the type', async () => {
		// Symmetric decides the canonical storage direction; flipping it would strand the
		// rows written the other way round and defeat the duplicate guard.
		const f = fakeRepo({ types: [custom], usageCount: 3 });
		await expect(
			editRelationshipType(f.deps, viewer, 'type-own', {
				forwardLabel: 'Sings with',
				reverseLabel: 'Is sung with by',
				category: 'social',
				symmetric: false
			})
		).rejects.toThrow(RelationshipTypeInUseError);
		expect(f.recorded.updated).toEqual([]);
	});

	it('allows a rename while relationships are stored under the type', async () => {
		// The positive control for the rule above: usage only blocks the symmetry change.
		const f = fakeRepo({ types: [custom], usageCount: 3 });
		expect(
			await editRelationshipType(f.deps, viewer, 'type-own', {
				forwardLabel: 'Choir friend of',
				reverseLabel: '',
				category: 'social',
				symmetric: true
			})
		).toBe(true);
		expect(f.recorded.updated).toHaveLength(1);
	});
});

describe('removeRelationshipType', () => {
	it('deletes an unused custom type', async () => {
		const f = fakeRepo({ types: [custom] });
		expect(await removeRelationshipType(f.deps, viewer, 'type-own')).toBe(true);
		expect(f.recorded.deleted).toEqual(['type-own']);
	});

	it('refuses while relationships still point at it, and deletes nothing', async () => {
		const f = fakeRepo({ types: [custom], usageCount: 2 });
		await expect(removeRelationshipType(f.deps, viewer, 'type-own')).rejects.toThrow(
			RelationshipTypeInUseError
		);
		expect(f.recorded.deleted).toEqual([]);
	});

	it('refuses to delete a built-in type', async () => {
		const f = fakeRepo({ types: [builtIn] });
		await expect(removeRelationshipType(f.deps, viewer, builtIn.id)).rejects.toThrow(
			BuiltInRelationshipTypeError
		);
		expect(f.recorded.deleted).toEqual([]);
	});

	it('reports a type this viewer cannot reach without deleting', async () => {
		const f = fakeRepo({ types: [] });
		expect(await removeRelationshipType(f.deps, viewer, 'type-elsewhere')).toBe(false);
		expect(f.recorded.deleted).toEqual([]);
	});
});
