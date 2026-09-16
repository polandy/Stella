import { expect, test, type Page } from '@playwright/test';
import { CLAIMS_PER_GROUP } from '../src/lib/suggestions/paging';
import { openPerson, signIn } from './app';
import { LINK, seedHousehold } from './seed';

/*
 * The household-wide relationship review (docs/02 §2.4.1,
 * docs/concepts/relationship-suggestions.md §6.6), folded for scale in
 * docs/concepts/relationship-review-at-scale.html. Written after the flow was verified in the
 * running app (docs/08 §8.4.1).
 *
 * The screen answers about *everyone*, so this file never asserts a household total: the suite
 * shares one database, and other specs add people whose claims land in the same list. Since the
 * list is paged, a case cannot even count on its own family being on the first page — so each
 * one searches for its own surname, which narrows the pager to that family and is also how a
 * member with somebody in mind reads the screen.
 *
 * One family per case, with a surname of its own, because the answers are stored: two cases
 * working the same people would have one answering what the other settled. None of these
 * surnames appears in the demo dataset.
 */

const REVIEW = '/settings/relationships';

interface Family {
	surname: string;
	parent: string;
	one: string;
	other: string;
}

const family = (surname: string, parent: string, one: string, other: string): Family => ({
	surname,
	parent: `${parent} ${surname}`,
	one: `${one} ${surname}`,
	other: `${other} ${surname}`
});

/** The review, narrowed to one family — the pager's list rather than the household's. */
const reviewFor = (f: Family) => `${REVIEW}?review&q=${f.surname}`;

/** The sentence the household screen should carry, once the links below are in place. */
const claimOf = (f: Family) => `${f.parent} is a parent of ${f.other}`;

/**
 * The sentence the rule gives for its claim: both people in full, read from the subject's side
 * — *Ronja Ammann is Silvan Ammann's sibling* — which is the claim's direction rather than the
 * one the links were entered in.
 */
const reasonOf = (f: Family) => `${f.other} is ${f.one}’s sibling.`;

/**
 * A family whose claim nobody has answered, and whose profiles nobody opens: `one` and `other`
 * are siblings, `parent` is `one`'s parent, so *parent is a parent of other* follows. It arrives
 * by archive rather than through the forms, so no write ever raised the claim on a page — that
 * is the state a household is in when it has never been through its own graph, and it is one
 * request instead of a page load per person and per link.
 */
const aFamilyNobodyHasAnsweredFor = (page: Page, f: Family) =>
	seedHousehold(
		page,
		[f.one, f.other, f.parent],
		[
			{ from: f.one, to: f.other, type: LINK.siblingOf },
			{ from: f.parent, to: f.one, type: LINK.parentOf }
		]
	);

/** The one row this case is about, out of however many the household has. */
const rowFor = (page: Page, f: Family) =>
	page.getByTestId('kin-suggestion').filter({ hasText: claimOf(f) });

/** Runs the rules over everyone, then narrows the page to this case's family. */
async function checkEveryone(page: Page, f: Family): Promise<void> {
	await page.goto(reviewFor(f));
	await expect(rowFor(page, f)).toContainText(claimOf(f));
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

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('finds a claim from Settings that no member opened a profile for', async ({ page }) => {
	const f = family('Ammann', 'Marlis', 'Silvan', 'Ronja');
	await aFamilyNobodyHasAnsweredFor(page, f);

	// Closed, the screen runs nothing: it offers the one control and says as much.
	await page.goto(REVIEW);
	await expect(page.getByRole('heading', { name: 'Check relationships' })).toBeVisible();
	await expect(page.getByText('Nothing checked yet')).toBeVisible();
	await expect(page.getByTestId('kin-suggestion')).toHaveCount(0);

	await page.getByRole('link', { name: 'Check all relationships' }).click();
	await expect(page).toHaveURL(/\/settings\/relationships\?review/);

	await page.goto(reviewFor(f));
	await expect(rowFor(page, f)).toContainText(claimOf(f));
	await expect(rowFor(page, f)).toContainText(reasonOf(f));

	// Filed under the person it is about — the child, whose parents were in question — and that
	// name links to their page.
	const card = page.locator('main section').filter({ hasText: claimOf(f) });
	await expect(card.getByRole('link', { name: new RegExp(f.other) })).toHaveAttribute(
		'href',
		/\/contacts\//
	);
});

test('declining on the household screen holds the no, and offering it again brings it back', async ({
	page
}) => {
	const f = family('Zingg', 'Gertrud', 'Timo', 'Nadja');
	await aFamilyNobodyHasAnsweredFor(page, f);
	await checkEveryone(page, f);

	await rowFor(page, f).getByRole('button', { name: 'Decline' }).click();
	await expect(rowFor(page, f)).toHaveCount(0);

	// Answering returns to the place it was answered from, search and all: losing your place on
	// every answer is what makes a long list unfinishable.
	await expect(page).toHaveURL(new RegExp(`q=${f.surname}`));

	// In the drawer, with who said no and when — and still gone after the rules run again,
	// which is the whole point of writing the answer down.
	const declined = await openDeclined(page);
	const declinedRow = declined.getByRole('listitem').filter({ hasText: claimOf(f) });
	await expect(declinedRow).toContainText(/declined on .+ by Demo Admin/);

	await page.goto(reviewFor(f));
	await expect(rowFor(page, f)).toHaveCount(0);

	await (await openDeclined(page))
		.getByRole('listitem')
		.filter({ hasText: claimOf(f) })
		.getByRole('button', { name: 'Offer again' })
		.click();
	await expect(rowFor(page, f)).toContainText(claimOf(f));
});

test('accepting on the household screen writes the link onto the person', async ({ page }) => {
	const f = family('Wyss', 'Beatrix', 'Reto', 'Vroni');
	await aFamilyNobodyHasAnsweredFor(page, f);
	await checkEveryone(page, f);

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
	const f = family('Eggli', 'Ursula', 'Lars', 'Mia');
	const third = `Jonas ${f.surname}`;
	await seedHousehold(
		page,
		[f.one, f.other, f.parent, third],
		[
			{ from: f.one, to: f.other, type: LINK.siblingOf },
			{ from: f.parent, to: f.one, type: LINK.parentOf },
			{ from: f.one, to: third, type: LINK.siblingOf }
		]
	);

	await checkEveryone(page, f);
	const ours = page.getByTestId('kin-suggestion').filter({ hasText: f.parent });
	await expect(ours).toHaveCount(2);
	await expect(ours.filter({ hasText: claimOf(f) })).toHaveCount(1);
	await expect(ours.filter({ hasText: `${f.parent} is a parent of ${third}` })).toHaveCount(1);
});

test('folds a person carrying more claims than a group renders, and names what it holds back', async ({
	page
}) => {
	/*
	 * Fold 2 (docs/concepts/relationship-review-at-scale.html). Seven parents on one sibling
	 * make seven claims about the other — the shape an import leaves behind. The screen renders
	 * five, says how many it is holding back and links to the rest. Nothing is dropped: the
	 * number in the fold is what the rules actually found, minus what is on the page.
	 */
	const f = family('Gerber', 'Alois', 'Fabio', 'Selina');
	const parents = ['Alois', 'Brigitte', 'Cornelia', 'Damian', 'Edith', 'Fridolin', 'Gabriela'].map(
		(first) => `${first} ${f.surname}`
	);
	await seedHousehold(
		page,
		[f.one, f.other, ...parents],
		[
			{ from: f.one, to: f.other, type: LINK.siblingOf },
			...parents.map((parent) => ({
				from: parent,
				to: f.one,
				type: LINK.parentOf
			}))
		]
	);

	await page.goto(reviewFor(f));
	const card = page.locator('main section').filter({ hasText: claimOf(f) });
	await expect(card.getByTestId('kin-suggestion')).toHaveCount(CLAIMS_PER_GROUP);

	// The fold names the number it is holding back, and the way to the rest is that person's
	// own review panel — one screen, reached two ways.
	const folded = card.getByTestId('kin-folded');
	await expect(folded).toContainText(`${parents.length - CLAIMS_PER_GROUP} more for ${f.other}`);
	await expect(folded.getByRole('link', { name: `Open all ${parents.length}` })).toHaveAttribute(
		'href',
		/\/contacts\/.*\?review/
	);
});

test('keeps the declined log answerable at its own address', async ({ page }) => {
	/*
	 * Fold 3 (docs/concepts/relationship-review-at-scale.html). Past ten answers the log leaves
	 * the drawer for its own page; that threshold is a unit case (`declinedFitsInline`), but the
	 * page it moves to is a screen, and `docs/using-stella.md` promises a member can still offer
	 * one again from there. Reached by its address rather than by declining eleven claims, so the
	 * promise is checked without a minute of setup on every run.
	 */
	const f = family('Zollinger', 'Ottilia', 'Fabio', 'Selina');
	await aFamilyNobodyHasAnsweredFor(page, f);
	await checkEveryone(page, f);
	await rowFor(page, f).getByRole('button', { name: 'Decline' }).click();
	await expect(rowFor(page, f)).toHaveCount(0);

	await page.goto(`${REVIEW}?review&declined`);
	await expect(page.getByRole('heading', { name: 'Declined suggestions' })).toBeVisible();
	// Open on arrival: a page whose whole purpose is the log must not start on a closed drawer.
	await expect(page.getByTestId('kin-declined')).toHaveAttribute('open', '');
	const row = page.getByRole('listitem').filter({ hasText: claimOf(f) });
	await expect(row).toContainText(/declined on .+ by Demo Admin/);

	// The way back is on every row here too, and taking it returns the claim to the open list.
	await row.getByRole('button', { name: 'Offer again' }).click();
	await page.goto(reviewFor(f));
	await expect(rowFor(page, f)).toContainText(claimOf(f));
});

test('says where in the list a page is without letting the household count shrink', async ({
	page
}) => {
	/*
	 * The counting-versus-rendering contract: the header describes the household, the range
	 * describes the page, and a search moves the second while leaving the first alone. Asserted
	 * as an invariant rather than against a number, since the suite shares one database.
	 */
	const f = family('Hürlimann', 'Verena', 'Andrin', 'Lorena');
	await aFamilyNobodyHasAnsweredFor(page, f);

	const householdTotal = page.getByText(/\d+ open across \d+ (person|people)/);
	await page.goto(`${REVIEW}?review`);
	const wholeHousehold = (await householdTotal.textContent())!;
	const wholeRange = (await page.getByTestId('kin-pager').textContent())!;

	await page.goto(reviewFor(f));
	// Same household, a smaller slice of it: the total has not moved, the range has.
	await expect(householdTotal).toHaveText(wholeHousehold);
	await expect(page.getByTestId('kin-pager')).toContainText('of 1');
	expect(await page.getByTestId('kin-pager').textContent()).not.toBe(wholeRange);
});
