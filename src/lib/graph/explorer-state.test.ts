import { describe, expect, it } from 'bun:test';
import {
	explorerAfter,
	explorerAtOpen,
	type ExplorerCommand,
	type ExplorerEvent,
	type ExplorerState
} from './explorer-state';
import type { ConnectionPath } from './model/types';

/*
 * The explorer's selection, peek panel and connection path (docs/05 §5.8): which tap selects,
 * which opens up, which picks the ends of a path, and what Escape lets go of first. The
 * arrangement, filters and full screen are in `explorer-look.test.ts`.
 */

const opened = (centerId: string | null = 'ann', compact = false) =>
	explorerAtOpen({ centerId, compact });

/** Every event in turn, and every command they asked for, in order. */
function run(state: ExplorerState, ...events: ExplorerEvent[]) {
	const commands: ExplorerCommand[] = [];
	for (const event of events) {
		const next = explorerAfter(state, event);
		state = next.state;
		commands.push(...next.commands);
	}
	return { state, commands };
}

const tap = (id: string, isGroup = false): ExplorerEvent => ({ type: 'tapped', id, isGroup });
const chain: ConnectionPath = {
	nodeIds: ['ann', 'bob'],
	model: { nodes: [], edges: [] }
};

describe('opening', () => {
	it('selects the centre on the route, nobody on a person’s page', () => {
		expect(opened('ann').selected).toBe('ann');
		expect(opened('ann', true).selected).toBeNull();
		expect(opened('ann').selectionCause).toBe('opened');
	});

	it('shows circles on the route and leaves them off on a person’s page', () => {
		expect(opened('ann').active.has('circles')).toBe(true);
		expect(opened('ann', true).active.has('circles')).toBe(false);
	});
});

describe('selection and the peek panel', () => {
	it('selects a tapped node, and a second tap on it opens it up', () => {
		const first = run(opened(), tap('bob'));
		expect(first.state.selected).toBe('bob');
		expect(first.state.selectionCause).toBe('tapped');
		expect(first.commands).toEqual([]);
		expect(run(first.state, tap('bob')).commands).toEqual([{ kind: 'expand', id: 'bob' }]);
	});

	it('lets go of the selection on a background tap or closing the peek', () => {
		const onBob = run(opened(), tap('bob')).state;
		expect(run(onBob, { type: 'tappedBackground' }).state.selected).toBeNull();
		expect(run(onBob, { type: 'peekClosed' }).state.selected).toBeNull();
	});

	it('selects a group without clearing a path, and never while picking one', () => {
		expect(run(opened(), tap('rolegroup:club', true)).state.selected).toBe('rolegroup:club');
		const picking = run(opened(), { type: 'pathToggled' }, tap('rolegroup:club', true));
		expect(picking.state.selected).toBeNull();
		expect(picking.state.pathFrom).toBeNull();
	});

	it('marks a person found by search as asked for', () => {
		const found = run(opened(), { type: 'found', id: 'cy' }).state;
		expect(found).toMatchObject({ selected: 'cy', selectionCause: 'found', path: null });
	});

	it('marks the selection as no question once an expand relaid the tree', () => {
		expect(run(opened(), tap('bob'), { type: 'treeRelaid' }).state.selectionCause).toBe(
			'treeRelaid'
		);
	});

	it('drops the selection of a group that is no longer drawn, and dissolving one closes it', () => {
		const onGroup = run(opened(), tap('rolegroup:club', true)).state;
		const stillDrawn = { type: 'groupsDrawn', groupIds: new Set(['rolegroup:club']) } as const;
		expect(explorerAfter(onGroup, stillDrawn).state).toBe(onGroup);
		expect(run(onGroup, { type: 'groupsDrawn', groupIds: new Set() }).state.selected).toBeNull();
		// A person is not a group, whatever groups are drawn.
		expect(run(opened(), { type: 'groupsDrawn', groupIds: new Set() }).state.selected).toBe('ann');

		const dissolved = run(onGroup, { type: 'groupDissolved', id: 'rolegroup:club' }).state;
		expect(dissolved.selected).toBeNull();
		expect([...dissolved.dissolved]).toEqual(['rolegroup:club']);
	});
});

describe('the connection path', () => {
	it('enters path mode with nothing selected, picks two ends, and asks for the chain', () => {
		const picking = run(opened(), { type: 'pathToggled' });
		expect(picking.state).toMatchObject({ pathMode: true, selected: null, pathFrom: null });
		const asked = run(picking.state, tap('ann'), tap('bob'));
		expect(asked.commands).toEqual([{ kind: 'tracePath', from: 'ann', to: 'bob' }]);
		// The first end stays picked while the chain is looked for.
		expect(asked.state.pathFrom).toBe('ann');
		expect(asked.state.selectionCause).toBe('tapped');
	});

	it('takes back a picked end tapped twice', () => {
		const back = run(opened(), { type: 'pathToggled' }, tap('ann'), tap('ann'));
		expect(back.state.pathFrom).toBeNull();
		expect(back.commands).toEqual([]);
	});

	it('shows a chain found, or says there is none, and is ready for the next pair', () => {
		const picking = run(opened(), { type: 'pathToggled' }, tap('ann'), tap('bob')).state;
		expect(run(picking, { type: 'pathTraced', path: chain }).state).toMatchObject({
			path: chain,
			pathMissing: false,
			pathFrom: null
		});
		expect(run(picking, { type: 'pathTraced', path: null }).state).toMatchObject({
			path: null,
			pathMissing: true,
			pathFrom: null
		});
	});

	it('keeps the path through background taps, and leaving the mode clears it', () => {
		const traced = run(opened(), { type: 'pathToggled' }, tap('ann'), tap('bob'), {
			type: 'pathTraced',
			path: null
		}).state;
		expect(explorerAfter(traced, { type: 'tappedBackground' }).state).toBe(traced);
		expect(run(traced, { type: 'pathToggled' }).state).toMatchObject({
			pathMode: false,
			path: null,
			pathMissing: false
		});
	});

	it('opens straight into path mode with a chain traced from the link', () => {
		expect(run(opened(), { type: 'tracedOnOpen', path: chain }).state).toMatchObject({
			pathMode: true,
			path: chain,
			pathMissing: false
		});
		expect(run(opened(), { type: 'tracedOnOpen', path: null }).state).toMatchObject({
			pathMode: true,
			path: null,
			pathMissing: true
		});
	});

	it('forgets a chain when a new snapshot arrives, and the selection if it left the map', () => {
		const traced = run(opened(), tap('bob'), { type: 'pathToggled' }, tap('ann'), tap('bob'), {
			type: 'pathTraced',
			path: chain
		}).state;
		const changed = run(traced, { type: 'snapshotChanged' }).state;
		expect(changed).toMatchObject({ path: null, pathFrom: null, pathMissing: false });

		const kept = run(opened(), tap('bob'), { type: 'rebuilt', nodeIds: new Set(['ann', 'bob']) });
		expect(kept.state.selected).toBe('bob');
		const gone = run(opened(), tap('bob'), { type: 'rebuilt', nodeIds: new Set(['ann']) });
		expect(gone.state.selected).toBeNull();
	});
});

describe('the keyboard on the canvas', () => {
	// Enter is a tap (`GraphCanvas` sends it as one); Escape lets go one step at a time.
	it('takes back a half-picked pair first, then leaves path mode', () => {
		const half = run(opened(), { type: 'pathToggled' }, tap('ann')).state;
		const first = run(half, { type: 'cleared' }).state;
		expect(first).toMatchObject({ pathMode: true, pathFrom: null });
		expect(run(first, { type: 'cleared' }).state.pathMode).toBe(false);
	});

	it('lets go of the selection outside path mode', () => {
		expect(run(opened(), tap('bob'), { type: 'cleared' }).state.selected).toBeNull();
	});
});

describe('a circle’s roles in the peek panel', () => {
	const options = [
		{ role: 'Coach', count: 1 },
		{ role: null, count: 3 }
	];

	it('chooses every role once they arrive, and the reader narrows them', () => {
		const peeked = run(opened(), { type: 'circlePeeked', circleId: 'club' }).state;
		expect(peeked.circleRoles).toEqual({ circleId: 'club', options: [], chosen: new Set() });
		const arrived = run(peeked, { type: 'circleRolesArrived', circleId: 'club', options }).state;
		expect([...arrived.circleRoles.chosen]).toEqual(['Coach', null]);
		const narrowed = run(arrived, { type: 'roleToggled', role: 'Coach' }).state;
		expect([...narrowed.circleRoles.chosen]).toEqual([null]);
		expect([
			...run(narrowed, { type: 'roleToggled', role: 'Coach' }).state.circleRoles.chosen
		]).toEqual([null, 'Coach']);
	});

	it('drops roles that arrive for a circle the reader has since left', () => {
		const left = run(
			opened(),
			{ type: 'circlePeeked', circleId: 'club' },
			{ type: 'circlePeeked', circleId: null },
			{ type: 'circleRolesArrived', circleId: 'club', options }
		).state;
		expect(left.circleRoles).toEqual({ circleId: null, options: [], chosen: new Set() });
	});
});
