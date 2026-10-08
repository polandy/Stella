import { expect, test, type Page } from '@playwright/test';
import { tarEntry, tarTrailer } from '../src/lib/archive/tar';
import { appReady, signIn } from './app';

/*
 * Gifts from before the gift record (docs/02 §2.25.4): Monica gift notes and touchpoints of the
 * former kind *gift* become gift records, and *Log contact* no longer offers *Gift*. Written
 * after the owner tried the conversion in the app (docs/08 §8.4.1).
 *
 * The e2e database starts from today's seed, which holds no such rows; the way to put them in
 * front of the running app is the one an operator has too — restoring an archive from before,
 * after which the same conversion every start runs goes over it. The archive is made here: one
 * YAML document (JSON is YAML) in a tar, with people of its own whose ids carry this run's
 * letters, so a second run and every other spec never meet them.
 */

/** Six letters no other attempt shares. */
function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		String.fromCharCode(97 + (byte % 26))
	).join('');
}

const letters = runLetters();
const HILDE = `e2e-gifts-${letters}-hilde`;
const OTTO = `e2e-gifts-${letters}-otto`;

/** An archive as an older Stella wrote it: a gift note, a rewritten one and a gift touchpoint. */
function olderArchive(): Buffer {
	const person = (id: string, first: string) => ({
		id,
		display_name: `${first} Quellwitz${letters}`,
		first_name: first,
		last_name: `Quellwitz${letters}`
	});
	const document = {
		format: 'stella-archive',
		version: 1,
		household: 'An older Stella',
		people: [
			{
				...person(HILDE, 'Hilde'),
				notes: [
					{
						id: `monica:gift:${letters}1`,
						title: 'Gift',
						body: '🎁 **Teapot, cast iron** — offered, 12 October 2023\n\nShe saw it at the market.',
						created_at: '2024-01-05T10:00:00Z'
					},
					{
						// Its first line was rewritten by hand, so it stays the note it is.
						id: `monica:gift:${letters}2`,
						title: 'Gift',
						body: 'Garden gloves — she wants the green ones',
						created_at: '2024-01-05T10:00:00Z'
					}
				],
				interactions: [
					{
						id: `e2e-gifts-${letters}-touch`,
						kind: 'gift',
						title: 'Board game for the two of them',
						description: 'Wingspan, with the expansion',
						happened_at: '2024-05-02',
						participants: [OTTO],
						created_at: '2024-05-02T18:00:00Z'
					}
				]
			},
			person(OTTO, 'Otto')
		]
	};
	const bytes = new TextEncoder().encode(JSON.stringify(document));
	return Buffer.concat([tarEntry('household.yaml', bytes, 1_700_000_000), tarTrailer()]);
}

async function restore(page: Page, buffer: Buffer): Promise<void> {
	await page.goto('/settings/import/archive');
	await page
		.locator('input[name=archive]')
		.setInputFiles({ name: 'older-stella.tar', mimeType: 'application/x-tar', buffer });
	await page.getByRole('button', { name: 'Restore' }).click();
	await expect(page.getByTestId('restore-report')).toBeVisible();
}

async function openGiven(page: Page, contactId: string) {
	await page.goto(`/contacts/${encodeURIComponent(contactId)}`);
	await appReady(page);
	const card = page.locator('#section-gifts');
	await card.getByRole('tab', { name: 'Given' }).click();
	return card.getByRole('tabpanel');
}

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('restores an older archive’s gift note and gift touchpoint as gifts, and says so', async ({
	page
}) => {
	const archive = olderArchive();
	await restore(page, archive);
	await expect(page.getByTestId('restore-report')).toContainText(
		'The archive held gifts as Monica notes or gift touchpoints; they are now 3 gifts on the Gifts cards.'
	);

	const hilde = await openGiven(page, HILDE);
	await expect(hilde).toContainText('Teapot, cast iron');
	await expect(hilde).toContainText('12 October 2023');
	await expect(hilde).toContainText('She saw it at the market.');
	await expect(hilde).toContainText('Board game for the two of them');
	await expect(hilde).toContainText('Wingspan, with the expansion');

	// The story shows the touchpoint's gift on its old day, read from the gift.
	const story = page.getByTestId('story-timeline');
	await expect(story).toContainText('Given');
	await expect(story).toContainText('Board game for the two of them');

	// The rewritten note is still a note; the converted one is not.
	const notes = page.locator('#section-notes');
	await expect(notes).toContainText('Garden gloves — she wants the green ones');
	await expect(notes).not.toContainText('Teapot, cast iron');

	// A gift belongs to one person: the participant has the touchpoint's gift too.
	const otto = await openGiven(page, OTTO);
	await expect(otto).toContainText('Board game for the two of them');
});

test('writes no gift twice when the same older archive is restored again', async ({ page }) => {
	await restore(page, olderArchive());
	// Positive control: the restore ran over these people.
	await expect(page.getByTestId('restore-report').locator('[data-kind="contact"]')).toContainText(
		'already here'
	);
	// The note and touchpoint came back and were removed again, but no gift is new.
	await expect(page.getByTestId('restore-report')).not.toContainText('on the Gifts card');

	const hilde = await openGiven(page, HILDE);
	await expect(hilde.getByText('Teapot, cast iron')).toHaveCount(1);
	await expect(hilde.getByText('Board game for the two of them')).toHaveCount(1);
});

test('offers no Gift kind under Log contact; a present goes on the Gifts card', async ({
	page
}) => {
	await page.goto(`/contacts/${encodeURIComponent(OTTO)}`);
	await appReady(page);
	await page.locator('#section-story').getByRole('button', { name: 'Log contact' }).click();
	const kinds = page.locator('select[name="kind"] option');
	await expect(kinds).toHaveText([
		'Met in person',
		'Call',
		'Video call',
		'Message',
		'Letter',
		'Other'
	]);
	await expect(page.locator('#section-gifts').getByRole('button', { name: 'Given' })).toBeVisible();
});
