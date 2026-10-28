import { describe, expect, it } from 'bun:test';
import {
	activeHashtag,
	chooseRow,
	followCaret,
	insertHashtag,
	moveHighlight,
	tagListKey,
	suggestTags,
	tagRows,
	tagsToSave,
	type KnownTag
} from './picker';

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
		expect(suggestTags('H', known).tags.map((t) => t.name)).toEqual([
			'hiking',
			'Holiday',
			'Schule'
		]);
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

describe('tagRows', () => {
	const known = [tag('Holiday', 3), tag('lake', 1)];

	it('lists the matching tags, then the typed name as a new one', () => {
		expect(tagRows(suggestTags('ho', known))).toEqual([
			{ kind: 'tag', tag: known.find((t) => t.key === 'holiday')! },
			{ kind: 'new', name: 'ho' }
		]);
	});

	it('has no new row for a tag the household has', () => {
		expect(tagRows(suggestTags('holiday', known)).map((r) => r.kind)).toEqual(['tag']);
	});

	it('is empty when nothing matches and nothing new can be made', () => {
		expect(tagRows(suggestTags('-', known))).toEqual([]);
	});
});

/*
 * The `#` list as a host drives it (`tag-picker.svelte.ts` only holds this state): follow the
 * caret, move the highlight, write the choice in.
 */
describe('the tag list', () => {
	const known = [tag('Holiday', 3), tag('hiking', 7)];
	const rowsAt = (text: string, caret: number) => {
		const state = followCaret(text, caret);
		return { state, rows: state.active ? tagRows(suggestTags(state.active.query, known)) : [] };
	};

	it('opens on a tag being typed and closes outside one', () => {
		expect(rowsAt('Out #h', 6).rows.map((r) => (r.kind === 'tag' ? r.tag.name : r.name))).toEqual([
			'hiking',
			'Holiday',
			'h'
		]);
		expect(rowsAt('Out #h and on', 13).rows).toEqual([]);
	});

	it('writes the chosen tag in its household spelling', () => {
		const { state, rows } = rowsAt('Out #hol', 8);
		expect(chooseRow('Out #hol', 8, state, rows[0])).toEqual({ text: 'Out #Holiday ', caret: 13 });
	});

	it('moves the highlight round the rows, and back to the top on typing', () => {
		const { state, rows } = rowsAt('#h', 2);
		const last = moveHighlight(state, -1, rows.length);
		expect(last.highlighted).toBe(2);
		expect(chooseRow('#h', 2, last, rows[last.highlighted])).toEqual({ text: '#h ', caret: 3 });
		expect(followCaret('#hik', 4).highlighted).toBe(0);
	});

	it('chooses nothing while closed', () => {
		expect(chooseRow('plain', 5, followCaret('plain', 5), undefined)).toBeNull();
	});
});

describe('tagListKey', () => {
	it('takes the arrows, Enter, Tab and Escape, and leaves the rest to the field', () => {
		expect(['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape', 'a'].map(tagListKey)).toEqual([
			'next',
			'previous',
			'choose',
			'choose',
			'close',
			null
		]);
	});
});
