import { describe, expect, it } from 'bun:test';
import { serialiseDocument, type HouseholdSnapshot } from './archive';
import { ARCHIVE_FORMAT, ARCHIVE_VERSION, buildArchiveDocument } from './document';

/*
 * The export document (docs/02 §2.15): the household arranged around its people, so another
 * program can read it. The case this file exists for is the last one — two people with the
 * same name — because a document that joins on names silently merges them.
 */

const NOW = Date.UTC(2026, 8, 7, 9, 30);

/** A household with one of everything, wired together the way the database wires it. */
function fullHousehold(): HouseholdSnapshot {
	return {
		householdName: 'Familie Brunner',
		tables: {
			household: [{ id: 'h-1', name: 'Familie Brunner' }],
			user: [{ id: 'u-1', name: 'Markus', email: 'm@x.test', role: 'admin', created_at: NOW }],
			relationship_type: [
				{ id: 'rt-1', key: 'godparent', forward_label: 'Godparent of', reverse_label: 'Godchild of', category: 'family', symmetric: 0 }
			],
			contact: [
				{ id: 'c-hans', display_name: 'Hans Brunner', first_name: 'Hans', last_name: 'Brunner', created_by: 'u-1', visibility: 'shared', is_deceased: 0, created_at: NOW },
				{ id: 'c-rosa', display_name: 'Rosa Brunner', first_name: 'Rosa', last_name: 'Brunner', created_by: 'u-1', visibility: 'private', is_deceased: 0, created_at: NOW }
			],
			contact_field: [{ id: 'f-1', contact_id: 'c-hans', kind: 'phone', label: 'mobile', value: '079' }],
			important_date: [{ id: 'd-1', contact_id: 'c-hans', kind: 'anniversary', date: '1980-06-01', recurs_yearly: 1 }],
			note: [{ id: 'n-1', contact_id: 'c-hans', title: 'Allergies', body: 'hazelnuts', is_pinned: 1, visibility: 'shared', created_by: 'u-1', created_at: NOW }],
			note_mention: [{ note_id: 'n-1', contact_id: 'c-rosa' }],
			journal_entry: [{ id: 'j-1', contact_id: 'c-hans', entry_date: '2026-07-12', body: 'hiked', visibility: 'private', created_by: 'u-1', created_at: NOW }],
			journal_mention: [{ journal_entry_id: 'j-1', contact_id: 'c-rosa' }],
			interaction: [{ id: 'i-1', contact_id: 'c-hans', kind: 'call', happened_at: '2026-08-01', visibility: 'shared', created_by: 'u-1' }],
			interaction_participant: [{ interaction_id: 'i-1', contact_id: 'c-rosa' }],
			photo: [
				{ id: 'p-gallery', contact_id: 'c-hans', journal_entry_id: null, file_path: 'p1.jpg', thumb_path: 't1.jpg', mime: 'image/jpeg', visibility: 'shared', created_by: 'u-1', created_at: NOW },
				{ id: 'p-journal', contact_id: 'c-hans', journal_entry_id: 'j-1', file_path: 'p2.jpg', thumb_path: 't2.jpg', mime: 'image/jpeg', visibility: 'private', created_by: 'u-1', created_at: NOW }
			],
			tag: [{ id: 'tg-1', name: 'Bern', color: 'blue' }],
			contact_tag: [{ contact_id: 'c-hans', tag_id: 'tg-1' }],
			circle: [{ id: 'ci-1', name: 'FC Länggasse', kind: 'club', created_by: 'u-1', visibility: 'shared' }],
			circle_membership: [{ id: 'cm-1', circle_id: 'ci-1', contact_id: 'c-hans', role: 'coach', start_date: '2019-06-01', end_date: null, created_by: 'u-1' }],
			relationship: [
				{ id: 'r-1', from_contact_id: 'c-hans', to_contact_id: 'c-rosa', type_id: 'rt-1', note: 'married in Thun', since_date: '1980-06-01', status: 'current', created_by: 'u-1', created_at: NOW }
			],
			activity_log: [
				{ id: 'a-1', action: 'delete', entity_type: 'contact', entity_id: 'gone', contact_id: null, actor_id: 'u-1', summary: 'removed Someone', visibility: 'shared', created_at: NOW }
			]
		},
		mediaPaths: ['p1.jpg', 't1.jpg', 'p2.jpg', 't2.jpg']
	};
}

const doc = () => buildArchiveDocument(fullHousehold(), NOW);
const hans = () => doc().people.find((p) => p.id === 'c-hans')!;

describe('the document header', () => {
	it('says what the file is, so a reader can refuse a foreign one', () => {
		expect(doc().format).toBe(ARCHIVE_FORMAT);
		expect(doc().version).toBe(ARCHIVE_VERSION);
		expect(doc().exported_at).toBe('2026-09-07T09:30:00.000Z');
		expect(doc().household).toBe('Familie Brunner');
	});

	it('counts every table, including the empty ones', () => {
		// An empty table is not a missing one: a reader must be able to tell "no tags" from
		// "this export did not cover tags".
		const counts = buildArchiveDocument(
			{ householdName: 'H', tables: { contact: [{ id: 'c' }], tag: [] }, mediaPaths: [] },
			NOW
		).counts;
		expect(counts).toEqual({ contact: 1, tag: 0 });
	});
});

describe('a person', () => {
	it('carries their id, which is what everything else refers to them by', () => {
		expect(hans().id).toBe('c-hans');
	});

	it('brings their own records with them rather than leaving them in tables', () => {
		const p = hans();
		expect(p.fields).toEqual([{ id: 'f-1', kind: 'phone', label: 'mobile', value: '079' }]);
		expect(p.important_dates).toEqual([
			{ id: 'd-1', kind: 'anniversary', date: '1980-06-01', recurs_yearly: true }
		]);
		expect(p.tags).toEqual(['tg-1']);
		expect((p.notes as Record<string, unknown>[])[0]).toMatchObject({
			title: 'Allergies',
			body: 'hazelnuts',
			pinned: true
		});
		expect((p.interactions as Record<string, unknown>[])[0]).toMatchObject({ kind: 'call' });
	});

	it('keeps the visibility each record was written with, private ones included', () => {
		// The archive is a backup: a restore that loses a member's private journal is not one.
		expect(doc().people.find((p) => p.id === 'c-rosa')!.visibility).toBe('private');
		expect((hans().journal as Record<string, unknown>[])[0].visibility).toBe('private');
	});

	it('names the people its records mention by id, never by name', () => {
		const note = (hans().notes as Record<string, unknown>[])[0];
		const entry = (hans().journal as Record<string, unknown>[])[0];
		const call = (hans().interactions as Record<string, unknown>[])[0];
		expect(note.mentions).toEqual(['c-rosa']);
		expect(entry.mentions).toEqual(['c-rosa']);
		expect(call.participants).toEqual(['c-rosa']);
	});

	it('puts a journal photo in its entry and a gallery photo in the gallery', () => {
		const entry = (hans().journal as Record<string, unknown>[])[0];
		expect((entry.photos as Record<string, unknown>[]).map((p) => p.id)).toEqual(['p-journal']);
		expect((hans().photos as Record<string, unknown>[]).map((p) => p.id)).toEqual(['p-gallery']);
	});

	it('leaves out what is not there instead of writing nulls', () => {
		expect(hans()).not.toHaveProperty('nickname');
		expect(hans()).not.toHaveProperty('death_date');
	});
});

describe('the household around them', () => {
	it('keeps relationships as their own list, both ends named by id', () => {
		expect(doc().relationships).toEqual([
			{
				id: 'r-1',
				from: 'c-hans',
				to: 'c-rosa',
				type: 'rt-1',
				description: 'married in Thun',
				since: '1980-06-01',
				status: 'current',
				author: 'u-1',
				created_at: '2026-09-07T09:30:00.000Z'
			}
		]);
	});

	it('carries the household’s own relationship types, tags and circles', () => {
		expect(doc().relationship_types[0]).toMatchObject({ key: 'godparent', category: 'family' });
		expect(doc().tags).toEqual([{ id: 'tg-1', name: 'Bern', color: 'blue' }]);
		expect(doc().circles[0]).toMatchObject({
			name: 'FC Länggasse',
			members: [{ person: 'c-hans', role: 'coach', since: '2019-06-01' }]
		});
	});

	it('names the members but never their credentials', () => {
		const member = doc().members[0];
		expect(member).toMatchObject({ id: 'u-1', name: 'Markus', role: 'admin' });
		expect(member).not.toHaveProperty('password_hash');
		expect(member).not.toHaveProperty('totp_secret');
	});
});

describe('what a restore would otherwise lose', () => {
	/*
	 * Every column that carries meaning is in the document, because whatever is missing here
	 * is gone for good the day the archive is read back. The `updated_at` bookkeeping columns
	 * are the deliberate exception (docs/02 §2.15).
	 */
	const filled: HouseholdSnapshot = {
		householdName: 'H',
		tables: {
			contact: [
				{
					id: 'c-1',
					display_name: 'Dr. Hans Brunner-Meier',
					first_name: 'Hans',
					last_name: 'Brunner-Meier',
					prefix: 'Dr.',
					suffix: 'jun.',
					former_name: 'Hans Meier',
					gender: 'male',
					pronouns: 'he/him',
					job_title: 'Schreiner',
					company: 'Brunner AG',
					met_date: '2001-04-02',
					avatar_photo_id: 'p-1',
					created_by: 'u-1',
					visibility: 'shared'
				}
			],
			contact_field: [
				{ id: 'f-1', contact_id: 'c-1', kind: 'address', value: 'Bern', meta: '{"city":"Bern"}', sort_order: 3 }
			],
			important_date: [
				{ id: 'd-1', contact_id: 'c-1', kind: 'birthday', date: '1980-06-01', recurs_yearly: 1, remind: 1 }
			],
			photo: [
				{ id: 'p-1', contact_id: 'c-1', journal_entry_id: null, file_path: 'p1.jpg', thumb_path: 't1.jpg', mime: 'image/jpeg', width: 1600, height: 1200, size_bytes: 240000, sort_order: 2, created_by: 'u-1', visibility: 'shared' }
			],
			circle: [
				{ id: 'ci-1', name: 'Klasse 5b', kind: 'class', color: 'green', parent_circle_id: 'ci-0', start_date: '2019-08-01', end_date: '2020-07-01', archived_at: NOW, created_by: 'u-1', visibility: 'shared' }
			],
			circle_membership: [
				{ id: 'cm-1', circle_id: 'ci-1', contact_id: 'c-1', role: 'pupil', start_date: '2019-08-01', end_date: '2020-07-01', note: 'sat at the back', created_by: 'u-1' }
			],
			relationship: [
				{ id: 'r-1', from_contact_id: 'c-1', to_contact_id: 'c-1', type_id: 'rt-1', created_by: 'u-1', created_at: NOW }
			],
			relationship_type: [
				{ id: 'rt-1', key: 'godparent', forward_label: 'Godparent of', reverse_label: 'Godchild of', category: 'family', symmetric: 0, sort_order: 100 }
			]
		},
		mediaPaths: []
	};
	const built = () => buildArchiveDocument(filled, NOW);

	it('carries every part of a person’s name, their work and how they were met', () => {
		expect(built().people[0]).toMatchObject({
			prefix: 'Dr.',
			suffix: 'jun.',
			former_name: 'Hans Meier',
			gender: 'male',
			pronouns: 'he/him',
			job_title: 'Schreiner',
			company: 'Brunner AG',
			met_date: '2001-04-02',
			avatar: 'p-1'
		});
	});

	it('says who created each thing, because private records belong to their author', () => {
		// Without this a restored private person has no owner, and visibility means nothing.
		expect(built().people[0].author).toBe('u-1');
		expect(built().circles[0]).toMatchObject({ author: 'u-1' });
		expect(built().relationships[0]).toMatchObject({ author: 'u-1' });
		expect(
			(built().circles[0].members as Record<string, unknown>[])[0]
		).toMatchObject({ id: 'cm-1', author: 'u-1', note: 'sat at the back' });
		// The membership's own dates: read from start_date/end_date, the columns it really has.
		expect((built().circles[0].members as Record<string, unknown>[])[0]).toMatchObject({
			since: '2019-08-01',
			until: '2020-07-01'
		});
	});

	it('keeps the details of a field, a date, a photo and a circle', () => {
		const person = built().people[0];
		expect((person.fields as Record<string, unknown>[])[0]).toMatchObject({
			meta: '{"city":"Bern"}',
			sort_order: 3
		});
		expect((person.important_dates as Record<string, unknown>[])[0]).toMatchObject({
			remind: true
		});
		expect((person.photos as Record<string, unknown>[])[0]).toMatchObject({
			width: 1600,
			height: 1200,
			bytes: 240000,
			sort_order: 2
		});
		expect(built().circles[0]).toMatchObject({
			color: 'green',
			parent: 'ci-0',
			start: '2019-08-01',
			end: '2020-07-01',
			archived_at: new Date(NOW).toISOString()
		});
		expect(built().relationship_types[0]).toMatchObject({ sort_order: 100 });
	});
});

describe('two people with the same name', () => {
	/*
	 * The reason the id is the key. Both are "Peter Keller"; one has the phone number and the
	 * relationship, the other has neither. A document that joined on names would fuse them.
	 */
	const twoPeters: HouseholdSnapshot = {
		householdName: 'H',
		tables: {
			contact: [
				{ id: 'c-peter-1', display_name: 'Peter Keller', first_name: 'Peter', last_name: 'Keller', visibility: 'shared' },
				{ id: 'c-peter-2', display_name: 'Peter Keller', first_name: 'Peter', last_name: 'Keller', visibility: 'shared' }
			],
			contact_field: [{ id: 'f-1', contact_id: 'c-peter-1', kind: 'phone', value: '079' }],
			relationship: [
				{ id: 'r-1', from_contact_id: 'c-peter-2', to_contact_id: 'c-peter-1', type_id: 'rt-1' }
			]
		},
		mediaPaths: []
	};

	it('keeps them apart, each under their own key', () => {
		const people = buildArchiveDocument(twoPeters, NOW).people;
		expect(people.map((p) => p.id)).toEqual(['c-peter-1', 'c-peter-2']);
		expect(people[0].fields).toHaveLength(1);
		expect(people[1].fields).toHaveLength(0);
	});

	it('points the relationship at one of them and not the other', () => {
		const [link] = buildArchiveDocument(twoPeters, NOW).relationships;
		expect(link).toMatchObject({ from: 'c-peter-2', to: 'c-peter-1' });
	});
});

describe('written out as YAML', () => {
	it('parses back to the same document, so another program reads what we meant', () => {
		const original = doc();
		const text = serialiseDocument(original);
		expect(text).toContain('format: stella-archive');
		// Block style, one thing per line: the file is meant to be read, not just parsed.
		expect(text.split('\n').length).toBeGreaterThan(50);
		expect(text).toMatch(/\n  - /);
		expect(JSON.parse(JSON.stringify(Bun.YAML.parse(text)))).toEqual(
			JSON.parse(JSON.stringify(original))
		);
	});

	it('survives the characters a naive writer breaks on', () => {
		const awkward: HouseholdSnapshot = {
			householdName: 'H',
			tables: {
				contact: [
					{
						id: 'c-1',
						display_name: 'Étienne "Le Chef" Müller',
						// A body with a colon, a newline, a leading dash and a word YAML reads as false.
						description: 'no',
						how_we_met: '- at 12:30\nunder the tree: really'
					}
				]
			},
			mediaPaths: []
		};
		const back = Bun.YAML.parse(serialiseDocument(buildArchiveDocument(awkward, NOW))) as {
			people: Record<string, unknown>[];
		};
		expect(back.people[0].display_name).toBe('Étienne "Le Chef" Müller');
		expect(back.people[0].description).toBe('no');
		expect(back.people[0].how_we_met).toBe('- at 12:30\nunder the tree: really');
	});
});
