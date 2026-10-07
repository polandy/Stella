import { expect, test, type Locator, type Page } from '@playwright/test';
import { appReady, signIn } from './app';

/*
 * The People card's map strip and its fold (docs/05 §5.5; UX review C8, C9): on a wide card
 * the map is a preview strip with first names that enlarges in place, the list takes the
 * card's whole width, and a folded card says which groups it hides — each one a way to them.
 * Written after the owner tried it on the preview (docs/08 §8.4.1).
 *
 * Read-only against the demo household. Markus Brunner has seven family, three friends and five
 * worked-out relatives; Daniel Brunner five family and four worked out; Kurt Lehmann three.
 */

const MARKUS = 'demo-c-markus';
const DANIEL = 'demo-c-daniel';
const KURT = 'demo-c-kurt';

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

async function openDemoPerson(page: Page, id: string): Promise<void> {
	await page.goto(`/contacts/${id}`);
	await expect(page.getByTestId('relationship-list')).toBeVisible();
	await appReady(page);
}

const card = (page: Page) => page.locator('#section-relationships');
const frame = (page: Page) => page.getByTestId('person-map-preview');
const strip = (page: Page) => frame(page).locator('svg.shape-strip');
const enlarge = (page: Page) => frame(page).getByRole('button', { name: 'Enlarge map' });
const shrink = (page: Page) =>
	page.getByTestId('person-map-enlarged').getByRole('button', { name: 'Shrink map' });
const foldedAway = (page: Page) => card(page).getByRole('list', { name: 'Folded away' });

async function boxOf(locator: Locator) {
	const box = await locator.boundingBox();
	if (!box) throw new Error(`${locator} has no layout`);
	return box;
}
const frameHeight = async (page: Page) => (await boxOf(frame(page))).height;

test.describe('the map strip on a wide card', () => {
	test('stands across the card’s top with first names, the list at full width beneath', async ({
		page
	}) => {
		await openDemoPerson(page, MARKUS);

		await expect(strip(page)).toBeVisible();
		await expect(strip(page).locator('text', { hasText: /^Sandra$/ })).toHaveCount(1);
		await expect(strip(page).locator('text', { hasText: /^Thomas$/ })).toHaveCount(1);
		// No live canvas until it is asked for.
		await expect(card(page).locator('canvas')).toHaveCount(0);

		const map = await boxOf(frame(page));
		const list = await boxOf(page.getByTestId('relationship-list'));
		expect(map.y + map.height).toBeLessThanOrEqual(list.y);
		expect(list.width).toBeGreaterThanOrEqual(map.width - 1);
		// Four columns: the folded family's first row holds four tiles side by side.
		const family = page.getByRole('region', { name: /^Family · / }).getByRole('link');
		const lefts = new Set(
			await Promise.all((await family.all()).map(async (tile) => Math.round((await boxOf(tile)).x)))
		);
		expect(lefts.size).toBe(4);
	});

	test('its corner icon grows it into the live map, and Shrink map puts the strip back', async ({
		page
	}) => {
		await openDemoPerson(page, MARKUS);
		await expect(enlarge(page)).toBeEnabled();
		const rest = await frameHeight(page);

		// The icon is a picture on the strip's one button; a click on it is a click on that.
		const box = await boxOf(frame(page));
		await frame(page).click({ position: { x: box.width - 66, y: box.height - 22 } });
		await expect(shrink(page)).toBeFocused();
		await expect(page.getByTestId('person-map-enlarged').locator('canvas').first()).toBeVisible();
		await expect.poll(() => frameHeight(page)).toBeGreaterThan(rest * 2);

		await shrink(page).click();
		await expect(enlarge(page)).toBeFocused();
		await expect.poll(() => frameHeight(page)).toBe(rest);
		await expect(strip(page)).toBeVisible();
	});

	test('a click on the strip itself enlarges it too', async ({ page }) => {
		await openDemoPerson(page, MARKUS);
		await expect(enlarge(page)).toBeEnabled();
		await frame(page).click();
		await expect(shrink(page)).toBeFocused();
	});
});

test.describe('the fold', () => {
	test('folds the worked-out relatives away and names every group it hides whole', async ({
		page
	}) => {
		await openDemoPerson(page, MARKUS);

		await expect(page.getByTestId('relationship-list').getByRole('link')).toHaveCount(6);
		await expect(foldedAway(page).getByRole('button')).toHaveText([
			/^\s*Friends · 3$/,
			/^\s*Also related · 5$/
		]);
		await expect(page.getByTestId('derived-kin')).toHaveCount(0);
		await expect(card(page).getByRole('button', { name: 'Show 9 more' })).toBeVisible();
	});

	test('keeps Show N more when only worked-out people are left behind it', async ({ page }) => {
		await openDemoPerson(page, DANIEL);

		await expect(page.getByTestId('relationship-list').getByRole('link')).toHaveCount(5);
		await expect(foldedAway(page).getByRole('button')).toHaveText([/^\s*Also related · 4$/]);
		await expect(card(page).getByRole('button', { name: 'Show 4 more' })).toBeVisible();
	});

	test('a card with little to fold shows everybody and no line', async ({ page }) => {
		await openDemoPerson(page, KURT);

		await expect(page.getByTestId('relationship-list').getByRole('link').first()).toBeVisible();
		await expect(foldedAway(page)).toHaveCount(0);
		await expect(card(page).getByRole('button', { name: /^Show \d+ more$/ })).toHaveCount(0);
	});

	test('a group on the line unfolds the card and lands on that group', async ({ page }) => {
		await openDemoPerson(page, MARKUS);
		await card(page).getByRole('button', { name: 'Show Friends · 3' }).click();

		// The whole card unfolds — the one Show more state — and the cursor is on the group.
		await expect(card(page).getByRole('button', { name: 'Show fewer' })).toBeVisible();
		const friends = page
			.getByTestId('relationship-list')
			.getByRole('heading', { name: 'Friends · 3' });
		await expect(friends).toBeFocused();
		await expect(friends).toBeInViewport();
		await expect(page.getByTestId('derived-kin').getByRole('link').first()).toBeVisible();
		await expect(foldedAway(page)).toHaveCount(0);
	});

	test('the worked-out group on the line lands on the worked-out relatives', async ({ page }) => {
		await openDemoPerson(page, MARKUS);
		await card(page).getByRole('button', { name: 'Show Also related · 5' }).click();

		const heading = page.getByTestId('derived-kin').getByRole('heading', { name: /^Also related/ });
		await expect(heading).toBeFocused();
		await expect(heading).toBeInViewport();
	});
});

/*
 * The language is the account's, which every spec shares, so the case hands it back in English.
 */
test.describe('in German', () => {
	async function chooseLanguage(page: Page, language: string, settled: RegExp) {
		await page.goto('/settings');
		await page.getByRole('button', { name: language }).click();
		await expect(page.getByRole('heading', { name: settled })).toBeVisible();
	}

	test.afterEach(async ({ page }) => {
		await chooseLanguage(page, 'English', /^Settings$/);
	});

	test('the line names the groups in German', async ({ page }) => {
		await chooseLanguage(page, 'Deutsch', /^Einstellungen$/);
		await page.goto(`/contacts/${MARKUS}`);
		const line = card(page).getByRole('list', { name: 'Eingeklappt' });
		await expect(line.getByRole('button')).toHaveText([
			/^\s*Freunde · 3$/,
			/^\s*Ebenfalls verwandt · 5$/
		]);
		await expect(line.getByRole('button', { name: 'Freunde · 3 zeigen' })).toBeVisible();
		await expect(card(page).getByRole('button', { name: '9 weitere zeigen' })).toBeVisible();
	});
});
