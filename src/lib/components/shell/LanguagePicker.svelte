<script lang="ts">
	import { page } from '$app/state';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { LOCALE_NAMES, LOCALES } from '$lib/i18n/locales';

	/*
	 * Choosing the interface language (docs/02 §2.19). A segmented control of plain submit
	 * buttons — one form post per language, so it works with JavaScript off, and the answer
	 * comes back rendered in the language just chosen.
	 */

	let { size = 'md' }: { size?: 'md' | 'sm' } = $props();

	const i18n = useI18n();
	const here = $derived(`${page.url.pathname}${page.url.search}`);
</script>

<form method="POST" action="/locale" class="flex gap-1 rounded-control border border-border p-1">
	<input type="hidden" name="redirectTo" value={here} />
	{#each LOCALES as locale (locale)}
		{@const current = locale === i18n.locale}
		<button
			name="locale"
			value={locale}
			lang={locale}
			aria-current={current ? 'true' : undefined}
			class="flex-1 rounded-md font-medium transition-colors"
			class:px-3={size === 'md'}
			class:py-1.5={size === 'md'}
			class:text-sm={size === 'md'}
			class:px-2={size === 'sm'}
			class:py-1={size === 'sm'}
			class:text-xs={size === 'sm'}
			class:bg-primary={current}
			class:text-primary-fg={current}
			class:text-fg-muted={!current}
			class:hover:text-fg={!current}
		>
			{LOCALE_NAMES[locale]}
		</button>
	{/each}
</form>
