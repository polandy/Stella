import { expect, test, type Browser, type Page } from '@playwright/test';
import {
	DEMO_ADMIN_PASSWORD,
	DEMO_MEMBER_EMAIL,
	DEMO_THIRD_MEMBER_EMAIL
} from '../src/lib/server/db/demo-seed';
import { appReady, openPerson, signIn } from './app';

/*
 * Removing a member from the household (docs/02 §2.1, §2.22): an admin removes one from
 * Settings → Members; every device signed in as them is signed out, Home tells it, and what
 * they shared keeps their name. A member who is no admin sees the list without *Remove…*.
 * Written after the flow was verified in the running app (docs/08 §8.4.1).
 *
 * The member removed is Lukas Brunner, whom the seed adds for this spec alone: no other spec
 * signs in as him, so removing him takes nothing from them.
 */

const LUKAS = 'Lukas Brunner';
const LUKAS_SHARED_NOTE = 'Noah will im Sommer mit ins Lager';

/** A second browser signed in with its own session as a demo member, left on Home. */
async function signInAs(browser: Browser, email: string): Promise<Page> {
	const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
	const page = await context.newPage();
	await page.goto('/login');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(DEMO_ADMIN_PASSWORD);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'What happened?' })).toBeVisible();
	await appReady(page);
	return page;
}

/** Opens Settings → Members through the app's own links. */
async function openMembers(page: Page): Promise<void> {
	await page.goto('/settings');
	await page.getByRole('link', { name: /^Members/ }).click();
	await expect(page.getByRole('heading', { name: 'Members', level: 1 })).toBeVisible();
	await appReady(page);
}

const memberRow = (page: Page, name: string) =>
	page.getByTestId('members').locator('li', { hasText: name });

test('a member who is no admin sees the members without Remove…', async ({ browser }) => {
	const nina = await signInAs(browser, DEMO_MEMBER_EMAIL);
	await openMembers(nina);

	// The rows are there, so the missing buttons are missing, not unrendered.
	await expect(memberRow(nina, LUKAS)).toBeVisible();
	await expect(memberRow(nina, 'Demo Admin')).toBeVisible();
	await expect(nina.getByText('Only an admin can remove a member.')).toBeVisible();
	await expect(nina.getByRole('button', { name: /^Remove/ })).toHaveCount(0);
	await nina.context().close();
});

test('an admin removes a member: signed out everywhere, told on Home, still named on their note', async ({
	page,
	browser
}) => {
	// Lukas is signed in elsewhere before the removal.
	const lukas = await signInAs(browser, DEMO_THIRD_MEMBER_EMAIL);

	await signIn(page);
	await openMembers(page);
	await memberRow(page, LUKAS)
		.getByRole('button', { name: `Remove ${LUKAS}…` })
		.click();
	const confirm = page.getByTestId('remove-member-confirm');
	await expect(confirm).toContainText(`Remove ${LUKAS} from the household?`);
	await expect(confirm).toContainText('Their one private record stays sealed');
	await confirm.getByRole('button', { name: `Remove ${LUKAS}`, exact: true }).click();

	await expect(page.getByText(`${LUKAS} removed`)).toBeVisible();
	await expect(memberRow(page, LUKAS)).toHaveCount(0);
	await expect(page.getByTestId('former-members')).toContainText(LUKAS);

	// His open session is gone: his next navigation lands on the login page.
	await lukas.getByRole('link', { name: 'People' }).first().click();
	await expect(lukas).toHaveURL(/\/login(\?|$)/);
	await expect(lukas.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
	await lukas.context().close();

	// Home tells the household, in the reader's words.
	await page.getByRole('link', { name: 'Home', exact: true }).first().click();
	await expect(page.getByRole('heading', { name: 'What happened?' })).toBeVisible();
	await expect(
		page.getByTestId('stream-notice').filter({ hasText: 'from the household' })
	).toHaveText(new RegExp(`You\\s*removed ${LUKAS} from the household`));

	// What he shared stays, under his name.
	await openPerson(page, /Noah Brunner/);
	await expect(
		page.locator('#section-notes').locator('li', { hasText: LUKAS_SHARED_NOTE })
	).toContainText('Lukas');
});
