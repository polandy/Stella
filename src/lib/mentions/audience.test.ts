import { describe, expect, it } from 'bun:test';
import { allowedForAudience } from './audience';

/*
 * The one rule behind both the @-picker and the save-time resolver (docs/02 §2.20.1): a shared
 * text may only name people the whole household can see.
 */

const people = [
	{ id: 'shared-1', visibility: 'shared' as const },
	{ id: 'private-1', visibility: 'private' as const },
	{ id: 'shared-2', visibility: 'shared' as const }
];

describe('allowedForAudience', () => {
	it('keeps a shared text to the people the household can see', () => {
		expect(allowedForAudience(people, 'shared').map((p) => p.id)).toEqual(['shared-1', 'shared-2']);
	});

	it('lets a private text name anyone its author can see', () => {
		expect(allowedForAudience(people, 'private').map((p) => p.id)).toEqual([
			'shared-1',
			'private-1',
			'shared-2'
		]);
	});

	it('hands back a copy, so narrowing never edits the caller’s list', () => {
		const all = allowedForAudience(people, 'private');
		all.pop();
		expect(people).toHaveLength(3);
	});
});
