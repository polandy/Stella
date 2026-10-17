<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { IconName } from '$lib/components/ui/icons';
	import { dayLabel } from '$lib/dates/labels';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { reveal } from '$lib/motion/motion.svelte';
	import { useVeil } from '$lib/privacy/veil.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';

	/*
	 * Settings · Privacy (docs/02 §2.10.1): *Blur my private entries*, the member's own and on
	 * by default, and below it — only while it is on — this device's unlock in its three states.
	 * The switch is a form so it works before the page has loaded; device unlock is this
	 * browser's alone, so it never reaches the server.
	 */
	let { blurPrivate }: { blurPrivate: boolean } = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const veil = useVeil();
	const removals = useRemovals();
	const device = veil.device;

	// Follows the stored choice; flipped at once on a tap so the switch never lags the finger.
	let on = $state(untrack(() => blurPrivate));
	$effect(() => {
		on = blurPrivate;
	});
	let blurForm = $state<HTMLFormElement>();

	let busy = $state(false);
	async function setUp() {
		busy = true;
		const done = await device.setUp();
		busy = false;
		removals.notify(t(done ? 'privacy.unlock.setUpDone' : 'privacy.unlock.setUpFailed'));
	}

	let forgetting = $state(false);
	let forgetBox = $state<HTMLDivElement>();
	// The step's focus starts on the way out, so a second Enter forgets nothing.
	$effect(() => {
		if (!forgetBox) return;
		void tick().then(() => forgetBox?.querySelector<HTMLElement>('[data-keep]')?.focus());
	});
	function forget() {
		device.forget();
		forgetting = false;
		removals.notify(t('privacy.unlock.forgotten'));
	}
	function onForgetKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || event.defaultPrevented) return;
		event.preventDefault();
		forgetting = false;
	}

	const FORGET_LINES: { icon: IconName; key: Parameters<typeof t>[0] }[] = [
		{ icon: 'private', key: 'privacy.unlock.forgetStays' },
		{ icon: 'passkey', key: 'privacy.unlock.forgetPasskey' },
		{ icon: 'otherDevices', key: 'privacy.unlock.forgetOthers' }
	];
</script>

<section class="flex flex-col gap-3" data-testid="privacy-settings">
	<h2 class="text-sm font-medium text-fg-muted">{t('privacy.settings.heading')}</h2>
	<div class="flex flex-col gap-4 rounded-app bg-card p-4 shadow-card">
		<form
			bind:this={blurForm}
			method="POST"
			action="?/setBlur"
			class="flex items-start gap-4"
			use:enhance={() =>
				async ({ result, update }) => {
					if (result.type !== 'success') {
						on = blurPrivate;
						removals.notify(t('privacy.settings.blurFailed'));
						return;
					}
					await update({ reset: false });
					removals.notify(t(on ? 'privacy.settings.blurOn' : 'privacy.settings.blurOff'));
				}}
		>
			<label for="blur-private" class="min-w-0 flex-1">
				<span class="flex items-center gap-2 font-medium text-fg">
					<Icon name="private" size={15} />{t('privacy.settings.blur')}
				</span>
				<span class="mt-1 block text-sm text-fg-muted">{t('privacy.settings.blurHint')}</span>
			</label>
			<span class="group/blur relative mt-0.5 inline-flex shrink-0">
				<input
					id="blur-private"
					type="checkbox"
					role="switch"
					name="blur"
					class="peer absolute inset-0 z-10 cursor-pointer opacity-0"
					bind:checked={on}
					onchange={() => blurForm?.requestSubmit()}
				/>
				<span
					class="relative h-6 w-10 rounded-full bg-border transition-colors duration-(--motion-fade) ease-standard peer-checked:bg-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus-ring"
					aria-hidden="true"
					><span
						class="absolute top-0.5 left-0.5 size-5 rounded-full bg-card shadow-card transition-transform duration-(--motion-fade) ease-standard group-has-checked/blur:translate-x-4"
					></span></span
				>
			</span>
		</form>

		{#if on}
			<div class="flex flex-col gap-2 border-t border-border pt-4" data-testid="device-unlock">
				<p class="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-fg">
					<span class="inline-flex items-center gap-2"
						><Icon name="deviceUnlock" size={15} />{t('privacy.unlock.heading')}</span
					>
					{#if device.status === 'set-up'}
						<span class="inline-flex items-center gap-1 text-xs font-semibold text-success-text"
							><Icon name="done" size={12} />{t('privacy.unlock.setUpMark')}</span
						>
					{/if}
				</p>
				{#if device.status === 'set-up'}
					<p class="text-sm text-fg-muted">
						{t('privacy.unlock.since', { day: dayLabel(i18n, device.since ?? '') })}
					</p>
					{#if forgetting}
						<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
						<div
							bind:this={forgetBox}
							transition:reveal
							role="group"
							aria-label={t('privacy.unlock.forgetHeading')}
							onkeydown={onForgetKeydown}
							class="flex flex-col gap-2 rounded-app bg-bg-sunken p-3 text-sm"
							data-testid="forget-unlock"
						>
							<p class="font-semibold text-fg">{t('privacy.unlock.forgetHeading')}</p>
							{#each FORGET_LINES as line (line.icon)}
								<p class="flex items-start gap-2 text-fg-muted">
									<span class="mt-0.5 shrink-0" aria-hidden="true"
										><Icon name={line.icon} size={14} /></span
									>
									<span>{t(line.key)}</span>
								</p>
							{/each}
							<div class="mt-1 flex flex-wrap gap-2">
								<Button variant="danger" size="sm" onclick={forget}
									>{t('privacy.unlock.forgetConfirm')}</Button
								>
								<Button variant="ghost" size="sm" data-keep onclick={() => (forgetting = false)}
									>{t('privacy.unlock.keep')}</Button
								>
							</div>
						</div>
					{:else}
						<div>
							<Button variant="ghost" size="sm" onclick={() => (forgetting = true)}
								>{t('privacy.unlock.forget')}</Button
							>
						</div>
					{/if}
				{:else if device.status === 'none'}
					<p class="text-sm text-fg-muted">{t('privacy.unlock.none')}</p>
					<div>
						<Button icon="deviceUnlock" disabled={busy} onclick={setUp}
							>{t('privacy.unlock.setUp')}</Button
						>
					</div>
				{:else if device.status === 'unsupported'}
					<p class="text-sm text-fg-muted">{t('privacy.unlock.unsupported')}</p>
				{:else}
					<p class="text-sm text-fg-subtle">{t('privacy.unlock.checking')}</p>
				{/if}
			</div>
		{/if}
	</div>
</section>
