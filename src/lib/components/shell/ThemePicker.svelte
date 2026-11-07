<script lang="ts">
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { MessageKey } from '$lib/i18n/translate';
	import { onMount } from 'svelte';

	// Same contract as the no-flash init in app.html (stella-theme).
	type ThemeChoice = 'light' | 'system' | 'dark';
	const THEME_CHOICES: { value: ThemeChoice; label: MessageKey }[] = [
		{ value: 'light', label: 'nav.theme.light' },
		{ value: 'system', label: 'nav.theme.system' },
		{ value: 'dark', label: 'nav.theme.dark' }
	];
	const STORAGE_KEY = 'stella-theme';

	const t = useTranslate();

	let theme = $state<ThemeChoice>('system');
	onMount(() => {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored === 'light' || stored === 'dark') theme = stored;
	});
	function applyTheme(choice: ThemeChoice) {
		theme = choice;
		const root = document.documentElement;
		if (choice === 'system') {
			root.removeAttribute('data-theme');
			localStorage.removeItem(STORAGE_KEY);
		} else {
			root.setAttribute('data-theme', choice);
			localStorage.setItem(STORAGE_KEY, choice);
		}
	}
</script>

<div class="flex gap-1 rounded-control border border-border p-1">
	{#each THEME_CHOICES as choice (choice.value)}
		<button
			type="button"
			onclick={() => applyTheme(choice.value)}
			aria-pressed={theme === choice.value}
			class="flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors"
			class:bg-primary={theme === choice.value}
			class:text-primary-fg={theme === choice.value}
			class:text-fg-muted={theme !== choice.value}
		>
			{t(choice.label)}
		</button>
	{/each}
</div>
