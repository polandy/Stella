<script lang="ts">
	/*
	 * The activity-indicator workbench (docs/05 §5.7). Development only — `+page.server.ts` answers
	 * 404 in a build — which is also why its copy is English in place and not in the message
	 * catalogues: nobody in a household can reach it, so there is nothing to translate.
	 */
	import Button from '$lib/components/Button.svelte';
	import Section from '$lib/components/Section.svelte';
	import { usePending } from '$lib/sync/context.svelte';
	import { whilePending } from '$lib/sync/pending';
	import { MIN_VISIBLE_MS, SHOW_AFTER_MS } from '$lib/sync/pending-work';

	const pending = usePending();

	/** Jobs this page has started and is still waiting for. */
	let running = $state(0);
	/** A job with no end, so the bar can be looked at for as long as it takes. */
	let holding = $state(false);

	const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

	async function job(ms: number): Promise<void> {
		running += 1;
		try {
			await whilePending(pending, () => wait(ms));
		} finally {
			running -= 1;
		}
	}

	/** Two jobs that overlap, to show the bar is counted and not a flag. */
	async function overlapping(): Promise<void> {
		void job(2000);
		await wait(1000);
		void job(2000);
	}

	function toggleHold(): void {
		if (holding) {
			holding = false;
			pending.end();
			return;
		}
		holding = true;
		pending.begin();
	}

	// Leaving the page while holding would leave the count standing for the rest of the session.
	$effect(() => () => {
		if (holding) pending.end();
	});

	const DURATIONS = [100, 200, 400, 1000, 3000];
</script>

<svelte:head><title>Debug · activity indicator</title></svelte:head>

<main class="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
	<header class="flex flex-col gap-1">
		<h1 class="text-xl font-semibold">Activity indicator</h1>
		<p class="text-sm text-fg-muted">
			The pill fades in under the top edge of the window. Work shorter than {SHOW_AFTER_MS}ms is
			never shown; once the pill is up it stays at least {MIN_VISIBLE_MS}ms.
		</p>
	</header>

	<Section title="Run a job">
		<div class="flex flex-col gap-4">
			<div class="flex flex-wrap gap-2">
				{#each DURATIONS as ms (ms)}
					<Button type="button" onclick={() => void job(ms)}>
						{ms} ms
					</Button>
				{/each}
			</div>
			<div class="flex flex-wrap gap-2">
				<Button type="button" variant="ghost" onclick={() => void overlapping()}>
					Two overlapping (2 s, second starts after 1 s)
				</Button>
				<Button type="button" variant={holding ? 'danger' : 'ghost'} onclick={toggleHold}>
					{holding ? 'Stop the held job' : 'Hold a job open'}
				</Button>
			</div>
		</div>
	</Section>

	<Section title="State">
		<dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
			<dt class="text-fg-muted">Jobs running</dt>
			<dd class="tabular-nums">{running + (holding ? 1 : 0)}</dd>
			<dt class="text-fg-muted">Pill showing</dt>
			<dd>{pending.busy ? 'yes' : 'no'}</dd>
			<dt class="text-fg-muted">Shown after</dt>
			<dd class="tabular-nums">{SHOW_AFTER_MS} ms</dd>
			<dt class="text-fg-muted">Minimum on screen</dt>
			<dd class="tabular-nums">{MIN_VISIBLE_MS} ms</dd>
		</dl>
	</Section>

	<p class="text-sm text-fg-subtle">
		To see it on real work, throttle the network in the browser's dev tools and then add,
		correct or remove a relationship — a local save takes 30–90 ms and stays under the delay on
		purpose.
	</p>
</main>
