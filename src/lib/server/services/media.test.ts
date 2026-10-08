import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerFirstAdmin, type AuthUser } from '../auth/accounts';
import { hashPassword, verifyPassword } from '../auth/password';
import type { Clock } from '../clock';
import { createDrizzleAccountRepository } from '../db/account-repository';
import { createDrizzleContactRepository } from '../db/contact-repository';
import * as schema from '../db/schema';
import { createContact } from '../domain/contacts/contacts';
import { listGallery } from '../domain/media/gallery';
import { buildStream } from '../domain/stream/stream';
import type { IdGenerator } from '../id';
import { createServices } from './app-services';
import type { AuthConfig } from './auth';
import { createMediaServices, type MediaWiring } from './media';

/*
 * The media group of the composition root (docs/08 §8.3), built over a real in-memory SQLite
 * and a throw-away media directory: what the edge gets from `locals.services.media` must work
 * end to end, and the photo repository and the store must each exist once, so what one
 * use-case writes the next one reads.
 */

const clock: Clock = { now: () => Date.UTC(2026, 9, 8, 9) };
let counter = 0;
const ids: IdGenerator = { next: () => `id-${++counter}` };

let sqlite: Database;
let db: BunSQLiteDatabase<typeof schema>;
let mediaDir: string;
let wiring: MediaWiring;
let admin: AuthUser;

beforeEach(async () => {
	counter = 0;
	sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	mediaDir = await mkdtemp(join(tmpdir(), 'stella-media-services-'));
	admin = await registerFirstAdmin(
		{ accounts: createDrizzleAccountRepository(db), ids, hashPassword, verifyPassword },
		{
			householdName: 'Pollari',
			email: 'andy@example.test',
			name: 'Andy',
			password: 'correct horse battery',
			locale: 'en'
		}
	);
	wiring = { config: { mediaDir }, db, clock, ids };
});

afterEach(async () => {
	await rm(mediaDir, { recursive: true, force: true });
});

const viewerOf = (user: AuthUser) => ({ id: user.id, householdId: user.householdId });

async function addPerson(firstName: string) {
	return createContact(
		{ contacts: createDrizzleContactRepository(db), ids, clock },
		{ userId: admin.id, householdId: admin.householdId, defaultVisibility: 'shared', locale: 'en' },
		{ firstName, lastName: 'Pollari' }
	);
}

async function addGalleryPhoto(
	media: ReturnType<typeof createMediaServices>,
	contactId: string
): Promise<string> {
	const id = ids.next();
	await media.photos.insert({
		id,
		householdId: admin.householdId,
		contactId,
		journalEntryId: null,
		createdBy: admin.id,
		visibility: 'shared',
		filePath: `${id}.jpg`,
		thumbPath: `${id}_thumb.jpg`,
		mime: 'image/jpeg',
		width: 1200,
		height: 800,
		sizeBytes: 1000,
		takenAt: null,
		createdAt: clock.now()
	});
	return id;
}

describe('createMediaServices', () => {
	it('hands every photo use-case the one photo repository the edge reads', () => {
		const media = createMediaServices(wiring);
		for (const deps of [
			media.avatarDeps,
			media.importedPhotoDeps,
			media.galleryDeps,
			media.galleryUploadDeps,
			media.journalPhotoDeps
		]) {
			expect(deps.photos).toBe(media.photos);
		}
		expect<unknown>(media.framingDeps.framings).toBe(media.photos);
	});

	it('hands every photo use-case the one media store the edge streams from', () => {
		const media = createMediaServices(wiring);
		for (const deps of [
			media.avatarDeps,
			media.importedPhotoDeps,
			media.galleryDeps,
			media.framingDeps,
			media.galleryUploadDeps,
			media.journalPhotoDeps
		]) {
			expect(deps.media).toBe(media.store);
		}
	});

	it('hands the injected clock and ids to the use-cases that write', () => {
		const media = createMediaServices(wiring);
		for (const deps of [
			media.avatarDeps,
			media.framingDeps,
			media.galleryUploadDeps,
			media.journalPhotoDeps
		]) {
			expect(deps.clock).toBe(clock);
			expect(deps.ids).toBe(ids);
		}
		expect(media.galleryDeps.clock).toBe(clock);
		expect(media.importedPhotoDeps.clock).toBe(clock);
	});

	it('keeps the bytes under the configured media directory', async () => {
		const media = createMediaServices(wiring);
		const bytes = new Uint8Array([1, 2, 3]);
		await media.store.put('photo.jpg', bytes);
		expect(await Bun.file(join(mediaDir, 'photo.jpg')).bytes()).toEqual(bytes);
		expect(await media.store.read('photo.jpg')).toEqual(bytes);
		expect((await media.store.open('photo.jpg'))?.size).toBe(3);
	});

	it('lists in the gallery what the photo repository stored', async () => {
		const media = createMediaServices(wiring);
		const anna = await addPerson('Anna');
		const photoId = await addGalleryPhoto(media, anna);
		const gallery = await listGallery(media.galleryDeps, viewerOf(admin), anna);
		expect(gallery.map((photo) => photo.id)).toEqual([photoId]);
	});

	it('builds the home stream over the same database', async () => {
		const media = createMediaServices(wiring);
		await addPerson('Anna');
		const stream = await buildStream(media.streamDeps, viewerOf(admin));
		expect(stream.map((item) => item.kind)).toContain('person');
	});
});

describe('createServices', () => {
	it('groups the media context under `media`; people and circles share its store', () => {
		const config: AuthConfig = {
			url: 'https://stella.example.test',
			auth: { local: true, oidc: false },
			oidc: {
				issuer: '',
				clientId: '',
				clientSecret: '',
				redirectUri: '',
				scopes: 'openid',
				providerName: 'authelia',
				allowedGroups: [],
				adminGroups: [],
				allowedEmails: [],
				jitProvision: false,
				linkByEmail: false,
				syncRoles: false,
				syncProfile: false,
				rpLogout: false
			}
		};
		const services = createServices({
			config: { ...config, immich: null, sessionSecret: 'a-session-secret', mediaDir },
			db,
			sqlite,
			clock,
			ids
		});
		const { store } = services.media;
		expect(services.media.galleryDeps.media).toBe(store);
		expect<unknown>(services.people.deleteContactDeps.media).toBe(store);
		expect<unknown>(services.circles.circlePhotoDeps.media).toBe(store);
		expect<unknown>(services.circles.cutDeps.media).toBe(store);
	});
});
