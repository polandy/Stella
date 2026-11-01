import { describe, expect, it } from 'bun:test';
import {
	choicesFor,
	giftIdeaFrom,
	MAX_SHARED_PHOTOS,
	momentBodyFrom,
	readShared,
	todoTitleFrom
} from './shared';

const nothing = { title: '', text: '', url: '', photoCount: 0 };

describe('what was shared', () => {
	it('reads photos as photos, whatever text came along with them', () => {
		expect(readShared({ ...nothing, text: 'from my gallery', photoCount: 3 })).toEqual({
			kind: 'photos',
			count: 3,
			dropped: 0
		});
	});

	it(`keeps the first ${MAX_SHARED_PHOTOS} photos and says how many it left out`, () => {
		expect(readShared({ ...nothing, photoCount: 13 })).toEqual({
			kind: 'photos',
			count: MAX_SHARED_PHOTOS,
			dropped: 3
		});
	});

	it('takes the link from its own field', () => {
		const shared = readShared({
			...nothing,
			title: 'Lego Botanicals',
			url: 'https://shop.example/lego'
		});

		expect(shared).toEqual({
			kind: 'words',
			words: 'Lego Botanicals',
			link: 'https://shop.example/lego'
		});
	});

	it('finds the link in the text, where Android usually puts it', () => {
		const shared = readShared({
			...nothing,
			title: 'Shop page',
			text: 'Look at this https://shop.example/lego?ref=share'
		});

		expect(shared).toEqual({
			kind: 'words',
			words: 'Look at this',
			link: 'https://shop.example/lego?ref=share'
		});
	});

	it('falls back on the title when the text was only the link', () => {
		const shared = readShared({
			...nothing,
			title: 'Lego Botanicals',
			text: 'https://shop.example/lego'
		});

		expect(shared).toEqual({
			kind: 'words',
			words: 'Lego Botanicals',
			link: 'https://shop.example/lego'
		});
	});

	it('reads plain text without a link', () => {
		expect(readShared({ ...nothing, text: '  Ask Mia about the trip  ' })).toEqual({
			kind: 'words',
			words: 'Ask Mia about the trip',
			link: null
		});
	});

	it('does not take something that is not a web address for a link', () => {
		const shared = readShared({ ...nothing, url: 'javascript:alert(1)', text: 'hi' });

		expect(shared).toEqual({ kind: 'words', words: 'hi', link: null });
	});

	it('says when nothing came at all', () => {
		expect(readShared(nothing)).toEqual({ kind: 'nothing' });
		expect(readShared({ ...nothing, title: '  ', text: '\n' })).toEqual({ kind: 'nothing' });
	});
});

describe('what the shared words become', () => {
	const words = {
		kind: 'words',
		words: 'Lego Botanicals',
		link: 'https://shop.example/lego'
	} as const;
	const linkOnly = { kind: 'words', words: '', link: 'https://shop.example/lego' } as const;

	it('a moment carries the words and the link below them', () => {
		expect(momentBodyFrom(words)).toBe('Lego Botanicals\n\nhttps://shop.example/lego');
		expect(momentBodyFrom(linkOnly)).toBe('https://shop.example/lego');
	});

	it('a gift idea takes the words as its title and keeps the link apart', () => {
		expect(giftIdeaFrom(words)).toEqual({
			title: 'Lego Botanicals',
			url: 'https://shop.example/lego'
		});
	});

	it('a gift idea with nothing but a link is named by the link', () => {
		expect(giftIdeaFrom(linkOnly)).toEqual({
			title: 'https://shop.example/lego',
			url: 'https://shop.example/lego'
		});
	});

	it('a to-do is one line, with the link at its end', () => {
		const multiLine = {
			kind: 'words',
			words: 'Ask Mia\nabout the trip',
			link: 'https://x.example'
		} as const;

		expect(todoTitleFrom(multiLine)).toBe('Ask Mia about the trip https://x.example');
		expect(todoTitleFrom({ kind: 'words', words: 'Call back', link: null })).toBe('Call back');
	});
});

describe('where the shared things can go', () => {
	it('offers a moment first for words, then a gift idea and a to-do', () => {
		const choices = choicesFor(readShared({ ...nothing, text: 'hello' }), { reachable: true });

		expect(choices.map((c) => c.id)).toEqual(['moment', 'gift', 'todo']);
		expect(choices.every((c) => c.blockedBy === null)).toBe(true);
	});

	it('keeps every choice for words open offline, since each waits on the device', () => {
		const choices = choicesFor(readShared({ ...nothing, text: 'hello' }), { reachable: false });

		expect(choices.every((c) => c.blockedBy === null)).toBe(true);
	});

	it('offers the gallery first for photos, and one photo as the profile photo', () => {
		const choices = choicesFor(readShared({ ...nothing, photoCount: 1 }), { reachable: true });

		expect(choices).toEqual([
			{ id: 'gallery', blockedBy: null },
			{ id: 'avatar', blockedBy: null }
		]);
	});

	it('has no profile photo for several photos', () => {
		const choices = choicesFor(readShared({ ...nothing, photoCount: 2 }), { reachable: true });

		expect(choices).toContainEqual({ id: 'avatar', blockedBy: 'severalPhotos' });
	});

	it('needs a connection for the profile photo, which is not kept on the device', () => {
		const choices = choicesFor(readShared({ ...nothing, photoCount: 1 }), { reachable: false });

		expect(choices).toEqual([
			{ id: 'gallery', blockedBy: null },
			{ id: 'avatar', blockedBy: 'offline' }
		]);
	});

	it('offers nothing when nothing came', () => {
		expect(choicesFor({ kind: 'nothing' }, { reachable: true })).toEqual([]);
	});
});
