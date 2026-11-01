import { describe, expect, it } from 'bun:test';
import { partsFromAddress, sheetAddressFor } from './address';

describe('a share the server took, without the app on the device', () => {
	it('opens the sheet on its words, and the sheet reads them back', () => {
		const address = sheetAddressFor({
			title: 'Lego',
			text: 'Look & see',
			url: 'https://x.example/?a=1',
			photoCount: 0
		});

		expect(partsFromAddress(new URL(address, 'https://stella.example').searchParams)).toEqual({
			parts: { title: 'Lego', text: 'Look & see', url: 'https://x.example/?a=1', photoCount: 0 },
			photosLeftBehind: false
		});
	});

	it('says photos were left behind, since only the app can hold them', () => {
		const address = sheetAddressFor({ title: '', text: '', url: '', photoCount: 2 });

		expect(partsFromAddress(new URL(address, 'https://stella.example').searchParams)).toEqual({
			parts: { title: '', text: '', url: '', photoCount: 0 },
			photosLeftBehind: true
		});
	});

	it('leaves empty fields out of the address', () => {
		expect(sheetAddressFor({ title: '', text: 'hi', url: '', photoCount: 0 })).toBe(
			'/share?text=hi'
		);
	});
});
