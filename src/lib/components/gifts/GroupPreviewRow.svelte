<script lang="ts">
	import Avatar from '#lib/components/ui/Avatar.svelte';
	import { INPUT } from '#lib/components/ui/inputs.js';
	import { dayLabel } from '#lib/dates/labels.js';
	import type { GroupFormRow, InsteadOffer, PreviewRow } from '#lib/gifts/group-form.js';
	import { useI18n } from '#lib/i18n/context.svelte.js';
	import { datesEditorPath } from '#lib/people/identity-card.js';
	import { whenPreview } from '#lib/when/labels.js';
	import type { When } from '#lib/when/when.js';

	/*
	 * One person on the form for several (docs/dev/02 §2.25.11): what the shared when comes to for
	 * them, and — on a grey row — how to help it: an age today, their birthday, or a when instead.
	 */
	interface Props {
		preview: PreviewRow;
		row: GroupFormRow;
		person: { id: string; displayName: string; avatarPhotoId: string | null };
		/** No birth date on record, so an age typed here may stand in for one (D5). */
		unknownBirth: boolean;
		onchange: (next: GroupFormRow) => void;
	}
	let { preview, row, person, unknownBirth, onchange }: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const grey = $derived(preview.problem !== null);
	const ageId = $props.id();
	const askAge = $derived(
		unknownBirth && (preview.fix?.kind === 'estimate' || row.age !== undefined)
	);

	function offerLabel(offer: InsteadOffer): string {
		if (offer.pick === 'now' || offer.when?.kind !== 'on_date')
			return t('gifts.several.instead.now');
		if (offer.pick === 'christmas')
			return t('gifts.several.instead.christmas', { year: offer.when.on.slice(0, 4) });
		return t('gifts.several.instead.birthday', { day: dayLabel(i18n, offer.when.on) });
	}
	const own = (when: When | null) => onchange({ ...row, own: when });
	function resetOwn() {
		const { own: _own, ...shared } = row;
		onchange(shared);
	}

	const CHIP =
		'rounded-full border border-border bg-bg px-2.5 py-0.5 text-xs text-fg-muted hover:bg-primary-soft';
</script>

<li
	class="flex items-start gap-3 py-2.5 {grey || !row.ticked ? 'text-fg-muted' : ''}"
	data-testid="group-row"
	data-person={person.id}
	data-chosen={preview.chosen}
>
	<span class={grey ? 'opacity-60' : ''}>
		<Avatar
			id={person.id}
			name={person.displayName}
			avatarPhotoId={person.avatarPhotoId}
			size={28}
		/>
	</span>
	<div class="flex min-w-0 flex-1 flex-col gap-1">
		<span class="text-sm font-medium {grey ? 'text-fg-muted' : 'text-fg'}"
			>{person.displayName}</span
		>
		<span class="text-xs text-fg-muted" data-testid="group-row-line"
			>{whenPreview(i18n, preview.outlook)}</span
		>
		{#if preview.estimate !== null && !grey}
			<span class="text-xs text-fg-muted" data-testid="group-row-estimate"
				>{t('gifts.several.estimated', { year: preview.estimate, name: person.displayName })}</span
			>
		{/if}
		{#if preview.own}
			<span class="flex items-center gap-2 text-xs">
				<span class="rounded-full bg-bg-sunken px-2 py-0.5 text-fg-muted"
					>{t('gifts.several.own')}</span
				>
				<button type="button" class="text-link hover:underline" onclick={resetOwn}
					>{t('gifts.several.reset')}</button
				>
			</span>
		{/if}
		{#if askAge}
			<span class="flex flex-wrap items-center gap-2 text-xs">
				<label for={ageId}>{t('gifts.several.ageToday')}</label>
				<input
					id={ageId}
					type="number"
					inputmode="numeric"
					min="0"
					max="120"
					value={row.age ?? ''}
					oninput={(e) => onchange({ ...row, age: e.currentTarget.value })}
					class="{INPUT} w-16 py-0.5"
					data-testid="group-row-age"
				/>
				<span>{t('gifts.several.or')}</span>
				<a href={datesEditorPath(person.id)} class="text-link hover:underline"
					>{t('gifts.several.enterBirthday')}</a
				>
			</span>
		{:else if preview.fix?.kind === 'birthYear'}
			<a href={datesEditorPath(person.id)} class="w-fit text-xs text-link hover:underline"
				>{t('gifts.several.enterBirthday')}</a
			>
		{:else if preview.fix?.kind === 'instead'}
			<span class="flex flex-wrap items-center gap-1.5 text-xs" data-testid="group-row-instead">
				<span>{t('gifts.several.insteadLabel')}</span>
				{#each preview.fix.offers as offer (offer.pick)}
					<button type="button" class={CHIP} onclick={() => own(offer.when)}
						>{offerLabel(offer)}</button
					>
				{/each}
			</span>
		{/if}
	</div>
	<!-- On the right, under the thumb (docs/dev/05 §5.1); a grey row cannot be ticked. -->
	<label class="tap-target flex shrink-0 cursor-pointer pt-0.5">
		<input
			type="checkbox"
			class="size-5"
			checked={preview.chosen}
			disabled={grey}
			aria-label={t('gifts.several.include', { name: person.displayName })}
			onchange={(e) => onchange({ ...row, ticked: e.currentTarget.checked })}
		/>
	</label>
</li>
