<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import RemoveButton from '$lib/components/RemoveButton.svelte';
	import Section from '$lib/components/Section.svelte';
	import { categoryVar } from '$lib/design/tokens';
	import { RELATIONSHIP_CATEGORIES } from '$lib/relationships/categories';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { removalKey } from '$lib/undo/keys';
	import { savedEnhance } from '$lib/undo/saved';
	import type { ActionData, PageData } from './$types';

	/*
	 * The household's relationship vocabulary (docs/02 §2.4). The built-in types are listed
	 * as what they are — part of the app — so it is visible that the twelve are not missing
	 * from the editable list by accident.
	 */
	let { data, form }: { data: PageData; form: ActionData } = $props();

	/** One class for every text input on the page, so they cannot drift apart. */
	const INPUT =
		'rounded-control border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-fg-subtle';

	let addOpen = $state(false);
	let editing = $state<string | null>(null);
	/** The add form mirrors one label into both sides until it is told they differ. */
	let addSymmetric = $state(true);

	const removals = useRemovals();
	const savedAdd = savedEnhance(removals, () => {
		addOpen = false;
		addSymmetric = true;
	});
	const savedEdit = savedEnhance(removals, () => (editing = null));

	const visibleCustom = $derived(
		data.custom.filter((type) => !removals.isPending(removalKey('relationship-type', type.id)))
	);
</script>

<main class="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
	<header class="flex flex-col gap-1">
		<a href="/settings" class="flex items-center gap-1 text-sm text-link hover:underline">
			<Icon name="forward" size={12} />Settings
		</a>
		<h1 class="text-2xl font-semibold text-fg">Relationship types</h1>
		<p class="text-fg-muted">
			The kinds of link your household can record. Add your own where the built-in ones do not
			say it — godparent, choir mate, landlord.
		</p>
	</header>

	<Section
		title="Your own"
		count={visibleCustom.length}
		addLabel="Add type"
		error={form?.error ?? null}
		bind:open={addOpen}
	>
		{#if visibleCustom.length > 0}
			<ul data-testid="custom-types" class="flex flex-col divide-y divide-border-subtle">
				{#each visibleCustom as type (type.id)}
					<li class="flex flex-col gap-1 py-2 text-sm">
						<div class="flex items-center gap-3">
							<span
								class="size-2 shrink-0 rounded-full"
								style="background:{categoryVar(type.category)}"
							></span>
							<span class="font-medium text-fg">{type.forwardLabel}</span>
							{#if !type.symmetric}
								<span class="text-fg-subtle">· from the other side: {type.reverseLabel}</span>
							{/if}
							<span class="shrink-0 text-fg-subtle">· {type.category}</span>
							<div class="ml-auto flex shrink-0 items-center gap-1">
								<Button
									type="button"
									variant="ghost"
									size="sm"
									aria-expanded={editing === type.id}
									onclick={() => (editing = editing === type.id ? null : type.id)}
								>
									{editing === type.id ? 'Cancel' : 'Edit'}
								</Button>
								{#if type.usageCount === 0}
									<RemoveButton
										kind="relationship-type"
										id={type.id}
										action="?/remove"
										fields={{ typeId: type.id }}
										label="Remove the type {type.forwardLabel}"
										removed="Relationship type removed"
									/>
								{:else}
									<span class="text-xs text-fg-subtle">
										used {type.usageCount}×
									</span>
								{/if}
							</div>
						</div>

						{#if editing === type.id}
							<!-- The machine key stays as it was: it is what the type *is*, and rewriting it
							     would make the row a different type to everything already stored. -->
							<form
								method="POST"
								action="?/edit"
								use:enhance={savedEdit}
								class="flex flex-col gap-2 pl-5"
							>
								<input type="hidden" name="typeId" value={type.id} />
								<div class="flex flex-wrap items-end gap-2">
									<label class="flex flex-1 flex-col gap-1">
										<span class="text-xs text-fg-muted">Label</span>
										<input name="forwardLabel" value={type.forwardLabel} class={INPUT} required />
									</label>
									<label class="flex flex-col gap-1">
										<span class="text-xs text-fg-muted">Category</span>
										<select name="category" class={INPUT}>
											{#each RELATIONSHIP_CATEGORIES as category (category)}
												<option value={category} selected={category === type.category}>
													{category}
												</option>
											{/each}
										</select>
									</label>
								</div>
								{#if !type.symmetric}
									<label class="flex flex-col gap-1">
										<span class="text-xs text-fg-muted">From the other side</span>
										<input name="reverseLabel" value={type.reverseLabel} class={INPUT} required />
									</label>
								{/if}
								<!-- Symmetry decides how a link is stored, so it is fixed once the type exists. -->
								{#if type.symmetric}
									<input type="hidden" name="symmetric" value="on" />
								{/if}
								<div>
									<Button variant="primary" size="sm">Save</Button>
								</div>
							</form>
						{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-sm text-fg-subtle">No types of your own yet.</p>
		{/if}

		{#snippet editor()}
			<form
				method="POST"
				action="?/add"
				use:enhance={savedAdd}
				class="flex flex-col gap-3 border-t border-border-subtle pt-3"
			>
				<div class="flex flex-wrap items-end gap-2">
					<label class="flex flex-1 flex-col gap-1">
						<span class="text-xs text-fg-muted">Label</span>
						<input
							name="forwardLabel"
							placeholder="Godparent of"
							class={INPUT}
							required
						/>
					</label>
					<label class="flex flex-col gap-1">
						<span class="text-xs text-fg-muted">Category</span>
						<select name="category" class={INPUT}>
							{#each RELATIONSHIP_CATEGORIES as category (category)}
								<option value={category} selected={category === 'social'}>{category}</option>
							{/each}
						</select>
					</label>
				</div>

				<label class="flex items-center gap-2 text-sm text-fg-muted">
					<input type="checkbox" name="symmetric" bind:checked={addSymmetric} />
					Reads the same from both sides
				</label>

				{#if !addSymmetric}
					<label class="flex flex-col gap-1">
						<span class="text-xs text-fg-muted">From the other side</span>
						<input name="reverseLabel" placeholder="Godchild of" class={INPUT} required />
					</label>
				{/if}

				<div>
					<Button variant="primary" size="sm">Add</Button>
				</div>
			</form>
		{/snippet}
	</Section>

	<section class="flex flex-col gap-3">
		<h2 class="text-sm font-medium text-fg-muted">Built in</h2>
		<p class="text-sm text-fg-subtle">
			These come with Stella and are the same everywhere, so the family kinship Stella works
			out — grandparents, cousins, in-laws — keeps meaning the same thing.
		</p>
		<ul
			data-testid="built-in-types"
			class="flex flex-col divide-y divide-border-subtle rounded-app bg-card px-4 shadow-card"
		>
			{#each data.builtIn as type (type.id)}
				<li class="flex items-center gap-3 py-2 text-sm">
					<span
						class="size-2 shrink-0 rounded-full"
						style="background:{categoryVar(type.category)}"
					></span>
					<span class="text-fg">{type.forwardLabel}</span>
					{#if !type.symmetric}
						<span class="text-fg-subtle">· from the other side: {type.reverseLabel}</span>
					{/if}
					<span class="ml-auto shrink-0 text-fg-subtle">{type.category}</span>
				</li>
			{/each}
		</ul>
	</section>
</main>
