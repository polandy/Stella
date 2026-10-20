<!--
  @component
  *Belongs to* (docs/02 §2.4.2): the circle a circle sits inside, chosen in the circle picker and
  posted as `parent` (empty for none). The edit form, the list's *New circle* and the sub-circles
  card's *New sub-circle* all show it, so a parent is chosen the same way everywhere. Nothing is
  saved until the form is.
-->
<script lang="ts">
	import CirclePicker from '$lib/components/circle/CirclePicker.svelte';
	import FormError from '$lib/components/ui/FormError.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { circleTree, type TreeCircle } from '$lib/circles/tree';
	import { accentDotStyle } from '$lib/design/tokens';
	import { useTranslate } from '$lib/i18n/context.svelte';

	interface Props {
		/** Every circle the reader sees, flat. */
		circles: readonly TreeCircle[];
		/** The circle being edited; null while creating one. */
		subjectId: string | null;
		/** Its name — the new one's as typed so far, or null. */
		subjectName: string | null;
		/** Whether the circle is shared, so a private parent can say what the others see. */
		shared: boolean;
		/** The chosen parent, null for none. */
		value: string | null;
		/** Creating: the field is optional and says so. */
		optional?: boolean;
		/** The refusal of the last save, said under the field. */
		error?: string | null;
		/** Keeps ids apart when two forms show the field. */
		idPrefix: string;
	}

	let {
		circles,
		subjectId,
		subjectName,
		shared,
		value = $bindable(),
		optional = false,
		error = null,
		idPrefix
	}: Props = $props();

	const t = useTranslate();
	let picking = $state(false);

	const tree = $derived(circleTree(circles));
	const parent = $derived(value === null ? undefined : tree.get(value));
	// The way down to the chosen parent, itself included: *in School › Class 3a*.
	const path = $derived(
		value === null ? [] : [...tree.ancestors(value), ...(parent ? [parent] : [])].map((c) => c.name)
	);
	const current = $derived(parent?.name ?? t('circles.parent.none'));
	const privateNote = $derived(
		parent && parent.visibility === 'private' && shared
			? t('circles.parent.privateNote', {
					parent: parent.name,
					name: subjectName || t('circles.new')
				})
			: null
	);
	const helpId = $derived(`${idPrefix}-parent-help`);
	const errorId = $derived(`${idPrefix}-parent-error`);
</script>

<div class="flex flex-col gap-1 text-sm" data-testid="parent-field">
	<div class="flex items-baseline justify-between gap-3">
		<span class="text-fg-muted" id="{idPrefix}-parent-label"
			>{optional ? t('circles.parent.labelOptional') : t('circles.parent.label')}</span
		>
		{#if value !== null}
			<button
				type="button"
				class="text-sm text-link hover:underline"
				onclick={() => (value = null)}
				data-testid="parent-detach">{t('circles.parent.detach')}</button
			>
		{/if}
	</div>
	<input type="hidden" name="parent" value={value ?? ''} />
	<button
		type="button"
		class="flex items-center gap-3 rounded-control border border-border-input bg-bg px-3 py-2 text-left text-fg hover:border-primary"
		aria-label={t('circles.parent.choose', { current })}
		aria-describedby="{helpId}{error ? ` ${errorId}` : ''}"
		onclick={() => (picking = true)}
		data-testid="parent-choose"
	>
		{#if parent}
			<span class="size-2.5 shrink-0 rounded-full" style={accentDotStyle(parent.color)}></span>
		{:else}
			<span class="size-2.5 shrink-0 rounded-full border border-border-input"></span>
		{/if}
		<span class="min-w-0 flex-1">
			<span class="block truncate font-medium">{current}</span>
			<span class="block truncate text-xs text-fg-subtle">
				{#if parent}
					{t('circles.parent.path', { path: path.join(' › ') })}
				{:else}
					{t('circles.parent.standsAlone')}
				{/if}
			</span>
		</span>
		<Icon name="expand" size={16} class="text-fg-subtle" />
	</button>
	<span id={helpId} class="text-xs text-fg-subtle">{t('circles.parent.help')}</span>
	{#if privateNote}
		<span class="text-xs text-fg-muted" data-testid="parent-private-note">{privateNote}</span>
	{/if}
	<FormError message={error ?? undefined} id={errorId} />
</div>

<CirclePicker
	{circles}
	mode="parent"
	{subjectId}
	{subjectName}
	selectedId={value}
	bind:open={picking}
	onchoose={(id) => (value = id)}
/>
