import { describe, expect, it } from 'bun:test';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import { serialiseDocument, type HouseholdSnapshot } from './archive';
import { ARCHIVE_FORMAT, ARCHIVE_VERSION, buildArchiveDocument } from './document';
import {
	ArchiveFormatError,
	ArchiveVersionError,
	planRestore,
	readArchiveDocument,
	type RestoreTarget
} from './restore';

/*
 * Reading an archive back into rows (docs/02 §2.15). The case this file exists for is the
 * round trip: what the export writes, the import must read back column for column, because
 * anything the pair loses is lost for good.
 */

const NOW = Date.UTC(2026, 9, 1, 8, 0);
const EXPORTED = Date.UTC(2026, 8, 7, 9, 30);
const clock: Clock = { now: () => NOW };

/** Predictable ids, so a test can tell a made-up one from a restored one. */
function counter(): IdGenerator {
	let n = 0;
	return { next: () => `new-${++n}` };
}

const deps = () => ({ ids: counter(), clock });

const target = (over: Partial<RestoreTarget> = {}): RestoreTarget => ({
	householdId: 'h-here',
	actorId: 'u-admin',
	memberIds: ['u-admin'],
	relationshipTypeIds: ['parent_child'],
	tags: [],
	...over
});

/** A household with one of everything, as the database holds it. */
function fullHousehold(): HouseholdSnapshot {
	return {
		householdName: 'Familie Brunner',
		tables: {
			household: [{ id: 'h-1', name: 'Familie Brunner' }],
			user: [{ id: 'u-1', name: 'Markus', email: 'm@x.test', role: 'admin', created_at: EXPORTED }],
			relationship_type: [
				{ id: 'rt-1', key: 'godparent', forward_label: 'Godparent of', reverse_label: 'Godchild of', category: 'family', symmetric: 0, sort_order: 100 }
			],
			contact: [
				{ id: 'c-hans', household_id: 'h-1', created_by: 'u-1', visibility: 'shared', first_name: 'Hans', last_name: 'Brunner', nickname: 'Hausi', prefix: 'Dr.', suffix: 'jun.', former_name: 'Hans Meier', display_name: 'Hans Brunner', gender: 'male', pronouns: 'he/him', description: 'the neighbour', avatar_photo_id: 'p-gallery', birth_date: '1980-06-01', birth_date_precision: 'full', is_deceased: 0, death_date: null, job_title: 'Schreiner', company: 'Brunner AG', how_we_met: 'at the market', met_date: '2001-04-02', met_place: 'Bern', archived_at: null, created_at: EXPORTED },
				{ id: 'c-rosa', household_id: 'h-1', created_by: 'u-1', visibility: 'private', first_name: 'Rosa', last_name: 'Brunner', display_name: 'Rosa Brunner', birth_date_precision: 'full', is_deceased: 0, created_at: EXPORTED }
			],
			contact_field: [
				{ id: 'f-1', contact_id: 'c-hans', kind: 'phone', label: 'mobile', value: '079', meta: '{"x":1}', sort_order: 2 }
			],
			important_date: [
				{ id: 'd-1', contact_id: 'c-hans', kind: 'anniversary', label: 'wedding', date: '1980-06-01', recurs_yearly: 1, remind: 1 }
			],
			note: [
				{ id: 'n-1', contact_id: 'c-hans', created_by: 'u-1', visibility: 'shared', title: 'Allergies', body: 'hazelnuts', is_pinned: 1, created_at: EXPORTED }
			],
			note_mention: [{ note_id: 'n-1', contact_id: 'c-rosa' }],
			journal_entry: [
				{ id: 'j-1', contact_id: 'c-hans', created_by: 'u-1', visibility: 'private', entry_date: '2026-07-12', title: 'Hike', body: 'hiked', created_at: EXPORTED }
			],
			journal_mention: [{ journal_entry_id: 'j-1', contact_id: 'c-rosa' }],
			interaction: [
				{ id: 'i-1', contact_id: 'c-hans', created_by: 'u-1', visibility: 'shared', kind: 'call', title: 'Sunday call', description: 'about the roof', happened_at: '2026-08-01', created_at: EXPORTED }
			],
			interaction_participant: [{ interaction_id: 'i-1', contact_id: 'c-rosa' }],
			photo: [
				{ id: 'p-gallery', household_id: 'h-1', contact_id: 'c-hans', journal_entry_id: null, created_by: 'u-1', visibility: 'shared', file_path: 'p1.jpg', thumb_path: 't1.jpg', mime: 'image/jpeg', width: 1600, height: 1200, size_bytes: 240000, caption: 'at the lake', taken_at: '2026-06-01', sort_order: 3, created_at: EXPORTED },
				{ id: 'p-journal', household_id: 'h-1', contact_id: 'c-hans', journal_entry_id: 'j-1', created_by: 'u-1', visibility: 'private', file_path: 'p2.jpg', thumb_path: 't2.jpg', mime: 'image/jpeg', width: null, height: null, size_bytes: null, caption: null, taken_at: null, sort_order: 0, created_at: EXPORTED }
			],
			tag: [{ id: 'tg-1', household_id: 'h-1', name: 'Bern', color: 'blue', created_at: EXPORTED }],
			contact_tag: [{ contact_id: 'c-hans', tag_id: 'tg-1' }],
			circle: [
				{ id: 'ci-1', household_id: 'h-1', created_by: 'u-1', visibility: 'shared', name: 'FC Länggasse', description: 'the club', kind: 'club', color: 'green', parent_circle_id: null, start_date: '2019-08-01', end_date: null, archived_at: null, created_at: EXPORTED }
			],
			circle_membership: [
				{ id: 'cm-1', circle_id: 'ci-1', contact_id: 'c-hans', role: 'coach', start_date: '2019-08-01', end_date: null, note: 'took over from Peter', created_by: 'u-1', created_at: EXPORTED }
			],
			relationship: [
				{ id: 'r-1', household_id: 'h-1', from_contact_id: 'c-hans', to_contact_id: 'c-rosa', type_id: 'rt-1', note: 'married in Thun', since_date: '1980-06-01', status: 'current', created_by: 'u-1', created_at: EXPORTED }
			],
			activity_log: [
				{ id: 'a-1', household_id: 'h-1', actor_id: 'u-1', action: 'delete', entity_type: 'contact', entity_id: 'gone', contact_id: null, visibility: 'shared', summary: 'removed Someone', created_at: EXPORTED }
			]
		},
		mediaPaths: ['p1.jpg', 't1.jpg', 'p2.jpg', 't2.jpg']
	};
}

/** The archive as it really travels: through YAML and back. */
const archived = (snapshot = fullHousehold()) =>
	Bun.YAML.parse(serialiseDocument(buildArchiveDocument(snapshot, EXPORTED)));

const planned = (over: Partial<RestoreTarget> = {}) =>
	planRestore(deps(), archived(), target(over));

const rowsOf = (plan: ReturnType<typeof planRestore>, table: string) =>
	plan.tables.find((t) => t.table === table)!.rows;

describe('the file is checked before anything is read', () => {
	it('refuses a file that is not a Stella archive', () => {
		expect(() => readArchiveDocument({ people: [] })).toThrow(ArchiveFormatError);
		expect(() => readArchiveDocument('a string')).toThrow(ArchiveFormatError);
		// Positive control: the real thing goes through.
		expect(readArchiveDocument(archived()).format).toBe(ARCHIVE_FORMAT);
	});

	it('refuses an archive from a newer Stella rather than guessing at it', () => {
		const newer = { format: ARCHIVE_FORMAT, version: ARCHIVE_VERSION + 1, people: [] };
		expect(() => readArchiveDocument(newer)).toThrow(ArchiveVersionError);
		// The version this Stella writes is still read.
		expect(() =>
			readArchiveDocument({ format: ARCHIVE_FORMAT, version: ARCHIVE_VERSION, people: [] })
		).not.toThrow();
	});

	it('refuses an archive that does not say what version it is', () => {
		expect(() => readArchiveDocument({ format: ARCHIVE_FORMAT, people: [] })).toThrow(
			ArchiveFormatError
		);
	});
});

describe('the round trip', () => {
	/*
	 * The heart of the pair: for every table, each column the database held is back with the
	 * same value. Written as a loop over the original row so a column added to the schema and
	 * forgotten in either direction shows up here rather than in a household's restore.
	 */
	const carried: Record<string, string[]> = {
		contact: ['id', 'visibility', 'first_name', 'last_name', 'nickname', 'prefix', 'suffix', 'former_name', 'display_name', 'gender', 'pronouns', 'description', 'avatar_photo_id', 'birth_date', 'birth_date_precision', 'is_deceased', 'death_date', 'job_title', 'company', 'how_we_met', 'met_date', 'met_place', 'archived_at', 'created_at'],
		contact_field: ['id', 'contact_id', 'kind', 'label', 'value', 'meta', 'sort_order'],
		important_date: ['id', 'contact_id', 'kind', 'label', 'date', 'recurs_yearly', 'remind'],
		note: ['id', 'contact_id', 'visibility', 'title', 'body', 'is_pinned', 'created_at'],
		note_mention: ['note_id', 'contact_id'],
		journal_entry: ['id', 'contact_id', 'visibility', 'entry_date', 'title', 'body', 'created_at'],
		journal_mention: ['journal_entry_id', 'contact_id'],
		interaction: ['id', 'contact_id', 'visibility', 'kind', 'title', 'description', 'happened_at', 'created_at'],
		interaction_participant: ['interaction_id', 'contact_id'],
		photo: ['id', 'contact_id', 'journal_entry_id', 'visibility', 'file_path', 'thumb_path', 'mime', 'width', 'height', 'size_bytes', 'caption', 'taken_at', 'sort_order', 'created_at'],
		tag: ['id', 'name', 'color'],
		contact_tag: ['contact_id', 'tag_id'],
		circle: ['id', 'visibility', 'name', 'description', 'kind', 'color', 'parent_circle_id', 'start_date', 'end_date', 'archived_at', 'created_at'],
		circle_membership: ['id', 'circle_id', 'contact_id', 'role', 'start_date', 'end_date', 'note', 'created_at'],
		relationship: ['id', 'from_contact_id', 'to_contact_id', 'type_id', 'note', 'since_date', 'status', 'created_at'],
		relationship_type: ['id', 'key', 'forward_label', 'reverse_label', 'category', 'symmetric', 'sort_order'],
		activity_log: ['id', 'actor_id', 'action', 'entity_type', 'entity_id', 'contact_id', 'visibility', 'summary', 'created_at']
	};

	for (const [table, columns] of Object.entries(carried)) {
		it(`gives ${table} back column for column`, () => {
			const snapshot = fullHousehold();
			// The archive's members are members here too, so authorship is expected to survive.
			const plan = planRestore(deps(), archived(snapshot), target({ memberIds: ['u-admin', 'u-1'] }));
			const before = snapshot.tables[table];
			const after = rowsOf(plan, table);
			expect(after).toHaveLength(before.length);

			// Matched by id where there is one: a photo hanging on a journal entry is written
			// before the gallery ones, and the order between tables is not what this checks.
			const byId = new Map(after.map((row) => [row.id, row]));
			for (const [index, original] of before.entries()) {
				const restored = columns.includes('id') ? byId.get(original.id)! : after[index];
				expect([table, original.id, restored !== undefined]).toEqual([table, original.id, true]);
				for (const column of columns) {
					expect([table, column, restored[column]]).toEqual([
						table,
						column,
						original[column] ?? null
					]);
				}
			}
		});
	}

	it('keeps the two people apart and their private records private', () => {
		const plan = planned();
		expect(rowsOf(plan, 'contact').map((c) => c.id)).toEqual(['c-hans', 'c-rosa']);
		expect(rowsOf(plan, 'contact')[1].visibility).toBe('private');
		expect(rowsOf(plan, 'journal_entry')[0].visibility).toBe('private');
	});

	it('names every media file the photos need, once each', () => {
		expect(planned().mediaPaths.sort()).toEqual(['p1.jpg', 'p2.jpg', 't1.jpg', 't2.jpg']);
	});

	it('has nothing to complain about when the archive is whole', () => {
		expect(planned().warnings).toEqual([]);
	});
});

describe('fitting into the installation it lands in', () => {
	it('moves everything into the household doing the import, not the one in the file', () => {
		const plan = planned();
		for (const table of ['contact', 'photo', 'tag', 'circle', 'relationship', 'activity_log']) {
			for (const row of rowsOf(plan, table)) expect(row.household_id).toBe('h-here');
		}
	});

	it('keeps an author who is a member here', () => {
		const plan = planRestore(deps(), archived(), target({ memberIds: ['u-admin', 'u-1'] }));
		expect(rowsOf(plan, 'note')[0].created_by).toBe('u-1');
	});

	it('gives records of a member this installation never had to the admin importing them', () => {
		// Otherwise the row points at a user that does not exist and nothing can be written.
		const plan = planned();
		expect(rowsOf(plan, 'note')[0].created_by).toBe('u-admin');
		expect(rowsOf(plan, 'contact')[0].created_by).toBe('u-admin');
		expect(rowsOf(plan, 'activity_log')[0].actor_id).toBe('u-admin');
	});

	it('reuses a tag the household already has, by its name', () => {
		// Tags are unique by name per household: a second "Bern" would be refused, and every
		// link pointing at the archive's id would then point at nothing.
		const plan = planned({ tags: [{ id: 'tg-here', name: 'Bern' }] });
		expect(rowsOf(plan, 'tag')).toEqual([]);
		expect(rowsOf(plan, 'contact_tag')).toEqual([{ contact_id: 'c-hans', tag_id: 'tg-here' }]);
	});

	it('sets updated_at from the archive’s own timestamp, not from the import', () => {
		expect(rowsOf(planned(), 'contact')[0].updated_at).toBe(EXPORTED);
	});
});

describe('an archive that does not add up', () => {
	/** The full household with one thing bent out of shape. */
	function bent(change: (snapshot: HouseholdSnapshot) => void): HouseholdSnapshot {
		const snapshot = fullHousehold();
		change(snapshot);
		return snapshot;
	}

	it('leaves out a relationship whose people are not in the file, and says so', () => {
		const plan = planRestore(
			deps(),
			archived(bent((s) => s.tables.contact.splice(1, 1))),
			target()
		);
		expect(rowsOf(plan, 'relationship')).toEqual([]);
		expect(plan.warnings).toContainEqual({ code: 'relationshipsMissingPeople' });
		// Positive control: the person who *is* in the file still arrives.
		expect(rowsOf(plan, 'contact').map((c) => c.id)).toEqual(['c-hans']);
	});

	it('leaves out a relationship of a kind this Stella does not know', () => {
		const plan = planRestore(
			deps(),
			archived(bent((s) => s.tables.relationship_type.splice(0, 1))),
			target()
		);
		expect(rowsOf(plan, 'relationship')).toEqual([]);
		expect(plan.warnings).toContainEqual({ code: 'relationshipUnknownType' });
	});

	it('keeps a relationship of a built-in kind, which every installation has', () => {
		const plan = planRestore(
			deps(),
			archived(
				bent((s) => {
					s.tables.relationship_type = [];
					s.tables.relationship[0].type_id = 'parent_child';
				})
			),
			target()
		);
		expect(rowsOf(plan, 'relationship')).toHaveLength(1);
	});

	it('leaves out a mention of somebody the archive does not contain', () => {
		const plan = planRestore(
			deps(),
			archived(bent((s) => s.tables.note_mention.push({ note_id: 'n-1', contact_id: 'c-ghost' }))),
			target()
		);
		expect(rowsOf(plan, 'note_mention')).toEqual([{ note_id: 'n-1', contact_id: 'c-rosa' }]);
		expect(plan.warnings).toContainEqual({ code: 'pointedAtMissingPeople', what: 'noteMentions' });
	});

	it('refuses a photo whose file path climbs out of the media directory', () => {
		const plan = planRestore(
			deps(),
			archived(bent((s) => (s.tables.photo[0].file_path = '../../etc/passwd'))),
			target()
		);
		expect(rowsOf(plan, 'photo').map((p) => p.id)).toEqual(['p-journal']);
		expect(plan.mediaPaths).not.toContain('../../etc/passwd');
		expect(plan.warnings).toContainEqual({ code: 'photoBadPath', file: '../../etc/passwd' });
	});

	it('drops one broken record and keeps the rest of the person’s', () => {
		const plan = planRestore(
			deps(),
			archived(
				bent((s) => {
					s.tables.note.push({ id: 'n-empty', contact_id: 'c-hans', created_by: 'u-1', visibility: 'shared', body: '', created_at: EXPORTED });
				})
			),
			target()
		);
		expect(rowsOf(plan, 'note').map((n) => n.id)).toEqual(['n-1']);
		expect(plan.warnings).toContainEqual({ code: 'noteWithoutText' });
	});

	it('gives a record with no id of its own a fresh one rather than dropping it', () => {
		// Archives written before the ids were carried; the record is still the household's.
		const document = archived() as { people: Record<string, unknown>[] };
		delete (document.people[0].fields as Record<string, unknown>[])[0].id;
		const plan = planRestore(deps(), document, target());
		expect(rowsOf(plan, 'contact_field')[0].id).toBe('new-1');
	});

	it('reads a document that is nothing but a header, without inventing rows', () => {
		const plan = planRestore(
			deps(),
			{ format: ARCHIVE_FORMAT, version: ARCHIVE_VERSION, household: 'Empty' },
			target()
		);
		expect(plan.tables.every((t) => t.rows.length === 0)).toBe(true);
		expect(plan.household).toBe('Empty');
	});
});

describe('the order the rows are written in', () => {
	it('puts a row after whatever it points at', () => {
		const order = planned().tables.map((t) => t.table);
		const before = (a: string, b: string) => order.indexOf(a) < order.indexOf(b);
		expect(before('contact', 'note')).toBe(true);
		expect(before('note', 'note_mention')).toBe(true);
		expect(before('journal_entry', 'photo')).toBe(true);
		expect(before('tag', 'contact_tag')).toBe(true);
		expect(before('circle', 'circle_membership')).toBe(true);
		expect(before('relationship_type', 'relationship')).toBe(true);
	});
});
