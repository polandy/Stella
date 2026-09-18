import { expect, test, type Page } from '@playwright/test';
import { mention, signIn } from './app';

/*
 * Filtering the household stream by what and who (docs/02 §2.22.2). Written after the chips
 * were seen in the running app (docs/08 §8.4.1).
 *
 * The demo household has two members: the admin this suite signs in as, and Nina Brunner,
 * who wrote one journal entry about Hans Brunner. Every other spec writes as the admin, so
 * Nina's items are the stable half of the "who" row.
 */

const NINA = 'Nina Brunner';
const NINA_ENTRY = 'sharpened every knife';
const MY_MOMENT = 'oiled the squeaky hinge on the shed door';

const filterBar = (page: Page) => page.getByRole('navigation', { name: 'Filter the stream' });
const chip = (page: Page, name: string) => filterBar(page).getByRole('link', { name, exact: true });
const streamItems = (page: Page) => page.getByTestId('stream').locator('article');

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('narrows the stream to one member, and "You" is the viewer', async ({ page }) => {
	await mention(page, 'Lena', /Lena Brunner/);
	await page.getByLabel('What happened?').pressSequentially(MY_MOMENT);
	await page.getByRole('button', { name: /^Save/ }).click();
	await expect(streamItems(page).first()).toContainText(MY_MOMENT);

	await chip(page, NINA).click();
	await expect(page).toHaveURL(/[?&]by=/);
	await expect(chip(page, NINA)).toHaveAttribute('aria-current', 'true');
	await expect(streamItems(page).filter({ hasText: NINA_ENTRY })).toHaveCount(1);
	await expect(streamItems(page).filter({ hasText: MY_MOMENT })).toHaveCount(0);

	await chip(page, 'You').click();
	await expect(streamItems(page).filter({ hasText: MY_MOMENT })).toHaveCount(1);
	await expect(streamItems(page).filter({ hasText: NINA_ENTRY })).toHaveCount(0);
});

test('narrows the stream to one kind, keeps it across a reload, and Back takes it off', async ({
	page
}) => {
	await chip(page, 'New people').click();
	await expect(page).toHaveURL(/[?&]kind=person/);
	const items = streamItems(page);
	await expect(items.first()).toBeVisible();
	// Every item left is a new person: none of them lacks the badge.
	await expect(items.filter({ hasNotText: 'New person' })).toHaveCount(0);

	await page.reload();
	await expect(chip(page, 'New people')).toHaveAttribute('aria-current', 'true');
	await expect(items.filter({ hasNotText: 'New person' })).toHaveCount(0);

	await chip(page, 'Moments').click();
	await expect(page).toHaveURL(/[?&]kind=moment/);
	await expect(items.first()).toContainText('wrote in');
	await expect(items.filter({ hasText: 'New person' })).toHaveCount(0);

	await page.goBack();
	await expect(chip(page, 'New people')).toHaveAttribute('aria-current', 'true');
	await expect(items.filter({ hasNotText: 'New person' })).toHaveCount(0);
});

test('says so when nothing matches, and offers the whole stream back', async ({ page }) => {
	// Nina never removed anyone, so her notices are empty in every run.
	await chip(page, NINA).click();
	// The kind chips are rebuilt around the member; clicking before that would drop her.
	await expect(chip(page, NINA)).toHaveAttribute('aria-current', 'true');
	await chip(page, 'Notices').click();
	await expect(page).toHaveURL(/kind=notice.*by=|by=.*kind=notice/);
	// The filtered empty state, not the first-run one: only it offers the way back.
	await expect(page.getByText('Nothing here')).toBeVisible();

	await page.getByRole('link', { name: 'Show everything' }).click();
	await expect(chip(page, 'Everything')).toHaveAttribute('aria-current', 'true');
	await expect(chip(page, 'Everyone')).toHaveAttribute('aria-current', 'true');
	await expect(streamItems(page).first()).toBeVisible();
});
