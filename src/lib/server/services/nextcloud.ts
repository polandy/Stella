import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { Clock } from '../clock';
import type { Config } from '../config';
import { createDrizzleContactReviewWriter } from '../db/contact-review-writer';
import { createDrizzleContactSourceRepository } from '../db/contact-source-repository';
import { createDrizzleNextcloudStore } from '../db/nextcloud-store';
import type * as schema from '../db/schema';
import { createDrizzleSystemActors } from '../db/system-actor-repository';
import { setContactAvatar, type AvatarDeps, type MediaStore } from '../domain/media/avatars';
import type { ContactSourceRepository } from '../domain/import/source-links';
import type { ConflictAnswerDeps } from '../domain/nextcloud/conflicts';
import { createNextcloudLink, type NextcloudLink } from '../domain/nextcloud/link';
import type { BookReviewDeps } from '../domain/nextcloud/review';
import { activityWording } from '../i18n/activity-wording';
import type { IdGenerator } from '../id';
import { demoAddressBook } from '../nextcloud/demo-book';
import { createFakeAddressBook } from '../nextcloud/fake-gateway';
import { createHttpAddressBookGateway } from '../nextcloud/http-gateway';

/*
 * The `nextcloud` bounded context of the composition root (docs/08 §8.3): the household's link
 * to its Nextcloud address book (docs/02 §2.16.3) — the sync, the review of the book's new
 * cards, and the answers to what a sync found in conflict. Built once per process by
 * `createServices`; the edge reads it off `locals.services.nextcloud`, which is null when this
 * instance has no address book — the link then appears nowhere. The app password stays inside
 * the gateway: nothing here hands it on.
 */
export interface NextcloudServices {
	/** Built once with the group, because it remembers the household's running sync. */
	link: NextcloudLink;
	/** The linked book's new cards in the matching review. */
	bookReviewDeps: BookReviewDeps & { sources: ContactSourceRepository };
	/** Keeping Stella's side of a conflict, or taking the card's. */
	conflictAnswerDeps: ConflictAnswerDeps;
}

/** The part of the configuration the nextcloud context reads. */
export type NextcloudWiringConfig = Pick<Config, 'nextcloud'>;

export interface NextcloudWiring {
	config: NextcloudWiringConfig;
	db: BunSQLiteDatabase<typeof schema>;
	clock: Clock;
	ids: IdGenerator;
	/** The media context's store, which a person's photo is read from to go onto their card. */
	media: MediaStore;
	/** The media context's avatar path, which a card's picture takes. */
	avatarDeps: AvatarDeps;
}

/** The nextcloud group, or null when this instance has no address book configured. */
export function createNextcloudServices({
	config,
	db,
	clock,
	ids,
	media,
	avatarDeps
}: NextcloudWiring): NextcloudServices | null {
	const { nextcloud } = config;
	if (!nextcloud) return null;
	// The demo server gets the in-memory stand-in, so the link can be tried without a Nextcloud.
	const book =
		nextcloud.mode === 'demo'
			? createFakeAddressBook(demoAddressBook())
			: createHttpAddressBookGateway({
					url: nextcloud.url,
					user: nextcloud.user,
					appPassword: nextcloud.appPassword
				});
	const store = createDrizzleNextcloudStore(db);
	const sources = createDrizzleContactSourceRepository(db);
	const writer = createDrizzleContactReviewWriter(db, activityWording);
	const setAvatar: BookReviewDeps['setAvatar'] = (uploader, contactId, upload) =>
		setContactAvatar(
			avatarDeps,
			{ userId: uploader.id, householdId: uploader.householdId },
			contactId,
			upload
		);

	return {
		link: createNextcloudLink({
			book,
			store,
			sources,
			writer,
			media,
			setAvatar,
			clock,
			ids,
			actors: createDrizzleSystemActors(db),
			source: nextcloud.source
		}),
		bookReviewDeps: { store, sources, writer, setAvatar, clock, ids },
		conflictAnswerDeps: { store, writer, setAvatar, clock, ids }
	};
}
