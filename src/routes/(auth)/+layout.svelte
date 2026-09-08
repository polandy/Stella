<script lang="ts">
	import LanguagePicker from '$lib/components/LanguagePicker.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { Snippet } from 'svelte';

	/*
	 * The auth shell (docs/05 §5.5): the brand on one side, the form on the other. On a
	 * phone the brand panel shrinks to a header so the form is the first thing on screen.
	 * The language picker sits here too — the first screen a visitor sees has to be readable
	 * before there is a profile to remember a preference in (docs/02 §2.19).
	 */
	let { children }: { children: Snippet } = $props();
	const t = useTranslate();
</script>

<div class="grid min-h-screen bg-bg text-fg md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
	<aside class="flex flex-col justify-between gap-8 bg-bg-sunken px-6 py-8 md:px-12 md:py-14">
		<a href="/" class="flex items-center" aria-label="Stella"><Logo size={30} wordmark /></a>
		<div class="hidden md:block">
			<p class="max-w-sm font-serif text-3xl leading-snug text-fg">
				{t('auth.shell.tagline')}
			</p>
			<p class="mt-4 max-w-sm text-sm text-fg-muted">
				{t('auth.shell.blurb')}
			</p>
		</div>
		<p class="hidden text-xs text-fg-subtle md:block">{t('auth.shell.footer')}</p>
	</aside>

	<main class="flex items-center justify-center px-6 py-10 md:px-12">
		<div class="flex w-full max-w-sm flex-col gap-6">
			{@render children()}
			<div class="self-center"><LanguagePicker size="sm" /></div>
		</div>
	</main>
</div>
