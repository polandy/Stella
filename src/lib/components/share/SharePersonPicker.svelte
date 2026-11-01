<script lang="ts">
	import { matchesQuery, type DirectoryPerson } from '$lib/people/directory';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import Avatar from '../ui/Avatar.svelte';
	import Icon from '../ui/Icon.svelte';
	import { INPUT } from '../person/inputs';

	/*
	 * Whom a share is about (docs/02 §2.18.3): one person. Before anything is typed, the few
	 * the sheet offers first — opened last on this device, then last written about; a name typed
	 * searches everyone the viewer may see, from the shell's list, offline too.
	 */

	type Person = DirectoryPerson & { avatarPhotoId: string | null };

	interface Props {
		people: readonly Person[];
		offered: readonly Person[];
		picked: string | null;
		onpick: (id: string) => void;
	}
	let { people, offered, picked, onpick }: Props = $props();

	const t = useTranslate();
	let query = $state('');

	/** Enough for a phone screen; a longer name narrows it further. */
	const MATCHES_SHOWN = 24;
	const shown = $derived(
		query.trim() ? people.filter((p) => matchesQuery(p, query)).slice(0, MATCHES_SHOWN) : offered
	);
</script>

<section class="flex flex-col gap-2.5" aria-labelledby="share-who">
	<h2 id="share-who" class="text-[15px] font-semibold text-fg">{t('share.who')}</h2>
	<label class="relative block">
		<span class="sr-only">{t('share.search')}</span>
		<span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-subtle">
			<Icon name="search" size={16} />
		</span>
		<input
			type="search"
			bind:value={query}
			placeholder={t('share.searchPlaceholder')}
			class="{INPUT} w-full pl-9 text-[15px]"
			data-testid="share-search"
		/>
	</label>
	{#if !query.trim() && offered.length > 0}
		<p class="text-xs text-fg-muted">{t('share.recent')}</p>
	{/if}
	{#if shown.length > 0}
		<ul class="grid grid-cols-4 gap-1.5" data-testid="share-people">
			{#each shown as person (person.id)}
				<li>
					<button
						type="button"
						aria-pressed={picked === person.id}
						onclick={() => onpick(person.id)}
						class="flex min-h-21 w-full flex-col items-center gap-1.5 rounded-app px-1 py-2 text-fg aria-pressed:bg-primary-soft aria-pressed:ring-2 aria-pressed:ring-primary"
					>
						<Avatar
							id={person.id}
							name={person.displayName}
							avatarPhotoId={person.avatarPhotoId}
							size={44}
						/>
						<span class="w-full truncate text-center text-xs leading-tight"
							>{person.nickname || person.firstName || person.displayName}</span
						>
					</button>
				</li>
			{/each}
		</ul>
	{:else if query.trim()}
		<p class="text-sm text-fg-muted">{t('share.noMatch')}</p>
	{/if}
</section>
