<script lang="ts">
	import { useTranslate } from '#lib/i18n/context.svelte.js';
	import { PARENT_KINDS, type ParentKind } from '#lib/relationships/parent-kinds.js';

	/*
	 * A parent link's kind (docs/dev/02 §2.4): one segment of four, posted as `parentKind`, with
	 * what the chosen kind means under it. Radios, so the form posts the kind without script.
	 */

	interface Props {
		value: ParentKind;
		onchange?: (kind: ParentKind) => void;
	}
	let { value, onchange }: Props = $props();

	const t = useTranslate();
	const hintId = $props.id();

	const SEG =
		'flex flex-1 cursor-pointer items-center justify-center px-3 py-1.5 text-sm text-fg-muted not-last:border-r not-last:border-border has-checked:bg-primary-soft has-checked:font-semibold has-checked:text-fg has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-primary';
</script>

<fieldset class="flex w-full min-w-0 flex-col gap-1 text-sm" aria-describedby={hintId}>
	<legend class="mb-1 text-fg-muted">{t('relationships.parentKindLabel')}</legend>
	<div class="flex overflow-hidden rounded-control border border-border bg-bg">
		{#each PARENT_KINDS as kind (kind)}
			<label class={SEG} data-testid="parent-kind-{kind}">
				<input
					type="radio"
					name="parentKind"
					value={kind}
					checked={kind === value}
					onchange={() => onchange?.(kind)}
					class="sr-only"
				/>
				{t(`relationships.parentKind.${kind}`)}
			</label>
		{/each}
	</div>
	<p id={hintId} class="text-xs text-fg-subtle">
		{t(`relationships.parentKindHint.${value}`)}
	</p>
</fieldset>
