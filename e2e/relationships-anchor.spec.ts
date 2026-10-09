import { expect, test, type Page } from '@playwright/test';
import { CLAIMS_PER_GROUP } from '../src/lib/suggestions/paging';
import { appReady, fromPeopleMenu, signIn } from './app';
import { LINK, seedHousehold } from './seed';

/*
 * Every link that means a person's Relationships card lands on it (docs/05 §5.5): the card's
 * own *Check relationships*, and from Settings → Relationships the person's name and *Open
 * all*. They once spelled `#relationships`, an id nothing carries, and opened at the top of the
 * page. Written after the owner tried them on the phone (docs/08 §8.4.1).
 *
 * A short window, so the card starts below the fold and only a real jump brings it into view.
 * Markus is read-only here; the Settings case seeds a family of its own (the Imboden surname is
 * used by no seeded person and no other spec), whose claims outnumber one group's fold.
 */

const MARKUS = 'demo-c-markus';
const SURNAME = 'Imboden';
const card = (page: Page) => page.locator('#section-relationships');

test.use({ viewport: { width: 412, height: 480 } });

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

/** On the card: the address names it and the window shows it. */
async function landedOnTheCard(page: Page): Promise<void> {
	await expect(page).toHaveURL(/#section-relationships$/);
	await expect(card(page)).toBeInViewport();
}

test('the card’s Check relationships opens the review on the card', async ({ page }) => {
	await page.goto(`/contacts/${MARKUS}`);
	const name = page.getByRole('heading', { name: 'Markus Brunner', exact: true });
	await expect(name).toBeInViewport();
	await appReady(page);

	await fromPeopleMenu(page, 'Check relationships');

	await expect(page.getByTestId('kin-review')).toBeVisible();
	await landedOnTheCard(page);
	// The page moved: the identity card at its top is scrolled away.
	await expect(name).not.toBeInViewport();
});

test('Settings → Relationships leads to the person’s card, and Open all to their review', async ({
	page
}) => {
	const one = `Ueli ${SURNAME}`;
	const other = `Mia ${SURNAME}`;
	const parents = ['Anton', 'Berta', 'Carl', 'Dora', 'Emil', 'Frieda', 'Gustav'].map(
		(first) => `${first} ${SURNAME}`
	);
	expect(parents.length).toBeGreaterThan(CLAIMS_PER_GROUP);
	await seedHousehold(
		page,
		[one, other, ...parents],
		[
			{ from: one, to: other, type: LINK.siblingOf },
			...parents.map((parent) => ({ from: parent, to: one, type: LINK.parentOf }))
		]
	);

	const review = `/settings/relationships?review&q=${SURNAME}`;
	const group = page.locator('main section').filter({ hasText: `is a parent of ${other}` });

	await page.goto(review);
	// The group's heading link, first in the group; the reasons below name people too.
	await group.getByRole('link', { name: other }).first().click();
	await expect(page.getByRole('heading', { name: other, exact: true })).toBeAttached();
	await landedOnTheCard(page);

	await page.goto(review);
	await group.getByRole('link', { name: `Open all ${parents.length}` }).click();
	await expect(page.getByTestId('kin-review')).toBeVisible();
	await landedOnTheCard(page);
});
