import { expect, test, type Page } from '@playwright/test';
import { appReady, signIn } from './app';

/*
 * Home's rail, the People directory and the ⌘K palette (docs/02 §2.12.1, §2.2, §2.22.1;
 * docs/05 §5.4). Written after the screens were merged and seen in the running app
 * (docs/08 §8.4.1). Runs against the demo dataset, signed in as the demo admin; the person
 * created here (Xenia Quillford) is absent from the seed.
 */

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

/**
 * Adds people whose birthday falls in the next few days, so *Coming up* is longer than the
 * phone's three-row cap and something is inside the 14-day horizon — whatever the seeded
 * calendar looks like on the day the suite runs. Each caller brings its own names, so two
 * tests never fight over the same person.
 */
async function addBirthdaysSoon(page: Page, names: string[]): Promise<void> {
	for (const [i, name] of names.entries()) {
		const [first, last] = name.split(' ');
		// A leap year, so a 29 February birthday is a real date to type into the field.
		const soon = new Date(Date.now() + (i + 2) * 86_400_000).toISOString().slice(5, 10);
		await page.goto('/contacts/new');
		await page.getByLabel('First name').fill(first);
		await page.getByLabel('Last name').fill(last);
		await page.getByText('More — nickname, birthday').click();
		await page.getByLabel('Birthday').fill(`1992-${soon}`);
		await page.getByRole('button', { name: 'Add person' }).click();
		await expect(page.getByRole('heading', { name })).toBeVisible();
	}
	await page.goto('/');
}

test('names a person nobody has written about in months, and offers to write a moment', async ({ page }) => {
	const quiet = page.getByTestId('quiet-lately');

	// Reto's last entry is seeded three hundred days back; Markus was written about yesterday.
	await expect(quiet.getByRole('link', { name: 'Reto Hofer' })).toBeVisible();
	await expect(quiet.getByRole('link', { name: 'Markus Brunner' })).toHaveCount(0);

	await quiet.getByRole('listitem').filter({ hasText: 'Reto Hofer' }).getByRole('link', { name: 'Write a moment' }).click();

	await expect(page.getByLabel('What happened?')).toHaveValue(/Reto/);
});

test('finds a person by the nickname given when they were added', async ({ page }) => {
	await page.goto('/contacts/new');
	await page.getByLabel('First name').fill('Xenia');
	await page.getByLabel('Last name').fill('Quillford');
	await page.getByText('More — nickname, birthday').click();
	await page.getByLabel('Nickname').fill('Xeni');
	await page.getByRole('button', { name: 'Add person' }).click();
	await expect(page.getByRole('heading', { name: 'Xenia Quillford' })).toBeVisible();

	await page.goto('/contacts');
	const directory = page.getByTestId('people-directory');
	await expect(directory.getByRole('link', { name: /Hans Brunner/ })).toBeVisible();

	await page.getByPlaceholder('Find someone…').fill('xeni');

	await expect(directory.getByRole('link', { name: /Xenia Quillford/ })).toBeVisible();
	await expect(directory.getByRole('link', { name: /Hans Brunner/ })).toHaveCount(0);

	await page.getByPlaceholder('Find someone…').fill('nobody-by-this-name');
	await expect(page.getByRole('status')).toHaveText(/Nobody matches/);
});

test('jumps to a person from anywhere with ⌘K, type, Enter', async ({ page }) => {
	await page.goto('/circles');
	// The shortcut only listens once the shell has mounted, and the trigger enables itself at
	// the same moment — so this is the page saying it is ready, not a wait and a hope.
	await appReady(page);
	await page.keyboard.press('Control+k');
	const palette = page.getByRole('dialog', { name: 'Jump to' });
	await expect(palette).toBeVisible();

	await page.keyboard.type('Vreni');
	await expect(palette.getByRole('option', { name: /Vreni Zbinden/ })).toHaveAttribute('aria-selected', 'true');
	await page.keyboard.press('Enter');

	await expect(page).toHaveURL(/\/contacts\/demo-c-vreni$/);
	await expect(page.getByRole('heading', { name: 'Vreni Zbinden' })).toBeVisible();
});

test.describe('on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test('lays the rail out as one vertical list, with nothing off the right edge', async ({ page }) => {
		// The bands used to be a strip of cards scrolling sideways, so most of them sat off
		// the screen with nothing to say so (docs/05 §5.5).
		const sideways = await page.evaluate(() => {
			const scrolls = (el: Element) => el.scrollWidth > el.clientWidth + 1;
			return {
				page: document.documentElement.scrollWidth > window.innerWidth + 1,
				bands: [...document.querySelectorAll('[data-testid$="-lately"] ul, [data-testid="coming-up"] ul')].some(scrolls)
			};
		});
		expect(sideways).toEqual({ page: false, bands: false });
	});

	test('stops a band after three people and shows the rest on request', async ({ page }) => {
		await addBirthdaysSoon(page, ['Alina Nyffeler', 'Bela Ostwald', 'Cyril Pfister', 'Dora Reinhardt']);
		const comingUp = page.getByTestId('coming-up');
		// `getByRole` skips what `display: none` hides, so the rows past the cap are counted
		// through the DOM instead — the point of the test is that they are there but unseen.
		const rows = comingUp.locator('li');
		const total = await rows.count();
		expect(total).toBeGreaterThan(3);

		await expect(rows.filter({ visible: true })).toHaveCount(3);

		await comingUp.getByRole('button', { name: `Show all ${total}` }).click();

		await expect(rows.filter({ visible: true })).toHaveCount(total);
		await expect(comingUp.getByRole('button', { name: /Show all/ })).toHaveCount(0);
	});

	test('keeps the capture field above the rail', async ({ page }) => {
		// The rail is worth the top of a phone screen; the field it would push off is worth more.
		const bar = await page.getByRole('link', { name: 'What happened?' }).boundingBox();
		const rail = await page.getByRole('complementary', { name: 'At a glance' }).boundingBox();
		expect(bar!.y).toBeLessThan(rail!.y);
	});

	test('puts the rail above the stream while a date is days away', async ({ page }) => {
		// Seeded dates drift with the calendar, so this makes its own. The other side of the
		// rule — the rail below the stream — is `hasImminentDate`'s unit tests: nothing here
		// can empty a household's calendar deterministically.
		await addBirthdaysSoon(page, ['Yannick Zwahlen']);

		await expect(page.getByTestId('coming-up').getByRole('link', { name: 'Yannick Zwahlen' })).toBeVisible();

		const comingUp = await page.getByTestId('coming-up').boundingBox();
		const stream = await page.getByTestId('stream').boundingBox();
		expect(comingUp!.y).toBeLessThan(stream!.y);
	});

	test('the pencil in the tab bar opens the composer as a sheet', async ({ page }) => {
		await expect(page.getByTestId('compose-sheet')).toHaveCount(0);

		// The tab bar's pencil, not the rail's per-person links of the same name.
		await page.locator('nav').getByRole('link', { name: 'Write a moment' }).click();

		await expect(page.getByTestId('compose-sheet')).toBeVisible();
		await expect(page.getByLabel('What happened?')).toBeFocused();
	});
});

test('shows every row of the rail beside the stream on a desktop', async ({ page }) => {
	await addBirthdaysSoon(page, ['Elia Sutter', 'Fabio Trachsel', 'Gina Ulrich', 'Hilde Vogt']);
	const comingUp = page.getByTestId('coming-up');
	const rows = comingUp.locator('li');
	const total = await rows.count();
	expect(total).toBeGreaterThan(3);

	// From `lg` the rail is a column of its own: the cap and its button belong to the phone.
	await expect(rows.filter({ visible: true })).toHaveCount(total);
	await expect(comingUp.getByRole('button', { name: /Show all/ })).toHaveCount(0);
});
