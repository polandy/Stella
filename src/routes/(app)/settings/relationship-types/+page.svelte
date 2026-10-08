<script lang="ts">
	import { reveal } from '$lib/motion/motion.svelte';
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import RemoveButton from '$lib/components/ui/RemoveButton.svelte';
	import Section from '$lib/components/ui/Section.svelte';
	import { categoryVar } from '$lib/design/tokens';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { RELATIONSHIP_CATEGORIES } from '$lib/relationships/categories';
	import { relationshipCategoryLabel, relationshipTypeLabel } from '$lib/relationships/labels';
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

	const t = useTranslate();

	/** One class for every text input on the page, so they cannot drift apart. */
	const INPUT =
		'rounded-control border border-border-input bg-bg px-3 py-2 text-sm text-fg placeholder:text-fg-subtle';

	let addOpen = $state(false);
	let editing = $state<string | null>(null);
	/** The add form mirrors one label into both sides until it is told they differ. */
	let addSymmetric = $state(true);

	const removals = useRemovals();
	const savedAdd = savedEnhance(removals, t('components.saved'), () => {
		addOpen = false;
		addSymmetric = true;
	});
	const savedEdit = savedEnhance(removals, t('components.saved'), () => (editing = null));
	const savedMerge = savedEnhance(removals, t('relationshipTypes.merged'), () => (editing = null));

	const allTypes = $derived([...data.builtIn, ...data.custom]);

	const labelOf = (typeId: string) => {
		const type = allTypes.find((candidate) => candidate.id === typeId);
		return type ? relationshipTypeLabel(t, type) : typeId;
	};

	const visibleCustom = $derived(
		data.custom.filter((type) => !removals.isPending(removalKey('relationship-type', type.id)))
	);
</script>

<svelte:head
	><title>{t('common.pageTitle', { page: t('relationshipTypes.title') })}</title></svelte:head
>

<main class="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
	<header class="flex flex-col gap-1">
		<a href="/settings" class="flex items-center gap-1 text-sm text-link hover:underline">
			<Icon name="forward" size={12} />{t('nav.settings')}
		</a>
		<h1 class="text-2xl font-semibold text-fg">{t('relationshipTypes.title')}</h1>
		<p class="text-fg-muted">{t('relationshipTypes.intro')}</p>
	</header>

	<Section
		title={t('relationshipTypes.own')}
		count={visibleCustom.length}
		addLabel={t('relationshipTypes.addType')}
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
								<span class="text-fg-subtle">
									· {t('relationshipTypes.otherSide', { label: type.reverseLabel })}
								</span>
							{/if}
							<span class="shrink-0 text-fg-subtle">
								· {relationshipCategoryLabel(t, type.category)}
							</span>
							<div class="ml-auto flex shrink-0 items-center gap-1">
								<Button
									type="button"
									variant="ghost"
									size="sm"
									aria-expanded={editing === type.id}
									onclick={() => (editing = editing === type.id ? null : type.id)}
								>
									{editing === type.id ? t('common.cancel') : t('common.edit')}
								</Button>
								{#if type.usageCount === 0}
									<RemoveButton
										kind="relationship-type"
										id={type.id}
										action="?/remove"
										fields={{ typeId: type.id }}
										label={t('relationshipTypes.remove', { label: type.forwardLabel })}
										removed={t('relationshipTypes.removed')}
									/>
								{:else}
									<span class="text-xs text-fg-subtle">
										{t('relationshipTypes.used', { count: type.usageCount })}
									</span>
								{/if}
							</div>
						</div>

						{#if type.replacedBy}
							<form
								method="POST"
								action="?/merge"
								use:enhance={savedMerge}
								data-testid="replaced-by-built-in"
								class="flex flex-wrap items-center gap-2 pl-5 text-fg-muted"
							>
								<input type="hidden" name="typeId" value={type.id} />
								<input type="hidden" name="intoId" value={type.replacedBy} />
								<span>{t('relationshipTypes.replaced', { label: labelOf(type.replacedBy) })}</span>
								<Button variant="primary" size="sm">
									{t('relationshipTypes.mergeInto', { label: labelOf(type.replacedBy) })}
								</Button>
							</form>
						{/if}

						{#if editing === type.id}
							<!-- Both forms unfold under the row as one (docs/05 §5.11). -->
							<div class="flex flex-col gap-1" transition:reveal>
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
											<span class="text-xs text-fg-muted">{t('relationshipTypes.label')}</span>
											<input name="forwardLabel" value={type.forwardLabel} class={INPUT} required />
										</label>
										<label class="flex flex-col gap-1">
											<span class="text-xs text-fg-muted">{t('relationshipTypes.category')}</span>
											<select name="category" class={INPUT}>
												{#each RELATIONSHIP_CATEGORIES as category (category)}
													<option value={category} selected={category === type.category}>
														{relationshipCategoryLabel(t, category)}
													</option>
												{/each}
											</select>
										</label>
									</div>
									{#if !type.symmetric}
										<label class="flex flex-col gap-1">
											<span class="text-xs text-fg-muted"
												>{t('relationshipTypes.fromOtherSide')}</span
											>
											<input name="reverseLabel" value={type.reverseLabel} class={INPUT} required />
										</label>
									{/if}
									<!-- Symmetry decides how a link is stored, so it is fixed once the type exists. -->
									{#if type.symmetric}
										<input type="hidden" name="symmetric" value="on" />
									{/if}
									<div>
										<Button variant="primary" size="sm">{t('common.save')}</Button>
									</div>
								</form>

								<form
									method="POST"
									action="?/merge"
									use:enhance={savedMerge}
									class="flex flex-col gap-2 border-t border-border-subtle pt-2 pl-5"
								>
									<input type="hidden" name="typeId" value={type.id} />
									<div class="flex flex-wrap items-end gap-2">
										<label class="flex flex-1 flex-col gap-1">
											<span class="text-xs text-fg-muted">{t('relationshipTypes.mergeLabel')}</span>
											<select name="intoId" class={INPUT} required>
												{#each type.mergeTargets as target (target.id)}
													<option value={target.id} selected={target.id === type.replacedBy}>
														{relationshipTypeLabel(t, target)}
													</option>
												{/each}
											</select>
										</label>
										<Button variant="secondary" size="sm">{t('relationshipTypes.merge')}</Button>
									</div>
									<p class="text-xs text-fg-subtle">{t('relationshipTypes.mergeHint')}</p>
								</form>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-sm text-fg-subtle">{t('relationshipTypes.none')}</p>
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
						<span class="text-xs text-fg-muted">{t('relationshipTypes.label')}</span>
						<input
							name="forwardLabel"
							placeholder={t('relationshipTypes.labelPlaceholder')}
							class={INPUT}
							required
						/>
					</label>
					<label class="flex flex-col gap-1">
						<span class="text-xs text-fg-muted">{t('relationshipTypes.category')}</span>
						<select name="category" class={INPUT}>
							{#each RELATIONSHIP_CATEGORIES as category (category)}
								<option value={category} selected={category === 'social'}>
									{relationshipCategoryLabel(t, category)}
								</option>
							{/each}
						</select>
					</label>
				</div>

				<label class="flex items-center gap-2 text-sm text-fg-muted">
					<input type="checkbox" name="symmetric" bind:checked={addSymmetric} />
					{t('relationshipTypes.symmetric')}
				</label>

				{#if !addSymmetric}
					<label class="flex flex-col gap-1" transition:reveal>
						<span class="text-xs text-fg-muted">{t('relationshipTypes.fromOtherSide')}</span>
						<input
							name="reverseLabel"
							placeholder={t('relationshipTypes.reversePlaceholder')}
							class={INPUT}
							required
						/>
					</label>
				{/if}

				<div>
					<Button variant="primary" size="sm">{t('common.add')}</Button>
				</div>
			</form>
		{/snippet}
	</Section>

	<section class="flex flex-col gap-3">
		<h2 class="text-sm font-medium text-fg-muted">{t('relationshipTypes.builtIn')}</h2>
		<p class="text-sm text-fg-subtle">{t('relationshipTypes.builtInHint')}</p>
		<ul
			data-testid="built-in-types"
			class="flex flex-col divide-y divide-border-subtle rounded-app bg-card px-4 shadow-card"
		>
			{#each data.builtIn as type (type.id)}
				<li class="flex items-center gap-3 py-2 text-sm">
					<span class="size-2 shrink-0 rounded-full" style="background:{categoryVar(type.category)}"
					></span>
					<span class="text-fg">{relationshipTypeLabel(t, type)}</span>
					{#if !type.symmetric}
						<span class="text-fg-subtle">
							· {t('relationshipTypes.otherSide', {
								label: relationshipTypeLabel(t, type, 'reverse')
							})}
						</span>
					{/if}
					<span class="ml-auto shrink-0 text-fg-subtle">
						{relationshipCategoryLabel(t, type.category)}
					</span>
				</li>
			{/each}
		</ul>
	</section>
</main>
