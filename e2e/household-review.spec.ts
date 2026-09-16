import { expect, test, type Page } from '@playwright/test';
import { CLAIMS_PER_GROUP } from '../src/lib/suggestions/paging';
import { addPerson, openPerson, pickPerson, signIn } from './app';

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

/**
 * How far the list is scrolled. The app scrolls inside its own element rather than the window
 * (`+layout.svelte`), so `window.scrollY` is always 0 here — the scrolling ancestor is found at
 * runtime so this keeps working if the shell's markup moves.
 */
const listScrollTop = (page: Page) =>
	page.evaluate(() => {
		let node = document.querySelector('[data-testid="kin-suggestion"]')?.parentElement ?? null;
		while (node && node.scrollHeight <= node.clientHeight) node = node.parentElement;
		return node ? Math.round(node.scrollTop) : 0;
	});

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

	// The answer is held rather than sent: the row keeps its place for the undo window, and the
	// reader keeps theirs — no navigation happened, so the search is still on the address.
	await expect(rowFor(page, f)).toHaveAttribute('data-held', 'decline');
	await expect(page).toHaveURL(new RegExp(`q=${f.surname}`));

	// Leaving closes the window and sends it; a client-side navigation waits for the request,
	// which is the seam every deferred removal in this suite is tested through.
	await openPerson(page, new RegExp(f.other));
	await page.goto(reviewFor(f));
	await expect(rowFor(page, f)).toHaveCount(0);

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
	await expect(rowFor(page, f)).toHaveAttribute('data-held', 'accept');

	// Leaving sends it, and on the profile it is an entered link rather than a question.
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
	await aFamilyNobodyHasAnsweredFor(page, f);
	await add(page, third);
	await openPerson(page, new RegExp(f.one));
	await addLink(page, 'Sibling of', third);

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
	/*
	 * A budget, not a wait: eight people and seven links is the most setup in this file, and on
	 * a database the whole suite shares it runs past the default 30s. Every assertion below is
	 * still web-first — nothing here races a condition, it just has more real work to do.
	 */
	test.setTimeout(60_000);

	// Six, not seven: one more than a group renders is all the fold needs, and every extra
	// person here is two form round trips of setup on a database this file shares.
	const parents = ['Alois', 'Brigitte', 'Cornelia', 'Damian', 'Edith', 'Fridolin'];

	await add(page, f.one);
	await add(page, f.other);
	for (const first of parents) await add(page, `${first} ${f.surname}`);

	await openPerson(page, new RegExp(f.one));
	await addLink(page, 'Sibling of', f.other);
	for (const first of parents) {
		await openPerson(page, new RegExp(`${first} ${f.surname}`));
		await addLink(page, 'Parent of', f.one);
	}

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
	await expect(rowFor(page, f)).toHaveAttribute('data-held', 'decline');

	// Held answers reach the log only once they are sent, and leaving is what sends them.
	await openPerson(page, new RegExp(f.other));
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

test('answers a claim without moving the page under the reader', async ({ page }) => {
	/*
	 * The defect this file could not catch before: the older cases assert the URL still carries
	 * `q=`, which proves which *page* of the list you are on and says nothing about where on it.
	 * A form post plus a redirect threw the document away and scrolled to zero on every answer.
	 * The viewport is made small on purpose, so a short list still scrolls and the assertion has
	 * something to measure.
	 */
	const f = family('Tanner', 'Jolanda', 'Elia', 'Nuria');
	await aFamilyNobodyHasAnsweredFor(page, f);

	// A short viewport rather than a taller page: every extra person here is two form round
	// trips of setup on a database this file shares, and the case only needs *some* scroll to
	// lose. The assertion below is what keeps that honest.
	await page.setViewportSize({ width: 800, height: 300 });
	await page.goto(reviewFor(f));
	await rowFor(page, f).scrollIntoViewIfNeeded();
	const before = await listScrollTop(page);
	// The precondition is the test: with nothing to scroll there is nothing to prove.
	expect(before).toBeGreaterThan(0);

	await rowFor(page, f).getByRole('button', { name: 'Accept' }).click();

	// Held, not sent, and nothing moved: the row keeps its place and its height.
	await expect(rowFor(page, f)).toHaveAttribute('data-held', 'accept');
	await expect(page.getByTestId('toast-undo')).toContainText(f.parent);
	expect(await listScrollTop(page)).toBe(before);
	// Still the same address, too — no navigation happened at all.
	await expect(page).toHaveURL(new RegExp(`q=${f.surname}`));
});

test('takes an answer back before the window closes, having written nothing', async ({ page }) => {
	const f = family('Bischof', 'Regula', 'Yves', 'Alina');
	await aFamilyNobodyHasAnsweredFor(page, f);
	await checkEveryone(page, f);

	const openBefore = await page.getByText(/\d+ open across/).textContent();
	await rowFor(page, f).getByRole('button', { name: 'Accept' }).click();
	// The count follows the row down at once, rather than stating a number nobody can see.
	await expect(page.getByText(/\d+ open across/)).not.toHaveText(openBefore!);

	await page.getByTestId('toast-undo').getByRole('button', { name: 'Undo' }).click();
	await expect(page.getByTestId('toast-undo')).toHaveCount(0);
	await expect(rowFor(page, f)).not.toHaveAttribute('data-held');
	await expect(page.getByText(/\d+ open across/)).toHaveText(openBefore!);

	// A reload proves it: nothing was ever sent, so the claim still stands.
	await page.goto(reviewFor(f));
	await expect(rowFor(page, f)).toContainText(claimOf(f));
});

test('sends an answer left alone when the page is left', async ({ page }) => {
	const f = family('Lauber', 'Cornelia', 'Nico', 'Sarina');
	await aFamilyNobodyHasAnsweredFor(page, f);
	await checkEveryone(page, f);

	await rowFor(page, f).getByRole('button', { name: 'Accept' }).click();
	await expect(page.getByTestId('toast-undo')).toBeVisible();

	// Leaving commits it — the same seam every other deferred removal is tested through, so the
	// suite never waits out the window.
	await openPerson(page, new RegExp(f.other));
	await expect(page.getByTestId('toast-undo')).toHaveCount(0);
	await expect(page.locator('#section-relationships ul').first()).toContainText(f.parent);

	// And it is not a question any more.
	await page.goto(reviewFor(f));
	await expect(rowFor(page, f)).toHaveCount(0);
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
