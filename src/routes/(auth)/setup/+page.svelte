<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	const t = useTranslate();
	const INPUT = 'rounded-md border border-border bg-bg px-3 py-2 text-fg';
</script>

<svelte:head><title>{t('auth.setup.title')}</title></svelte:head>

<div>
	<h1 class="text-2xl font-semibold text-fg">{t('auth.setup.heading')}</h1>
	<p class="text-sm text-fg-muted">{t('auth.setup.intro')}</p>
</div>

<form method="POST" class="flex flex-col gap-4 rounded-app bg-card p-6 shadow-card">
	{#if form?.error}
		<p class="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{form.error}</p>
	{/if}

	<label class="flex flex-col gap-1 text-sm">
		<span class="text-fg-muted">{t('auth.setup.householdName')}</span>
		<input name="householdName" required autocomplete="off" class={INPUT} />
	</label>
	<label class="flex flex-col gap-1 text-sm">
		<span class="text-fg-muted">{t('auth.setup.yourName')}</span>
		<input name="name" required autocomplete="name" class={INPUT} />
	</label>
	<label class="flex flex-col gap-1 text-sm">
		<span class="text-fg-muted">{t('auth.email')}</span>
		<input name="email" type="email" required autocomplete="email" class={INPUT} />
	</label>
	<label class="flex flex-col gap-1 text-sm">
		<span class="text-fg-muted">{t('auth.password')}</span>
		<input name="password" type="password" required minlength="8" autocomplete="new-password" class={INPUT} />
	</label>

	<Button variant="primary" class="mt-2">{t('auth.setup.submit')}</Button>
</form>
