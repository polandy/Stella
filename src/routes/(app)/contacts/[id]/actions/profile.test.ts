import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import { JOB_FIELD_MAX_LENGTH } from '$lib/people/job';
import type { Contact, ContactRepository } from '$lib/server/domain/contacts/contacts';
import type { NameWrite } from '$lib/server/domain/contacts/name-parts';
import type { StoredPhoto } from '$lib/server/domain/media/avatars';
import { contactRepositoryWith, fixedClock, sequentialIds } from '$lib/server/domain/testing';
import {
	answerOf,
	formOf,
	MEMBER,
	routeEvent,
	type EdgeAnswer,
	type FakeServices
} from '$lib/server/testing';
import type { Locale } from '$lib/i18n/locales';
import { profileActions as actions } from './profile';

/*
 * The hero's actions on a person's page (docs/02 §2.2) as the edge answers them: the form read,
 * a person the viewer cannot see, a refusal of the use-case said in the reader's language, and a
 * success that goes back to the page. The use-cases have their own suites (`contacts.test.ts`,
 * `name-parts.test.ts`, `avatars.test.ts`); the ports here only answer the way the case needs.
 */

const en = createTranslator('en');
const de = createTranslator('de');
const PAGE = { id: 'anna' };
const NOW = Date.UTC(2026, 0, 1);

/** Where every success lands: the person's page. */
const BACK: EdgeAnswer = { kind: 'redirect', status: 303, location: '/contacts/anna' };
const NOT_FOUND: EdgeAnswer = {
	kind: 'error',
	status: 404,
	message: en('errors.contact.notFound')
};

const ANNA: Contact = {
	id: 'anna',
	householdId: 'h1',
	createdBy: 'u1',
	visibility: 'shared',
	displayName: 'Anna Berg',
	firstName: 'Anna',
	lastName: 'Berg',
	nickname: null,
	description: null,
	howWeMet: null,
	metDate: null,
	metPlace: null,
	birthDate: null,
	birthDatePrecision: 'full',
	gender: null,
	createdAt: 0,
	updatedAt: 0,
	formerName: null,
	jobTitle: null,
	company: null,
	avatarPhotoId: null,
	isDeceased: false,
	archivedAt: null
};

/** Runs `action` on Anna's page with `form` posted, over `services`. */
const post = (
	action: (event: never) => Promise<unknown>,
	services: FakeServices,
	form: FormData,
	locale: Locale = 'en'
) => answerOf(action(routeEvent({ services, params: PAGE, form, locale })));

/** The contact port over Anna, or over nobody the viewer may see, plus the writes it was given. */
function contactsOver(person: Contact | null, writes: Partial<ContactRepository> = {}) {
	const contactDeps = {
		contacts: contactRepositoryWith({
			findByIdVisibleTo: async (_viewer, id) => (person?.id === id ? person : null),
			...writes
		}),
		ids: sequentialIds(),
		clock: fixedClock(NOW)
	};
	return contactDeps;
}

describe('editProfile', () => {
	type ProfileWrite = Parameters<ContactRepository['updateProfile']>;

	function describing(person: Contact | null = ANNA) {
		const written: ProfileWrite[] = [];
		const services: FakeServices = {
			people: {
				contactDeps: contactsOver(person, {
					updateProfile: async (...write) => void written.push(write)
				})
			}
		};
		return { services, written };
	}

	it('saves the description, trimmed, and goes back to the page', async () => {
		const { services, written } = describing();
		const form = formOf({ description: '  Sings in the choir  ' });
		expect(await post(actions.editProfile, services, form)).toEqual(BACK);
		expect(written).toEqual([
			['anna', { displayName: 'Anna Berg', description: 'Sings in the choir', updatedAt: NOW }]
		]);
	});

	it('takes the description off when it is emptied or left out', async () => {
		for (const form of [formOf({ description: '   ' }), formOf({})]) {
			const { services, written } = describing();
			expect(await post(actions.editProfile, services, form)).toEqual(BACK);
			expect(written.map(([, write]) => write.description)).toEqual([null]);
		}
	});

	// Pinned as it is: a 400 that says the contact was not found (see the PR's findings).
	it('answers 400 for a description that is not text, and writes nothing', async () => {
		const { services, written } = describing();
		const form = formOf({ description: new File(['x'], 'x.txt') });
		expect(await post(actions.editProfile, services, form)).toEqual({
			kind: 'error',
			status: 400,
			message: en('errors.contact.notFound')
		});
		expect(written).toEqual([]);
	});

	it('answers 404 for a person the viewer cannot see', async () => {
		const { services, written } = describing(null);
		expect(await post(actions.editProfile, services, formOf({ description: 'x' }))).toEqual(
			NOT_FOUND
		);
		expect(written).toEqual([]);
	});
});

describe('editNameParts', () => {
	const name = {
		firstName: ' Anna ',
		lastName: 'Lind',
		nickname: '',
		displayName: '',
		formerName: '',
		gender: 'female'
	};
	const blank = { firstName: '', lastName: '', nickname: '', displayName: '', formerName: '' };

	/** Anna's name and gender, as the viewer sees them; the writes are the test's. */
	function renaming(person: Contact | null = ANNA, breakage?: Error) {
		const names: NameWrite[] = [];
		const genders: Parameters<ContactRepository['setGender']>[] = [];
		const services: FakeServices = {
			people: {
				nameDeps: {
					names: {
						findByIdVisibleTo: async (_viewer, id) => (person?.id === id ? person : null),
						writeNames: async (writes) => {
							if (breakage) throw breakage;
							names.push(...writes);
						}
					},
					ids: sequentialIds('a1'),
					clock: fixedClock(NOW)
				},
				contactDeps: contactsOver(person, {
					setGender: async (...write) => void genders.push(write)
				})
			}
		};
		return { services, names, genders };
	}

	it('writes the name, then the gender, and goes back to the page', async () => {
		const { services, names, genders } = renaming();
		expect(await post(actions.editNameParts, services, formOf(name))).toEqual(BACK);
		expect(
			names.map(({ id, displayName, firstName, lastName, formerName }) => ({
				id,
				displayName,
				firstName,
				lastName,
				formerName
			}))
		).toEqual([
			{
				id: 'anna',
				displayName: 'Anna Lind',
				firstName: 'Anna',
				lastName: 'Lind',
				formerName: null
			}
		]);
		expect(genders).toEqual([['anna', 'female', NOW]]);
	});

	it('keeps the replaced last name as the former one when the box is ticked', async () => {
		const { services, names } = renaming();
		const form = formOf({ ...name, keepFormerName: 'on' });
		expect(await post(actions.editNameParts, services, form)).toEqual(BACK);
		expect(names.map((write) => write.formerName)).toEqual(['Berg']);
	});

	it('takes the gender off the record when it is emptied', async () => {
		const { services, genders } = renaming();
		const form = formOf({ ...name, gender: '' });
		expect(await post(actions.editNameParts, services, form)).toEqual(BACK);
		expect(genders).toEqual([['anna', null, NOW]]);
	});

	it('leaves the gender alone when a form without the field is posted', async () => {
		const { gender: _, ...withoutGender } = name;
		const { services, names, genders } = renaming();
		expect(await post(actions.editNameParts, services, formOf(withoutGender))).toEqual(BACK);
		expect([names.length, genders]).toEqual([1, []]);
	});

	it('refuses a gender it does not know, or a part that is not text, and writes nothing', async () => {
		for (const form of [
			formOf({ ...name, gender: 'other' }),
			formOf({ ...name, firstName: new File(['x'], 'x.txt') })
		]) {
			const { services, names, genders } = renaming();
			expect(await post(actions.editNameParts, services, form)).toEqual({
				kind: 'fail',
				status: 400,
				data: { namePartsError: en('errors.contact.namePartsInvalid') }
			});
			expect([names, genders]).toEqual([[], []]);
		}
	});

	it('refuses a name with nothing left in it, in the reader’s words, and keeps the gender', async () => {
		const { services, names, genders } = renaming();
		const form = formOf({ ...blank, gender: 'male' });
		expect(await post(actions.editNameParts, services, form, 'de')).toEqual({
			kind: 'fail',
			status: 400,
			data: { namePartsError: de('errors.contact.emptyName') }
		});
		expect([names, genders]).toEqual([[], []]);
	});

	it('answers 404 for a person the viewer cannot see, and keeps the gender', async () => {
		const { services, genders } = renaming(null);
		expect(await post(actions.editNameParts, services, formOf(name))).toEqual(NOT_FOUND);
		expect(genders).toEqual([]);
	});

	it('lets a breakage of ours through, for handleError to log', async () => {
		const { services } = renaming(ANNA, new Error('disk full'));
		await expect(post(actions.editNameParts, services, formOf(name))).rejects.toThrow('disk full');
	});
});

describe('setJob', () => {
	const job = { place: 'header', jobTitle: 'Teacher', company: 'Lindholm School' };

	function employing(person: Contact | null = ANNA) {
		const jobs: Parameters<ContactRepository['setJob']>[] = [];
		const services: FakeServices = {
			people: { contactDeps: contactsOver(person, { setJob: async (...w) => void jobs.push(w) }) }
		};
		return { services, jobs };
	}

	/** The refusal under the job editor that posted. */
	const refused = (jobError: string, jobErrorAt: string): EdgeAnswer => ({
		kind: 'fail',
		status: 400,
		data: { jobError, jobErrorAt }
	});

	it('saves the title and the company together and goes back to the page', async () => {
		const { services, jobs } = employing();
		expect(await post(actions.setJob, services, formOf(job))).toEqual(BACK);
		expect(jobs).toEqual([['anna', { jobTitle: 'Teacher', company: 'Lindholm School' }, NOW]]);
	});

	it('reads a form that names no editor as the profile’s, and either field as empty', async () => {
		const { services, jobs } = employing();
		expect(await post(actions.setJob, services, formOf({ jobTitle: 'Teacher' }))).toEqual(BACK);
		expect(jobs).toEqual([['anna', { jobTitle: 'Teacher', company: null }, NOW]]);
	});

	it('refuses an editor it does not know, under the profile’s', async () => {
		const { services, jobs } = employing();
		expect(await post(actions.setJob, services, formOf({ ...job, place: 'sidebar' }))).toEqual(
			refused(en('errors.form.checkAndRetry'), 'profile')
		);
		expect(jobs).toEqual([]);
	});

	it('says a field is too long under the editor that posted it, in the reader’s words', async () => {
		const tooLong = 'x'.repeat(JOB_FIELD_MAX_LENGTH + 1);
		// A form that names no editor is the profile's.
		const posted: [string | undefined, string][] = [
			['header', 'header'],
			['profile', 'profile'],
			[undefined, 'profile']
		];
		for (const [place, reopens] of posted) {
			const { services, jobs } = employing();
			const { place: _, ...rest } = job;
			const form = formOf({ ...rest, ...(place && { place }), company: tooLong });
			expect(await post(actions.setJob, services, form, 'de')).toEqual(
				refused(de('errors.contact.jobFieldTooLong', { max: JOB_FIELD_MAX_LENGTH }), reopens)
			);
			expect(jobs).toEqual([]);
		}
	});

	it('answers 404 for a person the viewer cannot see', async () => {
		const { services, jobs } = employing(null);
		expect(await post(actions.setJob, services, formOf(job))).toEqual(NOT_FOUND);
		expect(jobs).toEqual([]);
	});
});

describe('setAvatar', () => {
	/** A JPEG as far as sniffing the bytes goes. */
	const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
	const face = {
		image: new File([JPEG], 'face.jpg'),
		thumb: new File([JPEG], 'face-thumb.jpg'),
		width: '512',
		height: '512',
		takenAt: '2023-06-01T10:00:00'
	};

	/** Anna as the viewer sees her, and the avatar ports, which keep what they are handed. */
	function uploading({
		person = ANNA as Contact | null,
		put = async (key: string) => `media/${key}`
	} = {}) {
		const inserted: StoredPhoto[] = [];
		const worn: [string, string][] = [];
		const services: FakeServices = {
			people: { contactDeps: contactsOver(person) },
			media: {
				avatarDeps: {
					photos: {
						insert: async (photo) => void inserted.push(photo),
						setContactAvatar: async (contactId, photoId) => void worn.push([contactId, photoId])
					},
					media: { put },
					ids: sequentialIds('p1'),
					clock: fixedClock(NOW)
				}
			}
		};
		return { services, inserted, worn };
	}

	const refused = (avatarError: string): EdgeAnswer => ({
		kind: 'fail',
		status: 400,
		data: { avatarError }
	});

	it('stores the face as the uploader’s, makes Anna wear it, and goes back to the page', async () => {
		const { services, inserted, worn } = uploading();
		expect(await post(actions.setAvatar, services, formOf(face))).toEqual(BACK);
		expect(
			inserted.map(({ id, contactId, createdBy, householdId, width, height, takenAt }) => ({
				id,
				contactId,
				createdBy,
				householdId,
				width,
				height,
				takenAt
			}))
		).toEqual([
			{
				id: 'p1',
				contactId: 'anna',
				createdBy: MEMBER.id,
				householdId: MEMBER.householdId,
				width: 512,
				height: 512,
				takenAt: '2023-06-01T10:00:00'
			}
		]);
		expect(worn).toEqual([['anna', 'p1']]);
	});

	it('answers 404 for a person the viewer cannot see, before the upload is touched', async () => {
		const services: FakeServices = { people: { contactDeps: contactsOver(null) } };
		expect(await post(actions.setAvatar, services, formOf(face))).toEqual(NOT_FOUND);
	});

	it('asks for a picture when the image or its thumbnail is missing or not a file', async () => {
		const { image: _, ...noImage } = face;
		const { thumb: __, ...noThumb } = face;
		for (const form of [formOf(noImage), formOf(noThumb), formOf({ ...face, image: 'face' })]) {
			const { services, inserted } = uploading();
			expect(await post(actions.setAvatar, services, form)).toEqual(
				refused(en('errors.image.chooseOne'))
			);
			expect(inserted).toEqual([]);
		}
	});

	it('says why the upload was refused, in the reader’s words', async () => {
		const cases = [
			[
				{ ...face, image: new File(['not a picture'], 'face.jpg') },
				'errors.image.unsupportedFormat'
			],
			[{ ...face, takenAt: '2099-01-01T00:00:00' }, 'errors.image.takenAt']
		] as const;
		for (const [fields, key] of cases) {
			const { services, inserted } = uploading();
			expect(await post(actions.setAvatar, services, formOf(fields), 'de')).toEqual(
				refused(de(key))
			);
			expect(inserted).toEqual([]);
		}
	});

	// Pinned as it is: a breakage of ours becomes a 400, never logged (see the PR's findings).
	it('answers a failed save with “could not save”', async () => {
		const put = async (): Promise<string> => {
			throw new Error('disk full');
		};
		expect(await post(actions.setAvatar, uploading({ put }).services, formOf(face))).toEqual(
			refused(en('errors.image.couldNotSave'))
		);
	});
});

describe('a visitor who is not signed in', () => {
	it('is sent to log in by every profile action, before anything is read', async () => {
		for (const [name, action] of Object.entries(actions)) {
			const event = routeEvent<never>({ services: {}, user: null, params: PAGE, form: formOf({}) });
			expect({ name, answer: await answerOf(action(event)) }).toEqual({
				name,
				answer: { kind: 'redirect', status: 302, location: '/login' }
			});
		}
	});
});
