<script lang="ts">
	import Icon from './Icon.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { useVeil } from '$lib/privacy/veil.svelte';

	/*
	 * The *Private* mark beside an entry only its author sees (docs/02 §2.10). When a tap of its
	 * own showed it (docs/02 §2.10.1), a *Hide* beside the mark blurs it again.
	 */
	interface Props {
		/** The entry's veil, when it has one: the same id its `Veil` carries. */
		veilId?: string;
		/** `quiet` in a line of small print; `pill` where the mark stands on its own (the journal). */
		tone?: 'quiet' | 'pill';
		class?: string;
	}
	let { veilId, tone = 'quiet', class: className = '' }: Props = $props();
	const TONES = {
		quiet: 'text-fg-subtle',
		pill: 'rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary'
	};

	const t = useTranslate();
	const veil = useVeil();
	const tapped = $derived(veilId !== undefined && veil.isTapped(veilId));
</script>

<span
	class="inline-flex items-center gap-1 {TONES[tone]} {className}"
	title={t('common.onlyYouSee')}
>
	<Icon name="private" size={11} />{t('common.privateInline')}
	{#if tapped && veilId}
		<span aria-hidden="true">·</span>
		<button
			type="button"
			class="inline-flex items-center gap-1 rounded-control underline-offset-2 hover:underline"
			onclick={() => veil.hide(veilId)}
		>
			<Icon name="veilAgain" size={12} />{t('privacy.veil.hide')}
		</button>
	{/if}
</span>
