<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import type { ActionData } from './$types';

	import Icon from '$lib/components/Icon.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { MessageKey } from '$lib/i18n/translate';
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
	let suggestions = $state<RankedCandidate[]>([]);
	let relateTo = $state<string | null>(null);
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

	const field = 'flex flex-col gap-1 text-sm';
	const input = 'rounded-md border border-border bg-bg px-3 py-2 text-fg';
</script>

<svelte:head><title>{t('contacts.new.title')}</title></svelte:head>

<main class="mx-auto flex w-full max-w-lg flex-col gap-6 px-6 py-10">
	<header>
		<h1 class="text-2xl font-semibold text-fg">{t('contacts.new.heading')}</h1>
		<p class="text-sm text-fg-muted">{t('contacts.new.intro')}</p>
	</header>

	<form method="POST" class="flex flex-col gap-4 rounded-app bg-card p-6 shadow-card">
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

		<label class={field}>
			<span class="text-fg-muted">
				{t('contacts.new.description')}
				<span class="text-fg-subtle">{t('contacts.new.descriptionHint')}</span>
			</span>
			<input name="description" class={input} placeholder={t('contacts.new.descriptionPlaceholder')} />
		</label>

		<div class="flex gap-3">
			<label class="{field} flex-1">
				<span class="text-fg-muted">{t('contacts.new.howWeMet')}</span>
				<input name="howWeMet" class={input} />
			</label>
			<label class="{field} flex-1">
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
				<label class={field}>
					<span class="text-fg-muted">{t('contacts.new.birthday')}</span>
					<input type="date" name="birthDate" class={input} />
				</label>
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
