import { lookAfter } from './explorer-look';
import type { ArrangementKey } from './layout/arrangements';
import { DEFAULT_DENSITY, type Density } from './layout/density';
import type { CircleRole, CircleRoleOption } from './model/ego-network';
import { isRoleGroupId } from './model/role-groups';
import type { SavedView } from './model/saved-views';
import type { ConnectionPath } from './model/types';
import { openingFilterKeys } from './model/view-filters';
import type { SelectionCause } from './tree-view';
import { DEFAULT_VIEW_SWITCHES, type ViewSwitches } from './view-switches';

/*
 * What the explorer is doing (docs/05 §5.8, docs/02 §2.7): who is selected and why, the
 * connection path being picked, how the map is looked at, and what the canvas last heard of
 * full screen. Pure, so which tap leads where is tested without a browser; how the map is
 * looked at is answered in `explorer-look.ts`. `GraphExplorer`
 * holds one of these, renders it, and carries out the commands each event hands back — the
 * map's growing and drawing stay with it, since they await the graph and the canvas.
 */

export interface ExplorerState {
	selected: string | null;
	/** What last put somebody in the selection: only a tap or a search asks for their lines. */
	selectionCause: SelectionCause;
	/** The Filter menu's kinds of line switched on. */
	active: ReadonlySet<string>;
	pathMode: boolean;
	/** The first end picked, while the second is awaited or the chain looked for. */
	pathFrom: string | null;
	path: ConnectionPath | null;
	/** The last pair picked has no chain between them. */
	pathMissing: boolean;
	/** The reader's habits for looking at the map, kept per device (`view-switches.ts`). */
	switches: Readonly<ViewSwitches>;
	/** The Labels switch inside the family tree, which is the tree's own (`tree-view.ts`). */
	treeLabels: boolean;
	/** Groups the reader asked to see individually; the rest stay grouped. */
	dissolved: ReadonlySet<string>;
	density: Density;
	savedViews: SavedView[];
	/** The arrangement last chosen, which the Arrange pill names; free until one is picked. */
	arrangedBy: ArrangementKey;
	/**
	 * The peeked circle's roles and which of them the next expand opens. Everything starts
	 * chosen, so a plain expand still shows the whole circle; `circleId` names the circle they
	 * belong to, so a slow answer for a circle the reader has since left is dropped.
	 */
	circleRoles: {
		circleId: string | null;
		options: readonly CircleRoleOption[];
		chosen: ReadonlySet<CircleRole>;
	};
	/**
	 * Full screen as last seen (`was`) and as the canvas last heard of it (`told`). Only a full
	 * screen that was entered can be left, and the canvas starts out told it is windowed: a map
	 * opened straight into full screen may be built before its frame has grown.
	 */
	screen: { was: boolean; told: boolean };
}

/** What this device kept of the reader's habits; whatever storage refused stays at the default. */
export type KeptPreferences = Partial<Pick<ExplorerState, 'switches' | 'density' | 'savedViews'>>;

export type ExplorerEvent =
	/** A node tapped, or Enter on it from the keyboard. */
	| { type: 'tapped'; id: string; isGroup: boolean }
	| { type: 'tappedBackground' }
	/** Escape on the canvas. */
	| { type: 'cleared' }
	/** Somebody chosen in the find field, already on the map. */
	| { type: 'found'; id: string }
	| { type: 'peekClosed' }
	| { type: 'groupDissolved'; id: string }
	/** The groups the map draws now; a selected group missing from them was dissolved or ungrouped. */
	| { type: 'groupsDrawn'; groupIds: ReadonlySet<string> }
	/** An expand laid the family tree out again around the person opened. */
	| { type: 'treeRelaid' }
	| { type: 'pathToggled' }
	| { type: 'pathTraced'; path: ConnectionPath | null }
	/** A link arrived with the question already asked (docs/05 §5.5). */
	| { type: 'tracedOnOpen'; path: ConnectionPath | null }
	/** A fresh snapshot of the graph is being explored to the same extent. */
	| { type: 'snapshotChanged' }
	| { type: 'rebuilt'; nodeIds: ReadonlySet<string> }
	| { type: 'filterToggled'; key: string }
	/** `rolesInstead`: the family tree around a person writes roles where line names would be. */
	| { type: 'switchFlipped'; name: keyof ViewSwitches; rolesInstead: boolean }
	| { type: 'densityChosen'; density: Density }
	| { type: 'viewApplied'; view: SavedView }
	| { type: 'viewSaved'; name: string }
	| { type: 'viewDeleted'; name: string }
	| { type: 'arranged'; key: ArrangementKey }
	| { type: 'preferencesLoaded'; kept: KeptPreferences }
	| { type: 'circlePeeked'; circleId: string | null }
	| { type: 'circleRolesArrived'; circleId: string; options: readonly CircleRoleOption[] }
	| { type: 'roleToggled'; role: CircleRole }
	| { type: 'screen'; on: boolean; canvasReady: boolean };

/** What the component carries out after an event, in order. */
export type ExplorerCommand =
	| { kind: 'expand'; id: string }
	| { kind: 'tracePath'; from: string; to: string }
	| { kind: 'arrange'; key: ArrangementKey }
	| { kind: 'keepSwitch'; name: keyof ViewSwitches; on: boolean }
	| { kind: 'keepDensity'; density: Density }
	/** Space people for `density`; the free arrangement is that spacing, so it runs again. */
	| { kind: 'respace'; density: Density; rearrange: boolean }
	| { kind: 'keepViews'; views: SavedView[] }
	| { kind: 'leftFullscreen' }
	/** Full screen was entered or left; the canvas frames the map afresh for its new room. */
	| { kind: 'screenChanged' };

export interface ExplorerStep {
	state: ExplorerState;
	commands: ExplorerCommand[];
}

/** The events about how the map is looked at, rather than who is in it. */
export type LookEvent = Extract<
	ExplorerEvent,
	{
		type:
			| 'filterToggled'
			| 'switchFlipped'
			| 'densityChosen'
			| 'viewApplied'
			| 'viewSaved'
			| 'viewDeleted'
			| 'arranged'
			| 'preferencesLoaded'
			| 'screen';
	}
>;

const NO_CIRCLE: ExplorerState['circleRoles'] = { circleId: null, options: [], chosen: new Set() };

/*
 * The route opens with its centre selected, because the peek panel beside a full-screen canvas
 * is where that route says who you are looking at. Embedded, the same panel would cover half a
 * map the size of a card before anybody has asked anything — the page's own header already
 * names the person, so nothing is selected until a node is tapped.
 */
export function explorerAtOpen(at: { centerId: string | null; compact: boolean }): ExplorerState {
	return {
		selected: at.compact ? null : at.centerId,
		selectionCause: 'opened',
		active: openingFilterKeys(at.compact),
		pathMode: false,
		pathFrom: null,
		path: null,
		pathMissing: false,
		switches: { ...DEFAULT_VIEW_SWITCHES },
		treeLabels: false,
		dissolved: new Set(),
		density: DEFAULT_DENSITY,
		savedViews: [],
		arrangedBy: 'force',
		circleRoles: NO_CIRCLE,
		screen: { was: false, told: false }
	};
}

const only = (state: ExplorerState, commands: ExplorerCommand[] = []): ExplorerStep => ({
	state,
	commands
});

function withoutPathMode(state: ExplorerState): ExplorerState {
	return { ...state, pathMode: false, pathFrom: null, path: null, pathMissing: false };
}

function tapped(state: ExplorerState, id: string, isGroup: boolean): ExplorerStep {
	const asked: ExplorerState = { ...state, selectionCause: 'tapped' };
	// A group is a way of drawing people, not somebody to trace a path to or open up.
	if (isGroup) return only(state.pathMode ? asked : { ...asked, selected: id });
	if (state.pathMode) {
		if (state.pathFrom === null) return only({ ...asked, pathFrom: id });
		if (state.pathFrom === id) return only({ ...asked, pathFrom: null });
		return only(asked, [{ kind: 'tracePath', from: state.pathFrom, to: id }]);
	}
	if (state.selected === id) return only(asked, [{ kind: 'expand', id }]);
	return only({ ...asked, selected: id, path: null, pathMissing: false });
}

function tappedBackground(state: ExplorerState): ExplorerState {
	if (state.pathMode) return state;
	return { ...state, selected: null, path: null };
}

/** The state after `event`, and what the component is to do about it. */
export function explorerAfter(state: ExplorerState, event: ExplorerEvent): ExplorerStep {
	switch (event.type) {
		case 'filterToggled':
		case 'switchFlipped':
		case 'densityChosen':
		case 'viewApplied':
		case 'viewSaved':
		case 'viewDeleted':
		case 'arranged':
		case 'preferencesLoaded':
		case 'screen':
			return lookAfter(state, event);
		case 'tapped':
			return tapped(state, event.id, event.isGroup);
		case 'tappedBackground':
			return only(tappedBackground(state));
		case 'cleared':
			// In path mode it takes back a half-picked pair first, then leaves the mode.
			if (state.pathMode && state.pathFrom) return only({ ...state, pathFrom: null });
			if (state.pathMode) return only(withoutPathMode(state));
			return only(tappedBackground(state));
		case 'found':
			return only({ ...state, selectionCause: 'found', selected: event.id, path: null });
		case 'peekClosed':
			return only({ ...state, selected: null });
		case 'groupDissolved':
			return only({ ...state, dissolved: new Set([...state.dissolved, event.id]), selected: null });
		case 'groupsDrawn': {
			const { selected } = state;
			const gone = selected && isRoleGroupId(selected) && !event.groupIds.has(selected);
			return only(gone ? { ...state, selected: null } : state);
		}
		case 'treeRelaid':
			return only({ ...state, selectionCause: 'treeRelaid' });
		case 'pathToggled':
			return state.pathMode
				? only(withoutPathMode(state))
				: only({ ...withoutPathMode(state), pathMode: true, selected: null });
		case 'pathTraced':
			return only({ ...state, path: event.path, pathMissing: !event.path, pathFrom: null });
		case 'tracedOnOpen':
			return only({
				...state,
				pathMode: true,
				path: event.path ?? state.path,
				pathMissing: event.path ? state.pathMissing : true
			});
		case 'snapshotChanged':
			// A traced chain belongs to the links as they were; the snapshot may have changed them.
			return only({ ...state, path: null, pathFrom: null, pathMissing: false });
		case 'rebuilt': {
			const { selected } = state;
			const left = selected !== null && !event.nodeIds.has(selected);
			return only(left ? { ...state, selected: null } : state);
		}
		case 'circlePeeked':
			return only({ ...state, circleRoles: { ...NO_CIRCLE, circleId: event.circleId } });
		case 'circleRolesArrived': {
			if (state.circleRoles.circleId !== event.circleId) return only(state);
			const chosen = new Set(event.options.map((o) => o.role));
			return only({
				...state,
				circleRoles: { ...state.circleRoles, options: event.options, chosen }
			});
		}
		case 'roleToggled': {
			const chosen = new Set(state.circleRoles.chosen);
			if (!chosen.delete(event.role)) chosen.add(event.role);
			return only({ ...state, circleRoles: { ...state.circleRoles, chosen } });
		}
	}
}
