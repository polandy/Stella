<script lang="ts">
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { RoleGroup } from '$lib/graph/model/role-groups';
	import type { GraphNode } from '$lib/graph/model/types';

	/** The peek panel for a group of people standing together by role (docs/02 §2.7). */
	interface Props {
		group: RoleGroup;
		/** The group's name, as its frame on the canvas reads. */
		label: string;
		/** The people on the map, for the members' names and photos. */
		nodes: readonly GraphNode[];
		nameOf: (id: string) => string;
		compact: boolean;
		/** Draw this group's people individually again. */
		onShowIndividually: () => void;
		onClose: () => void;
	}
	let { group, label, nodes, nameOf, compact, onShowIndividually, onClose }: Props = $props();

	const t = useTranslate();
</script>

<aside
	data-testid="group-peek"
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
	<div class="text-xs text-fg-subtle">{t('graph.peek.roleGroup')}</div>
	<div class="text-lg font-semibold text-fg">{label}</div>
	<div class="mb-3 text-xs text-fg-subtle">
		{t('graph.peek.inCircle', { name: nameOf(group.circleId) })}
	</div>
	<ul class="mb-4 flex flex-col gap-1 max-sm:mb-3">
		{#each group.memberIds as id (id)}
			<li>
				<a
					href="/contacts/{id}"
					class="flex items-center gap-2 rounded-lg px-1 py-1 text-sm text-fg hover:bg-bg-sunken"
				>
					<Avatar
						{id}
						name={nameOf(id)}
						avatarPhotoId={nodes.find((n) => n.id === id)?.avatarPhotoId ?? null}
						size={24}
					/>
					<span class="truncate">{nameOf(id)}</span>
				</a>
			</li>
		{/each}
	</ul>
	<div class="flex flex-col gap-2 max-sm:flex-row">
		<Button type="button" class="max-sm:flex-1" onclick={onShowIndividually}>
			{t('graph.peek.showIndividually')}
		</Button>
		<Button variant="primary" class="max-sm:flex-1" href="/circles/{group.circleId}"
			>{t('graph.peek.openCircle')}</Button
		>
	</div>
</aside>
