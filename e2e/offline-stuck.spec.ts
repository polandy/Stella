import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test';
import { FAILURE_SPACING_MS, STUCK_AFTER_FAILURES } from '../src/lib/pwa/outbox-failures';
import { mention, signIn } from './app';

/*
 * A kept moment Stella keeps failing on gets stuck (docs/dev/02 §2.18.2, the arrival table's
 * "something on Stella's side failed" row). Written after the owner's OK (docs/dev/08 §8.4.1).
 *
 * The failure is staged: the route answers `failed` for any batch carrying the doomed moment and
 * lets every other batch through. The save is the first failed round; later ones are started by
 * going offline and back (the `online` event; a routed request is answered even offline), and the
 * page clock jumps a spacing between them, so each failure counts.
 */

const DOOMED = 'the save Stella keeps failing on';
const kept = (page: Page) => page.getByTestId('outbox').locator('article');
const inStream = (page: Page, text: string) => page.getByTestId('stream').getByText(text);

let failures = 0;
test.beforeEach(() => {
	failures = 0;
});

async function failDoomed(route: Route): Promise<void> {
	const { commands } = route.request().postDataJSON() as { commands: { id: string }[] };
	if (!JSON.stringify(commands).includes(DOOMED)) return route.continue();
	failures++;
	await route.fulfill({
		json: { answers: commands.map((command) => ({ id: command.id, status: 'failed' })) }
	});
}

/**
 * `rounds` more failed rounds, a spacing apart, each started by going offline and back. A round
 * may send more than once (the `online` event and the reachability check both ask); those
 * resends fall in the same spacing and count once.
 */
async function failRounds(page: Page, context: BrowserContext, rounds: number): Promise<void> {
	let now = await page.evaluate(() => Date.now());
	for (let round = 1; round <= rounds; round++) {
		await expect(kept(page)).not.toHaveAttribute('data-outbox-state', 'sending');
		await context.setOffline(true);
		// A failure lands a little after the clock moved: a second's slack keeps the next a spacing on.
		now += FAILURE_SPACING_MS + 1_000;
		await page.clock.setSystemTime(now);
		const before = failures;
		await context.setOffline(false);
		await expect.poll(() => failures).toBeGreaterThan(before);
	}
	await expect(kept(page)).not.toHaveAttribute('data-outbox-state', 'sending');
}

async function writeMoment(page: Page, text: string): Promise<void> {
	await mention(page, 'Lena', /Lena Brunner/);
	await page.getByLabel('What happened?').pressSequentially(text);
	await page.getByRole('button', { name: /^Save/ }).click();
}

test('a moment Stella keeps failing on gets stuck, lets later saves through, and goes once edited', async ({
	page,
	context
}) => {
	await page.clock.install();
	await signIn(page);
	await page.route('**/api/commands', failDoomed);

	await writeMoment(page, DOOMED);
	await expect(kept(page)).toContainText('Not sent yet');
	expect(failures).toBe(1);

	await failRounds(page, context, STUCK_AFTER_FAILURES - 2);
	await expect(kept(page)).toHaveAttribute('data-outbox-state', 'pending');
	await failRounds(page, context, 1);
	await expect(kept(page)).toHaveAttribute('data-outbox-state', 'stuck');
	await expect(kept(page)).toContainText('Stuck');
	await expect(kept(page)).toContainText('Edit it to try again, or discard it.');

	// Stuck, it is not sent again and no longer holds up what is saved after it.
	const sentSoFar = failures;
	await writeMoment(page, 'saved after the stuck one');
	await expect(inStream(page, 'saved after the stuck one')).toBeVisible();
	expect(failures).toBe(sentSoFar);

	// Edited, it is sent again; Stella takes it this time.
	await page.unroute('**/api/commands');
	await kept(page).getByRole('button', { name: 'Edit' }).click();
	const field = page.getByLabel('What happened?');
	await expect(field).toHaveValue(new RegExp(DOOMED));
	await field.fill((await field.inputValue()).replace('keeps failing on', 'took in the end'));
	await page.getByRole('button', { name: /^Save/ }).click();
	await expect(inStream(page, 'the save Stella took in the end')).toBeVisible();
	await expect(page.getByTestId('outbox')).toHaveCount(0);
});

test('a stuck moment is discarded when asked twice', async ({ page, context }) => {
	await page.clock.install();
	await signIn(page);
	await page.route('**/api/commands', failDoomed);
	await writeMoment(page, DOOMED);
	await expect(kept(page)).toContainText('Not sent yet');

	await failRounds(page, context, STUCK_AFTER_FAILURES - 1);
	await expect(kept(page)).toHaveAttribute('data-outbox-state', 'stuck');

	await kept(page).getByRole('button', { name: 'Discard' }).click();
	await kept(page).getByRole('button', { name: 'Discard for good' }).click();
	await expect(page.getByTestId('outbox')).toHaveCount(0);
});
