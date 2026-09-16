import { expect, test, type Page } from '@playwright/test';
import { addPerson, openPerson, pickPerson, signIn } from './app';

/*
 * The household-wide relationship review (docs/02 §2.4.1,
 * docs/concepts/relationship-suggestions.md §6.6). Written after the flow was verified in the
 * running app (docs/08 §8.4.1).
 *
 * The screen answers about *everyone*, so this file never asserts a total: the suite shares one
 * database, and other specs add people whose claims land in the same list. Each case filters
 * the list down to its own claim and asserts on that — which is also how a member reads it.
 *
 * The Ammanns are invented for this file, one family per case, because the answers are stored:
 * two cases working the same three people would have one answering what the other settled.
 */

const REVIEW = '/settings/relationships';

interface Family {
	parent: string;
	one: string;
	other: string;
}

const family = (parent: string, one: string, other: string): Family => ({
	parent: `${parent} Ammann`,
	one: `${one} Ammann`,
	other: `${other} Ammann`
});

/** The sentence the household screen should carry, once the links below are in place. */
const claimOf = (f: Family) => `${f.parent} is a parent of ${f.other}`;

const add = (page: Page, name: string) => addPerson(page, name.split(' ')[0]!, name.split(' ')[1]!);

/**
 * The sentence the rule gives for its claim: both people in full, read from the subject's side
 * — *Ronja Ammann is Silvan Ammann's sibling* — which is the claim's direction rather than the
 * one the links were entered in.
 */
const reasonOf = (f: Family) => `${f.other} is ${f.one}’s sibling.`;

/** Fills the *Add relationship* form on the open person and submits it. */
async function addLink(page: Page, type: string, person: string): Promise<void> {
	await page.getByRole('button', { name: 'Add relationship' }).click();
	const form = page.locator('form[action="?/addRelationship"]');
	await form.locator('select[name=typeChoice]').selectOption({ label: type });
	await pickPerson(form.getByLabel('Person'), person);
	await form.getByRole('button', { name: 'Add', exact: true }).click();
}

/**
 * A family whose claim nobody has answered, and whose profiles nobody opens again: `one` and
 * `other` are siblings, `parent` is `one`'s parent, so *parent is a parent of other* follows.
 * The write-time block that offered it is left behind unanswered on purpose — that is the
 * state a household is in when it has never been through its own graph.
 */
async function aFamilyNobodyHasAnsweredFor(page: Page, f: Family): Promise<void> {
	await add(page, f.one);
	await add(page, f.other);
	await add(page, f.parent);

	await openPerson(page, new RegExp(f.one));
	await addLink(page, 'Sibling of', f.other);
	await openPerson(page, new RegExp(f.parent));
	await addLink(page, 'Parent of', f.one);
}

/** Opens the household screen and runs the rules over everyone. */
async function checkEveryone(page: Page): Promise<void> {
	await page.goto(REVIEW);
	await page.getByRole('link', { name: 'Check all relationships' }).click();
	await expect(page).toHaveURL(/\/settings\/relationships\?review/);
}

/**
 * The declined drawer, open. `open` is set on the element by the browser rather than by Svelte,
 * so it survives a client-side navigation — and a blind click on the summary would *close* a
 * drawer that came back open. Asserting the state is what makes this step deterministic.
 */
async function openDeclined(page: Page) {
	const drawer = page.getByTestId('kin-declined');
	if ((await drawer.getAttribute('open')) === null) await drawer.locator('summary').click();
	await expect(drawer).toHaveAttribute('open', '');
	return drawer;
}

/** The one row this case is about, out of however many the household has. */
const rowFor = (page: Page, f: Family) =>
	page.getByTestId('kin-suggestion').filter({ hasText: claimOf(f) });

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('finds a claim from Settings that no member opened a profile for', async ({ page }) => {
	const f = family('Marlis', 'Silvan', 'Ronja');
	await aFamilyNobodyHasAnsweredFor(page, f);

	// Closed, the screen runs nothing: it offers the one control and says as much.
	await page.goto(REVIEW);
	await expect(page.getByRole('heading', { name: 'Check relationships' })).toBeVisible();
	await expect(page.getByText('Nothing checked yet')).toBeVisible();
	await expect(page.getByTestId('kin-suggestion')).toHaveCount(0);

	await page.getByRole('link', { name: 'Check all relationships' }).click();
	await expect(rowFor(page, f)).toContainText(claimOf(f));
	await expect(rowFor(page, f)).toContainText(reasonOf(f));

	// Filed under the person it is about — the child, whose parents were in question — and that
	// name links to their page.
	const card = page.locator('main section').filter({ hasText: claimOf(f) });
	await expect(card.getByRole('link', { name: new RegExp(f.other) })).toHaveAttribute('href', /\/contacts\//);
});

test('declining on the household screen holds the no, and offering it again brings it back', async ({ page }) => {
	const f = family('Gertrud', 'Timo', 'Nadja');
	await aFamilyNobodyHasAnsweredFor(page, f);
	await checkEveryone(page);

	await rowFor(page, f).getByRole('button', { name: 'Decline' }).click();
	await expect(rowFor(page, f)).toHaveCount(0);

	// In the drawer, with who said no and when — and still gone after the rules run again,
	// which is the whole point of writing the answer down.
	const declined = await openDeclined(page);
	const declinedRow = declined.getByRole('listitem').filter({ hasText: claimOf(f) });
	await expect(declinedRow).toContainText(/declined on .+ by Demo Admin/);

	await page.getByRole('link', { name: 'Check again' }).click();
	await expect(rowFor(page, f)).toHaveCount(0);

	await (await openDeclined(page))
		.getByRole('listitem')
		.filter({ hasText: claimOf(f) })
		.getByRole('button', { name: 'Offer again' })
		.click();
	await expect(rowFor(page, f)).toContainText(claimOf(f));
});

test('accepting on the household screen writes the link onto the person', async ({ page }) => {
	const f = family('Beatrix', 'Reto', 'Vroni');
	await aFamilyNobodyHasAnsweredFor(page, f);
	await checkEveryone(page);

	await rowFor(page, f).getByRole('button', { name: 'Accept' }).click();

	// Not a question any more, here or on the profile — and there, it is an entered link.
	await expect(rowFor(page, f)).toHaveCount(0);
	await openPerson(page, new RegExp(f.other));
	await expect(page.locator('#section-relationships ul').first()).toContainText(f.parent);
});

test('asks about a claim once, however many ways the rules reach it', async ({ page }) => {
	/*
	 * Three siblings and one parent: the claim about each of the other two is reached from both
	 * ends of the sibling group and by both rules. A member should be asked twice in all, not
	 * four or six times — the count is over this family's rows only, since the list spans the
	 * household.
	 */
	const f = family('Ursula', 'Lars', 'Mia');
	const third = 'Jonas Ammann';
	await aFamilyNobodyHasAnsweredFor(page, f);
	await add(page, third);
	await openPerson(page, new RegExp(f.one));
	await addLink(page, 'Sibling of', third);

	await checkEveryone(page);
	const ours = page.getByTestId('kin-suggestion').filter({ hasText: f.parent });
	await expect(ours).toHaveCount(2);
	await expect(ours.filter({ hasText: claimOf(f) })).toHaveCount(1);
	await expect(ours.filter({ hasText: `${f.parent} is a parent of ${third}` })).toHaveCount(1);
});
