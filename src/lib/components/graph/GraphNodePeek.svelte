<script lang="ts">
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { MessageKey } from '$lib/i18n/translate';
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
		roleOptions: readonly CircleRoleOption[];
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
     says, so it does not sit as an empty panel over half a card-sized map. Below `lg` (a phone,
     a tablet) a panel beside the map covers the people just tapped: there it is one row along
     the bottom — avatar, name, the actions, close — so the map keeps the screen; the circle's
     roles and the edge of the map go below. -->
<aside
	class="absolute top-3 right-3 overflow-auto rounded-app border border-border bg-card/95 p-4 shadow-pop backdrop-blur max-lg:inset-x-3 max-lg:top-auto max-lg:bottom-3 max-lg:flex max-lg:max-h-[60%] max-lg:w-auto max-lg:flex-wrap max-lg:items-center max-lg:gap-2 max-lg:p-2.5"
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
		class="float-right max-lg:order-1"
		onclick={onClose}
	/>
	<div
		class="mb-4 max-lg:mb-0 max-lg:flex max-lg:min-w-0 max-lg:flex-1 max-lg:items-center max-lg:gap-2.5"
	>
		{#if node.kind === 'person'}
			<!-- A size container, so the initials scale with the box (`Avatar` fill). -->
			<div class="@container mb-3 size-14 shrink-0 rounded-full max-lg:mb-0 max-lg:size-10">
				<Avatar
					id={node.id}
					name={node.label}
					avatarPhotoId={node.avatarPhotoId ?? null}
					deceased={node.deceased}
					fill
				/>
			</div>
		{/if}
		<div class="min-w-0">
			<div class="text-lg font-semibold text-fg max-lg:truncate max-lg:text-base">{node.label}</div>
			<!-- "Person" says nothing the strip's avatar does not; a death or a circle still shows. -->
			<div
				class="text-xs text-fg-subtle {node.kind === 'person' && !node.deceased
					? 'max-lg:hidden'
					: ''}"
			>
				{node.kind === 'circle' ? t('graph.peek.sharedContext') : t('graph.peek.person')}
				{#if node.deceased}· {t('graph.peek.deceased')}{/if}
			</div>
		</div>
	</div>
	<!-- In the strip the buttons join its row; the roles go under it. -->
	<div class="flex flex-col gap-2 max-lg:contents">
		{#if node.kind === 'circle' && expandable && roleOptions.length > 1}
			<fieldset
				class="flex flex-col gap-1 text-sm max-lg:order-2 max-lg:basis-full"
				data-testid="circle-roles"
			>
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
		<!-- A word each on a phone; the full words stay the accessible name. -->
		{#if expandable}
			<Button
				type="button"
				size="adaptive"
				label={t('graph.peek.expand')}
				disabled={node.kind === 'circle' && roleOptions.length > 0 && chosenRoles.size === 0}
				onclick={() => onExpand(node.id)}
				>{@render worded('graph.peek.expand', 'graph.peek.expandShort')}</Button
			>
		{:else if fullGraphHref && !withinReach}
			<!-- The map ends here, so the honest offer is the one place that goes further. -->
			<Button icon="graph" size="adaptive" href={fullGraphHref(node.id)}
				>{t('graph.openInGraph')}</Button
			>
		{/if}
		{#if node.kind === 'person'}
			<Button
				variant="primary"
				size="adaptive"
				label={t('graph.peek.openProfile')}
				href="/contacts/{node.id}"
				>{@render worded('graph.peek.openProfile', 'graph.peek.openProfileShort')}</Button
			>
		{:else if node.kind === 'circle'}
			<Button
				variant="primary"
				size="adaptive"
				label={t('graph.peek.openCircle')}
				href="/circles/{node.id}"
				>{@render worded('graph.peek.openCircle', 'graph.peek.openCircleShort')}</Button
			>
		{/if}
	</div>
	<!-- The general tip and "all shown" are left out of the strip; that the map ends here is
	     not. -->
	<p
		class="mt-4 text-xs text-fg-subtle max-lg:order-2 max-lg:mt-0 max-lg:basis-full {withinReach
			? 'max-lg:hidden'
			: ''}"
	>
		{#if !withinReach}
			{t('graph.peek.edgeOfMap')}
		{:else if !expandable}
			{t('graph.peek.allShown')}
		{:else}
			{compact ? t('graph.peek.tipCompact') : t('graph.peek.tip')}
		{/if}
	</p>
</aside>

{#snippet worded(full: MessageKey, short: MessageKey)}
	<span class="max-sm:hidden">{t(full)}</span><span class="sm:hidden">{t(short)}</span>
{/snippet}
