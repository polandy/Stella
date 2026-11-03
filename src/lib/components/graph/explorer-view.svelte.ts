import type { Translate } from '$lib/i18n/translate';
import { captionWords } from '$lib/graph/caption-words';
import { slotElements, toCytoscapeElements } from '$lib/graph/cytoscape/elements';
import { edgeWords, treeRoleWords } from '$lib/graph/edge-words';
import { groupingApplies, labelsSwitchOf } from '$lib/graph/explorer-look';
import type { ExplorerState } from '$lib/graph/explorer-state';
import { edgeLabelsFit, linesDrawn } from '$lib/graph/layout/legibility';
import { expandWouldAdd } from '$lib/graph/model/expand-offer';
import { familyLinksAmong } from '$lib/graph/model/generations';
import { applyFilters, mergeModels } from '$lib/graph/model/graph-model';
import { hiddenNeighbourCounts } from '$lib/graph/model/hidden-neighbours';
import { impliedKinshipEdgeIds } from '$lib/graph/model/implied-kinship';
import {
	drawnSlotLine,
	isParentSlot,
	missingParentSlots,
	type ParentSlot
} from '$lib/graph/model/missing-parents';
import { canExpand, hasLinks, ringsFrom } from '$lib/graph/model/rings';
import {
	groupByRole,
	linksOfGrouped,
	type EdgeBundle,
	type RoleGrouping,
	type RoleGroup
} from '$lib/graph/model/role-groups';
import { shelfCaptions } from '$lib/graph/model/shelf-captions';
import { shownOnCanvas } from '$lib/graph/model/shown-on-canvas';
import { rolesTowards } from '$lib/graph/model/tree-roles';
import { hiddenInTree } from '$lib/graph/model/tree-shown';
import type { GraphEdge, GraphFilters, GraphModel, GraphNode } from '$lib/graph/model/types';
import { graphFiltersFor } from '$lib/graph/model/view-filters';
import { selectionAsked } from '$lib/graph/tree-view';
import { privateCount, type ExportChoices } from '$lib/graph/tree-export';
import { exportScene } from '$lib/graph/tree-export-scene';

/**
 * What the explorer reads its view from. Each input is its own getter, so a value derived from
 * one of them is worked out again only when that one changes — never on every explorer event.
 */
export interface ExplorerViewInput {
	/** The graph the explorer may reach, as the server delivered it. */
	graph: () => GraphModel;
	/** What the reader has opened up of it. */
	model: () => GraphModel;
	ui: () => ExplorerState;
	centerId: () => string | null;
	compact: () => boolean;
	maxRings: () => number;
	mayAddParents: () => boolean;
}

/** The map as the explorer shows it, worked out from what was opened up and how it is looked at. */
export interface ExplorerView {
	/** The tree around a person, which writes who everybody is under each name. */
	readonly rolesInstead: boolean;
	/** The Labels switch as it stands now. */
	readonly labelsSwitch: boolean;
	/** Every line is named, since the names fit. */
	readonly labelsFit: boolean;
	/** The map as drawn: what was opened up, plus the links that come along with it. */
	readonly drawn: GraphModel;
	/** The same, filtered. */
	readonly drawnVisible: GraphModel;
	readonly grouping: RoleGrouping | null;
	/** The "+N" on a node that can still grow. */
	readonly hidden: Map<string, number>;
	readonly rings: Map<string, number>;
	/** The slots for missing parents up the centre's line. */
	readonly slots: ParentSlot[];
	readonly peekNode: GraphNode | null;
	readonly peekGroup: RoleGroup | null;
	/** The peeked node is inside the map's reach. */
	readonly peekWithinReach: boolean;
	/** Expand on the peeked node would add something. */
	readonly peekExpandable: boolean;
	/** A centre linked to nobody, on the explorer route. */
	readonly lonelyCentre: GraphNode | null;
	readonly exportable: boolean;
	readonly exportTitle: string;
	readonly privateCount: number;
	/** The canvas's elements: the drawn map, its groups, and the slots. */
	elements(): ReturnType<typeof toCytoscapeElements>;
	/** What the canvas shows: the filtered map, plus the frames and bundles grouping adds. */
	shownIds(): ReturnType<typeof shownOnCanvas>;
	exportSceneFor(
		choices: Pick<ExportChoices, 'dates' | 'withPrivate'>
	): ReturnType<typeof exportScene>;
	groupLabel(group: RoleGroup): string;
	nameOf(id: string): string;
	/** What the keyboard walk reads out: a slot by what it adds, as the button it acts as. */
	canvasNameOf(id: string): string;
}

/**
 * Called while the explorer initialises, since it creates deriveds. The transitions of the
 * explorer's state are `explorer-state.ts`; this works out what that state shows.
 */
export function explorerView(input: ExplorerViewInput, t: Translate): ExplorerView {
	const { graph, model, centerId, compact, maxRings, mayAddParents } = input;
	// One derived per field, as in the explorer: an event that changes one of them re-runs only
	// what reads that one.
	const selected = $derived(input.ui().selected);
	const selectionCause = $derived(input.ui().selectionCause);
	const active = $derived(input.ui().active);
	const path = $derived(input.ui().path);
	const switches = $derived(input.ui().switches);
	const dissolved = $derived(input.ui().dissolved);
	const arrangedBy = $derived(input.ui().arrangedBy);

	// A built-in relationship type reads in the viewer's language, a household's own type as
	// somebody typed it, and a former link says so (docs/02 §2.19, §2.7).
	const edgeLabel = (edge: GraphEdge): string => edgeWords(t, edge);

	function buildFilters(): GraphFilters {
		return graphFiltersFor(active, centerId(), switches);
	}

	/*
	 * The family tree around a person says who everybody is to them under each name — Father,
	 * Grandmother — instead of naming every line (docs/05 §5.8). Around a circle there is nobody
	 * to be anybody's father, and the lines keep their names as in every other arrangement.
	 */
	const rolesInstead = $derived(
		arrangedBy === 'tree' &&
			centerId() !== null &&
			graph().nodes.some((n) => n.id === centerId() && n.kind === 'person')
	);
	const roles = $derived.by(() => {
		const centre = centerId();
		return rolesInstead && centre ? rolesTowards(graph(), centre) : null;
	});
	const shortNameOf = (id: string) => {
		const node = graph().nodes.find((n) => n.id === id);
		return node?.shortName ?? node?.label ?? id;
	};
	const roleOf = (id: string): string | undefined => {
		const role = roles?.get(id);
		if (role) return treeRoleWords(t, role);
		const caption = shelf?.get(id);
		return caption ? captionWords(t, caption, shortNameOf) : undefined;
	};

	const visible = $derived(applyFilters(model(), buildFilters()));
	// Grouping reads what is shown, so the Circles chip off leaves no membership to group by;
	// the tree's rows are generations, which a group would only pull apart (docs/02 §2.7).
	const groupingOn = $derived(groupingApplies(input.ui()));
	// Who is grouped depends only on the memberships shown; it decides whose links come along.
	const grouped = $derived(
		groupingOn
			? new Set(groupByRole(visible, { innerLinks: switches.innerLinks, dissolved }).groupOf.keys())
			: null
	);
	/*
	 * The map as drawn: what was opened up, plus the links of grouped people to anyone else on
	 * it. Opening a circle brings its members without their links to each other, and a group is
	 * about how its people belong together (docs/02 §2.7). The family tree likewise draws the
	 * family links among the people on it — the parents' marriage, both parents' lines to a
	 * child — or a map grown from one person would be a star rather than a tree (docs/05 §5.8).
	 */
	const drawn = $derived.by(() => {
		const opened = model();
		const onMap = () => new Set(opened.nodes.map((n) => n.id));
		if (grouped && grouped.size > 0) {
			return mergeModels(opened, { nodes: [], edges: linksOfGrouped(graph(), onMap(), grouped) });
		}
		if (arrangedBy === 'tree') {
			return mergeModels(opened, { nodes: [], edges: familyLinksAmong(graph(), onMap()) });
		}
		return opened;
	});
	const drawnVisible = $derived(drawn === model() ? visible : applyFilters(drawn, buildFilters()));
	// The shelf beneath says who is who too: "Friend of Sandra", a circle's people on the map.
	const shelf = $derived.by(() => {
		const centre = centerId();
		return rolesInstead && centre ? shelfCaptions(graph(), drawnVisible, centre) : null;
	});
	/*
	 * The derived lines whose chain of entered links is on the map only repeat it, so they stay
	 * off unless the reader asks for every one of them (docs/02 §2.7). Read without the
	 * selection, so a bundle between two groups counts only the lines the map draws, and
	 * selecting someone neither rebuilds the canvas nor moves anybody.
	 */
	const leftOff = $derived(
		switches.allKinship ? new Set<string>() : impliedKinshipEdgeIds(drawnVisible)
	);
	const grouping = $derived(
		groupingOn
			? groupByRole(drawnVisible, { innerLinks: switches.innerLinks, dissolved, leftOff })
			: null
	);
	const groupLabel = (g: RoleGroup) =>
		t('graph.group.label', { role: g.role ?? t('circles.noRole'), count: g.memberIds.length });
	// The line to a group needs no count: the group's own name carries it.
	const bundleLabel = (b: EdgeBundle) =>
		b.kind === 'membership' ? '' : t('graph.bundle.count', { count: b.edgeIds.length });
	const elements = () => [
		...toCytoscapeElements(drawn, {
			centerId: centerId() ?? undefined,
			edgeLabel,
			hiddenNeighbours: hidden,
			grouping: grouping ? { grouping, groupLabel, bundleLabel } : undefined,
			roleOf
		}),
		...slotElements(slots, slotName)
	];
	/*
	 * Every line is named only while the names fit (docs/05 §5.8); past that they pile up
	 * around a hub, and pointing at a line or selecting somebody names theirs. Counted without
	 * the selection, so selecting somebody never switches every name on or off.
	 */
	/*
	 * The Labels switch as it stands now: the reader's habit, or — in the tree around a person,
	 * where the roles under the names say it — the tree's own choice, off each time the tree is
	 * entered (`tree-view.ts`, docs/05 §5.8).
	 */
	const labelsSwitch = $derived(labelsSwitchOf(input.ui(), rolesInstead));
	// The lines the tree leaves off are no more drawn than the left-off kinship.
	const treeLeftOff = $derived(
		arrangedBy === 'tree' ? hiddenInTree(drawnVisible, null) : new Set<string>()
	);
	const labelsFit = $derived(
		edgeLabelsFit(
			labelsSwitch,
			linesDrawn(
				drawnVisible.edges,
				grouping ? [leftOff, grouping.tucked, treeLeftOff] : [leftOff, treeLeftOff],
				grouping?.bundles.length ?? 0
			)
		)
	);
	// The same lines, but the selected person's own are drawn: selecting names every line. The
	// family tree also leaves off the lines its bars already draw, and the shelf's lines until
	// one end is selected (docs/05 §5.8); a traced path shows every line it runs along.
	const implied = $derived.by(() => {
		const left = switches.allKinship
			? new Set<string>()
			: impliedKinshipEdgeIds(drawnVisible, selected);
		if (arrangedBy !== 'tree') return left;
		const onPath = new Set(path?.model.edges.map((e) => e.id) ?? []);
		// Neither the centre the route opens with nor the person an expand just laid the tree out
		// around is a question the reader asked: their friends and circles stay unlinked until
		// somebody is tapped (`tree-view.ts`).
		const asked = selectionAsked(selectionCause) ? selected : null;
		for (const id of hiddenInTree(drawnVisible, asked, onPath)) left.add(id);
		return left;
	});
	// The tree goes out as it is shown, in the tree arrangement only (docs/02 §2.7).
	const exportable = $derived(arrangedBy === 'tree' && drawnVisible.nodes.length > 0);
	const exportTitle = $derived.by(() => {
		const centreId = centerId();
		const centre = centreId ? drawnVisible.nodes.find((n) => n.id === centreId) : undefined;
		return centre
			? t('graph.export.defaultTitle', { name: centre.label })
			: t('graph.export.untitled');
	});
	const exportSceneFor = (choices: Pick<ExportChoices, 'dates' | 'withPrivate'>) =>
		exportScene({
			graph: graph(),
			shown: drawnVisible,
			centerId: centerId(),
			rolesInstead,
			allKinship: switches.allKinship,
			choices,
			t
		});
	const shownIds = () => {
		const shown = shownOnCanvas(drawnVisible, implied, grouping);
		for (const slot of slots) {
			shown.nodes.add(slot.id);
			shown.edges.add(drawnSlotLine(slot).id);
		}
		return shown;
	};
	const peekGroup = $derived(
		selected ? (grouping?.groups.find((g) => g.id === selected) ?? null) : null
	);
	const nameOf = (id: string) => model().nodes.find((n) => n.id === id)?.label ?? id;
	const canvasNameOf = (id: string) => {
		const slot = isParentSlot(id) ? slots.find((s) => s.id === id) : undefined;
		return slot ? t('graph.keyboard.button', { name: slotName(slot) }) : nameOf(id);
	};
	const peekNode = $derived(
		selected ? (model().nodes.find((n) => n.id === selected) ?? null) : null
	);
	// How far each node sits from the centre, so the embedded map stops where it promises to.
	const rings = $derived.by(() => {
		const centre = centerId();
		return centre ? ringsFrom(model(), centre) : new Map<string, number>();
	});
	/*
	 * The slots for missing parents up the centre's line, while the tree writes roles around a
	 * person (docs/02 §2.7). Never part of `model`: no filter, "+N" or path counts them. A
	 * person's page carries two hops, so whose parents it holds is whoever an expand could open.
	 */
	const slots = $derived.by(() => {
		const centre = centerId();
		return rolesInstead && mayAddParents() && centre
			? missingParentSlots(graph(), drawnVisible, centre, (id) => canExpand(rings, id, maxRings()))
			: [];
	});
	const slotName = (slot: ParentSlot) =>
		t(slot.besideParentId ? 'graph.tree.addOtherParent' : 'graph.tree.addParent', {
			name: shortNameOf(slot.childId)
		});
	// Inside the map's reach, and with something left to open — Expand on somebody whose every
	// link is drawn already, or who has none, was a button that did nothing (docs/02 §2.7).
	const peekWithinReach = $derived(
		peekNode !== null && (centerId() === null || canExpand(rings, peekNode.id, maxRings()))
	);
	// The "+N" on a node that can still grow: who an expand would bring in under the current
	// filters, and none past the embedded map's last ring (docs/05 §5.8).
	const hidden = $derived(
		hiddenNeighbourCounts(graph(), drawnVisible, {
			filters: buildFilters(),
			expandable: (id) => centerId() === null || canExpand(rings, id, maxRings())
		})
	);
	// Expand is offered exactly when it would add something under the current filters: somebody
	// behind the "+N", or a line among people already shown — never a button that does nothing,
	// and never missing where a circle's roles are still to be drawn (docs/02 §2.7).
	const peekHasMore = $derived(
		peekNode !== null && expandWouldAdd(graph(), drawn, peekNode.id, buildFilters())
	);
	const peekExpandable = $derived(peekWithinReach && peekHasMore);
	/*
	 * A centre linked to nobody draws one lonely dot. The explorer route says why and offers
	 * the step that changes it; an embedded map is never drawn for somebody without links.
	 */
	const lonelyCentre = $derived.by(() => {
		const centre = centerId();
		return !compact() && centre !== null && !hasLinks(graph(), centre)
			? (graph().nodes.find((n) => n.id === centre) ?? null)
			: null;
	});
	const privateShown = $derived(privateCount(drawnVisible));

	return {
		get rolesInstead() {
			return rolesInstead;
		},
		get labelsSwitch() {
			return labelsSwitch;
		},
		get labelsFit() {
			return labelsFit;
		},
		get drawn() {
			return drawn;
		},
		get drawnVisible() {
			return drawnVisible;
		},
		get grouping() {
			return grouping;
		},
		get hidden() {
			return hidden;
		},
		get rings() {
			return rings;
		},
		get slots() {
			return slots;
		},
		get peekNode() {
			return peekNode;
		},
		get peekGroup() {
			return peekGroup;
		},
		get peekWithinReach() {
			return peekWithinReach;
		},
		get peekExpandable() {
			return peekExpandable;
		},
		get lonelyCentre() {
			return lonelyCentre;
		},
		get exportable() {
			return exportable;
		},
		get exportTitle() {
			return exportTitle;
		},
		get privateCount() {
			return privateShown;
		},
		elements,
		shownIds,
		exportSceneFor,
		groupLabel,
		nameOf,
		canvasNameOf
	};
}
