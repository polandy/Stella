<script lang="ts">
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';

	/*
	 * *Lives at …* (docs/02 §2.4): the address offered to new children or a partner created in
	 * the add form, ticked, with everyone they would live with.
	 */

	interface Props {
		/** The address as one line. */
		line: string;
		/** This person first, then the rest of the home. */
		housemates: readonly { id: string; displayName: string }[];
		taken: boolean;
	}
	let { line, housemates, taken = $bindable() }: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;
</script>

<label
	class="flex items-start gap-2 rounded-control border border-dashed border-primary bg-card px-2 py-1.5 text-sm"
	data-testid="lives-at-offer"
>
	<input type="checkbox" bind:checked={taken} class="mt-0.5" />
	<span class="flex min-w-0 flex-col gap-1">
		<span class="flex items-center gap-1.5 font-medium text-fg">
			<Icon name="home" size={14} />
			{t('contact.relationships.livesAt', { line })}
		</span>
		<span class="flex flex-wrap items-center gap-1 text-xs text-fg-muted">
			{#each housemates as housemate (housemate.id)}
				<Avatar id={housemate.id} name={housemate.displayName} size={20} />
			{/each}
			<span class="ml-1">
				{t('contact.relationships.livesAtWith', {
					names: new Intl.ListFormat(i18n.intlLocale, { type: 'conjunction' }).format(
						housemates.map((housemate) => housemate.displayName)
					)
				})}
			</span>
		</span>
	</span>
</label>
