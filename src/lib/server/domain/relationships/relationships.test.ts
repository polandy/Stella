import { describe, expect, it } from 'bun:test';
import { textOf } from '$lib/i18n/linked';
import { createTranslator } from '../../../i18n/translate';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import { BUILT_IN_RELATIONSHIP_TYPES } from './built-in-types';
import type { KinshipGraph } from '../../../kinship/kinship';
import type { Viewer } from '../../access/visibility';
import {
	canonicalEndpoints,
	createRelationship,
	describeRelationshipFor,
	ContradictoryRelationshipError,
	DuplicateRelationshipError,
	editRelationship,
	InvalidRelationshipDetailsError,
	parseRelationshipDetails,
	removeRelationship,
	type RelationshipUpdate,
	readKinship,
	type NewRelationship,
	type RelationshipRepository,
	type RelationshipType,
	type StoredRelationship
} from './relationships';

/*
 * Pure relationship logic (docs/02 §2.4): canonical storage direction (symmetric links are
 * order-independent; self-links are rejected) and perspective-aware label resolution.
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

const sibling: RelationshipType = {
	id: 'sibling',
	householdId: null,
	key: 'sibling',
	forwardLabel: 'Sibling of',
	reverseLabel: 'Sibling of',
	category: 'family',
	symmetric: true,
	sortOrder: 1
};

const grandparent: RelationshipType = {
	id: 'grandparent_grandchild',
	householdId: null,
	key: 'grandparent_grandchild',
	forwardLabel: 'Grandparent of',
	reverseLabel: 'Grandchild of',
	category: 'family',
	symmetric: false,
	sortOrder: 2
};

/** A household's own asymmetric type: directed, but no generation and nothing inferred from it. */
const landlord: RelationshipType = {
	id: 'landlord_of',
	householdId: 'h',
	key: 'landlord_of',
	forwardLabel: 'Landlord of',
	reverseLabel: 'Tenant of',
	category: 'other',
	symmetric: false,
	sortOrder: 100
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
			side: 'forward',
			category: 'family'
		});
	});

	it('shows the reverse label from the "to" side', () => {
		expect(describeRelationshipFor('bettina', endpoints, parentChild)).toEqual({
			otherContactId: 'hans',
			label: 'Child of',
			side: 'reverse',
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

function fakeRepo(opts: {
	type?: RelationshipType | null;
	/** The types a retype can resolve, by id; falls back to `type` for a single-type test. */
	typesById?: Record<string, RelationshipType>;
	exists?: boolean;
	/** Answers `exists` per pair, where a test needs one stored direction but not the other. */
	existsFor?: (
		fromContactId: string,
		toContactId: string,
		typeId: string,
		exceptId?: string
	) => boolean;
	visible?: boolean;
	/** The link an edit reads back; null stands for one the viewer may not see. */
	stored?: StoredRelationship | null;
}) {
	let inserted: NewRelationship | null = null;
	const updates: { id: string; update: RelationshipUpdate; updatedAt: number }[] = [];
	const removals: string[] = [];
	const types = {
		getType: async (_viewer: Viewer, typeId: string) =>
			opts.typesById ? (opts.typesById[typeId] ?? null) : (opts.type ?? null)
	};
	const repo: RelationshipRepository = {
		exists: async (from, to, typeId, exceptId) =>
			opts.existsFor ? opts.existsFor(from, to, typeId, exceptId) : (opts.exists ?? false),
		insert: async (r) => {
			inserted = r;
		},
		listForContactVisibleTo: async () => [],
		findVisibleTo: async () => opts.stored ?? null,
		updateVisibleTo: async (_viewer, id, update, updatedAt) => {
			if (opts.visible === false) return false;
			updates.push({ id, update, updatedAt });
			return true;
		},
		removeVisibleTo: async (_viewer, id) => {
			if (opts.visible === false) return false;
			removals.push(id);
			return true;
		},
		loadKinshipGraphVisibleTo: async () => emptyKinshipGraph()
	};
	return {
		repo,
		types,
		updates,
		removals,
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
			{ relationships: f.repo, types: f.types, ids: idGen('rel-1'), clock },
			{ id: 'user-1', householdId: 'household-1' },
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
		await createRelationship({ relationships: f.repo, types: f.types, ids: idGen('rel-2'), clock }, { id: 'u', householdId: 'h' }, {
			fromContactId: 'y',
			toContactId: 'x',
			typeId: 'sibling'
		});
		expect(f.inserted).toMatchObject({ fromContactId: 'x', toContactId: 'y' });
	});

	it('rejects an unknown type', async () => {
		const f = fakeRepo({ type: null });
		await expect(
			createRelationship({ relationships: f.repo, types: f.types, ids: idGen('x'), clock }, { id: 'u', householdId: 'h' }, {
				fromContactId: 'a',
				toContactId: 'b',
				typeId: 'nope'
			})
		).rejects.toThrow();
	});

	it('rejects a duplicate relationship', async () => {
		const f = fakeRepo({ type: parentChild, exists: true });
		await expect(
			createRelationship({ relationships: f.repo, types: f.types, ids: idGen('x'), clock }, { id: 'u', householdId: 'h' }, {
				fromContactId: 'a',
				toContactId: 'b',
				typeId: 'parent_child'
			})
		).rejects.toBeInstanceOf(DuplicateRelationshipError);
	});

	/*
	 * The contradiction guard (docs/02 §2.4). A generation runs one way: nobody is their own
	 * parent's parent. The picker offers both sides of a type from one screen, so the flipped
	 * pair is one wrong click away and has to be refused rather than stored as nonsense the
	 * kinship engine then reads.
	 */
	describe('the flipped pair of a generation type', () => {
		/** Answers `exists` for one stored direction only, so the guard cannot pass by accident. */
		const withStoredPair = (type: RelationshipType, from: string, to: string) =>
			fakeRepo({
				type,
				existsFor: (f, t, typeId) => f === from && t === to && typeId === type.id
			});

		it('is refused: A is already a parent of B, so B cannot be a parent of A', async () => {
			const f = withStoredPair(parentChild, 'a', 'b');
			await expect(
				createRelationship({ relationships: f.repo, types: f.types, ids: idGen('x'), clock }, { id: 'u', householdId: 'h' }, {
					fromContactId: 'b',
					toContactId: 'a',
					typeId: 'parent_child'
				})
			).rejects.toBeInstanceOf(ContradictoryRelationshipError);
			expect(f.inserted).toBeNull();
		});

		it('is refused for grandparents too', async () => {
			const f = withStoredPair(grandparent, 'a', 'b');
			await expect(
				createRelationship({ relationships: f.repo, types: f.types, ids: idGen('x'), clock }, { id: 'u', householdId: 'h' }, {
					fromContactId: 'b',
					toContactId: 'a',
					typeId: 'grandparent_grandchild'
				})
			).rejects.toBeInstanceOf(ContradictoryRelationshipError);
			expect(f.inserted).toBeNull();
		});

		// The positive control: the same fake, the same stored pair, the direction that is fine.
		it('leaves a third person alone — only the two ends of the stored link are refused', async () => {
			const f = withStoredPair(parentChild, 'a', 'b');
			await createRelationship({ relationships: f.repo, types: f.types, ids: idGen('rel-9'), clock }, { id: 'u', householdId: 'h' }, {
				fromContactId: 'c',
				toContactId: 'a',
				typeId: 'parent_child'
			});
			expect(f.inserted).toMatchObject({ id: 'rel-9', fromContactId: 'c', toContactId: 'a' });
		});

		/*
		 * A household's own asymmetric type is not a generation and is left permissive: two
		 * people can each be the other's landlord, and Stella does not know they cannot.
		 */
		it("does not touch a household's own asymmetric type", async () => {
			const f = withStoredPair(landlord, 'a', 'b');
			await createRelationship({ relationships: f.repo, types: f.types, ids: idGen('rel-8'), clock }, { id: 'u', householdId: 'h' }, {
				fromContactId: 'b',
				toContactId: 'a',
				typeId: 'landlord_of'
			});
			expect(f.inserted).toMatchObject({ id: 'rel-8', fromContactId: 'b', toContactId: 'a' });
		});
	});

	it('rejects a self relationship', async () => {
		const f = fakeRepo({ type: parentChild });
		await expect(
			createRelationship({ relationships: f.repo, types: f.types, ids: idGen('x'), clock }, { id: 'u', householdId: 'h' }, {
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

/** A graph with no links — the shape the kinship port must always hand back. */
function emptyKinshipGraph(): KinshipGraph {
	return { people: [], parentEdges: [], siblingEdges: [], partnerEdges: [], storedPairs: [] };
}

describe('readKinship', () => {
	/*
	 * The use-case is a seam, not a rule: it asks the port for the graph *this viewer* may
	 * see and hands it to the pure engine. The fake records the viewer so the scoping is
	 * asserted rather than assumed (the ranking itself is covered in kinship.test.ts).
	 */
	const viewer: Viewer = { id: 'u1', householdId: 'h1' };

	function kinRepo(over: { siblingEdges?: KinshipGraph['siblingEdges']; extraPeople?: KinshipGraph['people'] } = {}) {
		const asked: Viewer[] = [];
		const repo: Pick<RelationshipRepository, 'loadKinshipGraphVisibleTo'> = {
			async loadKinshipGraphVisibleTo(v) {
				asked.push(v);
				return {
					people: [
						{ id: 'hans', displayName: 'Hans', gender: 'male' },
						{ id: 'bettina', displayName: 'Bettina', gender: 'female' },
						{ id: 'otto', displayName: 'Otto', gender: 'male' },
						...(over.extraPeople ?? [])
					],
					parentEdges: [
						{ parentId: 'otto', childId: 'bettina' },
						{ parentId: 'bettina', childId: 'hans' }
					],
					siblingEdges: over.siblingEdges ?? [],
					partnerEdges: [],
					storedPairs: []
				};
			}
		};
		return { repo, asked };
	}

	/** The two ports `readKinship` reads, with nothing declined yet (§6.4). */
	const kinDeps = (repo: Pick<RelationshipRepository, 'loadKinshipGraphVisibleTo'>) => ({
		relationships: repo,
		dismissals: { listForHousehold: async () => [] }
	});

	it('derives from the graph the viewer may see, and proposes nothing unasked', async () => {
		const { repo, asked } = kinRepo();
		const found = await readKinship(kinDeps(repo), viewer, 'hans');
		expect(found.derived).toEqual([
			{
				personId: 'otto',
				displayName: 'Otto',
				term: 'grandparent',
				variant: 'male',
				via: ['Bettina']
			}
		]);
		expect(found.proposals).toEqual([]);
		expect(asked).toEqual([viewer]);
	});

	it('proposes the links implied by the pair it is pointed at, named for the interface', async () => {
		const { repo } = kinRepo({
			siblingEdges: [{ a: 'hans', b: 'lisa' }],
			extraPeople: [{ id: 'lisa', displayName: 'Lisa', gender: 'female' }]
		});
		const found = await readKinship(kinDeps(repo), viewer, 'hans', { a: 'bettina', b: 'hans' });
		expect(found.proposals).toMatchObject([
			{
				kind: 'link',
				relation: 'parent',
				ruleId: 'L1',
				confidence: 'certain',
				fromId: 'bettina',
				toId: 'lisa',
				fromName: 'Bettina',
				toName: 'Lisa'
			}
		]);
		// The reason travels unsaid; the route renders it in the reader's language.
		expect(textOf(found.proposals[0]!.reason(createTranslator('en')))).toBe(
			'Bettina is a parent of Hans, and Hans and Lisa are siblings.'
		);
	});

	it('proposes nothing for a pair with no primary link the viewer can see', async () => {
		const { repo } = kinRepo();
		const found = await readKinship(kinDeps(repo), viewer, 'hans', { a: 'hans', b: 'nobody' });
		expect(found.proposals).toEqual([]);
	});
});

/*
 * The specifics a relationship carries (docs/02 §2.4): free text for how these two connect,
 * an optional since-day and whether the link still holds. Pure — no deps, no clock.
 */
describe('parseRelationshipDetails', () => {
	it('keeps the text as written, trimmed', () => {
		expect(parseRelationshipDetails({ description: '  met at the ski course ' })).toEqual({
			description: 'met at the ski course',
			sinceDate: null,
			status: null
		});
	});

	it('reads nothing given, and nothing but blanks, as nothing said', () => {
		expect(parseRelationshipDetails({})).toEqual({ description: null, sinceDate: null, status: null });
		expect(parseRelationshipDetails({ description: '   ', sinceDate: '', status: '' })).toEqual({
			description: null,
			sinceDate: null,
			status: null
		});
	});

	it('takes a real day and refuses one that never happened', () => {
		expect(parseRelationshipDetails({ sinceDate: '2019-06-01' }).sinceDate).toBe('2019-06-01');
		expect(() => parseRelationshipDetails({ sinceDate: '2019-02-30' })).toThrow(
			InvalidRelationshipDetailsError
		);
	});

	it('wants the whole day, not a recurring one', () => {
		// `--06-01` is legal for a birthday (docs/03), but "since" names a point in time.
		expect(() => parseRelationshipDetails({ sinceDate: '--06-01' })).toThrow(
			InvalidRelationshipDetailsError
		);
	});

	it('accepts only the two statuses the model knows', () => {
		expect(parseRelationshipDetails({ status: 'current' }).status).toBe('current');
		expect(parseRelationshipDetails({ status: 'former' }).status).toBe('former');
		expect(() => parseRelationshipDetails({ status: 'complicated' })).toThrow(
			InvalidRelationshipDetailsError
		);
	});
});

describe('createRelationship with details', () => {
	const partner: RelationshipType = {
		id: 'partner',
		householdId: null,
		key: 'partner',
		forwardLabel: 'Partner of',
		reverseLabel: 'Partner of',
		category: 'romantic',
		symmetric: true,
		sortOrder: 3
	};

	it('stores the specifics alongside the link', async () => {
		const f = fakeRepo({ type: partner });

		await createRelationship({ relationships: f.repo, types: f.types, ids: idGen('rel-2'), clock }, { id: 'u1', householdId: 'h1' }, {
			fromContactId: 'a',
			toContactId: 'b',
			typeId: 'partner',
			description: 'met at the ski course',
			sinceDate: '2019-06-01',
			status: 'former'
		});

		expect(f.inserted).toMatchObject({
			description: 'met at the ski course',
			sinceDate: '2019-06-01',
			status: 'former'
		});
	});

	it('writes nothing when a detail is not a real one', async () => {
		const f = fakeRepo({ type: partner });

		await expect(
			createRelationship({ relationships: f.repo, types: f.types, ids: idGen('rel-3'), clock }, { id: 'u1', householdId: 'h1' }, {
				fromContactId: 'a',
				toContactId: 'b',
				typeId: 'partner',
				sinceDate: '2019-02-30'
			})
		).rejects.toThrow(InvalidRelationshipDetailsError);
		expect(f.inserted).toBeNull();
	});
});

describe('editRelationship', () => {
	const viewer: Viewer = { id: 'u1', householdId: 'h1' };
	const deps = (f: ReturnType<typeof fakeRepo>) => ({
		relationships: f.repo,
		types: f.types,
		ids: idGen('unused'),
		clock
	});

	it('writes the checked details, stamped from the clock, leaving the type alone', async () => {
		const f = fakeRepo({});

		const written = await editRelationship(deps(f), viewer, {
			relationshipId: 'rel-1',
			perspectiveContactId: 'a',
			description: '  they met skiing ',
			sinceDate: '2019-06-01',
			status: 'former'
		});

		expect(written).toBe(true);
		expect(f.updates).toEqual([
			{
				id: 'rel-1',
				update: {
					description: 'they met skiing',
					sinceDate: '2019-06-01',
					status: 'former',
					retype: null
				},
				updatedAt: clock.now()
			}
		]);
	});

	it('refuses an unreal detail without going near the repository', async () => {
		const f = fakeRepo({});

		await expect(
			editRelationship(deps(f), viewer, {
				relationshipId: 'rel-1',
				perspectiveContactId: 'a',
				status: 'complicated'
			})
		).rejects.toThrow(InvalidRelationshipDetailsError);
		expect(f.updates).toEqual([]);
	});

	it('reports false for a relationship the viewer may not see', async () => {
		const f = fakeRepo({ visible: false });

		expect(
			await editRelationship(deps(f), viewer, {
				relationshipId: 'rel-hidden',
				perspectiveContactId: 'a',
				description: 'x'
			})
		).toBe(false);
		expect(f.updates).toEqual([]);
	});

	describe('changing the type', () => {
		/** Partner and spouse are both symmetric: the tie moved on, the pair did not. */
		const partner: RelationshipType = {
			id: 'partner',
			householdId: null,
			key: 'partner',
			forwardLabel: 'Partner of',
			reverseLabel: 'Partner of',
			category: 'romantic',
			symmetric: true,
			sortOrder: 3
		};
		const spouse: RelationshipType = { ...partner, id: 'spouse', key: 'spouse', sortOrder: 4 };
		const typesById = { partner, spouse, parent_child: parentChild };

		it('carries a symmetric link over to another type, keeping the canonical pair', async () => {
			const f = fakeRepo({
				typesById,
				stored: { id: 'rel-1', fromContactId: 'anna', toContactId: 'bert', typeId: 'partner' }
			});

			const written = await editRelationship(deps(f), viewer, {
				relationshipId: 'rel-1',
				perspectiveContactId: 'bert',
				typeChoice: { typeId: 'spouse', side: 'forward' },
				description: 'married in June'
			});

			expect(written).toBe(true);
			expect(f.updates[0]?.update.retype).toEqual({
				endpoints: { fromContactId: 'anna', toContactId: 'bert' },
				typeId: 'spouse'
			});
			expect(f.updates[0]?.update.description).toBe('married in June');
		});

		it('flips the stored direction when the other side of the type is chosen', async () => {
			const f = fakeRepo({
				typesById,
				stored: { id: 'rel-1', fromContactId: 'bettina', toContactId: 'hans', typeId: 'parent_child' }
			});

			const written = await editRelationship(deps(f), viewer, {
				relationshipId: 'rel-1',
				perspectiveContactId: 'hans',
				typeChoice: { typeId: 'parent_child', side: 'forward' }
			});

			expect(written).toBe(true);
			expect(f.updates[0]?.update.retype).toEqual({
				endpoints: { fromContactId: 'hans', toContactId: 'bettina' },
				typeId: 'parent_child'
			});
		});

		/*
		 * The link is measured against every other row but itself: asking `exists` without
		 * leaving it out would make each retype read as its own duplicate, and each flipped
		 * generation as its own contradiction.
		 */
		it('leaves the link itself out of both guards', async () => {
			const asked: { from: string; to: string; exceptId?: string }[] = [];
			const f = fakeRepo({
				typesById,
				stored: { id: 'rel-1', fromContactId: 'bettina', toContactId: 'hans', typeId: 'parent_child' },
				existsFor: (from, to, _typeId, exceptId) => {
					asked.push({ from, to, exceptId });
					// The stored row, seen by a guard that forgot to exclude it.
					return from === 'bettina' && to === 'hans' && exceptId === undefined;
				}
			});

			expect(
				await editRelationship(deps(f), viewer, {
					relationshipId: 'rel-1',
					perspectiveContactId: 'hans',
					typeChoice: { typeId: 'parent_child', side: 'forward' }
				})
			).toBe(true);
			expect(asked.every((call) => call.exceptId === 'rel-1')).toBe(true);
		});

		it('refuses a type that would duplicate another link between the two', async () => {
			const f = fakeRepo({
				typesById,
				stored: { id: 'rel-1', fromContactId: 'anna', toContactId: 'bert', typeId: 'partner' },
				exists: true
			});

			await expect(
				editRelationship(deps(f), viewer, {
					relationshipId: 'rel-1',
					perspectiveContactId: 'bert',
					typeChoice: { typeId: 'spouse', side: 'forward' }
				})
			).rejects.toThrow(DuplicateRelationshipError);
			expect(f.updates).toEqual([]);
		});

		it('refuses a generation that another link already claims the other way round', async () => {
			const f = fakeRepo({
				typesById,
				stored: { id: 'rel-1', fromContactId: 'bettina', toContactId: 'hans', typeId: 'partner' },
				// Hans is already stored as Bettina's parent by some other row.
				existsFor: (from, to, typeId, exceptId) =>
					from === 'hans' &&
					to === 'bettina' &&
					typeId === 'parent_child' &&
					exceptId === 'rel-1'
			});

			await expect(
				editRelationship(deps(f), viewer, {
					relationshipId: 'rel-1',
					perspectiveContactId: 'bettina',
					typeChoice: { typeId: 'parent_child', side: 'forward' }
				})
			).rejects.toThrow(ContradictoryRelationshipError);
			expect(f.updates).toEqual([]);
		});

		it('reports false, writing nothing, for a link the viewer may not read back', async () => {
			const f = fakeRepo({ typesById, stored: null });

			expect(
				await editRelationship(deps(f), viewer, {
					relationshipId: 'rel-hidden',
					perspectiveContactId: 'bert',
					typeChoice: { typeId: 'spouse', side: 'forward' }
				})
			).toBe(false);
			expect(f.updates).toEqual([]);
		});

		it('reports false when the edit comes from a profile that is not an endpoint', async () => {
			const f = fakeRepo({
				typesById,
				stored: { id: 'rel-1', fromContactId: 'anna', toContactId: 'bert', typeId: 'partner' }
			});

			expect(
				await editRelationship(deps(f), viewer, {
					relationshipId: 'rel-1',
					perspectiveContactId: 'someone-else',
					typeChoice: { typeId: 'spouse', side: 'forward' }
				})
			).toBe(false);
			expect(f.updates).toEqual([]);
		});

		it('refuses a type it cannot resolve, and writes nothing', async () => {
			const f = fakeRepo({
				typesById,
				stored: { id: 'rel-1', fromContactId: 'anna', toContactId: 'bert', typeId: 'partner' }
			});

			await expect(
				editRelationship(deps(f), viewer, {
					relationshipId: 'rel-1',
					perspectiveContactId: 'bert',
					typeChoice: { typeId: 'another-households-type', side: 'forward' }
				})
			).rejects.toThrow('Unknown relationship type.');
			expect(f.updates).toEqual([]);
		});
	});
});

describe('removeRelationship', () => {
	const viewer: Viewer = { id: 'u1', householdId: 'h1' };

	it('takes back the link it was given', async () => {
		const f = fakeRepo({});

		expect(
			await removeRelationship({ relationships: f.repo, types: f.types, ids: idGen('unused'), clock }, viewer, 'rel-1')
		).toBe(true);
		expect(f.removals).toEqual(['rel-1']);
	});

	it('reports false for one the viewer may not see, and removes nothing', async () => {
		const f = fakeRepo({ visible: false });

		expect(
			await removeRelationship({ relationships: f.repo, types: f.types, ids: idGen('unused'), clock }, viewer, 'rel-x')
		).toBe(false);
		expect(f.removals).toEqual([]);
	});
});
