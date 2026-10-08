import { describe, expect, it } from 'bun:test';
import { avatarChoices } from './avatar-chooser';

/*
 * What tapping a person's picture offers (docs/02 §2.14, §2.24.6): a file straight away when there
 * is nothing else to choose from, else a chooser with a file, their group photos and Immich.
 */

describe('avatarChoices', () => {
	it('goes straight to a file without Immich and without group photos, as it always did', () => {
		expect(avatarChoices({ groupPhotos: 0, immich: null })).toEqual({
			chooser: false,
			immich: null
		});
	});

	it('opens the chooser for group photos alone, without an Immich section', () => {
		expect(avatarChoices({ groupPhotos: 2, immich: null })).toEqual({
			chooser: true,
			immich: null
		});
	});

	it('always opens the chooser when Immich is there, even without group photos', () => {
		expect(avatarChoices({ groupPhotos: 0, immich: { linked: true } })).toEqual({
			chooser: true,
			immich: 'photos'
		});
		expect(avatarChoices({ groupPhotos: 3, immich: { linked: true } })).toEqual({
			chooser: true,
			immich: 'photos'
		});
	});

	it('offers to find an unlinked person in Immich, where a linked one shows their photos', () => {
		expect(avatarChoices({ groupPhotos: 0, immich: { linked: false } })).toEqual({
			chooser: true,
			immich: 'find'
		});
	});
});
