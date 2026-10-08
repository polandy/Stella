import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import type { CommandHandlers } from '$lib/server/domain/commands/dispatch';
import { MomentNeedsPersonError, type CapturedMoment } from '$lib/server/domain/moments/moments';
import { commandDepsWith, inMemoryReceipts } from '$lib/server/domain/testing';
import { answerOf, formOf, MEMBER, routeEvent } from '$lib/server/testing';
import { actions } from './+page.server';

/*
 * Home's capture (docs/02 §2.22.1) as the edge answers it: the moment read off the form, a
 * refusal said in the composer with the draft kept, then each photo as a command of its own
 * under the moment — and back Home, with the link hint when the moment named two people. The
 * moment and photo use-cases have their own suites; their handlers here only answer.
 */

const t = createTranslator('en');
const MOMENT_ID = '01HZZZZZZZZZZZZZZZZZZZZZZA';
const PHOTO_ID = '01HZZZZZZZZZZZZZZZZZZZZZZB';
const moment = { commandId: MOMENT_ID, body: 'Coffee with @Anna', entryDate: '2026-10-09' };
const captured: CapturedMoment & { visibility: 'shared' } = {
	entryId: 'e1',
	anchorContactId: 'anna',
	mentionedContactIds: [],
	createdContactIds: [],
	linkSuggestion: null,
	visibility: 'shared'
};
const photo = (photoId = PHOTO_ID) => ({
	image: new File([new Uint8Array([1, 2])], 'a.webp'),
	thumb: new File([new Uint8Array([3])], 'a-thumb.webp'),
	width: '800',
	height: '600',
	photoId
});

/** Posts `form` to the capture action over handlers the test names; returns the receipt book too. */
async function capture(form: FormData, handlers: Partial<CommandHandlers>) {
	const receipts = inMemoryReceipts();
	const services = { offline: { commandDeps: commandDepsWith(handlers, receipts) } };
	const answer = await answerOf(actions.capture!(routeEvent({ services, form })));
	return { answer, receipts };
}

const capturing = (result = captured) => ({ 'moment.capture': async () => result });

describe('capture', () => {
	it('saves the moment under the id the composer named, and goes back Home', async () => {
		const { answer, receipts } = await capture(formOf(moment), capturing());
		expect(answer).toEqual({ kind: 'redirect', status: 303, location: '/' });
		expect(await receipts.find(MOMENT_ID)).toMatchObject({ status: 'applied' });
	});

	it('goes back Home with the link hint when the moment named two people', async () => {
		const { answer } = await capture(
			formOf(moment),
			capturing({ ...captured, linkSuggestion: ['anna', 'ben'] })
		);
		expect(answer).toEqual({ kind: 'redirect', status: 303, location: '/?link=anna,ben' });
	});

	it('gives a form posted without JavaScript an id of its own', async () => {
		const { commandId: _, ...withoutId } = moment;
		const { answer } = await capture(formOf(withoutId), capturing());
		expect(answer).toMatchObject({ kind: 'redirect' });
	});

	it('refuses to come back without the signed-in member', async () => {
		const answer = await answerOf(
			actions.capture!(routeEvent({ services: {}, user: null, form: formOf(moment) }))
		);
		expect(answer).toEqual({ kind: 'redirect', status: 302, location: '/login' });
	});

	describe('a form that does not read', () => {
		const refusals = [
			['no text', { body: '' }, 'errors.moment.needText', ''],
			['a day that is no day', { entryDate: 'soon' }, 'errors.moment.badDay', moment.body],
			[
				'a visibility it does not know',
				{ visibility: 'secret' },
				'errors.moment.couldNotSave',
				moment.body
			],
			[
				'a command id that is not one',
				{ commandId: 'nope' },
				'errors.command.malformed',
				moment.body
			]
		] as const;
		for (const [what, change, key, draft] of refusals) {
			it(`says what is wrong with ${what}, and keeps the draft`, async () => {
				const { answer } = await capture(formOf({ ...moment, ...change }), {});
				expect(answer).toEqual({
					kind: 'fail',
					status: 400,
					data: { momentError: t(key), draft }
				});
			});
		}
	});

	it('says why the moment was refused, and keeps the draft', async () => {
		const { answer } = await capture(formOf(moment), {
			'moment.capture': async () => {
				throw new MomentNeedsPersonError();
			}
		});
		expect(answer).toEqual({
			kind: 'fail',
			status: 400,
			data: { momentError: t('errors.moment.needsPerson'), draft: moment.body }
		});
	});

	it('says it could not save while the same moment is still being saved', async () => {
		const receipts = inMemoryReceipts();
		await receipts.claim({
			id: MOMENT_ID,
			memberId: MEMBER.id,
			householdId: MEMBER.householdId,
			type: 'moment.capture',
			claimedAt: 0
		});
		const services = { offline: { commandDeps: commandDepsWith(capturing(), receipts) } };
		const answer = await answerOf(actions.capture!(routeEvent({ services, form: formOf(moment) })));
		expect(answer).toEqual({
			kind: 'fail',
			status: 400,
			data: { momentError: t('errors.moment.couldNotSave'), draft: moment.body }
		});
	});
});

describe('capture with photos', () => {
	it('stores each photo under the moment, by the id the composer named it', async () => {
		const parents: string[] = [];
		const { answer, receipts } = await capture(formOf({ ...moment, ...photo() }), {
			...capturing(),
			'moment.photo': async (_actor, payload) => {
				parents.push(payload.parentId);
				return 'stored-photo';
			}
		});
		expect(answer).toEqual({ kind: 'redirect', status: 303, location: '/' });
		expect(parents).toEqual([MOMENT_ID]);
		expect(await receipts.find(PHOTO_ID)).toMatchObject({ status: 'applied' });
	});

	it('makes an id for a photo the composer did not name', async () => {
		const stored: string[] = [];
		const { answer } = await capture(formOf({ ...moment, ...photo('') }), {
			...capturing(),
			'moment.photo': async () => {
				stored.push('photo');
				return 'stored-photo';
			}
		});
		expect(answer).toMatchObject({ kind: 'redirect' });
		expect(stored).toEqual(['photo']);
	});

	it('says the moment was saved but a photo was not, when a photo does not read', async () => {
		const { answer } = await capture(formOf({ ...moment, ...photo(), width: 'wide' }), capturing());
		expect(answer).toEqual({
			kind: 'fail',
			status: 400,
			data: { momentError: t('errors.moment.photoFailed'), draft: '' }
		});
	});

	it('says the same when the photo is refused', async () => {
		const { answer, receipts } = await capture(formOf({ ...moment, ...photo() }), {
			...capturing(),
			'moment.photo': async () => {
				throw new MomentNeedsPersonError();
			}
		});
		expect(answer).toEqual({
			kind: 'fail',
			status: 400,
			data: { momentError: t('errors.moment.photoFailed'), draft: '' }
		});
		// The moment itself stays saved: sending the photo again does not double it.
		expect(await receipts.find(MOMENT_ID)).toMatchObject({ status: 'applied' });
	});
});
