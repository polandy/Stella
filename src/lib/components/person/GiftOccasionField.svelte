<script lang="ts">
	import { GIFT_OCCASION_PRESETS, isGiftOccasionPreset, OTHER_OCCASION } from '$lib/gifts/gifts';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { INPUT } from './inputs';

	/*
	 * A gift's occasion (docs/02 §2.25): Birthday, Christmas, Anniversary as chips, or *Other…*
	 * with a field for the member's own wording. Two fields — the chip and the text — so the form
	 * works without JavaScript too; `occasionFromForm` reads them the same way on both sides.
	 * Optional: a chip pressed again lets go, and nothing chosen stores no occasion.
	 */
	let { occasion = null }: { occasion?: string | null } = $props();

	const t = useI18n().t;

	// svelte-ignore state_referenced_locally
	let choice = $state<string | null>(
		occasion === null ? null : isGiftOccasionPreset(occasion) ? occasion : OTHER_OCCASION
	);
	// svelte-ignore state_referenced_locally
	let typed = $state(occasion !== null && !isGiftOccasionPreset(occasion) ? occasion : '');

	const CHOICES = [...GIFT_OCCASION_PRESETS, OTHER_OCCASION] as const;

	/*
	 * A chip pressed while chosen lets go, so an occasion can be taken back. The click comes
	 * before the radio's own change, so `choice` still says what was chosen before this press.
	 */
	function toggle(value: string) {
		if (choice === value) choice = null;
	}
</script>

<fieldset class="flex flex-col gap-1.5">
	<legend class="mb-1.5 text-xs font-medium text-fg-muted">{t('gifts.form.occasion')}</legend>
	<div class="flex flex-wrap gap-1.5">
		{#each CHOICES as value (value)}
			<label
				class="cursor-pointer rounded-full border border-border bg-bg px-3 py-1 text-[0.8125rem] text-fg-muted transition-colors has-checked:border-primary has-checked:bg-primary-soft has-checked:font-medium has-checked:text-primary has-focus-visible:outline-2 has-focus-visible:outline-focus-ring"
			>
				<input
					type="radio"
					name="occasionChoice"
					{value}
					bind:group={choice}
					onclick={() => toggle(value)}
					class="sr-only"
				/>
				{t(`gifts.occasion.${value}`)}
			</label>
		{/each}
	</div>
	{#if choice === OTHER_OCCASION}
		<input
			name="occasionText"
			bind:value={typed}
			placeholder={t('gifts.form.otherOccasion')}
			aria-label={t('gifts.form.otherOccasion')}
			class="{INPUT} w-full"
		/>
	{/if}
</fieldset>
