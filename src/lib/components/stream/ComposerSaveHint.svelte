<script lang="ts">
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { ComposerReading } from '$lib/stream/composer-reading';

	/*
	 * The line beside Save: why it is off, or else where the moment will go (docs/02 §2.22.1).
	 */

	interface Props {
		reading: ComposerReading;
		/** The moment is written on a person's page: it goes to them whoever else it names. */
		anchored: boolean;
	}
	let { reading, anchored }: Props = $props();

	const t = useTranslate();
	const SAVE_HINTS = {
		writeWhatHappened: 'composer.needText',
		mentionSomeone: 'composer.needMention'
	} as const;
	const referenced = $derived(reading.referenced);
</script>

<span class="text-xs text-fg-subtle" aria-live="polite">
	<!-- Why Save is off comes first, a shade stronger: it is what stands in the way. -->
	{#if reading.saveHint}
		<span class="text-fg-muted" data-testid="save-hint">{t(SAVE_HINTS[reading.saveHint])}</span>
	{:else if reading.unclear.length}
		<!-- The box above asks which one. -->
	{:else if anchored}
		{t('composer.mentionsSomeoneElse')}
	{:else if referenced.length}
		{t('composer.goesTo')}
		<b class="font-semibold text-fg-muted">{referenced[0].displayName}</b>{t(
			'composer.goesToJournal'
		)}{referenced.length > 1 ? t('composer.alsoMentions', { count: referenced.length - 1 }) : ''}
	{/if}
</span>
