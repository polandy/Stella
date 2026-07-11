import type { AccountDeps, AccountRepository } from './auth/accounts';
import type {
	AuthorizationRequestDeps,
	CompleteLoginDeps,
	IdentityStore,
	OidcProvider
} from './auth/oidc/login';
import { createOidcProvider } from './auth/oidc/provider';
import type { OidcPolicy } from './auth/oidc/types';
import { hashPassword, verifyPassword } from './auth/password';
import type { SessionDeps, SessionRepository } from './auth/session';
import { systemClock } from './clock';
import { getConfig } from './config';
import { getDb } from './db';
import { createDrizzleAccountRepository } from './db/account-repository';
import { createDrizzleCircleRepository } from './db/circle-repository';
import { createDrizzleContactRepository } from './db/contact-repository';
import { createDrizzleDashboardRepository } from './db/dashboard-repository';
import { createDrizzleGraphRepository } from './db/graph-repository';
import { createDrizzleJournalRepository } from './db/journal-repository';
import { createDrizzleIdentityStore } from './db/identity-store';
import { createDrizzleContactFieldRepository } from './db/contact-field-repository';
import { createDrizzleNoteRepository } from './db/note-repository';
import { createDrizzlePhotoRepository } from './db/photo-repository';
import { createFileMediaStore } from './media/file-store';
import { createDrizzleRelationshipRepository } from './db/relationship-repository';
import { createDrizzleSearchRepository } from './db/search-repository';
import { createDrizzleSessionRepository } from './db/session-repository';
import { createDrizzleTagRepository } from './db/tag-repository';
import type {
	ContactFieldDeps,
	ContactFieldRepository
} from './domain/contact-fields/contact-fields';
import type { SearchDeps, SearchRepository } from './domain/search/search';
import type { ContactDeps, ContactRepository } from './domain/contacts/contacts';
import type { NoteDeps, NoteRepository } from './domain/notes/notes';
import type { JournalDeps, JournalRepository } from './domain/journal/journal';
import type { RelationshipDeps, RelationshipRepository } from './domain/relationships/relationships';
import type { TagDeps, TagRepository } from './domain/tags/tags';
import type { GraphRepository } from './db/graph-repository';
import type { CircleDeps, CircleRepository } from './domain/circles/circles';
import type { DashboardDeps, DashboardRepository } from './domain/dashboard/dashboard';
import type { AvatarDeps, MediaStore, PhotoRepository } from './domain/media/avatars';
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

export function getCompleteLoginDeps(): CompleteLoginDeps {
	return {
		provider: getOidcProvider(),
		identities: getIdentities(),
		policy: getOidcPolicy(),
		clock: systemClock
	};
}

let contactRepository: ContactRepository | null = null;

export function getContacts(): ContactRepository {
	return (contactRepository ??= createDrizzleContactRepository(getDb()));
}

export function getContactDeps(): ContactDeps {
	return { contacts: getContacts(), ids: ulidGenerator, clock: systemClock };
}

let relationshipRepository: RelationshipRepository | null = null;

export function getRelationships(): RelationshipRepository {
	return (relationshipRepository ??= createDrizzleRelationshipRepository(getDb()));
}

export function getRelationshipDeps(): RelationshipDeps {
	return { relationships: getRelationships(), ids: ulidGenerator, clock: systemClock };
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
	return { journal: getJournal(), ids: ulidGenerator, clock: systemClock };
}

let contactFieldRepository: ContactFieldRepository | null = null;

export function getContactFields(): ContactFieldRepository {
	return (contactFieldRepository ??= createDrizzleContactFieldRepository(getDb()));
}

export function getContactFieldDeps(): ContactFieldDeps {
	return { fields: getContactFields(), ids: ulidGenerator, clock: systemClock };
}

let searchRepository: SearchRepository | null = null;

export function getSearch(): SearchRepository {
	return (searchRepository ??= createDrizzleSearchRepository(getDb()));
}

export function getSearchDeps(): SearchDeps {
	return { search: getSearch() };
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

let photoRepository: PhotoRepository | null = null;
let mediaStore: MediaStore | null = null;

export function getPhotos(): PhotoRepository {
	return (photoRepository ??= createDrizzlePhotoRepository(getDb()));
}

export function getMediaStore(): MediaStore {
	return (mediaStore ??= createFileMediaStore(getConfig().mediaDir));
}

export function getAvatarDeps(): AvatarDeps {
	return { photos: getPhotos(), media: getMediaStore(), ids: ulidGenerator, clock: systemClock };
}

let dashboardRepository: DashboardRepository | null = null;

export function getDashboardDeps(): DashboardDeps {
	return { dashboard: (dashboardRepository ??= createDrizzleDashboardRepository(getDb())) };
}

let circleRepository: CircleRepository | null = null;

export function getCircleDeps(): CircleDeps {
	return {
		circles: (circleRepository ??= createDrizzleCircleRepository(getDb())),
		ids: ulidGenerator,
		clock: systemClock
	};
}
