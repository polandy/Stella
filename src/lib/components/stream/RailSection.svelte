<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { IconName } from '$lib/components/ui/icons';
	import { glide } from '$lib/motion/motion.svelte';

	/*
	 * One section of Home's rail (docs/05 §5.5.1). From `lg` it stands open beside the stream
	 * under its heading. Below, the rail sits in the stream's way, so each section folds to one
	 * line — icon, title, *how many · the first*, chevron — and a tap opens it in place. Folded by
	 * default and per tab only: the stream is what a phone's Home is for.
	 */
	interface Props {
		icon: IconName;
		title: string;
		/** The folded line's *2 · Call Rosa about the move* (`railSummary`). */
		summary: string;
		testid: string;
		children: Snippet;
	}
	let { icon, title, summary, testid, children }: Props = $props();

	const uid = $props.id();
	let open = $state(false);
</script>

<section data-testid={testid} aria-labelledby="{uid}-title" class="max-lg:px-3.5">
	<h2 id="{uid}-title" class="text-sm font-semibold text-fg">
		<span class="flex items-center gap-2 pb-2 max-lg:hidden"
			><Icon name={icon} size={13} />{title}</span
		>
		<button
			type="button"
			class="flex min-h-12 w-full items-center gap-2.5 rounded-app text-left lg:hidden"
			aria-expanded={open}
			aria-controls="{uid}-body"
			onclick={() => (open = !open)}
			data-testid="{testid}-toggle"
		>
			<span class="text-primary"><Icon name={icon} size={16} /></span>
			<span class="text-[15px] font-semibold">{title}</span>
			<span class="min-w-0 flex-1 truncate text-sm font-normal text-fg-muted">
				{#if !open}{summary}{/if}
			</span>
			<span class="text-fg-muted"><Icon name={open ? 'collapse' : 'expand'} size={16} /></span>
		</button>
	</h2>
	<div id="{uid}-body" class={open ? 'max-lg:pb-2' : 'max-lg:hidden'} use:glide={{ key: open }}>
		{@render children()}
	</div>
</section>
