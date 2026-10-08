import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { registerFirstAdmin, type AuthUser } from '../auth/accounts';
import type { Clock } from '../clock';
import { createDrizzleAccountRepository } from '../db/account-repository';
import { createDrizzleContactRepository } from '../db/contact-repository';
import * as schema from '../db/schema';
import { seedRelationshipTypes } from '../db/seed';
import { createContact } from '../domain/contacts/contacts';
import { readFamilyOf } from '../domain/relationships/family';
import { createRelationshipType } from '../domain/relationships/relationship-types';
import { createRelationship } from '../domain/relationships/relationships';
import {
	dismissSuggestion,
	reviewHousehold,
	restoreSuggestion
} from '../domain/relationships/suggestion-review';
import type { IdGenerator } from '../id';
import { hashPassword, verifyPassword } from '../auth/password';
import type { AuthConfig } from './auth';
import { createServices } from './app-services';
import { createRelationshipServices, type RelationshipWiring } from './relationships';

/*
 * The relationships group of the composition root (docs/08 §8.3), built over a real in-memory
 * SQLite: what the edge gets from `locals.services.relationships` must work end to end, and
 * each repository must exist once, so what one use-case writes the next one reads.
 */

const clock: Clock = { now: () => Date.UTC(2026, 9, 7, 9) };
let counter = 0;
const ids: IdGenerator = { next: () => `id-${++counter}` };

let sqlite: Database;
let db: BunSQLiteDatabase<typeof schema>;
let wiring: RelationshipWiring;
let admin: AuthUser;

beforeEach(async () => {
	counter = 0;
	sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	seedRelationshipTypes(db);
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
	wiring = { db, clock, ids };
});

const viewerOf = (user: AuthUser) => ({ id: user.id, householdId: user.householdId });

async function addPerson(firstName: string) {
	return createContact(
		{ contacts: createDrizzleContactRepository(db), ids, clock },
		{
			userId: admin.id,
			householdId: admin.householdId,
			defaultVisibility: 'shared',
			locale: 'en'
		},
		{ firstName, lastName: 'Pollari' }
	);
}

const NO_REQUEST = { proposeFor: [], reviewOpen: false };

describe('createRelationshipServices', () => {
	it('builds each port once and hands it to every use-case that reads it', async () => {
		const relationships = createRelationshipServices(wiring);
		expect(relationships.relationshipDeps.types).toBe(relationships.relationshipTypes);
		expect(relationships.relationshipTypeDeps.types).toBe(relationships.relationshipTypes);
		expect(relationships.relationshipDeps.kinship).toBe(relationships.kinship);
		expect(relationships.suggestionReviewDeps.kinship).toBe(relationships.kinship);
		expect(relationships.familyReadDeps.ties).toBe(relationships.relationshipDeps.ties);

		const anna = await addPerson('Anna');
		const ben = await addPerson('Ben');
		await createRelationship(relationships.relationshipDeps, viewerOf(admin), {
			fromContactId: anna,
			toContactId: ben,
			typeId: 'friend',
			description: null
		});
		const family = await readFamilyOf(
			relationships.familyReadDeps,
			viewerOf(admin),
			anna,
			NO_REQUEST
		);
		expect(family.ties.map((tie) => tie.otherContactId)).toEqual([ben]);
	});

	it('reads the family and the map through the one graph repository', () => {
		const relationships = createRelationshipServices(wiring);
		expect(relationships.familyReadDeps.family).toBe(relationships.graph);
	});

	it('hands the injected clock and ids to the use-cases that write', () => {
		const relationships = createRelationshipServices(wiring);
		for (const deps of [relationships.relationshipDeps, relationships.suggestionReviewDeps]) {
			expect(deps.clock).toBe(clock);
			expect(deps.ids).toBe(ids);
		}
		expect(relationships.relationshipTypeDeps.ids).toBe(ids);
	});

	it('lists a type the household added through the repository the edge reads', async () => {
		const relationships = createRelationshipServices(wiring);
		const id = await createRelationshipType(relationships.relationshipTypeDeps, viewerOf(admin), {
			forwardLabel: 'Godparent of',
			reverseLabel: 'Godchild of',
			category: 'family',
			symmetric: false
		});
		const types = await relationships.relationshipTypes.listTypes(viewerOf(admin));
		expect(types.map((type) => type.id)).toContain(id);
	});

	it('shares one dismissal repository between the review and the family read', async () => {
		const relationships = createRelationshipServices(wiring);
		expect(relationships.familyReadDeps.dismissals).toBe(
			relationships.suggestionReviewDeps.dismissals
		);

		const anna = await addPerson('Anna');
		const ben = await addPerson('Ben');
		const claim = { relation: 'sibling' as const, fromId: anna, toId: ben };
		expect(
			await dismissSuggestion(relationships.suggestionReviewDeps, viewerOf(admin), claim)
		).toBe(true);
		expect(
			await relationships.familyReadDeps.dismissals.listForHousehold(viewerOf(admin))
		).toHaveLength(1);
		expect(
			await restoreSuggestion(relationships.suggestionReviewDeps, viewerOf(admin), claim)
		).toBe(true);
		expect(
			await reviewHousehold(relationships.suggestionReviewDeps, viewerOf(admin), {
				includeDismissed: true
			})
		).toEqual([]);
	});
});

describe('createServices', () => {
	it('groups the relationships context under `relationships`, the one people reads', () => {
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
		expect(services.people.surnameReviewDeps.kinship).toBe(services.relationships.kinship);
	});
});
