import { expect, test, type Page } from '@playwright/test';
import { appReady, mention, openPerson, signIn } from './app';

/*
 * Putting someone out of the way (docs/02 §2.2). Written after the flow was verified in the
 * running app (docs/08 §8.4.1).
 *
 * The suite shares one demo database and runs serially, and this file runs first, so every
 * case archives and restores within itself — the next spec must find the Brunners exactly as
 * the seed left them. Franziska Widmer carries all three: no other spec names her.
 */

const WHO = 'Franziska Widmer';

async function openPeople(page: Page): Promise<void> {
	await page.getByRole('link', { name: 'People' }).first().click();
	await expect(page.getByRole('heading', { name: /^(People|Archived people)$/ })).toBeVisible();
	await appReady(page);
}

/*
 * The way to an archived person's page: through the chip, because the directory no longer
 * holds them — which is the feature working, and the reason `openPerson` cannot be used.
 */
async function openArchivedPerson(page: Page, name: string): Promise<void> {
	await page.getByRole('link', { name: 'People' }).first().click();
	await page.getByRole('link', { name: /^Archived \(\d+\)$/ }).click();
	await page.getByRole('link', { name: new RegExp(name) }).first().click();
	await expect(page.getByTestId('archived-marker')).toBeVisible();
	await appReady(page);
}

/** Archives the person whose page is open, and waits for their header to say so. */
async function archiveOpenPerson(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Archive this person' }).click();
	await expect(page.getByTestId('archived-marker')).toBeVisible();
}

/** Brings them back, so the rest of the suite meets the household it expects. */
async function restoreOpenPerson(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Bring back into the lists' }).click();
	await expect(page.getByTestId('archived-marker')).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('takes an archived person out of the directory and the search, and back in again', async ({ page }) => {
	await openPerson(page, new RegExp(WHO));
	await archiveOpenPerson(page);

	await openPeople(page);
	await expect(page.getByTestId('people-directory')).not.toContainText(WHO);

	// Search is its own read, and it has to agree with the directory. Searching the surname
	// both ways round: her husband answers, she does not.
	await page.keyboard.press('Control+k');
	const palette = page.getByRole('dialog', { name: 'Jump to' });
	await expect(palette).toBeVisible();
	await page.keyboard.type('Widmer');
	await expect(palette.getByRole('option', { name: /Thomas Widmer/ })).toBeVisible();
	await expect(palette.getByRole('option', { name: new RegExp(WHO) })).toHaveCount(0);
	await page.keyboard.press('Escape');

	// The way back: the chip counts them and lists them.
	await page.getByRole('link', { name: /^Archived \(\d+\)$/ }).click();
	await expect(page.getByTestId('people-directory')).toContainText(WHO);

	await page.getByRole('link', { name: new RegExp(WHO) }).first().click();
	await restoreOpenPerson(page);

	await openPeople(page);
	// positive control: the directory shows them again, so the first assertion meant something.
	await expect(page.getByTestId('people-directory')).toContainText(WHO);
});

test('keeps an archived person in the family, only out of the lists', async ({ page }) => {
	await openPerson(page, new RegExp(WHO));
	await archiveOpenPerson(page);

	// Their own page is untouched — it is where they are brought back from.
	await page.getByRole('tab', { name: /People/ }).click();
	await expect(page.locator('#panel-people')).toContainText('Thomas Widmer');

	// And the map still draws them: Stella works out grandparents and cousins *through*
	// people, so forgetting one would make it name the rest wrongly (docs/04 §4.9).
	await openPerson(page, /Thomas Widmer/);
	await page.getByRole('tab', { name: /People/ }).click();
	await page.getByRole('button', { name: 'Show map' }).click();
	await expect(page.getByRole('link', { name: new RegExp(`${WHO} —`) })).toBeVisible();

	await openArchivedPerson(page, WHO);
	await restoreOpenPerson(page);
});

test('keeps their name in something already written about them', async ({ page }) => {
	// A moment naming both Widmers: Thomas anchors it, Franziska rides along as a mention.
	await page.getByLabel('What happened?').pressSequentially('Walked the Aare with ');
	await mention(page, 'Thomas', /Thomas Widmer/);
	await page.getByLabel('What happened?').pressSequentially('and ');
	await mention(page, 'Franziska', new RegExp(WHO));
	await page.getByRole('button', { name: /^Save/ }).click();
	// `a.mention` is the chip *inside the sentence* — the footer lists her separately, from
	// the mention row, and would keep saying her name even if the body broke.
	await expect(page.locator('article').first().locator('a.mention', { hasText: WHO })).toHaveCount(1);

	await openPerson(page, new RegExp(WHO));
	await archiveOpenPerson(page);

	// Archiving empties the lists people pick from, not the sentences that name them: the
	// chip must still read her name and not "@unknown" (docs/02 §2.2).
	await page.getByRole('link', { name: 'Home' }).first().click();
	const moment = page.locator('article').filter({ hasText: 'Walked the Aare' }).first();
	await expect(moment.locator('a.mention', { hasText: WHO })).toHaveCount(1);
	await expect(moment).not.toContainText('@unknown');

	await openArchivedPerson(page, WHO);
	await restoreOpenPerson(page);
});

test('stops suggesting an archived person when a new one is added', async ({ page }) => {
	await openPerson(page, new RegExp(WHO));
	await archiveOpenPerson(page);

	// The duplicate/relative hint reads its own list of candidates (docs/02 §2.2.1).
	await page.goto('/contacts/new');
	await page.getByLabel('Last name').fill('Widmer');
	await page.getByLabel('Last name').blur();
	const suggestions = page.getByTestId('name-suggestions');
	await expect(suggestions).toContainText('Thomas Widmer');
	await expect(suggestions).not.toContainText(WHO);

	await openArchivedPerson(page, WHO);
	await restoreOpenPerson(page);
});
