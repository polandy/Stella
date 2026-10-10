import { describe, expect, it } from 'bun:test';
import { lastNamesFacts, noticeContentOf, removalFacts, renameFacts } from './notices';

/*
 * What a stream notice says (docs/02 §2.11). A line about something that still exists is stored
 * as facts and said at read time in the reader's language; a removal keeps the prose written
 * when the record went, since nothing is left to say it from.
 */

describe('noticeContentOf', () => {
	it('reads a last-names batch from its facts', () => {
		expect(
			noticeContentOf({
				entityType: 'last_name',
				summary: lastNamesFacts('Widmer', 3),
				contactId: null
			})
		).toEqual({
			kind: 'lastNames',
			lastName: 'Widmer',
			count: 3
		});
	});

	it('reads the lines stored as prose before, in either language', () => {
		expect(
			noticeContentOf({
				entityType: 'last_name',
				summary: 'set the last name Brunner on 4 people',
				contactId: null
			})
		).toEqual({ kind: 'lastNames', lastName: 'Brunner', count: 4 });
		expect(
			noticeContentOf({
				entityType: 'last_name',
				summary: 'hat 1 Person den Nachnamen Widmer gegeben',
				contactId: null
			})
		).toEqual({ kind: 'lastNames', lastName: 'Widmer', count: 1 });
	});

	it('reads a rename, with the person it is about', () => {
		expect(
			noticeContentOf({
				entityType: 'contact_name',
				summary: renameFacts('Sandra Brunner-Keller', 'Sandra Jdjdh'),
				contactId: 'sandra'
			})
		).toEqual({
			kind: 'rename',
			from: 'Sandra Brunner-Keller',
			to: 'Sandra Jdjdh',
			contactId: 'sandra'
		});
	});

	it('keeps any other line as the text it was written with', () => {
		expect(
			noticeContentOf({ entityType: 'contact', summary: 'removed Hans', contactId: null })
		).toEqual({
			kind: 'text',
			text: 'removed Hans'
		});
		// A line it cannot read is shown as written rather than dropped.
		expect(
			noticeContentOf({ entityType: 'last_name', summary: 'something else', contactId: null })
		).toEqual({
			kind: 'text',
			text: 'something else'
		});
	});

	it('reads a note removed by someone else as its facts', () => {
		expect(
			noticeContentOf({
				entityType: 'note',
				summary: removalFacts('Kurt', 'user-nina', 'Nina'),
				contactId: 'kurt'
			})
		).toEqual({
			kind: 'removed',
			recordKind: 'note',
			person: 'Kurt',
			contactId: 'kurt',
			authorId: 'user-nina',
			authorName: 'Nina'
		});
	});

	it('reads every other removable kind the same way, a circle photo with no person to open', () => {
		for (const kind of ['journal_entry', 'interaction', 'photo'] as const) {
			expect(
				noticeContentOf({
					entityType: kind,
					summary: removalFacts('Kurt', 'user-nina', 'Nina'),
					contactId: 'kurt'
				})
			).toMatchObject({ kind: 'removed', recordKind: kind, contactId: 'kurt' });
		}
		expect(
			noticeContentOf({
				entityType: 'circle_photo',
				summary: removalFacts('Class 3b', 'user-nina', 'Nina'),
				contactId: null
			})
		).toMatchObject({
			kind: 'removed',
			recordKind: 'circle_photo',
			person: 'Class 3b',
			contactId: null
		});
	});
});
