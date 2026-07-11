<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let showForm = $state(false);
</script>

<svelte:head><title>Circles · Stella</title></svelte:head>

<main class="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-10">
	<header class="flex items-center justify-between">
		<div class="flex items-center gap-3">
			<a href="/" class="text-sm text-fg-muted hover:text-fg">← Home</a>
			<h1 class="text-2xl font-semibold text-fg">Circles</h1>
		</div>
		<button
			onclick={() => (showForm = !showForm)}
			class="rounded-app bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-opacity hover:opacity-90"
		>
			{showForm ? 'Cancel' : 'New circle'}
		</button>
	</header>

	<p class="text-sm text-fg-muted">
		Circles are shared contexts — a class, club, team, or friend group people belong to.
	</p>

	{#if showForm}
		<form method="POST" action="?/create" class="flex flex-col gap-4 rounded-app border border-border bg-card p-5">
			{#if form?.error}<p class="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{form.error}</p>{/if}

			<label class="flex flex-col gap-1 text-sm">
				<span class="text-fg-muted">Name</span>
				<input name="name" placeholder="e.g. Kegelclub Bühl" required class="rounded-md border border-border bg-bg px-3 py-2 text-fg" />
			</label>

			<div class="flex flex-wrap gap-4">
				<label class="flex flex-1 flex-col gap-1 text-sm">
					<span class="text-fg-muted">Kind</span>
					<select name="kind" class="rounded-md border border-border bg-bg px-3 py-2 text-fg">
						{#each data.kinds as kind (kind)}<option value={kind}>{kind}</option>{/each}
					</select>
				</label>
				<label class="flex flex-[2] flex-col gap-1 text-sm">
					<span class="text-fg-muted">Description (optional)</span>
					<input name="description" class="rounded-md border border-border bg-bg px-3 py-2 text-fg" />
				</label>
			</div>

			<fieldset class="flex flex-col gap-2">
				<span class="text-sm text-fg-muted">Colour</span>
				<div class="flex flex-wrap gap-2">
					{#each data.colors as color (color)}
						<label class="cursor-pointer" title={color}>
							<input type="radio" name="color" value={color} checked={color === data.suggestedColor} class="peer sr-only" />
							<span
								class="block size-7 rounded-full ring-offset-2 ring-offset-[var(--card)] transition-all peer-checked:ring-2 peer-checked:ring-[var(--fg)] hover:scale-110"
								style="background:var(--ctp-{color})"
							></span>
						</label>
					{/each}
				</div>
			</fieldset>

			<button class="self-start rounded-app bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-opacity hover:opacity-90">
				Create circle
			</button>
		</form>
	{/if}

	{#if data.circles.length === 0}
		<div class="rounded-app border border-border bg-card p-8 text-center">
			<p class="text-fg-muted">No circles yet.</p>
		</div>
	{:else}
		<ul class="flex flex-col gap-1">
			{#each data.circles as circle (circle.id)}
				<li>
					<a
						href="/circles/{circle.id}"
						class="flex items-center gap-3 rounded-app border border-transparent px-3 py-2.5 transition-colors hover:border-border hover:bg-card"
					>
						<span class="size-3 shrink-0 rounded-full" style="background:var(--ctp-{circle.color})"></span>
						<span class="min-w-0 flex-1">
							<span class="block truncate text-fg">{circle.name}</span>
							{#if circle.description}<span class="block truncate text-sm text-fg-subtle">{circle.description}</span>{/if}
						</span>
						<span class="shrink-0 text-xs text-fg-subtle capitalize">{circle.kind}</span>
						<span class="shrink-0 text-xs text-fg-muted">{circle.memberCount} {circle.memberCount === 1 ? 'member' : 'members'}</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</main>
