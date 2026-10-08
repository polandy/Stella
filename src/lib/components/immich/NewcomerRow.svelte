<script lang="ts" module>
	import type { PersonContext } from '$lib/people/context';

	/** Someone in Stella the face might be, as the comparison step shows them. */
	export interface SimilarPersonView {
		contact: { id: string; displayName: string; avatarPhotoId: string | null };
		description: string | null;
		context: PersonContext | null;
		linkedFace: { name: string | null; faceUrl: string | null } | null;
	}

	/** One face of *New from Immich*. */
	export interface NewcomerView {
		personId: string;
		name: string;
		photoCount: number | null;
		faceUrl: string;
		openUrl: string;
		similar: SimilarPersonView[];
	}

	/** What a successful *This is the person* answers. */
	export interface Assigned {
		personId: string;
		contactId: string;
		name: string;
	}

	/** What a successful *Add and link* answers. */
	export interface Added extends Assigned {
		/** The face signed for the new person, when it is to become their photo. */
		faceUrl: string | null;
	}
</script>

<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import FormError from '$lib/components/ui/FormError.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import KnowThemBy from '$lib/components/people/KnowThemBy.svelte';
	import PersonSearchSelect from '$lib/components/people/PersonSearchSelect.svelte';
	import { newPersonFromImmichName } from '$lib/immich/newcomers';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { reveal } from '$lib/motion/motion.svelte';
	import { describeDistinction } from '$lib/people/namesakes';
	import { wantsSomethingToKnowThemBy } from '$lib/people/new-person';
	import type { SelectablePerson } from '$lib/people/select';

	/*
	 * One face of *New from Immich* (docs/02 §2.24.7) and the steps *Assign…* opens in place.
	 *
	 * **Compare** comes first whenever Stella has people of a similar name: the new face beside
	 * each one's own photo — their avatar, or the face they are linked to already — with their
	 * circle and a relationship as the lines under the name. Two people of one name are real, so
	 * nothing is decided for the member: *This is the person* links the face to them (asking
	 * first if that replaces a face they have), *No, add a new person* goes on to the form.
	 *
	 * **Create** is the form, prefilled from Immich's name (a kin word becomes the nickname, a
	 * trailing initial is dropped). Without a similar name it is where *Assign…* lands, and a
	 * quiet *Already in Stella? Find person* opens **Find**, a person search whose pick is linked.
	 *
	 * What happens after a link or an add — the row leaving, the toast, the photo — is the list's.
	 */
	interface Props {
		row: NewcomerView;
		/** The people the member may pick in *Find person*: the shell's. */
		people: SelectablePerson[];
		/** The row's *Ignore* form was submitted; the list holds it for the undo window. */
		onIgnore: (event: SubmitEvent) => void;
		onAssigned: (assigned: Assigned) => void;
		onAdded: (added: Added) => void;
	}
	let { row, people, onIgnore, onAssigned, onAdded }: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const shownCount = (count: number) => new Intl.NumberFormat(i18n.intlLocale).format(count);

	type Step = 'closed' | 'compare' | 'create' | 'find';
	let step = $state<Step>('closed');
	/** The person whose link to another face this one would replace, asked about before posting. */
	let confirmingReplace = $state<string | null>(null);
	let error = $state<string | null>(null);

	// The form starts from the name the row was rendered with; a row's name never changes.
	const prefill = untrack(() => newPersonFromImmichName(row.name));
	let firstName = $state(prefill.firstName);
	let lastName = $state(prefill.lastName);
	let nickname = $state(prefill.nickname);
	let description = $state('');
	let usePhoto = $state(true);
	let pickedIds = $state<string[]>([]);

	const askForSomethingToKnowThemBy = $derived(wantsSomethingToKnowThemBy({ firstName, lastName }));

	function open(next: Step) {
		error = null;
		confirmingReplace = null;
		step = next;
	}

	type Refusal = { newcomerError?: string; wouldReplace?: string | null };

	/** Shows a refusal in the row; a link that would replace one asks instead of failing. */
	function refused(data: Refusal | undefined) {
		error = data?.newcomerError ?? null;
		if (data?.wouldReplace) {
			confirmingReplace = data.wouldReplace;
			error = null;
		}
	}

	const assigning: SubmitFunction = () => {
		return async ({ result }) => {
			if (result.type === 'success' && result.data)
				onAssigned((result.data as { assigned: Assigned }).assigned);
			else if (result.type === 'failure') refused(result.data as Refusal | undefined);
		};
	};

	const adding: SubmitFunction = () => {
		return async ({ result }) => {
			if (result.type === 'success' && result.data)
				onAdded((result.data as { added: Added }).added);
			else if (result.type === 'failure') refused(result.data as Refusal | undefined);
		};
	};

	/** Their circle and their first relationship, as the namesake lines word them. */
	function contextLine(person: SimilarPersonView): string {
		const { context } = person;
		const parts = [
			context?.circle ? describeDistinction(t, { kind: 'circle', ...context.circle }) : null,
			context?.ties[0] ? describeDistinction(t, { kind: 'tie', tie: context.ties[0] }) : null
		];
		return parts.filter((part) => part !== null).join(' · ');
	}

	const fieldClass =
		'rounded-control border border-border-input bg-card px-3 py-2 text-sm text-fg outline-none focus:ring-2 focus:ring-primary';
</script>

<li
	class="flex flex-col gap-3 rounded-app bg-card p-3 shadow-card"
	data-testid="immich-newcomer"
	transition:reveal
>
	<div class="flex flex-wrap items-center gap-3">
		<img
			src={row.faceUrl}
			alt={t('immich.match.face', { name: row.name })}
			width="56"
			height="56"
			class="size-14 shrink-0 rounded-full bg-bg-sunken object-cover"
			loading="lazy"
		/>
		<div class="min-w-36 flex-1">
			<p class="truncate font-medium text-fg">{row.name}</p>
			<p class="truncate text-sm text-fg-muted">
				{row.photoCount === null
					? t('immich.row.label')
					: t('immich.row.photos', { count: row.photoCount, shown: shownCount(row.photoCount) })}
			</p>
		</div>
		{#if step === 'closed'}
			<div class="ml-auto flex shrink-0 gap-1">
				<Button
					variant="primary"
					size="sm"
					type="button"
					label={t('immich.new.assignLabel', { name: row.name })}
					onclick={() => open(row.similar.length > 0 ? 'compare' : 'create')}
				>
					{t('immich.new.assign')}
				</Button>
				<form method="POST" action="?/ignoreNewcomer" onsubmit={onIgnore}>
					<input type="hidden" name="immichPersonId" value={row.personId} />
					<Button variant="ghost" size="sm" label={t('immich.new.ignoreLabel', { name: row.name })}>
						{t('immich.match.ignore')}
					</Button>
				</form>
			</div>
		{/if}
	</div>

	{#if step === 'compare'}
		<div class="flex flex-col gap-2 border-t border-border-subtle pt-3" transition:reveal>
			<h3 class="text-sm font-medium text-fg-muted">
				{row.similar.length === 1 ? t('immich.new.compareOne') : t('immich.new.compareMany')}
			</h3>
			<ul class="flex flex-col gap-2">
				{#each row.similar as person (person.contact.id)}
					{@const line = contextLine(person)}
					<li
						class="flex flex-wrap items-center gap-3 rounded-app border border-border p-2.5"
						data-testid="immich-similar"
					>
						<!-- Face beside face: the new one from Immich, then theirs. -->
						<div class="flex shrink-0 items-center gap-1.5">
							<img
								src={row.faceUrl}
								alt=""
								width="64"
								height="64"
								class="size-16 rounded-full bg-bg-sunken object-cover"
							/>
							{#if !person.contact.avatarPhotoId && person.linkedFace?.faceUrl}
								<img
									src={person.linkedFace.faceUrl}
									alt={t('immich.new.theirPhoto', { name: person.contact.displayName })}
									width="64"
									height="64"
									class="size-16 rounded-full bg-bg-sunken object-cover"
								/>
							{:else}
								<Avatar
									id={person.contact.id}
									name={person.contact.displayName}
									avatarPhotoId={person.contact.avatarPhotoId}
									size={64}
								/>
							{/if}
						</div>
						<div class="min-w-36 flex-1">
							<a
								href="/contacts/{person.contact.id}"
								class="block truncate font-medium text-fg hover:underline"
							>
								{person.contact.displayName}
							</a>
							{#if person.description}<p class="text-sm text-fg-muted">{person.description}</p>{/if}
							{#if line}<p class="text-sm text-fg-muted">{line}</p>{/if}
							{#if person.linkedFace}
								<p
									class="mt-1 w-fit rounded-control bg-warning-soft px-1.5 py-0.5 text-xs font-medium text-fg"
								>
									{person.linkedFace.name
										? t('immich.new.linkedTo', { name: person.linkedFace.name })
										: t('immich.new.linkedToUnnamed')}
								</p>
							{/if}
						</div>
						<form
							method="POST"
							action="?/assignNewcomer"
							use:enhance={assigning}
							class="ml-auto flex shrink-0 flex-wrap justify-end gap-1"
						>
							<input type="hidden" name="immichPersonId" value={row.personId} />
							<input type="hidden" name="contactId" value={person.contact.id} />
							{#if confirmingReplace === person.contact.id}
								<p class="basis-full text-sm text-fg" role="status">
									{t('immich.new.replaceQuestion', { name: person.contact.displayName })}
								</p>
								<input type="hidden" name="replace" value="1" />
								<Button
									variant="ghost"
									size="sm"
									type="button"
									onclick={() => (confirmingReplace = null)}
								>
									{t('common.cancel')}
								</Button>
								<Button variant="primary" size="sm">{t('immich.new.replace')}</Button>
							{:else if person.linkedFace}
								<Button
									variant="secondary"
									size="sm"
									type="button"
									label={t('immich.new.thisIsThemLabel', {
										immichName: row.name,
										name: person.contact.displayName
									})}
									onclick={() => (confirmingReplace = person.contact.id)}
								>
									{t('immich.new.thisIsThem')}
								</Button>
							{:else}
								<Button
									variant="secondary"
									size="sm"
									label={t('immich.new.thisIsThemLabel', {
										immichName: row.name,
										name: person.contact.displayName
									})}
								>
									{t('immich.new.thisIsThem')}
								</Button>
							{/if}
						</form>
					</li>
				{/each}
			</ul>
			{@render openInImmich()}
			<FormError message={error} variant="inline" />
			<div class="flex flex-wrap justify-end gap-1">
				<Button variant="ghost" size="sm" type="button" onclick={() => open('closed')}
					>{t('common.cancel')}</Button
				>
				<Button variant="primary" size="sm" type="button" onclick={() => open('create')}
					>{t('immich.new.createInstead')}</Button
				>
			</div>
		</div>
	{:else if step === 'create'}
		<form
			method="POST"
			action="?/addNewcomer"
			use:enhance={adding}
			class="grid grid-cols-1 gap-3 border-t border-border-subtle pt-3 sm:grid-cols-2"
			transition:reveal
		>
			<input type="hidden" name="immichPersonId" value={row.personId} />
			<label class="flex flex-col gap-1 text-sm text-fg-muted">
				{t('contacts.new.firstName')}
				<!-- svelte-ignore a11y_autofocus -- the form opened on the member's own tap, to be checked -->
				<input
					name="firstName"
					bind:value={firstName}
					required
					autocomplete="off"
					autofocus
					class={fieldClass}
				/>
			</label>
			<label class="flex flex-col gap-1 text-sm text-fg-muted">
				{t('contacts.new.lastName')}
				<input
					name="lastName"
					bind:value={lastName}
					autocomplete="off"
					placeholder={t('common.optional')}
					class={fieldClass}
				/>
			</label>
			<label class="flex flex-col gap-1 text-sm text-fg-muted sm:col-span-2">
				{t('contacts.new.nickname')}
				<input
					name="nickname"
					bind:value={nickname}
					autocomplete="off"
					placeholder={t('common.optional')}
					class={fieldClass}
				/>
			</label>
			{#if prefill.nickname && nickname === prefill.nickname}
				<p class="text-xs text-fg-subtle sm:col-span-2">
					{t('immich.new.kinHint', { nickname: prefill.nickname })}
				</p>
			{/if}
			{#if askForSomethingToKnowThemBy}
				<div class="sm:col-span-2">
					<KnowThemBy
						{firstName}
						name="description"
						label={t('contacts.new.description')}
						bind:value={description}
						inputClass={fieldClass}
					/>
				</div>
			{/if}
			<label class="flex items-center gap-2 text-sm text-fg sm:col-span-2">
				<input
					type="checkbox"
					name="usePhoto"
					value="1"
					bind:checked={usePhoto}
					class="size-4 accent-primary"
				/>
				{t('immich.new.usePhoto')}
			</label>
			<FormError message={error} variant="inline" />
			<div class="flex flex-wrap items-center justify-end gap-1 sm:col-span-2">
				{#if row.similar.length > 0}
					<Button variant="ghost" size="sm" type="button" onclick={() => open('compare')}
						>{t('immich.new.back')}</Button
					>
				{:else}
					<span class="mr-auto flex flex-wrap items-center gap-x-4 gap-y-1">
						<button
							type="button"
							class="text-sm text-link hover:underline"
							onclick={() => open('find')}
						>
							{t('immich.new.findInStella')}
						</button>
						{@render openInImmich()}
					</span>
				{/if}
				<Button variant="ghost" size="sm" type="button" onclick={() => open('closed')}
					>{t('common.cancel')}</Button
				>
				<Button variant="primary" size="sm">{t('immich.new.add')}</Button>
			</div>
		</form>
	{:else if step === 'find'}
		<form
			method="POST"
			action="?/assignNewcomer"
			use:enhance={assigning}
			class="flex flex-col gap-2 border-t border-border-subtle pt-3"
			transition:reveal
		>
			<input type="hidden" name="immichPersonId" value={row.personId} />
			{#if confirmingReplace}<input type="hidden" name="replace" value="1" />{/if}
			<PersonSearchSelect
				{people}
				name="contactId"
				bind:selectedIds={pickedIds}
				required
				placeholder={t('immich.new.findPlaceholder')}
				onPick={() => (confirmingReplace = null)}
			/>
			{#if confirmingReplace}
				{@const picked = people.find((person) => person.id === confirmingReplace)}
				<p class="text-sm text-fg" role="status">
					{t('immich.new.replaceQuestion', { name: picked?.displayName ?? '' })}
				</p>
			{/if}
			<FormError message={error} variant="inline" />
			<div class="flex flex-wrap justify-end gap-1">
				<Button variant="ghost" size="sm" type="button" onclick={() => open('create')}
					>{t('common.cancel')}</Button
				>
				<Button variant="primary" size="sm" disabled={pickedIds.length === 0}>
					{confirmingReplace ? t('immich.new.replace') : t('immich.match.link')}
				</Button>
			</div>
		</form>
	{/if}
</li>

{#snippet openInImmich()}
	<a
		href={row.openUrl}
		target="_blank"
		rel="noopener noreferrer"
		class="flex w-fit items-center gap-1 text-sm text-link hover:underline"
	>
		{t('immich.new.openInImmich')}<Icon name="openElsewhere" size={12} />
	</a>
{/snippet}
