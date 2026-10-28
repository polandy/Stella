<script lang="ts">
	import { accentChipStyle } from '$lib/design/tokens';
	import { tagAccent } from '$lib/hashtags/hashtags';
	import { tagsToSave, type KnownTag } from '$lib/hashtags/picker';
	import { useTranslate } from '$lib/i18n/context.svelte';

	/*
	 * What saving the text will file it under (docs/02 §2.20.2), read the way the server reads it:
	 * each tag in the household's spelling, a new one marked. Without a tag, a line saying how to
	 * add one — the only place a writer learns that `#` does something.
	 */
	interface Props {
		body: string;
		known: readonly KnownTag[];
	}
	let { body, known }: Props = $props();

	const t = useTranslate();
	const tags = $derived(tagsToSave(body, known));
</script>

<p class="flex flex-wrap items-center gap-1.5 text-xs text-fg-subtle" data-testid="tags-line">
	{#if tags.length}
		<span>{t('composer.tagsLine')}</span>
		{#each tags as tag (tag.name)}
			<span
				class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium"
				style={accentChipStyle(tagAccent(tag.name))}
			>
				#{tag.name}
				{#if tag.isNew}<span class="font-normal text-fg-muted">· {t('composer.newTagShort')}</span
					>{/if}
			</span>
		{/each}
	{:else}
		<span>{t('composer.tagsHint')}</span>
	{/if}
</p>
