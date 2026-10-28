import { describe, expect, it } from 'bun:test';
import { activeHashtag, insertHashtag, suggestTags, tagsToSave, type KnownTag } from './picker';

const tag = (name: string, count: number, onlyPrivate = false): KnownTag => ({
	name,
	key: name.toLowerCase(),
	count,
	onlyPrivate
});

describe('activeHashtag', () => {
	it('finds the tag being typed at the caret', () => {
		expect(activeHashtag('Lovely day #hol', 15)).toEqual({ start: 11, query: 'hol' });
	});

	it('opens on a bare #', () => {
		expect(activeHashtag('Lovely #', 8)).toEqual({ start: 7, query: '' });
	});

	it('stays shut mid-word, after an escape, or once a space follows', () => {
		expect(activeHashtag('mail#x', 6)).toBeNull();
		expect(activeHashtag('\\#x', 3)).toBeNull();
		expect(activeHashtag('#lake ', 6)).toBeNull();
	});
});

describe('suggestTags', () => {
	const known = [tag('Holiday', 3), tag('hiking', 7), tag('lake', 1), tag('Schule', 2, true)];

	it('offers every tag, most used first, on a bare #', () => {
		expect(suggestTags('', known).tags.map((t) => t.name)).toEqual([
			'hiking',
			'Holiday',
			'Schule',
			'lake'
		]);
	});

	it('ranks name starts before inner matches, case folded', () => {
		expect(suggestTags('H', known).tags.map((t) => t.name)).toEqual(['hiking', 'Holiday', 'Schule']);
		expect(suggestTags('ul', known).tags.map((t) => t.name)).toEqual(['Schule']);
	});

	it('offers a new tag only for a name nobody uses yet', () => {
		expect(suggestTags('holi', known).create).toBe('holi');
		expect(suggestTags('HOLIDAY', known).create).toBeNull();
		expect(suggestTags('', known).create).toBeNull();
	});

	it('offers no new tag for what would not read as one', () => {
		expect(suggestTags('2026', known).create).toBeNull();
	});
});

describe('insertHashtag', () => {
	it('replaces what was typed with the chosen tag and a space', () => {
		expect(insertHashtag('A #ho day', { start: 2, query: 'ho' }, 5, 'Holiday')).toEqual({
			text: 'A #Holiday  day',
			caret: 11
		});
	});
});

describe('tagsToSave', () => {
	it('lists what the text will save, marking the tags nobody uses yet', () => {
		expect(tagsToSave('#holiday by the #Pier', [tag('Holiday', 3)])).toEqual([
			{ name: 'Holiday', isNew: false },
			{ name: 'Pier', isNew: true }
		]);
	});
});
