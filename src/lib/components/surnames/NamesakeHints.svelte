<script lang="ts">
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { NamesakeAfterNaming } from '$lib/surnames/namesakes';

	/*
	 * *The household might already have them* (docs/02 §2.2.4.4): after a name is
	 * given, someone who now shares first and last name with another person is pointed at the
	 * merge on that person's page. Nothing merges on its own.
	 */
	let { hints }: { hints: readonly NamesakeAfterNaming[] } = $props();
	const t = useTranslate();
</script>

{#if hints.length > 0}
	<ul
		class="flex flex-col gap-1 rounded-app bg-primary-soft p-3 text-sm text-fg"
		role="status"
		data-testid="namesake-hints"
	>
		{#each hints as hint (hint.id)}
			<li>
				{t('surnames.namesake', { name: hint.name })} —
				<a
					href="/contacts/{hint.otherId}?merge={hint.id}#merge"
					class="font-medium text-link hover:underline">{t('surnames.namesakeAsk')}</a
				>
			</li>
		{/each}
	</ul>
{/if}
