import type { AccountDeps, AccountRepository } from './auth/accounts';
import type { ApiTokenDeps } from './auth/api-tokens';
import type {
	AuthorizationRequestDeps,
	CompleteLoginDeps,
	IdentityStore,
	OidcProvider
} from './auth/oidc/login';
import { SIGNED_OUT_PATH, type RpLogoutDeps } from './auth/oidc/logout';
import { createOidcProvider } from './auth/oidc/provider';
import type { OidcPolicy } from './auth/oidc/types';
import { hashPassword, verifyPassword } from './auth/password';
import type { SessionDeps, SessionRepository } from './auth/session';
import { APP_VERSION } from '../version';
import { systemClock } from './clock';
import { getConfig } from './config';
import { getDb, getSqlite } from './db';
import { createDrizzleAccountRepository } from './db/account-repository';
import { createDrizzleApiImportRepository } from './db/api-import-repository';
import { createDrizzleApiTokenRepository } from './db/api-token-repository';
import { createDrizzleAttentionRepository } from './db/attention-repository';
import { createDrizzleCircleRepository } from './db/circle-repository';
import { createDrizzleCirclePhotoRepository } from './db/circle-photo-repository';
import { createDrizzleContactRepository } from './db/contact-repository';
import { createDrizzleCutRepository } from './db/cut-repository';
import { createDrizzleStreamRepository } from './db/stream-repository';
import { createDrizzleGraphRepository } from './db/graph-repository';
import { createDrizzleJournalRepository } from './db/journal-repository';
import { createDrizzleIdentityStore } from './db/identity-store';
import { createDrizzleContactFieldRepository } from './db/contact-field-repository';
import { createDrizzleImportantDateRepository } from './db/important-date-repository';
import { createDrizzleImportRepository } from './db/import-repository';
import { createDrizzleInteractionRepository } from './db/interaction-repository';
import { createDrizzleMentionedInRepository } from './db/mentioned-in-repository';
import { createDrizzleNoteRepository } from './db/note-repository';
import { createDrizzlePhotoRepository } from './db/photo-repository';
import { createFileMediaStore } from './media/file-store';
import { createGitHubReleaseFeed } from './release/github-feed';
import { createUpdateCheck, type UpdateCheck } from './domain/release/update-check';
import { parseVersion } from './domain/release/version';
import { createDrizzleArchiveRepository } from './db/archive-repository';
import { createDrizzleRestoreRepository } from './db/restore-repository';
import type { ArchiveDeps, ArchiveRepository } from './domain/archive/archive';
import type { ImportArchiveDeps, RestoreRepository } from './domain/archive/import';
import { createDrizzleRelationshipRepository } from './db/relationship-repository';
import { createDrizzlePersonContextReads } from './db/person-context-reads';
import { createDrizzlePeopleStampReads } from './db/people-stamp-reads';
import type { PeopleStampDeps } from './domain/contacts/people-stamp';
import type { PersonContextDeps } from './domain/contacts/person-context';
import { withNamesakeContext, type NamesakeContextDeps } from './domain/mentions/namesake-context';
import {
	createDrizzleSuggestionDismissalRepository,
	createDrizzleSurnameDismissalRepository
} from './db/suggestion-dismissal-repository';
import { createDrizzleSurnameFacts } from './db/surname-facts';
import type {
	LastNameDeps,
	SurnameDismissalDeps,
	SurnameReviewDeps
} from './domain/contacts/last-names';
import { createDrizzleSearchRepository } from './db/search-repository';
import { createDrizzleSessionRepository } from './db/session-repository';
import type { MemberDeps, MemberRepository } from './domain/household/members';
import type { SelfContactDeps } from './domain/household/self-contact';
import type { MentionedInDeps, MentionedInRepository } from './domain/mentions/mentioned-in';
import { createDrizzleMemberRepository } from './db/member-repository';
import { createDrizzleTagRepository } from './db/tag-repository';
import type {
	ContactFieldDeps,
	ContactFieldRepository
} from './domain/contact-fields/contact-fields';
import type { SearchDeps, SearchRepository } from './domain/search/search';
import type { StoryDeps } from './domain/story/story';
import type { AttentionRepository } from './domain/attention/last-touched';
import type { ContactDeps, ContactRepository } from './domain/contacts/contacts';
import type { NameCandidateSource, SuggestionDeps } from './domain/contacts/suggestions';
import type { NameDeps, NameRepository } from './domain/contacts/name-parts';
import type { NoteDeps, NoteRepository } from './domain/notes/notes';
import type { JournalDeps, JournalRepository } from './domain/journal/journal';
import type { RelationshipDeps, RelationshipRepository } from './domain/relationships/relationships';
import type {
	SuggestionDismissalRepository,
	SuggestionReviewDeps
} from './domain/relationships/suggestion-review';
import type { FamilyReadDeps } from './domain/relationships/family';
import type {
	RelationshipTypeDeps,
	RelationshipTypeRepository
} from './domain/relationships/relationship-types';
import type { TagDeps, TagRepository } from './domain/tags/tags';
import type { GraphRepository } from './db/graph-repository';
import type { CircleDeps, CircleRepository } from './domain/circles/circles';
import {
	prepareCirclePhotoUpload,
	type CirclePhotoDeps,
	type CirclePhotoRepository
} from './domain/circles/circle-photos';
import type { StreamDeps, StreamRepository } from './domain/stream/stream';
import { captureMoment, type CaptureMomentDeps } from './domain/moments/moments';
import type { CommandActor, CommandDeps, CommandReceiptRepository } from './domain/commands/dispatch';
import type { Viewer } from './access/visibility';
import { createDrizzleCommandReceiptRepository } from './db/command-receipt-repository';
import { createDrizzleEntryOwnership } from './db/entry-ownership';
import { attachCirclePhoto, attachGalleryPhoto, attachMomentPhoto } from './domain/commands/photos';
import { writeJournalEntry } from './domain/journal/write-entry';
import { addContactField } from './domain/contact-fields/contact-fields';
import { addImportantDate } from './domain/dates/important-dates';
import { writeNote } from './domain/notes/write-note';
import { logInteractionChecked } from './domain/interactions/log-checked';
import { onVisibleContact } from './domain/contacts/require-visible';
import { addRelationshipChecked } from './domain/relationships/add-checked';
import { addRelationshipsOrRefuse } from './domain/relationships/add-many';
import { addPerson } from './domain/contacts/add-person';
import { assignTagByName } from './domain/tags/tags';
import { joinCircleByName } from './domain/circles/circles';
import type { ImportantDateDeps, ImportantDateRepository } from './domain/dates/important-dates';
import type { ImportDeps, ImportRepository } from './domain/import/apply';
import type { ApiImportDeps } from './domain/import/api/api-import';
import type { ImportedPhotoDeps } from './domain/import/monica/photos';
import type { InteractionDeps, InteractionRepository } from './domain/interactions/interactions';
import type { AvatarDeps, MediaStore, MediaStreamSource, PhotoRepository } from './domain/media/avatars';
import type { CutDeps, CutRepository } from './domain/media/cuts';
import type { FramingDeps, FramingRepository } from './domain/media/framing';
import type { GalleryDeps } from './domain/media/gallery';
import type { GalleryUploadDeps } from './domain/media/gallery-upload';
import type { JournalPhotoDeps } from './domain/media/journal-photos';
import { ulidGenerator } from './id';

/*
 * Composition root — the single place that wires concrete adapters (Drizzle repositories,
 * system clock, ULID generator, Bun password hashing) into the domain use-cases' `deps`
 * (docs/08 §8.3). Everything is lazy so importing this module has no side effects and the
 * build's route analysis never touches the Bun-only database (see db/index.ts).
 */

let accountRepository: AccountRepository | null = null;
let sessionRepository: SessionRepository | null = null;

export function getAccounts(): AccountRepository {
	return (accountRepository ??= createDrizzleAccountRepository(getDb()));
}

export function getSessions(): SessionRepository {
	return (sessionRepository ??= createDrizzleSessionRepository(getDb()));
}

export function getSessionDeps(): SessionDeps {
	return { sessions: getSessions(), clock: systemClock };
}

export function getAccountDeps(): AccountDeps {
	return { accounts: getAccounts(), ids: ulidGenerator, hashPassword, verifyPassword };
}

/** API tokens (docs/02 §2.16.1): minted in Settings, read by the hook for `/api/v1/`. */
export function getApiTokenDeps(): ApiTokenDeps {
	return { tokens: createDrizzleApiTokenRepository(getDb()), clock: systemClock, ids: ulidGenerator };
}

/** The import API's use-case (docs/02 §2.16.1). */
export function getApiImportDeps(): ApiImportDeps {
	return { imports: createDrizzleApiImportRepository(getDb()), clock: systemClock, ids: ulidGenerator };
}

let oidcProvider: OidcProvider | null = null;
let identityStore: IdentityStore | null = null;

export function getOidcProvider(): OidcProvider {
	const oidc = getConfig().oidc;
	return (oidcProvider ??= createOidcProvider({
		issuer: oidc.issuer,
		clientId: oidc.clientId,
		clientSecret: oidc.clientSecret,
		redirectUri: oidc.redirectUri
	}));
}

export function getIdentities(): IdentityStore {
	return (identityStore ??= createDrizzleIdentityStore(
		getDb(),
		ulidGenerator,
		getConfig().oidc.providerName
	));
}

export function getOidcPolicy(): OidcPolicy {
	const oidc = getConfig().oidc;
	return {
		allowedGroups: oidc.allowedGroups,
		adminGroups: oidc.adminGroups,
		allowedEmails: oidc.allowedEmails,
		jitProvision: oidc.jitProvision,
		linkByEmail: oidc.linkByEmail,
		syncRoles: oidc.syncRoles,
		syncProfile: oidc.syncProfile
	};
}

export function getAuthorizationRequestDeps(): AuthorizationRequestDeps {
	const oidc = getConfig().oidc;
	return {
		provider: getOidcProvider(),
		config: { clientId: oidc.clientId, redirectUri: oidc.redirectUri, scopes: oidc.scopes }
	};
}

/** Deps for RP-initiated logout; the redirect target must be registered at the provider. */
export function getRpLogoutDeps(): RpLogoutDeps {
	const config = getConfig();
	return {
		provider: getOidcProvider(),
		enabled: config.auth.oidc && config.oidc.rpLogout,
		clientId: config.oidc.clientId,
		postLogoutRedirectUri: `${config.url}${SIGNED_OUT_PATH}`
	};
}

export function getCompleteLoginDeps(): CompleteLoginDeps {
	return {
		provider: getOidcProvider(),
		identities: getIdentities(),
		policy: getOidcPolicy(),
		clock: systemClock
	};
}

let contactRepository: (ContactRepository & NameCandidateSource & NameRepository) | null = null;

export function getContacts(): ContactRepository & NameCandidateSource & NameRepository {
	return (contactRepository ??= createDrizzleContactRepository(getDb()));
}

/** Deps for changing name parts, one person or several (docs/concepts/surnames.md §7). */
export function getNameDeps(): NameDeps {
	return { names: getContacts(), clock: systemClock, ids: ulidGenerator };
}

/** Deps for setting last names in one batch, with its log entry (docs/concepts/surnames.md §7). */
export function getLastNameDeps(): LastNameDeps {
	return getNameDeps();
}

/** Deps for reading what Stella proposes as last names (docs/concepts/surnames.md §4). */
export function getSurnameReviewDeps(): SurnameReviewDeps {
	return {
		surnames: createDrizzleSurnameFacts(getDb()),
		relationships: getRelationships(),
		surnameDismissals: createDrizzleSurnameDismissalRepository(getDb())
	};
}

/** Deps for the household's *not this name* (docs/concepts/surnames.md §5). */
export function getSurnameDismissalDeps(): SurnameDismissalDeps {
	return {
		names: getContacts(),
		surnameDismissals: createDrizzleSurnameDismissalRepository(getDb()),
		ids: ulidGenerator,
		clock: systemClock
	};
}

export function getContactDeps(): ContactDeps {
	return { contacts: getContacts(), ids: ulidGenerator, clock: systemClock };
}

/** What a namesake's second line may fall back on: their links and circles (docs/02 §2.2.3). */
export function getPersonContextDeps(): PersonContextDeps {
	return { contextReads: createDrizzlePersonContextReads(getDb()) };
}

/** Deps for the stamp of the shell's people (docs/04 §4.9). */
export function getPeopleStampDeps(): PeopleStampDeps {
	return { stamps: createDrizzlePeopleStampReads(getDb()) };
}

/** What a refused `@Thomas` names each Thomas by, a namesake with nothing typed included. */
export function getNamesakeContextDeps(): NamesakeContextDeps {
	return {
		...getPersonContextDeps(),
		selfContactOf: async (userId) => (await getAccounts().findById(userId))?.selfContactId ?? null,
		clock: systemClock
	};
}

/** Deleting a person also unlinks the bytes of their photos (docs/02 §2.2). */
export function getDeleteContactDeps(): ContactDeps & { media: MediaStore } {
	return { ...getContactDeps(), media: getMediaStore() };
}

/** Deps for "which of these people am I" (docs/02 §2.1.3). */
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

export function getSelfContactDeps(): SelfContactDeps {
	return { contacts: getContacts(), accounts: getAccounts() };
}

/** Deps for quick-add's duplicate/relative suggestions (docs/02 §2.2.1). */
export function getSuggestionDeps(): SuggestionDeps {
	return { candidates: getContacts() };
}

let relationshipRepository:
	| (RelationshipRepository & RelationshipTypeRepository)
	| null = null;

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

/** The claims the household has declined (docs/concepts/relationship-suggestions.md §6.4). */
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
	return { framings: photoAdapter(), media: getMediaStore(), ids: ulidGenerator, clock: systemClock };
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
	return { contacts: getContacts(), journal: getJournal(), ids: ulidGenerator, clock: systemClock };
}

let commandReceiptRepository: CommandReceiptRepository | null = null;

function viewerOf(actor: CommandActor): Viewer {
	return { id: actor.userId, householdId: actor.householdId };
}

/** The dispatcher every change goes through (docs/concepts/offline-capture.md §3). */
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
				...(await withNamesakeContext(getNamesakeContextDeps(), viewerOf(actor), () =>
					captureMoment(
						capture,
						{ userId: actor.userId, householdId: actor.householdId, locale: actor.locale, defaultVisibility: payload.visibility },
						payload
					)
				)),
				visibility: payload.visibility
			}),
			'tag.assign': onVisibleContact(getContacts(), async (actor, payload) => ({
				tagId: await assignTagByName(getTagDeps(), actor.householdId, payload.contactId, payload.name, payload.color)
			})),
			'circle.join': onVisibleContact(getContacts(), async (actor, payload) => ({
				circleId: await joinCircleByName(
					getCircleDeps(),
					{ ...actor, defaultVisibility: 'shared' },
					payload.contactId,
					payload.circleName,
					payload.role
				)
			})),
			'contact.add': (actor, payload) =>
				addPerson({ ...getContactDeps(), accounts: getAccounts() }, actor, payload),
			'relationship.add': (actor, payload) =>
				addRelationshipChecked({ ...getRelationshipDeps(), contacts: getContacts() }, actor, payload),
			'relationship.addMany': (actor, payload) =>
				addRelationshipsOrRefuse({ ...getRelationshipDeps(), contacts: getContacts() }, actor, payload),
			'interaction.log': (actor, payload) =>
				logInteractionChecked({ ...getInteractionDeps(), contacts: getContacts() }, actor, payload),
			'note.add': (actor, payload) =>
				withNamesakeContext(getNamesakeContextDeps(), viewerOf(actor), () =>
					writeNote({ ...getNoteDeps(), contacts: getContacts() }, actor, payload)
				),
			'moment.photo': (actor, payload) =>
				attachMomentPhoto(
					{ receipts, entries: createDrizzleEntryOwnership(getDb()), photos: getJournalPhotoDeps() },
					actor,
					payload
				),
			'journal.write': (actor, payload) =>
				withNamesakeContext(getNamesakeContextDeps(), viewerOf(actor), () =>
					writeJournalEntry({ ...getJournalDeps(), contacts: getContacts() }, actor, payload)
				),
			'field.add': onVisibleContact(getContacts(), async (_actor, payload) => ({
				fieldId: await addContactField(getContactFieldDeps(), payload)
			})),
			'date.add': onVisibleContact(getContacts(), async (_actor, payload) => ({
				dateId: await addImportantDate(getImportantDateDeps(), payload)
			})),
			// Checks the person once; the photos following it land where it says (`photos.ts`).
			'gallery.add': onVisibleContact(getContacts(), async (_actor, payload) => ({
				contactId: payload.contactId,
				visibility: payload.visibility
			})),
			'gallery.photo': (actor, payload) =>
				attachGalleryPhoto({ receipts, contacts: getContacts(), photos: getGalleryUploadDeps() }, actor, payload),
			// Checks the circle and the role once; the photos following it land where it says.
			'circleGallery.add': (actor, payload) => prepareCirclePhotoUpload(getCirclePhotoDeps(), viewerOf(actor), payload),
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

/** Deps for profile pictures cut from a group photo (docs/concepts/circle-photos.md §5). */
export function getCutDeps(): CutDeps {
	return {
		cuts: (cutRepository ??= createDrizzleCutRepository(getDb())),
		contacts: getContacts(),
		media: getMediaStore(),
		ids: ulidGenerator,
		clock: systemClock
	};
}

let attentionRepository: AttentionRepository | null = null;

export function getAttention(): AttentionRepository {
	return (attentionRepository ??= createDrizzleAttentionRepository(getDb()));
}
