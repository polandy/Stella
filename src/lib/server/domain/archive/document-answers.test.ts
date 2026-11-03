import { describe, expect, it } from 'bun:test';
import type { HouseholdSnapshot } from './archive';
import { buildArchiveDocument } from './document';

/*
 * What the household has already answered (docs/02 §2.15): the Immich faces it set aside, the
 * address-book cards it linked or skipped, the suggestions it declined and the commands it has
 * applied. None of it is a record anybody reads, but each one left out of the archive is a
 * question a restore would ask again, or a phone's resend it would apply twice.
 */

const NOW = Date.UTC(2026, 8, 7, 9, 30);
const iso = (at: number) => new Date(at).toISOString();
const FACE = '0c2e3a4b-5d6e-4f70-9a2b-3c4d5e6f7a81';

function answered(): HouseholdSnapshot {
	return {
		householdName: 'Familie Brunner',
		tables: {
			contact: [{ id: 'c-hans', display_name: 'Hans' }],
			immich_name_ignore: [
				{ household_id: 'h-1', immich_person_id: FACE, ignored_by: 'u-1', ignored_at: NOW }
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
					answered_by: 'u-1',
					answered_at: NOW
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
					answered_at: NOW
				}
			],
			suggestion_dismissal: [
				{
					id: 'sd-1',
					household_id: 'h-1',
					relation: 'last_name',
					pair_key: 'c-hans brunner',
					dismissed_by: 'u-1',
					dismissed_at: NOW
				}
			],
			command_receipt: [
				{
					id: 'cmd-1',
					household_id: 'h-1',
					member_id: 'u-1',
					type: 'moment.add',
					status: 'applied',
					result: '{"entryId":"j-1"}',
					claimed_at: NOW,
					completed_at: NOW + 5
				}
			]
		},
		mediaPaths: []
	};
}

const doc = () => buildArchiveDocument(answered(), NOW);

describe('what the household has already answered', () => {
	it('carries the Immich faces it said are nobody to add', () => {
		expect(doc().immich_names_ignored).toEqual([
			{ person: FACE, ignored_by: 'u-1', ignored_at: iso(NOW) }
		]);
	});

	it('carries the address-book cards it linked to someone or skipped', () => {
		expect(doc().address_book_cards).toEqual([
			{
				source: 'vcard:google',
				card: 'uid-hans',
				state: 'linked',
				person: 'c-hans',
				name: 'Hans B.',
				hash: 'h1',
				answered_by: 'u-1',
				answered_at: iso(NOW)
			},
			{
				source: 'nextcloud:Familie',
				card: 'uid-spam',
				state: 'skipped',
				name: 'Pizza Service',
				hash: 'h2',
				answered_by: 'u-1',
				answered_at: iso(NOW)
			}
		]);
	});

	it('carries the suggestions it declined', () => {
		expect(doc().declined_suggestions).toEqual([
			{
				id: 'sd-1',
				relation: 'last_name',
				pair: 'c-hans brunner',
				declined_by: 'u-1',
				declined_at: iso(NOW)
			}
		]);
	});

	it('carries the commands it has applied, with what they answered', () => {
		expect(doc().command_receipts).toEqual([
			{
				id: 'cmd-1',
				member: 'u-1',
				type: 'moment.add',
				status: 'applied',
				result: '{"entryId":"j-1"}',
				claimed_at: iso(NOW),
				completed_at: iso(NOW + 5)
			}
		]);
	});

	it('writes empty lists for a household that has answered nothing yet', () => {
		const empty = buildArchiveDocument({ householdName: 'H', tables: {}, mediaPaths: [] }, NOW);
		expect(empty.immich_names_ignored).toEqual([]);
		expect(empty.address_book_cards).toEqual([]);
		expect(empty.declined_suggestions).toEqual([]);
		expect(empty.command_receipts).toEqual([]);
	});
});
