<script lang="ts">
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import PrivateMark from '$lib/components/ui/PrivateMark.svelte';
	import Veil from '$lib/components/ui/Veil.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { KIND_PRESENTATION } from '$lib/story/interaction-kinds';
	import { MEMORY_FACES, type MemoryRowView } from '$lib/memories/view';

	/*
	 * One memory of *On this day* (docs/02 §2.12.1): the faces, the first line, who wrote it.
	 * The whole row opens the entry; a private one stays veiled, and its veil passive, since the
	 * row is already the link.
	 */
	let { row }: { row: MemoryRowView } = $props();

	const t = useI18n().t;
	const kindLabel = $derived(
		row.interactionKind === null ? null : t(KIND_PRESENTATION[row.interactionKind].label)
	);
	const line = $derived(row.line ?? kindLabel ?? '');
	const faces = $derived(row.people.slice(0, MEMORY_FACES));
	const names = $derived(faces.map((p) => p.name).join(', '));
</script>

<li>
	<a
		href={row.href}
		class="grid grid-cols-[auto_1fr] items-center gap-2.5 rounded-app px-1.5 py-1.5 transition-colors hover:bg-card"
		data-testid="memory-row"
	>
		<span class="flex -space-x-2.5 *:rounded-full *:ring-2 *:ring-bg">
			{#each faces as person (person.id)}
				<Avatar id={person.id} name={person.name} avatarPhotoId={person.avatarPhotoId} size={28} />
			{/each}
		</span>
		<span class="min-w-0 text-[13px] leading-snug">
			<Veil
				id={row.veilId}
				isPrivate={row.isPrivate}
				label={t(row.kind === 'moment' ? 'privacy.veil.moment' : 'privacy.veil.interaction')}
				text={line}
				textClass="block truncate text-fg"
				passive
			>
				<span class="block truncate text-fg">{line}</span>
			</Veil>
			<span class="flex items-center gap-1 text-xs text-fg-subtle">
				<span class="truncate"
					>{names}{#if row.line !== null && kindLabel !== null}
						· {kindLabel}{/if}</span
				>
				{#if row.isPrivate}<PrivateMark veilId={row.veilId} class="text-[11px]" />{/if}
			</span>
		</span>
	</a>
</li>
