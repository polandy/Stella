import type { NextcloudSource } from '../../../import-match/card';
import type { Viewer } from '../../access/visibility';
import type { ActivityRecord } from '../activity/activity';
import type { ContactReviewWriter } from '../import/contact-review';
import type { ContactSourceRepository, RememberedAnswer } from '../import/source-links';
import type { MediaStore } from '../media/avatars';
import type { LinkedPerson, MirroredCard, NextcloudStore, StoredConflict } from './store';

/*
 * A household in memory for the sync's tests: people, the answers linking them to cards, and
 * what the store keeps. The fakes do what the Drizzle adapters do, with no visibility beyond
 * what a sync needs: only a shared, unarchived person is linked.
 */

export const BOOK: NextcloudSource = 'nextcloud:family/contacts';
export const SYSTEM: Viewer = { id: 'nextcloud', householdId: 'h1' };

export interface HouseholdPerson extends LinkedPerson {
	visibility: 'shared' | 'private';
	archived: boolean;
}

export function person(id: string, over: Partial<HouseholdPerson> = {}): HouseholdPerson {
	return {
		id,
		firstName: null,
		lastName: null,
		displayName: id,
		nickname: null,
		company: null,
		jobTitle: null,
		birthday: null,
		fields: [],
		homeLines: [],
		tags: [],
		hasPhoto: false,
		avatar: null,
		visibility: 'shared',
		archived: false,
		...over
	};
}

export function testHousehold() {
	const people = new Map<string, HouseholdPerson>();
	/** Card key → the person it is, or null when skipped. */
	const links = new Map<string, string | null>();
	const mirror = new Map<string, MirroredCard>();
	const conflicts: StoredConflict[] = [];
	const files = new Map<string, Uint8Array>();
	const audits: ActivityRecord[] = [];
	let token: string | null = null;
	let syncedAt: number | null = null;

	const linkable = (p: HouseholdPerson | undefined) =>
		p !== undefined && p.visibility === 'shared' && !p.archived;
	const dropConflictsOf = (contactId: string) => {
		for (let i = conflicts.length - 1; i >= 0; i--) {
			if (conflicts[i]!.contactId === contactId) conflicts.splice(i, 1);
		}
	};

	const store: NextcloudStore = {
		syncToken: async () => token,
		saveSyncToken: async (_h, _s, t, at) => {
			token = t;
			syncedAt = at;
		},
		syncedAt: async () => syncedAt,
		cards: async () => [...mirror.values()].map((c) => ({ ...c })),
		saveCard: async (_h, _s, card) => {
			mirror.set(card.href, { ...card, stellaHash: mirror.get(card.href)?.stellaHash ?? null });
		},
		setStellaHash: async (_h, _s, href, hash) => {
			const card = mirror.get(href);
			if (card) card.stellaHash = hash;
		},
		dropCard: async (_h, _s, href) => {
			const card = mirror.get(href);
			mirror.delete(href);
			if (!card || !links.has(card.uid)) return false;
			const contactId = links.get(card.uid);
			links.delete(card.uid);
			if (contactId) dropConflictsOf(contactId);
			return contactId !== null;
		},
		unlinkPrivate: async () => {
			let dropped = 0;
			for (const [uid, contactId] of links) {
				if (contactId && people.get(contactId)?.visibility === 'private') {
					links.delete(uid);
					dropConflictsOf(contactId);
					dropped++;
				}
			}
			return dropped;
		},
		linkedCard: async (_v, contactId) => {
			if (!linkable(people.get(contactId))) return null;
			const uid = [...links].find(([, id]) => id === contactId)?.[0];
			const card = [...mirror.values()].find((c) => c.uid === uid);
			return card ? { source: BOOK, card: { ...card } } : null;
		},
		linkedPeople: async () => {
			const linked = new Map<string, LinkedPerson>();
			for (const [uid, contactId] of links) {
				const p = contactId ? people.get(contactId) : undefined;
				if (linkable(p)) linked.set(uid, structuredClone(p!));
			}
			return linked;
		},
		putConflicts: async (_h, _s, contactId, found, at) => {
			for (const conflict of found) {
				const i = conflicts.findIndex(
					(c) => c.contactId === contactId && c.conflict.kind === conflict.kind
				);
				if (i !== -1) conflicts.splice(i, 1);
				const { displayName } = people.get(contactId)!;
				conflicts.push({ contactId, displayName, source: BOOK, conflict, foundAt: at });
			}
		},
		conflicts: async () => conflicts.filter((c) => linkable(people.get(c.contactId))),
		removeConflict: async (_v, contactId, kind) => {
			const i = conflicts.findIndex((c) => c.contactId === contactId && c.conflict.kind === kind);
			if (i === -1) return false;
			conflicts.splice(i, 1);
			return true;
		}
	};

	const sources: Pick<ContactSourceRepository, 'answersFor'> = {
		answersFor: async () =>
			new Map(
				[...links].map(([uid, contactId]): [string, RememberedAnswer] => [
					uid,
					contactId === null
						? { state: 'skipped' }
						: linkable(people.get(contactId))
							? { state: 'linked', personId: contactId, cardHash: '' }
							: { state: 'out-of-reach' }
				])
			)
	};

	const writer: ContactReviewWriter = {
		async applyReview(_viewer, write, audit) {
			for (const completion of write.completions) {
				const p = people.get(completion.personId)!;
				const { birthDate, birthDatePrecision, ...names } = completion.set;
				Object.assign(p, names);
				if (birthDate && birthDatePrecision)
					p.birthday = { value: birthDate, precision: birthDatePrecision };
				for (const f of completion.fields) {
					if (f.kind === 'phone' || f.kind === 'email' || f.kind === 'address') {
						p.fields.push({ kind: f.kind, value: f.value, label: f.label });
					}
				}
			}
			if (audit) audits.push(audit);
			return { people: 0, completed: write.completions.length };
		}
	};

	const media: Pick<MediaStore, 'read'> = { read: async (path) => files.get(path) ?? null };

	let photos = 0;
	const setAvatar = async (_uploader: Viewer, contactId: string, upload: { image: Uint8Array }) => {
		const photoId = `photo-${++photos}`;
		const path = `${photoId}.jpg`;
		files.set(path, upload.image);
		const p = people.get(contactId)!;
		p.hasPhoto = true;
		p.avatar = { photoId, path, mime: 'image/jpeg' };
		return photoId;
	};

	return {
		people,
		links,
		mirror,
		conflicts,
		files,
		audits,
		store,
		sources,
		writer,
		media,
		setAvatar,
		add(p: HouseholdPerson) {
			people.set(p.id, p);
			return p;
		}
	};
}
