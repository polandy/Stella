import { describe, expect, it } from 'bun:test';
import type { SubmitFunction } from '$app/forms';
import { stayOnPage } from './stay-on-page';

type Input = Parameters<SubmitFunction>[0];
type After = Exclude<Awaited<ReturnType<SubmitFunction>>, void>;
type Options = Parameters<Parameters<After>[0]['update']>[0];

const input = {} as Input;

function answer(calls: Options[]): Parameters<After>[0] {
	return {
		formData: new FormData(),
		formElement: {} as HTMLFormElement,
		action: new URL('http://stella.test/settings?/x'),
		result: { type: 'success', status: 200, location: '/settings' },
		update: async (options) => void calls.push(options)
	};
}

async function settle(submit?: SubmitFunction): Promise<Options[]> {
	const calls: Options[] = [];
	const after = await stayOnPage(submit)(input);
	if (after) await after(answer(calls));
	return calls;
}

describe('stayOnPage', () => {
	it('answers on the current page when the form brings no callback', async () => {
		expect(await settle()).toEqual([{ navigate: false }]);
	});

	it('answers on the current page when the callback asks for the default', async () => {
		expect(
			await settle(
				() =>
					({ update }) =>
						update({ reset: false })
			)
		).toEqual([{ navigate: false, reset: false }]);
	});

	it('leaves a navigation the form asks for itself', async () => {
		expect(
			await settle(
				() =>
					({ update }) =>
						update({ navigate: true })
			)
		).toEqual([{ navigate: true }]);
	});

	it('updates nothing when the callback handles the answer alone', async () => {
		expect(await settle(() => () => {})).toEqual([]);
	});
});
