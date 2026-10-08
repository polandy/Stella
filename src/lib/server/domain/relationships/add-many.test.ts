import { describe, expect, it } from 'bun:test';
import { createTranslator } from '../../../i18n/translate';
import { kinshipGraphOf } from '../../../kinship/graph-of';
import {
	encodeRelationshipChoice,
	type RelationshipSide
} from '../../../relationships/type-options';
import { CURRENT_RELATIONSHIP_STATUS } from '../../../relationships/status';
import type { Contact } from '../contacts/contacts';
import { BUILT_IN_RELATIONSHIP_TYPES } from './built-in-types';
import {
	describeRelationshipFor,
	type NewRelationship,
	type RelationshipType,
	type RelationshipView
} from './relationships';
import {
	addRelationships,
	addRelationshipsOrRefuse,
	RelationshipsRefusedError,
	type AddRelationshipsDeps,
	type AddRelationshipsInput
} from './add-many';

/*
 * Linking several people in one go (docs/02 §2.4, ADR-118). Each pair is judged by the very
 * guardrails a single link passes — and against the
 * other links of the same batch, so two new parents for a child who already has one are refused
 * even though each would pass alone. Any refusal writes nothing, and every refused person is
 * named with the reason, so the form can mark exactly that chip.
 */

const t = createTranslator('en');
const author = { userId: 'u1', householdId: 'h1' };
const typeById = new Map(BUILT_IN_RELATIONSHIP_TYPES.map((type) => [type.id, type]));
const NAMES: Record<string, string> = {
	lio: 'Lio Brunner',
	anna: 'Anna Brunner',
	bert: 'Bert Brunner',
	carl: 'Carl Brunner',
	mia: 'Mia Brunner',
	otto: 'Otto Meier'
};

interface StoredRow {
	id: string;
	from: string;
	to: string;
	typeId: string;
	status?: string;
}

/**
 * A household held in memory: the rows on record, every person visible unless `hidden`.
 * `insertAll` is the only way the batch may write, and it is counted, so "nothing was written"
 * is read off a positive record — the calls — rather than off an empty table alone.
 */
function household(rows: StoredRow[] = [], hidden: string[] = []) {
	const stored = [...rows];
	const writes: NewRelationship[][] = [];
	let singleInserts = 0;
	let nextId = 0;
	const typeOf = (typeId: string): RelationshipType => {
		const type = typeById.get(typeId);
		if (!type) throw new Error(`no type ${typeId}`);
		return type;
	};
	const deps: AddRelationshipsDeps = {
		contacts: {
			findByIdVisibleTo: async (_viewer, id) =>
				NAMES[id] && !hidden.includes(id) ? ({ id } as Contact) : null
		},
		relationships: {
			exists: async (from, to, typeId) =>
				stored.some((row) => row.from === from && row.to === to && row.typeId === typeId),
			insert: async () => void singleInserts++,
			insertAll: async (batch) => {
				writes.push([...batch]);
				for (const r of batch) {
					stored.push({
						id: r.id,
						from: r.fromContactId,
						to: r.toContactId,
						typeId: r.typeId,
						status: r.status
					});
				}
			}
		},
		ties: {
			listForContactVisibleTo: async (_viewer, contactId): Promise<RelationshipView[]> =>
				stored
					.filter((row) => row.from === contactId || row.to === contactId)
					.map((row) => {
						const type = typeOf(row.typeId);
						const seen = describeRelationshipFor(
							contactId,
							{ fromContactId: row.from, toContactId: row.to },
							type
						);
						return {
							id: row.id,
							otherContactId: seen.otherContactId,
							otherDisplayName: NAMES[seen.otherContactId],
							label: seen.label,
							typeId: type.id,
							typeKey: type.key,
							side: seen.side,
							category: seen.category,
							description: null,
							sinceDate: null,
							status: CURRENT_RELATIONSHIP_STATUS
						};
					})
		},
		kinship: {
			loadKinshipGraphVisibleTo: async () =>
				kinshipGraphOf(
					Object.entries(NAMES)
						.filter(([id]) => !hidden.includes(id))
						.map(([id, displayName]) => ({ id, displayName, gender: null })),
					stored.map((row) => ({
						fromId: row.from,
						toId: row.to,
						key: typeOf(row.typeId).key,
						status: row.status ?? CURRENT_RELATIONSHIP_STATUS
					}))
				)
		},
		types: { getType: async (_viewer, typeId) => typeById.get(typeId) ?? null },
		ids: { next: () => `rel-${++nextId}` },
		clock: { now: () => 42 }
	};
	return { deps, writes, stored, singleInserts: () => singleInserts };
}

function batch(
	contactId: string,
	typeId: string,
	side: RelationshipSide,
	links: (string | { targetId: string; sinceDate: string | null })[],
	extra: Partial<AddRelationshipsInput> = {}
): AddRelationshipsInput {
	return {
		contactId,
		typeChoice: encodeRelationshipChoice(typeId, side),
		status: CURRENT_RELATIONSHIP_STATUS,
		description: null,
		links: links.map((link) =>
			typeof link === 'string' ? { targetId: link, sinceDate: null } : link
		),
		...extra
	};
}

/** "Lio is a child of …" — the reverse side of parent_child, read from Lio's page. */
const childOf = (...targets: string[]) => batch('lio', 'parent_child', 'reverse', targets);

describe('addRelationships', () => {
	it('stores both parents in one write, each with its own since day', async () => {
		const h = household();
		const result = await addRelationships(
			h.deps,
			author,
			batch('lio', 'parent_child', 'reverse', [
				{ targetId: 'anna', sinceDate: '2015-04-12' },
				{ targetId: 'bert', sinceDate: null }
			])
		);

		expect(result).toEqual({
			ok: true,
			links: [
				{ targetId: 'anna', relationshipId: 'rel-1' },
				{ targetId: 'bert', relationshipId: 'rel-2' }
			]
		});
		expect(h.writes).toHaveLength(1);
		expect(h.writes[0]).toMatchObject([
			{
				id: 'rel-1',
				fromContactId: 'anna',
				toContactId: 'lio',
				typeId: 'parent_child',
				sinceDate: '2015-04-12',
				createdBy: 'u1',
				householdId: 'h1'
			},
			{
				id: 'rel-2',
				fromContactId: 'bert',
				toContactId: 'lio',
				typeId: 'parent_child',
				sinceDate: null
			}
		]);
		expect(h.singleInserts()).toBe(0);
	});

	it('copies the shared description and status onto every link', async () => {
		const h = household();
		await addRelationships(
			h.deps,
			author,
			batch('anna', 'friend', 'forward', ['bert', 'carl'], {
				description: 'from the choir',
				status: 'former'
			})
		);
		expect(h.writes[0].map((r) => [r.description, r.status])).toEqual([
			['from the choir', 'former'],
			['from the choir', 'former']
		]);
	});

	it('refuses a third parent picked in the same batch, and writes none of the three', async () => {
		const h = household();
		const result = await addRelationships(h.deps, author, childOf('anna', 'bert', 'carl'));

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.refusals.map((r) => r.targetId)).toEqual(['carl']);
		expect(result.refusals[0].reason(t)).toBe(
			'Lio Brunner already has 2 parents. Correct one of them instead of adding another.'
		);
		expect(h.writes).toHaveLength(0);
		expect(h.stored).toHaveLength(0);
	});

	it('counts the parent already on record: one more fits, the second is refused', async () => {
		const h = household([{ id: 'old', from: 'otto', to: 'lio', typeId: 'parent_child' }]);
		const result = await addRelationships(h.deps, author, childOf('anna', 'bert'));

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.refusals.map((r) => r.targetId)).toEqual(['bert']);
		expect(h.writes).toHaveLength(0);
		expect(h.stored.map((row) => row.id)).toEqual(['old']);
	});

	it('refuses a second partner in the same batch: one partnership at a time', async () => {
		const h = household();
		const result = await addRelationships(
			h.deps,
			author,
			batch('lio', 'partner', 'forward', ['anna', 'bert'])
		);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.refusals.map((r) => r.targetId)).toEqual(['bert']);
		expect(result.refusals[0].reason(t)).toContain('Anna Brunner');
		expect(h.writes).toHaveLength(0);
	});

	it('names every refused person with their own reason, never only the first', async () => {
		const h = household([
			// Lio is Anna's child already, and Otto is Anna's father: from Anna's page, "Parent of"
			// Lio repeats a link and "Parent of" Otto flips a generation.
			{ id: 'r1', from: 'anna', to: 'lio', typeId: 'parent_child' },
			{ id: 'r2', from: 'otto', to: 'anna', typeId: 'parent_child' }
		]);
		const result = await addRelationships(
			h.deps,
			author,
			batch('anna', 'parent_child', 'forward', ['lio', 'mia', 'otto'])
		);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.refusals.map((r) => [r.targetId, r.targetName, r.reason(t)])).toEqual([
			['lio', 'Lio Brunner', 'That relationship already exists.'],
			['otto', 'Otto Meier', expect.stringContaining('already linked the other way round')]
		]);
		expect(h.writes).toHaveLength(0);
	});

	it('refuses the same person picked twice as a duplicate of the first', async () => {
		const h = household();
		const result = await addRelationships(
			h.deps,
			author,
			batch('anna', 'friend', 'forward', ['bert', 'bert'])
		);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.refusals.map((r) => [r.targetId, r.reason(t)])).toEqual([
			['bert', 'That relationship already exists.']
		]);
		expect(h.writes).toHaveLength(0);
	});

	it('refuses someone the author cannot see, without saying who they are', async () => {
		const h = household([], ['carl']);
		const result = await addRelationships(
			h.deps,
			author,
			batch('anna', 'friend', 'forward', ['bert', 'carl'])
		);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.refusals.map((r) => [r.targetId, r.targetName])).toEqual([['carl', '']]);
		expect(h.writes).toHaveLength(0);
	});

	it('refuses a batch with nobody in it', async () => {
		const h = household();
		await expect(
			addRelationships(h.deps, author, batch('anna', 'friend', 'forward', []))
		).rejects.toThrow();
		expect(h.writes).toHaveLength(0);
	});
});

describe('addRelationshipsOrRefuse', () => {
	it('answers with the stored ids, in the order the people were picked', async () => {
		const h = household();
		expect(await addRelationshipsOrRefuse(h.deps, author, childOf('anna', 'bert'))).toEqual({
			relationshipIds: ['rel-1', 'rel-2']
		});
	});

	it('refuses as one error that still carries each refusal, and reads every name with its reason', async () => {
		const h = household([{ id: 'old', from: 'otto', to: 'lio', typeId: 'parent_child' }]);
		const refusal = await addRelationshipsOrRefuse(
			h.deps,
			author,
			childOf('anna', 'bert', 'carl')
		).catch((err: unknown) => err);

		expect(refusal).toBeInstanceOf(RelationshipsRefusedError);
		if (!(refusal instanceof RelationshipsRefusedError)) return;
		expect(refusal.refusals.map((r) => r.targetId)).toEqual(['bert', 'carl']);
		const sentence = refusal.phrase(t);
		expect(sentence).toContain('Bert Brunner: Lio Brunner already has 2 parents.');
		expect(sentence).toContain('Carl Brunner: Lio Brunner already has 2 parents.');
		expect(h.writes).toHaveLength(0);
	});
});
