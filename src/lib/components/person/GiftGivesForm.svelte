<script lang="ts">
	import { enhance } from '#lib/forms/enhance.js';
	import Button from '#lib/components/ui/Button.svelte';
	import WhenPicker from '#lib/components/ui/WhenPicker.svelte';
	import { useI18n } from '#lib/i18n/context.svelte.js';
	import { SURPRISE } from '#lib/surprise/surprise.js';
	import { useRemovals } from '#lib/undo/context.svelte.js';
	import { savedEnhance } from '#lib/undo/saved.js';
	import GiftGiverField from './GiftGiverField.svelte';
	import type { GiverChoices } from './types';
	import { INPUT } from '../ui/inputs';

	/*
	 * *+ Tomy schenkt…* on the Schenkt tab (docs/dev/02 §2.25.15): an idea this person gives, so the
	 * form asks for the recipient. The recipient's birth is not known here, so only a day or *later*.
	 */
	interface Props {
		/** The giver: the person whose card this is. */
		giver: { id: string; name: string };
		givers: GiverChoices;
		/** The people a gift may be kept from: the members' own people. */
		keepFrom: readonly string[];
		today: string;
		/** Runs once the gift is saved. */
		onSaved: () => void;
		onCancel: () => void;
	}
	let { giver, givers, keepFrom, today, onSaved, onCancel }: Props = $props();

	const t = useI18n().t;
	const removals = useRemovals();
	let recipient = $state('');
	let visibility = $state<'shared' | 'private' | typeof SURPRISE>('shared');
	const recipientIsMember = $derived(keepFrom.includes(recipient));
	// A gift for a member is a surprise unless said otherwise, as with every giver's gift (D4).
	function chose(next: string) {
		recipient = next;
		if (keepFrom.includes(next) && visibility === 'shared') visibility = SURPRISE;
		if (!keepFrom.includes(next) && visibility === SURPRISE) visibility = 'shared';
	}
</script>

<form
	method="POST"
	action="?/addGiftBy"
	use:enhance={savedEnhance(removals, t('components.saved'), onSaved)}
	class="flex flex-col gap-3"
	data-testid="gift-gives-form"
>
	<h3 class="text-sm font-semibold text-fg">{t('gifts.gives.add', { name: giver.name })}</h3>
	<input type="hidden" name="state" value="idea" />

	<label class="flex flex-col gap-1">
		<span class="text-xs font-medium text-fg-muted">{t('gifts.form.what')}</span>
		<input
			name="title"
			required
			placeholder={t('gifts.form.whatPlaceholder')}
			class="{INPUT} w-full"
		/>
	</label>

	<GiftGiverField
		name="for"
		label={t('gifts.gives.forWhom')}
		ties={givers.ties}
		household={givers.household}
		people={givers.people}
		recipientId={giver.id}
		withHousehold={false}
		required
		onchange={chose}
	/>

	<WhenPicker when={null} birth={null} {today} kinds={['on_date', 'later']} />

	<div class="flex flex-wrap items-center gap-4 text-sm">
		<fieldset class="flex flex-wrap items-center gap-4">
			<legend class="sr-only">{t('common.visibility')}</legend>
			<label class="flex items-center gap-1.5">
				<input type="radio" name="visibility" value="shared" bind:group={visibility} />
				{t('common.shared')}
			</label>
			{#if recipientIsMember}
				<label class="flex items-center gap-1.5">
					<input type="radio" name="visibility" value={SURPRISE} bind:group={visibility} />
					{t('gifts.surprise.choice', {
						name: givers.people.find((p) => p.id === recipient)?.displayName ?? ''
					})}
				</label>
			{/if}
			<label class="flex items-center gap-1.5">
				<input type="radio" name="visibility" value="private" bind:group={visibility} />
				{t('common.private')}
			</label>
		</fieldset>
		<span class="ml-auto flex gap-2">
			<Button variant="ghost" size="sm" type="button" onclick={onCancel}
				>{t('common.cancel')}</Button
			>
			<Button variant="primary" size="sm">{t('common.save')}</Button>
		</span>
	</div>
</form>
