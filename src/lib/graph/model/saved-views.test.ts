import { describe, expect, it } from 'bun:test';
import { DEFAULT_VIEW_SWITCHES, type ViewSwitches } from '../view-switches';
import {
	parseSavedViews,
	removeView,
	savedViewNamed,
	saveView,
	serializeSavedViews,
	viewMatching,
	type SavedView,
	type ViewState
} from './saved-views';

/*
 * A saved view is a name for a Filter-menu state (docs/02 §2.7): which kinds of line are
 * shown and how the map is looked at. Kept per device; corrupt or outdated entries in the
 * stored list are dropped instead of breaking the menu.
 */

const switches = (overrides: Partial<ViewSwitches> = {}): ViewSwitches => ({
	...DEFAULT_VIEW_SWITCHES,
	...overrides
});

const familyOnly: ViewState = { active: new Set(['family', 'kinship']), switches: switches() };
const work: ViewState = {
	active: new Set(['professional', 'circles']),
	switches: switches({ groupRoles: true })
};

describe('saveView', () => {
	it('adds a view under its name, with the state it was given', () => {
		const views = saveView([], 'Family', familyOnly);

		expect(views).toEqual([
			{ name: 'Family', filters: ['family', 'kinship'], switches: switches() }
		]);
	});

	it('keeps the filters in the order the menu lists them, whatever order they were switched on', () => {
		const views = saveView([], 'Work', {
			active: new Set(['circles', 'professional']),
			switches: switches()
		});

		expect(views[0].filters).toEqual(['professional', 'circles']);
	});

	it('trims the name it is given', () => {
		expect(saveView([], '  Family  ', familyOnly)[0].name).toBe('Family');
	});

	it('ignores a name that is only blanks', () => {
		const before = saveView([], 'Family', familyOnly);

		expect(saveView(before, '   ', work)).toBe(before);
	});

	it('appends a new name after the ones already saved', () => {
		const views = saveView(saveView([], 'Family', familyOnly), 'Work', work);

		expect(views.map((v) => v.name)).toEqual(['Family', 'Work']);
	});

	it('replaces a view saved under the same name, in its place, ignoring case', () => {
		const views = saveView(
			saveView(saveView([], 'Family', familyOnly), 'Work', work),
			'family',
			work
		);

		expect(views.map((v) => v.name)).toEqual(['family', 'Work']);
		expect(views[0].filters).toEqual(['professional', 'circles']);
		expect(views[0].switches.groupRoles).toBe(true);
	});

	it('leaves the list it was given untouched', () => {
		const before: SavedView[] = [];
		saveView(before, 'Family', familyOnly);

		expect(before).toEqual([]);
	});

	it('copies the switches rather than holding on to the live ones', () => {
		const live = switches();
		const views = saveView([], 'Family', { active: new Set(['family']), switches: live });
		live.edgeLabels = false;

		expect(views[0].switches.edgeLabels).toBe(true);
	});
});

describe('removeView', () => {
	it('drops the view with that name and keeps the rest in order', () => {
		const views = saveView(saveView(saveView([], 'A', familyOnly), 'B', work), 'C', familyOnly);

		expect(removeView(views, 'B').map((v) => v.name)).toEqual(['A', 'C']);
	});

	it('changes nothing for a name that is not saved', () => {
		const views = saveView([], 'A', familyOnly);

		expect(removeView(views, 'Z')).toEqual(views);
	});
});

describe('savedViewNamed', () => {
	const views = saveView([], 'Family', familyOnly);

	it('finds the view a name would replace, as saving compares names', () => {
		expect(savedViewNamed(views, ' family ')?.name).toBe('Family');
	});

	it('finds none for a new name or a blank one', () => {
		expect(savedViewNamed(views, 'Work')).toBeNull();
		expect(savedViewNamed(views, '  ')).toBeNull();
	});
});

describe('viewMatching', () => {
	const views = saveView(saveView([], 'Family', familyOnly), 'Work', work);

	it('names the saved view the map is showing right now', () => {
		expect(viewMatching(views, work)).toBe('Work');
	});

	it('names none once a filter differs', () => {
		expect(viewMatching(views, { ...work, active: new Set(['professional']) })).toBeNull();
	});

	it('names none once a switch differs', () => {
		expect(viewMatching(views, { ...work, switches: switches({ groupRoles: false }) })).toBeNull();
	});
});

describe('parseSavedViews / serializeSavedViews', () => {
	it('reads back what it wrote', () => {
		const views = saveView(saveView([], 'Family', familyOnly), 'Work', work);

		expect(parseSavedViews(serializeSavedViews(views))).toEqual(views);
	});

	it('reads nothing stored as no views', () => {
		expect(parseSavedViews(null)).toEqual([]);
	});

	it('reads text that is not JSON as no views', () => {
		expect(parseSavedViews('{not json')).toEqual([]);
	});

	it('reads JSON that is not a list as no views', () => {
		expect(parseSavedViews('{"name":"Family"}')).toEqual([]);
	});

	it('drops an entry that names a filter this version does not know, keeping the others', () => {
		const stored = JSON.stringify([
			{ name: 'Old', filters: ['family', 'pets'], switches: switches() },
			{ name: 'Family', filters: ['family'], switches: switches() }
		]);

		expect(parseSavedViews(stored).map((v) => v.name)).toEqual(['Family']);
	});

	it('drops an entry that names a switch this version does not know', () => {
		const stored = JSON.stringify([
			{ name: 'Old', filters: ['family'], switches: { ...switches(), heatmap: true } }
		]);

		expect(parseSavedViews(stored)).toEqual([]);
	});

	it('drops entries with a missing or blank name, or a malformed shape', () => {
		const stored = JSON.stringify([
			{ filters: ['family'], switches: switches() },
			{ name: '  ', filters: ['family'], switches: switches() },
			{ name: 'No filters', switches: switches() },
			{ name: 'Bad switch', filters: ['family'], switches: { edgeLabels: 'yes' } },
			'Family',
			null
		]);

		expect(parseSavedViews(stored)).toEqual([]);
	});

	it('gives a switch an entry does not mention its default, so a later switch keeps old views', () => {
		const stored = JSON.stringify([
			{ name: 'Family', filters: ['family'], switches: { groupRoles: true } }
		]);

		expect(parseSavedViews(stored)[0].switches).toEqual(switches({ groupRoles: true }));
	});

	it('keeps the first of two entries with the same name', () => {
		const stored = JSON.stringify([
			{ name: 'Family', filters: ['family'], switches: switches() },
			{ name: 'FAMILY', filters: ['social'], switches: switches() }
		]);

		expect(parseSavedViews(stored)).toEqual([
			{ name: 'Family', filters: ['family'], switches: switches() }
		]);
	});
});
