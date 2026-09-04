<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import { accentChipStyle } from '$lib/design/tokens';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<main class="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
	<h1 class="text-2xl font-semibold text-fg">Contacts</h1>

	{#if data.tags.length > 0}
		<div class="flex flex-wrap items-center gap-2">
			<a
				href="/contacts"
				class="rounded-full px-3 py-1 text-sm font-medium transition-colors"
				class:bg-primary-soft={!data.activeTag}
				class:text-primary={!data.activeTag}
				class:text-fg-muted={data.activeTag}
			>
				All
			</a>
			{#each data.tags as tag (tag.id)}
				<a
					href="/contacts?tag={tag.id}"
					class="rounded-full px-3 py-1 text-sm font-medium"
					style={accentChipStyle(tag.color, { active: data.activeTag === tag.id })}
				>
					{tag.name}
				</a>
			{/each}
		</div>
	{/if}

	{#if data.contacts.length === 0}
		<div class="rounded-app bg-card p-8 text-center shadow-card">
			<p class="text-fg-muted">No people yet.</p>
			<a href="/contacts/new" class="mt-2 inline-block text-sm text-link hover:underline">
				Add your first contact
			</a>
		</div>
	{:else}
		<ul class="flex flex-col gap-1">
			{#each data.contacts as contact (contact.id)}
				<li>
					<a
						href="/contacts/{contact.id}"
						class="flex items-center gap-3 rounded-app px-3 py-2.5 transition-colors hover:bg-card hover:shadow-card"
					>
						<Avatar
							id={contact.id}
							name={contact.displayName}
							avatarPhotoId={contact.avatarPhotoId}
							size={36}
						/>
						<span class="min-w-0 flex-1">
							<span class="block truncate font-medium text-fg">{contact.displayName}</span>
							{#if contact.description}
								<span class="block truncate text-sm text-fg-muted">{contact.description}</span>
							{/if}
						</span>
						{#if contact.visibility === 'private'}
							<span class="text-xs text-fg-subtle">private</span>
						{/if}
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</main>
