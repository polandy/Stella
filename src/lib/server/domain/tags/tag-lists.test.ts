import { describe, expect, it } from 'bun:test';
import { inMemoryTagLists, somebody, someTag } from '../testing';
import { listContactsByTag, listTags, listTagsForContact } from './tag-lists';

/* The tags as the screens list them (docs/02 §2.8), over the in-memory tag read model. */

const viewer = { id: 'u1', householdId: 'h' };
const deps = {
	tagLists: inMemoryTagLists(
		[
			someTag('ski', 'Ski', { carriedBy: ['anna'] }),
			someTag('choir', 'Choir', { carriedBy: ['anna', 'cleo'] })
		],
		[somebody('anna', 'Anna'), somebody('cleo', 'Cleo')]
	)
};

describe('listTags', () => {
	it('lists the household’s tags, for the chip row', async () => {
		expect((await listTags(deps, 'h')).map((t) => t.name)).toEqual(['Choir', 'Ski']);
	});
});

describe('listTagsForContact', () => {
	it('lists the tags one person carries', async () => {
		expect((await listTagsForContact(deps, viewer, 'cleo')).map((t) => t.id)).toEqual(['choir']);
	});
});

describe('listContactsByTag', () => {
	it('lists the people who carry one tag', async () => {
		expect((await listContactsByTag(deps, viewer, 'choir')).map((p) => p.id)).toEqual([
			'anna',
			'cleo'
		]);
	});
});
