<script lang="ts">
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	const field = 'flex flex-col gap-1 text-sm';
	const input = 'rounded-md border border-border bg-bg px-3 py-2 text-fg';
</script>

<main class="mx-auto flex min-h-screen w-full max-w-lg flex-col gap-6 px-6 py-10">
	<header class="flex items-center gap-3">
		<a href="/contacts" class="text-sm text-fg-muted hover:text-fg">← Contacts</a>
		<h1 class="text-2xl font-semibold text-fg">Add a person</h1>
	</header>

	<form method="POST" class="flex flex-col gap-4 rounded-app border border-border bg-card p-6">
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
			<span class="text-fg-muted">Nickname <span class="text-fg-subtle">(optional)</span></span>
			<input name="nickname" class={input} autocomplete="off" />
		</label>

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

		<fieldset class="flex items-center gap-4 text-sm">
			<span class="text-fg-muted">Visibility</span>
			<label class="flex items-center gap-1.5">
				<input type="radio" name="visibility" value="shared" checked /> Shared
			</label>
			<label class="flex items-center gap-1.5">
				<input type="radio" name="visibility" value="private" /> Private
			</label>
		</fieldset>

		<button
			class="mt-2 rounded-app bg-primary px-4 py-2 font-medium text-primary-fg transition-opacity hover:opacity-90"
		>
			Add person
		</button>
	</form>
</main>
