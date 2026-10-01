<script lang="ts">
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { MessageKey } from '$lib/i18n/translate';
	import type { WelcomeStep, WelcomeStepId } from '$lib/onboarding/welcome';
	import Icon from './Icon.svelte';
	import type { IconName } from './icons';

	/*
	 * The first-run card on Home (docs/02 §2.22.3, docs/05 §5.10). Which steps it offers and
	 * which are done is decided in `$lib/onboarding/welcome`; this only draws them. Each step is
	 * one link — the whole row, so a thumb on a phone cannot miss it — and a done step stays in
	 * its place, ticked, so the list does not shift under the reader.
	 */
	let { steps }: { steps: WelcomeStep[] } = $props();

	const t = useTranslate();

	const PRESENTATION: Record<WelcomeStepId, { icon: IconName; title: MessageKey; hint: MessageKey }> = {
		self: { icon: 'self', title: 'home.welcome.self.title', hint: 'home.welcome.self.hint' },
		import: { icon: 'import', title: 'home.welcome.import.title', hint: 'home.welcome.import.hint' },
		add: { icon: 'add', title: 'home.welcome.add.title', hint: 'home.welcome.add.hint' }
	};
</script>

<section class="flex flex-col gap-4 rounded-app bg-card p-5 shadow-card" aria-labelledby="welcome-title" data-testid="welcome-card">
	<header>
		<h2 id="welcome-title" class="text-lg font-semibold text-fg">{t('home.welcome.title')}</h2>
		<p class="text-sm text-fg-muted">{t('home.welcome.intro')}</p>
	</header>
	<ol class="flex flex-col gap-2" aria-label={t('home.welcome.label')}>
		{#each steps as step (step.id)}
			{@const shown = PRESENTATION[step.id]}
			<li>
				{#if step.done}
					<div class="flex items-center gap-3 rounded-app border border-border-subtle px-3 py-2.5" data-step={step.id} data-done="true">
						<span class="grid size-9 shrink-0 place-items-center rounded-full bg-success/15 text-success" aria-hidden="true">
							<Icon name="done" size={16} />
						</span>
						<span class="min-w-0 flex-1 text-fg-muted line-through">{t(shown.title)}</span>
						<span class="text-xs font-medium text-success">{t('home.welcome.done')}</span>
					</div>
				{:else}
					<a
						href={step.href}
						class="flex items-center gap-3 rounded-app border border-border px-3 py-2.5 transition-colors hover:border-primary hover:bg-card-hover"
						data-step={step.id}
					>
						<span class="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary" aria-hidden="true">
							<Icon name={shown.icon} size={16} />
						</span>
						<span class="min-w-0 flex-1">
							<span class="block font-medium text-fg">{t(shown.title)}</span>
							<span class="block text-sm text-fg-muted">{t(shown.hint)}</span>
						</span>
						<span class="text-fg-subtle" aria-hidden="true"><Icon name="forward" size={16} /></span>
					</a>
				{/if}
			</li>
		{/each}
	</ol>
</section>
