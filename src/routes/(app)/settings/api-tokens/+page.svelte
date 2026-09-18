<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import Button from '$lib/components/Button.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { ActionData, PageData } from './$types';

	/*
	 * A member's API tokens (docs/02 §2.16.1). A new token is shown once, on the answer to the
	 * form that made it, and never again: the server keeps only its hash.
	 */
	let { data, form }: { data: PageData; form: ActionData } = $props();
	const i18n = useI18n();
	const t = i18n.t;

	const INPUT =
		'rounded-control border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-fg-subtle';
	const DEFAULT_LIFETIME = 90;

	const day = (at: number) => new Date(at).toLocaleDateString(i18n.intlLocale, { dateStyle: 'medium' });

	/** The example request, against this very instance, so it can be pasted as it stands. */
	const example = (token: string) =>
		`curl -H "Authorization: Bearer ${token}" "${page.url.origin}/api/v1/people?q=anna"`;

	let copied = $state(false);
	async function copy(token: string) {
		await navigator.clipboard.writeText(token);
		copied = true;
	}
</script>

<main class="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
	<header class="flex flex-col gap-1">
		<a href="/settings" class="flex items-center gap-1 text-sm text-link hover:underline">
			<Icon name="forward" size={12} />{t('nav.settings')}
		</a>
		<h1 class="text-2xl font-semibold text-fg">{t('settings.api.title')}</h1>
		<p class="text-fg-muted">{t('settings.apiTokens.intro')}</p>
	</header>

	{#if form && 'created' in form && form.created}
		<section
			data-testid="new-token"
			class="flex flex-col gap-3 rounded-app border border-primary bg-primary-soft p-4"
		>
			<h2 class="font-medium text-fg">{t('settings.apiTokens.createdHeading')}</h2>
			<p class="text-sm text-fg-muted">{t('settings.apiTokens.createdHint')}</p>
			<div class="flex flex-wrap items-center gap-2">
				<code class="min-w-0 flex-1 break-all rounded-control bg-bg px-3 py-2 text-sm text-fg">{form.created.token}</code>
				<Button type="button" size="sm" onclick={() => form?.created && copy(form.created.token)}>
					{copied ? t('settings.apiTokens.copied') : t('settings.apiTokens.copy')}
				</Button>
			</div>
			<p class="text-sm text-fg-muted">{t('settings.apiTokens.usage')}</p>
			<code class="break-all rounded-control bg-bg px-3 py-2 text-xs text-fg">{example(form.created.token)}</code>
		</section>
	{/if}

	<section class="flex flex-col gap-3">
		<h2 class="text-sm font-medium text-fg-muted">{t('settings.apiTokens.create')}</h2>
		<form
			method="POST"
			action="?/create"
			use:enhance={() => {
				copied = false;
				return ({ update }) => update();
			}}
			class="flex flex-col gap-3 rounded-app bg-card p-4 shadow-card"
		>
			<label class="flex flex-col gap-1 text-sm">
				<span class="font-medium text-fg">{t('settings.apiTokens.name')}</span>
				<input
					name="name"
					required
					maxlength="80"
					placeholder={t('settings.apiTokens.namePlaceholder')}
					class={INPUT}
				/>
			</label>
			<label class="flex flex-col gap-1 text-sm">
				<span class="font-medium text-fg">{t('settings.apiTokens.lifetime')}</span>
				<select name="lifetimeDays" class={INPUT}>
					{#each data.lifetimes as days (days)}
						<option value={days} selected={days === DEFAULT_LIFETIME}>
							{t('settings.apiTokens.days', { count: days })}
						</option>
					{/each}
				</select>
			</label>
			{#if form && 'error' in form && form.error}
				<p class="text-sm text-danger">{form.error}</p>
			{/if}
			<div><Button type="submit">{t('settings.apiTokens.submit')}</Button></div>
		</form>
	</section>

	<section class="flex flex-col gap-3">
		<h2 class="text-sm font-medium text-fg-muted">{t('settings.apiTokens.yours')}</h2>
		{#if form && 'revoked' in form && form.revoked}
			<p class="text-sm text-fg-muted">{form.revoked}</p>
		{/if}
		<div class="rounded-app bg-card p-4 shadow-card">
			{#if data.tokens.length === 0}
				<p class="text-sm text-fg-subtle">{t('settings.apiTokens.none')}</p>
			{:else}
				<ul data-testid="api-tokens" class="flex flex-col divide-y divide-border-subtle">
					{#each data.tokens as token (token.id)}
						<li class="flex items-center gap-3 py-2 text-sm">
							<span class="text-fg-subtle" aria-hidden="true"><Icon name="apiToken" size={16} /></span>
							<span class="min-w-0 flex-1">
								<span class="block font-medium text-fg">{token.name}</span>
								<span class="block text-fg-subtle">
									{token.expired
										? t('settings.apiTokens.expired', { date: day(token.expiresAt) })
										: t('settings.apiTokens.validUntil', { date: day(token.expiresAt) })}
									·
									{token.lastUsedAt === null
										? t('settings.apiTokens.neverUsed')
										: t('settings.apiTokens.lastUsed', { date: day(token.lastUsedAt) })}
								</span>
							</span>
							<form method="POST" action="?/revoke" use:enhance>
								<input type="hidden" name="tokenId" value={token.id} />
								<Button
									type="submit"
									variant="ghost"
									size="sm"
									aria-label={t('settings.apiTokens.revokeLabel', { name: token.name })}
								>
									{t('settings.apiTokens.revoke')}
								</Button>
							</form>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</section>
</main>
