<script lang="ts">
	import LinkedNames from '$lib/components/people/LinkedNames.svelte';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { listSentence, segmentsOf } from '$lib/i18n/linked';
	import type { SubjectFace } from '$lib/story/subjects';

	/*
	 * *with Sandra, Lea and Tim* under a moment's kind line (docs/02 §2.20.3): the others it is
	 * about, small faces and linked names. The names say who; the faces are decorative.
	 */
	let { others }: { others: readonly SubjectFace[] } = $props();

	const i18n = useI18n();
	const segments = $derived(
		segmentsOf(
			listSentence(
				others,
				(names) => new Intl.ListFormat(i18n.intlLocale, { type: 'conjunction' }).format(names),
				(names) => i18n.t('journal.with', { names })
			)
		)
	);
</script>

{#if others.length}
	<p class="flex flex-wrap items-center gap-x-1.5 text-xs text-fg-muted" data-testid="moment-with">
		<span class="flex -space-x-1" aria-hidden="true">
			{#each others.slice(0, 3) as person (person.id)}
				<span class="rounded-full ring-2 ring-card">
					<Avatar
						id={person.id}
						name={person.displayName}
						avatarPhotoId={person.avatarPhotoId}
						size={16}
					/>
				</span>
			{/each}
		</span>
		<span><LinkedNames {segments} /></span>
	</p>
{/if}
