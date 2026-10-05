import type { FakeImmichLibrary } from '../../immich/fake-gateway';

/*
 * The library the Immich use-case tests start from: the key belongs to Anna, and her Immich
 * knows Bert, Carl and Dora — Dora hidden — and fifteen photos of Bert and Carl together. Each
 * test gets a fresh copy to change.
 */

export const BERT_ID = '0b1e2a3c-4d5e-4f60-8a1b-2c3d4e5f6a70';
export const CARL_ID = '0c2e3a4b-5d6e-4f70-9a2b-3c4d5e6f7a81';
export const DORA_ID = '0d3e4a5b-6c7d-4e80-8b3c-4d5e6f7a8b92';
/** The photos Bert and Carl are in together. */
export const BERT_AND_CARL_ID = '0e4f5a6b-7c8d-4e90-9c4d-5e6f7a8b9ca3';

export function testLibrary(): FakeImmichLibrary {
	return {
		version: { major: 3, minor: 2, patch: 4 },
		owner: { name: 'Anna', email: 'anna@example.test' },
		people: [
			{ id: BERT_ID, name: 'Bert Example', hidden: false, assets: 1284, color: '#8839ef' },
			{ id: CARL_ID, name: 'Carl Example', hidden: false, assets: 7, color: '#40a02b' },
			{ id: DORA_ID, name: 'Dora Example', hidden: true, assets: 30, color: '#df8e1d' }
		],
		together: [{ id: BERT_AND_CARL_ID, personIds: [BERT_ID, CARL_ID], assets: 15, color: '#04a5e5' }]
	};
}
