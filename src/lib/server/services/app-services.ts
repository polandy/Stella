import { createArchiveServices, type ArchiveServices, type ArchiveWiring } from './archive';
import { createAuthServices, type AuthServices, type AuthWiring } from './auth';
import { createCircleServices, type CircleServices, type CircleWiring } from './circles';
import { createGiftServices, type GiftServices, type GiftWiring } from './gifts';
import { createHouseholdServices, type HouseholdServices, type HouseholdWiring } from './household';
import { createImmichServices, type ImmichServices, type ImmichWiring } from './immich';
import { createMediaServices, type MediaServices, type MediaWiring } from './media';
import { createNextcloudServices, type NextcloudServices, type NextcloudWiring } from './nextcloud';
import { createNoteServices, type NoteServices, type NoteWiring } from './notes';
import { createOfflineServices, type OfflineServices, type OfflineWiring } from './offline';
import { createPeopleServices, type PeopleServices, type PeopleWiring } from './people';
import { createRecordServices, type RecordServices, type RecordWiring } from './records';
import { createReleaseServices, type ReleaseServices, type ReleaseWiring } from './release';
import {
	createRelationshipServices,
	type RelationshipServices,
	type RelationshipWiring
} from './relationships';
import { createStoryServices, type StoryServices, type StoryWiring } from './story';
import { createTodoServices, type TodoServices, type TodoWiring } from './todos';

/*
 * The application's object graph, grouped by bounded context (docs/04 §4.3, docs/08 §8.3).
 * `hooks.server.ts` hands it to every request as `locals.services`; a route reads
 * `locals.services.auth.sessionDeps` instead of importing a factory.
 *
 * Every context is grouped here (AR-01);
 * `./index.ts` only builds this graph once per process.
 */
export interface AppServices {
	auth: AuthServices;
	people: PeopleServices;
	relationships: RelationshipServices;
	circles: CircleServices;
	media: MediaServices;
	story: StoryServices;
	notes: NoteServices;
	records: RecordServices;
	household: HouseholdServices;
	archive: ArchiveServices;
	/** Null when this instance has no Immich: the feature then appears nowhere. */
	immich: ImmichServices | null;
	/** Null when this instance has no Nextcloud address book: the link then appears nowhere. */
	nextcloud: NextcloudServices | null;
	release: ReleaseServices;
	offline: OfflineServices;
	gifts: GiftServices;
	todos: TodoServices;
}

/**
 * What the graph is built from; each context's wiring joins this as it moves in. A context
 * that reads another grouped context's repository gets it from here, not from the wiring
 * (`people` reads `auth`'s accounts, the relationships context's kinship graph and `media`'s
 * store; `circles` and `story` read `people`'s contacts and `media`'s store; `gifts`, `todos` and
 * `records` read `people`'s contacts and `story` reads `gifts`' repository; `archive` restores into `media`'s
 * store and hands what it restored to `gifts`' conversion; `immich` reads `people`'s contacts and `media`'s avatar deps; `nextcloud` reads `media`'s store and avatar deps; `offline`'s command
 * handlers read the contexts whose use-cases they call), so each repository exists once.
 */
export type ServicesWiring = AuthWiring &
	RelationshipWiring &
	MediaWiring &
	Omit<PeopleWiring, 'accounts' | 'kinship' | 'media'> &
	Omit<CircleWiring, 'contacts' | 'media'> &
	Omit<StoryWiring, 'contacts' | 'directory' | 'media' | 'gifts'> &
	NoteWiring &
	Omit<RecordWiring, 'contacts'> &
	HouseholdWiring &
	Omit<ArchiveWiring, 'media' | 'convertHeldGifts'> &
	Omit<ImmichWiring, 'contacts' | 'directory' | 'contactDeps' | 'contextReads' | 'avatarDeps'> &
	Omit<NextcloudWiring, 'media' | 'avatarDeps'> &
	ReleaseWiring &
	Omit<OfflineWiring, 'contexts'> &
	Omit<GiftWiring, 'contacts'> &
	Omit<TodoWiring, 'contacts'>;

/** Wires every grouped context. Pure assembly: no I/O beyond what the adapters do when used. */
export function createServices(wiring: ServicesWiring): AppServices {
	const auth = createAuthServices(wiring);
	const relationships = createRelationshipServices(wiring);
	const media = createMediaServices(wiring);
	const people = createPeopleServices({
		...wiring,
		accounts: auth.accounts,
		kinship: relationships.kinship,
		media: media.store
	});
	const circles = createCircleServices({
		...wiring,
		contacts: people.contacts,
		media: media.store
	});
	const gifts = createGiftServices({ ...wiring, contacts: people.contacts });
	const todos = createTodoServices({ ...wiring, contacts: people.contacts });
	const story = createStoryServices({
		...wiring,
		contacts: people.contacts,
		directory: people.directory,
		media: media.store,
		gifts: gifts.gifts
	});
	const notes = createNoteServices(wiring);
	const records = createRecordServices({ ...wiring, contacts: people.contacts });
	const household = createHouseholdServices(wiring);
	const archive = createArchiveServices({
		...wiring,
		media: media.store,
		convertHeldGifts: gifts.convertHeldGifts
	});
	const immich = createImmichServices({
		...wiring,
		contacts: people.contacts,
		directory: people.directory,
		contactDeps: people.contactDeps,
		contextReads: people.personContextDeps.contextReads,
		avatarDeps: media.avatarDeps
	});
	const nextcloud = createNextcloudServices({
		...wiring,
		media: media.store,
		avatarDeps: media.avatarDeps
	});
	const release = createReleaseServices(wiring);
	const offline = createOfflineServices({
		...wiring,
		contexts: { auth, people, relationships, circles, media, story, notes, records, gifts, todos }
	});
	return {
		auth,
		people,
		relationships,
		circles,
		media,
		story,
		notes,
		records,
		household,
		archive,
		immich,
		nextcloud,
		release,
		offline,
		gifts,
		todos
	};
}
