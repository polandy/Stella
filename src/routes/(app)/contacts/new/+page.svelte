<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	const field = 'flex flex-col gap-1 text-sm';
	const input = 'rounded-md border border-border bg-bg px-3 py-2 text-fg';
</script>

<svelte:head><title>Add a person · Stella</title></svelte:head>

<main class="mx-auto flex w-full max-w-lg flex-col gap-6 px-6 py-10">
	<header>
		<h1 class="text-2xl font-semibold text-fg">Add a person</h1>
		<p class="text-sm text-fg-muted">A name is enough. Everything else can wait for their page.</p>
	</header>

	<form method="POST" class="flex flex-col gap-4 rounded-app bg-card p-6 shadow-card">
		{#if form?.error}
			<p class="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{form.error}</p>
		{/if}

		<div class="flex gap-3">
			<label class="{field} flex-1">
				<span class="text-fg-muted">First name</span>
				<input name="firstName" class={input} autocomplete="off" />
			</label>
			<label class="{field} flex-1">
				<span class="text-fg-muted">Last name</span>
				<input name="lastName" class={input} autocomplete="off" />
			</label>
		</div>

		<label class={field}>
			<span class="text-fg-muted">Description <span class="text-fg-subtle">(one line)</span></span>
			<input name="description" class={input} placeholder="Marco's sister, met at the lake" />
		</label>

		<div class="flex gap-3">
			<label class="{field} flex-1">
				<span class="text-fg-muted">How we met</span>
				<input name="howWeMet" class={input} />
			</label>
			<label class="{field} flex-1">
				<span class="text-fg-muted">Where</span>
				<input name="metPlace" class={input} placeholder="at the lake" />
			</label>
		</div>

		<!-- Rarely needed at the moment of adding someone; kept, but out of the way. -->
		<details class="group rounded-md border border-border-subtle">
			<summary class="cursor-pointer list-none px-3 py-2 text-sm text-fg-muted [&::-webkit-details-marker]:hidden">
				<span class="inline-block transition-transform group-open:rotate-90" aria-hidden="true">›</span>
				More — nickname, birthday
			</summary>
			<div class="flex flex-col gap-4 border-t border-border-subtle p-3">
				<label class={field}>
					<span class="text-fg-muted">Nickname</span>
					<input name="nickname" class={input} autocomplete="off" />
				</label>
				<label class={field}>
					<span class="text-fg-muted">Birthday</span>
					<input type="date" name="birthDate" class={input} />
				</label>
			</div>
		</details>

		<fieldset class="flex items-center gap-4 text-sm">
			<span class="text-fg-muted">Visibility</span>
			<label class="flex items-center gap-1.5">
				<input type="radio" name="visibility" value="shared" checked /> Shared
			</label>
			<label class="flex items-center gap-1.5">
				<input type="radio" name="visibility" value="private" /> Private
			</label>
		</fieldset>

		<Button variant="primary" class="mt-2">Add person</Button>
	</form>
</main>
