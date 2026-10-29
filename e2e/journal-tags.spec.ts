import { expect, test, type Page } from '@playwright/test';
import { addPerson, appReady, fillDate, openPerson, signIn } from './app';

/*
 * Tags on moments (docs/02 §2.20.2): written as `#word` with the `#` list, drawn as chips, a
 * person's journal filtered by one through the address, and full search finding the moments
 * carrying it (§2.9). Written after the maintainer tried it in the running app (docs/08 §8.4.1).
 *
 * The suite shares one demo database, so the person and both tags are invented and appear in
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
	const moments = page.locator('section', {
		has: page.getByRole('heading', { name: 'Moments' })
	});
	await expect(moments.getByRole('link')).toHaveCount(1);
	await expect(moments.getByRole('link')).toContainText(PERSON);

	await moments.getByRole('link').click();
	await expect(page).toHaveURL(/\/journal\?tag=velotour$/);
	await expect(filter(page)).toContainText(`1 moment with #${RIDE}`);

	await page.goto(`/search?q=${SWIM}`);
	await expect(moments.getByRole('link')).toHaveCount(2);

	await page.goto(`/search?q=${encodeURIComponent('#Nirgendwotag')}`);
	await expect(page.getByText('No moment carries #Nirgendwotag.')).toBeVisible();
});
