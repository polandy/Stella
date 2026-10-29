import { expect, test, type Browser, type Page } from '@playwright/test';
import { addPerson, appReady, fillDate, openPerson, signIn } from './app';
import { DEMO_ADMIN_PASSWORD, DEMO_MEMBER_EMAIL } from '../src/lib/server/db/demo-seed';

/*
 * Tags on moments (docs/02 §2.20.2): written as `#word` with the `#` list, drawn as chips, a
 * person's journal and Home's stream filtered by several through the address — a moment must
 * carry them all — a page per tag and the list of all tags, and full search finding the moments
 * carrying one (§2.9). Written after the maintainer tried it in the running app (docs/08 §8.4.1).
 *
 * The suite shares one demo database, so the person and the tags are invented and appear in
 * no seed and no other spec: the counts asserted here are exact. Each moment gets its own day,
 * because a second moment on the same day joins the first (one entry per person, author, day).
 */

test.describe.configure({ mode: 'serial' });

const PERSON = 'Livio Wyttenbach';
const SWIM = 'Aareschwumm';
const RIDE = 'Velotour';
/** Words that are in one moment each, to tell which is on screen. */
const SWIM_ONLY = 'Marzili';
const BOTH = 'Gurten';
/** A tag only on the admin's private moment. */
const SECRET = 'Sternenhimmel';
const SECRET_TEXT = 'Sternschnuppen gezählt';

async function openJournal(page: Page): Promise<void> {
	await openPerson(page, new RegExp(PERSON));
	await page.getByRole('link', { name: 'Open journal' }).click();
	await appReady(page);
}

/** Opens the composer on the journal showing, on the given day, and returns its field. */
async function compose(page: Page, day: string) {
	await page.getByRole('button', { name: 'Write a moment' }).click();
	const form = page.locator('form[action="?/save"]');
	await fillDate(form, 'Day', day);
	return form.getByRole('textbox', { name: 'Moment', exact: true });
}

async function save(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Save moment' }).click();
	// The journal says nothing on a save; the composer closing is the sign it went through.
	await expect(page.locator('form[action="?/save"]')).toBeHidden();
}

const filter = (page: Page) => page.getByRole('navigation', { name: 'Filter by tag' });
/** Home's desktop filter rows; the phone sheet holds a hidden copy of the same links. */
const homeFilter = (page: Page) => page.getByTestId('stream-filter');
const homeTags = (page: Page) => homeFilter(page).getByTestId('stream-filter-tags');
const tagLine = (page: Page) => page.getByTestId('stream-tag-line');
const streamMoments = (page: Page) => page.locator('article');

/** A second browser signed in as the household's other member, Nina — no admin. */
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

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('writes a new tag from the # list, and offers it again the next time', async ({ page }) => {
	await addPerson(page, 'Livio', 'Wyttenbach');
	await page.getByRole('link', { name: 'Open journal' }).click();
	await appReady(page);

	const first = await compose(page, '2025-08-02');
	await first.fill(`Im ${SWIM_ONLY} gebadet `);
	await first.pressSequentially(`#${SWIM}`);
	const picker = page.getByTestId('tag-picker');
	// Nobody has written it yet: the list offers the typed word as a new tag.
	await expect(picker.getByRole('option', { name: new RegExp(`#${SWIM}.*new tag`) })).toBeVisible();
	await first.press('Space');
	await expect(picker).toBeHidden();
	await save(page);
	await expect(page.locator('a.hashtag', { hasText: `#${SWIM}` })).toBeVisible();

	const second = await compose(page, '2025-08-09');
	await second.fill(`Auf den ${BOTH} #${RIDE} und danach `);
	// Typed in another case, the existing tag is found and keeps its first spelling.
	await second.pressSequentially('#aare');
	await picker.getByRole('option', { name: new RegExp(`#${SWIM}\\s*1`) }).click();
	await expect(second).toHaveValue(`Auf den ${BOTH} #${RIDE} und danach #${SWIM} `);
	await save(page);

	await expect(filter(page).getByRole('link', { name: new RegExp(`#${SWIM}\\s*2`) })).toBeVisible();
	await expect(filter(page).getByRole('link', { name: new RegExp(`#${RIDE}\\s*1`) })).toBeVisible();
});

test('filters the journal by a tag in the address, and Back undoes it', async ({ page }) => {
	await openJournal(page);
	await expect(page.getByText(SWIM_ONLY)).toBeVisible();

	await filter(page)
		.getByRole('link', { name: new RegExp(`#${RIDE}`) })
		.click();
	await expect(page).toHaveURL(/\?tag=velotour$/);
	await expect(filter(page)).toContainText(`1 moment with #${RIDE}`);
	await expect(page.getByText(BOTH)).toBeVisible();
	await expect(page.getByText(SWIM_ONLY)).toBeHidden();

	await page.goBack();
	await expect(page).not.toHaveURL(/tag=/);
	await expect(page.getByText(SWIM_ONLY)).toBeVisible();

	// A chip in a moment's text filters by its tag too.
	await page
		.locator('a.hashtag', { hasText: `#${SWIM}` })
		.first()
		.click();
	await expect(page).toHaveURL(/\?tag=aareschwumm$/);
	await expect(filter(page)).toContainText(`2 moments with #${SWIM}`);

	await filter(page).getByRole('link', { name: 'Show all' }).click();
	await expect(page).not.toHaveURL(/tag=/);
	await expect(filter(page).getByText(/moments? with/)).toHaveCount(0);
});

test('finds the moments carrying one #tag in search, and the tag as a plain word', async ({
	page
}) => {
	await page.goto(`/search?q=${encodeURIComponent(`#${RIDE.toLowerCase()}`)}`);
	// The moment rows, not the head row that leads to the tag's page.
	const moments = page
		.locator('section', { has: page.getByRole('heading', { name: 'Moments' }) })
		.locator('a:not([data-testid="search-tag-page"])');
	await expect(moments).toHaveCount(1);
	await expect(moments).toContainText(PERSON);

	await moments.click();
	await expect(page).toHaveURL(/\/journal\?tag=velotour$/);
	await expect(filter(page)).toContainText(`1 moment with #${RIDE}`);

	await page.goto(`/search?q=${SWIM}`);
	await expect(moments).toHaveCount(2);

	await page.goto(`/search?q=${encodeURIComponent('#Nirgendwotag')}`);
	await expect(page.getByText('No moment carries #Nirgendwotag.')).toBeVisible();
});

test('narrows a journal to the moments carrying every chosen tag, a chip at a time', async ({
	page
}) => {
	await openJournal(page);

	await filter(page)
		.getByRole('link', { name: new RegExp(`#${SWIM}`) })
		.click();
	await expect(page).toHaveURL(/\?tag=aareschwumm$/);
	await expect(page.getByText(SWIM_ONLY)).toBeVisible();

	// A second tag narrows again, to the one moment carrying both.
	await filter(page)
		.getByRole('link', { name: new RegExp(`#${RIDE}`) })
		.click();
	await expect(page).toHaveURL(/\?tag=aareschwumm&tag=velotour$/);
	await expect(filter(page)).toContainText(`1 moment with #${SWIM} + #${RIDE}`);
	await expect(page.getByText(BOTH)).toBeVisible();
	await expect(page.getByText(SWIM_ONLY)).toBeHidden();

	// A chosen chip taps off on its own; the other tag stays chosen.
	await filter(page)
		.getByRole('link', { name: new RegExp(`#${SWIM}`) })
		.click();
	await expect(page).toHaveURL(/\?tag=velotour$/);
	await expect(filter(page)).toContainText(`1 moment with #${RIDE}`);
});

test("narrows Home's stream to moments carrying every chosen tag", async ({ page }) => {
	// Both tags in the address: each joins the row even past the eight most used.
	await page.goto('/?tag=aareschwumm&tag=velotour');
	await appReady(page);
	await expect(homeFilter(page).getByRole('link', { name: 'Moments' })).toHaveAttribute(
		'aria-current',
		'true'
	);
	await expect(tagLine(page)).toContainText(`1 moment with #${SWIM} + #${RIDE}`);
	await expect(streamMoments(page)).toHaveCount(1);
	await expect(streamMoments(page)).toContainText(BOTH);

	// Tapping a chosen tag takes only that one off.
	await homeTags(page)
		.getByRole('link', { name: new RegExp(`#${RIDE}`) })
		.click();
	await expect(page).toHaveURL(/\/\?kind=moment&tag=aareschwumm$/);
	await expect(tagLine(page)).toContainText(`2 moments with #${SWIM}`);
	await expect(streamMoments(page)).toHaveCount(2);

	// Another kind carries no tags, so choosing it takes them off.
	await homeFilter(page).getByRole('link', { name: 'Calls & visits' }).click();
	await expect(page).toHaveURL(/\/\?kind=interaction$/);
	await expect(tagLine(page)).toHaveCount(0);

	// *Show all* takes the tags off and keeps the moments.
	await page.goto('/?tag=aareschwumm&tag=velotour');
	await tagLine(page).getByRole('link', { name: 'Show all' }).click();
	await expect(page).toHaveURL(/\/\?kind=moment$/);
	await expect(tagLine(page)).toHaveCount(0);
});

test("opens a tag's page from a chip on Home, and a person's journal from there", async ({
	page
}) => {
	await page.goto('/?tag=velotour');
	await appReady(page);
	await streamMoments(page)
		.locator('a.hashtag', { hasText: `#${RIDE}` })
		.click();
	await expect(page).toHaveURL(/\/tags\/velotour$/);
	await expect(page.getByTestId('tag-summary')).toHaveText('1 moment about 1 person');
	await expect(page.getByTestId('tag-stream')).toContainText(BOTH);

	await page.getByTestId('tag-stream').getByRole('link', { name: PERSON }).click();
	await expect(page).toHaveURL(/\/journal\?tag=velotour$/);
	await expect(filter(page)).toContainText(`1 moment with #${RIDE}`);
});

test("leads from a #tag search to the tag's page", async ({ page }) => {
	await page.goto(`/search?q=${encodeURIComponent(`#${SWIM}`)}`);
	await page.getByTestId('search-tag-page').click();
	await expect(page).toHaveURL(/\/tags\/aareschwumm$/);
	await expect(page.getByTestId('tag-summary')).toHaveText('2 moments about 1 person');
});

test('keeps a tag on private moments to their author, locked and veiled', async ({
	page,
	browser
}) => {
	await openJournal(page);
	const field = await compose(page, '2025-08-16');
	await field.fill(`${SECRET_TEXT} #${SECRET} `);
	await page.getByRole('radio', { name: /Private/ }).check();
	await save(page);

	// The list of all tags marks it with the lock; a shared tag carries none.
	await page.goto('/tags');
	const list = page.getByTestId('tag-list');
	await expect(list.getByRole('link', { name: new RegExp(`#${SECRET}`) })).toHaveAttribute(
		'title',
		'Only you see this tag: it is only on your private moments'
	);
	await expect(list.getByRole('link', { name: new RegExp(`#${SWIM}`) })).not.toHaveAttribute(
		'title'
	);

	// Its page lists the moment, veiled on its author's screen until asked for (§2.10.1).
	await list.getByRole('link', { name: new RegExp(`#${SECRET}`) }).click();
	await expect(page).toHaveURL(/\/tags\/sternenhimmel$/);
	const stream = page.getByTestId('tag-stream');
	await expect(stream.getByRole('button', { name: 'Private moment, hidden. Show' })).toBeVisible();
	await expect(stream).not.toContainText(SECRET_TEXT);

	// Another member learns nothing of it: no chip in the list, the page as for no tag at all.
	const nina = await signInAsNina(browser);
	await nina.goto('/tags');
	await expect(nina.getByTestId('tag-list')).not.toContainText(`#${SECRET}`);
	await expect(nina.getByTestId('tag-list')).toContainText(`#${SWIM}`);
	await nina.goto('/tags/sternenhimmel');
	await expect(nina.getByText(/No moments with #sternenhimmel/i)).toBeVisible();
	await expect(nina.getByText(SECRET_TEXT)).toHaveCount(0);
	await nina.context().close();
});
