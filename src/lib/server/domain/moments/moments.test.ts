import { describe, expect, it } from 'bun:test';
import type { Viewer } from '../../access/visibility';
import type { Contact, ContactSummary, NewContact } from '../contacts/contacts';
import type { JournalAuthor, JournalEntry, NewJournalEntry } from '../journal/journal';
import { NeedsSomethingToKnowThemByError } from '../contacts/contacts';
import { AmbiguousMentionError } from '../mentions/resolve-for-audience';
import { ContactGoneError } from '../contacts/require-visible';
import { MomentNeedsPersonError, captureMoment, type CaptureMomentDeps } from './moments';

/*
 * Moment capture (docs/02 §2.22.1). A moment is a journal entry anchored on the first person
 * mentioned; other mentions become journal_mention links; queued names are created inline
 * before resolution. Fakes are in-memory ports; visibility scoping of reads is faked by the
 * same rule the adapters implement (household + shared-or-own).
 */

const author: JournalAuthor & { locale: 'en' } = {
	userId: 'u1',
	householdId: 'h1',
	defaultVisibility: 'shared',
	locale: 'en'
};

function summary(c: NewContact): ContactSummary {
	return {
		id: c.id,
		displayName: c.displayName,
		firstName: c.firstName,
		lastName: c.lastName,
		nickname: c.nickname,
		formerName: null,
		jobTitle: null,
		company: null,
		description: c.description,
		metPlace: c.metPlace ?? null,
		metDate: c.metDate ?? null,
		visibility: c.visibility,
		avatarPhotoId: null,
		birthDate: c.birthDate ?? null
	};
}

function fakes(seedContacts: Partial<NewContact>[] = []) {
	let n = 0;
	const contacts: NewContact[] = seedContacts.map((c, i) => ({
		id: c.id ?? `c${i}`,
		householdId: 'h1',
		createdBy: c.createdBy ?? 'u2',
		visibility: c.visibility ?? 'shared',
		displayName: c.displayName ?? 'Someone',
		firstName: c.firstName ?? null,
		lastName: c.lastName ?? null,
		nickname: null,
		description: null,
		birthDate: null,
		birthDatePrecision: 'full',
		gender: null,
		howWeMet: null,
		metDate: null,
		metPlace: null,
		createdAt: 0,
		updatedAt: 0
	}));
	const entries: JournalEntry[] = [];
	const mentions = new Map<string, string[]>();
	const visible = (v: Viewer, c: NewContact) =>
		c.householdId === v.householdId && (c.visibility === 'shared' || c.createdBy === v.id);

	const deps: CaptureMomentDeps = {
		contacts: {
			async insert(c) {
				contacts.push(c);
			},
			// The moment capture never edits a profile; present because the port requires it.
			async updateProfile() {},
			async setGender() {},
			async setJob() {},
			async setArchived() {},
			async listArchivedVisibleTo() {
				return [];
			},
			async listNamesVisibleTo() {
				return [];
			},
			async listNamesAmongVisibleTo() {
				return [];
			},
			async listBrowsableNamesAmong() {
				return [];
			},
			async listSomeBrowsableIdsVisibleTo() {
				return [];
			},
			async countArchivedVisibleTo() {
				return 0;
			},
			async listDistinguishableVisibleTo() {
				return [];
			},
			async deleteVisibleTo() {
				return null;
			},
			async readForMerge() {
				return null;
			},
			async mergeVisibleTo() {
				return false;
			},
			async findByIdVisibleTo(v, id) {
				const c = contacts.find((x) => x.id === id);
				return c && visible(v, c) ? ({ ...c, avatarPhotoId: null } as Contact) : null;
			},
			async listVisibleTo(v) {
				return contacts.filter((c) => visible(v, c)).map(summary);
			}
		},
		journal: {
			async findDay(p) {
				return (
					entries.find(
						(e) =>
							e.createdBy === p.authorId &&
							e.contactId === p.contactId &&
							e.entryDate === p.entryDate &&
							e.visibility === p.visibility
					) ?? null
				);
			},
			async insert(e: NewJournalEntry) {
				entries.push({ ...e });
			},
			async updateBody(p) {
				const e = entries.find((x) => x.id === p.id)!;
				e.body = p.body;
				e.updatedAt = p.updatedAt;
			},
			async updateOwn(p) {
				const e = entries.find((x) => x.id === p.id && x.createdBy === p.authorId);
				if (!e) return false;
				e.title = p.title;
				e.body = p.body;
				e.updatedAt = p.updatedAt;
				return true;
			},
			async listForContactVisibleTo() {
				return [];
			},
			async listPageForContactVisibleTo() {
				return [];
			},
			async deleteOwn() {
				return null;
			},
			async replaceMentions(id, ids) {
				mentions.set(id, ids);
			},
			async listMentionedContactIds(id) {
				return mentions.get(id) ?? [];
			}
		},
		ids: { next: () => `id${++n}` },
		clock: { now: () => 1_000 }
	};
	return { deps, contacts, entries, mentions };
}

const base = { entryDate: '2026-09-03', visibility: 'shared' as const, newPeople: [] as string[] };

describe('captureMoment', () => {
	it('anchors the entry on the first person mentioned and links the others', async () => {
		const f = fakes([
			{ id: 'julia', displayName: 'Julia Meier', firstName: 'Julia', lastName: 'Meier' },
			{ id: 'marco', displayName: 'Marco Berger', firstName: 'Marco', lastName: 'Berger' }
		]);
		const result = await captureMoment(f.deps, author, {
			...base,
			body: 'Met @JuliaMeier at the lake, she is @MarcoBerger’s sister'
		});

		expect(result.anchorContactId).toBe('julia');
		expect(result.mentionedContactIds).toEqual(['marco']);
		expect(result.linkSuggestion).toEqual(['julia', 'marco']);
		expect(f.entries).toHaveLength(1);
		expect(f.entries[0].contactId).toBe('julia');
		expect(f.entries[0].body).toBe(
			'Met @{contact:julia} at the lake, she is @{contact:marco}’s sister'
		);
		expect(f.mentions.get(result.entryId)).toEqual(['marco']);
	});

	it('creates a name an older build queued by its handle, when it is a whole name', async () => {
		const f = fakes([{ id: 'marco', displayName: 'Marco' }]);
		const result = await captureMoment(f.deps, author, {
			...base,
			body: '@JuliaMeier is @Marco’s sister',
			newPeople: ['Julia Meier']
		});

		expect(result.createdContactIds).toHaveLength(1);
		const julia = f.contacts.find((c) => c.displayName === 'Julia Meier')!;
		expect(julia.createdBy).toBe('u1');
		expect(julia.visibility).toBe('shared');
		expect(result.anchorContactId).toBe(julia.id);
		expect(f.entries[0].body).toBe(`@{contact:${julia.id}} is @{contact:marco}’s sister`);
	});

	it('refuses a bare first name an older build queued, saving nothing (docs/02 §2.2.3)', async () => {
		const f = fakes([{ id: 'marco', displayName: 'Marco' }]);
		await expect(
			captureMoment(f.deps, author, {
				...base,
				body: '@Julia is @Marco’s sister',
				newPeople: ['Julia']
			})
		).rejects.toBeInstanceOf(NeedsSomethingToKnowThemByError);
		expect(f.contacts).toHaveLength(1);
		expect(f.entries).toHaveLength(0);
	});

	it('creates queued people only if they are mentioned and not already someone visible', async () => {
		const f = fakes([{ id: 'marco', displayName: 'Marco' }]);
		await captureMoment(f.deps, author, {
			...base,
			body: 'Lunch with @Marco',
			newPeople: ['Marco', 'Nobody', 'marco']
		});
		expect(f.contacts).toHaveLength(1);
	});

	it('rejects a moment that mentions nobody, without creating or saving anything', async () => {
		const f = fakes([{ id: 'marco', displayName: 'Marco' }]);
		await expect(
			captureMoment(f.deps, author, { ...base, body: 'A day at the lake', newPeople: ['Julia'] })
		).rejects.toBeInstanceOf(MomentNeedsPersonError);
		await expect(captureMoment(f.deps, author, { ...base, body: '   ' })).rejects.toBeInstanceOf(
			MomentNeedsPersonError
		);
		expect(f.contacts).toHaveLength(1);
		expect(f.entries).toHaveLength(0);
	});

	it('asks which one when a typed handle is two people, creating and saving nothing', async () => {
		const f = fakes([
			{ id: 'thomas-hut', displayName: 'Thomas', firstName: 'Thomas' },
			{ id: 'thomas-lenk', displayName: 'Thomas', firstName: 'Thomas' }
		]);
		await expect(
			captureMoment(f.deps, author, {
				...base,
				body: 'Hut with @Thomas and @Julia',
				newPeople: ['Julia']
			})
		).rejects.toBeInstanceOf(AmbiguousMentionError);
		expect(f.contacts).toHaveLength(2);
		expect(f.entries).toHaveLength(0);
	});

	it('creates a person named in the moment with their description, beside a namesake already there', async () => {
		const f = fakes([{ id: 'thomas-hut', displayName: 'Thomas', firstName: 'Thomas' }]);
		const result = await captureMoment(f.deps, author, {
			...base,
			body: 'Met @{contact:new:k1} at the lake, not @{contact:thomas-hut}',
			newPeople: [
				{ key: 'k1', firstName: 'Thomas', lastName: null, description: 'Swims at the Marzili' },
				{ key: 'k2', firstName: 'Unused', lastName: null, description: null }
			]
		});

		expect(result.createdContactIds).toHaveLength(1);
		const created = f.contacts.find((c) => c.id === result.createdContactIds[0])!;
		expect(created).toMatchObject({
			displayName: 'Thomas',
			firstName: 'Thomas',
			description: 'Swims at the Marzili',
			visibility: 'shared'
		});
		expect(result.anchorContactId).toBe(created.id);
		expect(f.entries[0].body).toBe(
			`Met @{contact:${created.id}} at the lake, not @{contact:thomas-hut}`
		);
		expect(f.contacts.some((c) => c.firstName === 'Unused')).toBe(false);
	});

	it('lands a picked namesake in their own journal, by the id the picker wrote', async () => {
		const f = fakes([
			{ id: 'thomas-hut', displayName: 'Thomas', firstName: 'Thomas' },
			{ id: 'thomas-lenk', displayName: 'Thomas', firstName: 'Thomas' }
		]);
		const result = await captureMoment(f.deps, author, {
			...base,
			body: 'Coffee with @{contact:thomas-lenk}'
		});
		expect(result.anchorContactId).toBe('thomas-lenk');
	});

	it('does not let a shared moment reference a private person', async () => {
		const f = fakes([
			{ id: 'secret', displayName: 'Sam', visibility: 'private', createdBy: 'u1' },
			{ id: 'marco', displayName: 'Marco' }
		]);
		const result = await captureMoment(f.deps, author, { ...base, body: '@Sam met @Marco' });
		expect(result.anchorContactId).toBe('marco');
		expect(f.entries[0].body).toBe('@Sam met @{contact:marco}');
	});

	it('lets a private moment reference a private person and creates new people private', async () => {
		const f = fakes([{ id: 'secret', displayName: 'Sam', visibility: 'private', createdBy: 'u1' }]);
		const result = await captureMoment(f.deps, author, {
			...base,
			visibility: 'private',
			body: '@Sam and @{contact:new:k1}',
			newPeople: [{ key: 'k1', firstName: 'Kim', lastName: null, description: 'From yoga' }]
		});
		expect(result.anchorContactId).toBe('secret');
		expect(f.contacts.find((c) => c.displayName === 'Kim')!.visibility).toBe('private');
		expect(f.entries[0].visibility).toBe('private');
	});

	it('appends a second moment about the same person on the same day instead of replacing the first', async () => {
		const f = fakes([
			{ id: 'julia', displayName: 'Julia' },
			{ id: 'marco', displayName: 'Marco' },
			{ id: 'lena', displayName: 'Lena' }
		]);
		const first = await captureMoment(f.deps, author, { ...base, body: 'Met @Julia with @Marco' });
		f.entries[0].title = 'Lake day';
		const second = await captureMoment(f.deps, author, {
			...base,
			body: '@Julia called, @Lena says hi'
		});

		expect(second.entryId).toBe(first.entryId);
		expect(f.entries).toHaveLength(1);
		expect(f.entries[0].body).toBe(
			'Met @{contact:julia} with @{contact:marco}\n\n@{contact:julia} called, @{contact:lena} says hi'
		);
		expect(f.entries[0].title).toBe('Lake day');
		expect(f.mentions.get(first.entryId)).toEqual(['marco', 'lena']);
		// The result still describes the moment just written, not the whole day.
		expect(second.mentionedContactIds).toEqual(['lena']);
	});

	it('keeps moments on other days or with another visibility in their own entries', async () => {
		const f = fakes([{ id: 'julia', displayName: 'Julia' }]);
		await captureMoment(f.deps, author, { ...base, body: 'Lunch with @Julia' });
		await captureMoment(f.deps, author, {
			...base,
			entryDate: '2026-09-04',
			body: 'Tea with @Julia'
		});
		await captureMoment(f.deps, author, {
			...base,
			visibility: 'private',
			body: 'Worried about @Julia'
		});

		expect(f.entries.map((e) => e.body)).toEqual([
			'Lunch with @{contact:julia}',
			'Tea with @{contact:julia}',
			'Worried about @{contact:julia}'
		]);
	});

	it('offers no link when only one person is involved', async () => {
		const f = fakes([{ id: 'marco', displayName: 'Marco' }]);
		const result = await captureMoment(f.deps, author, { ...base, body: 'Coffee with @Marco' });
		expect(result.linkSuggestion).toBeNull();
		expect(f.mentions.get(result.entryId)).toEqual([]);
	});
});

/*
 * A moment written on a person's own page (docs/02 §2.22.1): it belongs to that person without
 * an `@`, and anyone it does name is a mention beside them.
 */
describe('captureMoment with an anchor', () => {
	const people = [
		{ id: 'markus', displayName: 'Markus Brunner', firstName: 'Markus', lastName: 'Brunner' },
		{ id: 'noah', displayName: 'Noah Brunner', firstName: 'Noah', lastName: 'Brunner' }
	];

	it('lands in the anchor’s journal with no mention at all', async () => {
		const f = fakes(people);
		const result = await captureMoment(f.deps, author, {
			...base,
			body: 'Coffee after training',
			anchorId: 'markus'
		});

		expect(result.anchorContactId).toBe('markus');
		expect(result.mentionedContactIds).toEqual([]);
		expect(f.entries[0].contactId).toBe('markus');
		expect(f.mentions.get(result.entryId)).toEqual([]);
	});

	it('keeps everyone named as a mention, even when they are named first', async () => {
		const f = fakes(people);
		const result = await captureMoment(f.deps, author, {
			...base,
			body: '@NoahBrunner had his tournament, @MarkusBrunner drove',
			anchorId: 'markus'
		});

		expect(result.anchorContactId).toBe('markus');
		// The anchor named in the text is the entry's subject, not a reference to itself.
		expect(result.mentionedContactIds).toEqual(['noah']);
		expect(f.entries[0].contactId).toBe('markus');
		expect(f.mentions.get(result.entryId)).toEqual(['noah']);
	});

	it('creates a person queued with it and mentions them beside the anchor', async () => {
		const f = fakes(people);
		const result = await captureMoment(f.deps, author, {
			...base,
			body: 'Met @{contact:new:k1} at training',
			anchorId: 'markus',
			newPeople: [{ key: 'k1', firstName: 'Lea', lastName: 'Graf', description: null }]
		});

		expect(result.createdContactIds).toHaveLength(1);
		expect(result.anchorContactId).toBe('markus');
		expect(result.mentionedContactIds).toEqual(result.createdContactIds);
	});

	it('refuses an anchor the author cannot see, creating nobody', async () => {
		const f = fakes([...people, { id: 'hidden', displayName: 'Hidden', visibility: 'private' }]);
		await expect(
			captureMoment(f.deps, author, {
				...base,
				body: 'Met @{contact:new:k1}',
				anchorId: 'hidden',
				newPeople: [{ key: 'k1', firstName: 'Lea', lastName: 'Graf', description: null }]
			})
		).rejects.toBeInstanceOf(ContactGoneError);
		expect(f.contacts).toHaveLength(3);
		expect(f.entries).toHaveLength(0);
	});

	it('lets a shared moment land on an anchor only its author can see, as the journal page does', async () => {
		// The audience rule (§2.20.1) is for mentions; the anchor's own visibility already bounds
		// who can read an entry in their journal (docs/03 §3.7).
		const f = fakes([
			...people,
			{ id: 'mine', displayName: 'Mine Only', visibility: 'private', createdBy: author.userId }
		]);
		const result = await captureMoment(f.deps, author, {
			...base,
			body: 'Coffee with @NoahBrunner',
			anchorId: 'mine'
		});

		expect(result.anchorContactId).toBe('mine');
		expect(f.entries[0]).toMatchObject({ contactId: 'mine', visibility: 'shared' });
		expect(result.mentionedContactIds).toEqual(['noah']);
	});

	it('joins the anchor’s day slot like any other addition (§2.20)', async () => {
		const f = fakes(people);
		await captureMoment(f.deps, author, { ...base, body: 'Morning run', anchorId: 'markus' });
		await captureMoment(f.deps, author, { ...base, body: 'Evening call', anchorId: 'markus' });

		expect(f.entries).toHaveLength(1);
		expect(f.entries[0].body).toContain('Morning run');
		expect(f.entries[0].body).toContain('Evening call');
	});
});
