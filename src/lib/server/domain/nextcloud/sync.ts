import type { Locale } from '../../../i18n/locales';
import type { IncomingCard, NextcloudSource } from '../../../import-match/card';
import type { Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import { activityRecord } from '../activity/activity';
import type { ContactReviewWriter } from '../import/contact-review';
import type { ImportWording } from '../import/monica/plan';
import { completionOf, isCompleting, type PersonCompletion } from '../import/review-cards';
import type { ContactSourceRepository } from '../import/source-links';
import type { AvatarUpload, MediaStore } from '../media/avatars';
import type { AddressBookGateway, RemoteCard } from './address-book';
import { stellaHash, writeCard, type CardPicture } from './card-out';
import { cardPicture, pictureOfFile, storablePicture } from './card-photo';
import { factsOf, NOBODY_NEW, printOf, readCard } from './card-read';
import { asStellaPerson, cardAvatar, onCard, type KnownLabelOf } from './linked-person';
import { changedOnCard, syncConflicts, type PhotoPrints } from './sync-plan';
import type { LinkedPerson, MirroredCard, NextcloudStore } from './store';

/*
 * One sync of the household's Nextcloud address book (docs/02 §2.16.3). In first: what changed
 * in the book since the last sync, against the card as Stella last saw it — a linked card adds
 * what its person is missing and asks about what it says otherwise; a new card waits for the
 * matching review; a deleted one only unlinks. Then out: each linked, shared person Stella
 * changed since is written onto their card, unless a conflict about them is still waiting —
 * Stella's side stands until it is answered, and is written then. The sync token is saved last,
 * so a sync cut short simply runs again.
 */

export interface NextcloudSyncDeps {
	book: AddressBookGateway;
	store: NextcloudStore;
	sources: Pick<ContactSourceRepository, 'answersFor'>;
	writer: ContactReviewWriter;
	media: Pick<MediaStore, 'read'>;
	/** Stores a card's picture as the person's photo: the path every new avatar takes. */
	setAvatar(uploader: Viewer, contactId: string, upload: AvatarUpload): Promise<string>;
	clock: Clock;
	ids: IdGenerator;
}

export interface NextcloudSyncRequest {
	/** The Nextcloud actor: everything the sync writes is theirs, and only shared people are. */
	system: Viewer;
	source: NextcloudSource;
	wording: Pick<ImportWording, 'fieldLabel'> & { knownLabel: KnownLabelOf };
	locale: Locale;
}

export interface NextcloudSyncOutcome {
	/** Cards nobody has answered for yet, waiting in the matching review. */
	newCards: number;
	/** Linked people a changed card completed or asked about. */
	updated: number;
	/** Cards Stella wrote. */
	written: number;
	/** Conflicts the sync found. */
	conflicts: number;
	/** Links dropped: a card deleted, or a person made private. */
	unlinked: number;
}

export async function syncNextcloud(
	deps: NextcloudSyncDeps,
	request: NextcloudSyncRequest
): Promise<NextcloudSyncOutcome> {
	const { system, source } = request;
	const household = system.householdId;
	const now = deps.clock.now();
	const outcome: NextcloudSyncOutcome = {
		newCards: 0,
		updated: 0,
		written: 0,
		conflicts: 0,
		unlinked: await deps.store.unlinkPrivate(household, source)
	};

	const token = await deps.store.syncToken(household, source);
	const changes = await deps.book.changesSince(token);
	const held = new Map((await deps.store.cards(household, source)).map((c) => [c.href, c]));

	const drop = async (href: string) => {
		if (await deps.store.dropCard(household, source, href)) outcome.unlinked++;
		held.delete(href);
	};
	const changedHrefs = new Set(changes.changed.map((c) => c.href));
	const gone = changes.complete
		? [...held.keys()].filter((href) => !changedHrefs.has(href))
		: changes.deleted.filter((href) => held.has(href));
	for (const href of gone) await drop(href);

	// ── In ──
	const linked = await deps.store.linkedPeople(system, source);
	const completions: PersonCompletion[] = [];
	const pictures: { contactId: string; picture: CardPicture }[] = [];
	/** People in step before the sync, whose stored hash follows what the cards bring in. */
	const inStep = new Set<string>();
	for (const remote of changes.changed) {
		const before = held.get(remote.href);
		// A card as Stella last wrote or read it: nothing new, and no echo of Stella's own write.
		if (before?.etag === remote.etag) continue;
		const card = readCard(remote.vcard);
		if (!card) continue;
		// Two paths with one UID: the first one held stays the card.
		const twin = [...held.values()].find((c) => c.uid === card.key && c.href !== remote.href);
		if (twin) continue;
		if (before && before.uid !== card.key) await drop(remote.href);

		const base = before && before.uid === card.key ? before : null;
		await deps.store.saveCard(household, source, {
			href: remote.href,
			uid: card.key,
			etag: remote.etag,
			vcard: remote.vcard
		});
		held.set(remote.href, {
			href: remote.href,
			uid: card.key,
			etag: remote.etag,
			vcard: remote.vcard,
			stellaHash: base?.stellaHash ?? null
		});

		const person = linked.get(card.key);
		if (!person) continue;
		const found = await bringIn(deps, request, { remote, base, card, person }, now);
		if (base && base.stellaHash === stellaHash(onCard(person, request.wording.knownLabel))) {
			inStep.add(person.id);
		}
		if (found.completion) completions.push(found.completion);
		if (found.picture) pictures.push({ contactId: person.id, picture: found.picture });
		if (found.conflicts > 0) {
			outcome.conflicts += found.conflicts;
		}
		if (found.completion || found.conflicts > 0) outcome.updated++;
	}

	if (completions.length > 0) {
		const audit = activityRecord(
			deps,
			system,
			{
				kind: 'contacts.reviewed',
				people: 0,
				completed: completions.length,
				source,
				visibility: 'shared',
				locale: request.locale
			},
			now
		);
		await deps.writer.applyReview(
			system,
			{ newPeople: NOBODY_NEW, completions, links: [], at: now },
			audit
		);
	}
	for (const { contactId, picture } of pictures) {
		const storable = storablePicture(picture);
		if (!storable) continue;
		const { bytes, width, height } = storable;
		await deps.setAvatar(system, contactId, { image: bytes, thumb: bytes, width, height });
	}

	// ── Out ──
	const people = await deps.store.linkedPeople(system, source);
	const waiting = new Set((await deps.store.conflicts(system)).map((c) => c.contactId));
	for (const card of held.values()) {
		const person = people.get(card.uid);
		if (!person) continue;
		const hash = stellaHash(onCard(person, request.wording.knownLabel));
		if (inStep.has(person.id)) {
			// What came in is what the person now holds: the card says it already.
			await deps.store.setStellaHash(household, source, card.href, hash);
			continue;
		}
		if (hash === card.stellaHash || waiting.has(person.id)) continue;
		const result = await writeOut(deps, request, card, person, hash);
		if (result === 'gone') await drop(card.href);
		if (result === 'written') outcome.written++;
	}

	const answers = await deps.sources.answersFor(system, source);
	outcome.newCards = [...held.values()].filter((c) => !answers.has(c.uid)).length;
	await deps.store.saveSyncToken(household, source, changes.token, now);
	return outcome;
}

/** What one changed linked card brings in, worked out against the card as last seen. */
async function bringIn(
	deps: NextcloudSyncDeps,
	request: NextcloudSyncRequest,
	{
		base,
		card,
		person,
		remote
	}: { remote: RemoteCard; base: MirroredCard | null; card: IncomingCard; person: LinkedPerson },
	now: number
): Promise<{
	completion: PersonCompletion | null;
	picture: CardPicture | null;
	conflicts: number;
}> {
	const picture = cardPicture(remote.vcard);
	const photos: PhotoPrints = {
		card: printOf(picture),
		base: base ? printOf(cardPicture(base.vcard)) : null,
		stella: null
	};
	// Stella's picture is read only when the card has one to compare it with.
	if (picture && person.avatar) {
		const bytes = await deps.media.read(person.avatar.path);
		photos.stella = bytes ? printOf(pictureOfFile(bytes, person.avatar.mime)) : null;
	}

	const changed = changedOnCard(base ? readCard(base.vcard) : null, card, photos);
	const stella = asStellaPerson(person);
	// A picture Stella could not store is not asked about: taking it could not be done.
	const conflicts = syncConflicts(changed, stella, photos).filter(
		(c) => c.kind !== 'photo' || (picture !== null && storablePicture(picture) !== null)
	);
	if (conflicts.length > 0) {
		await deps.store.putConflicts(
			request.system.householdId,
			request.source,
			person.id,
			conflicts,
			now
		);
	}
	const completion = completionOf(changed, stella, [], {
		ids: deps.ids,
		now,
		wording: request.wording,
		locale: request.locale
	});
	return {
		completion: isCompleting(completion) ? { ...completion, photo: false } : null,
		picture: completion.photo ? picture : null,
		conflicts: conflicts.length
	};
}

/** Write a person onto their card; a rewrite that changes no fact only notes them in step. */
async function writeOut(
	deps: NextcloudSyncDeps,
	request: NextcloudSyncRequest,
	card: MirroredCard,
	person: LinkedPerson,
	hash: string
): Promise<'written' | 'in-step' | 'stale' | 'gone'> {
	const { householdId } = request.system;
	const avatar = cardAvatar(person);
	const bytes = avatar ? await deps.media.read(avatar.path) : null;
	const picture = avatar && bytes ? pictureOfFile(bytes, avatar.mime) : null;
	const vcard = writeCard(card.vcard, onCard(person, request.wording.knownLabel), picture);
	if (factsOf(vcard) === factsOf(card.vcard)) {
		await deps.store.setStellaHash(householdId, request.source, card.href, hash);
		return 'in-step';
	}
	const put = await deps.book.put(card.href, vcard, card.etag);
	if (put === 'stale' || put === 'gone') return put;
	await deps.store.saveCard(householdId, request.source, {
		href: card.href,
		uid: card.uid,
		etag: put.etag,
		vcard
	});
	await deps.store.setStellaHash(householdId, request.source, card.href, hash);
	return 'written';
}
