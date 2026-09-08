<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { ActionData, PageData } from './$types';

	let { form, data }: { form: ActionData; data: PageData } = $props();
	const t = useTranslate();
	const INPUT = 'rounded-md border border-border bg-bg px-3 py-2 text-fg';
</script>

<svelte:head><title>{t('auth.signInTitle')}</title></svelte:head>

<h1 class="text-2xl font-semibold text-fg">{t('auth.signIn')}</h1>

{#if data.ssoError}
	<p class="rounded-app bg-danger/10 px-3 py-2 text-sm text-danger">{t(data.ssoError)}</p>
{/if}

{#if data.oidcEnabled}
	<Button variant="primary" href="/login/sso" class="justify-center">{t('auth.signInWithSso')}</Button>
	{#if data.localEnabled}
		<div class="flex items-center gap-3 text-xs text-fg-subtle">
			<span class="h-px flex-1 bg-border"></span>{t('auth.or')}<span class="h-px flex-1 bg-border"></span>
		</div>
	{/if}
{/if}

{#if data.localEnabled}
	<form method="POST" class="flex flex-col gap-4 rounded-app bg-card p-6 shadow-card">
		{#if form?.error}
			<p class="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{t(form.error)}</p>
		{/if}

		<label class="flex flex-col gap-1 text-sm">
			<span class="text-fg-muted">{t('auth.email')}</span>
			<input name="email" type="email" required autocomplete="email" class={INPUT} />
		</label>
		<label class="flex flex-col gap-1 text-sm">
			<span class="text-fg-muted">{t('auth.password')}</span>
			<input name="password" type="password" required autocomplete="current-password" class={INPUT} />
		</label>

		<Button variant="primary" class="mt-2 justify-center">{t('auth.signIn')}</Button>
	</form>
{/if}

{#if data.demoLogin}
	<form method="POST" class="flex flex-col items-center gap-1">
		<input type="hidden" name="email" value={data.demoLogin.email} />
		<input type="hidden" name="password" value={data.demoLogin.password} />
		<button class="rounded-app border border-dashed border-border px-4 py-2 text-sm font-medium text-fg-muted transition-colors hover:border-primary hover:text-fg">
			{t('auth.signInAsDemo')}
		</button>
		<span class="text-xs text-fg-subtle">{t('auth.demoHint', { email: data.demoLogin.email })}</span>
	</form>
{/if}
