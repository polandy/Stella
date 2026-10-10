<script lang="ts">
	import { tick } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/Button.svelte';
	import FormError from '$lib/components/ui/FormError.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { IconName } from '$lib/components/ui/icons';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { scrollBehavior } from '$lib/motion/motion';
	import { reveal } from '$lib/motion/motion.svelte';

	/*
	 * The confirm step under a member's row (docs/02 §2.1): the person page's sunken box, not a
	 * modal. It says what the removal ends and what it keeps, and its focus starts on *Keep*, so a
	 * second Enter removes nobody. A member already gone (404) reads as done, like a removal.
	 */
	interface Preview {
		memberId: string;
		name: string;
		privateRecords: number;
		signsInWithSso: boolean;
		onlyAdminWithPassword: boolean;
	}
	let {
		preview,
		onkeep,
		onremoved
	}: { preview: Preview; onkeep: () => void; onremoved: () => void } = $props();

	const t = useTranslate();
	const name = $derived(preview.name);
	let error = $state<string | null>(null);

	const lines = $derived(
		[
			['signOut', t('settings.members.confirm.signOut', { name }), false],
			['shared', t('settings.members.confirm.shared', { name }), false],
			preview.privateRecords > 0 && [
				'private',
				t('settings.members.confirm.private', { name, count: preview.privateRecords }),
				false
			],
			preview.signsInWithSso && [
				'openElsewhere',
				t('settings.members.confirm.sso', { name }),
				false
			],
			preview.onlyAdminWithPassword && [
				'apiToken',
				t('settings.members.confirm.lastAdmin', { name }),
				true
			]
		].filter((line): line is [IconName, string, boolean] => Array.isArray(line))
	);

	let box = $state<HTMLDivElement>();
	$effect(() => {
		if (!box) return;
		void tick().then(() =>
			[...(box?.querySelectorAll<HTMLElement>('button') ?? [])].at(-1)?.focus()
		);
	});

	function onKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || event.defaultPrevented) return;
		event.preventDefault();
		onkeep();
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	bind:this={box}
	transition:reveal
	onintroend={() =>
		box?.scrollIntoView({
			block: 'nearest',
			behavior: scrollBehavior(prefersReducedMotion.current)
		})}
	role="group"
	aria-label={t('settings.members.confirm.heading', { name })}
	onkeydown={onKeydown}
	class="mb-3 flex flex-col gap-2 rounded-app bg-bg-sunken p-3 text-sm"
	data-testid="remove-member-confirm"
>
	<p class="font-semibold text-fg">{t('settings.members.confirm.heading', { name })}</p>
	{#each lines as [icon, text, alert] (icon)}
		<p class="flex items-start gap-2 {alert ? 'text-danger' : 'text-fg-muted'}">
			<span class="mt-0.5 shrink-0" aria-hidden="true"><Icon name={icon} size={14} /></span>
			<span>{text}</span>
		</p>
	{/each}
	<FormError message={error} variant="inline" size="xs" />
	<form
		method="POST"
		action="?/remove"
		class="mt-1 flex flex-wrap gap-2"
		use:enhance={() =>
			async ({ result, update }) => {
				if (result.type === 'success' || (result.type === 'failure' && result.status === 404)) {
					await update();
					onremoved();
					return;
				}
				if (result.type === 'failure' && typeof result.data?.error === 'string') {
					error = result.data.error;
					return;
				}
				await update();
			}}
	>
		<input type="hidden" name="memberId" value={preview.memberId} />
		<Button variant="danger" size="sm">{t('settings.members.confirm.submit', { name })}</Button>
		<Button variant="ghost" size="sm" type="button" onclick={onkeep}
			>{t('settings.members.confirm.keep', { name })}</Button
		>
	</form>
</div>
