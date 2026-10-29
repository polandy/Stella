<script lang="ts">
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import { showsActorBadge } from '$lib/stream/actor-badge';

	/*
	 * A stream row leads with its subject's face; on a row another member wrote, their own small
	 * face sits on its corner (docs/05 §5.5). The sentence names them already, so it is
	 * decorative. Its ring is the row's ground, and follows the row's hover tint.
	 */
	interface Props {
		person: { id: string; name: string; avatarPhotoId: string | null };
		row: { mine: boolean; actor: { id: string; name: string } };
		/** The household's members — a household of one has no other writer to tell apart. */
		members: readonly unknown[];
	}
	let { person, row, members }: Props = $props();
</script>

<span class="relative size-8">
	<Avatar id={person.id} name={person.name} avatarPhotoId={person.avatarPhotoId} size={32} />
	{#if showsActorBadge(row, members)}
		<span
			class="absolute -right-1 -bottom-1 rounded-full ring-2 ring-bg transition-shadow group-hover:ring-card"
			aria-hidden="true"
			data-testid="actor-badge"
		>
			<Avatar id={row.actor.id} name={row.actor.name} size={16} />
		</span>
	{/if}
</span>
