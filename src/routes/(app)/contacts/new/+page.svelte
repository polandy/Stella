<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import Button from '$lib/components/Button.svelte';
	import { keepable } from '$lib/pwa/keepable';
	import DateField from '$lib/components/DateField.svelte';
	import type { ActionData } from './$types';

	import Icon from '$lib/components/Icon.svelte';
	import KnowThemBy from '$lib/components/KnowThemBy.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { MessageKey } from '$lib/i18n/translate';
	import { wantsSomethingToKnowThemBy } from '$lib/people/new-person';
	import { GENDERS, type Gender } from '$lib/people/gender';
	import type { RankedCandidate } from '$lib/server/domain/contacts/suggestions';

	let { form }: { form: ActionData } = $props();

	const t = useTranslate();

	/*
	 * Duplicate & relative suggestions (docs/02 §2.2.1): once a surname is typed, the people
	 * who may already be this person — or a relative — appear under the name fields. Picking
	 * one as a relative sends the new person straight into the relationship editor.
	 */
	const REASON_LABEL: Record<RankedCandidate['reason'], MessageKey> = {
		'same-name': 'contacts.new.reason.sameName',
		'same-surname': 'contacts.new.reason.sameSurname',
		'similar-surname': 'contacts.new.reason.similarSurname'
	};
	const SUGGEST_DEBOUNCE_MS = 250;

	let firstName = $state('');
	let lastName = $state('');
	/** Held here so it survives the field moving into the nudge and back (docs/02 §2.2.3). */
	let description = $state('');
	const askForSomethingToKnowThemBy = $derived(wantsSomethingToKnowThemBy({ firstName, lastName }));
	let suggestions = $state<RankedCandidate[]>([]);
	let relateTo = $state<string | null>(null);
	// Optional, so a second tap on the chosen chip takes the choice back — a radio alone cannot.
	let gender = $state<Gender | null>(null);
	let timer: ReturnType<typeof setTimeout> | null = null;
	let requestSeq = 0;

	async function loadSuggestions() {
		const seq = ++requestSeq;
		if (lastName.trim().length === 0) {
			suggestions = [];
			return;
		}
		const params = new URLSearchParams({ firstName, lastName });
		const res = await fetch(`/contacts/suggest?${params}`);
		if (!res.ok || seq !== requestSeq) return; // a newer keystroke owns the list now
		suggestions = (await res.json()) as RankedCandidate[];
		if (relateTo !== null && !suggestions.some((s) => s.id === relateTo)) relateTo = null;
	}

	function onNameInput() {
		if (timer) clearTimeout(timer);
		timer = setTimeout(loadSuggestions, SUGGEST_DEBOUNCE_MS);
	}

	/*
	 * Saved through the outbox (docs/concepts/offline-capture.md §8 #10). Out of reach, the
	 * person is kept on this device and added once Stella answers again (docs/02 §2.18). Their
	 * page cannot open before then, so the form says so and stays here, empty, ready for the
	 * next one; they show on Home as not sent yet.
	 */
	let keptName = $state<string | null>(null);
	let formElement: HTMLFormElement | undefined = $state();
	const text = (data: FormData, name: string) => String(data.get(name) ?? '').trim() || null;
	const nameOf = (data: FormData) =>
		[text(data, 'firstName'), text(data, 'lastName')].filter(Boolean).join(' ') || text(data, 'nickname') || '';
	const personForm = keepable(
		{
			toCommand: (data, id) => {
				if (!nameOf(data)) return null;
				return {
					id,
					type: 'contact.add',
					payload: {
						firstName: text(data, 'firstName'),
						lastName: text(data, 'lastName'),
						nickname: text(data, 'nickname'),
						description: text(data, 'description'),
						howWeMet: text(data, 'howWeMet'),
						metPlace: text(data, 'metPlace'),
						birthDate: text(data, 'birthDate'),
						gender,
						visibility: data.get('visibility') === 'private' ? 'private' : 'shared'
					},
					issuedAt: Date.now()
				};
			},
			about: nameOf,
			errorKey: 'error',
			// Straight to the new person, into the relationship editor when a relative was picked.
			onApplied: async (result) => {
				const { contactId } = result as { contactId: string };
				const relate = relateTo ? `?relate=${encodeURIComponent(relateTo)}` : '';
				await goto(`/contacts/${contactId}${relate}`);
			},
			onKept: () => {
				keptName = firstName || lastName ? [firstName, lastName].filter(Boolean).join(' ') : null;
				firstName = '';
				lastName = '';
				description = '';
				suggestions = [];
				relateTo = null;
				gender = null;
				formElement?.reset();
			}
		},
		() =>
			async ({ update }) => {
				keptName = null;
				await update();
			}
	);

	const field = 'flex min-w-0 flex-col gap-1 text-sm';
	// `w-full min-w-0`: an input's intrinsic width (~20 characters) would otherwise push a
	// two-column row past the card's edge on a phone.
	const input = 'w-full min-w-0 rounded-md border border-border bg-bg px-3 py-2 text-fg';
</script>

<svelte:head><title>{t('contacts.new.title')}</title></svelte:head>

<main class="mx-auto flex w-full max-w-lg flex-col gap-6 px-6 py-10">
	<header>
		<h1 class="text-2xl font-semibold text-fg">{t('contacts.new.heading')}</h1>
		<p class="text-sm text-fg-muted">{t('contacts.new.intro')}</p>
	</header>

	<form method="POST" use:enhance={personForm} bind:this={formElement} class="flex flex-col gap-4 rounded-app bg-card p-6 shadow-card">
		{#if keptName !== null}
			<p class="flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm text-fg-muted" role="status">
				<Icon name="offline" size={14} />{t('contacts.new.kept', { name: keptName })}
			</p>
		{/if}
		{#if form?.error}
			<p class="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{form.error}</p>
		{/if}

		<div class="flex gap-3">
			<label class="{field} flex-1">
				<span class="text-fg-muted">{t('contacts.new.firstName')}</span>
				<input name="firstName" class={input} autocomplete="off" bind:value={firstName} oninput={onNameInput} />
			</label>
			<label class="{field} flex-1">
				<span class="text-fg-muted">{t('contacts.new.lastName')}</span>
				<input name="lastName" class={input} autocomplete="off" bind:value={lastName} oninput={onNameInput} onblur={loadSuggestions} />
			</label>
		</div>

		<!-- Under the names rather than in *More*: it decides how Stella names their relatives
		     from the first link on (docs/02 §2.2). -->
		<fieldset class={field}>
			<legend class="mb-1 text-fg-muted">
				{t('contact.gender')} <span class="text-fg-subtle">{t('contacts.new.genderHint')}</span>
			</legend>
			<div class="flex flex-wrap gap-1.5">
				{#each GENDERS as option (option)}
					<label>
						<input
							type="radio"
							name="gender"
							value={option}
							checked={gender === option}
							onclick={() => (gender = gender === option ? null : option)}
							class="peer sr-only"
						/>
						<span
							class="inline-block cursor-pointer rounded-full border border-border px-3 py-1 text-sm text-fg-muted transition-colors hover:border-primary hover:text-fg peer-checked:border-primary peer-checked:bg-primary-soft peer-checked:font-semibold peer-checked:text-fg peer-focus-visible:outline-2 peer-focus-visible:outline-primary"
						>
							{t(`contact.gender.${option}`)}
						</span>
					</label>
				{/each}
			</div>
		</fieldset>

		{#if suggestions.length > 0}
			<section class="flex flex-col gap-2 rounded-md border border-border-subtle bg-bg-sunken p-3" data-testid="name-suggestions" aria-live="polite">
				<h2 class="text-xs font-medium uppercase tracking-wide text-fg-subtle">{t('contacts.new.alreadyHere')}</h2>
				<ul class="flex flex-col gap-1.5">
					{#each suggestions as s (s.id)}
						<li class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
							<a href="/contacts/{s.id}" class="font-medium text-fg hover:underline">{s.displayName}</a>
							<span class="text-fg-muted">{t(REASON_LABEL[s.reason])}</span>
							<label class="ml-auto flex items-center gap-1.5 text-fg-muted">
								<input type="radio" name="relateTo" value={s.id} bind:group={relateTo} />
								{t('contacts.new.linkAsRelative')}
							</label>
						</li>
					{/each}
				</ul>
				{#if relateTo !== null}
					<p class="flex items-center gap-1.5 text-xs text-fg-muted">
						<Icon name="people" size={12} />{t('contacts.new.relativeHint')}
					</p>
				{/if}
			</section>
		{/if}

		{#if askForSomethingToKnowThemBy}
			<KnowThemBy
				{firstName}
				label={t('contacts.new.description')}
				name="description"
				bind:value={description}
				inputClass="w-full min-w-0 rounded-md border border-border bg-card px-3 py-2 text-fg"
			/>
		{:else}
			<label class={field}>
				<span class="text-fg-muted">
					{t('contacts.new.description')}
					<span class="text-fg-subtle">{t('contacts.new.descriptionHint')}</span>
				</span>
				<input name="description" class={input} bind:value={description} placeholder={t('contacts.new.descriptionPlaceholder')} />
			</label>
		{/if}

		<!-- Stacked on a phone: "How we met" wraps to two lines there and would drop its field
		     below its neighbour's. Side by side from `sm`, bottoms aligned for the same reason. -->
		<div class="grid gap-3 sm:grid-cols-2 sm:items-end">
			<label class={field}>
				<span class="text-fg-muted">{t('contacts.new.howWeMet')}</span>
				<input name="howWeMet" class={input} />
			</label>
			<label class={field}>
				<span class="text-fg-muted">{t('contacts.new.where')}</span>
				<input name="metPlace" class={input} placeholder={t('contacts.new.wherePlaceholder')} />
			</label>
		</div>

		<!-- Rarely needed at the moment of adding someone; kept, but out of the way. -->
		<details class="group rounded-md border border-border-subtle">
			<summary class="cursor-pointer list-none px-3 py-2 text-sm text-fg-muted [&::-webkit-details-marker]:hidden">
				<span class="inline-block transition-transform group-open:rotate-90" aria-hidden="true">›</span>
				{t('contacts.new.more')}
			</summary>
			<div class="flex flex-col gap-4 border-t border-border-subtle p-3">
				<label class={field}>
					<span class="text-fg-muted">{t('contacts.new.nickname')}</span>
					<input name="nickname" class={input} autocomplete="off" />
				</label>
				<div class={field}>
					<span class="text-fg-muted">{t('contacts.new.birthday')}</span>
					<DateField name="birthDate" label={t('contacts.new.birthday')} allowYearUnknown />
				</div>
			</div>
		</details>

		<fieldset class="flex items-center gap-4 text-sm">
			<span class="text-fg-muted">{t('contacts.new.visibility')}</span>
			<label class="flex items-center gap-1.5">
				<input type="radio" name="visibility" value="shared" checked />
				{t('common.shared')}
			</label>
			<label class="flex items-center gap-1.5">
				<input type="radio" name="visibility" value="private" />
				{t('common.private')}
			</label>
		</fieldset>

		<Button variant="primary" class="mt-2">{t('nav.addPerson')}</Button>
	</form>
</main>
