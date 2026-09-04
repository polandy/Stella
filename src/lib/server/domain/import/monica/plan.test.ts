import { describe, expect, it } from 'bun:test';
import type { MonicaExport } from './monica-export';
import { planMonicaImport, type ImportOptions } from './plan';

/*
 * Monica → Stella mapping (docs/02 §2.16, docs/monica-mapping.md). The plan is pure: given
 * the typed export it decides every row the import will write, with stable source ids so
 * running it twice cannot duplicate, and a report of what was approximated or left out.
 */

const NOW = 1_700_000_000_000;
const opts: ImportOptions = {
	householdId: 'h1',
	userId: 'u1',
	visibility: 'shared',
	now: NOW
};

function emptyExport(): MonicaExport {
	return {
		contacts: [],
		genders: [
			{ id: 1, type: 'M', name: 'Männlich' },
			{ id: 2, type: 'F', name: 'Weiblich' },
			{ id: 3, type: 'O', name: 'Möchte ich nicht angeben' }
		],
		specialDates: [],
		relationshipTypes: [
			{ id: 8, name: 'parent', nameReverse: 'child' },
			{ id: 9, name: 'child', nameReverse: 'parent' },
			{ id: 10, name: 'sibling', nameReverse: 'sibling' },
			{ id: 15, name: 'cousin', nameReverse: 'cousin' },
			{ id: 13, name: 'uncle', nameReverse: 'nephew' },
			{ id: 14, name: 'nephew', nameReverse: 'uncle' },
			{ id: 99, name: 'Skipartner', nameReverse: 'Skipartner' }
		],
		relationships: [],
		contactFieldTypes: [
			{ id: 1, name: 'Email', type: 'email', protocol: 'mailto:' },
			{ id: 2, name: 'Phone', type: 'phone', protocol: 'tel:' },
			{ id: 5, name: 'Whatsapp', type: null, protocol: 'https://wa.me/' },
			{ id: 6, name: 'Adresse', type: null, protocol: null }
		],
		contactFields: [],
		addresses: [],
		notes: [],
		activities: [],
		tags: [],
		photos: [],
		gifts: [],
		lifeEvents: [],
		pets: [],
		journalEntries: [],
		userCount: 2,
		derivedReminderCount: 0
	};
}

const contact = (id: number, first: string, last: string | null, extra: Partial<MonicaExport['contacts'][0]> = {}) => ({
	id,
	firstName: first,
	middleName: null,
	lastName: last,
	nickname: null,
	genderId: 1,
	description: null,
	isPartial: false,
	isDead: false,
	deceasedSpecialDateId: null,
	birthdaySpecialDateId: null,
	firstMetSpecialDateId: null,
	firstMetThroughContactId: null,
	firstMetWhere: null,
	firstMetAdditionalInfo: null,
	job: null,
	company: null,
	avatarSource: 'default',
	avatarPhotoId: null,
	deletedAt: null,
	createdAt: '2023-06-14 22:24:24',
	...extra
});

describe('planMonicaImport — contacts', () => {
	it('maps names, gender, job and description with a stable source id and the chosen visibility', () => {
		const exp = emptyExport();
		exp.contacts = [
			contact(2, 'Leonardo', 'Pollari', { middleName: 'Li Wei', genderId: 2, job: 'Pilot', company: 'Swiss', description: 'neighbour', nickname: 'Leo' })
		];
		const plan = planMonicaImport(exp, opts);
		expect(plan.contacts).toHaveLength(1);
		expect(plan.contacts[0]).toMatchObject({
			id: 'monica:contact:2',
			householdId: 'h1',
			createdBy: 'u1',
			visibility: 'shared',
			displayName: 'Leonardo Li Wei Pollari',
			firstName: 'Leonardo Li Wei',
			lastName: 'Pollari',
			nickname: 'Leo',
			gender: 'female',
			jobTitle: 'Pilot',
			company: 'Swiss',
			description: 'neighbour',
			createdAt: NOW,
			updatedAt: NOW
		});
	});

	it('leaves deleted contacts out and says so', () => {
		const exp = emptyExport();
		exp.contacts = [contact(1, 'Sia', null), contact(2, 'Gone', null, { deletedAt: '2023-06-21 12:55:36' })];
		const plan = planMonicaImport(exp, opts);
		expect(plan.contacts.map((c) => c.displayName)).toEqual(['Sia']);
		expect(plan.report.skipped).toContainEqual({ what: 'contact', count: 1, why: 'deleted in Monica' });
	});

	it('reads a full birthday, a year-less one, and an age-based estimate', () => {
		const exp = emptyExport();
		exp.contacts = [
			contact(1, 'Full', null, { birthdaySpecialDateId: 11 }),
			contact(2, 'Yearless', null, { birthdaySpecialDateId: 12 }),
			contact(3, 'Estimated', null, { birthdaySpecialDateId: 13 })
		];
		exp.specialDates = [
			{ id: 11, contactId: 1, isAgeBased: false, isYearUnknown: false, date: '1991-01-03' },
			{ id: 12, contactId: 2, isAgeBased: false, isYearUnknown: true, date: '2023-06-26' },
			{ id: 13, contactId: 3, isAgeBased: true, isYearUnknown: false, date: '2017-01-01' }
		];
		const [full, yearless, estimated] = planMonicaImport(exp, opts).contacts;
		expect(full).toMatchObject({ birthDate: '1991-01-03', birthDatePrecision: 'full' });
		expect(yearless).toMatchObject({ birthDate: '--06-26', birthDatePrecision: 'month_day' });
		expect(estimated).toMatchObject({ birthDate: '2017', birthDatePrecision: 'age' });
	});

	it('carries death and first-met details', () => {
		const exp = emptyExport();
		exp.contacts = [
			contact(1, 'Late', null, { isDead: true, deceasedSpecialDateId: 21 }),
			contact(2, 'Met', null, { firstMetSpecialDateId: 22, firstMetWhere: 'Bern', firstMetAdditionalInfo: 'at a wedding', firstMetThroughContactId: 1 })
		];
		exp.specialDates = [
			{ id: 21, contactId: 1, isAgeBased: false, isYearUnknown: false, date: '2020-02-02' },
			{ id: 22, contactId: 2, isAgeBased: false, isYearUnknown: false, date: '2019-09-09' }
		];
		const [late, met] = planMonicaImport(exp, opts).contacts;
		expect(late).toMatchObject({ isDeceased: true, deathDate: '2020-02-02' });
		expect(met).toMatchObject({ metDate: '2019-09-09', metPlace: 'Bern', howWeMet: 'at a wedding (through Late)' });
	});
});

describe('planMonicaImport — relationships', () => {
	it('collapses Monica’s mirrored pairs into one Stella row on the forward side', () => {
		const exp = emptyExport();
		exp.contacts = [contact(1, 'Mum', null), contact(2, 'Kid', null), contact(3, 'Sis', null)];
		exp.relationships = [
			{ id: 1, typeId: 8, contactIs: 1, ofContact: 2, createdAt: null }, // Mum is parent of Kid
			{ id: 2, typeId: 9, contactIs: 2, ofContact: 1, createdAt: null }, // Kid is child of Mum
			{ id: 3, typeId: 10, contactIs: 3, ofContact: 2, createdAt: null }, // Sis sibling of Kid
			{ id: 4, typeId: 10, contactIs: 2, ofContact: 3, createdAt: null }
		];
		const plan = planMonicaImport(exp, opts);
		expect(plan.relationships).toHaveLength(2);
		expect(plan.relationships[0]).toMatchObject({
			typeId: 'parent_child',
			fromContactId: 'monica:contact:1',
			toContactId: 'monica:contact:2'
		});
		// symmetric: canonical (sorted) endpoints, whichever row came first
		expect(plan.relationships[1]).toMatchObject({
			typeId: 'sibling',
			fromContactId: 'monica:contact:2',
			toContactId: 'monica:contact:3'
		});
		expect(plan.relationshipTypes).toEqual([]);
	});

	it('creates a custom type once for names Stella lacks, and a fallback for user-defined names', () => {
		const exp = emptyExport();
		exp.contacts = [contact(1, 'A', null), contact(2, 'B', null), contact(3, 'C', null)];
		exp.relationships = [
			{ id: 1, typeId: 15, contactIs: 1, ofContact: 2, createdAt: null },
			{ id: 2, typeId: 15, contactIs: 2, ofContact: 1, createdAt: null },
			{ id: 3, typeId: 14, contactIs: 3, ofContact: 1, createdAt: null }, // C is nephew of A
			{ id: 4, typeId: 13, contactIs: 1, ofContact: 3, createdAt: null }, // A is uncle of C
			{ id: 5, typeId: 99, contactIs: 2, ofContact: 3, createdAt: null },
			{ id: 6, typeId: 99, contactIs: 3, ofContact: 2, createdAt: null }
		];
		const plan = planMonicaImport(exp, opts);
		expect(plan.relationshipTypes.map((t) => [t.id, t.forwardLabel, t.reverseLabel, t.category, t.symmetric])).toEqual([
			['monica:reltype:cousin', 'Cousin of', 'Cousin of', 'family', true],
			['monica:reltype:uncle_nephew', 'Uncle/aunt of', 'Nephew/niece of', 'family', false],
			['monica:reltype:skipartner', 'Skipartner', 'Skipartner', 'other', true]
		]);
		expect(plan.relationshipTypes.every((t) => t.householdId === 'h1')).toBe(true);
		const uncle = plan.relationships.find((r) => r.typeId === 'monica:reltype:uncle_nephew');
		expect(uncle).toMatchObject({ fromContactId: 'monica:contact:1', toContactId: 'monica:contact:3' });
		expect(plan.report.warnings).toContainEqual(
			'Relationship type "Skipartner" has no Stella equivalent; created as a custom type.'
		);
	});

	it('drops a relationship whose end is a deleted contact and reports it', () => {
		const exp = emptyExport();
		exp.contacts = [contact(1, 'A', null), contact(2, 'Gone', null, { deletedAt: 'x' })];
		exp.relationships = [{ id: 1, typeId: 10, contactIs: 1, ofContact: 2, createdAt: null }];
		const plan = planMonicaImport(exp, opts);
		expect(plan.relationships).toEqual([]);
		expect(plan.report.skipped).toContainEqual({ what: 'relationship', count: 1, why: 'refers to a deleted contact' });
	});
});

describe('planMonicaImport — fields, notes, tags', () => {
	it('maps emails, phones, protocol types and addresses to contact fields', () => {
		const exp = emptyExport();
		exp.contacts = [contact(9, 'J', null)];
		exp.contactFields = [
			{ id: 1, contactId: 9, typeId: 1, data: 'j@x.test', createdAt: null },
			{ id: 2, contactId: 9, typeId: 2, data: '+41 79 1', createdAt: null },
			{ id: 3, contactId: 9, typeId: 5, data: '41791', createdAt: null },
			{ id: 4, contactId: 9, typeId: 6, data: 'somewhere', createdAt: null }
		];
		exp.addresses = [
			{ id: 1, contactId: 9, name: 'Home', street: '24 Schutzengelstrasse', city: 'Baar', province: null, postalCode: '6340', country: 'CH' }
		];
		const fields = planMonicaImport(exp, opts).contactFields;
		expect(fields.map((f) => [f.id, f.kind, f.label, f.value])).toEqual([
			['monica:field:1', 'email', null, 'j@x.test'],
			['monica:field:2', 'phone', null, '+41 79 1'],
			['monica:field:3', 'url', 'Whatsapp', 'https://wa.me/41791'],
			['monica:field:4', 'custom', 'Adresse', 'somewhere'],
			['monica:address:1', 'address', 'Home', '24 Schutzengelstrasse, 6340 Baar, CH']
		]);
		expect(fields.every((f) => f.contactId === 'monica:contact:9')).toBe(true);
	});

	it('maps notes with favourites pinned, and gifts, life events and pets as labelled notes', () => {
		const exp = emptyExport();
		exp.contacts = [contact(1, 'A', null)];
		exp.notes = [{ id: 1, contactId: 1, body: 'Postkonto', isFavorited: true, createdAt: null }];
		exp.gifts = [{ id: 1, contactId: 1, name: '3 Fragezeichen Buch', comment: 'loved it', url: null, status: 'offered', date: '2023-12-30' }];
		exp.lifeEvents = [{ id: 1, contactId: 1, name: 'Kindergarten', note: null, typeKey: 'new_school', happenedAt: '2023-08-14' }];
		exp.pets = [{ id: 1, contactId: 1, name: 'Elek', category: 'dog' }];
		const notes = planMonicaImport(exp, opts).notes;
		expect(notes.map((n) => [n.id, n.title, n.body, n.isPinned])).toEqual([
			['monica:note:1', null, 'Postkonto', true],
			['monica:gift:1', 'Gift', '🎁 **3 Fragezeichen Buch** — offered, 30 December 2023\n\nloved it', false],
			['monica:lifeevent:1', 'Life event', '📅 **Kindergarten** (new school) — 14 August 2023', false],
			['monica:pet:1', 'Pet', '🐾 **Elek**, dog', false]
		]);
		expect(notes.every((n) => n.contactId === 'monica:contact:1' && n.visibility === 'shared')).toBe(true);
	});

	it('maps tags and their assignments', () => {
		const exp = emptyExport();
		exp.contacts = [contact(1, 'A', null), contact(2, 'B', null)];
		exp.tags = [{ id: 4, name: 'Kindergarten', contactIds: [1, 2] }];
		const plan = planMonicaImport(exp, opts);
		expect(plan.tags).toEqual([{ id: 'monica:tag:4', householdId: 'h1', name: 'Kindergarten', color: expect.any(String), createdAt: NOW, updatedAt: NOW }]);
		expect(plan.contactTags).toEqual([
			{ contactId: 'monica:contact:1', tagId: 'monica:tag:4' },
			{ contactId: 'monica:contact:2', tagId: 'monica:tag:4' }
		]);
	});
});

describe('planMonicaImport — activities, photos, leftovers', () => {
	it('turns an activity into a "met" interaction on its first person with the rest as participants', () => {
		const exp = emptyExport();
		exp.contacts = [contact(1, 'A', null), contact(2, 'B', null), contact(3, 'C', null)];
		exp.activities = [
			{ id: 3, summary: 'Bier getrunken bei Schuum', description: 'good night', happenedAt: '2023-06-16', typeKey: 'ate_restaurant', contactIds: [1, 2, 3], createdAt: null },
			{ id: 4, summary: 'nobody', description: null, happenedAt: '2023-06-17', typeKey: null, contactIds: [], createdAt: null }
		];
		const plan = planMonicaImport(exp, opts);
		expect(plan.interactions).toHaveLength(1);
		expect(plan.interactions[0]).toMatchObject({
			id: 'monica:activity:3',
			contactId: 'monica:contact:1',
			kind: 'met',
			happenedAt: '2023-06-16',
			title: 'Bier getrunken bei Schuum',
			description: 'good night\n\n(Monica activity: ate restaurant)',
			participantIds: ['monica:contact:2', 'monica:contact:3'],
			createdBy: 'u1',
			visibility: 'shared'
		});
		expect(plan.report.skipped).toContainEqual({ what: 'activity', count: 1, why: 'linked to no person' });
	});

	it('plans photos per contact and marks the one used as avatar', () => {
		const exp = emptyExport();
		exp.contacts = [contact(1, 'A', null, { avatarSource: 'photo', avatarPhotoId: 10 })];
		exp.photos = [
			{ id: 10, path: 'photos/a.jpg', mime: 'image/jpeg', sizeBytes: 100, contactId: 1, createdAt: null },
			{ id: 11, path: 'photos/b.jpg', mime: 'image/jpeg', sizeBytes: 200, contactId: 1, createdAt: null },
			{ id: 12, path: 'photos/orphan.jpg', mime: 'image/jpeg', sizeBytes: 5, contactId: null, createdAt: null }
		];
		const plan = planMonicaImport(exp, opts);
		expect(plan.photos.map((p) => [p.id, p.contactId, p.sourcePath, p.isAvatar])).toEqual([
			['monica:photo:10', 'monica:contact:1', 'photos/a.jpg', true],
			['monica:photo:11', 'monica:contact:1', 'photos/b.jpg', false]
		]);
		expect(plan.report.skipped).toContainEqual({ what: 'photo', count: 1, why: 'attached to no person' });
	});

	it('reports free journal entries, derived reminders and extra users instead of losing them silently', () => {
		const exp = emptyExport();
		exp.journalEntries = [{ id: 1, title: 'Besuch Schuum', post: 'fell', createdAt: null }];
		exp.derivedReminderCount = 32;
		const plan = planMonicaImport(exp, opts);
		expect(plan.report.skipped).toContainEqual({ what: 'journal entry', count: 1, why: 'not attached to a person (Besuch Schuum)' });
		expect(plan.report.skipped).toContainEqual({ what: 'reminder', count: 32, why: 'Stella derives birthday reminders itself' });
		expect(plan.report.warnings).toContainEqual('Monica had 2 user accounts; everything is attributed to the importing member.');
	});

	it('summarises counts for the preview', () => {
		const exp = emptyExport();
		exp.contacts = [contact(1, 'A', null), contact(2, 'B', null)];
		exp.relationships = [
			{ id: 1, typeId: 10, contactIs: 1, ofContact: 2, createdAt: null },
			{ id: 2, typeId: 10, contactIs: 2, ofContact: 1, createdAt: null }
		];
		exp.notes = [{ id: 1, contactId: 1, body: 'x', isFavorited: false, createdAt: null }];
		const { counts } = planMonicaImport(exp, opts).report;
		expect(counts).toEqual({ contacts: 2, relationships: 1, relationshipTypes: 0, contactFields: 0, notes: 1, interactions: 0, tags: 0, photos: 0 });
	});
});
