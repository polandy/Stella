import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { signIn } from './app';
import { arrangeBy, settled } from './graph-canvas';

/*
 * Exporting the family tree as a picture (docs/02 §2.7, docs/design/screens/graph.md).
 * Written after the owner tried the Export dialog in the running app (docs/08 §8.4.1).
 *
 * The print path hands the picture to the browser's own print dialog, which a spec cannot
 * drive; the PNG download draws the very same scene, so it stands for both.
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

test('the tree is downloaded as a PNG named after the title given', async ({ page }) => {
	await signIn(page);
	await page.goto('/graph?center=demo-c-markus');
	await expect(page.locator('canvas').first()).toBeVisible();
	await settled(page);
	await arrangeBy(page, 'Tree');
	await settled(page);

	await page.getByTestId('tree-export-open').click();
	const dialog = page.getByTestId('tree-export');
	await expect(dialog.getByRole('heading', { name: 'Export tree' })).toBeVisible();
	await dialog.getByLabel('Title', { exact: true }).fill('Müller family');

	const [download] = await Promise.all([
		page.waitForEvent('download'),
		page.getByTestId('tree-export-go').click()
	]);
	expect(download.suggestedFilename()).toBe('müller-family.png');

	const bytes = await readFile(await download.path());
	expect([...bytes.subarray(0, PNG_SIGNATURE.length)]).toEqual(PNG_SIGNATURE);
	// A whole tree with its header, not an empty canvas — and not a runaway render either.
	expect(bytes.length).toBeGreaterThan(20_000);
	expect(bytes.length).toBeLessThan(20_000_000);
	// The IHDR chunk follows the signature: width and height as big-endian 32-bit numbers.
	const width = bytes.readUInt32BE(16);
	const height = bytes.readUInt32BE(20);
	expect(width).toBeGreaterThan(400);
	expect(height).toBeGreaterThan(200);
	await expect(dialog).toBeHidden();
});
