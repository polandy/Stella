import { expect, test, type Locator, type Page } from '@playwright/test';
import { appReady, editPeople, fromPeopleMenu, signIn, unfoldPeople } from './app';
import { LINK, personIdOf, seedHousehold } from './seed';

/*
 * The person page's compact People card and its jump bar (docs/05 §5.5, docs/02 §2.4). Written
 * after the owner tried them in the running app (docs/08 §8.4.1).
 *
 * Read-only against the demo household: forms are opened and cancelled, never sent, so the
 * seed's links stand as written. Markus Brunner has a wife, two parents, three children and a
 * brother (Family), two friends and a neighbour (Friends), and worked-out in-laws, nephews and
 * nieces; no other spec writes a link onto him. The demo has no work or other tie on one
 * person, so the case about all four groups seeds a household of its own.
 */

const MARKUS = 'demo-c-markus';

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

/** Opens a demo person's page and waits until its script controls answer. */
async function openDemoPerson(page: Page, id: string, name: string): Promise<void> {
	await page.goto(`/contacts/${id}`);
	await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
	await expect(page.locator('#section-relationships')).toBeVisible();
	await appReady(page);
}

const card = (page: Page) => page.locator('#section-relationships');
const list = (page: Page) => page.getByTestId('relationship-list');
const derived = (page: Page) => page.getByTestId('derived-kin');
/** A person's tile: one link, named by the person, described by what they are to this one. */
const tile = (scope: Locator, name: string) => scope.getByRole('link', { name, exact: true });

async function boxOf(locator: Locator) {
	const box = await locator.boundingBox();
	if (!box) throw new Error(`${locator} has no layout`);
	return box;
}

test.describe('the compact list', () => {
	test('names what each person is to this one and folds the rest behind one button', async ({
		page
	}) => {
		await openDemoPerson(page, MARKUS, 'Markus Brunner');

		// Family first, closest tie first, each tile saying the role in the far end's gender.
		await expect(list(page).getByRole('heading', { name: /^Family · \d+$/ })).toBeVisible();
		await expect(tile(list(page), 'Sandra Brunner-Keller')).toHaveAccessibleDescription(/^Wife\b/);
		await expect(tile(list(page), 'Lena Brunner')).toHaveAccessibleDescription(/^Daughter\b/);
		await expect(tile(list(page), 'Noah Brunner')).toHaveAccessibleDescription(/^Son\b/);
		await expect(tile(list(page), 'Hans Brunner')).toHaveAccessibleDescription(/^Father\b/);

		// Folded: six entered people, and the worked-out relatives all behind the fold.
		await expect(list(page).getByRole('link')).toHaveCount(6);
		await expect(derived(page)).toHaveCount(0);
		// The friends and the neighbour are past the fold, and the line under the tiles says so,
		// the worked-out block last; Family, partly shown, is counted by its own heading.
		await expect(list(page).getByRole('heading', { name: /^Friends · / })).toHaveCount(0);
		const foldedAway = card(page).getByRole('list', { name: 'Folded away' });
		await expect(foldedAway.getByRole('button')).toHaveText([
			/^\s*Friends · 3$/,
			/^\s*Also related · \d+$/
		]);

		const more = card(page).getByRole('button', { name: /^Show \d+ more$/ });
		const folded = Number((await more.textContent())?.match(/\d+/)?.[0]);
		await unfoldPeople(page);

		// Everybody now, in their groups, and the button had counted exactly the ones it hid.
		await expect(list(page).getByRole('heading', { name: /^Friends · 3$/ })).toBeVisible();
		await expect(tile(list(page), 'Thomas Widmer')).toHaveAccessibleDescription(/^Friend\b/);
		await expect(tile(list(page), 'Kurt Lehmann')).toHaveAccessibleDescription(/^Neighbor\b/);
		await expect(tile(list(page), 'Daniel Brunner')).toHaveAccessibleDescription(/^Brother\b/);
		// The worked-out relatives, the quieter group under its own heading, each saying whom the
		// tie runs through.
		await expect(derived(page).getByRole('heading', { name: /^Also related/ })).toBeVisible();
		await expect(derived(page).getByRole('link').first()).toHaveAccessibleDescription(/ · via /);
		await expect(foldedAway).toHaveCount(0);
		const entered = await list(page).getByRole('link').count();
		const workedOut = await derived(page).getByRole('link').count();
		expect(entered - 6 + workedOut).toBe(folded);

		// *Show fewer* folds it again.
		await card(page).getByRole('button', { name: 'Show fewer' }).click();
		await expect(card(page).getByRole('button', { name: `Show ${folded} more` })).toBeVisible();
		await expect(list(page).getByRole('link')).toHaveCount(6);
		await expect(derived(page)).toHaveCount(0);
	});

	test('groups ties as Family, Friends, Work and Other', async ({ page }) => {
		const GRETA = 'Greta Gruppenfeld';
		await seedHousehold(
			page,
			[GRETA, 'Hugo Gruppenfeld', 'Ida Kranzfeld', 'Jon Pultfeld', 'Kai Uferfeld'],
			// Entered out of order: the card orders the groups, not the entry.
			[
				{ from: GRETA, to: 'Kai Uferfeld', type: LINK.connectedTo },
				{ from: GRETA, to: 'Jon Pultfeld', type: LINK.colleagueOf },
				{ from: GRETA, to: 'Ida Kranzfeld', type: LINK.friendOf },
				{ from: GRETA, to: 'Hugo Gruppenfeld', type: LINK.siblingOf }
			],
			{ 'Hugo Gruppenfeld': 'male' }
		);
		await openDemoPerson(page, personIdOf(GRETA), GRETA);

		// Four people fold nothing away, so every group is there.
		await expect(list(page).getByRole('heading')).toHaveText([
			'Family · 1',
			'Friends · 1',
			'Work · 1',
			'Other · 1'
		]);
		await expect(tile(list(page), 'Hugo Gruppenfeld')).toHaveAccessibleDescription(/^Brother\b/);
		await expect(tile(list(page), 'Jon Pultfeld')).toHaveAccessibleDescription(/^Colleague\b/);
	});
});

test('Edit puts the corrections on every row and Done takes them away', async ({ page }) => {
	await openDemoPerson(page, MARKUS, 'Markus Brunner');
	const pencil = list(page).getByRole('button', { name: 'Edit the link to Lena Brunner' });
	const remove = list(page).getByRole('button', { name: 'Remove the link to Lena Brunner' });
	const toggle = page.getByTestId('relationships-edit');

	// A quiet card: the tile is there, its corrections are not.
	await expect(tile(list(page), 'Lena Brunner')).toBeVisible();
	await expect(toggle).toHaveText('Edit');
	await expect(pencil).toHaveCount(0);
	await expect(remove).toHaveCount(0);

	await editPeople(page);
	await expect(pencil).toBeVisible();
	await expect(remove).toBeVisible();
	// A worked-out relative can be made something entered.
	await expect(derived(page).getByRole('button', { name: 'Confirm' }).first()).toBeVisible();

	// The pencil opens the row's own form; Cancel closes it with nothing sent.
	await pencil.click();
	const form = list(page).locator('form[action="?/editRelationship"]');
	await expect(form.getByRole('button', { name: 'Save' })).toBeVisible();
	await form.getByRole('button', { name: 'Cancel' }).click();
	await expect(pencil).toHaveAttribute('aria-expanded', 'false');
	await expect(form).toHaveCount(0);

	await toggle.click();
	await expect(toggle).toHaveText('Edit');
	await expect(tile(list(page), 'Lena Brunner')).toBeVisible();
	await expect(pencil).toHaveCount(0);
	await expect(remove).toHaveCount(0);
	await expect(derived(page).getByRole('button', { name: 'Confirm' })).toHaveCount(0);
});

test('the header’s + opens the add form and turns into its Cancel', async ({ page }) => {
	await openDemoPerson(page, MARKUS, 'Markus Brunner');
	const header = card(page).locator('header').first();
	const add = header.getByRole('button', { name: 'Add relationship' });
	const form = card(page).locator('form[action="?/addRelationship"]');

	await add.click();
	await expect(form).toBeVisible();
	const cancel = header.getByRole('button', { name: 'Cancel' });
	await expect(cancel).toHaveAttribute('aria-expanded', 'true');

	await cancel.click();
	await expect(add).toHaveAttribute('aria-expanded', 'false');
	await expect(form).toHaveCount(0);
});

test('the ⋯ menu asks how two people are connected, reviews, and opens the graph', async ({
	page
}) => {
	await openDemoPerson(page, MARKUS, 'Markus Brunner');

	// The question is the next thing to answer, so the picker has the cursor.
	await fromPeopleMenu(page, 'How are we connected?');
	const picker = card(page).getByLabel('Markus Brunner and…');
	await expect(picker).toBeFocused();
	// …and its Cancel puts it away. The prompt is the box holding the picker and its buttons.
	const prompt = card(page).getByRole('button', { name: 'Trace it' }).locator('..');
	await prompt.getByRole('button', { name: 'Cancel' }).click();
	await expect(picker).toHaveCount(0);

	// The other two lead off the card (kin-review and graph-jump follow them there).
	await card(page).getByRole('button', { name: 'More for these relationships' }).click();
	await expect(page.getByRole('menuitem', { name: 'Check relationships' })).toHaveAttribute(
		'href',
		`/contacts/${MARKUS}?review#relationships`
	);
	await expect(page.getByRole('menuitem', { name: 'Open in the graph' })).toHaveAttribute(
		'href',
		`/graph?center=${MARKUS}`
	);
});

test.describe('the jump bar', () => {
	const bar = (page: Page) => page.getByRole('navigation', { name: 'Parts of this page' });
	// A short window, so the demo's few notes and moments still leave room below a card to
	// scroll it to the top: at the foot of the page the bar marks the last card in view instead.
	test.use({ viewport: { width: 1280, height: 480 } });

	test('lands a jump with the card’s title in view below the bar', async ({ page }) => {
		await openDemoPerson(page, MARKUS, 'Markus Brunner');
		await expect(bar(page).getByRole('link')).toHaveText([
			/^People/,
			/^Photos/,
			/^Activity/,
			/^Notes/
		]);

		await bar(page)
			.getByRole('link', { name: /^Notes/ })
			.click();
		await expect(page).toHaveURL(/#section-notes$/);
		const title = page.locator('#section-notes h2').first();
		await expect(title).toBeInViewport();
		// The bar sticks over the page, so the title must have stopped under it, not behind it.
		await expect
			.poll(
				async () =>
					(await boxOf(title)).y - ((await boxOf(bar(page))).y + (await boxOf(bar(page))).height)
			)
			.toBeGreaterThanOrEqual(0);
	});

	test('marks the card being read as the page scrolls', async ({ page }) => {
		await openDemoPerson(page, MARKUS, 'Markus Brunner');
		const current = bar(page).locator('[aria-current="location"]');

		await page.locator('#section-photos').evaluate((el) => el.scrollIntoView({ block: 'start' }));
		await expect(current).toHaveText(/^Photos/);

		await page
			.locator('#section-relationships')
			.evaluate((el) => el.scrollIntoView({ block: 'start' }));
		await expect(current).toHaveText(/^People/);
	});
});
