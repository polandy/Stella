<script lang="ts">
	import type { Snippet } from 'svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { outbox } from '$lib/pwa/outbox.svelte';
	import Button from './Button.svelte';

	/*
	 * Signing out (docs/02 §2.18, docs/concepts/offline-capture.md §4.6). A plain form post, as
	 * before — but when moments written out of reach are still waiting on this device, it asks
	 * first: keep them for the next sign-in, or throw them away. Signing out empties the page
	 * cache; it must never take the only copy of what somebody wrote along with it unasked.
	 */

	interface Props {
		class?: string;
		/** The sign-out button itself. */
		children: Snippet;
	}
	let { class: className = '', children }: Props = $props();

	const t = useTranslate();
	let asking = $state(false);
	let form: HTMLFormElement | undefined = $state();

	function onSubmit(event: SubmitEvent) {
		if (asking || outbox.mine.length === 0) return;
		event.preventDefault();
		asking = true;
	}

	async function discardAndSignOut() {
		await outbox.discardMine();
		form?.submit();
	}
</script>

<form bind:this={form} method="POST" action="/logout" class={className} onsubmit={onSubmit}>
	{@render children()}
</form>
{#if asking}
	<div role="alertdialog" aria-labelledby="sign-out-unsent" class="mt-2 flex flex-col gap-2 rounded-app border border-dashed border-border bg-card p-3 text-sm">
		<p id="sign-out-unsent" class="text-fg">{t('signOut.unsent', { count: outbox.mine.length })}</p>
		<div class="flex flex-wrap gap-1.5">
			<Button variant="primary" size="sm" onclick={() => form?.submit()}>{t('signOut.keep')}</Button>
			<Button variant="danger" size="sm" onclick={discardAndSignOut}>{t('signOut.discard')}</Button>
			<Button variant="ghost" size="sm" onclick={() => (asking = false)}>{t('common.cancel')}</Button>
		</div>
	</div>
{/if}
