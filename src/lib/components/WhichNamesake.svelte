<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import NamesakeLine from '$lib/components/NamesakeLine.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { UnclearHandle } from '$lib/mentions/unclear';

	/*
	 * Asks which one a typed `@Thomas` means while the text is written (docs/02 §2.2.3), naming
	 * each with the line the pickers show. The form holding it keeps saving off meanwhile.
	 */

	let { unclear }: { unclear: UnclearHandle<{ id: string; displayName: string }>[] } = $props();

	const t = useTranslate();
</script>

<div role="status" data-testid="which-namesake" class="flex flex-col gap-2">
	{#each unclear as { handle, people } (handle)}
		<div class="flex flex-col gap-2 rounded-control bg-primary-soft p-3">
			<p class="flex items-start gap-2 text-sm text-fg">
				<Icon name="people" size={16} class="mt-0.5 shrink-0 text-primary" />
				<span>
					<strong class="font-semibold">{t('components.namesake.which', { handle })}</strong>
					{t('components.namesake.whichHint')}
				</span>
			</p>
			<ul class="flex flex-col gap-1.5 pl-6">
				{#each people as { person, line } (person.id)}
					<li class="flex items-center gap-2.5 text-sm text-fg">
						<Avatar id={person.id} name={person.displayName} size={22} />
						<span class="min-w-0">
							<span class="block truncate">{person.displayName}</span>
							{#if line}<NamesakeLine distinction={line} />{/if}
						</span>
					</li>
				{/each}
			</ul>
		</div>
	{/each}
</div>
