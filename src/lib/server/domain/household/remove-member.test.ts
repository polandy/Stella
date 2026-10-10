import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import type { Remover } from '../../access/visibility';
import { createDrizzleMemberAccountRepository } from '../../db/member-account-repository';
import * as schema from '../../db/schema';
import { memberFacts, MEMBER_ENTITY } from '../../../stream/notices';
import { fixedClock, sequentialIds } from '../testing';
import {
	admin,
	ADMIN,
	AUTHOR,
	author,
	FOREIGN_ADMIN,
	foreignAdmin,
	H,
	MEMBER,
	removalDb,
	type RemovalDb
} from '../testing/removal-db';
import {
	CannotRemoveYourselfError,
	listMemberAccounts,
	memberRemovalPreview,
	MemberGoneError,
	NotAnAdminError,
	removeMember,
	type MemberAccountDeps
} from './remove-member';

/*
 * Removing a member (docs/02 §2.1, concept remove-member §3). Wired to the real Drizzle adapter
 * on an in-memory database, because what a removal ends and what it keeps — sessions, tokens,
 * the identity, the password hash, every record — lives there. In the household, Nina is the
 * member removed, Andy the admin removing her, Mia a plain member.
 */

const NOW = 1_760_000_000_000;

let t: RemovalDb;
let deps: MemberAccountDeps;

beforeEach(() => {
	t = removalDb();
	deps = {
		accounts: createDrizzleMemberAccountRepository(t.db),
		ids: sequentialIds('log-1', 'log-2'),
		clock: fixedClock(NOW)
	};
	t.db
		.update(schema.user)
		.set({ passwordHash: 'hash-nina' })
		.where(eq(schema.user.id, AUTHOR))
		.run();
	t.db
		.update(schema.user)
		.set({ passwordHash: 'hash-andy' })
		.where(eq(schema.user.id, ADMIN))
		.run();
	t.db
		.insert(schema.session)
		.values([
			{ id: 's-nina-phone', userId: AUTHOR, expiresAt: NOW + 1 },
			{ id: 's-nina-laptop', userId: AUTHOR, expiresAt: NOW + 1 },
			{ id: 's-andy', userId: ADMIN, expiresAt: NOW + 1 }
		])
		.run();
	t.db
		.insert(schema.apiToken)
		.values([
			{ id: 't-nina', userId: AUTHOR, name: 'import', tokenHash: 'th-nina', expiresAt: NOW + 1 },
			{ id: 't-andy', userId: ADMIN, name: 'import', tokenHash: 'th-andy', expiresAt: NOW + 1 }
		])
		.run();
	t.db
		.insert(schema.identity)
		.values({ id: 'i-nina', userId: AUTHOR, provider: 'authelia', issuer: 'iss', subject: 'nina' })
		.run();
	t.db
		.insert(schema.invitation)
		.values([
			{ id: 'inv-open', householdId: H, tokenHash: 'a', createdBy: AUTHOR, expiresAt: NOW + 1 },
			{
				id: 'inv-accepted',
				householdId: H,
				tokenHash: 'b',
				createdBy: AUTHOR,
				expiresAt: NOW + 1,
				acceptedAt: NOW - 1
			}
		])
		.run();
	// Nina's own records: two private, one shared.
	t.db
		.insert(schema.contact)
		.values({
			id: 'c-ninas-secret',
			householdId: H,
			createdBy: AUTHOR,
			visibility: 'private',
			displayName: 'Ninas Secret'
		})
		.run();
	t.db
		.insert(schema.note)
		.values([
			{ id: 'n-private', contactId: 'c-kurt', createdBy: AUTHOR, visibility: 'private', body: 'p' },
			{ id: 'n-shared', contactId: 'c-kurt', createdBy: AUTHOR, visibility: 'shared', body: 's' },
			// Andy's private note counts for Andy, never for Nina.
			{ id: 'n-andy', contactId: 'c-kurt', createdBy: ADMIN, visibility: 'private', body: 'a' }
		])
		.run();
});

const ids = <T extends { id: string }>(rows: T[]) => rows.map((r) => r.id).sort();
const userRow = (id: string) => t.db.select().from(schema.user).where(eq(schema.user.id, id)).get();

describe('removeMember', () => {
	it('marks the member removed and ends every way they had in', async () => {
		await removeMember(deps, admin, AUTHOR);

		expect(userRow(AUTHOR)?.removedAt).toBe(NOW);
		expect(ids(t.db.select().from(schema.session).all())).toEqual(['s-andy']);
		expect(ids(t.db.select().from(schema.apiToken).all())).toEqual(['t-andy']);
		expect(ids(t.db.select().from(schema.invitation).all())).toEqual(['inv-accepted']);
	});

	it('keeps the identity, the password hash, the self link and everything they wrote', async () => {
		t.db
			.update(schema.user)
			.set({ selfContactId: 'c-lea' })
			.where(eq(schema.user.id, AUTHOR))
			.run();

		await removeMember(deps, admin, AUTHOR);

		const nina = userRow(AUTHOR);
		expect(nina?.passwordHash).toBe('hash-nina');
		expect(nina?.selfContactId).toBe('c-lea');
		expect(ids(t.db.select().from(schema.identity).all())).toEqual(['i-nina']);
		expect(ids(t.db.select().from(schema.note).all())).toEqual(['n-andy', 'n-private', 'n-shared']);
		expect(ids(t.db.select().from(schema.contact).all())).toContain('c-ninas-secret');
	});

	it('tells the household in the same write, under the member, with their name', async () => {
		await removeMember(deps, admin, AUTHOR);

		expect(t.db.select().from(schema.activityLog).all()).toEqual([
			{
				id: 'log-1',
				householdId: H,
				actorId: ADMIN,
				action: 'delete',
				entityType: MEMBER_ENTITY,
				entityId: AUTHOR,
				contactId: null,
				visibility: 'shared',
				summary: memberFacts('Nina'),
				createdAt: NOW
			}
		]);
	});

	it('refuses a member who is not an admin, and changes nothing', async () => {
		const mia: Remover = { id: MEMBER, householdId: H, isAdmin: false };
		await expect(removeMember(deps, mia, AUTHOR)).rejects.toBeInstanceOf(NotAnAdminError);
		await expect(removeMember(deps, author, ADMIN)).rejects.toBeInstanceOf(NotAnAdminError);
		expect(userRow(AUTHOR)?.removedAt).toBeNull();
	});

	it('refuses an admin removing themselves', async () => {
		await expect(removeMember(deps, admin, ADMIN)).rejects.toBeInstanceOf(
			CannotRemoveYourselfError
		);
		expect(userRow(ADMIN)?.removedAt).toBeNull();
	});

	it('answers a member already removed, unknown or of another household as gone', async () => {
		await removeMember(deps, admin, AUTHOR);
		await expect(removeMember(deps, admin, AUTHOR)).rejects.toBeInstanceOf(MemberGoneError);
		await expect(removeMember(deps, admin, 'user-nobody')).rejects.toBeInstanceOf(MemberGoneError);
		await expect(removeMember(deps, foreignAdmin, MEMBER)).rejects.toBeInstanceOf(MemberGoneError);
		// One removal, one line: the refusals wrote nothing.
		expect(t.db.select().from(schema.activityLog).all()).toHaveLength(1);
	});
});

describe('memberRemovalPreview', () => {
	it('counts the private records the member leaves sealed, of every kind', async () => {
		t.db
			.insert(schema.circle)
			.values({
				id: 'k-ninas',
				householdId: H,
				createdBy: AUTHOR,
				visibility: 'private',
				name: 'N'
			})
			.run();
		t.db
			.insert(schema.gift)
			.values({
				id: 'g-ninas',
				contactId: 'c-kurt',
				createdBy: AUTHOR,
				visibility: 'private',
				state: 'idea',
				title: 'Book'
			})
			.run();

		const preview = await memberRemovalPreview(deps, admin, AUTHOR);

		// The private contact, the private note, the circle and the gift — not the shared note.
		expect(preview).toEqual({
			memberId: AUTHOR,
			name: 'Nina',
			privateRecords: 4,
			signsInWithSso: true,
			onlyAdminWithPassword: false
		});
	});

	it('warns when the member is the only admin who signs in with a password', async () => {
		t.db
			.update(schema.user)
			.set({ role: 'admin', passwordHash: null })
			.where(eq(schema.user.id, MEMBER))
			.run();
		const mia: Remover = { id: MEMBER, householdId: H, isAdmin: true };

		const preview = await memberRemovalPreview(deps, mia, ADMIN);

		expect(preview.onlyAdminWithPassword).toBe(true);
		expect(preview.signsInWithSso).toBe(false);
		// Another admin with a password beside Andy: no warning.
		t.db
			.update(schema.user)
			.set({ passwordHash: 'hash-mia' })
			.where(eq(schema.user.id, MEMBER))
			.run();
		expect((await memberRemovalPreview(deps, mia, ADMIN)).onlyAdminWithPassword).toBe(false);
	});

	it('refuses what the removal itself would refuse', async () => {
		await expect(memberRemovalPreview(deps, author, ADMIN)).rejects.toBeInstanceOf(NotAnAdminError);
		await expect(memberRemovalPreview(deps, admin, ADMIN)).rejects.toBeInstanceOf(
			CannotRemoveYourselfError
		);
		await expect(memberRemovalPreview(deps, admin, FOREIGN_ADMIN)).rejects.toBeInstanceOf(
			MemberGoneError
		);
	});
});

describe('listMemberAccounts', () => {
	it('lists the current members, the viewer first, and the former ones apart', async () => {
		await removeMember(deps, admin, AUTHOR);

		const { current, former } = await listMemberAccounts(deps, { id: MEMBER, householdId: H });

		expect(current.map((m) => m.name)).toEqual(['Mia', 'Andy']);
		expect(former).toEqual([
			{
				id: AUTHOR,
				name: 'Nina',
				email: 'nina@x.test',
				role: 'member',
				signIn: { password: true, sso: true },
				removedAt: NOW
			}
		]);
	});

	it('says how each member signs in', async () => {
		const { current } = await listMemberAccounts(deps, { id: ADMIN, householdId: H });
		expect(current.map((m) => [m.name, m.signIn])).toEqual([
			['Andy', { password: true, sso: false }],
			['Mia', { password: false, sso: false }],
			['Nina', { password: true, sso: true }]
		]);
	});
});
