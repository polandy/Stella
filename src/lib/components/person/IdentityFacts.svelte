<script module lang="ts">
	/** The facts edited in an editor that opens in their place. */
	export type EditedFact = 'dates' | 'address' | 'circles';
</script>

<script lang="ts">
	import { reveal } from '$lib/motion/motion.svelte';
	import { dayLabel } from '$lib/dates/labels';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { hasMessage } from '$lib/i18n/translate';
	import type { BirthdayFact, IdentityFact } from '$lib/people/identity-card';
	import { oneLine } from '$lib/people/home';
	import type { KeptOf } from '$lib/pwa/outbox';
	import AddressEditor from './AddressEditor.svelte';
	import CirclesFact from './CirclesFact.svelte';
	import DatesEditor from './DatesEditor.svelte';
	import FactCell from './FactCell.svelte';
	import FactSlot from './FactSlot.svelte';
	import JobFact from './JobFact.svelte';
	import LivesWith from './LivesWith.svelte';
	import type { PersonForm, PersonPageData } from './types';

	/*
	 * The facts one looks up on the identity card (docs/05 §5.5), only those the record holds,
	 * each edited in place. Which facts and slots show is decided in `identity-card.ts`; this
	 * only renders them.
	 */
	let {
		element = $bindable(),
		data,
		form,
		facts,
		editing,
		birthday,
		otherDates,
		addresses,
		homes,
		jobLine,
		circles,
		keptCircles,
		onOpen,
		onClose
	}: {
		/** The list itself, so the card can hand the cursor to a fact. */
		element?: HTMLElement;
		data: PersonPageData;
		form: PersonForm;
		facts: { name: IdentityFact; slot: boolean }[];
		editing: EditedFact | null;
		birthday: BirthdayFact;
		otherDates: {
			id: string;
			kind: string;
			label: string | null;
			date: string;
			years: number | null;
		}[];
		addresses: { id: string; line: string }[];
		/** Their homes as they read now, shared ones with who lives there (docs/02 §2.2). */
		homes: PersonPageData['homes'];
		jobLine: string | null;
		circles: PersonPageData['circles'];
		keptCircles: KeptOf<'circle.join'>[];
		onOpen: (fact: EditedFact) => void;
		onClose: () => void;
	} = $props();

	const i18n = useI18n();
	const t = i18n.t;

	// The addresses they share with others, read beside their own.
	const sharedHomes = $derived(homes.filter((home) => home.livesWith.length > 0));
	/** Where the dates' editor opens: in place of the first date the card states. */
	const firstDateFact = $derived(
		facts.find((f) => f.name === 'birthday' || f.name === 'dates')?.name
	);
	/** A stored date kind in the viewer's language. */
	const dateKindLabel = (kind: string): string => {
		const key = `contact.dateKind.${kind}`;
		return hasMessage(key) ? t(key) : kind;
	};
	const editDates = $derived({
		what: t('contact.facts.editDates'),
		open: () => onOpen('dates'),
		key: 'dates'
	});
</script>

<dl
	bind:this={element}
	class="grid grid-cols-2 gap-x-5 gap-y-3 @min-[36rem]/facts:grid-cols-4"
	data-testid="identity-facts"
>
	{#each facts as entry (entry.name)}
		{#if (entry.name === 'birthday' || entry.name === 'dates') && editing === 'dates'}
			{#if entry.name === firstDateFact}
				<div class="col-span-full" transition:reveal>
					<DatesEditor {data} {form} onclose={onClose} />
				</div>
			{/if}
		{:else if entry.name === 'birthday'}
			{#if entry.slot || !birthday}
				<FactSlot
					label={t('contact.facts.birthday')}
					icon="gift"
					name="birthday"
					open={() => onOpen('dates')}
					key="dates"
				/>
			{:else}
				{#snippet birthdayValue()}
					{#if birthday?.kind === 'day'}
						{dayLabel(i18n, birthday.date)}
						{#if birthday.age !== null}<span class="text-fg-subtle">
								· {t('contact.facts.age', { age: birthday.age })}</span
							>{/if}
					{:else if birthday?.kind === 'around'}
						{t('contact.around', { year: birthday.year })}
					{/if}
				{/snippet}
				<FactCell
					label={birthday.kind === 'day' ? t('contact.facts.birthday') : t('contact.facts.born')}
					icon="gift"
					name="birthday"
					value={birthdayValue}
					edit={editDates}
				/>
			{/if}
		{:else if entry.name === 'dates'}
			<!-- Every other date is its own fact, beside the birthday (docs/02 §2.13). -->
			{#each otherDates as date (date.id)}
				{#snippet dateValue()}
					{dayLabel(i18n, date.date)}
					{#if date.years !== null}<span class="text-fg-subtle">
							· {t('contact.facts.age', { age: date.years })}</span
						>{/if}
				{/snippet}
				<FactCell
					label={date.label ?? dateKindLabel(date.kind)}
					icon="calendar"
					name="date-{date.id}"
					value={dateValue}
					edit={editDates}
				/>
			{/each}
		{:else if entry.name === 'address'}
			{#if editing === 'address'}
				<div class="col-span-full" transition:reveal>
					<AddressEditor {data} {form} onclose={onClose} />
				</div>
			{:else if entry.slot}
				<FactSlot
					label={t('contact.fieldKind.address')}
					icon="home"
					name="address"
					open={() => onOpen('address')}
					key="address"
				/>
			{:else}
				{#snippet addressValue()}
					<!-- Lines broken inline rather than as blocks, so the pencil can follow the last. -->
					{#each addresses as address, i (address.id)}{#if i > 0}<br
							/>{/if}{address.line}{/each}{#each homes as home, i (home.id)}{#if i > 0 || addresses.length > 0}<br
							/>{/if}<span data-home={home.id}>{oneLine(home.value)}</span>{/each}
				{/snippet}
				{#snippet livesWith()}
					{#each sharedHomes as home (home.id)}
						<span class="block" data-lives-with={home.id}
							>{#if sharedHomes.length > 1}<span class="text-xs text-fg-muted"
									>{home.label ?? oneLine(home.value)}:
								</span>{/if}<LivesWith housemates={home.livesWith} /></span
						>
					{/each}
				{/snippet}
				<FactCell
					label={t('contact.fieldKind.address')}
					icon="home"
					name="address"
					value={addressValue}
					edit={{
						what: t('contact.facts.editAddress'),
						open: () => onOpen('address'),
						key: 'address'
					}}
					links={sharedHomes.length > 0 ? livesWith : undefined}
				/>
			{/if}
		{:else if entry.name === 'job'}
			<JobFact contact={data.contact} {form} {jobLine} slot={entry.slot} />
		{:else if entry.name === 'lastContact' && data.lastContactedAt}
			<!-- Follows the Activity card, so it is read here and never edited (C5). -->
			{#snippet lastContactValue()}
				<span data-testid="last-contacted">
					<time datetime={data.lastContactedAt}>{dayLabel(i18n, data.lastContactedAt ?? '')}</time>
				</span>
			{/snippet}
			<FactCell
				label={t('contact.lastContact')}
				icon="met"
				name="last-contact"
				value={lastContactValue}
			/>
		{:else if entry.name === 'circles'}
			<CirclesFact
				{data}
				{form}
				{circles}
				{keptCircles}
				slot={entry.slot}
				editing={editing === 'circles'}
				onOpen={() => onOpen('circles')}
				{onClose}
			/>
		{/if}
	{/each}
</dl>
