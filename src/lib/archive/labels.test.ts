import { describe, expect, it } from 'bun:test';
import { countLabel, summariseRestore } from './labels';

/*
 * The words the restore report is read in (docs/02 §2.15) — the report comes back keyed by
 * table name, and nobody reads "journal_entry: 4".
 */

describe('countLabel', () => {
	it('uses the singular for one and the plural for the rest', () => {
		expect(countLabel('contact', 1)).toBe('1 person');
		expect(countLabel('contact', 12)).toBe('12 people');
		expect(countLabel('journal_entry', 2)).toBe('2 journal entries');
	});

	it('still says something for a table it has no words for', () => {
		expect(countLabel('something_new', 3)).toBe('3 × something_new');
	});
});

describe('summariseRestore', () => {
	it('reads people first, then what hangs off them', () => {
		const lines = summariseRestore({ note: 2, contact: 3 }, {});
		expect(lines.map((l) => l.table)).toEqual(['contact', 'note']);
	});

	it('keeps a kind that was entirely already here, which is the answer to a second import', () => {
		const lines = summariseRestore({ contact: 0 }, { contact: 12 });
		expect(lines).toEqual([{ table: 'contact', label: 'people', added: 0, skipped: 12 }]);
	});

	it('leaves out a kind the archive had none of', () => {
		expect(summariseRestore({ contact: 1 }, { contact: 0 }).map((l) => l.table)).toEqual([
			'contact'
		]);
	});
});
