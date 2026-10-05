import { expect, test, type Locator, type Page } from '@playwright/test';
import { appReady, profileRow, recordAction, signIn } from './app';

/*
 * The identity card at the top of a person's page and its ⋯ menu (docs/05 §5.5). Written after
 * the owner tried the redesign in the running app (docs/08 §8.4.1).
 *
 * Read-only against the demo household: the confirm steps are opened and closed, never
 * pressed (archive.spec.ts and delete.spec.ts own that), and the rows are revealed, not
 * filled. Markus Brunner's record holds an address and a job; his daughter Lena's holds
 * neither — the seed's, and no other spec writes either onto them.
 */

const LENA = 'demo-c-lena';
const MARKUS = 'demo-c-markus';

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

/** Opens a demo person's page and waits until its controls answer. */
async function openDemoPerson(page: Page, id: string, name: string): Promise<void> {
	await page.goto(`/contacts/${id}`);
	await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
	await expect(page.locator('#section-relationships')).toBeVisible();
	await appReady(page);
}

async function boxOf(locator: Locator) {
	const box = await locator.boundingBox();
	if (!box) throw new Error(`${locator} has no layout`);
	return box;
}

/** The order the card lists its editable rows in, by the name each carries. */
const listedRows = (page: Page) =>
	page
		.getByTestId('identity-card')
		.locator('[data-identity-row]')
		.evaluateAll((rows) => rows.map((row) => row.getAttribute('data-identity-row')));

const facts = (page: Page) => page.getByTestId('identity-facts');
const confirmStep = (page: Page) => page.getByTestId('record-confirm');

test.describe('the facts', () => {
	test('states the address and the job a record holds', async ({ page }) => {
		await openDemoPerson(page, MARKUS, 'Markus Brunner');

		await expect(facts(page).locator('[data-fact="address"]')).toContainText('Spitalackerstrasse 22, 3013 Bern');
		await expect(facts(page).locator('[data-fact="job"]')).toContainText('Bauingenieur at Rytz + Partner AG');
	});

	test('leaves out the facts a record does not hold', async ({ page }) => {
		await openDemoPerson(page, LENA, 'Lena Brunner');

		// The facts she has are there, so the grid has rendered before its gaps are read.
		await expect(facts(page).locator('[data-fact="birthday"]')).toBeVisible();
		await expect(facts(page).locator('[data-fact="last-contact"]')).toBeVisible();
		await expect(facts(page).locator('[data-fact="address"]')).toHaveCount(0);
		await expect(facts(page).locator('[data-fact="job"]')).toHaveCount(0);
	});
});

test('the quiet button reveals the empty rows in their places and hands them the cursor', async ({ page }) => {
	await openDemoPerson(page, MARKUS, 'Markus Brunner');
	const card = page.getByTestId('identity-card');

	// He has contact details and dates but no tags: the rows he holds are listed, the tags wait.
	await expect(card.locator('[data-identity-row="contact"]')).toBeVisible();
	await expect(card.locator('[data-identity-row="tags"]')).toHaveCount(0);
	const addMore = card.getByTestId('identity-add-more');
	await expect(addMore).toHaveText('Add phone, email, tags …');

	await addMore.click();

	// Tags land between contact and dates, where the card's order puts them, not at the end.
	const tags = card.locator('[data-identity-row="tags"]');
	await expect(tags).toBeVisible();
	const order = await listedRows(page);
	expect(order.indexOf('tags')).toBe(order.indexOf('contact') + 1);
	expect(order.indexOf('dates')).toBe(order.indexOf('tags') + 1);
	// The button is spent, and the cursor followed it to the first row that appeared.
	await expect(addMore).toHaveCount(0);
	await expect(tags.getByRole('button', { name: /^Tags/ })).toBeFocused();
});

test.describe('the ⋯ menu', () => {
	test('Log contact opens the story card’s own form', async ({ page }) => {
		await openDemoPerson(page, LENA, 'Lena Brunner');
		const story = page.locator('#section-story');
		await expect(story.getByRole('button', { name: 'Log contact' })).toBeVisible();
		await expect(story.getByLabel('Kind')).toHaveCount(0);

		await recordAction(page, 'Log contact');

		await expect(story.getByLabel('Kind')).toBeVisible();
		await expect(story.getByRole('button', { name: 'Log interaction' })).toBeVisible();
	});

	test('How are we connected? opens the picker with the cursor in it', async ({ page }) => {
		await openDemoPerson(page, LENA, 'Lena Brunner');

		await recordAction(page, 'How are we connected?');

		await expect(page.locator('#section-relationships').getByLabel('Lena Brunner and…')).toBeFocused();
	});

	test('Archive says what it does before it does it, and Cancel archives nothing', async ({ page }) => {
		await openDemoPerson(page, LENA, 'Lena Brunner');

		await recordAction(page, 'Archive');

		const step = confirmStep(page);
		await expect(step).toContainText('Takes them out of the directory, the search and Home’s reminders.');
		await expect(step.getByRole('button', { name: 'Archive this person' })).toBeFocused();

		await step.getByRole('button', { name: 'Cancel' }).click();
		await expect(page.getByRole('button', { name: 'More actions' })).toBeVisible();
		await expect(step).toHaveCount(0);
	});

	test('Delete puts the cursor on Keep them, and Escape closes the step', async ({ page }) => {
		await openDemoPerson(page, LENA, 'Lena Brunner');

		await recordAction(page, 'Delete for good');

		const step = confirmStep(page);
		await expect(step.getByRole('button', { name: 'Delete Lena Brunner' })).toBeVisible();
		await expect(step.getByRole('button', { name: 'Keep them' })).toBeFocused();

		await page.keyboard.press('Escape');
		await expect(page.getByRole('heading', { name: 'Lena Brunner', exact: true })).toBeVisible();
		await expect(step).toHaveCount(0);
	});

	test('an open confirm step stays with its person when a link leads to someone else', async ({ page }) => {
		await openDemoPerson(page, LENA, 'Lena Brunner');
		await recordAction(page, 'Archive');
		await expect(confirmStep(page)).toBeVisible();

		// Her father, from her relationships: the page keeps its identity card across the step.
		await page
			.getByTestId('relationship-list')
			.getByRole('link', { name: /^Markus Brunner\b/ })
			.click();

		await expect(page.getByRole('heading', { name: 'Markus Brunner', exact: true })).toBeVisible();
		await expect(facts(page).locator('[data-fact="address"]')).toContainText('Spitalackerstrasse');
		await expect(confirmStep(page)).toHaveCount(0);
	});
});

test('the story card’s own Log contact is a quiet button, and the only one on the page', async ({ page }) => {
	await openDemoPerson(page, LENA, 'Lena Brunner');

	const logContact = page.locator('#section-story').getByRole('button', { name: 'Log contact' });
	await expect(logContact).toHaveClass(/\bghost\b/);
	// The identity card offers it in its ⋯ menu only, so the story card's is the one button.
	await expect(page.getByRole('button', { name: 'Log contact' })).toHaveCount(1);
});

/*
 * What the owner saw after the first round: the rows' "+" icons followed each label's length,
 * and the add-a-date form ran ragged on its right. Geometry, so it is measured on the rendered
 * page rather than read off the classes.
 *
 * The icons are read in German, where the owner saw them: "Hinzufügen" over "Beitreten" is a
 * gap of several characters, where "Add" over "Join" is a pixel. The language is stored in the
 * profile, which every spec shares, so each case hands the account back in English.
 */
test.describe('in German, the rows’ add icons', () => {
	test.beforeEach(async ({ page }) => {
		await chooseLanguage(page, 'Deutsch', /^Einstellungen$/);
	});
	test.afterEach(async ({ page }) => {
		await chooseLanguage(page, 'English', /^Settings$/);
	});

	test('stand one above the other in each column of rows on a wide screen', async ({ page }) => {
		const columns = await addIconsByColumn(page);
		expect(columns).toHaveLength(2);
		for (const xs of columns) expectOneX(xs);
	});

	test.describe('on a narrow phone', () => {
		test.use({ viewport: { width: 360, height: 800 }, hasTouch: true });

		test('stand one above the other', async ({ page }) => {
			const columns = await addIconsByColumn(page);
			expect(columns).toHaveLength(1);
			expectOneX(columns[0]);
		});
	});
});

/** Picks a language in Settings and waits for the page to answer in it. */
async function chooseLanguage(page: Page, language: string, settled: RegExp): Promise<void> {
	await page.goto('/settings');
	await page.getByRole('button', { name: language }).click();
	await expect(page.getByRole('heading', { name: settled })).toBeVisible();
}

/**
 * Markus Brunner's rows, every one revealed — contact, tags and dates (*Hinzufügen*) and
 * circles (*Beitreten*) — as the x of each row's add icon, grouped by the column the row
 * stands in (its left edge names it).
 */
async function addIconsByColumn(page: Page): Promise<number[][]> {
	await page.goto(`/contacts/${MARKUS}`);
	await expect(page.getByRole('heading', { name: 'Markus Brunner', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Suche', exact: true })).toBeEnabled();
	const card = page.getByTestId('identity-card');
	await card.getByTestId('identity-add-more').click();
	await expect(card.getByRole('button', { name: 'Beitreten', exact: true })).toBeVisible();
	await expect(card.getByRole('button', { name: 'Hinzufügen', exact: true })).toHaveCount(3);

	const placed = await card
		.locator('section[data-row]:has([data-section-toggle])')
		.evaluateAll((rows) =>
			rows.map((row) => ({
				column: Math.round(row.getBoundingClientRect().x),
				icon: row.querySelector('[data-section-toggle] svg')!.getBoundingClientRect().x
			}))
		);
	const columns = new Map<number, number[]>();
	for (const row of placed) columns.set(row.column, [...(columns.get(row.column) ?? []), row.icon]);
	return [...columns.values()];
}

/** Two or more icons, all at one x. */
function expectOneX(xs: number[]): void {
	expect(xs.length).toBeGreaterThanOrEqual(2);
	expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(1);
}

test.describe('on a narrow phone', () => {
	test.use({ viewport: { width: 360, height: 800 }, hasTouch: true });

	test('the add-a-date form keeps one left and one right edge, and nothing runs off the screen', async ({
		page
	}) => {
		await openDemoPerson(page, LENA, 'Lena Brunner');
		const dates = await profileRow(page, 'Dates');
		await dates.getByRole('button', { name: 'Add', exact: true }).click();

		const kind = dates.getByLabel('Kind');
		const day = dates.getByRole('group', { name: 'Day' });
		const name = dates.getByLabel('Name (for custom)');
		await expect(name).toBeVisible();

		const [kindBox, nameBox] = [await boxOf(kind), await boxOf(name)];
		const dayControls = await Promise.all(
			['Month', 'Day', 'Year'].map((label) => boxOf(day.getByLabel(label, { exact: true })))
		);
		const dayLeft = Math.min(...dayControls.map((box) => box.x));
		const dayRight = Math.max(...dayControls.map((box) => box.x + box.width));

		for (const [left, right] of [
			[dayLeft, dayRight],
			[nameBox.x, nameBox.x + nameBox.width]
		]) {
			expect(Math.abs(left - kindBox.x)).toBeLessThan(1);
			expect(Math.abs(right - (kindBox.x + kindBox.width))).toBeLessThan(1);
		}

		// Inside the screen, not merely clipped by a card that hides what spills over.
		expect(kindBox.x + kindBox.width).toBeLessThanOrEqual(page.viewportSize()!.width);
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBe(0);
	});
});
