<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { browserClipboard, copyText, selectText } from '$lib/ui/clipboard';
	import { useRemovals } from '$lib/undo/context.svelte';
	import type { ActionData, PageData } from './$types';

	/*
	 * A member's calendar link (docs/02 §2.13.4). A new link is shown once, on the answer to the
	 * form that made it, with how to add it on each kind of phone; until *Done* it stands in for
	 * the link's row, which afterwards says only when it was made and last fetched. Replacing and revoking each pass a confirm step, since a calendar
	 * that silently stopped updating is noticed only when a birthday goes unremarked.
	 */
	let { data, form }: { data: PageData; form: ActionData } = $props();
	const i18n = useI18n();
	const t = i18n.t;
	const removals = useRemovals();

	const day = (at: number) =>
		new Date(at).toLocaleDateString(i18n.intlLocale, { dateStyle: 'medium' });

	const APPS = ['google', 'ios', 'other'] as const;
	type App = (typeof APPS)[number];
	const STEPS = [1, 2, 3] as const;

	let app = $state<App>('google');
	let copied = $state<'no' | 'yes' | 'failed'>('no');
	let linkText = $state<HTMLElement>();
	let dismissed = $state(false);
	/** The one confirm step that is open. */
	let confirming = $state<'replace' | 'revoke' | null>(null);

	const created = $derived(
		!dismissed && form && 'created' in form && form.created ? form.created : null
	);

	async function copy(link: string) {
		copied = (await copyText(link, browserClipboard())) ? 'yes' : 'failed';
		if (copied === 'failed' && linkText) selectText(linkText);
	}

	const reset = () => {
		copied = 'no';
		dismissed = false;
		confirming = null;
		app = 'google';
	};
</script>

<svelte:head
	><title>{t('common.pageTitle', { page: t('settings.calendar.title') })}</title></svelte:head
>

<main class="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
	<header class="flex flex-col gap-1">
		<a href="/settings" class="flex items-center gap-1 text-sm text-link hover:underline">
			<Icon name="forward" size={12} />{t('nav.settings')}
		</a>
		<h1 class="text-2xl font-semibold text-fg">{t('settings.calendar.title')}</h1>
		<p class="text-fg-muted">{t('settings.calendar.intro')}</p>
	</header>

	{#if created}
		<section
			data-testid="new-calendar-link"
			class="flex flex-col gap-3 rounded-app border border-primary bg-primary-soft p-4"
		>
			<h2 class="font-medium text-fg">{t('settings.calendar.createdHeading')}</h2>
			<p class="text-sm text-fg-muted">{t('settings.calendar.createdHint')}</p>
			<div class="flex flex-wrap items-center gap-2">
				<code
					bind:this={linkText}
					class="min-w-0 flex-1 rounded-control bg-bg px-3 py-2 text-sm break-all text-fg"
					>{created}</code
				>
				<Button type="button" size="sm" onclick={() => copy(created)}>
					{t(
						copied === 'yes'
							? 'settings.calendar.copied'
							: copied === 'failed'
								? 'settings.calendar.copyFailed'
								: 'settings.calendar.copy'
					)}
				</Button>
			</div>
			<div class="flex flex-col gap-2">
				<span class="text-sm font-medium text-fg-muted" id="calendar-apps"
					>{t('settings.calendar.addTo')}</span
				>
				<div class="flex flex-wrap gap-1.5" role="group" aria-labelledby="calendar-apps">
					{#each APPS as id (id)}
						<button
							type="button"
							aria-pressed={app === id}
							onclick={() => (app = id)}
							class="min-h-11 rounded-full border border-border-input bg-bg px-3 text-sm text-fg aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-fg"
						>
							{t(`settings.calendar.app.${id}`)}
						</button>
					{/each}
				</div>
				<ol
					class="flex list-decimal flex-col gap-1 pl-5 text-sm text-fg"
					data-testid="calendar-steps"
				>
					{#each STEPS as step (step)}
						<li>{t(`settings.calendar.steps.${app}.${step}`)}</li>
					{/each}
				</ol>
			</div>
			<div>
				<Button type="button" variant="secondary" size="sm" onclick={() => (dismissed = true)}>
					{t('settings.calendar.done')}
				</Button>
			</div>
		</section>
	{/if}

	{#if data.link === null}
		<section class="flex flex-col gap-3 rounded-app bg-card p-4 shadow-card">
			<p class="text-sm text-fg-muted">
				{t('settings.calendar.what', {
					toggle: t('contact.showOnHome'),
					comingUp: t('home.comingUp')
				})}
			</p>
			<form
				method="POST"
				action="?/create"
				use:enhance={() => {
					reset();
					return ({ update }) => update();
				}}
			>
				<Button type="submit">{t('settings.calendar.create')}</Button>
			</form>
		</section>
	{:else if !created}
		<section class="flex flex-col gap-3">
			<h2 class="text-sm font-medium text-fg-muted">{t('settings.calendar.yours')}</h2>
			<div
				class="flex flex-col gap-3 rounded-app bg-card p-4 shadow-card"
				data-testid="calendar-link"
			>
				<div class="flex items-start gap-3 text-sm">
					<span class="mt-0.5 text-fg-subtle" aria-hidden="true"
						><Icon name="calendar" size={16} /></span
					>
					<span class="flex flex-col gap-0.5">
						<span class="font-medium text-fg">{t('settings.calendar.link')}</span>
						<span class="text-fg-subtle">
							{t('settings.calendar.created', { date: day(data.link.createdAt) })}
							·
							{data.link.lastUsedAt === null
								? t('settings.calendar.notFetched')
								: t('settings.calendar.lastFetched', { date: day(data.link.lastUsedAt) })}
						</span>
					</span>
				</div>

				{#if confirming === null}
					<div class="flex flex-wrap gap-2">
						<Button
							type="button"
							variant="secondary"
							size="sm"
							aria-expanded="false"
							onclick={() => (confirming = 'replace')}>{t('settings.calendar.replace')}</Button
						>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							aria-expanded="false"
							onclick={() => (confirming = 'revoke')}>{t('settings.calendar.revoke')}</Button
						>
					</div>
					<p class="text-sm text-fg-subtle">{t('settings.calendar.lost')}</p>
				{:else}
					{@const replace = confirming === 'replace'}
					<form
						method="POST"
						action={replace ? '?/create' : '?/revoke'}
						data-testid="calendar-confirm"
						class="flex flex-col gap-2.5 rounded-control bg-bg-sunken p-3"
						use:enhance={() => {
							const revoking = !replace;
							return async ({ result, update }) => {
								reset();
								await update();
								if (revoking && result.type === 'success') {
									removals.notify(t('settings.calendar.revoked'));
								}
							};
						}}
					>
						<strong class="text-sm text-fg"
							>{replace
								? t('settings.calendar.confirmReplace.heading')
								: t('settings.calendar.confirmRevoke.heading')}</strong
						>
						<p class="text-sm text-fg-muted">
							{replace
								? t('settings.calendar.confirmReplace.body')
								: t('settings.calendar.confirmRevoke.body')}
						</p>
						<div class="flex flex-wrap gap-2">
							<Button type="submit" size="sm" variant={replace ? 'primary' : 'danger'}>
								{replace
									? t('settings.calendar.confirmReplace.submit')
									: t('settings.calendar.confirmRevoke.submit')}
							</Button>
							<!-- svelte-ignore a11y_autofocus -->
							<Button
								type="button"
								variant="secondary"
								size="sm"
								autofocus
								onclick={() => (confirming = null)}>{t('settings.calendar.keep')}</Button
							>
						</div>
					</form>
				{/if}
			</div>
		</section>
	{/if}
</main>
