<script lang="ts">
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import { showsActorBadge } from '$lib/stream/actor-badge';

	/*
	 * A stream row leads with its subject's face; on a row another member wrote, their own small
	 * face sits on its corner (docs/05 §5.5). The sentence names them already, so it is
	 * decorative. Its ring is the row's ground, and follows the row's hover tint. A moment about
	 * several people shows up to three overlapping faces, then +N (docs/02 §2.20.3).
	 */
	type Person = { id: string; name: string; avatarPhotoId: string | null };
	interface Props {
		person: Person;
		/** The further people the row is about, beside `person`. */
		others?: readonly Person[];
		row: { mine: boolean; actor: { id: string; name: string } };
		/** The household's members — a household of one has no other writer to tell apart. */
		members: readonly unknown[];
	}
	let { person, others = [], row, members }: Props = $props();

	const MAX_FACES = 3;
	const everyone = $derived([person, ...others]);
	const shown = $derived(everyone.slice(0, MAX_FACES));
	const more = $derived(everyone.length - shown.length);
</script>

<span class="relative flex h-8">
	{#if everyone.length === 1}
		<Avatar id={person.id} name={person.name} avatarPhotoId={person.avatarPhotoId} size={32} />
	{:else}
		<span class="flex items-center -space-x-2" aria-hidden="true" data-testid="stream-faces">
			{#each shown as face (face.id)}
				<span class="rounded-full ring-2 ring-bg transition-shadow group-hover:ring-card">
					<Avatar id={face.id} name={face.name} avatarPhotoId={face.avatarPhotoId} size={28} />
				</span>
			{/each}
			{#if more > 0}
				<span
					class="grid size-7 place-items-center rounded-full bg-bg-sunken text-[10px] font-semibold text-fg-muted ring-2 ring-bg transition-shadow group-hover:ring-card"
					>+{more}</span
				>
			{/if}
		</span>
	{/if}
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
