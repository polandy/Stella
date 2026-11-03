import { describe, expect, it } from 'bun:test';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import { serialiseDocument, type HouseholdSnapshot } from './archive';
import { ARCHIVE_FORMAT, ARCHIVE_VERSION, buildArchiveDocument } from './document';
import { planRestore, type RestorePlan, type RestoreTarget } from './restore';

/*
 * Reading back what the household has already answered (docs/02 §2.15): the export writes it
 * (`document-answers.test.ts`), and this is the other half — each list turned back into the
 * rows its table holds, so a restore asks nothing again and applies no resend twice. A row the
 * file cannot vouch for is left out and named, like everywhere else in a restore.
 */

const NOW = Date.UTC(2026, 9, 1, 8, 0);
const EXPORTED = Date.UTC(2026, 8, 7, 9, 30);
const clock: Clock = { now: () => NOW };
const counter = (): IdGenerator => {
	let n = 0;
	return { next: () => `new-${++n}` };
};
const FACE = '0c2e3a4b-5d6e-4f70-9a2b-3c4d5e6f7a81';

const target: RestoreTarget = {
	householdId: 'h-here',
	actorId: 'u-admin',
	memberIds: ['u-admin', 'u-1'],
	relationshipTypeIds: [],
	symmetricTypeIds: [],
	tags: []
};

function answered(): HouseholdSnapshot {
	return {
		householdName: 'Familie Brunner',
		tables: {
			contact: [{ id: 'c-hans', display_name: 'Hans' }],
			immich_name_ignore: [
				{ household_id: 'h-1', immich_person_id: FACE, ignored_by: 'u-1', ignored_at: EXPORTED }
			],
			contact_source_link: [
				{
					household_id: 'h-1',
					source: 'vcard:google',
					external_uid: 'uid-hans',
					contact_id: 'c-hans',
					state: 'linked',
					card_name: 'Hans B.',
					card_hash: 'h1',
					answered_by: 'u-gone',
					answered_at: EXPORTED
				},
				{
					household_id: 'h-1',
					source: 'nextcloud:Familie',
					external_uid: 'uid-spam',
					contact_id: null,
					state: 'skipped',
					card_name: 'Pizza Service',
					card_hash: 'h2',
					answered_by: 'u-1',
					answered_at: EXPORTED
				}
			],
			suggestion_dismissal: [
				{
					id: 'sd-1',
					household_id: 'h-1',
					relation: 'last_name',
					pair_key: 'c-hans brunner',
					dismissed_by: 'u-1',
					dismissed_at: EXPORTED
				}
			],
			command_receipt: [
				{
					id: 'cmd-1',
					household_id: 'h-1',
					member_id: 'u-1',
					type: 'note.add',
					status: 'applied',
					result: '{"noteId":"n-1"}',
					claimed_at: EXPORTED,
					completed_at: EXPORTED + 5
				}
			]
		},
		mediaPaths: []
	};
}

/** The round trip the feature is: rows out, YAML, rows back in. */
function restored(snapshot = answered()): RestorePlan {
	const document = Bun.YAML.parse(serialiseDocument(buildArchiveDocument(snapshot, EXPORTED)));
	return planRestore({ ids: counter(), clock }, document, target);
}

/** A hand-written document, for the rows an export of ours would never write. */
function restoredFrom(extra: Record<string, unknown>): RestorePlan {
	return planRestore(
		{ ids: counter(), clock },
		{
			format: ARCHIVE_FORMAT,
			version: ARCHIVE_VERSION,
			people: [{ id: 'c-hans', display_name: 'Hans' }],
			...extra
		},
		target
	);
}

const rowsOf = (plan: RestorePlan, table: string) =>
	plan.tables.find((t) => t.table === table)?.rows ?? [];

describe('the Immich faces set aside as nobody to add', () => {
	it('come back into the household doing the import', () => {
		expect(rowsOf(restored(), 'immich_name_ignore')).toEqual([
			{ household_id: 'h-here', immich_person_id: FACE, ignored_by: 'u-1', ignored_at: EXPORTED }
		]);
	});

	it('leave out one that names no Immich person, since the id travels into its URLs', () => {
		const plan = restoredFrom({ immich_names_ignored: [{ person: '../admin' }] });
		expect(rowsOf(plan, 'immich_name_ignore')).toEqual([]);
		expect(plan.warnings).toContainEqual({ code: 'immichNameIgnoreIncomplete' });
	});
});

describe('the address-book cards already answered', () => {
	it('come back linked to their person, or skipped', () => {
		expect(rowsOf(restored(), 'contact_source_link')).toEqual([
			{
				household_id: 'h-here',
				source: 'vcard:google',
				external_uid: 'uid-hans',
				contact_id: 'c-hans',
				state: 'linked',
				card_name: 'Hans B.',
				card_hash: 'h1',
				// The member who answered is not here, so the answer is the importing admin's.
				answered_by: 'u-admin',
				answered_at: EXPORTED
			},
			{
				household_id: 'h-here',
				source: 'nextcloud:Familie',
				external_uid: 'uid-spam',
				contact_id: null,
				state: 'skipped',
				card_name: 'Pizza Service',
				card_hash: 'h2',
				answered_by: 'u-1',
				answered_at: EXPORTED
			}
		]);
	});

	it('leave out a link to somebody the archive does not hold', () => {
		const plan = restoredFrom({
			address_book_cards: [
				{
					source: 'vcard:other',
					card: 'u',
					state: 'linked',
					person: 'c-nobody',
					name: 'X',
					hash: 'h'
				}
			]
		});
		expect(rowsOf(plan, 'contact_source_link')).toEqual([]);
		expect(plan.warnings).toContainEqual({ code: 'addressBookCardIncomplete' });
	});

	it('leave out a card from an address book Stella does not read', () => {
		const plan = restoredFrom({
			address_book_cards: [
				{ source: 'outlook', card: 'u', state: 'skipped', name: 'X', hash: 'h' },
				{ source: 'vcard:other', card: 'u', state: 'forgotten', name: 'X', hash: 'h' }
			]
		});
		expect(rowsOf(plan, 'contact_source_link')).toEqual([]);
		expect(plan.warnings).toContainEqual({ code: 'addressBookCardIncomplete' });
	});

	it('forget the person a skipped card is said to name: a skip names nobody', () => {
		const plan = restoredFrom({
			address_book_cards: [
				{
					source: 'vcard:other',
					card: 'u',
					state: 'skipped',
					person: 'c-hans',
					name: 'X',
					hash: 'h'
				}
			]
		});
		expect(rowsOf(plan, 'contact_source_link')[0]).toMatchObject({ contact_id: null });
	});
});

describe('the suggestions declined', () => {
	it('come back under their id, so a second import adds nothing', () => {
		expect(rowsOf(restored(), 'suggestion_dismissal')).toEqual([
			{
				id: 'sd-1',
				household_id: 'h-here',
				relation: 'last_name',
				pair_key: 'c-hans brunner',
				dismissed_by: 'u-1',
				dismissed_at: EXPORTED
			}
		]);
	});

	it('leave out one of a kind Stella never suggests, or naming nobody', () => {
		const plan = restoredFrom({
			declined_suggestions: [
				{ id: 'sd-x', relation: 'nemesis', pair: 'a b' },
				{ id: 'sd-y', relation: 'parent' }
			]
		});
		expect(rowsOf(plan, 'suggestion_dismissal')).toEqual([]);
		expect(plan.warnings).toContainEqual({ code: 'suggestionDismissalIncomplete' });
	});
});

describe('the commands already applied', () => {
	it('come back with the answer a resend gets', () => {
		expect(rowsOf(restored(), 'command_receipt')).toEqual([
			{
				id: 'cmd-1',
				household_id: 'h-here',
				member_id: 'u-1',
				type: 'note.add',
				status: 'applied',
				result: '{"noteId":"n-1"}',
				claimed_at: EXPORTED,
				completed_at: EXPORTED + 5
			}
		]);
	});

	it('leave out one still in flight at the export: its resend is applied here, once', () => {
		const snapshot = answered();
		snapshot.tables.command_receipt[0] = {
			...snapshot.tables.command_receipt[0],
			status: 'pending',
			result: null,
			completed_at: null
		};
		const plan = restored(snapshot);
		expect(rowsOf(plan, 'command_receipt')).toEqual([]);
		expect(plan.warnings).toEqual([]);
	});

	it('leave out one naming a command Stella does not know', () => {
		const plan = restoredFrom({
			command_receipts: [{ id: 'cmd-x', type: 'rm -rf', status: 'applied', result: 'null' }]
		});
		expect(rowsOf(plan, 'command_receipt')).toEqual([]);
		expect(plan.warnings).toContainEqual({ code: 'commandReceiptIncomplete' });
	});
});

it('reads an archive written before these lists existed without a warning', () => {
	const plan = restoredFrom({});
	for (const table of [
		'immich_name_ignore',
		'contact_source_link',
		'suggestion_dismissal',
		'command_receipt'
	]) {
		expect(rowsOf(plan, table)).toEqual([]);
	}
	expect(plan.warnings).toEqual([]);
});
