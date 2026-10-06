<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import Button from '$lib/components/Button.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { CircleRole, CircleRoleOption } from '$lib/graph/model/ego-network';
	import type { GraphNode } from '$lib/graph/model/types';

	/** The peek panel for the selected person or circle (docs/05 §5.8). */
	interface Props {
		node: GraphNode;
		compact: boolean;
		/** Whether the node lies inside the map's reach; past the last ring it does not. */
		withinReach: boolean;
		/** Whether Expand is offered: within reach, and it would add a person or a line. */
		expandable: boolean;
		/** A circle's roles, once they have arrived; empty for a person. */
		roleOptions: CircleRoleOption[];
		/** Which of `roleOptions` the next expansion opens. */
		chosenRoles: ReadonlySet<CircleRole>;
		onToggleRole: (role: CircleRole) => void;
		onExpand: (id: string) => void;
		/** Where "Open in the graph" leads; absent hides it. */
		fullGraphHref?: (nodeId: string) => string;
		onClose: () => void;
	}
	let {
		node,
		compact,
		withinReach,
		expandable,
		roleOptions,
		chosenRoles,
		onToggleRole,
		onExpand,
		fullGraphHref,
		onClose
	}: Props = $props();

	const t = useTranslate();
</script>

<!-- Full height beside a full-screen canvas; embedded it is only as tall as what it
     says, so it does not sit as an empty panel over half a card-sized map. A phone has no
     room beside the map: there it is a strip along the bottom, clear of the toolbar. -->
<aside
	class="absolute top-3 right-3 overflow-auto rounded-app border border-border bg-card/95 p-4 shadow-pop backdrop-blur max-sm:inset-x-3 max-sm:top-auto max-sm:bottom-3 max-sm:max-h-[60%] max-sm:w-auto max-sm:p-3"
	class:bottom-3={!compact}
	class:w-64={!compact}
	class:w-52={compact}
	class:max-h-[calc(100%-1.5rem)]={compact}
>
	<Button
		variant="ghost"
		size="sm"
		icon="remove"
		label={t('common.close')}
		class="float-right"
		onclick={onClose}
	/>
	<!-- Stacked in the side panel; side by side in a phone's strip, which has height to spare
	     for neither. -->
	<div class="mb-4 max-sm:mb-3 max-sm:flex max-sm:items-center max-sm:gap-3">
		{#if node.kind === 'person'}
			<div class="mb-3 max-sm:mb-0 max-sm:shrink-0">
				<Avatar
					id={node.id}
					name={node.label}
					avatarPhotoId={node.avatarPhotoId ?? null}
					size={56}
					deceased={node.deceased}
				/>
			</div>
		{/if}
		<div class="min-w-0">
			<div class="text-lg font-semibold text-fg max-sm:truncate">{node.label}</div>
			<div class="text-xs text-fg-subtle">
				{node.kind === 'circle' ? t('graph.peek.sharedContext') : t('graph.peek.person')}
				{#if node.deceased}· {t('graph.peek.deceased')}{/if}
			</div>
		</div>
	</div>
	<div class="flex flex-col gap-2 max-sm:flex-row max-sm:flex-wrap">
		{#if node.kind === 'circle' && expandable && roleOptions.length > 1}
			<fieldset class="flex flex-col gap-1 text-sm max-sm:basis-full" data-testid="circle-roles">
				<legend class="mb-1 text-xs text-fg-subtle">{t('graph.peek.rolesToOpen')}</legend>
				{#each roleOptions as option (option.role)}
					<label class="flex items-center gap-2">
						<input
							type="checkbox"
							checked={chosenRoles.has(option.role)}
							onchange={() => onToggleRole(option.role)}
						/>
						<span class="text-fg">{option.role ?? t('circles.noRole')} · {option.count}</span>
					</label>
				{/each}
			</fieldset>
		{/if}
		{#if expandable}
			<Button
				type="button"
				class="max-sm:flex-1"
				disabled={node.kind === 'circle' && roleOptions.length > 0 && chosenRoles.size === 0}
				onclick={() => onExpand(node.id)}>{t('graph.peek.expand')}</Button
			>
		{:else if fullGraphHref && !withinReach}
			<!-- The map ends here, so the honest offer is the one place that goes further. -->
			<Button icon="graph" class="max-sm:flex-1" href={fullGraphHref(node.id)}
				>{t('graph.openInGraph')}</Button
			>
		{/if}
		{#if node.kind === 'person'}
			<Button variant="primary" class="max-sm:flex-1" href="/contacts/{node.id}"
				>{t('graph.peek.openProfile')}</Button
			>
		{:else if node.kind === 'circle'}
			<Button variant="primary" class="max-sm:flex-1" href="/circles/{node.id}"
				>{t('graph.peek.openCircle')}</Button
			>
		{/if}
	</div>
	<!-- The general tip is left out of a phone's strip; that the map ends here is not. -->
	<p class="mt-4 text-xs text-fg-subtle max-sm:mt-3" class:max-sm:hidden={expandable}>
		{#if !withinReach}
			{t('graph.peek.edgeOfMap')}
		{:else if !expandable}
			{t('graph.peek.allShown')}
		{:else}
			{compact ? t('graph.peek.tipCompact') : t('graph.peek.tip')}
		{/if}
	</p>
</aside>
