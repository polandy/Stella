<script lang="ts">
	import { untrack } from 'svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { useTranslate } from '#lib/i18n/context.svelte.js';
	import { createUnlockHint } from '#lib/privacy/unlock-hint.svelte.js';
	import { useVeil } from '#lib/privacy/veil.svelte.js';
	import { useRemovals } from '#lib/undo/context.svelte.js';

	/*
	 * The card on Home that offers device unlock (docs/dev/02 §2.10.1, docs/dev/design/screens/home.md).
	 * Whether it shows is `unlockHint` in `#lib/privacy/unlock-hint.js`; this only draws it and
	 * runs the same set-up call as Settings.
	 */
	let { userId, hasPrivateEntry }: { userId: string; hasPrivateEntry: boolean } = $props();

	const t = useTranslate();
	const veil = useVeil();
	const removals = useRemovals();
	const hint = createUnlockHint({
		userId: untrack(() => userId),
		device: veil.device,
		blurOn: () => veil.enabled,
		hasPrivateEntry: () => hasPrivateEntry
	});

	let phase = $state<'idle' | 'waiting' | 'failed' | 'done'>('idle');

	async function setUp() {
		phase = 'waiting';
		phase = (await veil.device.setUp()) ? 'done' : 'failed';
	}

	function later() {
		hint.later();
		removals.notify(t('privacy.hint.snoozed'));
	}

	function never() {
		hint.never();
		removals.notify(t('privacy.hint.dismissed'), () => hint.askAgain());
	}
</script>

{#if hint.show || phase === 'done'}
	<section
		class="flex gap-4 rounded-app bg-card p-5 shadow-card"
		aria-labelledby="unlock-hint-title"
		data-testid="unlock-hint"
	>
		<span
			class="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"
			aria-hidden="true"
		>
			<Icon name="private" size={18} />
		</span>
		<div class="flex min-w-0 flex-1 flex-col gap-3">
			{#if phase === 'done'}
				<p class="flex items-start gap-2 text-sm text-success-text" role="status">
					<Icon name="done" size={16} class="mt-0.5 shrink-0" />
					<span>{t('privacy.hint.done')}</span>
				</p>
				<div>
					<Button variant="ghost" onclick={() => (phase = 'idle')}
						>{t('privacy.hint.doneButton')}</Button
					>
				</div>
			{:else}
				<header>
					<p class="text-xs font-medium text-fg-muted">{t('privacy.hint.label')}</p>
					<h2 id="unlock-hint-title" class="text-lg font-semibold text-fg">
						{t('privacy.hint.title')}
					</h2>
					<p class="mt-1 text-sm text-fg-muted">{t('privacy.hint.body')}</p>
				</header>
				{#if phase === 'failed'}
					<p class="text-sm text-danger" role="alert">{t('privacy.hint.failed')}</p>
				{/if}
				<div class="flex flex-wrap items-center gap-2">
					<Button
						icon="deviceUnlock"
						disabled={phase === 'waiting'}
						onclick={setUp}
						class="max-sm:w-full"
						>{phase === 'waiting' ? t('privacy.hint.waiting') : t('privacy.unlock.setUp')}</Button
					>
					<Button variant="ghost" disabled={phase === 'waiting'} onclick={later}
						>{t('privacy.hint.later')}</Button
					>
					<Button variant="ghost" disabled={phase === 'waiting'} onclick={never}
						>{t('privacy.hint.never')}</Button
					>
				</div>
			{/if}
		</div>
	</section>
{/if}
