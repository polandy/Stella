/*
 * Rasterises the SVG documents written by `generate.sh` into the PNGs the manifest lists.
 * Runs *inside* the pinned Playwright image (plain Node, no Bun, no project imports), which
 * is the only place a browser runs on the NixOS host.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const [, , planPath] = process.argv;
const plan = JSON.parse(await readFile(planPath, 'utf8'));

const browser = await chromium.launch();
try {
	for (const { svg, png, edge } of plan) {
		const page = await browser.newPage({
			viewport: { width: edge, height: edge },
			deviceScaleFactor: 1
		});
		// A file:// URL rather than setContent, so the SVG is rendered as a document at its
		// own intrinsic size instead of being laid out inside a page with body margins.
		await page.goto(`file://${svg}`);
		await writeFile(png, await page.screenshot({ omitBackground: false }));
		await page.close();
		console.log(`  ${png}`);
	}
} finally {
	await browser.close();
}
