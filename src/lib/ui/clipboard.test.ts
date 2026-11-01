import { describe, expect, test } from 'bun:test';
import { copyText, type ClipboardHost } from './clipboard';

function host(over: Partial<ClipboardHost> = {}) {
	const written: string[] = [];
	const selected: string[] = [];
	const value: ClipboardHost = {
		clipboard: {
			writeText: async (text) => {
				written.push(text);
			}
		},
		copyBySelection: (text) => {
			selected.push(text);
			return true;
		},
		...over
	};
	return { value, written, selected };
}

describe('copyText', () => {
	test('uses the Clipboard API where there is one', async () => {
		const h = host();
		expect(await copyText('secret', h.value)).toBe(true);
		expect(h.written).toEqual(['secret']);
		expect(h.selected).toEqual([]);
	});

	test('copies through a selection on a plain-http page, which has no Clipboard API', async () => {
		const h = host({ clipboard: undefined });
		expect(await copyText('secret', h.value)).toBe(true);
		expect(h.selected).toEqual(['secret']);
	});

	test('falls back to the selection when the Clipboard API refuses', async () => {
		const h = host({
			clipboard: {
				writeText: async () => {
					throw new DOMException('denied', 'NotAllowedError');
				}
			}
		});
		expect(await copyText('secret', h.value)).toBe(true);
		expect(h.selected).toEqual(['secret']);
	});

	test('says so when neither route works', async () => {
		const h = host({ clipboard: undefined, copyBySelection: () => false });
		expect(await copyText('secret', h.value)).toBe(false);
	});
});
