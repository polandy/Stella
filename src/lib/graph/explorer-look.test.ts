import { describe, expect, it } from 'bun:test';
import { currentViewOf, groupingApplies, labelsSwitchOf } from './explorer-look';
import {
	explorerAfter,
	explorerAtOpen,
	type ExplorerCommand,
	type ExplorerEvent,
	type ExplorerState
} from './explorer-state';
import { DEFAULT_VIEW_SWITCHES } from './view-switches';

/*
 * How the explorer is looked at (docs/05 §5.8, docs/02 §2.7): the arrangement, the Filter
 * menu's kinds, switches, density and saved views, and full screen. Selection and the path are
 * in `explorer-state.test.ts`; both go through `explorerAfter`, as the component does.
 */

const opened = () => explorerAtOpen({ centerId: 'ann', compact: false });

function run(state: ExplorerState, ...events: ExplorerEvent[]) {
	const commands: ExplorerCommand[] = [];
	for (const event of events) {
		const next = explorerAfter(state, event);
		state = next.state;
		commands.push(...next.commands);
	}
	return { state, commands };
}

const grouped = run(opened(), { type: 'switchFlipped', name: 'groupRoles', rolesInstead: false });

describe('the arrangement', () => {
	it('names the arrangement chosen and asks the canvas to lay it out', () => {
		const { state, commands } = run(opened(), { type: 'arranged', key: 'circles' });
		expect(state.arrangedBy).toBe('circles');
		expect(commands).toEqual([{ kind: 'arrange', key: 'circles' }]);
	});

	it('clears the grouping in the tree and brings it back on leaving', () => {
		expect(groupingApplies(grouped.state)).toBe(true);
		const inTree = run(grouped.state, { type: 'arranged', key: 'tree' }).state;
		expect(groupingApplies(inTree)).toBe(false);
		// The switch is the reader's habit and stays on; only the tree sets it aside.
		expect(inTree.switches.groupRoles).toBe(true);
		expect(groupingApplies(run(inTree, { type: 'arranged', key: 'force' }).state)).toBe(true);
	});

	it('starts the tree’s labels off around a person and keeps the habit for leaving it', () => {
		const inTree = run(opened(), { type: 'arranged', key: 'tree' }).state;
		expect(labelsSwitchOf(inTree, true)).toBe(false);
		const flipped = run(inTree, { type: 'switchFlipped', name: 'edgeLabels', rolesInstead: true });
		expect(labelsSwitchOf(flipped.state, true)).toBe(true);
		// The tree's choice is its own: nothing is kept, and the habit stands.
		expect(flipped.commands).toEqual([]);
		expect(flipped.state.switches.edgeLabels).toBe(true);
		const back = run(flipped.state, { type: 'arranged', key: 'tree' }).state;
		expect(labelsSwitchOf(back, true)).toBe(true);
		const reentered = run(
			back,
			{ type: 'arranged', key: 'force' },
			{ type: 'arranged', key: 'tree' }
		);
		expect(labelsSwitchOf(reentered.state, true)).toBe(false);
	});
});

describe('the Filter menu', () => {
	it('toggles a kind of line on and off', () => {
		const off = run(opened(), { type: 'filterToggled', key: 'family' }).state;
		expect(off.active.has('family')).toBe(false);
		expect(run(off, { type: 'filterToggled', key: 'family' }).state.active.has('family')).toBe(
			true
		);
	});

	it('flips a switch and keeps it on this device', () => {
		expect(grouped.state.switches.groupRoles).toBe(true);
		expect(grouped.commands).toEqual([{ kind: 'keepSwitch', name: 'groupRoles', on: true }]);
	});

	it('flips the Labels habit outside the tree', () => {
		const { state, commands } = run(opened(), {
			type: 'switchFlipped',
			name: 'edgeLabels',
			rolesInstead: false
		});
		expect(labelsSwitchOf(state, false)).toBe(false);
		expect(commands).toEqual([{ kind: 'keepSwitch', name: 'edgeLabels', on: false }]);
	});

	it('spaces people anew for a density, and re-runs only the free arrangement', () => {
		expect(run(opened(), { type: 'densityChosen', density: 'spacious' })).toEqual({
			state: { ...opened(), density: 'spacious' },
			commands: [
				{ kind: 'keepDensity', density: 'spacious' },
				{ kind: 'respace', density: 'spacious', rearrange: true }
			]
		});
		const tree = run(opened(), { type: 'arranged', key: 'tree' }).state;
		expect(run(tree, { type: 'densityChosen', density: 'compact' }).commands[1]).toEqual({
			kind: 'respace',
			density: 'compact',
			rearrange: false
		});
		expect(explorerAfter(opened(), { type: 'densityChosen', density: 'comfortable' })).toEqual({
			state: opened(),
			commands: []
		});
	});
});

describe('saved views', () => {
	it('saves the current state under a name, which then names the menu’s state', () => {
		const saved = run(opened(), { type: 'viewSaved', name: 'Everything' });
		expect(saved.state.savedViews.map((v) => v.name)).toEqual(['Everything']);
		expect(saved.commands).toEqual([{ kind: 'keepViews', views: saved.state.savedViews }]);
		expect(currentViewOf(saved.state)).toBe('Everything');
		const changed = run(saved.state, { type: 'filterToggled', key: 'family' }).state;
		expect(currentViewOf(changed)).toBeNull();
	});

	it('applies a view: its kinds of line, and each switch it changes kept like a tap', () => {
		const family = run(
			opened(),
			{ type: 'filterToggled', key: 'social' },
			{ type: 'switchFlipped', name: 'groupRoles', rolesInstead: false },
			{ type: 'viewSaved', name: 'Family' }
		).state;
		const view = family.savedViews[0]!;
		const applied = run(opened(), { type: 'viewApplied', view });
		expect(applied.state.active).toEqual(new Set(view.filters));
		expect(applied.state.switches).toEqual(view.switches);
		expect(applied.commands).toEqual([{ kind: 'keepSwitch', name: 'groupRoles', on: true }]);
		expect(currentViewOf({ ...applied.state, savedViews: family.savedViews })).toBe('Family');
	});

	it('deletes a view and keeps the shorter list', () => {
		const saved = run(opened(), { type: 'viewSaved', name: 'A' }).state;
		const { state, commands } = run(saved, { type: 'viewDeleted', name: 'A' });
		expect(state.savedViews).toEqual([]);
		expect(commands).toEqual([{ kind: 'keepViews', views: [] }]);
	});

	it('takes what this device kept, leaving the rest at the defaults', () => {
		const kept = run(opened(), {
			type: 'preferencesLoaded',
			kept: { switches: { ...DEFAULT_VIEW_SWITCHES, groupRoles: true }, density: 'compact' }
		}).state;
		expect(kept).toMatchObject({ density: 'compact', savedViews: [] });
		expect(groupingApplies(kept)).toBe(true);
	});
});

describe('full screen', () => {
	const screen = (on: boolean, canvasReady = true): ExplorerEvent => ({
		type: 'screen',
		on,
		canvasReady
	});

	it('tells the canvas each time it is entered or left, and the page when it is left', () => {
		expect(run(opened(), screen(true)).commands).toEqual([{ kind: 'screenChanged' }]);
		expect(run(opened(), screen(true), screen(false)).commands).toEqual([
			{ kind: 'screenChanged' },
			{ kind: 'leftFullscreen' },
			{ kind: 'screenChanged' }
		]);
	});

	it('says nothing for the frame arriving windowed, or the same state twice', () => {
		const windowed = run(opened(), screen(false));
		expect(windowed.commands).toEqual([]);
		expect(explorerAfter(windowed.state, screen(false)).state).toBe(windowed.state);
		const on = run(opened(), screen(true)).state;
		expect(explorerAfter(on, screen(true))).toEqual({ state: on, commands: [] });
	});

	it('tells a canvas built after full screen was entered, once it is up', () => {
		// Opened straight into full screen: the canvas may be built before its frame has grown.
		const early = run(opened(), screen(true, false));
		expect(early.commands).toEqual([]);
		expect(run(early.state, screen(true, true)).commands).toEqual([{ kind: 'screenChanged' }]);
	});
});
