import { expect, test, type Page } from '@playwright/test';
import { addPerson, appReady, serverToday, signIn } from './app';
import { personIdOf, seedHousehold } from './seed';

// An idea for later (docs/dev/02 §2.25.8, ADR-135); years come from the server's day, people are unique per run.

/** Six letters no other attempt shares. */
function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		String.fromCharCode(97 + (byte % 26))
	).join('');
}

const giftsCard = (page: Page) => page.locator('#section-gifts');

/** Opens the card's idea form with the title typed. */
async function startIdea(page: Page, title: string) {
	const card = giftsCard(page);
	await card.getByRole('button', { name: 'Idea', exact: true }).click();
	const form = card.getByTestId('gift-form');
	await form.getByLabel('What?').fill(title);
	return form;
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('an idea for a day or for later waits under Later, out of the count, folded away on the household list', async ({
	page
}, testInfo) => {
	const next = Number((await serverToday(page)).slice(0, 4)) + 1;
	const letters = runLetters();
	await addPerson(page, 'Wendelin', `Wartmann${letters}`);
	const card = giftsCard(page);

	// No birth year: an age cannot be chosen, and the picker says how to give one.
	const form = await startIdea(page, `Sled ${letters}`);
	const picker = form.getByTestId('when-picker');
	await expect(picker.getByRole('radio', { name: 'From age' })).toBeDisabled();
	await expect(picker.getByRole('radio', { name: 'For a birthday' })).toBeDisabled();
	await expect(picker.getByRole('radio', { name: 'Christmas at age' })).toBeDisabled();
	await expect(picker.getByTestId('when-estimate')).toBeVisible();

	await picker.getByText('On a day', { exact: true }).click();
	await picker.getByRole('button', { name: `Christmas ${next}` }).click();
	await expect(picker.getByTestId('when-preview')).toContainText(`Due 24 December ${next}.`);
	await expect(picker.getByTestId('when-preview')).toContainText('It waits until');
	await form.getByRole('button', { name: 'Save' }).click();
	await expect(form).toHaveCount(0);

	await expect(card.getByText('Nothing due yet. The ideas for later wait below.')).toBeVisible();
	await expect(card.getByRole('tab', { name: 'Ideas' })).toHaveText('Ideas');
	const fold = card.getByTestId('gift-later');
	await expect(fold).toHaveText('Later · 1');

	const later = await startIdea(page, `Kite ${letters}`);
	await later.getByTestId('when-picker').getByText('Later', { exact: true }).click();
	await expect(later.getByTestId('when-preview')).toHaveText(
		'Waits under Later. Once a year it asks whether it is still current.'
	);
	await later.getByRole('button', { name: 'Save' }).click();
	await expect(fold).toHaveText('Later · 2');

	await fold.click();
	const waiting = card.getByTestId('gift-waiting');
	// Soonest first, *later* last.
	await expect(waiting.getByTestId('when-chip')).toHaveText([`Christmas ${next}`, 'Later']);

	// Folded away on the household's shopping list too, until this member asks for them.
	await page.goto('/gifts');
	await appReady(page);
	await expect(page.getByText(`Sled ${letters}`)).toHaveCount(0);
	await expect(page.getByText(`Kite ${letters}`)).toHaveCount(0);
	const toggle = page.getByTestId('gift-list-waiting');
	await expect(toggle).toHaveText(/^Show \d+ ideas for later$/);
	await expect(toggle).toHaveAttribute('aria-pressed', 'false');
	await page.screenshot({ path: testInfo.outputPath('gifts-list-folded.png') });
	await toggle.click();
	await expect(toggle).toHaveText('Hide the ideas for later');
	const shown = page.locator('li[data-waiting]', { hasText: letters });
	await expect(shown.getByTestId('when-chip')).toHaveText([`Christmas ${next}`, 'Later']);
	await page.screenshot({ path: testInfo.outputPath('gifts-list-waiting.png') });

	// Remembered on this device: read again, the list still shows them.
	await page.reload();
	await appReady(page);
	await expect(toggle).toHaveAttribute('aria-pressed', 'true');
	await expect(shown).toHaveCount(2);
	await toggle.click();
	await expect(shown).toHaveCount(0);
});

test('an age counts from an estimated birth year, and taken back to now the idea is open again, in the brief too', async ({
	page
}) => {
	const year = Number((await serverToday(page)).slice(0, 4));
	const name = `Ottilie Altmann${runLetters()}`;
	await seedHousehold(page, [name], [], {}, [], [], [], { [name]: String(year - 34) });
	await page.goto(`/contacts/${personIdOf(name)}`);
	await appReady(page);
	const card = giftsCard(page);

	const form = await startIdea(page, 'Telescope');
	const picker = form.getByTestId('when-picker');
	await picker.getByText('For a birthday', { exact: true }).click();
	await expect(picker.getByTestId('when-age')).toHaveText('35');
	for (let step = 0; step < 5; step++) {
		await picker.getByRole('button', { name: 'One year older' }).click();
	}
	await expect(picker.getByTestId('when-preview')).toContainText(`Turns 40 in about ${year + 6}.`);
	await form.getByRole('button', { name: 'Save' }).click();
	await expect(form).toHaveCount(0);

	// Not one to bring yet: the brief leaves it out.
	await page.goto(`/contacts/${personIdOf(name)}/brief`);
	await appReady(page);
	await expect(page.getByText('Telescope')).toHaveCount(0);
	await page.goto(`/contacts/${personIdOf(name)}`);
	await appReady(page);

	await card.getByTestId('gift-later').click();
	const row = card.getByTestId('gift-waiting').locator('li', { hasText: 'Telescope' });
	await expect(row.getByTestId('when-chip')).toHaveText('For the 40th birthday');

	await row.getByRole('button', { name: 'Edit “Telescope”' }).click();
	const edit = row.getByTestId('gift-form');
	await edit.getByTestId('when-picker').getByText('Now', { exact: true }).click();
	await edit.getByRole('button', { name: 'Save' }).click();
	await expect(card.getByTestId('gift-ideas').locator('li', { hasText: 'Telescope' })).toHaveCount(
		1
	);
	await expect(card.getByTestId('gift-later')).toHaveCount(0);
	await expect(card.getByRole('tab', { name: 'Ideas' })).toHaveText('Ideas · 1');

	await page.goto(`/contacts/${personIdOf(name)}/brief`);
	await appReady(page);
	await expect(page.getByTestId('brief-gifts')).toContainText('Telescope');
});

test('an idea for Christmas at an age names the Christmas Eve they are that age, a year on when born after it', async ({
	page
}) => {
	const year = Number((await serverToday(page)).slice(0, 4));
	const born = year - 5;
	const name = `Noel Winterberg${runLetters()}`;
	await seedHousehold(page, [name], [], {}, [], [], [], { [name]: `${born}-12-28` });
	await page.goto(`/contacts/${personIdOf(name)}`);
	await appReady(page);
	const card = giftsCard(page);

	const form = await startIdea(page, 'Sledge');
	const picker = form.getByTestId('when-picker');
	await picker.getByText('Christmas at age', { exact: true }).click();
	await picker.getByRole('button', { name: 'One year older' }).click();
	const age = Number(await picker.getByTestId('when-age').textContent());
	// Born 28 December, they turn `age` after that year's Christmas Eve.
	await expect(picker.getByTestId('when-preview')).toContainText(
		`Christmas ${born + age + 1}, at age ${age}.`
	);
	await expect(picker.getByTestId('when-preview')).toContainText('It waits until');
	await form.getByRole('button', { name: 'Save' }).click();
	await expect(form).toHaveCount(0);

	await expect(card.getByTestId('gift-later')).toHaveText('Later · 1');
	await card.getByTestId('gift-later').click();
	await expect(card.getByTestId('gift-waiting').getByTestId('when-chip')).toHaveText(
		`Christmas at ${age}`
	);
});

test('an age without a birth year links to estimating it', async ({ page }) => {
	await addPerson(page, 'Wendelin', `Schaetzer${runLetters()}`);
	const form = await startIdea(page, 'Bike');
	await form.getByTestId('when-estimate').click();
	await expect(page.locator('[data-fact-editor="dates"]')).toBeVisible();
});
