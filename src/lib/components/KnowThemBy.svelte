<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';

	/*
	 * The nudge for a person being added with a first name only (docs/02 §2.2.3): a first name
	 * alone will not tell them from the next person of that name, so the description field is
	 * brought forward with a word on why. Without a last name it is needed: Stella refuses a
	 * person known by a first name alone (`createContact`).
	 */

	interface Props {
		/** The first name as typed, quoted back in the nudge. */
		firstName: string;
		label: string;
		value?: string;
		/** Set when the field posts with a native form; the inline picker binds `value` instead. */
		name?: string;
		inputClass: string;
		/** The label size of the form around it: small in the picker's panel, regular on a page. */
		compact?: boolean;
	}
	let {
		firstName,
		label,
		value = $bindable(''),
		name,
		inputClass,
		compact = false
	}: Props = $props();
	// Shown only while there is no last name, which is exactly when it is needed.

	const t = useTranslate();
</script>

<div class="flex flex-col gap-2 rounded-control bg-primary-soft p-3" data-testid="know-them-by">
	<p class="flex items-start gap-2 text-sm text-fg">
		<Icon name="met" size={16} class="mt-0.5 shrink-0 text-primary" />
		<span>
			{t('components.namesake.nudge', { name: firstName.trim() })}
			<strong class="font-semibold">{t('components.namesake.nudgeAsk')}</strong>
		</span>
	</p>
	<label class="flex flex-col gap-1 text-fg-muted" class:text-xs={compact} class:text-sm={!compact}>
		{label}
		<input
			{name}
			bind:value
			required
			type="text"
			autocomplete="off"
			placeholder={t('components.namesake.placeholder')}
			class={inputClass}
		/>
	</label>
</div>
