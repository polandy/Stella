import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createTranslator } from '$lib/i18n/translate';
import type { AuthUser } from '$lib/server/auth/accounts';
import { createDrizzleMemberAccountRepository } from '$lib/server/db/member-account-repository';
import * as schema from '$lib/server/db/schema';
import { fixedClock, sequentialIds } from '$lib/server/domain/testing';
import { ADMIN, AUTHOR, H, MEMBER as MIA, removalDb } from '$lib/server/domain/testing/removal-db';
import { answerOf, formOf, routeEvent, type FakeServices } from '$lib/server/testing';
import { actions, load } from './+page.server';

/*
 * The Members page (docs/02 §2.1) as the edge answers it: every member sees who signs in, an
 * admin also gets what removing each other member would leave behind, and the `remove` action
 * is an admin's, never on themselves, with a member already gone read as done. The use-cases
 * have their own suite; here they run on the real adapter, as in `remove-member.test.ts`.
 */

const NOW = 1_760_000_000_000;
const en = createTranslator('en');

const asUser = (id: string, name: string, role: AuthUser['role']): AuthUser => ({
	id,
	householdId: H,
	email: `${id}@x.test`,
	name,
	role,
	locale: null,
	selfContactId: null
});
const andy = asUser(ADMIN, 'Andy', 'admin');
const mia = asUser(MIA, 'Mia', 'member');

let services: FakeServices;
let db: ReturnType<typeof removalDb>['db'];

beforeEach(() => {
	({ db } = removalDb());
	services = {
		household: {
			memberAccountDeps: {
				accounts: createDrizzleMemberAccountRepository(db),
				ids: sequentialIds('log-1'),
				clock: fixedClock(NOW)
			}
		}
	};
});

const removing = (user: AuthUser, memberId: string) =>
	answerOf(
		actions.remove(
			routeEvent({ services, user, url: '/settings/members', form: formOf({ memberId }) })
		)
	);

describe('load', () => {
	it('lists the members for a member, the viewer first, with nothing to remove', async () => {
		const answer = await answerOf(load(routeEvent({ services, user: mia })));

		expect(answer).toMatchObject({
			kind: 'data',
			data: { isAdmin: false, former: [], previews: {} }
		});
		const data = (answer as { data: { current: { name: string }[] } }).data;
		expect(data.current.map((m) => m.name)).toEqual(['Mia', 'Andy', 'Nina']);
	});

	it('gives an admin what removing each other member would leave behind', async () => {
		const answer = await answerOf(load(routeEvent({ services, user: andy })));

		const data = (answer as { data: { previews: Record<string, { name: string }> } }).data;
		expect(Object.keys(data.previews).sort()).toEqual([AUTHOR, MIA].sort());
		expect(data.previews[AUTHOR]).toMatchObject({ name: 'Nina', privateRecords: 0 });
	});
});

describe('remove', () => {
	it('removes the member, and the page lists them among the former members', async () => {
		expect(await removing(andy, AUTHOR)).toEqual({ kind: 'data', data: { removed: AUTHOR } });

		const after = await answerOf(load(routeEvent({ services, user: andy })));
		const data = (after as { data: { former: { id: string }[] } }).data;
		expect(data.former.map((m) => m.id)).toEqual([AUTHOR]);
	});

	it('refuses a member with the admin-only 403, removing nobody', async () => {
		expect(await removing(mia, AUTHOR)).toEqual({
			kind: 'error',
			status: 403,
			message: en('errors.admin.only')
		});
		expect(
			db.select().from(schema.user).where(eq(schema.user.id, AUTHOR)).get()?.removedAt
		).toBeNull();
	});

	it('refuses an admin removing themselves, in their language', async () => {
		expect(await removing(andy, ADMIN)).toEqual({
			kind: 'fail',
			status: 400,
			data: { error: en('errors.member.notYourself') }
		});
	});

	it('answers a member already removed with 404, which the page reads as done', async () => {
		await removing(andy, AUTHOR);
		expect(await removing(andy, AUTHOR)).toEqual({
			kind: 'fail',
			status: 404,
			data: { removed: AUTHOR }
		});
	});

	it('refuses a form the page would never post', async () => {
		const answer = await answerOf(
			actions.remove(routeEvent({ services, user: andy, form: formOf({}) }))
		);
		expect(answer).toEqual({
			kind: 'fail',
			status: 400,
			data: { error: en('errors.form.checkAndRetry') }
		});
	});
});
