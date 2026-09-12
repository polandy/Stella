import { expect, test } from '@playwright/test';
import { fillDate, openPerson, signIn } from './app';

/*
 * The landing view of a person's page (docs/05 §5.5): People leads, a quick-overview line
 * names the numbers before any tab is opened, the story panel carries its own name instead of
 * none, and the ego graph draws without a click. Written after the maintainer saw the
 * reordered page live, on the family instance itself (docs/08 §8.4.1).
 */

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('opens on People, with the quick overview and the ego graph both already visible', async ({ page }) => {
	await openPerson(page, /Lena Brunner/);

	// openPerson already asserts People is the selected tab; this covers the rest of what
	// lands with it — no second click needed for any of it.
	const overview = page.getByTestId('contact-overview');
	await expect(overview).toBeVisible();

	// The overview's relationship count agrees with the People tab's own count badge — the
	// same number read two different ways, rather than one hand-typed against the seed.
	const tabText = await page.getByRole('tab', { name: /People/ }).textContent();
	const relationshipCount = tabText!.match(/\d+/)![0];
	await expect(overview).toContainText(`${relationshipCount} relationship`);

	// The graph draws on arrival: no "Show map" toggle exists any more.
	await expect(page.getByRole('button', { name: 'Show map' })).toHaveCount(0);
	await expect(page.getByRole('img', { name: /Relationship network for Lena Brunner/ })).toBeVisible();

	// The story panel has its own name now, distinct from both the tab and the overview above it.
	await page.getByRole('tab', { name: 'Story' }).click();
	await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible();
});

test('the quick overview\'s encounter count rises the moment a touchpoint is logged', async ({ page }) => {
	await openPerson(page, /Lena Brunner/);

	const readEncounters = async () => {
		const text = await page.getByTestId('contact-overview').textContent();
		return Number(text!.match(/(\d+) encounters?/)![1]);
	};
	const before = await readEncounters();

	await page.getByRole('tab', { name: 'Story' }).click();
	const section = page.locator('#panel-story');
	await section.getByRole('button', { name: 'Log contact' }).click();
	await section.getByLabel('Kind').selectOption('call');
	await fillDate(section, 'Day', '2026-01-05');
	await section.getByRole('button', { name: 'Log interaction' }).click();

	// The form posts natively; the page it comes back on is still Story, not the default People
	// — the thing this case exists to prove, since that redirect is new in this change.
	await expect(page.getByRole('tab', { name: 'Story' })).toHaveAttribute('aria-selected', 'true');
	expect(await readEncounters()).toBe(before + 1);
});
