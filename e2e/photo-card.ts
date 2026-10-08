import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { appReady } from './app';

/*
 * The person page's Photos card, for the specs that build one of their own (docs/02 §2.14,
 * §2.24.3): gallery photos uploaded, and a link to the demo Immich face "Luca Widmer" with 210
 * photos. That face is the one no spec keeps linked — the others link a person to it and let go
 * again — so a case here that links it unlinks it afterwards too (`unlinkFace`).
 */

const PIXEL = readFileSync('e2e/fixtures/monica-photos/photos/ottilie-avatar.png');

/** The demo face the Photos card cases link, and how many photos Immich has of it. */
export const CARD_FACE = { name: 'Luca Widmer', photos: 210 } as const;

/** Uploads `count` shared photos to the person on screen through *Add photos*. */
export async function uploadPhotos(page: Page, count: number): Promise<void> {
	await page.getByRole('button', { name: 'Add photos' }).click();
	const form = page.locator('#section-photos form');
	await form.locator('input[name=files]').setInputFiles(
		Array.from({ length: count }, (_, index) => ({
			name: `card-${index}.png`,
			mimeType: 'image/png',
			buffer: PIXEL
		}))
	);
	await form.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByTestId('photo-grid').locator('li[data-source="stella"]')).toHaveCount(
		count
	);
}

/**
 * Links the person on screen to `CARD_FACE` through the Photos card's menu. The picker first
 * searches the person's own name, which no demo face carries; its answer is the settled state
 * the second search starts from. Luca's name is on two faces; Immich answers the one with 210
 * photos first, and the Immich tab's count is what tells a case it got that one.
 */
export async function linkCardFace(page: Page, personName: string): Promise<void> {
	await page.getByRole('button', { name: 'Photo library options' }).click();
	await page.getByRole('menuitem', { name: 'Find in Immich' }).click();
	const picker = page.getByRole('dialog', { name: `Find ${personName} in Immich` });
	await expect(
		picker.getByTestId('immich-faces').or(picker.getByTestId('immich-no-faces'))
	).toBeVisible();
	await picker.getByRole('searchbox', { name: 'Name in Immich' }).fill(CARD_FACE.name);
	await picker.getByRole('button', { name: 'Search' }).click();
	await picker
		.getByRole('button', { name: `Link ${CARD_FACE.name} to ${personName}` })
		.first()
		.click();
	await expect(picker).toBeHidden();
	// The pick is a plain form post, so the page has reloaded and must mount again.
	await appReady(page);
	await expect(photoTab(page, 'Immich')).toHaveText(new RegExp(`^Immich\\s*${CARD_FACE.photos}$`));
}

/** Unlinks the person at `href` through their Photos card, if the case got as far as linking. */
export async function unlinkFace(page: Page, href: string): Promise<void> {
	await page.goto(href);
	await appReady(page);
	await page.getByRole('button', { name: 'Photo library options' }).click();
	const unlinkItem = page.getByRole('menuitem', { name: 'Unlink from Immich' });
	const findItem = page.getByRole('menuitem', { name: 'Find in Immich' });
	await expect(unlinkItem.or(findItem)).toBeVisible();
	if (!(await unlinkItem.isVisible())) return;
	await unlinkItem.click();
	await appReady(page);
	await page.getByRole('button', { name: 'Photo library options' }).click();
	await expect(findItem).toBeVisible();
}

/** One of the Photos card's tabs, by the name it starts with (its count follows). */
export const photoTab = (page: Page, name: 'All' | 'Stella' | 'Immich') =>
	page.getByTestId('photo-tabs').getByRole('tab', { name: new RegExp(`^${name}`) });
