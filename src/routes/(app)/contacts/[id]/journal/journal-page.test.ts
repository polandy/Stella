import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import { TranslatableError } from '$lib/i18n/translatable';
import { phrase } from '$lib/i18n/phrase';
import type { Locale } from '$lib/i18n/locales';
import { mentionToken } from '$lib/mentions/mentions';
import type { CommandHandlers } from '$lib/server/domain/commands/dispatch';
import type { Contact } from '$lib/server/domain/contacts/contacts';
import type { JournalRepository } from '$lib/server/domain/journal/journal';
import {
	commandDepsWith,
	contactRepositoryWith,
	fixedClock,
	inMemoryContactDirectory,
	inMemoryContactNames,
	inMemoryReceipts,
	journalRepositoryWith,
	sequentialIds,
	somebody,
	someJournalEntry
} from '$lib/server/domain/testing';
import {
	answerOf,
	formOf,
	MEMBER,
	routeEvent,
	type EdgeAnswer,
	type FakeServices
} from '$lib/server/testing';
import { actions, load } from './+page.server';

/*
 * A person's journal page (docs/02 §2.20) as the edge answers it: the entries of a person the
 * viewer may see, an entry written as a command with its photos following, an own entry edited
 * or removed — each refusal said in the reader's language, each success back to the journal.
 * How each entry is shown (`journal-view.test.ts`), the journal use-cases and the dispatcher have
 * their own suites; the ports here only answer the way the case needs.
 */

const en = createTranslator('en');
const de = createTranslator('de');
const PAGE = { id: 'anna' };
const NOW = 5000;
const ENTRY_ID = '01HZZZZZZZZZZZZZZZZZZZZZZA';

/** Where every success lands: Anna's journal. */
const BACK: EdgeAnswer = { kind: 'redirect', status: 303, location: '/contacts/anna/journal' };

/** The refusal shown above the journal, with its status. */
const refused = (status: number, journalError: string): EdgeAnswer => ({
	kind: 'fail',
	status,
	data: { journalError }
});

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
	avatarPhotoId: 'av1',
	isDeceased: false,
	archivedAt: null
};

/**
 * Whom the viewer can see: Anna, Ben, Pia (private, so only a private entry may name her) and
 * two people called Thomas with nothing else typed.
 */
const PEOPLE = [
	somebody('anna', 'Anna Berg', { firstName: 'Anna', lastName: 'Berg' }),
	somebody('ben', 'Ben Brunner', { firstName: 'Ben', lastName: 'Brunner' }),
	somebody('t1', 'Thomas', { firstName: 'Thomas' }),
	somebody('t2', 'Thomas', { firstName: 'Thomas' }),
	somebody('pia', 'Pia Paul', { firstName: 'Pia', lastName: 'Paul', visibility: 'private' })
];

/** Anna, as the viewer sees her or not. */
const people = (visible = true) => ({
	contactDeps: {
		contacts: contactRepositoryWith({
			findByIdVisibleTo: async (_viewer, id) => (visible && id === ANNA.id ? ANNA : null)
		}),
		ids: sequentialIds(),
		clock: fixedClock(NOW)
	}
});

/** The journal's port over `entries`, its writes kept for the test. */
function journalOver(
	entries = [someJournalEntry('e1'), someJournalEntry('e2', { createdBy: 'u2' })],
	writes: Partial<JournalRepository> = {}
) {
	const edited: { id: string; title: string | null; body: string; updatedAt: number }[] = [];
	const mentioned: [string, string[]][] = [];
	const unlinked: string[] = [];
	const journal = journalRepositoryWith({
		listForContactVisibleTo: async (_viewer, contactId) =>
			entries.filter((e) => e.contactId === contactId),
		updateOwn: async ({ authorId, id, title, body, updatedAt }) => {
			const own = entries.some((e) => e.id === id && e.createdBy === authorId);
			if (own) edited.push({ id, title, body, updatedAt });
			return own;
		},
		replaceMentions: async (id, ids) => void mentioned.push([id, ids]),
		deleteOwn: async ({ authorId, id }) =>
			entries.some((e) => e.id === id && e.createdBy === authorId)
				? [{ filePath: `${id}.webp`, thumbPath: `${id}-thumb.webp` }]
				: null,
		...writes
	});
	const journalDeps = {
		journal,
		media: { delete: async (path: string) => void unlinked.push(path) },
		ids: sequentialIds(),
		clock: fixedClock(NOW)
	};
	return { journalDeps, edited, mentioned, unlinked };
}

/** Runs `action` on Anna's journal with `form` posted, over `services`. */
const post = (
	action: (event: never) => unknown,
	services: FakeServices,
	form: FormData,
	locale: Locale = 'en'
) => answerOf(action(routeEvent({ services, params: PAGE, form, locale })));

describe('load', () => {
	function services(visible = true): FakeServices {
		const { journalDeps } = journalOver([
			someJournalEntry('e1', { body: `Met ${mentionToken('ben')}` }),
			someJournalEntry('e2', { createdBy: 'u2' }),
			someJournalEntry('elsewhere', { contactId: 'ben' })
		]);
		return {
			people: {
				...people(visible),
				contactNameDeps: { contactNames: inMemoryContactNames(PEOPLE) }
			},
			story: { journalDeps },
			media: {
				journalPhotos: {
					listJournalPhotos: async () => [{ id: 'p1', journalEntryId: 'e2' }],
					listJournalPhotosOfEntries: async () => []
				}
			},
			household: {
				memberDeps: {
					members: {
						listMembers: async () => [
							{ id: MEMBER.id, name: MEMBER.name },
							{ id: 'u2', name: 'Ben Brunner' }
						]
					}
				}
			}
		};
	}

	it('shows the person and their entries, each by its author and with its photos', async () => {
		const answer = await answerOf(load(routeEvent({ services: services(), params: PAGE })));
		expect(answer.kind).toBe('data');
		const data = (answer as { data: { contact: unknown; entries: unknown[] } }).data;
		expect(data.contact).toEqual({ id: 'anna', displayName: 'Anna Berg', avatarPhotoId: 'av1' });
		expect(data.entries).toEqual([
			expect.objectContaining({
				id: 'e1',
				author: 'you',
				mine: true,
				mentionNames: { ben: 'Ben Brunner' },
				photos: []
			}),
			expect.objectContaining({ id: 'e2', author: 'Ben', mine: false, photos: ['p1'] })
		]);
	});

	it('answers a person the viewer may not see as not there', async () => {
		const answer = await answerOf(load(routeEvent({ services: services(false), params: PAGE })));
		expect(answer).toEqual(NOT_FOUND);
	});

	it('sends somebody not signed in to log in', async () => {
		const answer = await answerOf(load(routeEvent({ services: {}, user: null, params: PAGE })));
		expect(answer).toEqual({ kind: 'redirect', status: 302, location: '/login' });
	});
});

describe('save', () => {
	const entry = { commandId: ENTRY_ID, entryDate: '2026-10-09', body: 'A walk by the river' };
	const written = { entryId: 'e1', anchorContactId: 'anna', visibility: 'shared' as const };
	const writing = (): Partial<CommandHandlers> => ({ 'journal.write': async () => written });
	const photo = {
		image: new File([new Uint8Array([1, 2])], 'a.webp'),
		thumb: new File([new Uint8Array([3])], 'a-thumb.webp'),
		width: '800',
		height: '600'
	};

	/** Posts `form` to save over handlers the test names; returns the receipt book too. */
	async function save(
		form: FormData,
		handlers: Partial<CommandHandlers>,
		{ visible = true, locale = 'en' as Locale } = {}
	) {
		const receipts = inMemoryReceipts();
		const services = {
			people: people(visible),
			offline: { commandDeps: commandDepsWith(handlers, receipts) }
		};
		return { answer: await post(actions.save!, services, form, locale), receipts };
	}

	it("writes the entry under the id the form named, about the address's person", async () => {
		const payloads: unknown[] = [];
		const { answer, receipts } = await save(formOf(entry), {
			'journal.write': async (_actor, payload) => {
				payloads.push(payload);
				return written;
			}
		});
		expect(answer).toEqual(BACK);
		expect(payloads).toEqual([expect.objectContaining({ contactId: 'anna', body: entry.body })]);
		expect(await receipts.find(ENTRY_ID)).toMatchObject({ status: 'applied' });
	});

	it('gives a form posted without JavaScript an id of its own', async () => {
		const { commandId: _, ...withoutId } = entry;
		const { answer } = await save(formOf(withoutId), writing());
		expect(answer).toEqual(BACK);
	});

	it('answers a person the viewer may not see as not there, and writes nothing', async () => {
		const { answer } = await save(formOf(entry), {}, { visible: false });
		expect(answer).toEqual(NOT_FOUND);
	});

	it('sends somebody not signed in to log in', async () => {
		const answer = await answerOf(
			actions.save!(routeEvent({ services: {}, user: null, params: PAGE, form: formOf(entry) }))
		);
		expect(answer).toEqual({ kind: 'redirect', status: 302, location: '/login' });
	});

	describe('a form that does not read', () => {
		const refusals = [
			['no text', { body: '' }, 'errors.note.empty'],
			['a day that is no day', { entryDate: 'soon' }, 'errors.journal.badDay'],
			['a visibility it does not know', { visibility: 'secret' }, 'errors.journal.couldNotSave'],
			['a command id that is not one', { commandId: 'nope' }, 'errors.journal.couldNotSave']
		] as const;
		for (const [what, change, key] of refusals) {
			it(`says what is wrong with ${what}, and writes nothing`, async () => {
				const { answer } = await save(formOf({ ...entry, ...change }), {});
				expect(answer).toEqual(refused(400, en(key)));
			});
		}

		it('says it in the reader’s language', async () => {
			const { answer } = await save(
				formOf({ ...entry, visibility: 'secret' }),
				{},
				{ locale: 'de' }
			);
			expect(answer).toEqual(refused(400, de('errors.journal.couldNotSave')));
		});
	});

	it('says why the entry was refused, in the reader’s language', async () => {
		const { answer } = await save(
			formOf(entry),
			{
				'journal.write': async () => {
					throw new TranslatableError(phrase('errors.contact.notFound'), 'Refused');
				}
			},
			{ locale: 'de' }
		);
		expect(answer).toEqual(refused(400, de('errors.contact.notFound')));
	});

	it('says it could not save while the same entry is still being saved', async () => {
		const receipts = inMemoryReceipts();
		await receipts.claim({
			id: ENTRY_ID,
			memberId: MEMBER.id,
			householdId: MEMBER.householdId,
			type: 'journal.write',
			claimedAt: 0
		});
		const services = {
			people: people(),
			offline: { commandDeps: commandDepsWith(writing(), receipts) }
		};
		const answer = await post(actions.save!, services, formOf(entry));
		expect(answer).toEqual(refused(400, en('errors.journal.couldNotSave')));
	});

	describe('with photos', () => {
		it('stores each photo under the entry', async () => {
			const parents: string[] = [];
			const { answer } = await save(formOf({ ...entry, ...photo }), {
				...writing(),
				'moment.photo': async (_actor, payload) => {
					parents.push(payload.parentId);
					return 'stored-photo';
				}
			});
			expect(answer).toEqual(BACK);
			expect(parents).toEqual([ENTRY_ID]);
		});

		it('passes over a photo that came without its thumbnail', async () => {
			const { thumb: _, ...withoutThumb } = photo;
			const { answer } = await save(formOf({ ...entry, ...withoutThumb }), writing());
			expect(answer).toEqual(BACK);
		});

		it('says the entry was saved but a photo was not, when a photo does not read', async () => {
			const { answer, receipts } = await save(
				formOf({ ...entry, ...photo, width: 'wide' }),
				writing()
			);
			expect(answer).toEqual(refused(400, en('errors.journal.photoFailed')));
			expect(await receipts.find(ENTRY_ID)).toMatchObject({ status: 'applied' });
		});

		it('says why a photo was refused', async () => {
			const { answer } = await save(formOf({ ...entry, ...photo }), {
				...writing(),
				'moment.photo': async () => {
					throw new TranslatableError(phrase('errors.image.empty'), 'Refused');
				}
			});
			expect(answer).toEqual(refused(400, en('errors.image.empty')));
		});
	});
});

describe('edit', () => {
	const change = { id: 'e1', title: 'Sunday', body: 'A walk with @BenBrunner' };

	/** Posts `form` to edit over the journal and the people the viewer can see. */
	async function edit(form: FormData, journal = journalOver(), { locale = 'en' as Locale } = {}) {
		const services: FakeServices = {
			story: { journalDeps: journal.journalDeps },
			people: {
				contactDirectoryDeps: { directory: inMemoryContactDirectory(PEOPLE) },
				namesakeContextDeps: {
					contextReads: {
						listTiesOfVisibleTo: async () => [],
						listMembershipsOfVisibleTo: async () => []
					},
					selfContactOf: async () => null,
					clock: fixedClock(NOW)
				}
			}
		};
		return post(actions.edit!, services, form, locale);
	}

	it('changes the text of an own entry, links whom it names, and goes back', async () => {
		const journal = journalOver();
		const answer = await edit(formOf(change), journal);
		expect(answer).toEqual(BACK);
		expect(journal.edited).toEqual([
			{ id: 'e1', title: 'Sunday', body: `A walk with ${mentionToken('ben')}`, updatedAt: NOW }
		]);
		expect(journal.mentioned).toEqual([['e1', ['ben']]]);
	});

	it('does not link the person the journal is about', async () => {
		const journal = journalOver();
		await edit(formOf({ ...change, body: `${mentionToken('anna')} and @BenBrunner` }), journal);
		expect(journal.mentioned).toEqual([['e1', ['ben']]]);
	});

	it('clears a title left empty', async () => {
		const journal = journalOver();
		await edit(formOf({ ...change, title: '' }), journal);
		expect(journal.edited[0]!.title).toBeNull();
	});

	it('refuses an entry by another member before writing anything', async () => {
		// The port would take it: the edge's own check is what refuses.
		const written: string[] = [];
		const journal = journalOver(undefined, {
			updateOwn: async ({ id }) => {
				written.push(id);
				return true;
			}
		});
		const answer = await edit(formOf({ ...change, id: 'e2' }), journal);
		expect(answer).toEqual(refused(404, en('errors.journal.gone')));
		expect(written).toEqual([]);
	});

	it('names only the people the entry’s own audience may name', async () => {
		const journal = journalOver([
			someJournalEntry('e1'),
			someJournalEntry('e3', { visibility: 'private' })
		]);
		await edit(formOf({ id: 'e1', body: 'Tea with @PiaPaul' }), journal);
		await edit(formOf({ id: 'e3', body: 'Tea with @PiaPaul' }), journal);
		expect(journal.edited.map((e) => e.body)).toEqual([
			'Tea with @PiaPaul',
			`Tea with ${mentionToken('pia')}`
		]);
		expect(journal.mentioned).toEqual([
			['e1', []],
			['e3', ['pia']]
		]);
	});

	it('answers an entry that is not there as gone, in the reader’s language', async () => {
		const answer = await edit(formOf({ ...change, id: 'gone' }), journalOver(), { locale: 'de' });
		expect(answer).toEqual(refused(404, de('errors.journal.gone')));
	});

	it('answers an entry that went while it was edited as gone', async () => {
		const answer = await edit(
			formOf(change),
			journalOver(undefined, { updateOwn: async () => false })
		);
		expect(answer).toEqual(refused(404, en('errors.journal.gone')));
	});

	it('asks which one a typed namesake means, in the reader’s language', async () => {
		const journal = journalOver();
		const answer = await edit(formOf({ ...change, body: 'Tea with @Thomas' }), journal, {
			locale: 'de'
		});
		expect(answer).toMatchObject({ kind: 'fail', status: 400 });
		const said = (answer as { data: { journalError: string } }).data.journalError;
		// Up to the people it names, whom `resolve-for-audience.test.ts` pins.
		const [lead] = de('errors.mention.ambiguous', {
			handle: 'Thomas',
			count: 2,
			people: '|'
		}).split('|');
		expect(said).toStartWith(lead!);
		expect(journal.edited).toEqual([]);
	});

	it('lets a breakage of ours through to the error handler, rather than calling it a refusal', async () => {
		const answer = edit(
			formOf(change),
			journalOver(undefined, {
				updateOwn: async () => {
					throw new Error('disk full');
				}
			})
		);
		await expect(answer).rejects.toThrow('disk full');
	});

	describe('a form that does not read', () => {
		for (const locale of ['en', 'de'] as const) {
			const say = createTranslator(locale);
			it(`asks for text when there are only spaces, in ${locale}, and writes nothing`, async () => {
				const journal = journalOver();
				const answer = await edit(formOf({ ...change, body: '   ' }), journal, { locale });
				expect(answer).toEqual(refused(400, say('errors.note.empty')));
				expect(journal.edited).toEqual([]);
			});

			// Forms the page never posts get the general sentence.
			const unposted = [
				['no entry', { title: 'Sunday', body: 'A walk' }],
				['no text field', { id: 'e1', title: 'Sunday' }]
			] as const;
			for (const [what, form] of unposted) {
				it(`asks to check a form with ${what}, in ${locale}`, async () => {
					const answer = await edit(formOf(form), journalOver(), { locale });
					expect(answer).toEqual(refused(400, say('errors.form.checkAndRetry')));
				});
			}
		}
	});

	it('sends somebody not signed in to log in', async () => {
		const answer = await answerOf(
			actions.edit!(routeEvent({ services: {}, user: null, params: PAGE, form: formOf(change) }))
		);
		expect(answer).toEqual({ kind: 'redirect', status: 302, location: '/login' });
	});
});

describe('delete', () => {
	const remove = (form: FormData, journal = journalOver(), locale: Locale = 'en') =>
		post(actions.delete!, { story: { journalDeps: journal.journalDeps } }, form, locale);

	it('removes an own entry with the files of its photos, and goes back', async () => {
		const journal = journalOver();
		expect(await remove(formOf({ id: 'e1' }), journal)).toEqual(BACK);
		expect(journal.unlinked).toEqual(['e1.webp', 'e1-thumb.webp']);
	});

	it("answers an entry that is gone, or another member's, as gone — never as removed", async () => {
		const journal = journalOver();
		expect(await remove(formOf({ id: 'e2' }), journal)).toEqual(
			refused(404, en('errors.journal.gone'))
		);
		expect(await remove(formOf({ id: 'gone' }), journal, 'de')).toEqual(
			refused(404, de('errors.journal.gone'))
		);
		expect(journal.unlinked).toEqual([]);
	});

	it('asks to check a form that names no entry, in the reader’s language', async () => {
		expect(await remove(formOf({}))).toEqual(refused(400, en('errors.form.checkAndRetry')));
		expect(await remove(formOf({}), journalOver(), 'de')).toEqual(
			refused(400, de('errors.form.checkAndRetry'))
		);
	});

	it('sends somebody not signed in to log in', async () => {
		const answer = await answerOf(
			actions.delete!(
				routeEvent({ services: {}, user: null, params: PAGE, form: formOf({ id: 'e1' }) })
			)
		);
		expect(answer).toEqual({ kind: 'redirect', status: 302, location: '/login' });
	});
});
