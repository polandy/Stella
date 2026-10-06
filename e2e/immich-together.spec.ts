import { expect, test, type Locator, type Page } from '@playwright/test';
import { immich as en } from '../src/lib/i18n/messages/en/immich';
import { immich as de } from '../src/lib/i18n/messages/de/immich';
import { addPerson, appReady, editPeople, recordAction, signIn, unfoldPeople } from './app';

/*
 * Photos of two people together, from Immich (docs/02 §2.24.8, docs/concepts/immich.md
 * §9.26–29): the chips over a person's strip, *Together* on a relationship row, and a together
 * photo's signed URL. Written after the owner tried #249 in the preview (docs/08 §8.4.1).
 *
 * The e2e server runs with `IMMICH_DEMO=true`, whose Brunners share photos
 * (`src/lib/server/immich/demo-library.ts`). Its photo ids carry where a photo comes from: a
 * face's own photos end in that face's id (`…-4000-8000-…`), the photos a group of faces is in
 * together in the group's (`…-4000-9000-…`). The viewer's *Open in Immich* names the photo's id, so
 * that is how a case tells the photos of both from the person's own — or from everyone's photos of
 * either — without reading pixels.
 *
 * One Immich face links to one person only, and the faces are shared by the whole suite. So,
 * like `immich-matching.spec.ts`, every case unlinks whatever it linked afterwards, takes back
 * *This is me* and the language too, and links nobody to the faces another spec keeps linked
 * (Elias, Hans and Thomas, in `immich-link.spec.ts`). Thomas Widmer is linked to the face "Timo"
 * for that reason: what the case is about is that the pair has no photo together, and Timo is in
 * none of the shared photos either.
 */

const MARKUS = { id: 'demo-c-markus', name: 'Markus Brunner', face: 'Markus Brunner' };
const SANDRA = { id: 'demo-c-sandra', name: 'Sandra Brunner-Keller', face: 'Sandra Brunner' };
const LENA = { id: 'demo-c-lena', name: 'Lena Brunner', face: 'Lena Brunner' };
const NOAH = { id: 'demo-c-noah', name: 'Noah Brunner', face: 'Noah Brunner' };
const MIA = { id: 'demo-c-mia', name: 'Mia Widmer', face: 'Mia Widmer' };
const THOMAS = { id: 'demo-c-thomas', name: 'Thomas Widmer', face: 'Timo' };

type DemoPerson = typeof MARKUS;

/** The person pages of the people a case linked, unlinked again after it. */
const linkedHere: string[] = [];

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test.afterEach(async ({ page }) => {
	// English first: the steps below read the English menus.
	await page.goto('/settings');
	const english = page.getByRole('button', { name: 'English' });
	await expect(english).toBeVisible();
	if ((await english.getAttribute('aria-current')) !== 'true') await english.click();
	await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
	await appReady(page);
	const letGo = page.getByRole('button', { name: 'None of them is me' });
	if (await letGo.isVisible()) {
		await letGo.click();
		await expect(letGo).toBeHidden();
	}
	while (linkedHere.length > 0) await unlink(page, linkedHere.pop()!);
});

/** Opens a person's page and waits until its scripts answer. */
async function open(page: Page, person: { id: string; name: string }): Promise<void> {
	await page.goto(`/contacts/${person.id}`);
	await expect(page.getByRole('heading', { name: person.name, level: 1 })).toBeVisible();
	await appReady(page);
}

/** Opens the Photos card's Immich menu and picks one of its items. */
async function immichMenu(
	page: Page,
	item: 'Find in Immich' | 'Unlink from Immich'
): Promise<void> {
	await page.getByRole('button', { name: 'Immich options' }).click();
	await page.getByRole('menuitem', { name: item }).click();
}

/**
 * Links the person on screen to the demo face `faceName`, through the picker. The picker first
 * searches the person's own name; its answer is the settled state a second search starts from,
 * and when it already offers the face, no second search is needed.
 */
async function linkFace(page: Page, personName: string, faceName: string): Promise<void> {
	linkedHere.push(new URL(page.url()).pathname);
	await immichMenu(page, 'Find in Immich');
	const picker = page.getByRole('dialog', { name: `Find ${personName} in Immich` });
	const link = picker.getByRole('button', { name: `Link ${faceName} to ${personName}` });
	await expect(
		picker.getByTestId('immich-faces').or(picker.getByTestId('immich-no-faces'))
	).toBeVisible();
	if (!(await link.isVisible())) {
		await picker.getByRole('searchbox', { name: 'Name in Immich' }).fill(faceName);
		await picker.getByRole('button', { name: 'Search' }).click();
	}
	await link.click();
	await expect(picker).toBeHidden();
	// The pick is a plain form post, so the page has reloaded and must mount again.
	await appReady(page);
}

/** Opens a demo person's page and links them to their face. */
async function openAndLink(page: Page, person: DemoPerson): Promise<void> {
	await open(page, person);
	await linkFace(page, person.name, person.face);
}

/** Unlinks the person at `href` through their Photos card, if the case got as far as linking. */
async function unlink(page: Page, href: string): Promise<void> {
	await page.goto(href);
	await appReady(page);
	await page.getByRole('button', { name: 'Immich options' }).click();
	const unlinkItem = page.getByRole('menuitem', { name: 'Unlink from Immich' });
	const findItem = page.getByRole('menuitem', { name: 'Find in Immich' });
	await expect(unlinkItem.or(findItem)).toBeVisible();
	if (!(await unlinkItem.isVisible())) return;
	await unlinkItem.click();
	await appReady(page);
	await page.getByRole('button', { name: 'Immich options' }).click();
	await expect(findItem).toBeVisible();
}

/** Markus is the viewer (*This is me*) and is linked; Sandra, his wife, is linked too. */
async function meAndSandraLinked(page: Page): Promise<void> {
	await open(page, MARKUS);
	await recordAction(page, 'This is me');
	await expect(page.getByTestId('self-marker')).toHaveText('You');
	await linkFace(page, MARKUS.name, MARKUS.face);
	await openAndLink(page, SANDRA);
}

const chips = (page: Page) => page.getByTestId('immich-together');
const chip = (page: Page, label: string) =>
	chips(page).getByRole('button', { name: label, exact: true });

/** The strip's list of photos, by the name that says whose photos they are. */
const stripList = (page: Page, label: string) =>
	page.getByTestId('immich-strip').getByRole('list', { name: label, exact: true });
const tiles = (list: Locator) => list.getByRole('listitem').locator('img');

/** A relationship row on the People card, by the other person's name. */
const peopleRow = (page: Page, name: string) =>
	page
		.getByTestId('relationship-list')
		.getByRole('listitem')
		.filter({ has: page.getByRole('link', { name, exact: true }) });
const togetherButton = (row: Locator) => row.getByTestId('immich-together-row');

/** A face's own photo, and a photo several faces are in together, as Immich's web app links them. */
const OWN_PHOTO = /\/photos\/[0-9a-f]{8}-0000-4000-8000-[0-9a-f]{12}$/;
const SHARED_PHOTO = /\/photos\/[0-9a-f]{8}-0000-4000-9000-[0-9a-f]{12}$/;

/** Opens the strip's newest photo in the viewer, checks where Immich has it, and closes it again. */
async function expectNewestOpensAt(page: Page, list: Locator, where: RegExp): Promise<void> {
	await expect(tiles(list)).toHaveCount(12);
	await list.getByRole('button').first().click();
	const viewer = page.getByTestId('immich-viewer');
	await expect(viewer.getByRole('link', { name: 'Open in Immich' })).toHaveAttribute('href', where);
	await page.keyboard.press('Escape');
	await expect(viewer).toBeHidden();
}

/** The strip holds the person's own photos. */
async function expectOwnPhotos(page: Page): Promise<void> {
	await expectNewestOpensAt(page, stripList(page, en['immich.strip.label']), OWN_PHOTO);
}

/** The strip, named for the pair, holds the photos the two are in together. */
async function expectPhotosTogether(page: Page, label: string): Promise<Locator> {
	const list = stripList(page, label);
	await expectNewestOpensAt(page, list, SHARED_PHOTO);
	return list;
}

test('You and Sandra: the chips switch her strip to the photos of both, with Show more, and back', async ({
	page
}) => {
	await meAndSandraLinked(page);

	const all = chip(page, en['immich.together.own']);
	const withYou = chip(page, en['immich.together.withYou']({ name: 'Sandra' }));
	await expect(all).toHaveAttribute('aria-pressed', 'true');
	await expect(withYou).toHaveAttribute('aria-pressed', 'false');
	await expect(chips(page).getByRole('button')).toHaveCount(2);
	await expectOwnPhotos(page);

	await withYou.click();
	await expect(withYou).toHaveAttribute('aria-pressed', 'true');
	await expect(all).toHaveAttribute('aria-pressed', 'false');
	const together = await expectPhotosTogether(
		page,
		en['immich.together.stripWithYou']({ name: 'Sandra' })
	);
	await together.getByRole('button', { name: 'Show more' }).click();
	await expect(tiles(together)).toHaveCount(24);

	await all.click();
	await expect(all).toHaveAttribute('aria-pressed', 'true');
	await expectOwnPhotos(page);

	// Markus's row — her husband, and the viewer — opens the same pair.
	const markusRow = peopleRow(page, MARKUS.name);
	const button = togetherButton(markusRow);
	await expect(button).toHaveAccessibleName(
		en['immich.together.rowLabelWithYou']({ name: 'Sandra' })
	);
	await expect(button).toHaveAttribute('title', en['immich.together.row']);
	await button.click();
	await expect(withYou).toHaveAttribute('aria-pressed', 'true');
	await expectPhotosTogether(page, en['immich.together.stripWithYou']({ name: 'Sandra' }));
});

test('on your own page there is no You-and chip, and a row reads you and Sandra', async ({
	page
}) => {
	await meAndSandraLinked(page);
	await open(page, MARKUS);

	// His own photos are in, and nothing offers a pair over them.
	await expectOwnPhotos(page);
	await expect(chips(page)).toHaveCount(0);

	const button = togetherButton(peopleRow(page, SANDRA.name));
	await expect(button).toHaveAccessibleName(
		en['immich.together.rowLabelWithYou']({ name: 'Sandra' })
	);
	await button.click();
	await expect(chip(page, en['immich.together.withYou']({ name: 'Sandra' }))).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(chip(page, en['immich.together.own'])).toHaveAttribute('aria-pressed', 'false');
	await expect(chips(page).getByRole('button')).toHaveCount(2);
	await expectPhotosTogether(page, en['immich.together.stripWithYou']({ name: 'Sandra' }));
});

test('Together on a child’s row scrolls to Photos and adds a chip for the pair, which stays', async ({
	page
}) => {
	await meAndSandraLinked(page);
	await openAndLink(page, LENA);
	await open(page, SANDRA);
	const photos = page.locator('#section-photos');
	await expect(peopleRow(page, LENA.name)).toBeVisible();
	await expect(photos).not.toBeInViewport();

	const button = togetherButton(peopleRow(page, LENA.name));
	await expect(button).toHaveAccessibleName(
		en['immich.together.rowLabelPair']({ first: 'Sandra', second: 'Lena' })
	);
	await button.click();

	await expect(photos).toBeInViewport();
	const pair = chip(page, en['immich.together.pair']({ first: 'Sandra', second: 'Lena' }));
	await expect(pair).toHaveAttribute('aria-pressed', 'true');
	await expect(pair).toBeFocused();
	await expect(chips(page).getByRole('button')).toHaveText([
		en['immich.together.own'],
		en['immich.together.withYou']({ name: 'Sandra' }),
		en['immich.together.pair']({ first: 'Sandra', second: 'Lena' })
	]);
	await expectPhotosTogether(
		page,
		en['immich.together.stripPair']({ first: 'Sandra', second: 'Lena' })
	);

	// All photos and back, one tap each: the pair's chip stays.
	await chip(page, en['immich.together.own']).click();
	await expectOwnPhotos(page);
	await expect(pair).toHaveAttribute('aria-pressed', 'false');
	await pair.click();
	await expect(pair).toHaveAttribute('aria-pressed', 'true');
	await expectPhotosTogether(
		page,
		en['immich.together.stripPair']({ first: 'Sandra', second: 'Lena' })
	);
});

test('no Together on a sibling’s or a friend’s row, nor in the People card’s edit mode', async ({
	page
}) => {
	for (const person of [SANDRA, NOAH, MIA, LENA]) await openAndLink(page, person);
	// Lena's page, linked like the three: her mother, her brother and her best friend.
	const mother = peopleRow(page, SANDRA.name);
	await expect(togetherButton(mother)).toHaveAccessibleName(
		en['immich.together.rowLabelPair']({ first: 'Lena', second: 'Sandra' })
	);
	await unfoldPeople(page);
	await expect(peopleRow(page, NOAH.name)).toBeVisible();
	await expect(peopleRow(page, MIA.name)).toBeVisible();
	await expect(togetherButton(peopleRow(page, NOAH.name))).toHaveCount(0);
	await expect(togetherButton(peopleRow(page, MIA.name))).toHaveCount(0);
	// Her mother's is the only one: Markus, her father, is not linked in this case.
	await expect(page.getByTestId('immich-together-row')).toHaveCount(1);

	await editPeople(page);
	await expect(mother.getByRole('button', { name: /^Edit/ }).first()).toBeVisible();
	await expect(page.getByTestId('immich-together-row')).toHaveCount(0);
});

test('a pair with no photo together says so', async ({ page }) => {
	await openAndLink(page, MIA);
	await openAndLink(page, THOMAS);

	await togetherButton(peopleRow(page, MIA.name)).click();
	await expect(
		chip(page, en['immich.together.pair']({ first: 'Thomas', second: 'Mia' }))
	).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByTestId('immich-strip')).toHaveText(en['immich.together.none']);

	// His own photos are still there, one tap away.
	await chip(page, en['immich.together.own']).click();
	await expect(tiles(stripList(page, en['immich.strip.label'])).first()).toBeVisible();
});

test('Use as photo from the photos of both goes to the person whose page it is', async ({
	page
}) => {
	await open(page, MARKUS);
	await recordAction(page, 'This is me');
	await linkFace(page, MARKUS.name, MARKUS.face);
	// Someone of this case's own, so the demo Sandra keeps the picture she has.
	await addPerson(page, 'Quendolin', 'Zusammen');
	await linkFace(page, 'Quendolin Zusammen', SANDRA.face);

	await chip(page, en['immich.together.withYou']({ name: 'Quendolin' })).click();
	const list = await expectPhotosTogether(
		page,
		en['immich.together.stripWithYou']({ name: 'Quendolin' })
	);
	const newest = list.getByRole('button').first();
	const day = /^Photo from (.+), in Immich$/.exec(
		(await newest.locator('img').getAttribute('alt')) ?? ''
	)?.[1];
	if (!day) throw new Error('The strip’s photo has no day in its description.');
	await newest.click();
	const viewer = page.getByTestId('immich-viewer');
	await expect(viewer).toContainText(`Taken ${day}`);
	await expect(viewer.getByRole('link', { name: 'Open in Immich' })).toBeVisible();

	await viewer.getByRole('button', { name: 'Use as photo' }).click();
	const cropper = page.getByRole('dialog', { name: 'Frame the photo' });
	await cropper.getByRole('button', { name: 'Use photo' }).click();

	// Stored first, then the viewer closes: a failure here says which of the two did not happen.
	const worn = page
		.getByTestId('avatar-uploader')
		.getByRole('button', { name: /^(Add a photo|Change photo)$/ })
		.locator('img');
	await expect(worn).toHaveAttribute('src', /\/media\//);
	await expect(viewer).toBeHidden();
	const gallery = page.getByTestId('photo-grid');
	await expect(gallery.locator('li img')).toHaveCount(1);
	await gallery.getByRole('button').first().click();
	await expect(page.getByTestId('photo-lightbox').getByTestId('photo-date')).toHaveText(
		`Taken ${day}`
	);
});

test('a photo of both stops loading once one of them is unlinked', async ({ page }) => {
	await meAndSandraLinked(page);
	const ownSrc = await tiles(stripList(page, en['immich.strip.label'])).first().getAttribute('src');
	await chip(page, en['immich.together.withYou']({ name: 'Sandra' })).click();
	const list = await expectPhotosTogether(
		page,
		en['immich.together.stripWithYou']({ name: 'Sandra' })
	);
	const togetherSrc = await tiles(list).first().getAttribute('src');
	expect((await page.request.get(togetherSrc!)).status()).toBe(200);

	// Markus — the other one of the pair — is unlinked.
	await unlink(page, `/contacts/${MARKUS.id}`);

	// Sandra's own photos still load, so the refusal is the pair's, not the proxy's.
	expect((await page.request.get(ownSrc!)).status()).toBe(200);
	expect((await page.request.get(togetherSrc!)).status()).toBe(404);
});

test('the chips and the row’s button speak German', async ({ page }) => {
	await meAndSandraLinked(page);
	await page.goto('/settings');
	await page.getByRole('button', { name: 'Deutsch' }).click();
	await expect(page.getByRole('heading', { name: 'Einstellungen', exact: true })).toBeVisible();

	await page.goto(`/contacts/${SANDRA.id}`);
	await expect(page.getByRole('heading', { name: SANDRA.name, level: 1 })).toBeVisible();
	// The strip asks for its photos once the page's scripts run, so the chips answer by then.
	await expect(page.getByTestId('immich-strip')).toHaveAttribute('data-phase', 'shown');
	await expect(chip(page, de['immich.together.own'])).toHaveAttribute('aria-pressed', 'true');
	const withYou = chip(page, de['immich.together.withYou']({ name: 'Sandra' }));
	await expect(withYou).toBeVisible();
	const button = togetherButton(peopleRow(page, MARKUS.name));
	await expect(button).toHaveAccessibleName(
		de['immich.together.rowLabelWithYou']({ name: 'Sandra' })
	);
	await expect(button).toHaveAttribute('title', de['immich.together.row']);
	await withYou.click();
	await expect(
		page
			.getByTestId('immich-strip')
			.getByRole('list', { name: de['immich.together.stripWithYou']({ name: 'Sandra' }) })
	).toBeVisible();
});
