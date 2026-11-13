import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import { createImmichMediaSigner } from '$lib/server/domain/immich/signed-media';
import type { OwnEntryImmichPhotos } from '$lib/server/domain/immich/entry-immich-photos';
import {
	fixedClock,
	inMemoryContactDirectory,
	journalRepositoryWith,
	sequentialIds,
	somebody,
	someJournalEntry
} from '$lib/server/domain/testing';
import { answerOf, formOf, routeEvent, type FakeServices } from '$lib/server/testing';
import { actions } from './+page.server';

/*
 * Immich photos on an entry as references (docs/02 §2.20, docs/04 ADR-132): `linkImmichPhotos`
 * refers to the picker's signed photos from the author's own entry, `edit` takes the marked ones
 * off. Without Immich a pick is refused while taking a reference off still works, since it never
 * reaches Immich.
 */

const en = createTranslator('en');
const de = createTranslator('de');
const PAGE = { id: 'anna' };
const ASSET = '11111111-1111-4111-8111-111111111111';
const signer = createImmichMediaSigner({ secret: 'test-secret', clock: fixedClock(5000) });

const pickToken = async (householdId = 'h1') =>
	signer.sign({ kind: 'library', householdId, assetId: ASSET, size: 'thumbnail' });

/** u1's own entry e1 and u2's e2, with the references in memory. */
function references() {
	const linked: { entryId: string; assetId: string }[] = [];
	const owners: Record<string, string> = { e1: 'u1', e2: 'u2' };
	const entries: OwnEntryImmichPhotos = {
		async linkOwn(authorId, entryId, assetIds) {
			if (owners[entryId] !== authorId) return false;
			for (const assetId of assetIds) linked.push({ entryId, assetId });
			return true;
		},
		async unlinkOwn(authorId, entryId, assetId) {
			const at = linked.findIndex((l) => l.entryId === entryId && l.assetId === assetId);
			if (owners[entryId] !== authorId || at === -1) return false;
			linked.splice(at, 1);
			return true;
		}
	};
	return { entries, linked };
}

describe('linkImmichPhotos', () => {
	const link = (form: FormData, refs = references(), immich = true, locale: 'en' | 'de' = 'en') =>
		answerOf(
			actions.linkImmichPhotos!(
				routeEvent({
					services: {
						immich: immich ? { entryImmichPhotoDeps: { entries: refs.entries, signer } } : null
					},
					params: PAGE,
					form,
					locale
				})
			)
		);

	it('refers to the picked photo from the author’s own entry', async () => {
		const refs = references();
		const answer = await link(formOf({ id: 'e1', tokens: [await pickToken()] }), refs);
		expect(answer).toEqual({ kind: 'data', data: { linked: 1 } });
		expect(refs.linked).toEqual([{ entryId: 'e1', assetId: ASSET }]);
	});

	it('refuses a pick when Immich is not connected, in the reader’s language', async () => {
		const refs = references();
		expect(await link(formOf({ id: 'e1', tokens: ['t'] }), refs, false, 'de')).toEqual({
			kind: 'fail',
			status: 409,
			data: { journalError: de('errors.photo.immichNotConnected') }
		});
		expect(refs.linked).toEqual([]);
	});

	it('refuses a photo Stella did not list for this household as no longer available', async () => {
		const refs = references();
		for (const tokens of [[await pickToken('h2')], [ASSET], []]) {
			expect(await link(formOf({ id: 'e1', tokens }), refs)).toEqual({
				kind: 'fail',
				status: 400,
				data: { journalError: en('errors.photo.fromImmichGone') }
			});
		}
		expect(refs.linked).toEqual([]);
	});

	it('answers another member’s entry as gone', async () => {
		const refs = references();
		expect(await link(formOf({ id: 'e2', tokens: [await pickToken()] }), refs)).toEqual({
			kind: 'fail',
			status: 404,
			data: { journalError: en('errors.journal.gone') }
		});
		expect(refs.linked).toEqual([]);
	});
});

describe('edit, taking Immich photos off', () => {
	function services(refs: ReturnType<typeof references>): FakeServices {
		const entries = [someJournalEntry('e1', { contactId: 'anna' })];
		return {
			story: {
				journalDeps: {
					journal: journalRepositoryWith({
						listForContactVisibleTo: async () => entries,
						updateOwn: async () => true,
						setSubjectsOwn: async ({ id }) => id,
						replaceMentions: async () => {},
						replaceTags: async () => {}
					}),
					media: { delete: async () => {} },
					ids: sequentialIds(),
					clock: fixedClock(5000)
				}
			},
			media: { ownEntryImmichPhotos: refs.entries },
			// Taking a reference off never reaches Immich, so it works without it.
			immich: null,
			people: {
				contactDirectoryDeps: {
					directory: inMemoryContactDirectory([somebody('anna', 'Anna Berg')])
				},
				namesakeContextDeps: {
					contextReads: {
						listTiesOfVisibleTo: async () => [],
						listMembershipsOfVisibleTo: async () => []
					},
					selfContactOf: async () => null,
					clock: fixedClock(5000)
				}
			}
		};
	}

	it('drops only Stella’s reference and goes back', async () => {
		const refs = references();
		refs.linked.push({ entryId: 'e1', assetId: ASSET }, { entryId: 'e2', assetId: ASSET });
		const answer = await answerOf(
			actions.edit!(
				routeEvent({
					services: services(refs),
					params: PAGE,
					form: formOf({ id: 'e1', body: 'A walk', unlinkImmichAssetIds: [ASSET, 'nope'] })
				})
			)
		);
		expect(answer).toEqual({ kind: 'redirect', status: 303, location: '/contacts/anna/journal' });
		expect(refs.linked).toEqual([{ entryId: 'e2', assetId: ASSET }]);
	});

	it('keeps the references when the text is refused', async () => {
		const refs = references();
		refs.linked.push({ entryId: 'e1', assetId: ASSET });
		await answerOf(
			actions.edit!(
				routeEvent({
					services: services(refs),
					params: PAGE,
					form: formOf({ id: 'e1', body: '  ', unlinkImmichAssetIds: ASSET })
				})
			)
		);
		expect(refs.linked).toHaveLength(1);
	});
});
