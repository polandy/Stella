<script lang="ts">
	import RelationshipMap from '$lib/components/graph/RelationshipMap.svelte';
	import { withoutRelationships } from '$lib/graph/model/without-pending';
	import { groupPeople } from '$lib/relationships/people-groups';
	import { otherEndRole } from '$lib/relationships/roles';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { removalKey } from '$lib/undo/keys';
	import type { PersonPageData } from './types';

	/*
	 * The People card's map (docs/05 §5.5): who this person is connected to as a shape, at the
	 * card's top. A server-drawn preview on every width — a wide strip with first names on a
	 * wide card, a small ring on a phone — that enlarges into the interactive explorer inside the
	 * card, or opens it full screen.
	 */
	let { data }: { data: PersonPageData } = $props();

	const c = $derived(data.contact);
	const removals = useRemovals();

	// One map node per connected person (a person may hold several relationship types; the
	// map shows them once, in the first one's category). The face comes from the graph slice,
	// which already carries every visible person's avatar — so the first paint wears the same
	// faces the interactive map does, rather than swapping initials for photos as it loads.
	const firstNameById = $derived(
		new Map(data.people.map((person) => [person.id, person.firstName]))
	);
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
			firstName: string;
			category: string;
			avatarPhotoId: string | null;
		}[] = [];
		// In the list's order — family first, the closest tie first — so the strip's innermost
		// faces are the ones the list starts with.
		const ordered = groupPeople(
			data.relationships
				.filter((r) => !pendingRelationships.has(r.id))
				.map((r) => ({ ...r, role: otherEndRole(r) }))
		).flatMap((group) => group.rows);
		for (const r of ordered) {
			if (seen.has(r.otherContactId)) continue;
			seen.add(r.otherContactId);
			out.push({
				id: r.otherContactId,
				name: r.otherDisplayName,
				// The strip names each face; a record without a first name gives its first word.
				firstName: firstNameById.get(r.otherContactId) || r.otherDisplayName.split(/\s+/)[0],
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
