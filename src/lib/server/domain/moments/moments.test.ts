import { describe, expect, it } from 'bun:test';
import type { Viewer } from '../../access/visibility';
import type { Contact, ContactSummary, NewContact } from '../contacts/contacts';
import type { JournalAuthor, JournalEntry, NewJournalEntry } from '../journal/journal';
import { MomentNeedsPersonError, audienceCandidates, captureMoment, type CaptureMomentDeps } from './moments';

/*
 * Moment capture (docs/02 §2.22.1). A moment is a journal entry anchored on the first person
 * mentioned; other mentions become journal_mention links; queued names are created inline
 * before resolution. Fakes are in-memory ports; visibility scoping of reads is faked by the
 * same rule the adapters implement (household + shared-or-own).
 */

const author: JournalAuthor = { userId: 'u1', householdId: 'h1', defaultVisibility: 'shared' };

function summary(c: NewContact): ContactSummary {
	return {
		id: c.id,
		displayName: c.displayName,
		firstName: c.firstName,
		lastName: c.lastName,
		description: c.description,
		visibility: c.visibility,
		avatarPhotoId: null
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
			async listForContactVisibleTo() {
				return [];
			},
			async listPageForContactVisibleTo() {
				return [];
			},
			async deleteOwn() {
				return false;
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
		expect(f.entries[0].body).toBe('Met @{contact:julia} at the lake, she is @{contact:marco}’s sister');
		expect(f.mentions.get(result.entryId)).toEqual(['marco']);
	});

	it('creates a queued person inline, then resolves the handle to them', async () => {
		const f = fakes([{ id: 'marco', displayName: 'Marco' }]);
		const result = await captureMoment(f.deps, author, {
			...base,
			body: '@Julia is @Marco’s sister',
			newPeople: ['Julia']
		});

		expect(result.createdContactIds).toHaveLength(1);
		const julia = f.contacts.find((c) => c.displayName === 'Julia')!;
		expect(julia.createdBy).toBe('u1');
		expect(julia.visibility).toBe('shared');
		expect(result.anchorContactId).toBe(julia.id);
		expect(f.entries[0].body).toBe(`@{contact:${julia.id}} is @{contact:marco}’s sister`);
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
			body: '@Sam and @Kim',
			newPeople: ['Kim']
		});
		expect(result.anchorContactId).toBe('secret');
		expect(f.contacts.find((c) => c.displayName === 'Kim')!.visibility).toBe('private');
		expect(f.entries[0].visibility).toBe('private');
	});

	it('offers no link when only one person is involved', async () => {
		const f = fakes([{ id: 'marco', displayName: 'Marco' }]);
		const result = await captureMoment(f.deps, author, { ...base, body: 'Coffee with @Marco' });
		expect(result.linkSuggestion).toBeNull();
		expect(f.mentions.get(result.entryId)).toEqual([]);
	});
});

describe('audienceCandidates', () => {
	const all: ContactSummary[] = [
		{ id: 'a', displayName: 'A', firstName: null, lastName: null, description: null, visibility: 'shared', avatarPhotoId: null },
		{ id: 'b', displayName: 'B', firstName: null, lastName: null, description: null, visibility: 'private', avatarPhotoId: null }
	];
	it('limits a shared entry to household-visible people, a private one to everyone visible', () => {
		expect(audienceCandidates(all, 'shared').map((c) => c.id)).toEqual(['a']);
		expect(audienceCandidates(all, 'private').map((c) => c.id)).toEqual(['a', 'b']);
	});
});
