import { expect, test, type Locator, type Page } from '@playwright/test';
import { addPerson, appReady, signIn } from './app';

/*
 * The shell's two review fixes (docs/concepts/review-2026-11.md UX-07, UX-08). An address that
 * leads nowhere lands on Stella's own screen — inside the shell when it is the app's — with
 * the way back to its list (docs/design/screens/across-screens.md); and on a touch screen the
 * small controls answer a fingertip around them (docs/05 §5.9). Written after the owner tried
 * both in the running app (docs/08 §8.4.1).
 *
 * Immich is wired in this suite, so its address is never missing here; which way back it gets
 * is stated in `src/lib/ui/stranded.test.ts`. The suite shares one database, so every touch
 * case works on a person of its own.
 */

const PIXEL_9_PRO = { width: 412, height: 915 };

/** How far off a control's centre a fingertip still lands on it: half of 44 px, less a hair. */
const FINGER_REACH = 20;

/** Six letters no other attempt shares. */
function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		String.fromCharCode(97 + (byte % 26))
	).join('');
}

const stranded = (page: Page) => page.getByTestId('stranded');

test.describe('an address that leads nowhere', () => {
	test.beforeEach(async ({ page }) => {
		await signIn(page);
	});

	// A page that answers *not found* renders in the shell; an address no route matches —
	// `/settings/…` included — gets the same screen without it.
	for (const { path, place, heading, way, href, inShell } of [
		{
			path: '/contacts/does-not-exist',
			place: 'person',
			heading: 'This person is no longer here',
			way: 'All people',
			href: '/contacts',
			inShell: true
		},
		{
			path: '/circles/does-not-exist',
			place: 'circle',
			heading: 'This circle is no longer here',
			way: 'All circles',
			href: '/circles',
			inShell: true
		},
		{
			path: '/settings/does-not-exist',
			place: 'settings',
			heading: 'This setting does not exist',
			way: 'Settings',
			href: '/settings',
			inShell: false
		}
	]) {
		test(`a missing ${place} offers the way to its list`, async ({ page }) => {
			const response = await page.goto(path);
			expect(response?.status()).toBe(404);
			await expect(stranded(page)).toHaveAttribute('data-place', place);
			await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
			await expect(page.getByTestId('top-bar')).toHaveCount(inShell ? 1 : 0);

			await stranded(page).getByRole('link', { name: way }).click();
			await expect(page).toHaveURL(href);
		});
	}

	test('an address outside the app gets the same screen without the shell', async ({ page }) => {
		const response = await page.goto('/nowhere');
		expect(response?.status()).toBe(404);
		await expect(stranded(page)).toHaveAttribute('data-place', 'elsewhere');
		await expect(
			page.getByRole('heading', { level: 1, name: 'This page does not exist' })
		).toBeVisible();
		await expect(page.getByTestId('top-bar')).toHaveCount(0);

		await stranded(page).getByRole('link', { name: 'Home' }).click();
		await expect(page.getByRole('heading', { name: 'What happened?' })).toBeVisible();
	});
});

test.describe('on a phone', () => {
	test.use({ viewport: PIXEL_9_PRO, hasTouch: true, isMobile: true });

	test.beforeEach(async ({ page }) => {
		await signIn(page);
		expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
	});

	/** Whether a tap `dx`, `dy` off `target`'s centre lands on it. */
	async function landsOn(target: Locator, dx: number, dy: number): Promise<boolean> {
		const box = await target.boundingBox();
		if (!box) throw new Error('the control has no layout');
		const x = box.x + box.width / 2 + dx;
		const y = box.y + box.height / 2 + dy;
		return target.evaluate(
			(element, [px, py]) => {
				const hit = document.elementFromPoint(px, py);
				// The control or something inside it — never a row around it that holds it too.
				return hit !== null && element.contains(hit);
			},
			[x, y]
		);
	}

	/** True when a fingertip `FINGER_REACH` off-centre in every direction lands on `target`. */
	async function answersAFingertip(target: Locator): Promise<boolean[]> {
		const r = FINGER_REACH;
		return Promise.all(
			[
				[r, 0],
				[-r, 0],
				[0, r],
				[0, -r]
			].map(([dx, dy]) => landsOn(target, dx, dy))
		);
	}

	test('a to-do’s tick box answers a fingertip around it', async ({ page }) => {
		const letters = runLetters();
		await addPerson(page, 'Tippa', `Haldimann${letters}`);
		const card = page.locator('#section-todos');
		await card.getByRole('button', { name: 'Add', exact: true }).click();
		const form = card.getByTestId('todo-form');
		const title = `Bring the ladder back ${letters}`;
		await form.getByLabel('What is still to do?').fill(title);
		await form.getByRole('button', { name: 'Save' }).click();

		const tick = page.getByRole('checkbox', { name: `Done: ${title}`, exact: true });
		await expect(tick).toBeVisible();
		// The label around the box is what takes the tap.
		expect(await answersAFingertip(tick.locator('xpath=..'))).toEqual([true, true, true, true]);
	});

	test('a moment’s pencil and × each answer a fingertip, never the other’s', async ({ page }) => {
		const letters = runLetters();
		await addPerson(page, 'Tippa', `Wenger${letters}`);
		await page.goto(`${new URL(page.url()).pathname}/journal`);
		await appReady(page);
		const text = `Coffee on the terrace ${letters}`;
		await page.getByRole('button', { name: 'Write a moment' }).click();
		await page.getByRole('textbox', { name: 'Moment', exact: true }).fill(text);
		await page.getByRole('button', { name: 'Save moment' }).click();
		await expect(page.getByText(text)).toBeVisible();

		const edit = page.getByRole('button', { name: 'Edit moment' });
		const remove = page.getByRole('button', { name: 'Delete moment' });
		expect(await answersAFingertip(edit)).toEqual([true, true, true, true]);
		expect(await answersAFingertip(remove)).toEqual([true, true, true, true]);

		// Their squares sit side by side: the gap between the two is wider than the reach.
		const [a, b] = [await edit.boundingBox(), await remove.boundingBox()];
		if (!a || !b) throw new Error('the moment’s actions have no layout');
		expect(b.x + b.width / 2 - (a.x + a.width / 2)).toBeGreaterThanOrEqual(2 * 22);
	});

	test('Add person’s share switch is a full fingertip tall', async ({ page }) => {
		await page.goto('/contacts/new');
		await appReady(page);
		const share = page.getByRole('switch', { name: 'Share with household' });
		await expect(share).toBeChecked();
		const pill = await share.locator('xpath=..').boundingBox();
		if (!pill) throw new Error('the share switch has no layout');
		expect(pill.height).toBeGreaterThanOrEqual(44);
	});
});
