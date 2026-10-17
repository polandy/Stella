import { describe, expect, it } from 'bun:test';
import type { AccountRepository } from '$lib/server/auth/accounts';
import { answerOf, formOf, MEMBER, routeEvent } from '$lib/server/testing';
import { actions } from './+page.server';

/*
 * The Settings landing's *Blur my private entries* (docs/02 §2.10.1) as the edge answers it: the
 * switch posts `on` or nothing, the member's own row is written, and the layout re-running in
 * the same request sees the new choice. The use-case has its own suite (`accounts.test.ts`).
 */

function setBlur(form: FormData) {
	const writes: { userId: string; on: boolean }[] = [];
	const accounts = {
		updateBlurPrivate: async (userId: string, on: boolean) => void writes.push({ userId, on })
	} as unknown as AccountRepository;
	const event = routeEvent<Parameters<typeof actions.setBlur>[0]>({
		services: { auth: { accountDeps: { accounts } as never } },
		url: '/settings',
		form
	});
	return { run: answerOf(actions.setBlur(event)), event, writes };
}

describe('Settings · setBlur', () => {
	it('turns the blur off when the switch posts nothing, for the member who asked', async () => {
		const { run, event, writes } = setBlur(formOf({}));
		expect(await run).toEqual({ kind: 'data', data: { blurSaved: false } });
		expect(writes).toEqual([{ userId: MEMBER.id, on: false }]);
		expect(event.locals.user?.blurPrivate).toBe(false);
	});

	it('turns it back on when the switch posts on', async () => {
		const { run, event, writes } = setBlur(formOf({ blur: 'on' }));
		expect(await run).toEqual({ kind: 'data', data: { blurSaved: true } });
		expect(writes).toEqual([{ userId: MEMBER.id, on: true }]);
		expect(event.locals.user?.blurPrivate).toBe(true);
	});
});
