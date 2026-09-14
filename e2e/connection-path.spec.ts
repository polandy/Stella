import { expect, test } from '@playwright/test';
import { openPerson, pickPerson, signIn } from './app';

/*
 * "How are we connected?" asked from a person's card (docs/02 §2.7, docs/05 §5.5). The card
 * holds two hops of the household and the chain usually runs further, so it asks who and
 * hands both ends to the explorer, which traces it on arrival. Written after the maintainer
 * walked it in the running app (docs/08 §8.4.1).
 */

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('asks who from the card and arrives in the graph with the chain already traced', async ({
	page
}) => {
	await openPerson(page, /Lena Brunner/);
	const id = new URL(page.url()).pathname.split('/').pop()!;
	const card = page.locator('#section-relationships');

	await card.getByRole('button', { name: 'How are we connected?' }).click();
	await pickPerson(card.getByLabel('Lena Brunner and…'), 'Vreni Zbinden');
	await card.getByRole('link', { name: 'Trace it' }).click();

	// Both ends travel in the link, so the answer survives a reload or a shared URL.
	await expect(page).toHaveURL(new RegExp(`/graph\\?center=${id}&path=demo-c-`));
	await expect(page.locator('canvas').first()).toBeVisible();

	// The explorer answers with the people in between, not with a "no connection".
	const prompt = page.getByTestId('path-prompt');
	await expect(prompt).toContainText('Lena Brunner');
	await expect(prompt).toContainText('Vreni Zbinden');
	await expect(prompt).toContainText('→');
});

test('the question is not asked in the card that cannot answer it', async ({ page }) => {
	await openPerson(page, /Lena Brunner/);
	const card = page.locator('#section-relationships');

	// The card offers the question and the way into the graph, each with its own icon — but
	// it never draws a path itself: the picker hands the question on.
	await card.getByRole('button', { name: 'How are we connected?' }).click();
	await expect(card.getByRole('button', { name: 'Trace it' })).toBeDisabled();
	await expect(card.getByRole('button', { name: 'Connection path' })).toHaveCount(0);
});
