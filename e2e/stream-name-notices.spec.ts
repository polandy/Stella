import { expect, test, type Page } from '@playwright/test';
import { appReady, signIn } from './app';
import { personIdOf, seedHousehold } from './seed';

/*
 * The notices about names on Home's stream (docs/dev/02 §2.11): *renamed … to* for a name
 * edited on a profile, and *set the last name … on N people* for last names given to several.
 * Each case has people no other case and not the demo household uses.
 */

/** Leaves for Home through the nav: that flushes the batch held in the undo window first. */
async function onHome(page: Page): Promise<void> {
	await page.getByRole('link', { name: 'Home', exact: true }).first().click();
	await expect(page.getByRole('heading', { name: 'What happened?' })).toBeVisible();
}

test('a name edited on a profile is told as renamed, the new name a link', async ({
	page
}, testInfo) => {
	await signIn(page);
	// A repeat starts from people the last run already renamed, so each gets names of its own.
	const tag = String.fromCharCode(97 + testInfo.repeatEachIndex);
	const old = `Ysolde Kaltbrunn${tag}`;
	await seedHousehold(page, [old], []);

	await page.goto(`/contacts/${personIdOf(old)}`);
	await appReady(page);
	await page.getByTitle('Edit name').click();
	const editor = page.getByTestId('name-editor');
	await editor.getByLabel('Last name', { exact: true }).fill(`Kaltbrunner${tag}`);
	await editor.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByRole('heading', { name: `Ysolde Kaltbrunner${tag}` })).toBeVisible();

	await onHome(page);
	const notice = page.getByTestId('stream-notice').filter({ hasText: `renamed ${old} to` });
	await expect(notice).toHaveText(
		new RegExp(`You\\s*renamed ${old} to\\s*Ysolde Kaltbrunner${tag}`)
	);
	await expect(notice.getByRole('link', { name: `Ysolde Kaltbrunner${tag}` })).toHaveAttribute(
		'href',
		`/contacts/${personIdOf(old)}`
	);
});

test('last names given to several people are told as one notice with the count', async ({
	page
}, testInfo) => {
	await signIn(page);
	const tag = String.fromCharCode(97 + testInfo.repeatEachIndex);
	const firsts = [`Quendrith${tag}`, `Odalrik${tag}`];
	const last = `Hartlieb${tag}`;
	await seedHousehold(page, firsts, []);
	for (const first of firsts) {
		await page.goto(`/contacts/${personIdOf(first)}`);
		await appReady(page);
		await expect(page.getByRole('heading', { name: first, exact: true })).toBeVisible();
	}

	await page.goto('/contacts');
	await appReady(page);
	await page.getByRole('button', { name: 'More for people' }).click();
	await page.getByRole('menuitem', { name: 'Set last name for several…' }).click();
	for (const name of firsts) await page.getByLabel(`Choose ${name}`, { exact: true }).check();
	await page.getByRole('button', { name: 'Set last name' }).click();
	const panel = page.getByTestId('set-last-name');
	await panel.getByLabel('Set last name').fill(last);
	await panel.getByRole('button', { name: 'Set', exact: true }).click();
	await expect(
		page.getByTestId('toast-undo').filter({ hasText: `Last name ${last} set for 2 people` })
	).toBeVisible();

	await onHome(page);
	await expect(
		page.getByTestId('stream-notice').filter({ hasText: `set the last name ${last} on 2 people` })
	).toHaveText(new RegExp(`You\\s*set the last name ${last} on 2 people`));
});
