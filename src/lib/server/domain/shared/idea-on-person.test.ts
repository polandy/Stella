import { describe, expect, it } from 'bun:test';
import { inEnglish, type Phrase } from '../../../i18n/phrase';
import { ContactGoneError } from '../contacts/require-visible';
import { fakeOwnPeople } from './idea-on-person.fixture';
import {
	birthOfVisible,
	checkedWhen,
	keptFromPerson,
	mayKeepFrom,
	orNull,
	peopleToKeepFrom,
	requiredTitle,
	webLinkOf
} from './idea-on-person';

/*
 * The checks a gift idea, an outing and a to-do share. Each takes the error it throws, so the
 * tests hand one in and see that it, and only it, comes out.
 */

class Refused extends Error {
	constructor(readonly why: string) {
		super(why);
	}
}
const refuse = (why: string) => () => new Refused(why);

const ANDY = { userId: 'andy', householdId: 'h1' };
const JULIA = { userId: 'julia', householdId: 'h1' };
const JULIA_PERSON = 'julia-person';
const ownPeople = fakeOwnPeople(new Map([[JULIA_PERSON, 'julia']]));
const viewer = (actor: typeof ANDY) => ({ id: actor.userId, householdId: actor.householdId });

function thrown(run: () => unknown): unknown {
	try {
		run();
	} catch (error) {
		return error;
	}
	throw new Error('expected a refusal');
}

describe('orNull', () => {
	it('trims text and reads nothing as null', () => {
		expect(orNull('  tea ')).toBe('tea');
		expect(orNull('   ')).toBeNull();
		expect(orNull(null)).toBeNull();
	});
});

describe('requiredTitle', () => {
	it('keeps a line trimmed and refuses an empty one with the error handed in', () => {
		expect(requiredTitle('  Zoo  ', refuse('title'))).toBe('Zoo');
		expect(thrown(() => requiredTitle('  ', refuse('title')))).toEqual(new Refused('title'));
	});
});

describe('webLinkOf', () => {
	it('keeps a web address, reads nothing as none, refuses anything else', () => {
		expect(webLinkOf('zoo.example', refuse('link'))).toBe('https://zoo.example');
		expect(webLinkOf(null, refuse('link'))).toBeNull();
		expect(thrown(() => webLinkOf('javascript:alert(1)', refuse('link')))).toEqual(
			new Refused('link')
		);
	});
});

describe('checkedWhen', () => {
	const asPhrase = (message: Phrase) => new Refused(inEnglish(message));

	it('keeps a when still ahead, and *some time* as none', () => {
		const when = { kind: 'on_date', on: '2026-12-01' } as const;
		expect(checkedWhen(when, null, '2026-11-19', asPhrase)).toEqual(when);
		expect(checkedWhen(null, null, '2026-11-19', asPhrase)).toBeNull();
	});

	it('refuses a when gone by with the shared `errors.when.*` phrase', () => {
		const when = { kind: 'on_date', on: '2026-11-01' } as const;
		expect(thrown(() => checkedWhen(when, null, '2026-11-19', asPhrase))).toEqual(
			new Refused('That day is over. Choose one still ahead.')
		);
	});
});

describe('birthOfVisible', () => {
	it('reads the birth date of a person the actor sees, and says when they are gone', async () => {
		const contacts = {
			async findByIdVisibleTo(_viewer: unknown, id: string) {
				return id === 'hilde'
					? ({ id, birthDate: '1950-03-14', birthDatePrecision: 'full' } as never)
					: null;
			}
		};
		expect(await birthOfVisible(contacts, ANDY, 'hilde')).toEqual({
			value: '1950-03-14',
			precision: 'full'
		});
		expect(birthOfVisible(contacts, ANDY, 'gone')).rejects.toBeInstanceOf(ContactGoneError);
	});
});

describe('keptFromPerson', () => {
	const kept = (actor: typeof ANDY, visibility: 'shared' | 'private', asked: boolean) =>
		keptFromPerson(ownPeople, actor, JULIA_PERSON, visibility, asked, refuse('own'));

	it('keeps a shared record from its person when asked', async () => {
		expect(await kept(ANDY, 'shared', true)).toBe(true);
		expect(await kept(ANDY, 'shared', false)).toBe(false);
	});

	it('is nothing on a private record, which only its author sees anyway', async () => {
		expect(await kept(ANDY, 'private', true)).toBe(false);
	});

	it('refuses the member whose own person it is with the error handed in', async () => {
		expect(kept(JULIA, 'shared', true)).rejects.toEqual(new Refused('own'));
	});
});

describe('mayKeepFrom', () => {
	it('offers keeping a record from a member whose own person it is about', async () => {
		expect(await mayKeepFrom(ownPeople, viewer(ANDY), JULIA_PERSON)).toBe(true);
	});

	it('never offers it to that member, nor for a person who is nobody’s own', async () => {
		expect(await mayKeepFrom(ownPeople, viewer(JULIA), JULIA_PERSON)).toBe(false);
		expect(await mayKeepFrom(ownPeople, viewer(ANDY), 'hilde')).toBe(false);
	});
});

describe('peopleToKeepFrom', () => {
	it('names every member’s own person but the viewer’s, for a form with several people', async () => {
		expect(await peopleToKeepFrom(ownPeople, viewer(ANDY))).toEqual([JULIA_PERSON]);
		expect(await peopleToKeepFrom(ownPeople, viewer(JULIA))).toEqual([]);
	});
});
