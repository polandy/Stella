<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { tick } from 'svelte';
	import { postArrange, postUndo } from '$lib/components/circle/arrange-post';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import {
		alsoIn,
		dragCarries,
		effectiveMode,
		pickKey,
		toastFor,
		togglePick,
		verdictFor,
		type ArrangeCardRef,
		type ArrangeMode,
		type ArrangePickRef,
		type ArrangeVerdict
	} from '$lib/circles/arrange';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';

	/*
	 * Arrange people (docs/02 §2.4.2, ADR-127): one card per circle — the circle itself and each
	 * sub-circle — holding the people directly in it. People move or copy between cards by
	 * dragging, or without dragging: tap people, pick *Move to…* or *Copy to…*, tap a card. Both
	 * routes end in the same checked post, and every change is made at once with an *Undo* toast.
	 */
	interface Member {
		contactId: string;
		displayName: string;
		avatarPhotoId: string | null;
		role: string | null;
	}
	interface Zone {
		circleId: string;
		name: string;
		path: string[];
		members: Member[];
	}
	let { pageId, zones }: { pageId: string; zones: Zone[] } = $props();

	const { t } = useI18n();
	const removals = useRemovals();

	let mode = $state<ArrangeMode>('move');
	let selection = $state<ArrangePickRef[]>([]);
	/** The mode a tap-through is waiting for a target for, or null. */
	let choosing = $state<ArrangeMode | null>(null);
	/** What is being dragged, once the browser has the drag (set after `dragstart` returns). */
	let dragging = $state<ArrangePickRef[] | null>(null);
	let over = $state<string | null>(null);
	let alt = $state(false);
	let busy = $state(false);
	/** What a drag carries, known from its first event: the events read this, never `dragging`. */
	let carried: ArrangePickRef[] = [];

	const cards = $derived<ArrangeCardRef[]>(
		zones.map((z) => ({
			circleId: z.circleId,
			name: z.name,
			contactIds: z.members.map((m) => m.contactId)
		}))
	);
	const selectedKeys = $derived(new Set(selection.map(pickKey)));
	const dragMode = $derived(effectiveMode(mode, alt));

	/** What a card offers right now: for the drag in flight, or for the tap-through, else none. */
	function offer(circleId: string): { verdict: ArrangeVerdict; mode: ArrangeMode } | null {
		if (dragging)
			return { verdict: verdictFor(cards, dragging, circleId, dragMode), mode: dragMode };
		if (choosing) {
			return { verdict: verdictFor(cards, selection, circleId, choosing), mode: choosing };
		}
		return null;
	}

	function reasonText(verdict: ArrangeVerdict & { ok: false }): string {
		return t(
			verdict.reason === 'alreadyAllHere'
				? 'circles.arrange.alreadyAllHere'
				: 'circles.arrange.alreadyHere'
		);
	}

	function say(text: string, takeBack?: () => void) {
		removals.notify(text, takeBack);
	}

	function takeBack(change: unknown) {
		void postUndo(pageId, change)
			.then(async (answer) => {
				if (!answer.ok) return say(answer.message ?? t('circles.arrange.undoFailed'));
				await invalidateAll();
				const left = answer.value.kept + answer.value.conflicts;
				say(
					left ? t('circles.arrange.undonePartly', { count: left }) : t('circles.arrange.undone')
				);
			})
			.catch((error: unknown) => {
				console.error('Could not take the arrangement back:', error);
				say(t('circles.arrange.undoFailed'));
			});
	}

	async function run(how: ArrangeMode, targetId: string, picks: readonly ArrangePickRef[]) {
		if (busy || !picks.length) return;
		busy = true;
		try {
			const answer = await postArrange(pageId, how, targetId, picks);
			if (!answer.ok) return say(answer.message ?? t('errors.form.checkAndRetry'));
			selection = [];
			choosing = null;
			await invalidateAll();
			const { value } = answer;
			const toast = toastFor(value);
			const target = value.targetName;
			let text: string;
			if (toast.kind === 'onlyRemoved') {
				text = t('circles.arrange.onlyRemoved', { count: toast.count, target });
			} else {
				text = t(toast.mode === 'copy' ? 'circles.arrange.copied' : 'circles.arrange.moved', {
					count: toast.count,
					target
				});
				if (toast.alreadyThere) {
					text += ` · ${t('circles.arrange.alreadyThere', { count: toast.alreadyThere })}`;
				}
			}
			say(text, () => takeBack(value.change));
			await focusUndo();
		} catch (error) {
			console.error('Could not arrange the people:', error);
			say(t('errors.form.checkAndRetry'));
		} finally {
			busy = false;
		}
	}

	function dragStart(event: DragEvent, pick: ArrangePickRef) {
		carried = dragCarries(selection, pick);
		event.dataTransfer?.setData('text/plain', carried.map(pickKey).join('\n'));
		if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copyMove';
		const taking = carried;
		// Changing the page inside `dragstart` makes Chromium abort the drag: let it begin first.
		setTimeout(() => (dragging = taking), 0);
	}

	function dragEnd() {
		carried = [];
		dragging = null;
		over = null;
		alt = false;
	}

	function dragOver(event: DragEvent, circleId: string) {
		if (!carried.length) return;
		alt = event.altKey;
		const how = effectiveMode(mode, event.altKey);
		if (!verdictFor(cards, carried, circleId, how).ok) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = how === 'copy' ? 'copy' : 'move';
		over = circleId;
	}

	function dragLeave(event: DragEvent, circleId: string) {
		const into = event.relatedTarget;
		if (
			over === circleId &&
			!(into instanceof Node && (event.currentTarget as Node).contains(into))
		) {
			over = null;
		}
	}

	function drop(event: DragEvent, circleId: string) {
		if (!carried.length) return;
		const how = effectiveMode(mode, event.altKey);
		if (!verdictFor(cards, carried, circleId, how).ok) return;
		event.preventDefault();
		const picks = carried;
		dragEnd();
		void run(how, circleId, picks);
	}

	/** Focus the first element matching `selector`; false when there is none. */
	function focusFirst(selector: string): boolean {
		const element = document.querySelector<HTMLElement>(selector);
		element?.focus();
		return !!element;
	}

	/*
	 * Focus follows the target step, after the DOM has changed (`tick`, never a timer): into the
	 * first card that can take the people, else to Cancel; back to the button that began the step
	 * (or, with that gone, the first selected person); and after a pick to the toast's Undo.
	 */
	async function choose(how: ArrangeMode) {
		choosing = how;
		await tick();
		if (!focusFirst('[data-testid="arrange-here"]')) focusFirst('[data-testid="arrange-cancel"]');
	}
	async function stopChoosing() {
		const was = choosing;
		if (!was) return;
		choosing = null;
		await tick();
		if (!focusFirst(`[data-testid="arrange-${was}-to"]`)) {
			focusFirst('[data-testid="arrange-person"] button[aria-pressed="true"]');
		}
	}
	async function focusUndo() {
		await tick();
		if (!focusFirst('[data-testid="toasts"] [data-testid="toast-undo"]:last-of-type button')) {
			focusFirst('[data-testid="arrange-person"] button');
		}
	}

	function clear() {
		selection = [];
		choosing = null;
	}

	const MODES: { mode: ArrangeMode; label: 'circles.arrange.move' | 'circles.arrange.copy' }[] = [
		{ mode: 'move', label: 'circles.arrange.move' },
		{ mode: 'copy', label: 'circles.arrange.copy' }
	];
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape' && choosing) void stopChoosing();
	}}
/>

<div class="flex flex-col gap-4" data-testid="arrange-board">
	<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
		<div
			role="group"
			aria-label={t('circles.arrange.modeLabel')}
			class="inline-flex rounded-full border border-border bg-card p-0.5"
		>
			{#each MODES as m (m.mode)}
				<button
					type="button"
					aria-pressed={mode === m.mode}
					data-testid="arrange-mode-{m.mode}"
					class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium text-fg-muted transition-colors hover:text-fg aria-pressed:bg-primary-soft aria-pressed:font-semibold aria-pressed:text-fg"
					onclick={() => (mode = m.mode)}
				>
					<Icon name={m.mode} size={14} />
					{t(m.label)}
				</button>
			{/each}
		</div>
		<p class="text-sm text-fg-muted">
			{t(mode === 'move' ? 'circles.arrange.hintMove' : 'circles.arrange.hintCopy')}
		</p>
	</div>

	<ul
		class="grid grid-cols-[repeat(auto-fill,minmax(min(240px,100%),1fr))] gap-3 pb-40"
		aria-label={t('circles.arrange.cards')}
	>
		{#each zones as zone, index (zone.circleId)}
			{@const shown = offer(zone.circleId)}
			{@const isOver = over === zone.circleId && !!dragging}
			{@const canDrop = !!shown && shown.verdict.ok}
			<li
				class="flex min-h-32 flex-col gap-2 rounded-app border bg-card p-3 transition-colors {isOver
					? 'border-primary bg-primary-soft'
					: dragging && canDrop
						? 'border-dashed border-primary'
						: 'border-border'}"
				data-testid="arrange-card"
				data-circle-id={zone.circleId}
				data-over={isOver || undefined}
				ondragover={(e) => dragOver(e, zone.circleId)}
				ondragleave={(e) => dragLeave(e, zone.circleId)}
				ondrop={(e) => drop(e, zone.circleId)}
			>
				<div class="flex items-start justify-between gap-2">
					<div class="min-w-0">
						<h2 class="truncate text-sm font-semibold text-fg">
							{index === 0 ? t('circles.arrange.direct', { name: zone.name }) : zone.name}
						</h2>
						<p class="truncate text-xs text-fg-muted">
							{index === 0 ? t('circles.arrange.itself') : zone.path.join(' › ')}
						</p>
					</div>
					<span
						class="shrink-0 rounded-full bg-bg-sunken px-2 py-0.5 text-xs text-fg-muted tabular-nums"
						data-testid="arrange-count"
					>
						{t('circles.arrange.count', { count: zone.members.length })}
					</span>
				</div>

				{#if shown}
					{#if shown.verdict.ok}
						{#if dragging}
							{#if isOver}
								<p
									class="flex items-center gap-1.5 rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-fg"
									data-testid="arrange-drop-banner"
								>
									<Icon name="dropHere" size={14} />
									{t(
										shown.mode === 'copy' ? 'circles.arrange.dropCopy' : 'circles.arrange.dropMove',
										{
											count: shown.verdict.count
										}
									)}
								</p>
							{/if}
						{:else}
							<Button
								size="sm"
								variant="primary"
								icon={shown.mode}
								data-testid="arrange-here"
								disabled={busy}
								onclick={() => run(shown.mode, zone.circleId, selection)}
							>
								{t(shown.mode === 'copy' ? 'circles.arrange.hereCopy' : 'circles.arrange.hereMove')}
							</Button>
						{/if}
					{:else}
						<p
							class="flex items-center gap-1.5 text-xs text-fg-subtle"
							data-testid="arrange-reason"
						>
							<Icon name="blocked" size={14} />
							{reasonText(shown.verdict)}
						</p>
					{/if}
				{/if}

				{#if zone.members.length}
					<ul class="flex flex-col gap-1.5">
						{#each zone.members as m (m.contactId)}
							{@const pick = { circleId: zone.circleId, contactId: m.contactId }}
							{@const selected = selectedKeys.has(pickKey(pick))}
							{@const also = alsoIn(cards, m.contactId, zone.circleId)}
							<li
								draggable="true"
								ondragstart={(e) => dragStart(e, pick)}
								ondragend={dragEnd}
								data-testid="arrange-person"
								data-contact-id={m.contactId}
							>
								<button
									type="button"
									aria-pressed={selected}
									class="flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors {selected
										? 'border-primary bg-primary text-primary-fg'
										: 'border-border-subtle bg-bg-sunken text-fg hover:border-border'}"
									onclick={() => (selection = togglePick(selection, pick))}
								>
									<Avatar
										id={m.contactId}
										name={m.displayName}
										avatarPhotoId={m.avatarPhotoId}
										size={28}
									/>
									<span class="min-w-0 flex-1">
										<span class="block truncate text-sm font-medium">{m.displayName}</span>
										{#if also.length}
											<span
												class="block truncate text-xs {selected ? 'opacity-80' : 'text-fg-muted'}"
											>
												{t('circles.arrange.alsoIn', { names: also.join(', ') })}
											</span>
										{/if}
									</span>
									{#if selected}<Icon name="done" size={16} />{/if}
								</button>
							</li>
						{/each}
					</ul>
				{:else}
					<p
						class="rounded-md border border-dashed border-border px-2 py-3 text-center text-xs text-fg-muted"
					>
						{t('circles.arrange.empty')}
					</p>
				{/if}
			</li>
		{/each}
	</ul>
</div>

{#if selection.length}
	<div
		class="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 flex justify-center px-4 md:bottom-[max(0.75rem,env(safe-area-inset-bottom))]"
		data-testid="arrange-bar"
	>
		<div
			class="pointer-events-auto flex w-full max-w-4xl flex-wrap items-center gap-2 rounded-app border border-border bg-card p-2.5 shadow-pop"
		>
			<strong class="px-1 text-sm text-fg tabular-nums" aria-live="polite">
				{t('circles.arrange.selected', { count: selection.length })}
			</strong>
			{#if choosing}
				<span class="text-sm text-fg-muted" data-testid="arrange-pick-prompt">
					{t(choosing === 'copy' ? 'circles.arrange.pickCopy' : 'circles.arrange.pickMove')}
				</span>
				<Button
					size="sm"
					class="ml-auto"
					data-testid="arrange-cancel"
					onclick={() => void stopChoosing()}
				>
					{t('circles.arrange.cancel')}
				</Button>
			{:else}
				<Button
					size="sm"
					icon="move"
					data-testid="arrange-move-to"
					onclick={() => void choose('move')}
				>
					{t('circles.arrange.moveTo')}
				</Button>
				<Button
					size="sm"
					icon="copy"
					data-testid="arrange-copy-to"
					onclick={() => void choose('copy')}
				>
					{t('circles.arrange.copyTo')}
				</Button>
				<Button size="sm" variant="ghost" class="ml-auto" onclick={clear}>
					{t('circles.arrange.clear')}
				</Button>
			{/if}
		</div>
	</div>
{/if}
