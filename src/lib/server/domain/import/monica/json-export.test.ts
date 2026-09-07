import { describe, expect, test } from 'bun:test';
import { MonicaJsonError, readMonicaJsonExport } from './json-export';

/*
 * Reading Monica's JSON export (docs/02 §2.16). The fixtures below are shaped exactly like
 * Monica's own export resources (`app/ExportResources/*`, v4.1.2): every record carries a
 * `uuid` plus a `properties` object, and a record's children arrive as `{count, type, values}`
 * entries in a `data` list — a list that *omits* empty collections rather than carrying them
 * as empty, which is why nothing here may be read by position.
 */

const GENDER = { uuid: 'g-1', properties: { name: 'Man', type: 'M' } };
const FIELD_TYPE = { uuid: 'ft-1', properties: { name: 'Email', type: 'email', protocol: null } };
const ACTIVITY_TYPE = { uuid: 'at-1', properties: { translation_key: 'activity_type_ate_at_restaurant', name: 'Ate at a restaurant' } };

/** One `{count, type, values}` bucket, the way a resource collection serialises. */
const bucket = (type: string, values: unknown[]) => ({ count: values.length, type, values });

function contact(over: Record<string, unknown> = {}, data: unknown[] = [], uuid = 'c-hans') {
	return {
		uuid,
		created_at: '2019-04-02T09:15:00.000000Z',
		data,
		properties: {
			first_name: 'Hans',
			last_name: 'Brunner',
			is_partial: false,
			is_dead: false,
			avatar: { avatar_source: 'default', has_avatar: false },
			...over
		}
	};
}

function document(account: Record<string, unknown>) {
	return {
		version: '1.0-preview.1',
		app_version: '4.1.2',
		export_date: '2026-09-07T10:00:00.000000Z',
		exported_by: 'u-1',
		account: {
			uuid: 'a-1',
			created_at: '2019-01-01T00:00:00.000000Z',
			instance: { genders: [GENDER], contact_field_types: [FIELD_TYPE], activity_types: [ACTIVITY_TYPE] },
			properties: {},
			data: [],
			...account
		}
	};
}

describe('readMonicaJsonExport', () => {
	test('refuses anything that is not a Monica export', () => {
		expect(() => readMonicaJsonExport(null)).toThrow(MonicaJsonError);
		expect(() => readMonicaJsonExport({ hello: 'world' })).toThrow(MonicaJsonError);
		// A document that has an account but no version is still not one of Monica's.
		expect(() => readMonicaJsonExport({ account: { uuid: 'a-1' } })).toThrow(MonicaJsonError);
	});

	test('reads a person, keyed by uuid and named from the properties object', () => {
		const exp = readMonicaJsonExport(document({ data: [bucket('contact', [contact()])] }));

		expect(exp.contacts).toHaveLength(1);
		expect(exp.contacts[0]).toMatchObject({
			id: 'c-hans',
			firstName: 'Hans',
			lastName: 'Brunner',
			isDead: false,
			createdAt: '2019-04-02T09:15:00.000000Z'
		});
	});

	test('finds a bucket by its type, because an empty one is left out entirely', () => {
		// No `contact` bucket at all — Monica omits a collection rather than sending count 0.
		const exp = readMonicaJsonExport(document({ data: [bucket('user', [{ uuid: 'u-1' }])] }));

		expect(exp.contacts).toEqual([]);
		expect(exp.userCount).toBe(1);
	});

	test('lifts a nested birthday into a special date the mapping can look up', () => {
		const exp = readMonicaJsonExport(
			document({
				data: [
					bucket('contact', [
						contact({
							birthdate: { uuid: 'sd-1', date: '1955-11-02T00:00:00.000000Z', is_age_based: false, is_year_unknown: false }
						})
					])
				]
			})
		);

		expect(exp.contacts[0].birthdaySpecialDateId).toBe('sd-1');
		expect(exp.specialDates).toEqual([
			{ id: 'sd-1', contactId: 'c-hans', isAgeBased: false, isYearUnknown: false, date: '1955-11-02' }
		]);
	});

	test('reads a gender by the uuid the person points at', () => {
		const exp = readMonicaJsonExport(document({ data: [bucket('contact', [contact({ gender: 'g-1' })])] }));

		expect(exp.contacts[0].genderId).toBe('g-1');
		expect(exp.genders).toEqual([{ id: 'g-1', type: 'M', name: 'Man' }]);
	});

	test('reads a contact field and the type it points at', () => {
		const exp = readMonicaJsonExport(
			document({
				data: [
					bucket('contact', [
						contact({}, [
							bucket('contact_field', [
								{ uuid: 'cf-1', created_at: '2020-01-01T00:00:00.000000Z', properties: { data: 'hans@example.test', type: 'ft-1' } }
							])
						])
					])
				]
			})
		);

		expect(exp.contactFields).toEqual([
			{ id: 'cf-1', contactId: 'c-hans', typeId: 'ft-1', data: 'hans@example.test', createdAt: '2020-01-01T00:00:00.000000Z' }
		]);
		expect(exp.contactFieldTypes).toEqual([{ id: 'ft-1', name: 'Email', type: 'email', protocol: null }]);
	});

	test('reads notes off the person they belong to', () => {
		const exp = readMonicaJsonExport(
			document({
				data: [
					bucket('contact', [
						contact({}, [
							bucket('note', [
								{ uuid: 'n-1', created_at: '2021-05-05T00:00:00.000000Z', properties: { body: 'Allergic to hazelnuts', is_favorite: true } }
							])
						])
					])
				]
			})
		);

		expect(exp.notes).toEqual([
			{ id: 'n-1', contactId: 'c-hans', body: 'Allergic to hazelnuts', isFavorited: true, createdAt: '2021-05-05T00:00:00.000000Z' }
		]);
	});

	test('makes a relationship type out of the name, because the export carries no type list', () => {
		const exp = readMonicaJsonExport(
			document({
				data: [
					bucket('contact', [contact(), contact({ first_name: 'Rosa' }, [], 'c-rosa')]),
					bucket('relationship', [
						{ uuid: 'r-1', created_at: null, properties: { type: 'spouse', contact_is: 'c-hans', of_contact: 'c-rosa' } },
						{ uuid: 'r-2', created_at: null, properties: { type: 'spouse', contact_is: 'c-rosa', of_contact: 'c-hans' } }
					])
				]
			})
		);

		// One type for the two links that share a name, keyed by the name itself.
		expect(exp.relationshipTypes).toEqual([{ id: 'spouse', name: 'spouse', nameReverse: 'spouse' }]);
		expect(exp.relationships.map((r) => r.typeId)).toEqual(['spouse', 'spouse']);
		expect(exp.relationships[0]).toMatchObject({ id: 'r-1', contactIs: 'c-hans', ofContact: 'c-rosa' });
	});

	test('links an activity to the people whose own list names it', () => {
		const exp = readMonicaJsonExport(
			document({
				data: [
					bucket('contact', [contact({}, [bucket('activity', ['ac-1'])])]),
					bucket('activity', [
						{ uuid: 'ac-1', created_at: null, properties: { summary: 'Lunch', description: null, happened_at: '2024-03-01T00:00:00.000000Z', type: 'at-1' } }
					])
				]
			})
		);

		expect(exp.activities).toEqual([
			{
				id: 'ac-1',
				summary: 'Lunch',
				description: null,
				happenedAt: '2024-03-01',
				typeKey: 'activity_type_ate_at_restaurant',
				contactIds: ['c-hans'],
				createdAt: null
			}
		]);
	});

	test('turns the names on a person into tags, one per name however many wear it', () => {
		const exp = readMonicaJsonExport(
			document({
				data: [
					bucket('contact', [
						contact({ tags: ['family', 'bern'] }),
						contact({ first_name: 'Rosa', tags: ['family'] }, [], 'c-rosa')
					])
				]
			})
		);

		expect(exp.tags).toEqual([
			{ id: 'family', name: 'family', contactIds: ['c-hans', 'c-rosa'] },
			{ id: 'bern', name: 'bern', contactIds: ['c-hans'] }
		]);
	});

	test('reads a photo and whose it is, with the image still inside the file', () => {
		const exp = readMonicaJsonExport(
			document({
				data: [
					bucket('contact', [contact({}, [bucket('photo', ['p-1'])])]),
					bucket('photo', [
						{
							uuid: 'p-1',
							created_at: null,
							properties: { original_filename: 'hans.jpg', filesize: 1234, mime_type: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,AAAA' }
						}
					])
				]
			})
		);

		expect(exp.photos).toEqual([
			{
				id: 'p-1',
				path: 'hans.jpg',
				mime: 'image/jpeg',
				sizeBytes: 1234,
				contactId: 'c-hans',
				createdAt: null,
				// The picture travels inside the file; there is no folder to point at.
				dataUrl: 'data:image/jpeg;base64,AAAA'
			}
		]);
	});

	test('reads the free-standing journal entries and leaves the day ratings alone', () => {
		const exp = readMonicaJsonExport(
			document({
				properties: {
					journal_entries: [
						{ uuid: 'j-1', created_at: '2024-02-02T00:00:00.000000Z', properties: { type: 'entry', title: 'A good day', post: 'We walked.', date: '2024-02-02' } },
						{ uuid: 'j-2', created_at: null, properties: { type: 'day', rate: 3, day: 2, month: 2, year: 2024 } }
					]
				}
			})
		);

		expect(exp.journalEntries).toEqual([
			{ id: 'j-1', title: 'A good day', post: 'We walked.', createdAt: '2024-02-02T00:00:00.000000Z' }
		]);
	});
});
