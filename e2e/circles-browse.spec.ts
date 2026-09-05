import { expect, test } from '@playwright/test';
import { appReady, signIn } from './app';

/*
 * Finding a circle among many (docs/02 §2.4.2, docs/05 §5.5). Written after the screen was
 * seen in the running app (docs/08 §8.4.1). Read-only against the demo dataset: it types and
 * clicks chips, and changes nothing another case could depend on.
 */

test.beforeEach(async ({ page }) => {
	await signIn(page);
	await page.goto('/circles');
	await appReady(page);
});

/*
 * The counts asserted below are the ones `kl` leaves, never the unfiltered total: another
 * case creates a circle of its own, and a total would then depend on the order the files run
 * in. Nothing in the seed or in any other case matches `kl` besides these three.
 */
test('narrows the list as you type, over the description as well as the name', async ({ page }) => {
	const cards = page.getByTestId('circle-cards').getByRole('listitem');
	await expect(cards.filter({ hasText: 'Klasse 3a' })).toHaveCount(1);
	await expect(cards.filter({ hasText: 'Frauenchor Bern' })).toHaveCount(1);

	await page.getByRole('searchbox', { name: 'Find a circle' }).fill('kl');

	// Two classes by name, and the music school by its description ("Klavierunterricht").
	await expect(cards).toHaveCount(3);
	await expect(cards.filter({ hasText: 'Klasse 3a' })).toHaveCount(1);
	await expect(cards.filter({ hasText: 'Musikschule' })).toHaveCount(1);
	await expect(cards.filter({ hasText: 'Frauenchor Bern' })).toHaveCount(0);
});

test('counts each kind after the query, so no chip leads to an empty page', async ({ page }) => {
	const chips = page.getByTestId('circle-kinds');
	await page.getByRole('searchbox', { name: 'Find a circle' }).fill('kl');

	// The counts follow what is left, not what the household has: two classes and one course.
	await expect(chips.getByRole('button', { name: /^class/i })).toContainText('2');
	await expect(chips.getByRole('button', { name: /^course/i })).toContainText('1');
	await expect(chips.getByRole('button', { name: /^club/i })).toHaveCount(0);

	const klass = chips.getByRole('button', { name: /^class/i });
	await klass.click();
	await expect(klass).toHaveAttribute('aria-pressed', 'true');
	const cards = page.getByTestId('circle-cards').getByRole('listitem');
	await expect(cards).toHaveCount(2);
	await expect(cards.filter({ hasText: 'Musikschule' })).toHaveCount(0);
});

test('hands the pressed state back to All when the query filters that kind away', async ({ page }) => {
	const chips = page.getByTestId('circle-kinds');
	const search = page.getByRole('searchbox', { name: 'Find a circle' });
	await search.fill('kl');
	await chips.getByRole('button', { name: /^class/i }).click();
	await expect(chips.getByRole('button', { name: /^class/i })).toHaveAttribute('aria-pressed', 'true');

	// "Frauenchor" is a club, so the chosen Class chip is gone; the row must not leave the
	// page empty with nothing pressed.
	await search.fill('frauenchor');
	await expect(chips.getByRole('button', { name: /^all/i })).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByTestId('circle-cards').getByRole('listitem')).toHaveCount(1);
});

test('says so when nothing matches, rather than showing a blank page', async ({ page }) => {
	await page.getByRole('searchbox', { name: 'Find a circle' }).fill('zzz-nothing-matches-this');

	await expect(page.getByText('No circle matches')).toBeVisible();
	await expect(page.getByTestId('circle-cards')).toHaveCount(0);
});
