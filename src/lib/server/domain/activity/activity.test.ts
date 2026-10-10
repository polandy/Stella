import { describe, expect, it } from 'bun:test';
import { fixedClock, sequentialIds } from '../testing';
import { lastNamesFacts, memberFacts, MEMBER_ENTITY, renameFacts } from '../../../stream/notices';
import {
	activityEntry,
	activityRecord,
	IMMICH_LINK_ENTITY,
	localizedActivityEntry,
	type ActivityRecord,
	type ActivityWording,
	type LocalizedActivityEvent,
	type PlainActivityEvent
} from './activity';

const viewer = { id: 'u-anna', householdId: 'h-1' };
const stamp = { id: 'log-1', householdId: 'h-1', actorId: 'u-anna', createdAt: 1_000 };
const recorded = <E extends PlainActivityEvent | LocalizedActivityEvent>(
	event: E
): ActivityRecord<E> => ({ ...stamp, event });

const wording: ActivityWording = {
	restored: (locale, people, household) => `${locale}: restored ${people} from ${household}`,
	imported: (locale, people, source) => `${locale}: imported ${people} from ${source}`
};

describe('activityRecord', () => {
	it('stamps the event with the member, a fresh id and now', () => {
		const deps = { ids: sequentialIds('log-1'), clock: fixedClock(1_000) };
		const event = { kind: 'archive.exported', people: 3 } as const;
		expect(activityRecord(deps, viewer, event)).toEqual({ ...stamp, event });
	});

	it('takes the moment the change itself was stamped with, when given', () => {
		const deps = { ids: sequentialIds('log-1'), clock: fixedClock(9_999) };
		const event = { kind: 'archive.exported', people: 3 } as const;
		expect(activityRecord(deps, viewer, event, 1_000).createdAt).toBe(1_000);
	});
});

describe('activityEntry', () => {
	it('logs a deletion under the contact, linked to nobody, as visible as they were', () => {
		const entry = activityEntry(
			recorded({
				kind: 'contact.deleted',
				contactId: 'c-1',
				displayName: 'Hans Brunner',
				visibility: 'private'
			})
		);
		expect(entry).toEqual({
			...stamp,
			action: 'delete',
			entityType: 'contact',
			entityId: 'c-1',
			contactId: null,
			visibility: 'private',
			summary: 'removed Hans Brunner'
		});
	});

	it('logs a merge under the record merged away, linked to the survivor', () => {
		const entry = activityEntry(
			recorded({
				kind: 'contact.merged',
				keepId: 'c-keep',
				mergedAwayId: 'c-gone',
				keep: 'Anna Brunner',
				mergedAway: 'Anni',
				visibility: 'shared'
			})
		);
		expect(entry).toEqual({
			...stamp,
			action: 'merge',
			entityType: 'contact',
			entityId: 'c-gone',
			contactId: 'c-keep',
			visibility: 'shared',
			summary: 'merged Anni into Anna Brunner'
		});
	});

	it('stores a rename as facts, said at read time', () => {
		const entry = activityEntry(
			recorded({
				kind: 'contact.renamed',
				contactId: 'c-1',
				from: 'Thomas',
				to: 'Tom',
				visibility: 'shared'
			})
		);
		expect(entry).toEqual({
			...stamp,
			action: 'update',
			entityType: 'contact_name',
			entityId: 'c-1',
			contactId: 'c-1',
			visibility: 'shared',
			summary: renameFacts('Thomas', 'Tom')
		});
	});

	it('stores a batch of last names as facts, under the first person it named', () => {
		const entry = activityEntry(
			recorded({
				kind: 'lastNames.given',
				firstContactId: 'c-1',
				lastNames: 'Brunner, Keller',
				count: 3,
				visibility: 'private'
			})
		);
		expect(entry).toEqual({
			...stamp,
			action: 'update',
			entityType: 'last_name',
			entityId: 'c-1',
			contactId: null,
			visibility: 'private',
			summary: lastNamesFacts('Brunner, Keller', 3)
		});
	});

	it('logs a link and an unlink as updates to the person', () => {
		const person = { contactId: 'c-1', displayName: 'Hans', visibility: 'shared' } as const;
		const linked = activityEntry(recorded({ kind: 'immich.linked', ...person }));
		const unlinked = activityEntry(recorded({ kind: 'immich.unlinked', ...person }));
		const row = {
			...stamp,
			action: 'update',
			entityType: IMMICH_LINK_ENTITY,
			entityId: 'c-1',
			contactId: 'c-1',
			visibility: 'shared'
		} as const;
		expect(linked).toEqual({ ...row, summary: 'linked Hans to Immich' });
		expect(unlinked).toEqual({ ...row, summary: 'unlinked Hans from Immich' });
	});

	it('logs a member removed under the member, for the whole household, with their name', () => {
		const entry = activityEntry(
			recorded({ kind: 'member.removed', memberId: 'u-nina', name: 'Nina Brunner' })
		);
		expect(entry).toEqual({
			...stamp,
			action: 'delete',
			entityType: MEMBER_ENTITY,
			entityId: 'u-nina',
			contactId: null,
			visibility: 'shared',
			summary: memberFacts('Nina Brunner')
		});
	});

	it('logs an export under the household, for the household to see', () => {
		expect(activityEntry(recorded({ kind: 'archive.exported', people: 12 }))).toEqual({
			...stamp,
			action: 'export',
			entityType: 'household',
			entityId: 'h-1',
			contactId: null,
			visibility: 'shared',
			summary: 'exported the household archive (12 people)'
		});
	});

	it('counts one exported person in the singular, and none in the plural', () => {
		const said = (people: number) =>
			activityEntry(recorded({ kind: 'archive.exported', people })).summary;
		expect(said(1)).toBe('exported the household archive (1 person)');
		expect(said(0)).toBe('exported the household archive (0 people)');
	});
});

describe('localizedActivityEntry', () => {
	it('logs a restore for the household, in the language of the member who ran it', () => {
		const event = {
			kind: 'archive.restored',
			people: 12,
			household: 'Brunner',
			locale: 'de'
		} as const;
		expect(localizedActivityEntry(recorded(event), wording)).toEqual({
			...stamp,
			action: 'import',
			entityType: 'household',
			entityId: 'h-1',
			contactId: null,
			visibility: 'shared',
			summary: 'de: restored 12 from Brunner'
		});
	});

	it('logs an API import as visible as what it imported', () => {
		const event = {
			kind: 'people.imported',
			people: 4,
			source: 'kindergarten',
			visibility: 'private',
			locale: 'en'
		} as const;
		expect(localizedActivityEntry(recorded(event), wording)).toEqual({
			...stamp,
			action: 'import',
			entityType: 'household',
			entityId: 'h-1',
			contactId: null,
			visibility: 'private',
			summary: 'en: imported 4 from kindergarten'
		});
	});
});
