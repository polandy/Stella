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
 * shows — a grid tile carries it, a strip and the lightbox load `/media/<id>?view`.
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

/** Which photo a strip or the lightbox is showing, read off its 1600 px view. */
async function shownId(scope: Locator): Promise<string | undefined> {
	const src = await scope.locator('img').first().getAttribute('src');
	return src?.match(/^\/media\/([^?]+)\?view$/)?.[1];
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
	await expect(lightbox(page)).toContainText(/cox ·\s*1 of 1/);
	await expect(lightbox(page).getByRole('button', { name: 'Next photo' })).toHaveCount(0);
	await lightbox(page).getByRole('button', { name: 'Close', exact: true }).click();
	await expect(lightbox(page)).toBeHidden();
	await chips.getByRole('button', { name: /^All/ }).click();
	await expect(tiles(page)).toHaveCount(4);

	// The rowers' banner walks the two rower photos and comes round again, never to the others.
	await roleGroup(page, 'rower').getByTestId('circle-banner').click();
	await expect(lightbox(page)).toContainText(/rower ·\s*1 of 2/);
	const first = await shownId(lightbox(page));
	expect(rowerIds).toContain(first);
	await lightbox(page).getByRole('button', { name: 'Next photo' }).click();
	await expect(lightbox(page)).toContainText(/rower ·\s*2 of 2/);
	const second = await shownId(lightbox(page));
	expect(rowerIds).toContain(second);
	expect(second).not.toBe(first);
	await lightbox(page).getByRole('button', { name: 'Next photo' }).click();
	await expect(lightbox(page)).toContainText(/rower ·\s*1 of 2/);
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
		await expect(box).toContainText(/host ·\s*1 of 1/);
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

/*
 * Profile pictures cut from a group photo (docs/concepts/circle-photos.md §5). The picture is
 * drawn in the browser rather than read from a fixture: the cropper needs something larger
 * than a pixel to frame, and a cut is rendered from the full picture the cropper loads.
 */

/** A 1200×800 landscape in three bands, large enough for the cropper to frame a square of. */
async function groupPicture(page: Page, name: string): Promise<{ name: string; mimeType: string; buffer: Buffer }> {
	const bytes = await page.evaluate(async () => {
		const canvas = document.createElement('canvas');
		canvas.width = 1200;
		canvas.height = 800;
		const ctx = canvas.getContext('2d')!;
		['#ee0000', '#00aa00', '#0000ee'].forEach((colour, third) => {
			ctx.fillStyle = colour;
			ctx.fillRect(third * 400, 0, 400, 800);
		});
		const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
		return Array.from(new Uint8Array(await blob.arrayBuffer()));
	});
	return { name, mimeType: 'image/png', buffer: Buffer.from(bytes) };
}

const cutDialog = (page: Page) => page.getByTestId('cut-dialog');
const candidate = (page: Page, name: string) => cutDialog(page).getByTestId('cut-candidate').filter({ hasText: name });
const WEARS = 'Wears a cut of this photo';

/** In an open cut dialog: picks the person, keeps the cropper's square and waits for the cut. */
async function cutFor(page: Page, name: string): Promise<void> {
	await candidate(page, name).click();
	const cropper = page.getByTestId('photo-cropper');
	await expect(cropper.getByRole('button', { name: 'Use photo' })).toBeEnabled();
	// The square is rendered in the browser before it is posted, which a cold runner can take a
	// while over: Stella's answer to the post is the signal the cut is done, not a guess at time.
	const stored = page.waitForResponse(
		(response) => response.url().includes('?/cutProfilePicture') && response.request().method() === 'POST'
	);
	await cropper.getByRole('button', { name: 'Use photo' }).click();
	expect((await stored).ok()).toBe(true);
	await expect(cutDialog(page).getByTestId('cut-done')).toHaveText(`${name} now wears this photo.`);
}

/** Opens the only photo of the circle and cuts each of `names` out of it, one after another. */
async function cutFromOnlyPhoto(page: Page, ...names: string[]): Promise<void> {
	await tiles(page).first().click();
	await lightbox(page).getByTestId('cut-open').click();
	for (const [index, name] of names.entries()) {
		if (index > 0) await cutDialog(page).getByRole('button', { name: 'Next person' }).click();
		await cutFor(page, name);
	}
	await cutDialog(page).getByRole('button', { name: 'Done' }).click();
	await expect(cutDialog(page)).toBeHidden();
}

/** The address of a member's page, read off the circle's member grid. */
async function memberPage(page: Page, name: string): Promise<string> {
	const href = await page.getByTestId('member-grid').getByRole('link', { name }).getAttribute('href');
	expect(href).toMatch(/^\/contacts\//);
	return href!;
}

/** The picture on the person page's header, apart from the chooser's group photos beside it. */
const headerPicture = (page: Page) =>
	page.getByTestId('avatar-uploader').getByRole('button', { name: 'Change photo' }).locator('img');

/** The person page's header picture: an image that has loaded, and the photo id it shows. */
async function wornPictureId(page: Page): Promise<string> {
	const img = headerPicture(page);
	await expect(img).toHaveAttribute('src', /^\/media\/[^?]+\?thumb$/);
	// Decoding fails on a picture that does not load, so this is the picture really there.
	expect(await img.evaluate(async (el: HTMLImageElement) => (await el.decode(), el.naturalWidth))).toBeGreaterThan(0);
	return (await img.getAttribute('src'))!.match(/^\/media\/([^?]+)\?thumb$/)![1];
}

const galleryIds = (page: Page) => () =>
	page
		.getByTestId('photo-grid')
		.locator('img')
		.evaluateAll((imgs) => imgs.map((img) => img.getAttribute('src')?.match(/^\/media\/([^?]+)\?thumb$/)?.[1]));

test('cuts a member’s profile picture from the lightbox, marks them as cut and offers the next person', async ({
	page
}) => {
	const circle = 'Saffron Street Class 1B';
	await circleWithRoles(page, circle, [
		['Elodie', 'Wyss', 'pupil'],
		['Matteo', 'Wyss', 'pupil']
	]);
	await addCirclePhotos(page, [await groupPicture(page, 'class.png')], { role: 'pupil' });
	const elodiePage = await memberPage(page, 'Elodie Wyss');

	await tiles(page).first().click();
	await lightbox(page).getByRole('button', { name: 'Use as profile picture for …' }).click();
	// The photo's role leads the list, and nobody wears a cut of it yet: both show initials.
	await expect(cutDialog(page).getByRole('heading', { name: 'pupil' })).toBeVisible();
	await expect(candidate(page, 'Elodie Wyss')).toBeVisible();
	await expect(candidate(page, 'Matteo Wyss')).toBeVisible();
	await expect(cutDialog(page).getByTestId('cut-candidate').locator('img')).toHaveCount(0);
	await expect(cutDialog(page)).not.toContainText(WEARS);

	await cutFor(page, 'Elodie Wyss');
	await cutDialog(page).getByRole('button', { name: 'Next person' }).click();
	// Back at the list: Elodie now wears the photo and is marked; Matteo is still to do.
	await expect(candidate(page, 'Matteo Wyss')).toBeVisible();
	await expect(candidate(page, 'Elodie Wyss')).toContainText(WEARS);
	await expect(candidate(page, 'Elodie Wyss').locator('img')).toHaveCount(1);
	await expect(candidate(page, 'Matteo Wyss')).not.toContainText(WEARS);
	await expect(candidate(page, 'Matteo Wyss').locator('img')).toHaveCount(0);

	await page.goto(elodiePage);
	await appReady(page);
	await wornPictureId(page);
	// What she wears is a framing of the group photo, not a photo in her gallery.
	await expect(page.getByTestId('on-group-photos').getByRole('link', { name: circle })).toBeVisible();
	await expect(page.getByTestId('photo-grid')).toHaveCount(0);
});

test('a new profile picture keeps the old cut as their own photo, from the circle, beside the group photo', async ({
	page
}) => {
	const circle = 'Wisteria Close Choir';
	await circleWithRoles(page, circle, [['Linus', 'Ammann', 'bass']]);
	await addCirclePhotos(page, [await groupPicture(page, 'choir.png')]);
	const linusPage = await memberPage(page, 'Linus Ammann');
	await cutFromOnlyPhoto(page, 'Linus Ammann');

	await page.goto(linusPage);
	await appReady(page);
	const cut = await wornPictureId(page);

	// A different picture, from a file: the uploader's own input, as the chooser's *Choose a
	// picture…* would open it.
	await page
		.getByTestId('avatar-uploader')
		.locator('input[type=file]')
		.setInputFiles(await groupPicture(page, 'portrait.png'));
	const cropper = page.getByTestId('photo-cropper');
	await expect(cropper.getByRole('button', { name: 'Use photo' })).toBeEnabled();
	await cropper.getByRole('button', { name: 'Use photo' }).click();
	await expect(headerPicture(page)).not.toHaveAttribute('src', `/media/${cut}?thumb`);
	expect(await wornPictureId(page)).not.toBe(cut);

	// The old cut is in the gallery now, as a photo of his own that says where it came from.
	await expect.poll(galleryIds(page)).toContain(cut);
	await page.locator(`[data-testid=photo-grid] img[src="/media/${cut}?thumb"]`).click();
	await expect(page.getByTestId('photo-lightbox').getByTestId('photo-cut-from')).toHaveText(`From ${circle}`);
	await page.getByTestId('photo-lightbox').getByRole('button', { name: 'Close', exact: true }).click();

	// And the group photo it was cut from is listed under *On group photos*, into the circle.
	const onGroupPhotos = page.getByTestId('on-group-photos');
	await expect(onGroupPhotos.getByRole('heading', { name: 'On group photos' })).toBeVisible();
	await expect(onGroupPhotos.getByRole('link')).toHaveCount(1);
	await onGroupPhotos.getByRole('link', { name: circle }).click();
	await expect(page.getByRole('heading', { name: circle })).toBeVisible();
});

for (const [action, confirm, keeps, family] of [
	['Remove', 'Remove anyway', 'They keep it as a photo of their own.', 'Kälin'],
	['Make private', 'Make private anyway', 'They keep it as a shared photo of their own.', 'Gisler']
] as const) {
	test(`${action} on a group photo someone wears warns first, and they keep their picture`, async ({ page, browser }) => {
		const circle = `Cedar Row Quartet (${action})`;
		await circleWithRoles(page, circle, [
			['Aurelio', family, 'violin'],
			['Benedikta', family, 'viola']
		]);
		await addCirclePhotos(page, [await groupPicture(page, 'quartet.png')]);
		const aurelioPage = await memberPage(page, `Aurelio ${family}`);
		await cutFromOnlyPhoto(page, `Aurelio ${family}`, `Benedikta ${family}`);

		const owner = lightbox(page).getByTestId('circle-photo-owner');
		await owner.getByRole('button', { name: action, exact: true }).click();
		const warning = owner.getByTestId('cut-warning');
		await expect(warning).toContainText('This photo is the profile picture of 2 people.');
		await expect(warning).toContainText(keeps);
		// Cancel asks nothing more and changes nothing.
		await warning.getByRole('button', { name: 'Cancel' }).click();
		await expect(warning).toBeHidden();
		await expect(tiles(page)).toHaveCount(1);

		await owner.getByRole('button', { name: action, exact: true }).click();
		await warning.getByRole('button', { name: confirm }).click();
		if (action === 'Remove') {
			await expect(tiles(page)).toHaveCount(0);
		} else {
			await expect(owner.getByRole('button', { name: 'Share with the household' })).toBeVisible();
		}

		// The picture he wore is a photo of his own now: in his gallery and still on his page.
		await page.goto(aurelioPage);
		await appReady(page);
		const worn = await wornPictureId(page);
		await expect.poll(galleryIds(page)).toEqual([worn]);

		// The other member sees it too: it is shared, whatever became of the group photo.
		const nina = await signInAsNina(browser);
		try {
			await nina.goto(aurelioPage);
			await appReady(nina);
			expect(await wornPictureId(nina)).toBe(worn);
		} finally {
			await nina.context().close();
		}
	});
}
