import { expect, test, type Page, type Route } from '@playwright/test';
import { appReady, signIn } from './app';
import { LINK, personIdOf, seedHousehold } from './seed';

/*
 * The last-name chip on a profile (docs/02 §2.2.4.6): a tap saves at once under the shell's
 * activity indicator, the new name is on screen once the page has reloaded, the offer to pass
 * the name on appears under it, and the toast's *Undo* puts the name back as it was.
 *
 * Nothing is waited for by the clock: each save is **held open by the test** until it releases
 * it, so the indicator is seen while the request is in flight, and the name after it.
 *
 * Dora and Carl are seeded with a first name only, as Anna's children, so Stella proposes
 * Anna's last name for them; the surname is used by no other case and not by the demo household.
 */

const SURNAME = 'Chipfeld';
const ANNA = `Anna ${SURNAME}`;
const DORA = 'Dora';
const CARL = 'Carl';

/**
 * A gate on the page's form posts, installed once: `hold()` keeps every post from going out
 * until the `release` it returns is called. One route for the whole case, so no handler is
 * removed while a request it holds is still on its way.
 */
async function saveGate(page: Page): Promise<{ hold: () => () => void }> {
	let held: Promise<void> | null = null;
	await page.route('**/contacts/**', async (route: Route) => {
		if (route.request().method() === 'POST' && held) await held;
		await route.continue();
	});
	return {
		hold() {
			let release!: () => void;
			held = new Promise<void>((resolve) => (release = resolve));
			return () => {
				held = null;
				release();
			};
		}
	};
}

test('a tapped chip saves at once, offers the name on, and Undo puts the name back', async ({
	page
}) => {
	await signIn(page);
	await seedHousehold(
		page,
		[ANNA, DORA, CARL],
		[
			{ from: ANNA, to: DORA, type: LINK.parentOf },
			{ from: ANNA, to: CARL, type: LINK.parentOf }
		]
	);
	await page.goto(`/contacts/${personIdOf(DORA)}`);
	await appReady(page);
	await expect(page.getByRole('heading', { name: DORA, exact: true })).toBeVisible();

	const indicator = page.getByTestId('activity-indicator');
	const chip = page.getByTestId('last-name-chip').filter({ hasText: `${SURNAME}?` });

	// The tap: the indicator stands while the save is out, and the name follows the answer.
	const gate = await saveGate(page);
	const releaseGive = gate.hold();
	await chip.click();
	await expect(indicator).toBeVisible();
	releaseGive();
	await expect(
		page.getByRole('heading', { name: `${DORA} ${SURNAME}`, exact: true })
	).toBeVisible();
	await expect(indicator).toHaveCount(0);
	await expect(chip).toHaveCount(0);

	const toast = page.getByTestId('toast-undo').filter({
		hasText: `Last name ${SURNAME} given to ${DORA}`
	});
	await expect(toast).toBeVisible();
	// Her nameless brother is offered the name under hers.
	const passOn = page.getByTestId('pass-on');
	await expect(passOn).toContainText(`${CARL} has no last name yet — ${SURNAME} too?`);

	// *Undo*: under the indicator again, and the name is back as it was.
	const releaseTakeBack = gate.hold();
	await toast.getByRole('button', { name: 'Undo' }).click();
	await expect(indicator).toBeVisible();
	releaseTakeBack();
	await expect(page.getByRole('heading', { name: DORA, exact: true })).toBeVisible();
	await expect(chip).toBeVisible();
	await expect(indicator).toHaveCount(0);
	await expect(passOn).toHaveCount(0);
});
