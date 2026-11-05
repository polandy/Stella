import { expect, test } from '@playwright/test';
import { signIn } from './app';
import { DOCUMENT_ENTRY } from '../src/lib/server/domain/archive/archive';
import { tarEntry, tarTrailer } from '../src/lib/archive/tar';
import { ARCHIVE_FORMAT, ARCHIVE_VERSION } from '../src/lib/server/domain/archive/document';

/*
 * Rows a restore cannot hang anywhere are named as left out, never counted as already here
 * (docs/02 §2.15). Written after the owner checked the restore in the running app
 * (docs/08 §8.4.1).
 *
 * A hand-edited archive with two circles nested in each other: neither has a parent the
 * database can hold, so both are left out, while a third circle beside them comes in. The ids
 * carry letters no other run shares, so the control circle is added on every run, not found
 * already here from the one before.
 */

function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		String.fromCharCode(97 + (byte % 26))
	).join('');
}

function circle(id: string, name: string, parent: string | null) {
	return { id, name, parent, start: null, end: null, visibility: 'shared', members: [] };
}

function archiveWithACircleCycle(letters: string): Buffer {
	const document = {
		format: ARCHIVE_FORMAT,
		version: ARCHIVE_VERSION,
		household: 'a hand-edited Stella',
		people: [],
		circles: [
			circle(`e2e-left-out-hen-${letters}`, `Hen ${letters}`, `e2e-left-out-egg-${letters}`),
			circle(`e2e-left-out-egg-${letters}`, `Egg ${letters}`, `e2e-left-out-hen-${letters}`),
			circle(`e2e-left-out-nest-${letters}`, `Nest ${letters}`, null)
		]
	};
	const text = new TextEncoder().encode(JSON.stringify(document));
	return Buffer.concat([tarEntry(DOCUMENT_ENTRY, text, 0), tarTrailer()]);
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('names the circles it left out instead of counting them as already here', async ({ page }) => {
	await page.goto('/settings/import/archive');
	await page.locator('input[name=archive]').setInputFiles({
		name: 'hand-edited.tar',
		mimeType: 'application/x-tar',
		buffer: archiveWithACircleCycle(runLetters())
	});
	await page.getByRole('button', { name: 'Restore' }).click();

	const report = page.getByTestId('restore-report');
	// Positive control: the circle with somewhere to hang came in.
	await expect(report.locator('[data-kind="circle"]')).toContainText('1 added');
	await expect(report.locator('[data-kind="circle"]')).not.toContainText('already here');
	await expect(report).toContainText('2 circles were left out: what they belong to is not here.');
});
