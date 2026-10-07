import { expect, test, type Page } from '@playwright/test';
import { appReady, signIn } from './app';
import { personIdOf, seedHousehold } from './seed';

/*
 * The rest of the UX review in #292 (docs/05 §5.5, §5.7; docs/02 §2.24): a stream row another
 * member wrote carries that member's small face on its subject's, the Photos card's menu is
 * named for the photo library, and an in-place value's pencil follows its last word. Written
 * after the owner tried it in the app (docs/08 §8.4.1).
 *
 * The demo household has two members, the admin this suite signs in as and Nina Brunner, who
 * wrote a journal entry and logged a video call about Hans Brunner; every other spec writes as
 * the admin, so Nina's rows are stable. A household of one shows no badge at all — the suite
 * has only the demo household, so that side is `actor-badge.test.ts`. The pencil case seeds a
 * person of its own under this attempt's letters.
 */

const PIXEL_9_PRO = { width: 412, height: 915 };
/** A phone as the browser reports one: touch, and a coarse pointer. */
const PHONE = { viewport: PIXEL_9_PRO, hasTouch: true, isMobile: true };

const NINA = 'Nina Brunner';
const NINA_ENTRY = 'sharpened every knife';
const NINA_CALL = 'Video call with the kids';

/** Six letters no other attempt shares. */
function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		String.fromCharCode(97 + (byte % 26))
	).join('');
}

const filterBar = (page: Page) => page.getByRole('navigation', { name: 'Filter the stream' });
const chip = (page: Page, name: string) => filterBar(page).getByRole('link', { name, exact: true });
const streamItems = (page: Page) => page.getByTestId('stream').locator('article');

test.describe('who wrote a stream row', () => {
	test.beforeEach(async ({ page }) => {
		await signIn(page);
	});

	test("puts the member's face on the subject's, on rows another member wrote", async ({
		page
	}) => {
		// Narrowed to Nina, so her rows are on the first page however much the suite has written.
		await chip(page, NINA).click();
		await expect(chip(page, NINA)).toHaveAttribute('aria-current', 'true');

		for (const text of [NINA_ENTRY, NINA_CALL]) {
			const row = streamItems(page).filter({ hasText: text });
			await expect(row).toHaveCount(1);
			await expect(row.getByTestId('actor-badge')).toHaveCount(1);
		}
	});

	test('leaves the reader’s own rows without it', async ({ page }) => {
		await chip(page, 'You').click();
		await expect(chip(page, 'You')).toHaveAttribute('aria-current', 'true');
		await chip(page, 'Moments').click();
		await expect(chip(page, 'Moments')).toHaveAttribute('aria-current', 'true');

		// The rows must be there before their badges can be said to be missing (docs/08 §8.4).
		await expect(streamItems(page).first()).toBeVisible();
		await expect(page.getByTestId('stream').getByTestId('actor-badge')).toHaveCount(0);
	});
});

test('names the Photos card’s menu for the photo library, its items for Immich', async ({
	page
}) => {
	await signIn(page);
	await page.goto('/contacts/demo-c-markus');
	await appReady(page);

	const trigger = page.getByRole('button', { name: 'Photo library options' });
	await expect(trigger).toHaveText('Photo library');
	await trigger.click();
	await expect(page.getByRole('menuitem', { name: /Immich/ }).first()).toBeVisible();
});

test.describe('a value that wraps, on a phone', () => {
	test.use(PHONE);

	test('carries its pencil right after its last word, on its last line', async ({ page }) => {
		const name = `Ottilie Wrapsby${runLetters()}`;
		await signIn(page);
		await seedHousehold(
			page,
			[name],
			[],
			{},
			[],
			[],
			[],
			{},
			{
				[name]: {
					title: 'Senior structural engineer for timber bridges',
					company: 'Rytz + Partner AG'
				}
			}
		);
		await page.goto(`/contacts/${personIdOf(name)}`);
		await appReady(page);
		const button = page.locator('[data-fact="job"] button');
		await expect(button.getByTestId('person-job')).toContainText('timber bridges');

		const geometry = await button.evaluate((el) => {
			const text = el.querySelector('[data-testid="person-job"]');
			const pencil = el.querySelector('.edit-pencil');
			if (!text || !pencil) throw new Error('The job has no value or no pencil');
			const range = document.createRange();
			range.selectNodeContents(text);
			const lines = [...range.getClientRects()].filter((rect) => rect.width > 0);
			const last = lines[lines.length - 1];
			const mark = pencil.getBoundingClientRect();
			return {
				lines: new Set(lines.map((rect) => Math.round(rect.top))).size,
				gap: mark.left - last.right,
				middle: (mark.top + mark.bottom) / 2,
				lastTop: last.top,
				lastBottom: last.bottom
			};
		});

		// Only a value that wraps can push its pencil to the edge, so this one must.
		expect(geometry.lines).toBeGreaterThan(1);
		expect(geometry.gap).toBeGreaterThanOrEqual(0);
		expect(geometry.gap).toBeLessThan(12);
		expect(geometry.middle).toBeGreaterThan(geometry.lastTop);
		expect(geometry.middle).toBeLessThan(geometry.lastBottom);
	});
});
