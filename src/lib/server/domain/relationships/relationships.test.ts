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
	type RelationshipView,
	RelationshipExcludedError,
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
	/** What the subject already carries, for the exclusion rules (docs/02 §2.4). */
	ties?: RelationshipView[];
	/** What the household already carries, for the same rules. */
	graph?: KinshipGraph;
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
		listForContactVisibleTo: async () => opts.ties ?? [],
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
		loadKinshipGraphVisibleTo: async () => opts.graph ?? emptyKinshipGraph()
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

/*
 * The exclusion rules at the write (docs/02 §2.4). The picker greys the entry out, but the
 * picker is a suggestion — a hand-written POST reaches the same use-case, so the refusal has
 * to live here as well. The rules themselves are tested in `exclusions.test.ts`; what these
 * tests hold is that the use-case reads what is on record and refuses on it.
 */
const spouse: RelationshipType = {
	id: 'spouse',
	householdId: null,
	key: 'spouse',
	forwardLabel: 'Spouse of',
	reverseLabel: 'Spouse of',
	category: 'romantic',
	symmetric: true,
	sortOrder: 4
};

/** One row of `listForContactVisibleTo`, in the fields the exclusion rules read. */
const tie = (
	id: string,
	otherContactId: string,
	category: RelationshipType['category'],
	named: { typeKey: string; side: 'forward' | 'reverse'; label: string } = {
		typeKey: 'some_type',
		side: 'forward',
		label: 'Linked to'
	}
): RelationshipView => ({
	id,
	otherContactId,
	otherDisplayName: otherContactId,
	label: named.label,
	typeId: named.typeKey,
	typeKey: named.typeKey,
	side: named.side,
	category,
	description: null,
	sinceDate: null,
	status: 'current'
});

const peopleNamed = (...ids: string[]) => ids.map((id) => ({ id, displayName: id }));

describe('createRelationship — what is already on record', () => {
	const married = (a: string, b: string, former = false): KinshipGraph => ({
		...emptyKinshipGraph(),
		people: peopleNamed(a, b),
		partnerEdges: [{ a, b, former }]
	});

	/** Entered from `from`'s profile, the way the person page posts it. */
	const create = (f: ReturnType<typeof fakeRepo>, from: string, to: string, typeId: string) =>
		createRelationship(
			{ relationships: f.repo, types: f.types, ids: idGen('rel-x'), clock },
			{ id: 'u', householdId: 'h' },
			{ fromContactId: from, toContactId: to, typeId, perspectiveContactId: from }
		);

	it('refuses a second spouse while the first marriage still holds', async () => {
		const f = fakeRepo({ type: spouse, graph: married('anna', 'carl') });
		await expect(create(f, 'anna', 'bert', 'spouse')).rejects.toBeInstanceOf(
			RelationshipExcludedError
		);
		expect(f.inserted).toBeNull();
	});

	it('allows it once that marriage is former — the way back in', async () => {
		const f = fakeRepo({ type: spouse, graph: married('anna', 'carl', true) });
		await create(f, 'anna', 'bert', 'spouse');
		expect(f.inserted).toMatchObject({ fromContactId: 'anna', toContactId: 'bert' });
	});

	it('lets a second kinship stand beside the first — a godparent is often the uncle too', async () => {
		const f = fakeRepo({ type: sibling, ties: [tie('r1', 'bert', 'family')] });
		await create(f, 'anna', 'bert', 'sibling');
		expect(f.inserted).toMatchObject({ fromContactId: 'anna', toContactId: 'bert' });
	});

	it('refuses a second romantic claim about the same two', async () => {
		const f = fakeRepo({
			type: spouse,
			ties: [
				tie('r1', 'bert', 'romantic', {
					typeKey: 'partner',
					side: 'forward',
					label: 'Partner of'
				})
			]
		});
		await expect(create(f, 'anna', 'bert', 'spouse')).rejects.toBeInstanceOf(
			RelationshipExcludedError
		);
		expect(f.inserted).toBeNull();
	});

	it('leaves a loose category alone — a colleague can be a friend as well', async () => {
		const f = fakeRepo({ type: sibling, ties: [tie('r1', 'bert', 'professional')] });
		await create(f, 'anna', 'bert', 'sibling');
		expect(f.inserted).toMatchObject({ fromContactId: 'anna', toContactId: 'bert' });
	});

	it('refuses a sibling link Stella already works out from shared parents', async () => {
		const f = fakeRepo({
			type: sibling,
			graph: {
				...emptyKinshipGraph(),
				people: peopleNamed('anna', 'bert', 'carl', 'dora'),
				parentEdges: [
					{ parentId: 'carl', childId: 'anna' },
					{ parentId: 'dora', childId: 'anna' },
					{ parentId: 'carl', childId: 'bert' },
					{ parentId: 'dora', childId: 'bert' }
				]
			}
		});
		await expect(create(f, 'anna', 'bert', 'sibling')).rejects.toBeInstanceOf(
			RelationshipExcludedError
		);
	});

	it('refuses a third parent', async () => {
		const f = fakeRepo({
			type: parentChild,
			graph: {
				...emptyKinshipGraph(),
				people: peopleNamed('bert'),
				parentEdges: [
					{ parentId: 'carl', childId: 'bert' },
					{ parentId: 'dora', childId: 'bert' }
				]
			}
		});
		await expect(create(f, 'anna', 'bert', 'parent_child')).rejects.toBeInstanceOf(
			RelationshipExcludedError
		);
		expect(f.inserted).toBeNull();
	});

	/*
	 * A refusal carrying nothing but the other person's name reads as a claim about the entry
	 * it refuses rather than about the link in the way. It names the link, from the side the
	 * subject reads it on.
	 */
	it('names the link that is in the way, not just the person', async () => {
		const f = fakeRepo({
			type: spouse,
			ties: [
				tie('r-eng', 'bert', 'romantic', {
					typeKey: 'engaged_to',
					side: 'forward',
					label: 'Engaged to'
				})
			],
			graph: {
				...emptyKinshipGraph(),
				people: [{ id: 'bert', displayName: 'Bert Weber' }]
			}
		});
		const failure = await create(f, 'nora', 'bert', 'spouse').then(
			() => null,
			(e: unknown) => e as RelationshipExcludedError
		);
		expect(failure?.reason).toBe('alreadyRomantic');
		// A household's own type is shown as it was typed, in either language.
		expect(failure?.phrase(createTranslator('en'))).toContain('Engaged to Bert Weber');
		expect(failure?.phrase(createTranslator('de'))).toContain('Engaged to Bert Weber');
	});

	it('translates a built-in type in the refusal', async () => {
		const f = fakeRepo({
			type: spouse,
			ties: [
				tie('r1', 'bert', 'romantic', {
					typeKey: 'partner',
					side: 'forward',
					label: 'Partner of'
				})
			],
			graph: {
				...emptyKinshipGraph(),
				people: [{ id: 'bert', displayName: 'Bert' }]
			}
		});
		const failure = await create(f, 'anna', 'bert', 'spouse').then(
			() => null,
			(e: unknown) => e as RelationshipExcludedError
		);
		expect(failure?.phrase(createTranslator('de'))).toContain('Partner von Bert');
	});

	it('names the person the refusal is about, in the reader language', async () => {
		const f = fakeRepo({
			type: spouse,
			graph: {
				...emptyKinshipGraph(),
				people: [
					{ id: 'anna', displayName: 'Anna' },
					{ id: 'carl', displayName: 'Carl Meier' }
				],
				partnerEdges: [{ a: 'anna', b: 'carl' }]
			}
		});
		const failure = await create(f, 'anna', 'bert', 'spouse').then(
			() => null,
			(e: unknown) => e as RelationshipExcludedError
		);
		expect(failure?.reason).toBe('romanticTaken');
		expect(failure?.phrase(createTranslator('de'))).toContain('Carl Meier');
		expect(failure?.phrase(createTranslator('de'))).toContain('ehemalig');
	});
});

describe('editRelationship — what is already on record', () => {
	const edit = (f: ReturnType<typeof fakeRepo>, typeId: string) =>
		editRelationship(
			{ relationships: f.repo, types: f.types, ids: idGen('x'), clock },
			{ id: 'u', householdId: 'h' },
			{ relationshipId: 'r1', perspectiveContactId: 'anna', typeChoice: { typeId, side: 'forward' } }
		);

	it('lets a partner be retyped to a spouse — that is an edit, not a second partnership', async () => {
		const f = fakeRepo({
			typesById: { spouse },
			stored: { id: 'r1', fromContactId: 'anna', toContactId: 'bert', typeId: 'partner' },
			ties: [
				tie('r1', 'bert', 'romantic', {
					typeKey: 'partner',
					side: 'forward',
					label: 'Partner of'
				})
			],
			graph: {
				...emptyKinshipGraph(),
				people: peopleNamed('anna', 'bert'),
				partnerEdges: [{ a: 'anna', b: 'bert' }]
			}
		});
		expect(await edit(f, 'spouse')).toBe(true);
		expect(f.updates[0]?.update.retype).toEqual({
			endpoints: { fromContactId: 'anna', toContactId: 'bert' },
			typeId: 'spouse'
		});
	});

	it('refuses a retype that would make a married person married twice', async () => {
		const f = fakeRepo({
			typesById: { spouse },
			stored: { id: 'r1', fromContactId: 'anna', toContactId: 'bert', typeId: 'friend' },
			graph: {
				...emptyKinshipGraph(),
				people: peopleNamed('anna', 'carl'),
				partnerEdges: [{ a: 'anna', b: 'carl' }]
			}
		});
		await expect(edit(f, 'spouse')).rejects.toBeInstanceOf(RelationshipExcludedError);
		expect(f.updates).toHaveLength(0);
	});
});

/*
 * A symmetric type is stored with its endpoints sorted by id, so the stored `from` end is
 * regularly *not* the person whose profile the link was entered on. Reading the rules from
 * that end names the blocking link backwards — "Suitor of Nora" on Nora's own page, where
 * what he is is the one being courted — so the profile the entry was made on is what the
 * wording follows.
 */
describe('createRelationship — the profile a refusal is read from', () => {
	/** Ids chosen so the symmetric canonical order puts `bert` first, ahead of `nora`. */
	const courtshipTies = (subject: string, other: string, label: string) =>
		fakeRepo({
			type: spouse,
			ties: [
				tie(`r-court-${subject}`, other, 'romantic', {
					typeKey: 'suitor_of',
					side: label === 'Courted by' ? 'reverse' : 'forward',
					label
				})
			],
			graph: {
				...emptyKinshipGraph(),
				people: [
					{ id: 'bert', displayName: 'Bert Weber' },
					{ id: 'nora', displayName: 'Nora' }
				]
			}
		});

	const enterFrom = (f: ReturnType<typeof fakeRepo>, profile: string, other: string) =>
		createRelationship(
			{ relationships: f.repo, types: f.types, ids: idGen('rel-x'), clock },
			{ id: 'u', householdId: 'h' },
			{
				fromContactId: profile,
				toContactId: other,
				typeId: 'spouse',
				perspectiveContactId: profile
			}
		).then(
			() => null,
			(e: unknown) => e as RelationshipExcludedError
		);

	it('reads the blocking link from the page it was entered on, not from the stored end', async () => {
		// Nora's page: his row reads "Courted by Bert Weber".
		const onNora = courtshipTies('nora', 'bert', 'Courted by');
		const refusedOnNora = await enterFrom(onNora, 'nora', 'bert');
		expect(refusedOnNora?.phrase(createTranslator('en'))).toContain('Courted by Bert Weber');

		// Bert's page, the same pair the other way: his row reads "Suitor of Nora".
		const onBert = courtshipTies('bert', 'nora', 'Suitor of');
		const refusedOnBert = await enterFrom(onBert, 'bert', 'nora');
		expect(refusedOnBert?.phrase(createTranslator('en'))).toContain('Suitor of Nora');
	});
});
