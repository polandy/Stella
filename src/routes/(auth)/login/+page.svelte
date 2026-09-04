<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import type { ActionData, PageData } from './$types';

	let { form, data }: { form: ActionData; data: PageData } = $props();
</script>

<main class="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-8 px-6 py-16">
	<div class="flex flex-col items-center gap-3 text-center">
		<Logo size={56} />
		<h1 class="text-2xl font-semibold text-fg">Sign in to Stella</h1>
	</div>

	{#if data.ssoError}
		<p class="rounded-app bg-danger/10 px-3 py-2 text-center text-sm text-danger">{data.ssoError}</p>
	{/if}

	{#if data.oidcEnabled}
		<Button variant="primary" href="/login/sso" class="justify-center">Sign in with SSO</Button>
		{#if data.localEnabled}
			<div class="flex items-center gap-3 text-xs text-fg-subtle">
				<span class="h-px flex-1 bg-border"></span>or<span class="h-px flex-1 bg-border"></span>
			</div>
		{/if}
	{/if}

	{#if data.localEnabled}
		<form method="POST" class="flex flex-col gap-4 rounded-app bg-card p-6 shadow-card">
			{#if form?.error}
				<p class="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{form.error}</p>
			{/if}

			<label class="flex flex-col gap-1 text-sm">
				<span class="text-fg-muted">Email</span>
				<input name="email" type="email" required autocomplete="email"
					class="rounded-md border border-border bg-bg px-3 py-2 text-fg" />
			</label>
			<label class="flex flex-col gap-1 text-sm">
				<span class="text-fg-muted">Password</span>
				<input name="password" type="password" required autocomplete="current-password"
					class="rounded-md border border-border bg-bg px-3 py-2 text-fg" />
			</label>

			<Button variant="primary" class="mt-2">Sign in</Button>
		</form>
	{/if}

	{#if data.demoLogin}
		<form method="POST" class="flex flex-col items-center gap-1">
			<input type="hidden" name="email" value={data.demoLogin.email} />
			<input type="hidden" name="password" value={data.demoLogin.password} />
			<button class="rounded-app border border-dashed border-border px-4 py-2 text-sm font-medium text-fg-muted transition-colors hover:border-primary hover:text-fg">
				Sign in as demo user
			</button>
			<span class="text-xs text-fg-subtle">Demo data is on (SEED_DEMO). {data.demoLogin.email}</span>
		</form>
	{/if}
</main>
