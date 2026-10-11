<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import ColourSwatches from '$lib/components/circle/ColourSwatches.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import DateField from '$lib/components/ui/DateField.svelte';
	import FormError from '$lib/components/ui/FormError.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import MenuButton from '$lib/components/ui/MenuButton.svelte';
	import { circleKindLabel } from '$lib/circles/labels';
	import { circlePeriodLabel } from '$lib/circles/period';
	import { accentDotStyle, type Accent } from '$lib/design/tokens';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { reveal } from '$lib/motion/motion.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { savedEnhance } from '$lib/undo/saved';

	/*
	 * The circle page's header (docs/02 §2.4.2, docs/design/screens/circles.md): its colour, name
	 * and one line of facts, *Open in the graph*, and a ⋯ menu. *Edit circle* turns the header
	 * into a form in place with the create form's fields plus the period, which only editing
	 * sets. Anyone who sees the circle may edit it, so everyone gets the menu.
	 */
	interface Props {
		circle: {
			id: string;
			name: string;
			description: string | null;
			kind: string;
			color: Accent;
			visibility: 'shared' | 'private';
			startDate: string | null;
			endDate: string | null;
		};
		kinds: readonly string[];
		colors: readonly Accent[];
		/** The refusal of the last save, said under the form, which then stays open. */
		error: string | null;
	}

	let { circle, kinds, colors, error }: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const removals = useRemovals();

	let editing = $state(false);
	let root = $state<HTMLElement>();
	let nameInput = $state<HTMLInputElement>();
	// A refused save keeps the form open, so the error has somewhere to be read.
	const showForm = $derived(editing || error !== null);

	const period = $derived(circlePeriodLabel(i18n, circle.startDate, circle.endDate));

	async function openEditor() {
		editing = true;
		await tick();
		nameInput?.focus();
	}

	/** Back to the header, with the cursor on the ⋯ it was opened from. */
	async function closeEditor() {
		editing = false;
		error = null;
		await tick();
		root?.querySelector<HTMLElement>('[aria-haspopup="menu"]')?.focus();
	}

	const saved = savedEnhance(removals, t('components.saved'), closeEditor);

	function onFormKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		event.preventDefault();
		void closeEditor();
	}

	/*
	 * The period's fields take whole days. A period imported through the API may stop at the
	 * month or the year (docs/03 `circle`); that one is offered as typed text instead, so opening
	 * the form and saving something else never wipes it.
	 */
	const isDay = (value: string | null) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value);

	const INPUT = 'rounded-control border border-border-input bg-bg px-3 py-2 text-fg';
	const ITEM =
		'flex w-full items-center gap-2 rounded-control px-2.5 py-1.5 text-left text-sm text-fg hover:bg-primary-soft focus-visible:bg-primary-soft';
</script>

<div bind:this={root} data-testid="circle-header">
	{#if showForm}
		<!-- Escape anywhere in the form leaves it unchanged, as every in-place editor does (docs/05 §5.7). -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<form
			transition:reveal
			method="POST"
			action="?/updateCircle"
			use:enhance={saved}
			onkeydown={onFormKeydown}
			aria-label={t('circles.edit.label', { name: circle.name })}
			class="flex flex-col gap-4 rounded-app bg-card p-4 shadow-card md:p-5"
		>
			<FormError message={error ?? undefined} id="circle-details-error" />

			<label class="flex flex-col gap-1 text-sm">
				<span class="text-fg-muted">{t('circles.name')}</span>
				<input
					bind:this={nameInput}
					name="name"
					value={circle.name}
					required
					autocomplete="off"
					aria-invalid={error ? 'true' : undefined}
					aria-describedby={error ? 'circle-details-error' : undefined}
					class="{INPUT} text-lg font-semibold"
				/>
			</label>

			<div class="flex flex-wrap gap-4">
				<label class="flex min-w-40 flex-1 flex-col gap-1 text-sm">
					<span class="text-fg-muted">{t('circles.kindLabel')}</span>
					<select name="kind" class={INPUT}>
						{#each kinds as kind (kind)}
							<option value={kind} selected={kind === circle.kind}
								>{circleKindLabel(t, kind)}</option
							>
						{/each}
					</select>
				</label>
				<label class="flex min-w-56 flex-[2] flex-col gap-1 text-sm">
					<span class="text-fg-muted">{t('circles.descriptionLabel')}</span>
					<input name="description" value={circle.description ?? ''} class={INPUT} />
				</label>
			</div>

			<ColourSwatches {colors} selected={circle.color} />

			<fieldset class="flex flex-col gap-2">
				<legend class="mb-2 text-sm text-fg-muted">{t('circles.edit.period')}</legend>
				<div class="flex flex-wrap gap-4">
					{#each [{ name: 'startDate', label: t('circles.edit.start'), value: circle.startDate }, { name: 'endDate', label: t('circles.edit.end'), value: circle.endDate }] as end (end.name)}
						<div class="flex min-w-56 flex-1 flex-col gap-1 text-sm">
							<span class="text-fg-muted" aria-hidden="true">{end.label}</span>
							{#if isDay(end.value)}
								<DateField name={end.name} label={end.label} value={end.value ?? ''} stretch />
							{:else}
								<input
									name={end.name}
									value={end.value}
									aria-label={end.label}
									class="{INPUT} text-sm"
								/>
							{/if}
						</div>
					{/each}
				</div>
			</fieldset>

			<div class="flex flex-wrap gap-2">
				<Button variant="primary" size="sm">{t('common.save')}</Button>
				<Button size="sm" variant="ghost" type="button" onclick={closeEditor}
					>{t('common.cancel')}</Button
				>
			</div>
		</form>
	{:else}
		<header class="flex items-center gap-4">
			<span
				class="grid size-12 shrink-0 place-items-center rounded-full"
				style={accentDotStyle(circle.color)}
			>
				<span class="size-4 rounded-full bg-card/70"></span>
			</span>
			<div class="min-w-0 flex-1">
				<h1 class="truncate text-2xl font-semibold text-fg">{circle.name}</h1>
				<p class="text-sm text-fg-muted" data-testid="circle-facts">
					<span>{circleKindLabel(t, circle.kind)}</span>
					{#if period}
						· {period}{/if}
					{#if circle.description}
						· {circle.description}{/if}
					{#if circle.visibility === 'private'}
						· {t('circles.private')}{/if}
				</p>
			</div>
			<!-- The circle is a node of the graph, so it opens there like a person does (docs/02 §2.7). -->
			<Button size="sm" icon="graph" href="/graph?center={circle.id}"
				>{t('graph.openInGraph')}</Button
			>
			<MenuButton label={t('circles.menu')} align="end" look="button">
				{#snippet trigger()}<Icon name="more" size={18} />{/snippet}
				{#snippet children({ close })}
					<button
						type="button"
						role="menuitem"
						class={ITEM}
						onclick={() => (close(), void openEditor())}
					>
						<Icon name="rename" size={14} />{t('circles.edit.open')}
					</button>
				{/snippet}
			</MenuButton>
		</header>
	{/if}
</div>
