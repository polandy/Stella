import { expect, test, type Page } from '@playwright/test';
import { addPerson, openPerson, pickPerson, signIn } from './app';

/*
 * The on-demand review on a person page (docs/02 §2.4.1,
 * docs/concepts/relationship-suggestions.md §6.5). Written after the flow was verified in the
 * running app (docs/08 §8.4.1).
 *
 * Every other suggestion is raised by a write and is gone on the next page load; this one is
 * asked for. So each case enters the links, navigates *away* from the write that raised them,
 * and only then presses the control — which is the only way to tell an answer from an echo of
 * the form that was just submitted.
 *
 * The suite shares one database and the answers are stored, so each case gets a family of its
 * own: two cases working the same three people would have one of them answering a claim the
 * other had already settled. The Odermatts are invented for this file; no seeded person and no
 * other spec uses the name.
 */

interface Family {
	parent: string;
	one: string;
	other: string;
}

/** Three people who share nothing with any other case in this file. */
const family = (parent: string, one: string, other: string): Family => ({
	parent: `${parent} Odermatt`,
	one: `${one} Odermatt`,
	other: `${other} Odermatt`
});

/** What the review should say about `other`, once the links below are in place. */
const claimOf = (f: Family) => `${f.parent} is a parent of ${f.other}`;

/** Fills the *Add relationship* form on the open person and submits it. */
async function addLink(page: Page, type: string, person: string): Promise<void> {
	await page.getByRole('button', { name: 'Add relationship' }).click();
	const form = page.locator('form[action="?/addRelationship"]');
	await form.locator('select[name=typeChoice]').selectOption({ label: type });
	await pickPerson(form.getByLabel('Person'), person);
	await form.getByRole('button', { name: 'Add', exact: true }).click();
}

const first = (name: string) => name.split(' ')[0]!;
const last = (name: string) => name.split(' ')[1]!;

/**
 * The sentence the rule gives for its claim. It names both people in full and reads from the
 * subject's side — *Ronja Odermatt is Silvan Odermatt's sibling* — which is the claim's own
 * direction, not the direction the links were entered in.
 */
const reasonOf = (f: Family) => `${f.other} is ${f.one}’s sibling.`;

/** Adds a person from their full name, through the real form. */
const add = (page: Page, name: string) => addPerson(page, first(name), last(name));

/**
 * `one` and `other` are siblings and `parent` is `one`'s parent — so *parent is a parent of
 * other* follows, and nothing has stored it. The suggestion the parent link raised on the way
 * is deliberately left unanswered: navigating away from it is what makes the rest about the
 * review rather than about the write.
 */
async function aFamilyWithOneClaimStanding(page: Page, f: Family): Promise<void> {
	await add(page, f.one);
	await add(page, f.other);
	await add(page, f.parent);

	await openPerson(page, new RegExp(f.one));
	await addLink(page, 'Sibling of', f.other);
	await openPerson(page, new RegExp(f.parent));
	await addLink(page, 'Parent of', f.one);
}

/**
 * The declined drawer, open. `open` is set on the element by the browser, not by Svelte, so a
 * client-side navigation carries it over — and a blind click on the summary would *close* a
 * drawer that came back open. Asserting the state is also what makes the step deterministic.
 */
async function openDeclined(page: Page) {
	const drawer = page.getByTestId('kin-declined');
	if ((await drawer.getAttribute('open')) === null) await drawer.locator('summary').click();
	await expect(drawer).toHaveAttribute('open', '');
	return drawer;
}

/** Opens `other`'s page and presses the control that runs the rules. */
async function review(page: Page, f: Family) {
	await openPerson(page, new RegExp(f.other));
	await page.getByRole('link', { name: 'Check relationships' }).click();
	return page.getByTestId('kin-review');
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('asks what stands around one person when told to, and survives a reload', async ({ page }) => {
	const f = family('Heidi', 'Silvan', 'Ronja');
	await aFamilyWithOneClaimStanding(page, f);

	// Opening Ronja fresh: the write that raised the claim is two pages behind us, and there is
	// no panel until somebody asks for one.
	await openPerson(page, new RegExp(f.other));
	await expect(page.getByTestId('kin-review')).toHaveCount(0);

	await page.getByRole('link', { name: 'Check relationships' }).click();
	const panel = page.getByTestId('kin-review');
	await expect(panel).toContainText(claimOf(f));
	await expect(panel).toContainText(reasonOf(f));
	await expect(panel).toContainText('certain');
	await expect(panel).toContainText('1 open');

	// It hangs on the URL rather than on a flag in the client, so a reload keeps it open.
	await page.reload();
	await expect(page.getByTestId('kin-review')).toContainText(claimOf(f));
});

test('declining holds the no with who said it, and offering it again puts the claim back', async ({ page }) => {
	const f = family('Greti', 'Timo', 'Nadja');
	await aFamilyWithOneClaimStanding(page, f);
	const panel = await review(page, f);

	await panel
		.getByTestId('kin-suggestion')
		.filter({ hasText: claimOf(f) })
		.getByRole('button', { name: 'Decline' })
		.click();

	// Gone from what is offered, and in the drawer with the member and the day on it.
	await expect(page.getByTestId('kin-review').getByTestId('kin-suggestion')).toHaveCount(0);
	await expect(page.getByTestId('kin-declined')).toContainText('1 declined suggestion');
	const declined = await openDeclined(page);
	await expect(declined).toContainText(claimOf(f));
	await expect(declined).toContainText(/declined on .+ by Demo Admin/);

	// A *no* is never a veto: taking it back offers the claim again, worked out afresh rather
	// than remembered — so its reason is there too.
	await declined.getByRole('button', { name: 'Offer again' }).click();
	const again = page.getByTestId('kin-review');
	await expect(again).toContainText(claimOf(f));
	await expect(again).toContainText(reasonOf(f));
});

test('accepting stores the link and stops offering it', async ({ page }) => {
	const f = family('Berta', 'Reto', 'Vroni');
	await aFamilyWithOneClaimStanding(page, f);
	const panel = await review(page, f);

	await panel
		.getByTestId('kin-suggestion')
		.filter({ hasText: claimOf(f) })
		.getByRole('button', { name: 'Accept' })
		.click();

	// Stored: it stands in the entered list on Vroni's page, and is no longer a question.
	await expect(page.locator('#section-relationships ul').first()).toContainText(f.parent);
	await expect(page.getByTestId('kin-review').getByTestId('kin-suggestion')).toHaveCount(0);
});

test('says so plainly when there is nothing to work out around someone', async ({ page }) => {
	// The control for the three above: the same button, a person with no family links, and the
	// panel says nothing rather than finding something to fill itself with.
	await add(page, 'Beat Odermatt');
	await page.getByRole('link', { name: 'Check relationships' }).click();
	const panel = page.getByTestId('kin-review');
	await expect(panel).toContainText('Nothing open.');
	await expect(panel.getByTestId('kin-suggestion')).toHaveCount(0);
});
