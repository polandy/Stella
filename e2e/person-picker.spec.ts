import { expect, test } from '@playwright/test';
import { openPerson, pickPerson, signIn } from './app';

/*
 * What the person picker promises a screen reader (docs/05 §5.7, §5.9).
 *
 * A `<label>` names its first labelable descendant, and in multiple mode the first one is a
 * chip's remove button rather than the search input — so the field silently lost its name the
 * moment anybody was picked. The callers therefore point their label at it with `for`, and
 * this is the case that says so.
 */

test('keeps its name once a chip is in it, where a wrapping label would have lost it', async ({
	page
}) => {
	await signIn(page);
	// `openPerson` waits for the shell to mount; *Log contact* is a disclosure that does
	// nothing until it has.
	await openPerson(page, /Lena Brunner/);
	await page.getByRole('button', { name: 'Log contact' }).first().click();

	const form = page.locator('form[action="?/logInteraction"]');
	await expect(form).toBeVisible();
	const field = form.getByLabel('Who else was there?');

	// The positive control: with no chip there is nothing to steal the name, so a failure
	// below is about the chip and not about the label being wrong all along.
	await expect(field).toHaveCount(1);

	await pickPerson(field, 'Noah Brunner');
	await expect(form.getByText('Noah Brunner')).toBeVisible();

	// The name survives the chip: still exactly one control answers to it, and it is the one
	// you can type into.
	await expect(field).toHaveCount(1);
	await field.fill('Mia');
	await expect(field).toHaveValue('Mia');
});
