import { expect, test, type Page } from '@playwright/test';
import { openPeople, openPerson, pickPerson, signIn } from './app';
import { LINK, seedHousehold } from './seed';
import { stateOf } from './graph-canvas';

/*
 * The app saying it is still working, and the map keeping step with the list while a removal
 * waits out its undo window (docs/05 §5.7, docs/02 §2.23). Written after the flow was verified
 * in the running app (docs/08 §8.4.1).
 *
 * Neither case waits and hopes. The indicator only shows for work that lasts, so the save here
 * is **held open by the test**: the request cannot finish until the test releases it, which is
 * a seam rather than a sleep. And the removal case proves the map is following the pending
 * state, not the server, by watching that no request has gone out at all — an instrument the
 * same test then shows working, by leaving the page and seeing the removal sent.
 *
 * Its people are seeded for it and named after nobody: the suite shares one database.
 */

/*
 * A pair per case: the restore is add-only and keyed by an id derived from the name, so two
 * cases sharing a pair would leave the second one seeding nobody.
 */
const ANNA = 'Anna Wildbach';
const BERT = 'Bert Wildbach';
const CARL = 'Carl Wildbach';
const DORA = 'Dora Wildbach';
/** `seed.ts` derives ids from the name, and the canvas addresses its nodes by contact id. */
const DORA_ID = 'e2e-dora-wildbach';

/** Holds every form post until the returned `release` is called. */
async function holdSaves(page: Page): Promise<() => void> {
	let release!: () => void;
	const held = new Promise<void>((resolve) => (release = resolve));
	await page.route('**/contacts/**', async (route) => {
		if (route.request().method() === 'POST') await held;
		await route.continue();
	});
	return release;
}

const enteredRow = (page: Page, otherName: string) =>
	page.locator('#section-relationships ul').first().locator('li').filter({ hasText: otherName });

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('says it is working while a change is in flight, without moving the page', async ({
	page,
}) => {
	await seedHousehold(page, [ANNA, BERT]);
	await openPerson(page, new RegExp(ANNA));

	const heading = page.getByRole('heading', { name: ANNA });
	const release = await holdSaves(page);

	await page.getByRole('button', { name: 'Add relationship' }).click();
	const form = page.locator('form[action="?/addRelationship"]');
	await form.locator('select[name=typeChoice]').selectOption({ label: 'Knows' });
	await pickPerson(form.getByLabel('Person'), BERT);
	/*
	 * Measured here and not earlier: opening the form scrolls its card into view, which is the
	 * section doing its job. From this point until the answer lands the only thing that changes
	 * on screen is the indicator, so anything that moves, it moved.
	 */
	const before = await heading.boundingBox();
	await form.getByRole('button', { name: 'Add', exact: true }).click();

	const indicator = page.getByTestId('activity-indicator');
	await expect(indicator).toBeVisible();
	await expect(indicator).toContainText('Updating');
	// It floats over the page rather than in it: the heading has not moved a pixel.
	expect(await heading.boundingBox()).toEqual(before);

	release();
	await expect(enteredRow(page, BERT)).toHaveCount(1);
	await expect(indicator).toHaveCount(0);
});

test('takes a removed link out of the map at once, before it is sent', async ({ page }) => {
	await seedHousehold(page, [CARL, DORA], [{ from: CARL, to: DORA, type: LINK.siblingOf }]);
	await openPerson(page, new RegExp(CARL));

	// The map is a canvas; this is the renderer answering, not the model being re-read.
	await expect.poll(() => stateOf(page, DORA_ID)).toBe('drawn');

	// Every request the page makes from here, so "nothing has been sent" is something seen
	// rather than assumed.
	const posts: string[] = [];
	page.on('request', (request) => {
		if (request.method() === 'POST') posts.push(request.url());
	});

	await enteredRow(page, DORA)
		.getByRole('button', { name: `Remove the link to ${DORA}` })
		.click();

	await expect(enteredRow(page, DORA)).toHaveCount(0);
	await expect(page.getByTestId('toast-undo')).toContainText('Relationship removed');
	await expect.poll(() => stateOf(page, DORA_ID)).toBe('absent');
	// The undo window is still open: the household's copy still has the link.
	expect(posts).toEqual([]);

	// Leaving ends the window — and shows the instrument above can see a post when there is one.
	await openPeople(page);
	expect(posts.length).toBeGreaterThan(0);
});

/*
 * The workbench is development scaffolding: it is served in `bun run dev`, and in a build only
 * to a server that sets `DEBUG_PAGES` (docs/07). The suite runs a build without it, so here the
 * route must not exist at all.
 */
test('does not serve the workbench from a build that did not ask for it', async ({ page }) => {
	const response = await page.goto('/settings/debug');

	expect(response?.status()).toBe(404);
	await expect(page.getByRole('heading', { name: 'Activity indicator' })).toHaveCount(0);
});
