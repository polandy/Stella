import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { registerFirstAdmin, type AuthUser } from '../auth/accounts';
import type { Clock } from '../clock';
import { createDrizzleAccountRepository } from '../db/account-repository';
import { createDrizzleContactRepository } from '../db/contact-repository';
import * as schema from '../db/schema';
import { listCirclePhotos } from '../domain/circles/circle-photos';
import { joinCircleByName } from '../domain/circles/circles';
import { listCircles } from '../domain/circles/directory';
import { listCirclesForContact, listMembers } from '../domain/circles/memberships';
import { renameCircleRole } from '../domain/circles/rename-role';
import { createContact } from '../domain/contacts/contacts';
import type { MediaStore } from '../domain/media/avatars';
import { listGroupPhotosToCut } from '../domain/media/cuts';
import type { IdGenerator } from '../id';
import { hashPassword, verifyPassword } from '../auth/password';
import type { AuthConfig } from './auth';
import { createServices } from './app-services';
import { createCircleServices, type CircleWiring } from './circles';

/*
 * The circles group of the composition root (docs/08 §8.3), built over a real in-memory
 * SQLite: what the edge gets from `locals.services.circles` must work end to end, and each
 * repository must exist once, so what one use-case writes the next one reads.
 */

const clock: Clock = { now: () => Date.UTC(2026, 9, 7, 9) };
let counter = 0;
const ids: IdGenerator = { next: () => `id-${++counter}` };
const media: MediaStore = {
	put: async (key) => key,
	read: async () => null,
	delete: async () => {}
};

let sqlite: Database;
let db: BunSQLiteDatabase<typeof schema>;
let wiring: CircleWiring;
let admin: AuthUser;

beforeEach(async () => {
	counter = 0;
	sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
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
	wiring = { db, clock, ids, contacts: createDrizzleContactRepository(db), media };
});

const viewerOf = (user: AuthUser) => ({ id: user.id, householdId: user.householdId });
const creatorOf = (user: AuthUser) => ({
	userId: user.id,
	householdId: user.householdId,
	defaultVisibility: 'shared' as const
});

async function addPerson(firstName: string) {
	return createContact(
		{ contacts: createDrizzleContactRepository(db), ids, clock },
		{ ...creatorOf(admin), locale: 'en' },
		{ firstName, lastName: 'Pollari' }
	);
}

async function addPhoto(
	circles: ReturnType<typeof createCircleServices>,
	circleId: string,
	role: string | null
) {
	const id = ids.next();
	await circles.circlePhotos.insert({
		id,
		householdId: admin.householdId,
		circleId,
		circleRole: role,
		createdBy: admin.id,
		visibility: 'shared',
		filePath: `${id}.jpg`,
		thumbPath: `${id}_thumb.jpg`,
		viewPath: null,
		mime: 'image/jpeg',
		width: 1200,
		height: 800,
		sizeBytes: 1000,
		takenAt: null,
		createdAt: clock.now()
	});
	return id;
}

describe('createCircleServices', () => {
	it('hands every use-case the one circle repository the edge reads', async () => {
		const circles = createCircleServices(wiring);
		expect(circles.circleDeps.circles).toBe(circles.circles);
		expect<unknown>(circles.circlePhotoDeps.circles).toBe(circles.circles);
		expect<unknown>(circles.renameRoleDeps.circles).toBe(circles.circles);
		expect<unknown>(circles.memberRoleDeps.circles).toBe(circles.circles);

		const anna = await addPerson('Anna');
		const circleId = await joinCircleByName(
			circles.circleDeps,
			creatorOf(admin),
			anna,
			'Choir',
			'Alto'
		);
		const joined = await listCirclesForContact(circles.circleMembershipDeps, viewerOf(admin), anna);
		expect(joined.map((circle) => circle.circleId)).toEqual([circleId]);
		const overview = await listCircles(circles.circleDirectoryDeps, viewerOf(admin));
		expect(overview.map((circle) => [circle.id, circle.memberCount])).toEqual([[circleId, 1]]);
	});

	it('hands every use-case that asks who is in a circle the one membership read model', () => {
		const circles = createCircleServices(wiring);
		const { memberships } = circles.circleMembershipDeps;
		expect<unknown>(circles.memberRoleDeps.memberships).toBe(memberships);
		expect<unknown>(circles.renameRoleDeps.memberships).toBe(memberships);
		expect<unknown>(circles.circlePhotoDeps.memberships).toBe(memberships);
	});

	it('hands every use-case the one circle photo repository the edge reads', () => {
		const circles = createCircleServices(wiring);
		expect(circles.circlePhotoDeps.circlePhotos).toBe(circles.circlePhotos);
		expect<unknown>(circles.renameRoleDeps.circlePhotos).toBe(circles.circlePhotos);
		expect(circles.cutDeps.cuts).toBe(circles.cuts);
	});

	it('hands the photo use-cases the injected media store and contacts', () => {
		const circles = createCircleServices(wiring);
		expect(circles.circlePhotoDeps.media).toBe(media);
		expect(circles.cutDeps.media).toBe(media);
		expect<unknown>(circles.cutDeps.contacts).toBe(wiring.contacts);
	});

	it('hands the injected clock and ids to the use-cases that write', () => {
		const circles = createCircleServices(wiring);
		for (const deps of [circles.circleDeps, circles.circlePhotoDeps, circles.cutDeps]) {
			expect(deps.clock).toBe(clock);
			expect(deps.ids).toBe(ids);
		}
		expect(circles.renameRoleDeps.clock).toBe(clock);
		expect(circles.memberRoleDeps.clock).toBe(clock);
	});

	it('renames a role across members and photos, and offers the photo to cut from', async () => {
		const circles = createCircleServices(wiring);
		const anna = await addPerson('Anna');
		const circleId = await joinCircleByName(
			circles.circleDeps,
			creatorOf(admin),
			anna,
			'Choir',
			'Alto'
		);
		const photoId = await addPhoto(circles, circleId, 'Alto');

		await renameCircleRole(circles.renameRoleDeps, viewerOf(admin), {
			circleId,
			from: 'Alto',
			to: 'Altos'
		});
		const members = await listMembers(circles.circleMembershipDeps, viewerOf(admin), circleId);
		expect(members.map((member) => member.role)).toEqual(['Altos']);
		const photos = await listCirclePhotos(circles.circlePhotoDeps, viewerOf(admin), circleId);
		expect(photos.map((photo) => photo.role)).toEqual(['Altos']);

		const toCut = await listGroupPhotosToCut(circles.cutDeps, viewerOf(admin), anna);
		expect(toCut.map((photo) => photo.id)).toEqual([photoId]);
	});
});

describe('createServices', () => {
	it('groups the circles context under `circles`, over the people context’s contacts', () => {
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
			// Nothing here touches a file: the media store is lazy on disk.
			config: {
				...config,
				immich: null,
				sessionSecret: 'a-session-secret',
				updateCheck: false,
				updateFeedUrl: '',
				mediaDir: '/nonexistent/stella-media'
			},
			db,
			sqlite,
			clock,
			ids,
			version: '1.0.0'
		});
		expect<unknown>(services.circles.cutDeps.contacts).toBe(services.people.contacts);
		expect(services.circles.circlePhotoDeps.media).toBe(services.media.store);
	});
});
