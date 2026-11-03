<script lang="ts">
	import { reveal } from '$lib/motion/motion.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import KeptChip from '$lib/components/pwa/KeptChip.svelte';
	import { accentDotStyle } from '$lib/design/tokens';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { KeptOf } from '$lib/pwa/outbox';
	import CirclesEditor from './CirclesEditor.svelte';
	import type { PersonForm, PersonPageData } from './types';

	/*
	 * The identity card's circles: a chip for each, and one dashed "+" that opens the editor
	 * under the chips — joining, a role, leaving all happen there.
	 */
	let {
		data,
		form,
		circles,
		keptCircles,
		slot,
		editing,
		onOpen,
		onClose
	}: {
		data: PersonPageData;
		form: PersonForm;
		/** The memberships shown, without those on their way out. */
		circles: PersonPageData['circles'];
		/** Circles joined while Stella was out of reach, kept on the device (docs/02 §2.18). */
		keptCircles: KeptOf<'circle.join'>[];
		slot: boolean;
		editing: boolean;
		onOpen: () => void;
		onClose: () => void;
	} = $props();

	const t = useTranslate();
</script>

<div class="col-span-full flex min-w-0 flex-col gap-1" data-fact="circles">
	<dt class="flex items-center gap-1.5 text-xs text-fg-subtle">
		<Icon name="circles" size={12} />{t('contact.section.circles')}
	</dt>
	<dd>
		<ul class="flex flex-wrap gap-1.5">
			{#each keptCircles as item (item.command.id)}
				<KeptChip
					{item}
					label={item.command.payload.role
						? `${item.command.payload.circleName} · ${item.command.payload.role}`
						: item.command.payload.circleName}
				/>
			{/each}
			{#each circles as circle (circle.membershipId)}
				<li class="max-w-full min-w-0">
					<a
						href="/circles/{circle.circleId}"
						class="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-sm text-fg transition-colors hover:bg-card-hover"
					>
						<span class="size-2 shrink-0 rounded-full" style={accentDotStyle(circle.color)}></span>
						<span class="truncate">{circle.name}</span>
						{#if circle.role}<span class="shrink-0 text-xs text-fg-subtle">· {circle.role}</span
							>{/if}
					</a>
				</li>
			{/each}
			<li>
				<!-- Joining, a role, leaving: all in the editor this opens under the chips. -->
				<button
					type="button"
					class="inline-flex min-h-6 items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-sm text-fg-muted transition-colors hover:bg-card-hover"
					aria-label={t('contact.circles.join')}
					aria-expanded={editing}
					title={t('contact.circles.join')}
					data-edit="circles"
					onclick={() => (editing ? onClose() : onOpen())}
				>
					<Icon name="add" size={13} />{#if slot}{t('contact.join')}{/if}
				</button>
			</li>
		</ul>
		{#if editing}
			<div transition:reveal>
				<CirclesEditor {data} {form} onclose={onClose} />
			</div>
		{/if}
	</dd>
</div>
