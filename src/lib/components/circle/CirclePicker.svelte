<!--
  @component
  The circle picker (docs/02 §2.4.2, docs/design/screens/circles.md): a sheet from the bottom with
  every circle the reader sees, indented as they nest, and a search that turns it into a flat list
  with each circle's path. Used to choose where a circle belongs (`parent`) and to put an existing
  circle into this one (`add`). A row that cannot be chosen stays and says why.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import {
		pickerRows,
		searchPickerRows,
		type PickerBlock,
		type PickerMode
	} from '$lib/circles/picker';
	import { circleTree, type TreeCircle } from '$lib/circles/tree';
	import { accentDotStyle } from '$lib/design/tokens';
	import { useTranslate } from '$lib/i18n/context.svelte';

	interface Props {
		/** Every circle the reader sees, flat; the picker nests them. */
		circles: readonly TreeCircle[];
		mode: PickerMode;
		/** The circle being placed (`parent`) or filled (`add`); null for one not made yet. */
		subjectId: string | null;
		/** Its name, for the subtitle; null for one not made yet. */
		subjectName: string | null;
		/** The parent chosen so far (`parent`). */
		selectedId?: string | null;
		/** Whether the sheet is up. */
		open: boolean;
		/** A circle was chosen — null: *None*, standing for itself. The sheet then closes. */
		onchoose: (id: string | null) => void;
	}

	let {
		circles,
		mode,
		subjectId,
		subjectName,
		selectedId = null,
		open = $bindable(),
		onchoose
	}: Props = $props();

	const t = useTranslate();
	// Several pickers share a page (the edit form's, the card's), so the title's id is their own.
	const uid = $props.id();
	const titleId = `${uid}-circle-picker-title`;
	let dialog = $state<HTMLDialogElement>();
	let searchInput = $state<HTMLInputElement>();
	let query = $state('');

	const tree = $derived(circleTree(circles));
	const rows = $derived(pickerRows(tree, { mode, subjectId, selectedId }));
	const shown = $derived(searchPickerRows(rows, query));
	const searching = $derived(query.trim() !== '');
	const title = $derived(
		mode === 'add' ? t('circles.picker.addTitle') : t('circles.picker.parentTitle')
	);
	const subtitle = $derived(
		mode === 'add'
			? t('circles.picker.addSubtitle', { name: subjectName ?? '' })
			: subjectName === null
				? t('circles.picker.parentSubtitleNew')
				: t('circles.picker.parentSubtitle', { name: subjectName })
	);

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) {
			query = '';
			dialog.showModal();
			void tick().then(() => searchInput?.focus());
		} else if (!open && dialog.open) dialog.close();
	});

	function choose(id: string | null) {
		open = false;
		onchoose(id);
	}

	function reason(block: PickerBlock): string {
		switch (block.reason) {
			case 'self':
				return t('circles.picker.self');
			case 'inside':
				return t('circles.picker.inside', { name: block.name });
			case 'contains':
				return t('circles.picker.contains', { name: block.name });
			case 'alreadyIn':
				return t('circles.picker.alreadyIn');
		}
	}

	const ROW =
		'flex w-full items-center gap-2 rounded-control px-2 py-2 text-left text-sm enabled:hover:bg-primary-soft focus-visible:bg-primary-soft disabled:cursor-not-allowed';
	const INDENT_REM = 1.25;
</script>

<dialog
	bind:this={dialog}
	aria-labelledby={titleId}
	onclose={() => (open = false)}
	onkeydown={(event) => {
		// Escape closes the sheet only: the form it sits in must not take it as its own Escape.
		if (event.key === 'Escape') event.stopPropagation();
	}}
	onclick={(event) => event.target === event.currentTarget && dialog?.close()}
	class="mx-auto mt-auto mb-0 w-full max-w-lg rounded-t-app border border-border bg-card p-0 text-fg shadow-pop backdrop:bg-bg-sunken/70 backdrop:backdrop-blur-sm md:m-auto md:rounded-app"
	data-testid="circle-picker"
>
	<div class="flex max-h-[85vh] flex-col gap-3 p-4">
		<div class="flex items-start justify-between gap-3">
			<div class="min-w-0">
				<h2 id={titleId} class="text-base font-semibold">{title}</h2>
				<p class="text-sm text-fg-muted">{subtitle}</p>
			</div>
			<Button type="button" variant="ghost" size="sm" onclick={() => dialog?.close()}
				>{t('common.close')}</Button
			>
		</div>

		<input
			bind:this={searchInput}
			type="search"
			bind:value={query}
			placeholder={t('circles.picker.search')}
			aria-label={t('circles.picker.search')}
			autocomplete="off"
			class="rounded-control border border-border-input bg-bg px-3 py-2 text-fg"
		/>

		<ul class="-mx-2 flex-1 overflow-y-auto" data-testid="circle-picker-rows">
			{#if mode === 'parent' && !searching}
				<li>
					<button
						type="button"
						class="{ROW} text-fg"
						aria-current={selectedId === null ? 'true' : undefined}
						onclick={() => choose(null)}
						data-testid="circle-picker-none"
					>
						<span class="size-2.5 shrink-0 rounded-full border border-border-input"></span>
						<span class="min-w-0 flex-1">
							<span class="font-medium">{t('circles.parent.none')}</span>
							<span class="text-fg-subtle"> – {t('circles.parent.standsAlone')}</span>
						</span>
						{#if selectedId === null}<Icon name="done" size={16} class="text-primary" />{/if}
					</button>
				</li>
			{/if}
			{#each shown as row (row.id)}
				<li>
					<button
						type="button"
						class="{ROW} {row.block ? 'text-fg-subtle' : 'text-fg'}"
						style="padding-left: {0.5 + row.depth * INDENT_REM}rem"
						disabled={row.block !== null}
						aria-current={row.checked ? 'true' : undefined}
						onclick={() => choose(row.id)}
						data-testid="circle-picker-row"
					>
						<span class="size-2.5 shrink-0 rounded-full" style={accentDotStyle(row.color)}></span>
						<span class="min-w-0 flex-1">
							<span class="block truncate {row.block ? '' : 'font-medium'}">{row.name}</span>
							{#if searching && row.path.length > 0}
								<span class="block truncate text-xs text-fg-subtle"
									>{t('circles.parent.path', { path: row.path.join(' › ') })}</span
								>
							{/if}
							{#if row.block}
								<span class="block text-xs">{reason(row.block)}</span>
							{:else if row.movesFrom}
								<span class="block text-xs text-fg-subtle"
									>{t('circles.picker.movesFrom', { name: row.movesFrom })}</span
								>
							{/if}
						</span>
						{#if row.checked}<Icon name="done" size={16} class="text-primary" />{/if}
					</button>
				</li>
			{:else}
				<li class="px-2 py-2 text-sm text-fg-subtle">{t('circles.picker.noMatch')}</li>
			{/each}
		</ul>

		<p class="text-xs text-fg-subtle">{t('circles.picker.footer')}</p>
	</div>
</dialog>
