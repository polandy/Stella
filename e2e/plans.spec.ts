import { expect, test, type Browser, type Page } from '@playwright/test';
import { addPerson, appReady, pickPerson, releaseSelfClaim, serverToday, signIn } from './app';
import { personIdOf, seedHousehold } from './seed';
import { UNDO_WINDOW_MS } from '../src/lib/undo/pending-removals';
import { DEMO_ADMIN_PASSWORD, DEMO_MEMBER_EMAIL } from '../src/lib/server/db/demo-constants';

/*
 * The Outings card on the person page (docs/dev/02 §2.27): the empty line and its help, an idea
 * for a day, a month or some time, one far ahead folded under *Later*, booking, ticking done and
 * opening again from *Done*; noting, booking and ticking while Stella is out of reach; and an idea
 * kept from the member it is with. The page's clock is
 * the test's, so a toast stands until the case moves on; days come from the server's today.
 * The suite shares one database, so every person is the run's own.
 */

/** Six letters no other attempt shares. */
function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		String.fromCharCode(97 + (byte % 26))
	).join('');
}

const plansCard = (page: Page) => page.locator('#section-plans');
const ideaRow = (page: Page, title: string) =>
	plansCard(page).getByTestId('plan-ideas').locator('li', { hasText: title });
// The toasts stack while the page's clock stands, so each is found by what it says.
const toast = (page: Page, text: string) =>
	page.getByTestId('toast-undo').filter({ hasText: text });

/** Lets the page's clock run past every toast, so a screenshot shows the card alone. */
async function toastsGone(page: Page): Promise<void> {
	await page.clock.runFor(UNDO_WINDOW_MS + 1000);
	await expect(page.getByTestId('toast-undo')).toHaveCount(0);
}

/** The month `months` after `today`'s, `YYYY-MM`. */
function monthAfter(today: string, months: number): string {
	const [year, month] = today.split('-').map(Number);
	const index = year * 12 + (month - 1) + months;
	return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** Notes an idea through the card's *+ Idea*, its *when* chosen by `choose`; the caller looks for it. */
async function addIdea(
	page: Page,
	title: string,
	choose?: (picker: ReturnType<Page['getByTestId']>) => Promise<void>
): Promise<void> {
	const card = plansCard(page);
	await card.getByRole('button', { name: 'Idea', exact: true }).click();
	const form = card.getByTestId('plan-form');
	await form.getByLabel('What do you want to do?').fill(title);
	if (choose) await choose(form.getByTestId('when-picker'));
	await form.getByRole('button', { name: 'Save' }).click();
	await expect(form).toHaveCount(0);
}

test('an idea is noted, folded when far, booked, done and opened again', async ({
	page
}, testInfo) => {
	await page.clock.install();
	await signIn(page);
	const today = await serverToday(page);
	const letters = runLetters();
	await addPerson(page, 'Ausflugine', `Wandermann${letters}`);
	const card = plansCard(page);

	// Empty, the card is one line that says what it is for.
	await expect(card).toHaveAttribute('data-empty-line', 'true');
	await expect(card).toContainText('No idea yet.');
	await expect(card.getByTestId('plans-help')).toHaveText(
		'Something you want to do together. What you owe someone is a to-do.'
	);
	await card.screenshot({ path: testInfo.outputPath('empty-card.png') });

	const zoo = `Zoo ${letters}`;
	const lake = `Lake by bike ${letters}`;
	const sea = `The sea ${letters}`;
	await addIdea(page, zoo, async (picker) => {
		await picker.getByText('In a month', { exact: true }).click();
		await picker.getByTestId('when-month').selectOption(monthAfter(today, 1));
	});
	await addIdea(page, lake);
	await addIdea(page, sea, async (picker) => {
		await picker.getByText('In a month', { exact: true }).click();
		await picker.getByTestId('when-month').selectOption(monthAfter(today, 8));
	});

	// The far one folds under *Later*; *some time* comes after a month.
	await expect(card).not.toHaveAttribute('data-empty-line');
	await expect(card.getByRole('tab', { name: /Ideas/ })).toHaveText('Ideas · 2');
	await expect(card.getByTestId('plan-ideas').locator('li')).toHaveText([
		new RegExp(zoo),
		new RegExp(lake)
	]);
	const fold = card.getByTestId('plan-later');
	await expect(fold).toHaveText('Later · 1');
	await fold.click();
	await expect(card.getByTestId('plan-waiting')).toContainText(sea);

	// Booked: it stops counting as an idea, and stays on the card.
	await ideaRow(page, zoo).getByTestId('plan-book').click();
	await expect(toast(page, `Booked: ${zoo}`)).toBeVisible();
	await expect(ideaRow(page, zoo).getByTestId('plan-booked')).toHaveText('booked');
	await expect(card.getByRole('tab', { name: /Ideas/ })).toHaveText('Ideas · 1');
	await toastsGone(page);
	await card.screenshot({ path: testInfo.outputPath('booked.png') });

	// Not booked after all.
	await ideaRow(page, zoo).getByTestId('plan-unbook').click();
	await expect(ideaRow(page, zoo).getByTestId('plan-booked')).toHaveCount(0);
	await expect(card.getByRole('tab', { name: /Ideas/ })).toHaveText('Ideas · 2');

	// Done: off the ideas, into *Done* with its day; *Not done* brings it back.
	await ideaRow(page, lake)
		.getByRole('checkbox', { name: `Done: ${lake}` })
		.check();
	await expect(toast(page, `Done: ${lake}`)).toBeVisible();
	await expect(ideaRow(page, lake)).toHaveCount(0);
	await expect(card.getByRole('tab', { name: /Done/ })).toHaveText('Done · 1');
	await card.getByRole('tab', { name: /Done/ }).click();
	const done = card.getByTestId('plan-done-list').locator('li', { hasText: lake });
	await expect(done.getByTestId('plan-done-on')).toBeVisible();
	await toastsGone(page);
	await card.screenshot({ path: testInfo.outputPath('done-tab.png') });
	await done.getByTestId('plan-reopen').click();
	await expect(card.getByTestId('plan-done-list')).toHaveCount(0);
	await card.getByRole('tab', { name: /Ideas/ }).click();
	await expect(ideaRow(page, lake)).toHaveCount(1);
});

test('noting, booking and ticking are kept offline, and sent once back', async ({
	page,
	context
}) => {
	await signIn(page);
	const letters = runLetters();
	await addPerson(page, 'Ausflugine', `Funkloch${letters}`);
	const booked = `Climbing hall ${letters}`;
	const ticked = `Pancakes ${letters}`;
	await addIdea(page, booked);
	await addIdea(page, ticked);
	await expect(ideaRow(page, ticked)).toHaveCount(1);

	await context.setOffline(true);
	const noted = `Ice rink ${letters}`;
	await addIdea(page, noted);
	const kept = plansCard(page).getByTestId('kept-plans').locator('li');
	await expect(kept).toContainText(noted);
	await expect(kept).toContainText('Not sent yet');

	await ideaRow(page, booked).getByTestId('plan-book').click();
	await expect(ideaRow(page, booked).getByTestId('plan-booked')).toHaveText('booked');
	await expect(ideaRow(page, booked)).toContainText('Not sent yet');
	await ideaRow(page, ticked)
		.getByRole('checkbox', { name: `Done: ${ticked}` })
		.check();
	await expect(ideaRow(page, ticked)).toContainText('Not sent yet');

	// Also on Home, seen there while the way to Stella is held shut.
	const personPage = page.url();
	await page.route('**/api/commands', (route) => route.abort());
	await context.setOffline(false);
	await page.goto('/');
	const outbox = page.getByTestId('outbox');
	await expect(outbox).toContainText(`outing with Ausflugine Funkloch${letters}`);
	await expect(outbox).toContainText('outing booked');
	await expect(outbox).toContainText('outing done');
	await expect(outbox).toContainText(ticked);

	await page.unroute('**/api/commands');
	const sent = page.waitForResponse(
		(response) => response.url().endsWith('/api/commands') && response.request().method() === 'POST'
	);
	await page.reload();
	await sent;
	await expect(outbox).toHaveCount(0);
	await page.goto(personPage);
	await appReady(page);
	await expect(plansCard(page)).not.toContainText('Not sent yet');
	await expect(ideaRow(page, noted)).toHaveCount(1);
	await expect(ideaRow(page, booked).getByTestId('plan-booked')).toHaveText('booked');
	await expect(ideaRow(page, ticked)).toHaveCount(0);
	await plansCard(page).getByRole('tab', { name: /Done/ }).click();
	await expect(plansCard(page).getByTestId('plan-done-list')).toContainText(ticked);
});

/** A second browser signed in as the household's other member, Nina. */
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

test('an idea for everyone but the member it is with stays away from them', async ({
	page,
	browser
}, testInfo) => {
	await signIn(page);
	const letters = runLetters();
	const name = `Ottilie Reiser${letters}`;
	const concert = `Concert ${letters}`;
	const party = `Surprise party ${letters}`;
	await seedHousehold(page, [name]);

	const nina = await signInAsNina(browser);
	try {
		await nina.goto('/settings');
		await pickPerson(nina.getByLabel('Which of these people is you'), name);
		await nina.getByRole('button', { name: 'Save' }).click();
		await expect(nina.getByText('Saved.')).toBeVisible();

		await page.goto(`/contacts/${personIdOf(name)}`);
		await appReady(page);
		await addIdea(page, concert);
		await expect(ideaRow(page, concert)).toHaveCount(1);
		const card = plansCard(page);
		await card.getByRole('button', { name: 'Idea', exact: true }).click();
		const form = card.getByTestId('plan-form');
		await form.getByLabel('What do you want to do?').fill(party);
		await form.getByText(`Everyone but ${name}`, { exact: true }).click();
		await form.getByRole('button', { name: 'Save' }).click();
		await expect(ideaRow(page, party).getByTestId('plan-surprise')).toHaveText(
			`hidden from ${name}`
		);
		await expect(card.getByRole('tab', { name: /Ideas/ })).toHaveText('Ideas · 2');

		// Nina sees the concert, and neither the party nor its count.
		await nina.goto(`/contacts/${personIdOf(name)}`);
		await appReady(nina);
		await expect(ideaRow(nina, concert)).toHaveCount(1);
		await expect(plansCard(nina)).not.toContainText(party);
		await expect(plansCard(nina).getByRole('tab', { name: /Ideas/ })).toHaveText('Ideas · 1');
		await plansCard(nina).screenshot({ path: testInfo.outputPath('kept-from-person.png') });
	} finally {
		await releaseSelfClaim(nina);
		await nina.context().close();
	}
});
