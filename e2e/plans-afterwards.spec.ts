import { expect, test, type Browser, type Page } from '@playwright/test';
import { addPerson, appReady, pickPerson, releaseSelfClaim, serverToday, signIn } from './app';
import { personIdOf, seedHousehold } from './seed';
import { UNDO_WINDOW_MS } from '../src/lib/undo/pending-removals';
import { DEMO_ADMIN_PASSWORD, DEMO_MEMBER_EMAIL } from '../src/lib/server/db/demo-seed';

/*
 * After an outing (docs/dev/02 §2.27.8): the done toast's *Write a moment* opens the story's
 * composer on the idea, on the day it was done, and saving links the moment to it — on the
 * *Done* tab and in the story. *Note again* notes the idea anew for some time. A private idea and
 * one kept from the member it is with stay out of that member's story. Ticking out of reach says
 * the moment waits. The page's clock is the test's, so a toast stands until the case moves on.
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
const doneRow = (page: Page, title: string) =>
	plansCard(page).getByTestId('plan-done-list').locator('li', { hasText: title });
const composer = (page: Page) => page.getByTestId('story-composer');
const storyItem = (page: Page, text: string) =>
	page.locator('#section-story [data-story-item]', { hasText: text });

/** Notes an idea for some time through the card's *+ Idea*, private when asked. */
async function addIdea(page: Page, title: string, audience?: string): Promise<void> {
	const card = plansCard(page);
	await card.getByRole('button', { name: 'Idea', exact: true }).click();
	const form = card.getByTestId('plan-form');
	await form.getByLabel('What do you want to do?').fill(title);
	if (audience) await form.getByText(audience, { exact: true }).click();
	await form.getByRole('button', { name: 'Save' }).click();
	await expect(form).toHaveCount(0);
	await expect(ideaRow(page, title)).toHaveCount(1);
}

async function tick(page: Page, title: string): Promise<void> {
	await ideaRow(page, title)
		.getByRole('checkbox', { name: `Done: ${title}` })
		.check();
	await expect(ideaRow(page, title)).toHaveCount(0);
}

test('a done idea is told of in a moment, linked from its card and the story, and noted again', async ({
	page
}, testInfo) => {
	await page.clock.install();
	await signIn(page);
	const today = await serverToday(page);
	const letters = runLetters();
	await addPerson(page, 'Ausflugine', `Nachher${letters}`);
	const hall = `Climbing hall ${letters}`;
	await addIdea(page, hall);

	// The toast offers the moment beside Undo.
	await tick(page, hall);
	const toast = page.getByTestId('toast-undo').filter({ hasText: `Done: ${hall}` });
	await expect(toast.getByRole('button', { name: 'Undo' })).toBeVisible();
	await toast.screenshot({ path: testInfo.outputPath('done-toast.png') });
	await toast.getByRole('button', { name: 'Write a moment' }).click();
	await expect(toast).toHaveCount(0);

	// The composer starts from the idea, on the day it was done.
	const field = composer(page).getByRole('textbox', { name: 'What happened with Ausflugine?' });
	await expect(field).toHaveValue(hall);
	await expect(composer(page).locator('input[name="entryDate"]')).toHaveValue(today);
	await field.fill(`${hall}: she made it to the top twice`);
	await composer(page).getByRole('button', { name: /^Save/ }).click();
	await expect(composer(page)).toHaveCount(0);

	// The story has the outing, with a way to the moment beside the moment itself.
	const outing = storyItem(page, 'Outing').filter({ hasText: hall });
	await expect(outing.getByTestId('story-plan-moment')).toHaveText('The moment');
	await expect(storyItem(page, 'she made it to the top twice')).toHaveCount(1);
	await page.clock.runFor(UNDO_WINDOW_MS + 1000);
	await expect(page.getByTestId('toast-undo')).toHaveCount(0);
	await outing.screenshot({ path: testInfo.outputPath('story-outing.png') });

	// *Done* links it too, and notes it again for some time.
	await plansCard(page).getByRole('tab', { name: /Done/ }).click();
	await expect(doneRow(page, hall).getByTestId('plan-moment')).toHaveAttribute(
		'href',
		/\/journal#entry-/
	);
	await expect(doneRow(page, hall).getByTestId('plan-write-moment')).toHaveCount(0);
	await plansCard(page).screenshot({ path: testInfo.outputPath('done-tab.png') });
	await doneRow(page, hall).getByTestId('plan-again').click();
	await expect(
		page.getByTestId('toast-notice').filter({ hasText: `Noted again: ${hall}` })
	).toBeVisible();
	await expect(doneRow(page, hall)).toHaveCount(1);
	await plansCard(page).getByRole('tab', { name: /Ideas/ }).click();
	await expect(ideaRow(page, hall)).toHaveCount(1);
	await expect(ideaRow(page, hall).getByTestId('plan-done-on')).toHaveCount(0);
});

test('a done idea without a moment offers one from its card', async ({ page }) => {
	await signIn(page);
	const letters = runLetters();
	await addPerson(page, 'Ausflugine', `Spaeter${letters}`);
	const lake = `Lake by bike ${letters}`;
	await addIdea(page, lake);
	await tick(page, lake);

	await plansCard(page).getByRole('tab', { name: /Done/ }).click();
	await doneRow(page, lake).getByTestId('plan-write-moment').click();
	const field = composer(page).getByRole('textbox', { name: 'What happened with Ausflugine?' });
	await expect(field).toHaveValue(lake);
	await composer(page).getByRole('button', { name: /^Save/ }).click();
	await expect(composer(page)).toHaveCount(0);
	await expect(doneRow(page, lake).getByTestId('plan-moment')).toBeVisible();
});

test('ticking out of reach says the moment waits for Stella', async ({ page, context }) => {
	await page.clock.install();
	await signIn(page);
	const letters = runLetters();
	await addPerson(page, 'Ausflugine', `Funkstille${letters}`);
	const rink = `Ice rink ${letters}`;
	await addIdea(page, rink);

	await context.setOffline(true);
	await ideaRow(page, rink)
		.getByRole('checkbox', { name: `Done: ${rink}` })
		.check();
	await expect(
		page.getByTestId('toast-notice').filter({
			hasText: 'You can write the moment once Stella is in reach.'
		})
	).toBeVisible();
	await expect(page.getByRole('button', { name: 'Write a moment', exact: true })).toHaveCount(0);
	await context.setOffline(false);
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

test('a private idea and one kept from the member stay out of that member’s story', async ({
	page,
	browser
}) => {
	await signIn(page);
	const letters = runLetters();
	const name = `Ottilie Nachgang${letters}`;
	const concert = `Concert ${letters}`;
	const party = `Surprise party ${letters}`;
	const diary = `Quiet walk ${letters}`;
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
		await addIdea(page, party, `Everyone but ${name}`);
		await addIdea(page, diary, 'Private');
		for (const title of [concert, party, diary]) await tick(page, title);
		await expect(storyItem(page, 'Outing')).toHaveCount(3);

		await nina.goto(`/contacts/${personIdOf(name)}`);
		await appReady(nina);
		await expect(storyItem(nina, concert)).toHaveCount(1);
		await expect(nina.locator('#section-story')).not.toContainText(party);
		await expect(nina.locator('#section-story')).not.toContainText(diary);
	} finally {
		await releaseSelfClaim(nina);
		await nina.context().close();
	}
});
