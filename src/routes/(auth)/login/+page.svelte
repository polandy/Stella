<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { form, data }: { form: ActionData; data: PageData } = $props();
</script>

<main class="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-8 px-6 py-16">
	<div class="flex flex-col items-center gap-3 text-center">
		<div class="grid size-14 place-items-center rounded-app bg-primary text-2xl text-primary-fg shadow-lg">
			★
		</div>
		<h1 class="text-2xl font-semibold text-fg">Sign in to Stella</h1>
	</div>

	{#if data.ssoError}
		<p class="rounded-app bg-danger/10 px-3 py-2 text-center text-sm text-danger">{data.ssoError}</p>
	{/if}

	{#if data.oidcEnabled}
		<a href="/login/sso"
			class="rounded-app bg-primary px-4 py-2 text-center font-medium text-primary-fg transition-opacity hover:opacity-90">
			Sign in with SSO
		</a>
		{#if data.localEnabled}
			<div class="flex items-center gap-3 text-xs text-fg-subtle">
				<span class="h-px flex-1 bg-border"></span>or<span class="h-px flex-1 bg-border"></span>
			</div>
		{/if}
	{/if}

	{#if data.localEnabled}
		<form method="POST" class="flex flex-col gap-4 rounded-app border border-border bg-card p-6">
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

			<button class="mt-2 rounded-app bg-primary px-4 py-2 font-medium text-primary-fg transition-opacity hover:opacity-90">
				Sign in
			</button>
		</form>
	{/if}
</main>
