import { describe, expect, it } from 'bun:test';
import type { Clock } from '../../clock';
import type { Contact } from '../contacts/contacts';
import { ContactGoneError } from '../contacts/require-visible';
import { InvalidBirthEstimateError } from '../contacts/birth-year';
import { BirthDayOnRecordError, setBirthEstimate, type BirthEstimateDeps } from './birth-estimate';

/*
 * An estimated birth year (docs/dev/02 §2.13.1): kept, replaced and removed on the contact,
 * never over a birthday that names a day, and refused when no age from 0 to 150 gives it.
 */

// 2026-11-15T12:00Z
const NOW = Date.UTC(2026, 10, 15, 12);
const clock: Clock = { now: () => NOW };
const viewer = { id: 'u1', householdId: 'h1' };

function setup(birth: Pick<Contact, 'birthDate' | 'birthDatePrecision'> | null) {
	const writes: { contactId: string; year: string | null; updatedAt: number }[] = [];
	const deps: BirthEstimateDeps = {
		clock,
		contacts: {
			findByIdVisibleTo: async (_viewer, id) =>
				id === 'c1' && birth ? ({ id, ...birth } as Contact) : null
		},
		dates: {
			setBirthYear: async (_viewer, contactId, year, updatedAt) => {
				writes.push({ contactId, year, updatedAt });
				return true;
			}
		}
	};
	return { deps, writes };
}

const none = { birthDate: null, birthDatePrecision: 'full' } as const;

describe('setBirthEstimate', () => {
	it('keeps the year on a person with no birth date', async () => {
		const { deps, writes } = setup(none);
		await setBirthEstimate(deps, viewer, { contactId: 'c1', year: '1992' });
		expect(writes).toEqual([{ contactId: 'c1', year: '1992', updatedAt: NOW }]);
	});

	it('replaces an earlier estimate', async () => {
		const { deps, writes } = setup({ birthDate: '1990', birthDatePrecision: 'age' });
		await setBirthEstimate(deps, viewer, { contactId: 'c1', year: '1992' });
		expect(writes.map((w) => w.year)).toEqual(['1992']);
	});

	it('removes a year alone with null', async () => {
		const { deps, writes } = setup({ birthDate: '1990', birthDatePrecision: 'age' });
		await setBirthEstimate(deps, viewer, { contactId: 'c1', year: null });
		expect(writes.map((w) => w.year)).toEqual([null]);
	});

	it('never overwrites a profile birthday that names a day', async () => {
		for (const day of [
			{ birthDate: '1992-03-14', birthDatePrecision: 'full' },
			{ birthDate: '--03-14', birthDatePrecision: 'month_day' }
		] as const) {
			const { deps, writes } = setup(day);
			expect(
				setBirthEstimate(deps, viewer, { contactId: 'c1', year: '1992' })
			).rejects.toBeInstanceOf(BirthDayOnRecordError);
			// A removal finds no estimate to remove and leaves the day alone.
			await setBirthEstimate(deps, viewer, { contactId: 'c1', year: null });
			expect(writes).toEqual([]);
		}
	});

	it('refuses a person the viewer does not see', async () => {
		const { deps, writes } = setup(null);
		expect(
			setBirthEstimate(deps, viewer, { contactId: 'c1', year: '1992' })
		).rejects.toBeInstanceOf(ContactGoneError);
		expect(writes).toEqual([]);
	});

	it('refuses a year no age from 0 to 150 gives', async () => {
		const { deps, writes } = setup(none);
		for (const year of ['92', 'abcd', '2028', '1875']) {
			expect(setBirthEstimate(deps, viewer, { contactId: 'c1', year })).rejects.toBeInstanceOf(
				InvalidBirthEstimateError
			);
		}
		expect(writes).toEqual([]);
	});

	it('takes this year, next year for a device already past New Year, and 150 years back', async () => {
		const { deps, writes } = setup(none);
		await setBirthEstimate(deps, viewer, { contactId: 'c1', year: '2026' });
		await setBirthEstimate(deps, viewer, { contactId: 'c1', year: '1876' });
		expect(writes.map((w) => w.year)).toEqual(['2026', '1876']);

		const newYearsEve = setup(none);
		newYearsEve.deps.clock = { now: () => Date.UTC(2026, 11, 31, 20) };
		await setBirthEstimate(newYearsEve.deps, viewer, { contactId: 'c1', year: '2027' });
		expect(newYearsEve.writes.map((w) => w.year)).toEqual(['2027']);
	});
});
