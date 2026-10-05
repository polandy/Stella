<script lang="ts">
	import Swap from '$lib/components/Swap.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { GENDERS, type Gender } from '$lib/people/gender';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { savedEnhance } from '$lib/undo/saved';

	/*
	 * A person's gender, set where it is read (docs/02 §2.2). The row opens three chips; a tap
	 * saves and closes, and a tap on the chosen one takes it off the record. Each chip is a
	 * submit button carrying its own value, so a tap is the whole form.
	 */
	interface Props {
		gender: Gender | null;
		/** An error from the last save; keeps the chips open so the message has a home. */
		error?: string | null;
	}
	let { gender, error = null }: Props = $props();

	const t = useTranslate();
	let editing = $state(false);
	const open = $derived(editing || error !== null);
	const saved = savedEnhance(useRemovals(), t('components.saved'), () => (editing = false));

	let chips = $state<HTMLDivElement | null>(null);
	// Focus the chosen chip, or the first, the moment the chips appear — so Escape reaches them.
	$effect(() => {
		if (open) (chips?.querySelector<HTMLElement>('[aria-pressed="true"]') ?? chips?.querySelector('button'))?.focus();
	});

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			editing = false;
		}
	}
</script>

<div class="border-t border-border-subtle first:border-t-0" data-row="gender">
	<Swap when={open}>
		<form method="POST" action="?/setGender" use:enhance={saved} class="flex flex-col gap-2 py-2">
			<span class="text-sm font-medium text-fg">{t('contact.gender')}</span>
			<div bind:this={chips} class="flex flex-wrap gap-1.5">
				{#each GENDERS as option (option)}
					<button
						name="gender"
						value={option === gender ? '' : option}
						aria-pressed={option === gender}
						onkeydown={onKeydown}
						class="rounded-full border border-border px-3 py-1 text-sm text-fg-muted transition-colors hover:border-primary hover:text-fg aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:font-semibold aria-pressed:text-fg"
					>
						{t(`contact.gender.${option}`)}
					</button>
				{/each}
			</div>
			<p class="text-xs text-fg-subtle">{t('contact.gender.hint')}</p>
			<FormError message={error} variant="inline" />
			<div>
				<Button variant="ghost" size="sm" type="button" onclick={() => (editing = false)}>{t('common.cancel')}</Button>
			</div>
		</form>
		{#snippet otherwise()}
		<button
			type="button"
			onclick={() => (editing = true)}
			title={t('contact.gender.edit')}
			class="-mx-1 flex w-[calc(100%+0.5rem)] items-center gap-2 rounded-control px-1 py-2 text-left text-sm transition-colors hover:bg-card-hover"
		>
			<span class="font-medium text-fg">{t('contact.gender')}</span>
			{#if gender}
				<span class="ml-auto truncate text-fg-muted">{t(`contact.gender.${gender}`)}</span>
			{:else}
				<span class="ml-auto truncate text-fg-subtle">{t('contact.gender.notRecorded')}</span>
			{/if}
		</button>
		{/snippet}
	</Swap>
</div>
