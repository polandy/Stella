import { expect, test, type Page } from '@playwright/test';
import { signIn } from './app';
import { clickNode, settled, stateOf } from './graph-canvas';

/*
 * Choosing which of a circle's roles to open up on the map (docs/02 §2.7). Written after the
 * maintainer tried it in the running app (docs/08 §8.4.1).
 *
 * Read-only against the demo household: it centres Lena, whose Turnverein circle sits one hop
 * out with its members still unopened — Franziska and Beat belong to it, neither is on Lena's
 * map before it is expanded, and their roles differ (Aktive / Leiter).
 */

const LENA = 'demo-c-lena';
const TURNVEREIN = 'demo-circle-turnverein';
const FRANZISKA = 'demo-c-franziska';
const BEAT = 'demo-c-beat';

/** Opens Lena's map and selects the Turnverein node, so its panel is showing. */
async function selectCircle(page: Page) {
	await page.goto(`/graph?center=${LENA}`);
	await settled(page);
	await clickNode(page, TURNVEREIN);
	const peek = page.getByRole('complementary');
	await expect(peek.getByText('Turnverein Länggasse')).toBeVisible();
	return peek;
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('lists the circle’s roles, all ticked, and opens only the ones left ticked', async ({
	page
}) => {
	const peek = await selectCircle(page);

	const roles = peek.getByTestId('circle-roles');
	for (const label of ['Aktive · 2', 'Kinderriege · 1', 'Leiter · 1']) {
		await expect(roles.getByLabel(label)).toBeChecked();
	}
	// Neither is on the map yet — the precondition that gives the assertions below meaning.
	expect(await stateOf(page, BEAT)).toBe('absent');
	expect(await stateOf(page, FRANZISKA)).toBe('absent');

	await roles.getByLabel('Aktive · 2').uncheck();
	await roles.getByLabel('Kinderriege · 1').uncheck();
	await peek.getByRole('button', { name: 'Expand connections' }).click();

	// The one Leiter came out; the two Aktive stayed away.
	await expect.poll(() => stateOf(page, BEAT)).toBe('drawn');
	expect(await stateOf(page, FRANZISKA)).toBe('absent');
});

test('opens the whole circle when every role stays ticked', async ({ page }) => {
	const peek = await selectCircle(page);

	await peek.getByRole('button', { name: 'Expand connections' }).click();

	await expect.poll(() => stateOf(page, BEAT)).toBe('drawn');
	expect(await stateOf(page, FRANZISKA)).toBe('drawn');
});

test('will not expand a circle with no role ticked', async ({ page }) => {
	const peek = await selectCircle(page);
	const roles = peek.getByTestId('circle-roles');
	for (const label of ['Aktive · 2', 'Kinderriege · 1', 'Leiter · 1']) {
		await roles.getByLabel(label).uncheck();
	}

	await expect(peek.getByRole('button', { name: 'Expand connections' })).toBeDisabled();
});
