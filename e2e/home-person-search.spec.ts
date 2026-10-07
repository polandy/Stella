import { expect, test, type Page } from '@playwright/test';
import { signIn } from './app';

/*
 * The top of a phone's Home finds a person (docs/02 §2.22.1); the desktop keeps the composer
 * there. Written after the maintainer checked it on the phone (docs/08 §8.4.1).
 *
 * Read-only against the demo household.
 */

const PIXEL_9_PRO = { width: 412, height: 915 };
const LENA = 'demo-c-lena';

test.describe('on a phone', () => {
	test.use({ viewport: PIXEL_9_PRO, hasTouch: true });

	test.beforeEach(async ({ page }) => {
		await signIn(page);
	});

	const finder = (page: Page) => page.getByRole('combobox', { name: 'Find a person…' });

	test('lists the people a typed name matches, and a tap opens one', async ({ page }) => {
		await finder(page).pressSequentially('lena');

		const lena = page.getByRole('option', { name: 'Lena Brunner' });
		await expect(lena).toBeVisible();
		await lena.click();

		await expect(page).toHaveURL(`/contacts/${LENA}`);
	});

	test('moves through the rows with the arrow keys and opens the highlighted one', async ({
		page
	}) => {
		await finder(page).pressSequentially('brunner');
		const options = page.getByRole('option');
		await expect(options.first()).toHaveAttribute('aria-selected', 'true');

		await finder(page).press('ArrowDown');
		await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
		// The row's text is the avatar's initials, then the name.
		const second = (await options.nth(1).innerText()).split('\n').at(-1)!;

		await finder(page).press('Enter');
		await expect(page.getByRole('heading', { level: 1, name: second })).toBeVisible();
	});

	test('ends with the full search, which also reads notes', async ({ page }) => {
		await finder(page).pressSequentially('garden gate');

		await page.getByRole('option', { name: 'Search everything for “garden gate”' }).click();

		await expect(page).toHaveURL('/search?q=garden%20gate');
	});

	test('does nothing on Enter before anything is typed', async ({ page }) => {
		// Every search the page asks for is recorded; the tap to Lena that follows is the
		// positive signal that anything Enter would have started has been sent by then.
		const searches: string[] = [];
		page.on('request', (request) => {
			if (new URL(request.url()).pathname === '/search') searches.push(request.url());
		});

		await finder(page).press('Enter');
		await finder(page).pressSequentially('lena');
		await page.getByRole('option', { name: 'Lena Brunner' }).click();
		await expect(page).toHaveURL(`/contacts/${LENA}`);

		expect(searches).toEqual([]);
	});

	test('shows the logo where the one-word breadcrumb would be, centred on the top bar buttons', async ({
		page
	}) => {
		const logo = page.getByRole('banner').getByRole('link', { name: 'Stella home' });
		await expect(logo).toBeVisible();
		await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toHaveCount(0);

		// Measured, not read from the classes: an inline link sat 3px above the buttons' middle.
		const middle = async (box: { y: number; height: number } | null) => box!.y + box!.height / 2;
		const mark = await middle(await logo.getByRole('img', { name: 'Stella' }).boundingBox());
		// The search button is not on a phone's Home (the field is the search), so the logo is
		// measured against *Add person*, the button beside it.
		const button = await middle(
			await page.getByRole('banner').getByRole('link', { name: 'Add person' }).boundingBox()
		);
		expect(Math.abs(mark - button)).toBeLessThanOrEqual(0.5);
	});

	test('keeps the breadcrumb, not the logo, everywhere but Home', async ({ page }) => {
		await page.getByRole('link', { name: 'People' }).last().click();

		// A phone's trail is only the way back: on People that is Home (docs/05 §5.4).
		await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Home');
		await expect(page.getByRole('banner').getByRole('link', { name: 'Stella home' })).toHaveCount(
			0
		);
	});
});

test('keeps the composer at the top of Home on a desktop, with no person search', async ({
	page
}) => {
	await signIn(page);

	await expect(page.getByLabel('What happened?')).toBeVisible();
	await expect(page.getByTestId('person-finder')).toBeHidden();
});
