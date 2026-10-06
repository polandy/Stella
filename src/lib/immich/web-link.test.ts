import { describe, expect, it } from 'bun:test';
import { immichPersonUrl, immichPhotoUrl } from './web-link';

const ID = '0b1e2a3c-4d5e-4f60-8a1b-2c3d4e5f6a70';

describe('immichPersonUrl', () => {
	it('points at the person in Immich’s web app', () => {
		expect(immichPersonUrl('https://immich.example.com', ID)).toBe(
			`https://immich.example.com/people/${ID}`
		);
	});

	it('does not double a trailing slash', () => {
		expect(immichPersonUrl('https://immich.example.com/', ID)).toBe(
			`https://immich.example.com/people/${ID}`
		);
	});

	it('keeps an Immich served under a path', () => {
		expect(immichPersonUrl('https://example.com/photos', ID)).toBe(
			`https://example.com/photos/people/${ID}`
		);
	});

	it('escapes the id, so it cannot leave the people path', () => {
		expect(immichPersonUrl('https://immich.example.com', '../admin')).toBe(
			'https://immich.example.com/people/..%2Fadmin'
		);
	});
});

describe('immichPhotoUrl', () => {
	const ASSET = '00000000-4d5e-4f60-8a1b-2c3d4e5f6a70';

	it('points at the photo in Immich’s web app', () => {
		expect(immichPhotoUrl('https://immich.example.com/', ASSET)).toBe(
			`https://immich.example.com/photos/${ASSET}`
		);
	});

	it('escapes the id, so it cannot leave the photos path', () => {
		expect(immichPhotoUrl('https://immich.example.com', '../admin')).toBe(
			'https://immich.example.com/photos/..%2Fadmin'
		);
	});
});
