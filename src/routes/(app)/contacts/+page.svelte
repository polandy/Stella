<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<main class="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-10">
	<header class="flex items-center justify-between">
		<h1 class="text-2xl font-semibold text-fg">Contacts</h1>
		<a
			href="/contacts/new"
			class="rounded-app bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-opacity hover:opacity-90"
		>
			Add person
		</a>
	</header>

	{#if data.contacts.length === 0}
		<div class="rounded-app border border-border bg-card p-8 text-center">
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
						class="flex items-center gap-3 rounded-app border border-transparent px-3 py-2.5 transition-colors hover:border-border hover:bg-card"
					>
						<span
							class="grid size-9 shrink-0 place-items-center rounded-full bg-bg-sunken text-sm font-medium text-fg-muted"
						>
							{contact.displayName.slice(0, 1).toUpperCase()}
						</span>
						<span class="min-w-0 flex-1">
							<span class="block truncate text-fg">{contact.displayName}</span>
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
