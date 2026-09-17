import { expect, test, type Locator, type Page } from '@playwright/test';
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
 * The sentence the rule gives for its claim: both facts it rests on, and every name in it a way
 * to that person (docs/02 §2.4.1). Naming only the sibling pair, as it once did, never mentioned
 * the person being offered — the one name the reader is asking about.
 */
const reasonOf = (f: Family) =>
	`${f.parent} is a parent of ${f.one}, and ${f.one} and ${f.other} are siblings.`;

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

/**
 * Scrolls the list to its end and says how far that was.
 *
 * The app scrolls inside its own element rather than the window (`+layout.svelte`), so
 * `window.scrollY` is always 0 here — the scrolling ancestor is found at runtime so this keeps
 * working if the shell's markup moves. Scrolling to the end is what gives the list room to give
 * back when a row leaves; at the top there is none, and nothing can hold the rows below still.
 */
const scrollListToEnd = (page: Page) =>
	page.evaluate(() => {
		let node = document.querySelector('[data-testid="kin-suggestion"]')?.parentElement ?? null;
		while (node && node.scrollHeight <= node.clientHeight) node = node.parentElement;
		if (!node) return 0;
		node.scrollTop = node.scrollHeight;
		return Math.round(node.scrollTop);
	});

/** Where something sits in the viewport — the number that says whether it moved under a finger. */
const viewportTop = async (locator: Locator) => Math.round((await locator.boundingBox())!.y);

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

	/*
	 * Filed under the person it is about — the child, whose parents were in question — and every
	 * way their name appears leads to their page: the card's heading, the claim, and the reason
	 * (docs/02 §2.4.1). All of them, not just the first, or a name could be text in one place and
	 * a link in another.
	 */
	const card = page.locator('main section').filter({ hasText: claimOf(f) });
	const toTheChild = card.getByRole('link', { name: new RegExp(f.other) });
	await expect(toTheChild).toHaveCount(3);
	for (const link of await toTheChild.all()) {
		await expect(link).toHaveAttribute('href', /\/contacts\//);
	}
});

test('declining on the household screen holds the no, and offering it again brings it back', async ({
	page
}) => {
	const f = family('Zingg', 'Gertrud', 'Timo', 'Nadja');
	await aFamilyNobodyHasAnsweredFor(page, f);
	await checkEveryone(page, f);

	await rowFor(page, f).getByRole('button', { name: 'Decline' }).click();

	// The row goes at once, and the answer is held rather than sent — the toast says so, and it
	// is still the same address, because nothing navigated.
	await expect(rowFor(page, f)).toHaveCount(0);
	await expect(page.getByTestId('toast-undo')).toBeVisible();
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
	await expect(rowFor(page, f)).toHaveCount(0);
	await expect(page.getByTestId('toast-undo')).toBeVisible();

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
	 *
	 * An answered row now goes at once — so the promise is no longer that nothing changes, it is
	 * that nothing moves *under the reader*: the list gives the row's height back to its own
	 * scroll offset, and whatever stood below the row stands in the same place afterwards. The
	 * viewport is made small on purpose, so a short list still scrolls and there is room to give.
	 */
	const f = family('Tanner', 'Jolanda', 'Elia', 'Nuria');
	await aFamilyNobodyHasAnsweredFor(page, f);

	await page.setViewportSize({ width: 800, height: 300 });
	await page.goto(reviewFor(f));
	const scrolled = await scrollListToEnd(page);
	// The precondition is the test: with nothing to give back there is nothing to prove, and a
	// row is 74px, so the list has to be scrolled further than that for this to mean anything.
	expect(scrolled).toBeGreaterThan(74);

	// Something below the list, whose place is exactly what an answer must not disturb.
	const footer = page.getByText(/People \d+–\d+ of/);
	const before = await viewportTop(footer);

	await rowFor(page, f).getByRole('button', { name: 'Accept' }).click();

	// Gone at once — and held rather than sent, which the toast is the positive sign of.
	await expect(rowFor(page, f)).toHaveCount(0);
	await expect(page.getByTestId('toast-undo')).toContainText(f.parent);
	expect(await viewportTop(footer)).toBe(before);
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
	// The row comes back to the open list, which is the whole of what *Undo* promises here.
	await expect(rowFor(page, f)).toContainText(claimOf(f));
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
