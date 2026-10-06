<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import NamesakeLine from '$lib/components/NamesakeLine.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { UnclearHandle } from '$lib/mentions/unclear';

	/*
	 * Asks which one a typed `@Thomas` means while the text is written (docs/02 §2.2.3): one line,
	 * with who is who folded away — the @-list shows the same lines where the pick is made. The
	 * form holding it keeps saving off meanwhile.
	 */

	let { unclear }: { unclear: UnclearHandle<{ id: string; displayName: string }>[] } = $props();

	const t = useTranslate();
</script>

<div role="status" data-testid="which-namesake" class="flex flex-col gap-1">
	{#each unclear as { handle, people } (handle)}
		<div class="rounded-control bg-primary-soft px-3 py-2 text-sm text-fg">
			<p class="flex items-start gap-2">
				<Icon name="people" size={15} class="mt-0.5 shrink-0 text-primary" />
				<span>{t('components.namesake.which', { handle, count: people.length })}</span>
			</p>
			<details class="pl-6">
				<summary class="cursor-pointer text-xs text-fg-muted hover:text-fg"
					>{t('components.namesake.whoIsWho')}</summary
				>
				<ul class="mt-1 flex flex-col gap-1">
					{#each people as { person, line } (person.id)}
						<li class="min-w-0">
							<span class="block truncate">{person.displayName}</span>
							{#if line}<NamesakeLine distinction={line} />{/if}
						</li>
					{/each}
				</ul>
			</details>
		</div>
	{/each}
</div>
