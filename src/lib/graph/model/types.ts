/*
 * Pure graph domain — value types (docs/04 §4.11, docs/02 §2.7).
 *
 * This is the neutral model the explorer reasons over: framework- and library-agnostic,
 * with no Cytoscape (or any renderer) types leaking in. The Drizzle-backed adapter feeds it
 * through the `GraphDataSource` port and applies access scoping (docs/03 §3.7); the pure
 * builders in this folder never touch the database.
 */

/** A node is either a person (contact) or a circle / shared context (docs/02 §2.4.2). */
export type NodeKind = 'person' | 'circle';

/**
 * Edge kinds carried by the model. `relationship` is a typed pairwise link (its `category`
 * drives colour); `membership` connects a person to a circle; `kinship` is a derived,
 * clearly-inferred link (docs/02 §2.4.1) — added as its own kind so filters and rendering
 * treat it distinctly without special-casing.
 */
export type EdgeKind = 'relationship' | 'membership' | 'kinship';

export type RelationshipCategory = 'family' | 'romantic' | 'social' | 'professional' | 'other';

export interface GraphNode {
	id: string;
	kind: NodeKind;
	/** Display label: a person's name or a circle's name. */
	label: string;
	/** Person only: deceased contacts are rendered subtly desaturated (docs/05 §5.8). */
	deceased?: boolean;
}

export interface GraphEdge {
	/** Stable identity used to deduplicate when neighbourhoods overlap during a merge. */
	id: string;
	source: string;
	target: string;
	kind: EdgeKind;
	/** Present for `relationship` edges; drives the category colour (docs/05 §5.6). */
	category?: RelationshipCategory;
	/** Perspective-neutral label, e.g. "Mother", "via Ski Course", or a derived-kinship term. */
	label?: string;
	/** `true` when the link is derived/inferred rather than stored (docs/02 §2.4.1). */
	derived?: boolean;
	/** `true` when direction is meaningful (asymmetric relationship, source → target). */
	directed?: boolean;
}

export interface GraphModel {
	nodes: GraphNode[];
	edges: GraphEdge[];
}

/**
 * The neighbourhood of a single node: the node itself plus its directly adjacent nodes and
 * the edges incident to it. Every edge here touches `center`.
 */
export interface Neighborhood {
	center: GraphNode;
	nodes: GraphNode[];
	edges: GraphEdge[];
}

/**
 * Port through which the pure builders obtain graph data. An adapter (Drizzle) implements it
 * and returns only what the viewer may see; `null` means the node is missing or not visible —
 * indistinguishable on purpose, so existence is never revealed (docs/03 §3.7).
 */
export interface GraphDataSource {
	neighborhood(nodeId: string): Promise<Neighborhood | null>;
}

/** Filter criteria for {@link applyFilters}. Omitted fields impose no constraint. */
export interface GraphFilters {
	/** Keep only edges of these kinds. */
	edgeKinds?: EdgeKind[];
	/** For `relationship` edges, keep only these categories (other kinds are unaffected). */
	categories?: RelationshipCategory[];
	/** A node never dropped as an orphan — typically the ego centre. */
	keepNodeId?: string;
	/** Remove nodes left unreachable from `keepNodeId` (or edgeless when it's absent). Default true. */
	dropOrphans?: boolean;
}

/** Ordered shortest path between two nodes plus the sub-graph of exactly that chain. */
export interface ConnectionPath {
	/** Node ids from source to target, in order. */
	nodeIds: string[];
	model: GraphModel;
}
