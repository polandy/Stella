<script lang="ts">
	import RelationshipMap from '$lib/components/graph/RelationshipMap.svelte';
	import { withoutRelationships } from '$lib/graph/model/without-pending';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { relationshipRowLabel } from '$lib/relationships/labels';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { removalKey } from '$lib/undo/keys';
	import type { PersonPageData } from './types';

	/*
	 * The People card's map (docs/05 §5.5): who this person is connected to as a shape. Beside
	 * the list on a wide card, above it on a narrow one, and a small preview on a phone that opens
	 * the map full screen. It draws as plain SVG and becomes the interactive explorer once the
	 * engine has loaded.
	 */
	let { data }: { data: PersonPageData } = $props();

	const t = useI18n().t;
	const c = $derived(data.contact);
	const removals = useRemovals();

	// One map node per connected person (a person may hold several relationship types; the
	// map shows them once, keeping the first label). The face comes from the graph slice,
	// which already carries every visible person's avatar — so the first paint wears the same
	// faces the interactive map does, rather than swapping initials for photos as it loads.
	const photoById = $derived(
		new Map(data.graph.nodes.map((node) => [node.id, node.avatarPhotoId ?? null]))
	);
	/*
	 * A removal is held for its undo window before it is sent (docs/02 §2.23), and the list
	 * hides the row for that whole window. The map agrees with the list: were it to keep the
	 * link, it would vanish by itself eight seconds later, which reads as a slow save rather
	 * than a window that was there to be used.
	 */
	const pendingRelationships = $derived(
		new Set(
			data.relationships
				.filter((r) => removals.isPending(removalKey('relationship', r.id)))
				.map((r) => r.id)
		)
	);
	const visibleGraph = $derived(withoutRelationships(data.graph, pendingRelationships, c.id));
	const egoNodes = $derived.by(() => {
		const seen = new Set<string>();
		const out: {
			id: string;
			name: string;
			label: string;
			category: string;
			avatarPhotoId: string | null;
		}[] = [];
		for (const r of data.relationships) {
			if (pendingRelationships.has(r.id)) continue;
			if (seen.has(r.otherContactId)) continue;
			seen.add(r.otherContactId);
			out.push({
				id: r.otherContactId,
				name: r.otherDisplayName,
				label: relationshipRowLabel(t, r),
				category: r.category,
				avatarPhotoId: photoById.get(r.otherContactId) ?? null
			});
		}
		return out;
	});
</script>

{#if egoNodes.length > 0}
	<!--
		Keyed on the person: opening a profile from the map's peek panel is a navigation within
		this same route, so without a remount the explorer would keep the previous person's
		graph — and its open panel — over the new page.
	-->
	{#key c.id}
		<RelationshipMap
			centerId={c.id}
			centerName={c.displayName}
			centerPhotoId={c.avatarPhotoId}
			graph={visibleGraph}
			nodes={egoNodes}
			fullGraphHref={(nodeId) => `/graph?center=${nodeId}`}
		/>
	{/key}
{/if}
