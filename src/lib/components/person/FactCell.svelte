<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import { PENCIL_AT_VALUE_END, VALUE_WITH_PENCIL } from '$lib/components/ui/edit-pencil';
	import type { IconName } from '$lib/components/ui/icons';
	import type { Snippet } from 'svelte';

	/*
	 * One fact of the identity card's grid: a small label over its value. An editable one is a
	 * button the size of the whole cell (its ::after spans it), named by what it does and then by
	 * what it says.
	 */
	let {
		label,
		icon,
		name,
		value,
		edit,
		links
	}: {
		label: string;
		icon: IconName;
		name: string;
		value: Snippet;
		edit?: { what: string; open: () => void; key: string };
		links?: Snippet;
	} = $props();
</script>

<div
	class="relative -mx-1.5 flex min-w-0 flex-col gap-0.5 rounded-control px-1.5 py-0.5 has-[button:hover]:bg-card-hover"
	data-fact={name}
>
	<dt class="flex items-center gap-1.5 text-xs text-fg-subtle">
		<Icon name={icon} size={12} />{label}
	</dt>
	<dd class="min-w-0 text-sm [overflow-wrap:anywhere] text-fg">
		{#if edit}
			<!-- The pencil says where to edit, on touch too (docs/05 §5.7). -->
			<!-- Text flow, not flex: the pencil follows the value's last word on its last line and
			     never wraps onto a line alone (docs/05 §5.7, edit-pencil.ts). -->
			<button
				type="button"
				class="block max-w-full text-left after:absolute after:inset-0 after:rounded-control"
				title={edit.what}
				data-edit={edit.key}
				onclick={edit.open}
			>
				<span class="sr-only">{edit.what}: </span><span class={VALUE_WITH_PENCIL}
					><Icon name="rename" size={12} class={PENCIL_AT_VALUE_END} />{@render value()}</span
				>
			</button>
		{:else}
			{@render value()}
		{/if}
		{#if links}
			<!-- Ways to other people: outside the button, a link in it is never reached, and
			     positioned, so the tap lands on them rather than on the fact's overlay. -->
			<div class="relative w-fit max-w-full">{@render links()}</div>
		{/if}
	</dd>
</div>
