<script lang="ts" module>
	import type { IconName } from '$lib/components/ui/icons';

	/** One sentence of the step, with its icon. */
	export interface ConfirmLine {
		icon: IconName;
		text: string;
		/** Said in the danger colour: a consequence to weigh, not a fact. */
		alert?: boolean;
	}
</script>

<script lang="ts">
	import { tick } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/Button.svelte';
	import FormError from '$lib/components/ui/FormError.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { scrollBehavior } from '$lib/motion/motion';
	import { reveal } from '$lib/motion/motion.svelte';

	/*
	 * The confirm step under a member's row (docs/02 §2.1): the person page's sunken box, not a
	 * modal, for removing a member and for restoring one. It says what the step ends and what it
	 * keeps, and its focus starts on the way out, so a second Enter changes nobody. A member the
	 * step no longer applies to (404: gone already, back already) reads as done.
	 */
	let {
		memberId,
		heading,
		lines,
		action,
		submit,
		submitVariant,
		keep,
		testid,
		onkeep,
		ondone
	}: {
		memberId: string;
		heading: string;
		lines: ConfirmLine[];
		/** The page's form action that applies the step. */
		action: '?/remove' | '?/restore';
		submit: string;
		submitVariant: 'danger' | 'primary';
		keep: string;
		testid: string;
		onkeep: () => void;
		ondone: () => void;
	} = $props();

	let error = $state<string | null>(null);

	let box = $state<HTMLDivElement>();
	$effect(() => {
		if (!box) return;
		void tick().then(() =>
			[...(box?.querySelectorAll<HTMLElement>('button') ?? [])].at(-1)?.focus()
		);
	});

	function onKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || event.defaultPrevented) return;
		event.preventDefault();
		onkeep();
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	bind:this={box}
	transition:reveal
	onintroend={() =>
		box?.scrollIntoView({
			block: 'nearest',
			behavior: scrollBehavior(prefersReducedMotion.current)
		})}
	role="group"
	aria-label={heading}
	onkeydown={onKeydown}
	class="mb-3 flex flex-col gap-2 rounded-app bg-bg-sunken p-3 text-sm"
	data-testid={testid}
>
	<p class="font-semibold text-fg">{heading}</p>
	{#each lines as line (line.icon)}
		<p class="flex items-start gap-2 {line.alert ? 'text-danger' : 'text-fg-muted'}">
			<span class="mt-0.5 shrink-0" aria-hidden="true"><Icon name={line.icon} size={14} /></span>
			<span>{line.text}</span>
		</p>
	{/each}
	<FormError message={error} variant="inline" size="xs" />
	<form
		method="POST"
		{action}
		class="mt-1 flex flex-wrap gap-2"
		use:enhance={() =>
			async ({ result, update }) => {
				if (result.type === 'success' || (result.type === 'failure' && result.status === 404)) {
					await update();
					ondone();
					return;
				}
				if (result.type === 'failure' && typeof result.data?.error === 'string') {
					error = result.data.error;
					return;
				}
				await update();
			}}
	>
		<input type="hidden" name="memberId" value={memberId} />
		<Button variant={submitVariant} size="sm">{submit}</Button>
		<Button variant="ghost" size="sm" type="button" onclick={onkeep}>{keep}</Button>
	</form>
</div>
