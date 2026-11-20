import { describe, expect, it } from 'bun:test';
import { createTranslator } from '#lib/i18n/translate.js';
import {
	asksForDatesEditor,
	datesEditorPath,
	addMoreLabel,
	addressLines,
	mapHref,
	ageOn,
	birthdayFact,
	identityLayout,
	initialPanel,
	otherDateFacts,
	metLine,
	recordMenu
} from './identity-card';

/*
 * The identity card at the top of a person's page (docs/dev/05 §5.5): which facts it states, which
 * empty ones wait behind its one quiet button and what that button says, which rows stand
 * below, and what its ⋯ menu offers.
 */

const nothing = {
	birthday: false,
	otherDates: false,
	address: false,
	job: false,
	lastContact: false,
	circles: false,
	contact: false,
	tags: false
};
const everything = {
	birthday: true,
	otherDates: true,
	address: true,
	job: true,
	lastContact: true,
	circles: true,
	contact: true,
	tags: true
};

describe('identityLayout', () => {
	it('states every fact the record holds, in one order, and lists the rows that hold something', () => {
		const card = identityLayout(everything);
		expect(card.facts).toEqual([
			{ name: 'birthday', slot: false },
			{ name: 'dates', slot: false },
			{ name: 'address', slot: false },
			{ name: 'job', slot: false },
			{ name: 'lastContact', slot: false },
			{ name: 'circles', slot: false }
		]);
		expect(card.rows).toEqual(['contact', 'tags']);
		expect(card.behindAddMore).toEqual([]);
	});

	it('shows only what the record holds: an empty fact or row waits behind the quiet button', () => {
		const card = identityLayout({ ...nothing, job: true });
		expect(card.facts).toEqual([{ name: 'job', slot: false }]);
		expect(card.rows).toEqual([]);
		expect(card.behindAddMore).toEqual([
			'address',
			'birthday',
			'phone',
			'email',
			'tags',
			'circles'
		]);
	});

	it('states the last contact only when there is one, and never offers it behind the button', () => {
		expect(identityLayout(nothing).facts).toEqual([]);
		expect(identityLayout(nothing, { revealed: true }).facts.map((f) => f.name)).not.toContain(
			'lastContact'
		);
		expect(identityLayout({ ...nothing, lastContact: true }).facts).toEqual([
			{ name: 'lastContact', slot: false }
		]);
	});

	it('names phone and email for an empty Contact row, never an address among them', () => {
		const card = identityLayout({ ...everything, contact: false });
		expect(card.behindAddMore).toEqual(['phone', 'email']);
	});

	it('never offers gender: it is edited with the name', () => {
		expect(identityLayout(nothing).behindAddMore).not.toContain('gender');
	});

	it('brings the empty facts as slots in their places and the empty rows once pressed', () => {
		const card = identityLayout({ ...nothing, job: true, tags: true }, { revealed: true });
		expect(card.facts).toEqual([
			{ name: 'birthday', slot: true },
			{ name: 'address', slot: true },
			{ name: 'job', slot: false },
			{ name: 'circles', slot: true }
		]);
		expect(card.rows).toEqual(['contact', 'tags']);
		expect(card.behindAddMore).toEqual([]);
	});

	it('offers a birthday slot beside the other dates, which never stand as a slot', () => {
		const card = identityLayout({ ...nothing, otherDates: true }, { revealed: true });
		expect(card.facts.slice(0, 2)).toEqual([
			{ name: 'birthday', slot: true },
			{ name: 'dates', slot: false }
		]);
	});

	it('keeps a fact or row listed that was on the card a moment ago, as a slot once emptied', () => {
		const card = identityLayout(nothing, { kept: ['address', 'tags'] });
		expect(card.facts).toEqual([{ name: 'address', slot: true }]);
		expect(card.rows).toEqual(['tags']);
		expect(card.behindAddMore).toEqual(['birthday', 'job', 'phone', 'email', 'circles']);
	});

	it('says what it listed, so the card can keep it for the visit', () => {
		expect(identityLayout({ ...nothing, address: true, tags: true }).listed).toEqual([
			'address',
			'tags'
		]);
		expect(identityLayout(nothing, { revealed: true }).listed).toEqual([
			'birthday',
			'address',
			'job',
			'circles',
			'contact',
			'tags'
		]);
	});

	it('keeps the dates in place while their editor is open, though the last one was just removed', () => {
		const card = identityLayout(nothing, { editingDates: true });
		expect(card.facts).toEqual([{ name: 'birthday', slot: true }]);
		// Only held open by the editor: closing it does not leave a slot nobody asked for.
		expect(card.listed).toEqual([]);
	});
});

describe('addMoreLabel', () => {
	it('names the first three things behind the button, and hints at more', () => {
		const t = createTranslator('en');
		expect(addMoreLabel(['address', 'phone', 'email', 'tags'], t)).toBe(
			'Add address, phone, email …'
		);
		expect(addMoreLabel(['phone', 'email', 'tags'], t)).toBe('Add phone, email, tags');
		expect(addMoreLabel(['circles'], t)).toBe('Add circles');
	});

	it('speaks German too', () => {
		expect(addMoreLabel(['address', 'birthday', 'job', 'tags'], createTranslator('de'))).toBe(
			'Anschrift, Geburtstag, Beruf … hinzufügen'
		);
	});
});

describe('ageOn', () => {
	it('counts the birthdays already had', () => {
		expect(ageOn('2015-05-20', '2026-10-05')).toBe(11);
		expect(ageOn('2015-05-20', '2026-05-19')).toBe(10);
		expect(ageOn('2015-05-20', '2026-05-20')).toBe(11);
	});

	it('is null without a year, or for a day still to come', () => {
		expect(ageOn('--05-20', '2026-10-05')).toBeNull();
		expect(ageOn('2027-01-01', '2026-10-05')).toBeNull();
	});
});

describe('birthdayFact', () => {
	const today = '2026-10-05';
	const record = (over: Partial<Parameters<typeof birthdayFact>[0]> = {}) => ({
		derivedBirthday: null,
		estimatedBirthYear: null,
		isDeceased: false,
		dates: [],
		...over
	});

	it('prefers a birthday among the dates over the profile', () => {
		expect(
			birthdayFact(
				record({
					dates: [
						{ kind: 'anniversary', date: '2010-06-01' },
						{ kind: 'birthday', date: '2015-05-20' }
					]
				}),
				today
			)
		).toEqual({ kind: 'day', date: '2015-05-20', age: 11, estimatedAge: null });
	});

	it('falls back to the profile birthday, with no age when it has no year', () => {
		expect(birthdayFact(record({ derivedBirthday: '--05-20' }), today)).toEqual({
			kind: 'day',
			date: '--05-20',
			age: null,
			estimatedAge: null
		});
	});

	it('states an estimated birth year as an age that counts on by itself', () => {
		expect(birthdayFact(record({ estimatedBirthYear: '1992' }), today)).toEqual({
			kind: 'estimate',
			year: '1992',
			age: 34
		});
	});

	it('gives no age for the estimate of someone who has died, only the year', () => {
		expect(birthdayFact(record({ estimatedBirthYear: '1940', isDeceased: true }), today)).toEqual({
			kind: 'estimate',
			year: '1940',
			age: null
		});
	});

	it('lets a birthday with a year win over the estimate', () => {
		expect(
			birthdayFact(
				record({
					estimatedBirthYear: '1990',
					dates: [{ kind: 'birthday', date: '1992-03-14' }]
				}),
				today
			)
		).toEqual({ kind: 'day', date: '1992-03-14', age: 34, estimatedAge: null });
	});

	it('puts the estimate beside a birthday that has no year', () => {
		expect(
			birthdayFact(
				record({ estimatedBirthYear: '1992', dates: [{ kind: 'birthday', date: '--03-14' }] }),
				today
			)
		).toEqual({ kind: 'day', date: '--03-14', age: null, estimatedAge: 34 });
		expect(
			birthdayFact(
				record({
					estimatedBirthYear: '1940',
					isDeceased: true,
					dates: [{ kind: 'birthday', date: '--03-14' }]
				}),
				today
			)
		).toEqual({ kind: 'day', date: '--03-14', age: null, estimatedAge: null });
	});

	it('is null when nothing says when they were born', () => {
		expect(birthdayFact(record(), today)).toBeNull();
	});
});

describe('otherDateFacts', () => {
	const today = '2026-10-05';
	const date = (id: string, kind: string, day: string, label: string | null = null) => ({
		id,
		kind,
		label,
		date: day
	});

	it('states every date but the birthday as its own fact, with the years since', () => {
		expect(
			otherDateFacts(
				[
					date('b', 'birthday', '1983-03-14'),
					date('w', 'anniversary', '2009-06-13', 'Wedding'),
					date('m', 'custom', '--11-02', 'Name day')
				],
				today
			)
		).toEqual([
			{ id: 'w', kind: 'anniversary', label: 'Wedding', date: '2009-06-13', years: 17 },
			{ id: 'm', kind: 'custom', label: 'Name day', date: '--11-02', years: null }
		]);
	});

	it('leaves only the first birthday to the birthday fact; a second one stands on its own', () => {
		const facts = otherDateFacts(
			[date('b1', 'birthday', '1983-03-14'), date('b2', 'birthday', '1990-01-01')],
			today
		);
		expect(facts.map((fact) => fact.id)).toEqual(['b2']);
	});
});

describe('addressLines', () => {
	it('is every address, each on one line', () => {
		expect(
			addressLines([
				{ id: 'p', kind: 'phone', label: null, value: '+41 79 000 00 00' },
				{ id: 'a', kind: 'address', label: 'Home', value: 'Thunstrasse 12\n3074 Muri bei Bern' },
				{ id: 'b', kind: 'address', label: null, value: 'Elsewhere' }
			])
		).toEqual([
			{ id: 'a', label: 'Home', line: 'Thunstrasse 12, 3074 Muri bei Bern' },
			{ id: 'b', label: null, line: 'Elsewhere' }
		]);
	});

	it('links each line to an OpenStreetMap search', () => {
		expect(mapHref('Thunstrasse 12, 3074 Muri bei Bern')).toBe(
			'https://www.openstreetmap.org/search?query=Thunstrasse%2012%2C%203074%20Muri%20bei%20Bern'
		);
	});

	it('is empty without one', () => {
		expect(
			addressLines([{ id: 'e', kind: 'email', label: null, value: 'lena@example.org' }])
		).toEqual([]);
	});
});
describe('recordMenu', () => {
	const viewer = { isAdmin: true, archived: false, isSelf: false, canTracePath: true };

	it('offers logging and the brief first, then the record-keeping actions in their order', () => {
		expect(recordMenu(viewer)).toEqual([
			'logContact',
			'brief',
			'divider',
			'thisIsMe',
			'tracePath',
			'archive',
			'merge',
			'delete'
		]);
	});

	it('lets go of the self link and brings an archived person back', () => {
		const menu = recordMenu({ ...viewer, isSelf: true, archived: true });
		expect(menu).toContain('notMe');
		expect(menu).toContain('restore');
		expect(menu).not.toContain('thisIsMe');
		expect(menu).not.toContain('archive');
	});

	it('keeps merging and deleting for admins, and the path for a household with others in it', () => {
		const menu = recordMenu({ ...viewer, isAdmin: false, canTracePath: false });
		expect(menu).toEqual(['logContact', 'brief', 'divider', 'thisIsMe', 'archive']);
	});
});

describe('initialPanel', () => {
	it('opens the merge step for an admin who followed a "same person?" link', () => {
		expect(initialPanel('contact-2', true)).toBe('merge');
	});

	it('opens nothing without a merge target, or for a non-admin carrying one', () => {
		expect(initialPanel(null, true)).toBeNull();
		expect(initialPanel('contact-2', false)).toBeNull();
	});
});

describe('metLine', () => {
	it('joins how, where and when into one line, leaving out what is not said', () => {
		expect(metLine({ howWeMet: 'At university', metPlace: 'Freiburg', metDate: '1998' })).toBe(
			'At university · Freiburg · 1998'
		);
		expect(metLine({ howWeMet: null, metPlace: 'Freiburg', metDate: null })).toBe('Freiburg');
	});

	it('is none when nothing is said', () => {
		expect(metLine({ howWeMet: null, metPlace: null, metDate: null })).toBeNull();
	});
});

describe('datesEditorPath', () => {
	it('opens the dates editor on the person’s page, and only that asks for it', () => {
		const path = datesEditorPath('c-1');
		expect(path).toBe('/contacts/c-1?edit=dates');
		expect(asksForDatesEditor(new URL(path, 'https://stella.test'))).toBe(true);
		expect(asksForDatesEditor(new URL('/contacts/c-1', 'https://stella.test'))).toBe(false);
	});
});
