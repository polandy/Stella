<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import Button from '$lib/components/Button.svelte';
	import { accentDotStyle } from '$lib/design/tokens';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const circle = $derived(data.circle);
</script>

<svelte:head><title>{circle.name} · Circles · Stella</title></svelte:head>

<main class="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-10">
	<a href="/circles" class="text-sm text-fg-muted hover:text-fg">← Circles</a>

	<header class="flex items-center gap-3">
		<span class="size-5 shrink-0 rounded-full" style={accentDotStyle(circle.color)}></span>
		<div class="min-w-0">
			<h1 class="truncate text-2xl font-semibold text-fg">{circle.name}</h1>
			<p class="text-sm text-fg-subtle">
				<span class="capitalize">{circle.kind}</span>
				{#if circle.description} · {circle.description}{/if}
				{#if circle.visibility === 'private'} · private{/if}
			</p>
		</div>
	</header>

	<section class="flex flex-col gap-3">
		<h2 class="text-sm font-medium text-fg-muted">
			Members ({data.members.length})
		</h2>

		{#if data.members.length}
			<ul class="flex flex-col gap-1">
				{#each data.members as m (m.membershipId)}
					<li class="flex items-center gap-3 rounded-app bg-card px-3 py-2 shadow-card">
						<Avatar id={m.contactId} name={m.displayName} avatarPhotoId={m.avatarPhotoId} size={32} />
						<a href="/contacts/{m.contactId}" class="min-w-0 flex-1 truncate font-medium text-fg hover:underline">
							{m.displayName}
						</a>
						{#if m.role}<span class="shrink-0 text-xs text-fg-subtle">{m.role}</span>{/if}
						<form method="POST" action="?/removeMember">
							<input type="hidden" name="contactId" value={m.contactId} />
							<button class="text-fg-subtle hover:text-danger" title="Remove from circle" aria-label="Remove">×</button>
						</form>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-sm text-fg-subtle">No members yet.</p>
		{/if}

		{#if data.candidates.length}
			<form method="POST" action="?/addMember" class="mt-2 flex flex-wrap items-end gap-3 rounded-app border border-dashed border-border p-4">
				{#if form?.error}<p class="w-full rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{form.error}</p>{/if}
				<label class="flex flex-1 flex-col gap-1 text-sm">
					<span class="text-fg-muted">Add member</span>
					<select name="contactId" class="rounded-md border border-border bg-bg px-3 py-2 text-fg">
						{#each data.candidates as c (c.id)}<option value={c.id}>{c.displayName}</option>{/each}
					</select>
				</label>
				<label class="flex flex-col gap-1 text-sm">
					<span class="text-fg-muted">Role (optional)</span>
					<input name="role" placeholder="member" class="w-32 rounded-md border border-border bg-bg px-3 py-2 text-fg" />
				</label>
				<Button variant="primary" size="sm">Add</Button>
			</form>
		{/if}
	</section>
</main>
