import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { addPerson, appReady, pickPerson, signIn } from './app';
import { DEMO_ADMIN_PASSWORD, DEMO_MEMBER_EMAIL } from '../src/lib/server/db/demo-seed';

/*
 * A circle's photos by role (docs/02 §2.4.2): a photo without a role is the circle's cover, a
 * photo with one is the banner above that role's people. Written after the owner tried it in
 * the running app (docs/08 §8.4.1).
 *
 * The suite shares one database and runs serially, so every case builds a circle of its own out
 * of people it invents. Tiles, the cover and the banners are told apart by the photo id each one
 * shows — a grid tile carries it, a strip and the lightbox load `/media/<id>`.
 */

const PIXEL = readFileSync('e2e/fixtures/monica-photos/photos/ottilie-avatar.png');
const file = (name: string) => ({ name, mimeType: 'image/png', buffer: PIXEL });
const files = (...names: string[]) => names.map(file);

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

/** Creates a circle through the Circles page and lands on it. */
async function newCircle(page: Page, name: string): Promise<void> {
	await page.goto('/circles');
	// *New circle* is a disclosure, so it only answers once the shell has mounted.
	await appReady(page);
	await page.getByRole('button', { name: 'New circle' }).click();
	await page.getByLabel('Name').fill(name);
	await page.getByRole('button', { name: 'Create circle' }).click();
	await expect(page.getByRole('heading', { name })).toBeVisible();
}

/** Adds a person under a name of their own and puts them into a fresh circle under a role. */
async function circleWithRoles(page: Page, circle: string, members: [first: string, last: string, role: string][]) {
	for (const [first, last] of members) await addPerson(page, first, last);
	await newCircle(page, circle);
	for (const [first, last, role] of members) {
		await page.getByRole('button', { name: 'Add people' }).click();
		const form = page.locator('form[action="?/addMembers"]');
		await pickPerson(form.getByLabel('People'), `${first} ${last}`);
		await form.getByLabel('Role (optional)').fill(role);
		await form.getByRole('button', { name: 'Add', exact: true }).click();
		await expect(page.getByTestId('member-grid').getByRole('link', { name: `${first} ${last}` })).toBeVisible();
	}
}

const grid = (page: Page) => page.getByTestId('circle-photo-grid');
const tiles = (page: Page) => grid(page).locator('[data-photo-tile]');
const lightbox = (page: Page) => page.getByTestId('circle-photo-lightbox');
const cover = (page: Page) => page.getByTestId('circle-cover');
/** The group of members under one role heading. */
const roleGroup = (page: Page, role: string) =>
	page.getByTestId('role-group').filter({ has: page.getByRole('heading', { name: new RegExp(`^${role} ·`) }) });

/** The ids of the tiles the grid shows, in its order. */
const tileIds = (page: Page) => () =>
	tiles(page).evaluateAll((buttons) => buttons.map((b) => b.getAttribute('data-photo-tile')));

/** Which photo a strip or the lightbox is showing, read off its full-size image. */
async function shownId(scope: Locator): Promise<string | undefined> {
	const src = await scope.locator('img').first().getAttribute('src');
	return src?.match(/^\/media\/([^?]+)$/)?.[1];
}

/** Uploads through *Add photos*, with a role (or none) and shared or private, and waits for them. */
async function addCirclePhotos(
	page: Page,
	pictures: { name: string; mimeType: string; buffer: Buffer }[],
	options: { role?: string; visibility?: 'shared' | 'private' } = {}
): Promise<void> {
	const before = await tiles(page).count();
	await page.getByRole('button', { name: 'Add photos' }).click();
	const form = page.locator('#photos form');
	await form.locator('input[name=files]').setInputFiles(pictures);
	if (options.role) await form.getByText(options.role, { exact: true }).click();
	if (options.visibility === 'private') await form.getByText('Private', { exact: true }).click();
	await form.getByRole('button', { name: /^Add \d+ photos?$/ }).click();
	await expect(tiles(page)).toHaveCount(before + pictures.length);
}

/** A second browser signed in as the household's other member, Nina. */
async function signInAsNina(browser: Browser): Promise<Page> {
	const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
	const page = await context.newPage();
	await page.goto('/login');
	await page.getByLabel('Email').fill(DEMO_MEMBER_EMAIL);
	await page.getByLabel('Password').fill(DEMO_ADMIN_PASSWORD);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'What happened?' })).toBeVisible();
	await appReady(page);
	return page;
}

test('a photo with a role stands above that role’s people; one without is the cover, here and on the Circles page', async ({
	page
}) => {
	const circle = 'Heron Lane Choir';
	await circleWithRoles(page, circle, [
		['Ilka', 'Rothenbühler', 'alto'],
		['Moritz', 'Rothenbühler', 'tenor']
	]);
	// Before any photo the groups are there and bare.
	await expect(roleGroup(page, 'alto')).toBeVisible();
	await expect(page.getByTestId('circle-banner')).toHaveCount(0);
	await expect(cover(page)).toHaveCount(0);

	await addCirclePhotos(page, files('altos-1.png', 'altos-2.png'), { role: 'alto' });
	const altoBanner = roleGroup(page, 'alto').getByTestId('circle-banner');
	await expect(altoBanner).toHaveAccessibleName('Open the 2 photos of alto');
	await expect(roleGroup(page, 'tenor').getByTestId('circle-banner')).toHaveCount(0);
	// A role's photo is not the circle's cover.
	await expect(cover(page)).toHaveCount(0);

	await addCirclePhotos(page, files('everyone.png'));
	await expect(cover(page)).toHaveAccessibleName('Open the cover photo');
	await expect(page.getByTestId('circle-banner')).toHaveCount(1);

	await page.goto('/circles');
	await appReady(page);
	const card = page.getByRole('link', { name: new RegExp(circle) });
	await expect(card.getByTestId('circle-card-cover')).toBeVisible();
});

test('a banner’s lightbox walks only that role’s photos, and the role chips filter the grid', async ({ page }) => {
	await circleWithRoles(page, 'Quayside Rowing Eight', [
		['Jonna', 'Imboden', 'rower'],
		['Severin', 'Imboden', 'cox']
	]);
	await addCirclePhotos(page, files('rowers-1.png', 'rowers-2.png'), { role: 'rower' });
	await addCirclePhotos(page, files('cox.png'), { role: 'cox' });
	await addCirclePhotos(page, files('crew.png'));
	await expect(tiles(page)).toHaveCount(4);

	// A chip for All and one per group, each with its count; each narrows the grid to its own.
	const chips = page.getByTestId('circle-photo-chips');
	await expect(chips.getByRole('button')).toHaveCount(4);
	await expect(chips.getByRole('button', { name: /^All/ })).toHaveText(/^All\s*4$/);
	await expect(chips.getByRole('button', { name: /^No role/ })).toHaveText(/^No role\s*1$/);
	await expect(chips.getByRole('button', { name: /^rower/ })).toHaveText(/^rower\s*2$/);
	await expect(chips.getByRole('button', { name: /^cox/ })).toHaveText(/^cox\s*1$/);
	await chips.getByRole('button', { name: /^rower/ }).click();
	await expect(chips.getByRole('button', { name: /^rower/ })).toHaveAttribute('aria-pressed', 'true');
	await expect(tiles(page)).toHaveCount(2);
	const rowerIds = await tileIds(page)();
	await chips.getByRole('button', { name: /^cox/ }).click();
	await expect(tiles(page)).toHaveCount(1);
	const [coxId] = await tileIds(page)();
	expect(rowerIds).not.toContain(coxId);

	// Opened from the filtered grid, the lightbox walks only what the grid shows.
	await tiles(page).first().click();
	await expect(lightbox(page)).toContainText('cox · 1 of 1');
	await expect(lightbox(page).getByRole('button', { name: 'Next photo' })).toHaveCount(0);
	await lightbox(page).getByRole('button', { name: 'Close', exact: true }).click();
	await expect(lightbox(page)).toBeHidden();
	await chips.getByRole('button', { name: /^All/ }).click();
	await expect(tiles(page)).toHaveCount(4);

	// The rowers' banner walks the two rower photos and comes round again, never to the others.
	await roleGroup(page, 'rower').getByTestId('circle-banner').click();
	await expect(lightbox(page)).toContainText('rower · 1 of 2');
	const first = await shownId(lightbox(page));
	expect(rowerIds).toContain(first);
	await lightbox(page).getByRole('button', { name: 'Next photo' }).click();
	await expect(lightbox(page)).toContainText('rower · 2 of 2');
	const second = await shownId(lightbox(page));
	expect(rowerIds).toContain(second);
	expect(second).not.toBe(first);
	await lightbox(page).getByRole('button', { name: 'Next photo' }).click();
	await expect(lightbox(page)).toContainText('rower · 1 of 2');
	expect(await shownId(lightbox(page))).toBe(first);
});

test('pinning an older photo without a role makes it the cover instead of the newest', async ({ page }) => {
	await newCircle(page, 'Linden Court Neighbours');
	await addCirclePhotos(page, files('street-party.png'));
	await addCirclePhotos(page, files('courtyard.png'));
	// Newest first in the grid, and the newest is the cover while nothing is pinned.
	const [newest, older] = await tileIds(page)();
	await expect.poll(() => shownId(cover(page))).toBe(newest);

	await grid(page).locator(`[data-photo-tile="${older}"]`).click();
	await lightbox(page).getByRole('button', { name: 'Pin as favourite' }).click();
	await expect(lightbox(page).getByRole('button', { name: 'Unpin favourite' })).toBeVisible();
	await lightbox(page).getByRole('button', { name: 'Close', exact: true }).click();

	await expect.poll(() => shownId(cover(page))).toBe(older);
	await expect.poll(tileIds(page)).toEqual([older, newest]);
});

test('the other member may caption, re-role and pin a circle photo, but not hide or remove it, and never sees a private one', async ({
	page,
	browser
}) => {
	const circle = 'Birchwood Book Club';
	await circleWithRoles(page, circle, [['Valeska', 'Tschanz', 'host']]);
	await addCirclePhotos(page, files('hosting.png'), { role: 'host' });
	const [sharedId] = await tileIds(page)();
	await addCirclePhotos(page, files('my-own.png'), { visibility: 'private' });
	const privateId = (await tileIds(page)()).find((id) => id !== sharedId);
	// For the uploader the private photo is the cover.
	await expect.poll(() => shownId(cover(page))).toBe(privateId);
	const circleUrl = page.url();

	const nina = await signInAsNina(browser);
	try {
		await nina.goto(circleUrl);
		await appReady(nina);
		// The shared photo is there for her; the private one is not — not on the page, not as the
		// cover, and not at its address, while the shared one's address answers.
		await expect(tiles(nina)).toHaveCount(1);
		await expect.poll(tileIds(nina)).toEqual([sharedId]);
		await expect(cover(nina)).toHaveCount(0);
		expect((await nina.request.get(`/media/${sharedId}`)).status()).toBe(200);
		expect((await nina.request.get(`/media/${privateId}`)).status()).toBe(404);

		await tiles(nina).first().click();
		const box = lightbox(nina);
		await expect(box).toContainText('host · 1 of 1');
		// The edits anyone may make are offered; the uploader's are not.
		await expect(box.getByLabel('Caption')).toBeVisible();
		await expect(box.getByTestId('circle-photo-owner')).toHaveCount(0);
		await expect(box.getByRole('button', { name: 'Make private' })).toHaveCount(0);
		await expect(box.getByRole('button', { name: 'Remove' })).toHaveCount(0);

		await box.getByLabel('Caption').fill('Our first evening');
		await box.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(grid(nina).getByRole('img', { name: 'Our first evening' })).toHaveCount(1);

		await box.getByLabel('Role', { exact: true }).selectOption({ label: 'No role' });
		await box.getByRole('button', { name: 'Set role' }).click();
		// Without a role it is now the circle's cover — the only one she can see.
		await expect.poll(() => shownId(cover(nina))).toBe(sharedId);

		await box.getByRole('button', { name: 'Pin as favourite' }).click();
		await expect(box.getByRole('button', { name: 'Unpin favourite' })).toBeVisible();

		// Her stream has the shared upload, and only that: the private one stays its uploader's.
		await nina.goto('/');
		await appReady(nina);
		await nina.getByRole('navigation', { name: 'Filter the stream' }).getByRole('link', { name: 'Circle photos' }).click();
		const items = nina.getByTestId('stream').locator('article').filter({ hasText: circle });
		await expect(items).toHaveCount(1);
		await expect(items).toContainText('added a photo to');
	} finally {
		await nina.context().close();
	}

	// Her edits are the household's; the uploader keeps the actions only she has. The pinned
	// shared photo now leads the no-role photos, so it is the cover here too.
	await page.reload();
	await appReady(page);
	await expect(grid(page).getByRole('img', { name: 'Our first evening' })).toHaveCount(1);
	await expect.poll(() => shownId(cover(page))).toBe(sharedId);
	await grid(page).getByRole('img', { name: 'Our first evening' }).click();
	await expect(lightbox(page).getByTestId('circle-photo-owner')).toBeVisible();
	await expect(lightbox(page).getByRole('button', { name: 'Make private' })).toBeVisible();
	await expect(lightbox(page).getByRole('button', { name: 'Remove' })).toBeVisible();
});

test('the stream says who added how many photos to which circle, under the Circle photos chip', async ({ page }) => {
	const circle = 'Marigold Allotments';
	await newCircle(page, circle);
	await addCirclePhotos(page, files('beans.png', 'shed.png', 'harvest.png'));

	await page.goto('/');
	await appReady(page);
	const filter = page.getByRole('navigation', { name: 'Filter the stream' });
	await filter.getByRole('link', { name: 'Circle photos', exact: true }).click();
	await expect(page).toHaveURL(/[?&]kind=circlePhoto/);
	const items = page.getByTestId('stream').locator('article');
	const ours = items.filter({ hasText: circle });
	await expect(ours).toHaveCount(1);
	await expect(ours).toContainText(new RegExp(`You\\s*added 3 photos to\\s*${circle}`));
	await expect(ours.locator('img')).toHaveCount(4); // the leading thumbnail and the three
	// Under the chip, every item is photos added to a circle.
	await expect(items.filter({ hasNotText: /added (a photo|\d+ photos) to/ })).toHaveCount(0);

	await ours.getByRole('link', { name: circle }).click();
	await expect(page.getByRole('heading', { name: circle })).toBeVisible();
	await expect(tiles(page)).toHaveCount(3);
});
