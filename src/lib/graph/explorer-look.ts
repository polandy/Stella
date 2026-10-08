import type { ExplorerCommand, ExplorerState, ExplorerStep, LookEvent } from './explorer-state';
import { removeView, saveView, viewMatching } from './model/saved-views';
import { labelsAfterArranging, labelsOn, toggledLabels, type LabelsState } from './tree-view';
import type { ViewSwitches } from './view-switches';

/*
 * How the explorer's map is looked at (docs/05 §5.8, docs/02 §2.7): the arrangement, the
 * Filter menu's kinds of line, switches, density and saved views, and full screen. The part of
 * `explorer-state.ts` that never changes who is selected or what the map holds. Pure.
 */

const labelsOf = (state: ExplorerState): LabelsState => ({
	habit: state.switches.edgeLabels,
	inTree: state.treeLabels
});

/** Whether the Labels switch stands on: the reader's habit, or the tree's own choice in it. */
export const labelsSwitchOf = (state: ExplorerState, rolesInstead: boolean): boolean =>
	labelsOn(labelsOf(state), rolesInstead);

/** The tree's rows are generations, which a group would only pull apart (docs/02 §2.7). */
export const groupingApplies = (state: ExplorerState): boolean =>
	state.switches.groupRoles && state.arrangedBy !== 'tree';

/** The saved view the Filter menu stands at now, if any. */
export const currentViewOf = (state: ExplorerState): string | null =>
	viewMatching(state.savedViews, { active: state.active, switches: state.switches });

const only = (state: ExplorerState, commands: ExplorerCommand[] = []): ExplorerStep => ({
	state,
	commands
});

/** A switch flipped as a tap would: the habit changes and this device keeps it. */
function withSwitch(state: ExplorerState, name: keyof ViewSwitches): ExplorerStep {
	const on = !state.switches[name];
	return only({ ...state, switches: { ...state.switches, [name]: on } }, [
		{ kind: 'keepSwitch', name, on }
	]);
}

/** The state after an event about how the map is looked at. */
export function lookAfter(state: ExplorerState, event: LookEvent): ExplorerStep {
	switch (event.type) {
		case 'filterToggled': {
			const active = new Set(state.active);
			if (!active.delete(event.key)) active.add(event.key);
			return only({ ...state, active });
		}
		case 'switchFlipped': {
			if (event.name !== 'edgeLabels') return withSwitch(state, event.name);
			const next = toggledLabels(labelsOf(state), event.rolesInstead);
			const inTree = { ...state, treeLabels: next.inTree };
			return next.habit === state.switches.edgeLabels
				? only(inTree)
				: withSwitch(inTree, 'edgeLabels');
		}
		case 'densityChosen': {
			if (event.density === state.density) return only(state);
			const { density } = event;
			return only({ ...state, density }, [
				{ kind: 'keepDensity', density },
				{ kind: 'respace', density, rearrange: state.arrangedBy === 'force' }
			]);
		}
		case 'viewApplied': {
			// The switches are habits this browser keeps one by one; a view sets them like a tap would.
			let step = only({ ...state, active: new Set(event.view.filters) });
			for (const name of Object.keys(event.view.switches) as (keyof ViewSwitches)[]) {
				if (step.state.switches[name] === event.view.switches[name]) continue;
				const flipped = withSwitch(step.state, name);
				step = only(flipped.state, [...step.commands, ...flipped.commands]);
			}
			return step;
		}
		case 'viewSaved':
		case 'viewDeleted': {
			const views =
				event.type === 'viewSaved'
					? saveView(state.savedViews, event.name, state)
					: removeView(state.savedViews, event.name);
			return only({ ...state, savedViews: views }, [{ kind: 'keepViews', views }]);
		}
		case 'arranged': {
			const { inTree } = labelsAfterArranging(labelsOf(state), state.arrangedBy, event.key);
			return only({ ...state, treeLabels: inTree, arrangedBy: event.key }, [
				{ kind: 'arrange', key: event.key }
			]);
		}
		case 'preferencesLoaded':
			return only({ ...state, ...event.kept });
		case 'screen': {
			const commands: ExplorerCommand[] = [];
			if (state.screen.was && !event.on) commands.push({ kind: 'leftFullscreen' });
			let told = state.screen.told;
			if (event.canvasReady && event.on !== told) {
				told = event.on;
				commands.push({ kind: 'screenChanged' });
			}
			if (state.screen.was === event.on && state.screen.told === told) return only(state);
			return only({ ...state, screen: { was: event.on, told } }, commands);
		}
	}
}
