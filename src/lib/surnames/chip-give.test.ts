import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import { ActionFailedError } from '$lib/undo/submit-action';
import {
	giveFromChip,
	LAST_NAME_CHANGED_STATUS,
	takeBackChip,
	type ChipGive,
	type ChipGiveDeps
} from './chip-give';

/*
 * The profile's last-name chip (docs/02 §2.2.4.6): a tap saves at once under the shell's
 * activity indicator, the page reloads, and a toast offers *Undo*, which takes the name back
 * the same way. Every step is recorded in order by the fakes, so the spinner's span — from the
 * tap until the reload has landed — is asserted directly rather than waited for.
 */

const t = createTranslator('en');

const give: ChipGive = {
	page: '/contacts/anna',
	contactId: 'anna',
	lastName: 'Brunner',
	before: { displayName: 'Anna', firstName: null }
};

interface Notice {
	text: string;
	takeBack?: () => void;
}

function fakes(answers: { give?: Error; takeBack?: Error } = {}) {
	const steps: string[] = [];
	const sent: { action: string; fields: [string, string][] }[] = [];
	const notices: Notice[] = [];
	const deps: ChipGiveDeps = {
		send: async (action, body) => {
			steps.push(`send ${action}`);
			sent.push({ action, fields: [...body.entries()].map(([k, v]) => [k, String(v)]) });
			const failure = action.endsWith('takeBackLastName') ? answers.takeBack : answers.give;
			if (failure) throw failure;
		},
		refresh: async () => {
			steps.push('refresh');
		},
		pending: {
			begin: () => steps.push('begin'),
			end: () => steps.push('end')
		},
		notify: (text, takeBack) => {
			steps.push('notify');
			notices.push({ text, takeBack });
		},
		t
	};
	return { deps, steps, sent, notices };
}

describe('giveFromChip', () => {
	it('saves at once, keeps the spinner up until the page has reloaded, then offers Undo', async () => {
		const f = fakes();

		expect(await giveFromChip(f.deps, give)).toBe(true);

		expect(f.steps).toEqual([
			'begin',
			'send /contacts/anna?/setLastNames',
			'refresh',
			'end',
			'notify'
		]);
		expect(f.sent[0]?.fields).toEqual([
			['contactId', 'anna'],
			['lastName', 'Brunner']
		]);
		expect(f.notices).toEqual([
			{
				text: t('surnames.chipGiven', { name: 'Brunner', person: 'Anna' }),
				takeBack: expect.any(Function)
			}
		]);
	});

	it('says so when the save fails, and offers no Undo for what was not saved', async () => {
		const f = fakes({ give: new ActionFailedError('?/setLastNames', 500) });

		expect(await giveFromChip(f.deps, give)).toBe(false);

		expect(f.steps).toEqual(['begin', 'send /contacts/anna?/setLastNames', 'end', 'notify']);
		expect(f.notices).toEqual([{ text: t('surnames.chipFailed'), takeBack: undefined }]);
	});

	it('takes the name back from the toast’s Undo', async () => {
		const f = fakes();
		await giveFromChip(f.deps, give);

		f.notices[0]?.takeBack?.();

		// The take-back starts on the tap: the spinner is up and the request is out.
		expect(f.steps.slice(5)).toEqual(['begin', 'send /contacts/anna?/takeBackLastName']);
	});
});

describe('takeBackChip', () => {
	it('puts the name back as it was under the spinner, and reloads before it ends', async () => {
		const f = fakes();

		expect(await takeBackChip(f.deps, give)).toBe(true);

		expect(f.steps).toEqual(['begin', 'send /contacts/anna?/takeBackLastName', 'refresh', 'end']);
		expect(f.sent[0]?.fields).toEqual([
			['contactId', 'anna'],
			['lastName', 'Brunner'],
			['beforeDisplayName', 'Anna'],
			['beforeFirstName', '']
		]);
		expect(f.notices).toEqual([]);
	});

	it('says the name changed meanwhile when the server refuses to overwrite it', async () => {
		const f = fakes({
			takeBack: new ActionFailedError('?/takeBackLastName', LAST_NAME_CHANGED_STATUS)
		});

		expect(await takeBackChip(f.deps, give)).toBe(false);

		// Reloaded all the same, so the page shows the name as it now stands.
		expect(f.steps).toEqual([
			'begin',
			'send /contacts/anna?/takeBackLastName',
			'refresh',
			'end',
			'notify'
		]);
		expect(f.notices).toEqual([
			{ text: t('errors.contact.lastNameChanged', { name: 'Anna' }), takeBack: undefined }
		]);
	});

	it('reports any other failure as its own', async () => {
		const f = fakes({ takeBack: new Error('offline') });

		expect(await takeBackChip(f.deps, give)).toBe(false);

		expect(f.steps).toEqual(['begin', 'send /contacts/anna?/takeBackLastName', 'end', 'notify']);
		expect(f.notices).toEqual([{ text: t('surnames.chipUndoFailed'), takeBack: undefined }]);
	});
});
