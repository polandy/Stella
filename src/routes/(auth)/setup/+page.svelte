<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head><title>Set up · Stella</title></svelte:head>

<div>
	<h1 class="text-2xl font-semibold text-fg">Welcome to Stella</h1>
	<p class="text-sm text-fg-muted">Create your household and admin account to get started.</p>
</div>

	<form method="POST" class="flex flex-col gap-4 rounded-app bg-card p-6 shadow-card">
		{#if form?.error}
			<p class="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{form.error}</p>
		{/if}

		<label class="flex flex-col gap-1 text-sm">
			<span class="text-fg-muted">Household name</span>
			<input name="householdName" required autocomplete="off"
				class="rounded-md border border-border bg-bg px-3 py-2 text-fg" />
		</label>
		<label class="flex flex-col gap-1 text-sm">
			<span class="text-fg-muted">Your name</span>
			<input name="name" required autocomplete="name"
				class="rounded-md border border-border bg-bg px-3 py-2 text-fg" />
		</label>
		<label class="flex flex-col gap-1 text-sm">
			<span class="text-fg-muted">Email</span>
			<input name="email" type="email" required autocomplete="email"
				class="rounded-md border border-border bg-bg px-3 py-2 text-fg" />
		</label>
		<label class="flex flex-col gap-1 text-sm">
			<span class="text-fg-muted">Password</span>
			<input name="password" type="password" required minlength="8" autocomplete="new-password"
				class="rounded-md border border-border bg-bg px-3 py-2 text-fg" />
		</label>

		<Button variant="primary" class="mt-2">Create household</Button>
	</form>
