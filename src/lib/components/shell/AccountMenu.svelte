<script lang="ts">
	import SignOutForm from '$lib/components/shell/SignOutForm.svelte';
	import ThemePicker from '$lib/components/shell/ThemePicker.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';

	/* The sidebar's foot: who is signed in, and under it the theme and the way out. */

	let { name, email }: { name: string; email: string } = $props();

	const t = useTranslate();

	const initials = $derived(
		name
			.split(/\s+/)
			.map((w) => w[0])
			.slice(0, 2)
			.join('')
			.toUpperCase()
	);

	let menu: HTMLDetailsElement | undefined = $state();
	function closeOnEscape(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !menu?.open) return;
		event.preventDefault();
		menu.open = false;
		menu.querySelector('summary')?.focus();
	}
</script>

<!-- Escape closes it like any other menu, and hands focus back to its summary. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<details class="group relative" bind:this={menu} onkeydown={closeOnEscape}>
	<summary
		class="flex cursor-pointer list-none items-center gap-2.5 rounded-app bg-card p-2 shadow-card [&::-webkit-details-marker]:hidden"
	>
		<span class="sr-only">{t('nav.accountMenu')}</span>
		<span
			class="grid size-8 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-fg"
			>{initials}</span
		>
		<span class="min-w-0 flex-1">
			<span class="block truncate text-sm font-medium text-fg">{name}</span>
			<span class="block truncate text-xs text-fg-subtle">{email}</span>
		</span>
	</summary>
	<div
		class="absolute bottom-full left-0 mb-2 w-full rounded-app border border-border bg-card p-2 shadow-pop"
	>
		<ThemePicker />
		<SignOutForm class="mt-1">
			<button
				type="submit"
				class="w-full rounded-md px-3 py-2 text-left text-sm text-fg-muted transition-colors hover:bg-card-hover hover:text-fg"
			>
				{t('nav.signOut')}
			</button>
		</SignOutForm>
	</div>
</details>
