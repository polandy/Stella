import { describe, expect, it } from 'bun:test';
import type { LinkSyncResult, NextcloudLink } from '../domain/nextcloud/link';
import { syncOnOpen } from './sync-on-open';

/*
 * Opening Stella syncs the linked book when it is due (docs/02 §2.16.3) without making the page
 * wait, and nothing it runs into reaches the member: a book out of reach or a failing sync is
 * only logged, by what went wrong and never by what was sent.
 */

const VIEWER = { id: 'u-ada', householdId: 'h1' };
const request = { wording: {} as never, locale: 'en' as const };

function linkAnswering(answer: () => Promise<LinkSyncResult | null>) {
	const asked: string[] = [];
	const link = {
		syncIfDue: (householdId: string) => {
			asked.push(householdId);
			return answer();
		}
	} as unknown as NextcloudLink;
	return { link, asked };
}

async function opened(answer: () => Promise<LinkSyncResult | null>) {
	const { link, asked } = linkAnswering(answer);
	const logged: string[] = [];
	const running = syncOnOpen(link, VIEWER, request, (m) => logged.push(m));
	await running;
	return { asked, logged };
}

describe('syncOnOpen', () => {
	it('asks the link to sync the viewer’s household when due, and stays quiet when it did', async () => {
		const { asked, logged } = await opened(async () => ({ ok: true, outcome: {} as never }));
		expect(asked).toEqual(['h1']);
		expect(logged).toEqual([]);
		expect((await opened(async () => null)).logged).toEqual([]);
	});

	it('logs a book out of reach', async () => {
		const { logged } = await opened(async () => ({ ok: false }));
		expect(logged).toEqual(['Nextcloud: the address book could not be reached']);
	});

	it('logs a failing sync by its message alone, never throwing into the page', async () => {
		const { logged } = await opened(async () => {
			throw new Error('constraint failed');
		});
		expect(logged).toEqual(['Nextcloud: the sync failed: constraint failed']);
	});
});
