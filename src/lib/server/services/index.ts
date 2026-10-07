import { createServices, type AppServices } from './app-services';
import { APP_VERSION } from '../../version';
import { systemClock } from '../clock';
import { getConfig } from '../config';
import { getDb, getSqlite } from '../db';
import { createDrizzleAttentionRepository } from '../db/attention-repository';
import { createDrizzleCircleRepository } from '../db/circle-repository';
import { createDrizzleCirclePhotoRepository } from '../db/circle-photo-repository';
import { createDrizzleCutRepository } from '../db/cut-repository';
import { createDrizzleStreamRepository } from '../db/stream-repository';
import { createDrizzleGraphRepository } from '../db/graph-repository';
import { createDrizzleJournalRepository } from '../db/journal-repository';
import { createDrizzleContactFieldRepository } from '../db/contact-field-repository';
import { createDrizzleImportantDateRepository } from '../db/important-date-repository';
import { createDrizzleImportRepository } from '../db/import-repository';
import { createDrizzleInteractionRepository } from '../db/interaction-repository';
import { createDrizzleMentionedInRepository } from '../db/mentioned-in-repository';
import { createDrizzleNoteRepository } from '../db/note-repository';
import { createDrizzlePhotoRepository } from '../db/photo-repository';
import { createFileMediaStore } from '../media/file-store';
import { createGitHubReleaseFeed } from '../release/github-feed';
import { createUpdateCheck, type UpdateCheck } from '../domain/release/update-check';
import { parseVersion } from '../domain/release/version';
import { createDrizzleArchiveRepository } from '../db/archive-repository';
import { createDrizzleRestoreRepository } from '../db/restore-repository';
import type { ArchiveDeps, ArchiveRepository } from '../domain/archive/archive';
import type { ImportArchiveDeps, RestoreRepository } from '../domain/archive/import';
import { createDrizzleRelationshipRepository } from '../db/relationship-repository';
import { withNamesakeContext } from '../domain/mentions/namesake-context';
import { createDrizzleSuggestionDismissalRepository } from '../db/suggestion-dismissal-repository';
import { createDrizzleSearchRepository } from '../db/search-repository';
import type { MemberDeps, MemberRepository } from '../domain/household/members';
import type { MentionedInDeps, MentionedInRepository } from '../domain/mentions/mentioned-in';
import { createDrizzleMemberRepository } from '../db/member-repository';
import { createDrizzleTagRepository } from '../db/tag-repository';
import type {
	ContactFieldDeps,
	ContactFieldRepository
} from '../domain/contact-fields/contact-fields';
import type { SearchDeps, SearchRepository } from '../domain/search/search';
import type { StoryDeps } from '../domain/story/story';
import type { AttentionRepository } from '../domain/attention/last-touched';
import type { NoteDeps, NoteRepository } from '../domain/notes/notes';
import type { JournalDeps, JournalRepository } from '../domain/journal/journal';
import type {
	RelationshipDeps,
	RelationshipRepository
} from '../domain/relationships/relationships';
import type {
	SuggestionDismissalRepository,
	SuggestionReviewDeps
} from '../domain/relationships/suggestion-review';
import type { FamilyReadDeps } from '../domain/relationships/family';
import type {
	RelationshipTypeDeps,
	RelationshipTypeRepository
} from '../domain/relationships/relationship-types';
import type { TagDeps, TagRepository } from '../domain/tags/tags';
import type { GraphRepository } from '../db/graph-repository';
import type { CircleDeps, CircleRepository } from '../domain/circles/circles';
import {
	prepareCirclePhotoUpload,
	type CirclePhotoDeps,
	type CirclePhotoRepository
} from '../domain/circles/circle-photos';
import type { StreamDeps, StreamRepository } from '../domain/stream/stream';
import { captureMoment, type CaptureMomentDeps } from '../domain/moments/moments';
import type {
	CommandActor,
	CommandDeps,
	CommandReceiptRepository
} from '../domain/commands/dispatch';
import type { Viewer } from '../access/visibility';
import { createDrizzleCommandReceiptRepository } from '../db/command-receipt-repository';
import { createDrizzleEntryOwnership } from '../db/entry-ownership';
import {
	attachCirclePhoto,
	attachGalleryPhoto,
	attachMomentPhoto
} from '../domain/commands/photos';
import { writeJournalEntry } from '../domain/journal/write-entry';
import { addContactField } from '../domain/contact-fields/contact-fields';
import { addImportantDate } from '../domain/dates/important-dates';
import { writeNote } from '../domain/notes/write-note';
import { logInteractionChecked } from '../domain/interactions/log-checked';
import { onVisibleContact } from '../domain/contacts/require-visible';
import { addRelationshipChecked } from '../domain/relationships/add-checked';
import { addRelationshipsOrRefuse } from '../domain/relationships/add-many';
import { addPerson } from '../domain/contacts/add-person';
import { createContact } from '../domain/contacts/contacts';
import { assignTagByName } from '../domain/tags/tags';
import { joinCircleByName } from '../domain/circles/circles';
import type { ImportantDateDeps, ImportantDateRepository } from '../domain/dates/important-dates';
import type { ImportDeps, ImportRepository } from '../domain/import/apply';
import type { ImportedPhotoDeps } from '../domain/import/monica/photos';
import type { InteractionDeps, InteractionRepository } from '../domain/interactions/interactions';
import {
	setContactAvatar,
	type AvatarDeps,
	type MediaStore,
	type MediaStreamSource,
	type PhotoRepository
} from '../domain/media/avatars';
import type { CutDeps, CutRepository } from '../domain/media/cuts';
import type { FramingDeps, FramingRepository } from '../domain/media/framing';
import type { GalleryDeps } from '../domain/media/gallery';
import type { GalleryUploadDeps } from '../domain/media/gallery-upload';
import type { JournalPhotoDeps } from '../domain/media/journal-photos';
import { ulidGenerator } from '../id';
import { createDrizzleImmichIgnoreRepository } from '../db/immich-ignore-repository';
import { createDrizzleImmichLinkRepository } from '../db/immich-link-repository';
import { createDrizzleImmichNameIgnoreRepository } from '../db/immich-name-ignore-repository';
import type { AddFromImmichDeps } from '../domain/immich/add-from-immich';
import type {
	ImmichNameIgnoreDeps,
	ImmichNameIgnoreRepository
} from '../domain/immich/name-ignores';
import { createImmichConnection, type ImmichConnection } from '../domain/immich/connection';
import type { ImmichGateway } from '../domain/immich/gateway';
import type { ImmichGlimpseDeps, ImmichMediaDeps } from '../domain/immich/glimpse';
import type { ImmichIgnoreDeps, ImmichIgnoreRepository } from '../domain/immich/ignores';
import type { ImmichLinkDeps, ImmichLinkRepository } from '../domain/immich/links';
import type { ImmichMatchingDeps } from '../domain/immich/matching';
import type { UseImmichPhotoDeps } from '../domain/immich/use-as-photo';
import { createImmichMediaSigner, type ImmichMediaSigner } from '../domain/immich/signed-media';
import { demoImmichLibrary } from '../immich/demo-library';
import { createFakeImmichGateway } from '../immich/fake-gateway';
import { createHttpImmichGateway } from '../immich/http-gateway';

/*
 * Composition root — the single place that wires concrete adapters (Drizzle repositories,
 * system clock, ULID generator, Bun password hashing) into the domain use-cases' `deps`
 * (docs/08 §8.3). Everything is lazy so importing this module has no side effects and the
 * build's route analysis never touches the Bun-only database (see db/index.ts).
 *
 * The object graph is moving into `AppServices` one bounded context at a time (AR-01): a
 * grouped context is built by `createServices` once per process and handed to every request
 * as `locals.services`; the `get*()` factories below wire the contexts not grouped yet.
 */

let services: AppServices | null = null;

/**
 * The process's one `AppServices`, built on the first request. Only `hooks.server.ts` calls
 * this; everything else reads `locals.services`, or — for a factory below that needs a grouped
 * repository — this same graph, so no repository exists twice.
 */
export function getServices(): AppServices {
	return (services ??= createServices({
		config: getConfig(),
		db: getDb(),
		clock: systemClock,
		ids: ulidGenerator,
		// Not grouped yet (AR-01): their contexts' factories below hand the people context the
		// same lazily built instance they hand everyone else.
		relationships: getRelationships(),
		media: getMediaStore()
	}));
}

/** The people context, for the factories of contexts not grouped yet. */
function people(): AppServices['people'] {
	return getServices().people;
}

/*
 * The release check, or null when this instance makes none: either the operator did not ask
 * for it, or this build carries no readable release number and has nothing to compare.
 * Built once, because the answer it caches is the whole point (docs/02 §2.17.1).
 */
let updateCheck: UpdateCheck | null | undefined;
export function getUpdateCheck(): UpdateCheck | null {
	if (updateCheck !== undefined) return updateCheck;
	const config = getConfig();
	if (!config.updateCheck || !parseVersion(APP_VERSION)) return (updateCheck = null);
	return (updateCheck = createUpdateCheck({
		feed: createGitHubReleaseFeed({ version: APP_VERSION, url: config.updateFeedUrl || undefined }),
		clock: systemClock,
		currentVersion: APP_VERSION
	}));
}

let relationshipRepository: (RelationshipRepository & RelationshipTypeRepository) | null = null;

function getRelationshipRepository(): RelationshipRepository & RelationshipTypeRepository {
	return (relationshipRepository ??= createDrizzleRelationshipRepository(getDb()));
}

export function getRelationships(): RelationshipRepository {
	return getRelationshipRepository();
}

/** The relationship vocabulary — the built-in types and the household's own (docs/02 §2.4). */
export function getRelationshipTypes(): RelationshipTypeRepository {
	return getRelationshipRepository();
}

export function getRelationshipDeps(): RelationshipDeps {
	return {
		relationships: getRelationships(),
		types: getRelationshipTypes(),
		ids: ulidGenerator,
		clock: systemClock
	};
}

let suggestionDismissalRepository: SuggestionDismissalRepository | null = null;

/** The claims the household has declined (docs/04 ADR-117). */
export function getSuggestionDismissals(): SuggestionDismissalRepository {
	return (suggestionDismissalRepository ??= createDrizzleSuggestionDismissalRepository(getDb()));
}

/** Deps for the on-demand suggestion review and the dismissal log (§6.5). */
export function getSuggestionReviewDeps(): SuggestionReviewDeps {
	return {
		relationships: getRelationships(),
		dismissals: getSuggestionDismissals(),
		ids: ulidGenerator,
		clock: systemClock
	};
}

/** Deps for the family cards of the person page, read in one go (docs/04 §4.11). */
export function getFamilyReadDeps(): FamilyReadDeps {
	return {
		family: getGraphRepository(),
		relationships: getRelationships(),
		dismissals: getSuggestionDismissals()
	};
}

/** Deps for managing the custom relationship types (docs/02 §2.4). */
export function getRelationshipTypeDeps(): RelationshipTypeDeps {
	return { types: getRelationshipTypes(), ids: ulidGenerator };
}

let noteRepository: NoteRepository | null = null;

export function getNotes(): NoteRepository {
	return (noteRepository ??= createDrizzleNoteRepository(getDb()));
}

export function getNoteDeps(): NoteDeps {
	return { notes: getNotes(), ids: ulidGenerator, clock: systemClock };
}

let journalRepository: JournalRepository | null = null;

export function getJournal(): JournalRepository {
	return (journalRepository ??= createDrizzleJournalRepository(getDb()));
}

export function getJournalDeps(): JournalDeps {
	return { journal: getJournal(), media: getMediaStore(), ids: ulidGenerator, clock: systemClock };
}

let contactFieldRepository: ContactFieldRepository | null = null;

export function getContactFields(): ContactFieldRepository {
	return (contactFieldRepository ??= createDrizzleContactFieldRepository(getDb()));
}

export function getContactFieldDeps(): ContactFieldDeps {
	return { fields: getContactFields(), ids: ulidGenerator, clock: systemClock };
}

let importantDateRepository: ImportantDateRepository | null = null;

export function getImportantDates(): ImportantDateRepository {
	return (importantDateRepository ??= createDrizzleImportantDateRepository(getDb()));
}

export function getImportantDateDeps(): ImportantDateDeps {
	return { dates: getImportantDates(), ids: ulidGenerator, clock: systemClock };
}

let interactionRepository: InteractionRepository | null = null;

export function getInteractions(): InteractionRepository {
	return (interactionRepository ??= createDrizzleInteractionRepository(getDb()));
}

export function getInteractionDeps(): InteractionDeps {
	return { interactions: getInteractions(), ids: ulidGenerator, clock: systemClock };
}

let importRepository: ImportRepository | null = null;

/** Deps for the Monica import (docs/02 §2.16); the wizard is the only caller. */
export function getImportDeps(): ImportDeps {
	return {
		importer: (importRepository ??= createDrizzleImportRepository(getDb())),
		clock: systemClock
	};
}

let mentionedInRepository: MentionedInRepository | null = null;

export function getMentionedIn(): MentionedInRepository {
	return (mentionedInRepository ??= createDrizzleMentionedInRepository(getDb()));
}

/** The passive "Mentioned in" list only reads, so it needs no clock or ids either. */
export function getMentionedInDeps(): MentionedInDeps {
	return { mentions: getMentionedIn() };
}

/** The story timeline reads both sources; it writes nothing, so it needs no clock or ids. */
export function getStoryDeps(): StoryDeps {
	return { journal: getJournal(), interactions: getInteractions() };
}

let searchRepository: SearchRepository | null = null;

export function getSearch(): SearchRepository {
	return (searchRepository ??= createDrizzleSearchRepository(getDb()));
}

export function getSearchDeps(): SearchDeps {
	return { search: getSearch() };
}

let memberRepository: MemberRepository | null = null;

/** The household's members, for putting a name on what each of them wrote (docs/02 §2.23). */
export function getMembers(): MemberRepository {
	return (memberRepository ??= createDrizzleMemberRepository(getDb()));
}

export function getMemberDeps(): MemberDeps {
	return { members: getMembers() };
}

let tagRepository: TagRepository | null = null;

export function getTags(): TagRepository {
	return (tagRepository ??= createDrizzleTagRepository(getDb()));
}

export function getTagDeps(): TagDeps {
	return { tags: getTags(), ids: ulidGenerator, clock: systemClock };
}

let graphRepository: GraphRepository | null = null;

/**
 * Repository for the explorer's one-shot visible-graph load (docs/04 §4.11). The route hands
 * the resulting slim snapshot to the browser, which explores it entirely client-side.
 */
export function getGraphRepository(): GraphRepository {
	return (graphRepository ??= createDrizzleGraphRepository(getDb()));
}

let photoRepository: ReturnType<typeof createDrizzlePhotoRepository> | null = null;
let archiveRepository: ArchiveRepository | null = null;

/** Deps for exporting the household as one archive (docs/02 §2.15). */
export function getArchiveDeps(): ArchiveDeps {
	archiveRepository ??= createDrizzleArchiveRepository(getDb(), getSqlite());
	return { archive: archiveRepository, ids: ulidGenerator, clock: systemClock };
}

let restoreRepository: RestoreRepository | null = null;

/** Deps for restoring a household from an archive (docs/02 §2.15). */
export function getImportArchiveDeps(): ImportArchiveDeps {
	restoreRepository ??= createDrizzleRestoreRepository(getDb(), getSqlite());
	return {
		restore: restoreRepository,
		media: getMediaStore(),
		ids: ulidGenerator,
		clock: systemClock
	};
}

let mediaStore: (MediaStore & MediaStreamSource) | null = null;

export function getPhotos(): PhotoRepository {
	return photoAdapter();
}

/** One Drizzle adapter serves both photo ports; each use-case sees only its own. */
function photoAdapter(): PhotoRepository & FramingRepository {
	return (photoRepository ??= createDrizzlePhotoRepository(getDb()));
}

export function getMediaStore(): MediaStore & MediaStreamSource {
	return (mediaStore ??= createFileMediaStore(getConfig().mediaDir));
}

export function getAvatarDeps(): AvatarDeps {
	return { photos: getPhotos(), media: getMediaStore(), ids: ulidGenerator, clock: systemClock };
}

export function getImportedPhotoDeps(): ImportedPhotoDeps {
	return { photos: getPhotos(), media: getMediaStore(), clock: systemClock };
}

/** Deps for the photo gallery on a person (docs/02 §2.14). */
export function getGalleryDeps(): GalleryDeps {
	return { photos: getPhotos(), media: getMediaStore(), clock: systemClock };
}

/** Deps for wearing a gallery photo through a chosen square (docs/02 §2.14). */
export function getFramingDeps(): FramingDeps {
	return {
		framings: photoAdapter(),
		media: getMediaStore(),
		ids: ulidGenerator,
		clock: systemClock
	};
}

export function getGalleryUploadDeps(): GalleryUploadDeps {
	return { photos: getPhotos(), media: getMediaStore(), ids: ulidGenerator, clock: systemClock };
}

export function getJournalPhotoDeps(): JournalPhotoDeps {
	return { photos: getPhotos(), media: getMediaStore(), ids: ulidGenerator, clock: systemClock };
}

let streamRepository: StreamRepository | null = null;

export function getStreamDeps(): StreamDeps {
	return { stream: (streamRepository ??= createDrizzleStreamRepository(getDb())) };
}

export function getCaptureMomentDeps(): CaptureMomentDeps {
	return {
		contacts: people().contacts,
		journal: getJournal(),
		ids: ulidGenerator,
		clock: systemClock
	};
}

let commandReceiptRepository: CommandReceiptRepository | null = null;

function viewerOf(actor: CommandActor): Viewer {
	return { id: actor.userId, householdId: actor.householdId };
}

/** The dispatcher every change goes through (docs/04 §4.11.2). */
export function getCommandDeps(): CommandDeps {
	const capture = getCaptureMomentDeps();
	const receipts = (commandReceiptRepository ??= createDrizzleCommandReceiptRepository(getDb()));
	return {
		receipts,
		clock: systemClock,
		handlers: {
			// A moment carries its own visibility, so it is also the author's default for anyone
			// the moment creates inline — and what a photo sent after it inherits.
			'moment.capture': async (actor, payload) => ({
				...(await withNamesakeContext(people().namesakeContextDeps, viewerOf(actor), () =>
					captureMoment(
						capture,
						{
							userId: actor.userId,
							householdId: actor.householdId,
							locale: actor.locale,
							defaultVisibility: payload.visibility
						},
						payload
					)
				)),
				visibility: payload.visibility
			}),
			'tag.assign': onVisibleContact(people().contacts, async (actor, payload) => ({
				tagId: await assignTagByName(
					getTagDeps(),
					actor.householdId,
					payload.contactId,
					payload.name,
					payload.color
				)
			})),
			'circle.join': onVisibleContact(people().contacts, async (actor, payload) => ({
				circleId: await joinCircleByName(
					getCircleDeps(),
					{ ...actor, defaultVisibility: 'shared' },
					payload.contactId,
					payload.circleName,
					payload.role
				)
			})),
			'contact.add': (actor, payload) =>
				addPerson(
					{ ...people().contactDeps, accounts: getServices().auth.accounts },
					actor,
					payload
				),
			'relationship.add': (actor, payload) =>
				addRelationshipChecked(
					{ ...getRelationshipDeps(), contacts: people().contacts },
					actor,
					payload
				),
			'relationship.addMany': (actor, payload) =>
				addRelationshipsOrRefuse(
					{ ...getRelationshipDeps(), contacts: people().contacts },
					actor,
					payload
				),
			'interaction.log': (actor, payload) =>
				logInteractionChecked(
					{ ...getInteractionDeps(), contacts: people().contacts },
					actor,
					payload
				),
			'note.add': (actor, payload) =>
				withNamesakeContext(people().namesakeContextDeps, viewerOf(actor), () =>
					writeNote({ ...getNoteDeps(), contacts: people().contacts }, actor, payload)
				),
			'moment.photo': (actor, payload) =>
				attachMomentPhoto(
					{
						receipts,
						entries: createDrizzleEntryOwnership(getDb()),
						photos: getJournalPhotoDeps()
					},
					actor,
					payload
				),
			'journal.write': (actor, payload) =>
				withNamesakeContext(people().namesakeContextDeps, viewerOf(actor), () =>
					writeJournalEntry({ ...getJournalDeps(), contacts: people().contacts }, actor, payload)
				),
			'field.add': onVisibleContact(people().contacts, async (_actor, payload) => ({
				fieldId: await addContactField(getContactFieldDeps(), payload)
			})),
			'date.add': onVisibleContact(people().contacts, async (_actor, payload) => ({
				dateId: await addImportantDate(getImportantDateDeps(), payload)
			})),
			// Checks the person once; the photos following it land where it says (`photos.ts`).
			'gallery.add': onVisibleContact(people().contacts, async (_actor, payload) => ({
				contactId: payload.contactId,
				visibility: payload.visibility
			})),
			'gallery.photo': (actor, payload) =>
				attachGalleryPhoto(
					{ receipts, contacts: people().contacts, photos: getGalleryUploadDeps() },
					actor,
					payload
				),
			// Checks the circle and the role once; the photos following it land where it says.
			'circleGallery.add': (actor, payload) =>
				prepareCirclePhotoUpload(getCirclePhotoDeps(), viewerOf(actor), payload),
			'circleGallery.photo': (actor, payload) => {
				const photos = getCirclePhotoDeps();
				return attachCirclePhoto({ receipts, circles: photos.circles, photos }, actor, payload);
			}
		}
	};
}

let circleRepository: CircleRepository | null = null;

export function getCircleDeps(): CircleDeps {
	return {
		circles: (circleRepository ??= createDrizzleCircleRepository(getDb())),
		ids: ulidGenerator,
		clock: systemClock
	};
}

let circlePhotoRepository: CirclePhotoRepository | null = null;

/** Deps for a circle's photos (docs/02 §2.4.2). */
export function getCirclePhotoDeps(): CirclePhotoDeps {
	return {
		circlePhotos: (circlePhotoRepository ??= createDrizzleCirclePhotoRepository(getDb())),
		circles: getCircleDeps().circles,
		media: getMediaStore(),
		ids: ulidGenerator,
		clock: systemClock
	};
}

let cutRepository: CutRepository | null = null;

/** Deps for profile pictures cut from a group photo (docs/02 §2.14). */
export function getCutDeps(): CutDeps {
	return {
		cuts: (cutRepository ??= createDrizzleCutRepository(getDb())),
		contacts: people().contacts,
		media: getMediaStore(),
		ids: ulidGenerator,
		clock: systemClock
	};
}

let attentionRepository: AttentionRepository | null = null;

export function getAttention(): AttentionRepository {
	return (attentionRepository ??= createDrizzleAttentionRepository(getDb()));
}

/** The household's Immich, once wired: how to ask it, whose it is, and where links point. */
export interface Immich {
	gateway: ImmichGateway;
	connection: ImmichConnection;
	publicUrl: string;
	/** Signs every image URL the browser gets for Immich (docs/02 §2.24.4). */
	signer: ImmichMediaSigner;
}

/*
 * Immich, or null when this instance has none — the feature then appears nowhere
 * (docs/04 §4.3). Built once, because the connection caches its status. The demo
 * server gets the in-memory stand-in, so the feature can be tried without a real Immich.
 */
let immich: Immich | null | undefined;
export function getImmich(): Immich | null {
	if (immich !== undefined) return immich;
	const config = getConfig().immich;
	if (!config) return (immich = null);
	const gateway =
		config.mode === 'demo'
			? createFakeImmichGateway(demoImmichLibrary())
			: createHttpImmichGateway({ baseUrl: config.url, apiKey: config.apiKey });
	return (immich = {
		gateway,
		connection: createImmichConnection({ gateway, clock: systemClock }),
		publicUrl: config.publicUrl,
		// The session secret, which production refuses to start without; the signer keeps its own
		// use of it apart from any other.
		signer: createImmichMediaSigner({ secret: getConfig().sessionSecret, clock: systemClock })
	});
}

let immichLinkRepository: ImmichLinkRepository | null = null;

function getImmichLinks(): ImmichLinkRepository {
	return (immichLinkRepository ??= createDrizzleImmichLinkRepository(getDb()));
}

/** Deps for the strip of a linked person's photos, or null without Immich. */
export function getImmichGlimpseDeps(): ImmichGlimpseDeps | null {
	const configured = getImmich();
	if (!configured) return null;
	const { gateway, signer, publicUrl } = configured;
	return { links: getImmichLinks(), gateway, signer, publicUrl };
}

/** Deps for the signed proxy that serves every image from Immich, or null without Immich. */
export function getImmichMediaDeps(): ImmichMediaDeps | null {
	const configured = getImmich();
	if (!configured) return null;
	return {
		links: getImmichLinks(),
		contacts: people().contacts,
		gateway: configured.gateway,
		signer: configured.signer
	};
}

let immichIgnoreRepository: ImmichIgnoreRepository | null = null;

function getImmichIgnores(): ImmichIgnoreRepository {
	return (immichIgnoreRepository ??= createDrizzleImmichIgnoreRepository(getDb()));
}

let immichNameIgnoreRepository: ImmichNameIgnoreRepository | null = null;

function getImmichNameIgnores(): ImmichNameIgnoreRepository {
	return (immichNameIgnoreRepository ??= createDrizzleImmichNameIgnoreRepository(getDb()));
}

/** Deps for *Find your people* — both tabs, from one reading of Immich — or null without Immich. */
export function getImmichMatchingDeps(): ImmichMatchingDeps | null {
	const configured = getImmich();
	if (!configured) return null;
	return {
		links: getImmichLinks(),
		ignores: getImmichIgnores(),
		nameIgnores: getImmichNameIgnores(),
		contacts: people().contacts,
		contextReads: people().personContextDeps.contextReads,
		gateway: configured.gateway,
		signer: configured.signer,
		publicUrl: configured.publicUrl
	};
}

/** Deps for ignoring a face of *New from Immich* and taking it back, or null without Immich. */
export function getImmichNameIgnoreDeps(): ImmichNameIgnoreDeps | null {
	if (!getImmich()) return null;
	return { nameIgnores: getImmichNameIgnores(), clock: systemClock };
}

/** Deps for adding a person from an Immich face, or null without Immich. */
export function getAddFromImmichDeps(): AddFromImmichDeps | null {
	const linkDeps = getImmichLinkDeps();
	if (!linkDeps) return null;
	return {
		...linkDeps,
		addContact: (adder, input) =>
			createContact(people().contactDeps, { ...adder, defaultVisibility: 'shared' }, input)
	};
}

/** Deps for ignoring a proposal of the matching list and taking it back, or null without Immich. */
export function getImmichIgnoreDeps(): ImmichIgnoreDeps | null {
	if (!getImmich()) return null;
	return { ignores: getImmichIgnores(), contacts: people().contacts, clock: systemClock };
}

/**
 * Deps for keeping a photo from the Immich viewer as the person's own, or null without Immich:
 * the proxy's checks, then the path every new avatar takes (docs/02 §2.14).
 */
export function getUseImmichPhotoDeps(): UseImmichPhotoDeps | null {
	const configured = getImmich();
	if (!configured) return null;
	return {
		links: getImmichLinks(),
		contacts: people().contacts,
		signer: configured.signer,
		setAvatar: (uploader, contactId, upload) =>
			setContactAvatar(getAvatarDeps(), uploader, contactId, upload)
	};
}

/** Deps for linking a contact to an Immich person, or null without Immich. */
export function getImmichLinkDeps(): ImmichLinkDeps | null {
	const configured = getImmich();
	if (!configured) return null;
	return {
		links: getImmichLinks(),
		contacts: people().contacts,
		gateway: configured.gateway,
		clock: systemClock,
		ids: ulidGenerator
	};
}
