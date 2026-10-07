import { expect, test, type Page } from '@playwright/test';
import { addPerson, appReady, recordAction, signIn } from './app';

/*
 * *Settings → Immich → Find your people → New from Immich* (docs/02 §2.24.7): the faces Immich
 * has a name for that are nobody in Stella yet. Written after the owner tried #252 in the preview
 * (docs/08 §8.4.1).
 *
 * The e2e server runs with `IMMICH_DEMO=true`, whose library ends in four faces made for this
 * tab (`src/lib/server/immich/demo-library.ts`): Grosi Ursula (420 photos) and Thomas W. (12)
 * have namesakes in Stella to compare with, Andrea Meier (77) and Pius (5) have none and go
 * straight to the form.
 *
 * The faces and the household are shared by the whole suite, so every case hands them back as it
 * found them: a person it adds is deleted again afterwards (which frees the face it was linked
 * to, and takes the namesake out of the next case's comparison), an ignore is proposed again.
 * The Thomas case does not link Thomas Widmer, as the by-hand list says: `immich-link.spec.ts`
 * keeps his face linked to somebody else, so what Matching offers him depends on what ran
 * before. It links a person of its own to the face "Timo" instead, which no other case keeps.
 */

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

/** The person pages of the people a case added or linked, deleted again after it. */
const madeHere: string[] = [];

test.afterEach(async ({ page }) => {
	while (madeHere.length > 0) await deletePerson(page, madeHere.pop()!);
});

/** Deletes the person at `href` for good, if the case got as far as making them. */
async function deletePerson(page: Page, href: string): Promise<void> {
	await page.goto(href);
	await appReady(page);
	const name = (await page.getByRole('heading', { level: 1 }).textContent())?.trim();
	if (!name) throw new Error(`The page ${href} names nobody to delete.`);
	await recordAction(page, 'Delete for good');
	await page.getByRole('button', { name: `Delete ${name}` }).click();
	await expect(page.getByRole('heading', { name: 'People' })).toBeVisible();
}

const rows = (page: Page) => page.getByTestId('immich-newcomer');
const row = (page: Page, name: string) =>
	rows(page).filter({ has: page.locator('p.font-medium', { hasText: name }) });
const tab = (page: Page, name: RegExp | string) => page.getByRole('tab', { name });
const toast = (page: Page) => page.getByTestId('toast-notice');
const undoToast = (page: Page) => page.getByTestId('toast-undo');

/** The names the tab lists, top to bottom. */
const listedNames = (page: Page) => rows(page).locator('p.font-medium').allTextContents();

/** The page with both counts in: the Matching tab saying how many rows it has is the signal. */
async function listShown(page: Page): Promise<void> {
	await expect(tab(page, /^Matching · \d+$/)).toBeVisible();
	await appReady(page);
}

/** Opens *Find your people* the way a member does, through its card in Settings. */
async function openFromSettings(page: Page): Promise<void> {
	await page.getByRole('link', { name: 'Settings' }).first().click();
	await page.getByRole('link', { name: /Find your people/ }).click();
	await expect(page.getByRole('heading', { name: 'Find your people', level: 1 })).toBeVisible();
	await listShown(page);
}

/** *Find your people*, switched to *New from Immich*, with its rows in. */
async function openNewcomers(page: Page): Promise<void> {
	await openFromSettings(page);
	await tab(page, /^New from Immich/).click();
	await expect(page.getByTestId('immich-panel')).toHaveAttribute('data-tab', 'new');
	await expect(row(page, 'Grosi Ursula')).toBeVisible();
}

/**
 * The person a toast says was added, found by its *Open* link and marked for deletion at once, so
 * a case that fails further on still hands the face back. Returns the person's page.
 */
async function addedPerson(page: Page): Promise<string> {
	const href = await toast(page).getByRole('link', { name: 'Open' }).getAttribute('href');
	if (!href) throw new Error("The toast's Open leads nowhere.");
	if (!madeHere.includes(href)) madeHere.push(href);
	return href;
}

/** Follows the toast's *Open* to the person it added. */
async function openAdded(page: Page): Promise<void> {
	const href = await addedPerson(page);
	await toast(page).getByRole('link', { name: 'Open' }).click();
	await expect(page).toHaveURL(href);
	await appReady(page);
}

/** Links the person on screen to the demo face of that name, through the Photos card's picker. */
async function linkFace(page: Page, personName: string, faceName: string): Promise<void> {
	await page.getByRole('button', { name: 'Immich options' }).click();
	await page.getByRole('menuitem', { name: 'Find in Immich' }).click();
	const picker = page.getByRole('dialog', {
		name: `Find ${personName} in Immich`
	});
	// The picker first searches the person's own name; its answer, whichever it is, is the
	// settled state the second search starts from.
	await expect(
		picker
			.getByText('Pick the face that is this person.')
			.or(picker.getByText('No face in Immich has this name.', { exact: false }))
	).toBeVisible();
	await picker.getByRole('searchbox', { name: 'Name in Immich' }).fill(faceName);
	await picker.getByRole('button', { name: 'Search' }).click();
	await picker.getByRole('button', { name: `Link ${faceName} to ${personName}` }).click();
	await expect(picker).toBeHidden();
	await appReady(page);
}

test('while Immich is asked grey rows stand in for the list; then Matching is the chosen tab, and both tabs count', async ({
	page
}) => {
	await page.goto('/settings');
	await appReady(page);

	// The test holds Immich's answer open: the page's data arrives with the list still a promise
	// that nothing settles, so "loading" is a state the test is in, not one it hopes to catch.
	await page.route(/\/settings\/immich\/__data\.json/, async (route) => {
		const answer = await route.fetch();
		const [first] = (await answer.text()).split('\n');
		await route.fulfill({ response: answer, body: `${first}\n` });
	});
	await page.getByRole('link', { name: /Find your people/ }).click();
	await expect(page.getByRole('heading', { name: 'Find your people', level: 1 })).toBeVisible();

	await expect(page.getByTestId('immich-loading')).toBeVisible();
	await expect(page.getByTestId('activity-indicator')).toContainText(
		'Asking Immich for its people…'
	);
	// Matching is the chosen tab, and neither tab can count what it has not been told.
	await expect(tab(page, 'Matching')).toHaveAttribute('aria-selected', 'true');
	await expect(tab(page, 'New from Immich')).toHaveAttribute('aria-selected', 'false');

	// Asked for real, the grey rows give way to the list, and each tab says how long it is.
	await page.unroute(/\/settings\/immich\/__data\.json/);
	await page.reload();
	await listShown(page);
	await expect(page.getByTestId('immich-loading')).toHaveCount(0);
	await expect(tab(page, /^Matching/)).toHaveAttribute('aria-selected', 'true');
	const matching = await page.getByTestId('immich-match').count();
	await expect(tab(page, /^Matching/)).toHaveText(`Matching · ${matching}`);

	await tab(page, /^New from Immich/).click();
	await expect(row(page, 'Grosi Ursula')).toBeVisible();
	const newcomers = await rows(page).count();
	await expect(tab(page, /^New from Immich/)).toHaveText(`New from Immich · ${newcomers}`);
});

test('New from Immich lists the faces Immich names that nobody holds, the most photographed first', async ({
	page
}) => {
	await openNewcomers(page);

	// The list is read for the rows this spec names: what else is still free is the suite's order.
	const names = await listedNames(page);
	const ours = ['Grosi Ursula', 'Andrea Meier', 'Thomas W.', 'Pius'];
	expect(names.filter((name) => ours.includes(name))).toEqual(ours);

	for (const [name, photos] of [
		['Grosi Ursula', '420 photos'],
		['Andrea Meier', '77 photos'],
		['Thomas W.', '12 photos'],
		['Pius', '5 photos']
	]) {
		await expect(row(page, name)).toContainText(`In Immich · ${photos}`);
	}

	// A face Stella proposes on Matching is not offered here as well, and the tab's summary
	// counts what it lists.
	await expect(row(page, 'Luca Widmer')).toHaveCount(0);
	await expect(row(page, 'Timo')).toHaveCount(0);
	await expect(
		page.getByText(`${names.length} names from Immich, most photos first`)
	).toBeVisible();

	// The real face, served for the household, not a broken picture.
	const face = row(page, 'Grosi Ursula').getByRole('img', {
		name: 'Grosi Ursula in Immich'
	});
	await expect
		.poll(() => face.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
		.toBe(true);
});

test('Assign… compares the face with the person of a similar name; adding a new one starts from the name, links the face and keeps it as the photo', async ({
	page
}) => {
	await openNewcomers(page);
	const grosi = row(page, 'Grosi Ursula');
	await grosi.getByRole('button', { name: 'Assign Grosi Ursula' }).click();

	// Face beside face: Immich's, then Ursula Keller-Marti's own — with a way to see it in Immich.
	// The suite shares one household, so another spec may have added an Ursula: the question is
	// asked in the singular or the plural, and Ursula Keller-Marti is one of the candidates.
	await expect(
		grosi.getByText(/similar name\. Is (it|one of them) the same person\?/)
	).toBeVisible();
	const similar = grosi.getByTestId('immich-similar').filter({
		has: page.getByRole('link', { name: 'Ursula Keller-Marti' })
	});
	await expect(similar).toHaveCount(1);
	await expect(similar.locator('img').first()).toHaveAttribute(
		'src',
		(await grosi.getByRole('img', { name: 'Grosi Ursula in Immich' }).getAttribute('src'))!
	);
	await expect(grosi.getByRole('link', { name: 'Open in Immich' })).toHaveAttribute(
		'href',
		/\/people\/d0000000-0000-4000-8000-00000000000f$/
	);

	// Not her: the form starts from the name — "Grosi" is the nickname, not a first name.
	await grosi.getByRole('button', { name: 'No, add a new person' }).click();
	await expect(grosi.getByLabel('First name')).toHaveValue('Ursula');
	await expect(grosi.getByLabel('Last name')).toHaveValue('');
	await expect(grosi.getByLabel('Nickname')).toHaveValue('Grosi');
	await expect(grosi.getByText('“Grosi” suggested as nickname.')).toBeVisible();
	await expect(
		grosi.getByRole('checkbox', { name: 'Use the face from Immich as photo' })
	).toBeChecked();
	// A first name alone is asked to be told apart (docs/02 §2.2.3).
	await grosi.getByLabel('Description').fill('Grandmother of the e2e suite');

	const photoSent = page.waitForResponse(
		(answer) => answer.url().includes('?/useImmichPhoto') && answer.request().method() === 'POST'
	);
	await grosi.getByRole('button', { name: 'Add and link' }).click();

	await expect(toast(page)).toContainText('Ursula “Grosi” added');
	await addedPerson(page);
	await expect(row(page, 'Grosi Ursula')).toHaveCount(0);
	await expect(row(page, 'Andrea Meier')).toBeVisible();
	expect((await photoSent).ok()).toBe(true);

	// Open takes us to her: linked to the face, and wearing it.
	await openAdded(page);
	await expect(page.getByText('In Immich · 420 photos')).toBeVisible();
	await expect(
		page.getByTestId('avatar-uploader').getByRole('button', { name: 'Change photo' }).locator('img')
	).toHaveAttribute('src', /\/media\//);
});

test('a person already linked to another face is asked about, and Link this one instead replaces the link', async ({
	page
}) => {
	await addPerson(page, 'Thomas', 'Zimmerlink');
	madeHere.push(new URL(page.url()).pathname);
	await linkFace(page, 'Thomas Zimmerlink', 'Timo');
	await expect(page.getByText(/^In Immich/)).toBeVisible();

	await openNewcomers(page);
	const thomas = row(page, 'Thomas W.');
	await thomas.getByRole('button', { name: 'Assign Thomas W.' }).click();

	// The comparison warns that this namesake has a face already, and the other one does not.
	const linked = thomas.getByTestId('immich-similar').filter({ hasText: 'Thomas Zimmerlink' });
	await expect(linked).toContainText('Linked to “Timo” in Immich already');
	await expect(
		thomas.getByTestId('immich-similar').filter({ hasText: 'Thomas Widmer' })
	).not.toContainText('in Immich already');

	// Asked first; Cancel keeps the link as it was.
	const question = 'Thomas Zimmerlink is linked to another face. Link this one instead?';
	const thisIsThem = linked.getByRole('button', {
		name: 'Thomas W. is Thomas Zimmerlink'
	});
	await thisIsThem.click();
	await expect(linked.getByText(question)).toBeVisible();
	await linked.getByRole('button', { name: 'Cancel' }).click();
	await expect(linked.getByText(question)).toHaveCount(0);
	await expect(thisIsThem).toBeVisible();

	await thisIsThem.click();
	await linked.getByRole('button', { name: 'Link this one instead' }).click();
	await expect(toast(page)).toContainText('Thomas W. linked to Thomas Zimmerlink');
	await expect(row(page, 'Thomas W.')).toHaveCount(0);

	// Her page now says she is Thomas W., and not Timo.
	await page.goto(madeHere[madeHere.length - 1]);
	await expect(page.getByText('In Immich · 12 photos')).toBeVisible();
});

test('a first name alone goes straight to the form and asks for something to know them by; Find person links someone already in Stella', async ({
	page
}) => {
	await addPerson(page, 'Berta', 'Findpius');
	madeHere.push(new URL(page.url()).pathname);

	await openNewcomers(page);
	const pius = row(page, 'Pius');
	await pius.getByRole('button', { name: 'Assign Pius' }).click();

	// No namesake in Stella, so no comparison: the form is what opens.
	await expect(pius.getByLabel('First name')).toHaveValue('Pius');
	await expect(pius.getByTestId('immich-similar')).toHaveCount(0);
	const knowThemBy = pius.getByTestId('know-them-by');
	await expect(knowThemBy).toBeVisible();
	await expect(knowThemBy.getByLabel('Description')).toHaveAttribute('required', '');
	// With a last name the person is told apart already, and nothing more is asked.
	await pius.getByLabel('Last name').fill('Muster');
	await expect(knowThemBy).toHaveCount(0);
	await pius.getByLabel('Last name').fill('');
	await expect(knowThemBy).toBeVisible();

	// Already in Stella: pick her, and the face is hers.
	await pius.getByRole('button', { name: 'Already in Stella? Find person' }).click();
	await pius.getByPlaceholder('Search people in Stella').fill('Findpius');
	await page.getByRole('option', { name: /Berta Findpius/ }).click();
	await pius.getByRole('button', { name: 'Link', exact: true }).click();

	await expect(toast(page)).toContainText('Pius linked to Berta Findpius');
	await expect(row(page, 'Pius')).toHaveCount(0);
	await page.goto(madeHere[madeHere.length - 1]);
	await expect(page.getByText('In Immich · 5 photos')).toBeVisible();
});

test('Ignore is held for the undo window, then listed under Ignored, where Propose again takes it back', async ({
	page
}) => {
	const andrea = () => row(page, 'Andrea Meier');
	const ignoreAndrea = () => andrea().getByRole('button', { name: 'Ignore Andrea Meier' });
	const ignored = page.getByTestId('immich-newcomers-ignored');
	await openNewcomers(page);

	// Ignored, the row goes at once; Undo brings it back before anything was sent.
	await ignoreAndrea().click();
	await expect(undoToast(page)).toContainText('Andrea Meier ignored');
	await expect(andrea()).toHaveCount(0);
	await undoToast(page).getByRole('button', { name: 'Undo' }).click();
	await expect(undoToast(page)).toHaveCount(0);
	await expect(andrea()).toBeVisible();
	await page.reload();
	await listShown(page);
	await tab(page, /^New from Immich/).click();
	await expect(andrea()).toBeVisible();
	await expect(ignored).toHaveCount(0);

	// Ignored again and the page left through its own link: the ignore is sent on the way out.
	await ignoreAndrea().click();
	await expect(undoToast(page)).toContainText('Andrea Meier ignored');
	await openNewcomers(page);
	await expect(andrea()).toHaveCount(0);
	await expect(ignored.getByText('Ignored (1)')).toBeVisible();

	// Who said no, and when.
	await ignored.getByText('Ignored (1)').click();
	await expect(ignored).toContainText('Andrea Meier');
	await expect(ignored).toContainText(/Ignored by .+ on /);
	await ignored.getByRole('button', { name: 'Propose again: Andrea Meier' }).click();
	await expect(undoToast(page)).toContainText('Proposed again');
	await expect(ignored).toHaveCount(0);

	// Sent on the way out as well: the next visit proposes her again, and nothing is ignored.
	await openNewcomers(page);
	await expect(andrea()).toBeVisible();
	await expect(ignored).toHaveCount(0);
});

test('without the tick the person is added without the face as their photo', async ({ page }) => {
	const requests: string[] = [];
	page.on('request', (request) => requests.push(request.url()));

	await openNewcomers(page);
	const andrea = row(page, 'Andrea Meier');
	await andrea.getByRole('button', { name: 'Assign Andrea Meier' }).click();
	await expect(andrea.getByLabel('First name')).toHaveValue('Andrea');
	await expect(andrea.getByLabel('Last name')).toHaveValue('Meier');
	// A last name is told apart enough: nothing more is asked of the form.
	await expect(andrea.getByTestId('know-them-by')).toHaveCount(0);
	await andrea.getByRole('checkbox', { name: 'Use the face from Immich as photo' }).uncheck();
	await andrea.getByRole('button', { name: 'Add and link' }).click();

	await expect(toast(page)).toContainText('Andrea Meier added');
	await addedPerson(page);
	await expect(row(page, 'Andrea Meier')).toHaveCount(0);
	await openAdded(page);

	// Linked to the face, but wearing nobody's picture — and no photo was ever sent.
	await expect(page.getByText('In Immich · 77 photos')).toBeVisible();
	await expect(
		page.getByTestId('avatar-uploader').getByRole('button', { name: 'Add a photo' })
	).toBeVisible();
	expect(requests.filter((url) => url.includes('useImmichPhoto'))).toEqual([]);
});

test.describe('in German', () => {
	// The language is kept in the profile, so it would reach every spec after this one.
	test.afterEach(async ({ page }) => {
		await page.goto('/settings');
		await page.getByRole('button', { name: 'English' }).click();
		await expect(page.getByRole('heading', { name: /^Settings$/ })).toBeVisible();
	});

	test('the tabs and the rows speak German', async ({ page }) => {
		await page.goto('/settings');
		await page.getByRole('button', { name: 'Deutsch' }).click();
		await expect(page.getByRole('heading', { name: /^Einstellungen$/ })).toBeVisible();

		await page.goto('/settings/immich');
		await expect(page.getByRole('heading', { name: 'Deine Leute finden', level: 1 })).toBeVisible();
		await expect(tab(page, /^Abgleich · \d+$/)).toBeVisible();
		await expect(page.getByRole('button', { name: 'Suche' })).toBeEnabled();
		await tab(page, /^Neu aus Immich · \d+$/).click();

		const grosi = row(page, 'Grosi Ursula');
		await expect(grosi).toBeVisible();
		await expect(grosi.getByRole('button', { name: 'Grosi Ursula zuordnen' })).toHaveText(
			'Zuordnen…'
		);
		await expect(grosi.getByRole('button', { name: 'Grosi Ursula ignorieren' })).toBeVisible();
		await grosi.getByRole('button', { name: 'Grosi Ursula zuordnen' }).click();
		await expect(grosi.getByText(/ähnlichem Namen/)).toBeVisible();
		await expect(grosi.getByRole('button', { name: 'Nein, neue Person anlegen' })).toBeVisible();
	});
});

test('Left and Right step between the tabs', async ({ page }) => {
	await openFromSettings(page);
	const matching = tab(page, /^Matching/);
	const newcomers = tab(page, /^New from Immich/);
	const panel = page.getByTestId('immich-panel');
	await expect(matching).toHaveAttribute('aria-selected', 'true');

	await matching.focus();
	await page.keyboard.press('ArrowRight');
	await expect(newcomers).toHaveAttribute('aria-selected', 'true');
	await expect(newcomers).toBeFocused();
	await expect(panel).toHaveAttribute('data-tab', 'new');
	await expect(row(page, 'Grosi Ursula')).toBeVisible();

	await page.keyboard.press('ArrowLeft');
	await expect(matching).toHaveAttribute('aria-selected', 'true');
	await expect(matching).toBeFocused();
	await expect(panel).toHaveAttribute('data-tab', 'matching');
	await expect(rows(page)).toHaveCount(0);
});
