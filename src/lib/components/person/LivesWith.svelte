<script lang="ts">
	import LinkedNames from '$lib/components/people/LinkedNames.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { segmentsOf } from '$lib/i18n/linked';
	import { livesWithSentence, type Housemate } from '$lib/people/home';

	/*
	 * *lives with Anna and Peter Brunner* under a shared home's line (docs/02 §2.2), each name a
	 * way to that person. Only the people the viewer may see ever reach this list.
	 */
	let { housemates }: { housemates: readonly Housemate[] } = $props();

	const i18n = useI18n();
	const segments = $derived(
		segmentsOf(
			livesWithSentence(
				housemates,
				(names) => new Intl.ListFormat(i18n.intlLocale, { type: 'conjunction' }).format(names),
				(names) => i18n.t('contact.home.livesWith', { names })
			)
		)
	);
</script>

<span class="text-xs text-fg-muted"><LinkedNames {segments} /></span>
