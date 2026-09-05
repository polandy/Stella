<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import Button from '$lib/components/Button.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { ALL_KINDS, filterCircles, kindChips } from '$lib/circles/browse';
	import { accentDotStyle } from '$lib/design/tokens';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let wantForm = $state(false);
	// A failed submit keeps the form open, so the error has somewhere to be read.
	const showForm = $derived(wantForm || form?.error !== undefined);

	// Find as you type over what is already loaded (docs/02 §2.4): a household has few enough
	// circles that a round trip per keystroke would only add latency.
	let query = $state('');
	let kind = $state<string>(ALL_KINDS);
	const chips = $derived(kindChips(data.circles, query));
	// A kind the query has filtered away would leave an empty page, so the row falls back to All.
	const activeKind = $derived(chips.some((chip) => chip.kind === kind) ? kind : ALL_KINDS);
	const shown = $derived(filterCircles(data.circles, { query, kind: activeKind }));
</script>

<svelte:head><title>Circles · Stella</title></svelte:head>

<main class="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6 md:px-6 md:py-10">
	<header class="flex flex-wrap items-end justify-between gap-3">
		<div>
			<h1 class="text-2xl font-semibold text-fg">Circles</h1>
			<p class="text-sm text-fg-muted">The contexts people share — a class, a club, a team, a choir.</p>
		</div>
		<Button variant={showForm ? 'secondary' : 'primary'} icon={showForm ? 'remove' : 'add'} type="button" onclick={() => (wantForm = !showForm)}>
			{showForm ? 'Cancel' : 'New circle'}
		</Button>
	</header>

	{#if showForm}
		<form method="POST" action="?/create" class="flex flex-col gap-4 rounded-app bg-card p-5 shadow-card">
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
								style={accentDotStyle(color)}
							></span>
						</label>
					{/each}
				</div>
			</fieldset>

			<Button variant="primary" class="self-start">Create circle</Button>
		</form>
	{/if}

	{#if data.circles.length > 0}
		<label class="flex items-center gap-2 rounded-control border border-border bg-card px-3 py-2 shadow-card focus-within:border-primary">
			<Icon name="search" size={15} />
			<span class="sr-only">Find a circle</span>
			<input
				type="search"
				bind:value={query}
				placeholder="Find a circle…"
				autocomplete="off"
				class="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
			/>
		</label>

		{#if chips.length > 1}
			<div class="flex flex-wrap items-center gap-2" data-testid="circle-kinds">
				{#each chips as chip (chip.kind)}
					<button
						type="button"
						onclick={() => (kind = chip.kind)}
						aria-pressed={activeKind === chip.kind}
						class="rounded-full px-3 py-1 text-sm font-medium capitalize transition-colors aria-pressed:bg-primary-soft aria-pressed:text-primary text-fg-muted hover:text-fg"
					>
						{chip.label}
						<span class="text-xs text-fg-subtle">{chip.count}</span>
					</button>
				{/each}
			</div>
		{/if}
	{/if}

	{#if data.circles.length === 0}
		<EmptyState icon="circles" title="No circles yet" hint="A circle is a context people share. Add the first one and put people in it.">
			<Button variant="primary" icon="add" type="button" onclick={() => (wantForm = true)}>New circle</Button>
		</EmptyState>
	{:else if shown.length === 0}
		<EmptyState icon="search" title="No circle matches" hint="Try part of a name, or a word from a description." />
	{:else}
		<ul class="grid gap-3 sm:grid-cols-2" data-testid="circle-cards">
			{#each shown as circle (circle.id)}
				<li>
					<a
						href="/circles/{circle.id}"
						class="flex h-full flex-col gap-3 rounded-app bg-card p-4 shadow-card transition-colors hover:bg-card-hover"
					>
						<div class="flex items-start gap-3">
							<span class="mt-1.5 size-3 shrink-0 rounded-full" style={accentDotStyle(circle.color)}></span>
							<span class="min-w-0 flex-1">
								<span class="block truncate font-semibold text-fg">{circle.name}</span>
								<span class="block text-xs text-fg-subtle">
									<span class="capitalize">{circle.kind}</span>
									· {circle.memberCount} {circle.memberCount === 1 ? 'member' : 'members'}
									{#if circle.visibility === 'private'} · private{/if}
								</span>
							</span>
						</div>
						{#if circle.description}
							<p class="line-clamp-2 text-sm text-fg-muted">{circle.description}</p>
						{/if}
						<div class="mt-auto flex items-center">
							{#each circle.preview as member, i (member.contactId)}
								<span class="rounded-full ring-2 ring-card" class:-ml-1={i > 0}>
									<Avatar id={member.contactId} name={member.displayName} avatarPhotoId={member.avatarPhotoId} size={28} />
								</span>
							{/each}
							{#if circle.memberCount > circle.preview.length}
								<span class="-ml-1 grid size-7 place-items-center rounded-full bg-bg-sunken text-[11px] font-semibold text-fg-muted ring-2 ring-card">
									+{circle.memberCount - circle.preview.length}
								</span>
							{/if}
							{#if circle.memberCount === 0}
								<span class="text-xs text-fg-subtle">Nobody in it yet</span>
							{/if}
						</div>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</main>
