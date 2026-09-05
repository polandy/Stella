import { describe, expect, it } from 'bun:test';
import { quietContacts, QUIET_AFTER_DAYS, type QuietSource } from './quiet';

/*
 * "Quiet lately" (docs/02 §2.12): the people nothing has been written about in a long while.
 * Pure date arithmetic over what the viewer may already see — the rules that matter are which
 * silences count as neglect and which are just an empty new record.
 */

const TODAY = '2026-09-05';

function source(overrides: Partial<QuietSource> = {}): QuietSource {
	return {
		contactId: 'c1',
		contactName: 'Lena Brunner',
		avatarPhotoId: null,
		isDeceased: false,
		knownSince: '2020-01-01',
		lastTouchedOn: '2026-09-01',
		...overrides
	};
}

describe('quietContacts', () => {
	it('leaves out someone touched inside the threshold', () => {
		expect(quietContacts([source({ lastTouchedOn: '2026-08-01' })], TODAY)).toEqual([]);
	});

	it('names someone whose last touch is exactly the threshold ago', () => {
		const quiet = quietContacts([source({ lastTouchedOn: '2026-06-07' })], TODAY);

		expect(quiet).toHaveLength(1);
		expect(quiet[0]).toMatchObject({
			contactId: 'c1',
			lastTouchedOn: '2026-06-07',
			quietForDays: QUIET_AFTER_DAYS
		});
	});

	/*
	 * A person added yesterday with nothing written about them yet is not neglected — they are
	 * new. Counting from the day they were added keeps the list a prompt rather than a backlog
	 * of every record that was ever created empty.
	 */
	it('counts an untouched person from the day they were added, not from the epoch', () => {
		expect(quietContacts([source({ lastTouchedOn: null, knownSince: TODAY })], TODAY)).toEqual([]);

		const quiet = quietContacts([source({ lastTouchedOn: null, knownSince: '2020-01-01' })], TODAY);
		expect(quiet[0]).toMatchObject({ lastTouchedOn: null });
		expect(quiet[0]!.quietForDays).toBeGreaterThan(QUIET_AFTER_DAYS);
	});

	it('counts from the last touch even when the person was added long before it', () => {
		const quiet = quietContacts(
			[source({ knownSince: '2019-01-01', lastTouchedOn: '2026-09-01' })],
			TODAY
		);

		expect(quiet).toEqual([]);
	});

	it('never asks the household to get back in touch with someone who died', () => {
		const gone = source({ isDeceased: true, lastTouchedOn: '2020-01-01' });

		expect(quietContacts([gone], TODAY)).toEqual([]);
	});

	it('puts the quietest first, and settles a tie by name', () => {
		const quiet = quietContacts(
			[
				source({ contactId: 'b', contactName: 'Bea', lastTouchedOn: '2026-01-01' }),
				source({ contactId: 'a', contactName: 'Ana', lastTouchedOn: '2026-01-01' }),
				source({ contactId: 'c', contactName: 'Cem', lastTouchedOn: '2020-01-01' })
			],
			TODAY
		);

		expect(quiet.map((q) => q.contactId)).toEqual(['c', 'a', 'b']);
	});

	/*
	 * A household that just imported its address book has dozens of people nobody has written
	 * about. If those led the band it would show the same five names for months; the people
	 * whose recorded story went silent are the ones worth a nudge first.
	 */
	it('names people whose story went quiet before people who never had one', () => {
		const quiet = quietContacts(
			[
				source({ contactId: 'never', contactName: 'Aaron', lastTouchedOn: null, knownSince: '2019-01-01' }),
				source({ contactId: 'stale', contactName: 'Zoe', lastTouchedOn: '2026-03-01' })
			],
			TODAY
		);

		expect(quiet.map((q) => q.contactId)).toEqual(['stale', 'never']);
	});

	it('shows at most the limit it is given', () => {
		const many = Array.from({ length: 9 }, (_, i) =>
			source({ contactId: `c${i}`, contactName: `Person ${i}`, lastTouchedOn: '2020-01-01' })
		);

		expect(quietContacts(many, TODAY, { limit: 3 })).toHaveLength(3);
	});

	it('takes a threshold, so a household can be asked for a tighter or looser horizon', () => {
		const source30 = [source({ lastTouchedOn: '2026-08-01' })];

		expect(quietContacts(source30, TODAY, { afterDays: 30 })).toHaveLength(1);
		expect(quietContacts(source30, TODAY, { afterDays: 60 })).toEqual([]);
	});

	it('refuses a day it cannot read rather than silently reporting everyone as quiet', () => {
		expect(() => quietContacts([source()], 'yesterday')).toThrow(/yesterday/);
	});

	it('ignores a touch date it cannot read, falling back to the day they were added', () => {
		const quiet = quietContacts(
			[source({ lastTouchedOn: 'sometime', knownSince: '2020-01-01' })],
			TODAY
		);

		expect(quiet).toHaveLength(1);
		expect(quiet[0]!.lastTouchedOn).toBeNull();
	});
});
