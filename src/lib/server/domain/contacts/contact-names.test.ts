import { describe, expect, it } from 'bun:test';
import {
	listBrowsableNamesAmong,
	listContactNamesAmong,
	type ContactNameReads
} from './contact-names';

/*
 * The by-id name reads behind the story, the journal, Home and the circle picker (docs/04
 * §4.8). The circle action compares the answer's length with the distinct ids it asked for, so
 * a repeated id has to be asked once, and a page with nobody to name must not read at all.
 */

const viewer = { id: 'u', householdId: 'h' };

/** Records what the store was asked: the calls are what these cases are about. */
function recordingNames() {
	const asked: { read: string; ids: readonly string[] }[] = [];
	const answer = (ids: readonly string[]) => ids.map((id) => ({ id, displayName: id }));
	const contactNames: ContactNameReads = {
		listNamesAmongVisibleTo: async (_viewer, ids) => {
			asked.push({ read: 'visible', ids });
			return answer(ids);
		},
		listBrowsableNamesAmong: async (_viewer, ids) => {
			asked.push({ read: 'browsable', ids });
			return answer(ids);
		}
	};
	return { deps: { contactNames }, asked };
}

describe('reading names for just the ids a page needs', () => {
	it('asks the store for each person once, however often a page names them', async () => {
		const f = recordingNames();
		const visible = await listContactNamesAmong(f.deps, viewer, ['anna', 'ben', 'anna']);
		const browsable = await listBrowsableNamesAmong(f.deps, viewer, ['ben', 'ben', 'cleo']);

		expect(visible.map((c) => c.id)).toEqual(['anna', 'ben']);
		expect(browsable.map((c) => c.id)).toEqual(['ben', 'cleo']);
		expect(f.asked).toEqual([
			{ read: 'visible', ids: ['anna', 'ben'] },
			{ read: 'browsable', ids: ['ben', 'cleo'] }
		]);
	});

	it('reads nothing when the page names nobody', async () => {
		const f = recordingNames();
		expect(await listContactNamesAmong(f.deps, viewer, [])).toEqual([]);
		expect(await listBrowsableNamesAmong(f.deps, viewer, [])).toEqual([]);
		// Positive control: the same recorder does see a read when there is someone to name.
		await listContactNamesAmong(f.deps, viewer, ['anna']);
		expect(f.asked).toEqual([{ read: 'visible', ids: ['anna'] }]);
	});
});
