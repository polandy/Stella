<script lang="ts">
	import { dayLabel } from '$lib/dates/labels';
	import { KIND_PRESENTATION, type InteractionKind } from '$lib/interactions/kinds';

	/*
	 * The interactions timeline on a person's page (docs/02 §2.6): most recent day first,
	 * one accent per kind (docs/05 §5.6). Deleting is only offered on the viewer's own
	 * entries — the server enforces it, this just avoids showing a button that would fail.
	 */
	interface Participant {
		contactId: string;
		displayName: string;
	}
	interface Item {
		id: string;
		kind: InteractionKind;
		happenedAt: string;
		title: string | null;
		description: string | null;
		visibility: 'shared' | 'private';
		mine: boolean;
		participants: Participant[];
	}

	let { items }: { items: Item[] } = $props();
</script>

{#if items.length === 0}
	<p class="text-sm text-fg-subtle">No interactions logged yet.</p>
{:else}
	<ol class="flex flex-col gap-2" data-testid="interaction-timeline">
		{#each items as item (item.id)}
			{@const kind = KIND_PRESENTATION[item.kind]}
			<li class="flex gap-3 rounded-app border border-border bg-card px-4 py-3">
				<span
					class="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm"
					style="background:color-mix(in srgb, {kind.accent} 18%, transparent)"
					aria-hidden="true"
				>
					{kind.icon}
				</span>
				<div class="min-w-0 flex-1">
					<div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
						<span class="text-xs font-medium uppercase tracking-wide" style="color:{kind.accent}">
							{kind.label}
						</span>
						<time datetime={item.happenedAt} class="text-xs text-fg-subtle">{dayLabel(item.happenedAt)}</time>
						{#if item.visibility === 'private'}
							<span class="text-xs text-fg-subtle">· private</span>
						{/if}
					</div>
					{#if item.title}<p class="font-medium text-fg">{item.title}</p>{/if}
					{#if item.description}<p class="text-sm whitespace-pre-line text-fg-muted">{item.description}</p>{/if}
					{#if item.participants.length > 0}
						<p class="mt-1 text-xs text-fg-subtle">
							with
							{#each item.participants as p, i (p.contactId)}
								{i > 0 ? ', ' : ''}<a href="/contacts/{p.contactId}" class="text-link hover:underline">{p.displayName}</a>
							{/each}
						</p>
					{/if}
				</div>
				{#if item.mine}
					<form method="POST" action="?/removeInteraction" class="shrink-0">
						<input type="hidden" name="interactionId" value={item.id} />
						<button class="text-fg-subtle hover:text-danger" title="Remove" aria-label="Remove interaction">×</button>
					</form>
				{/if}
			</li>
		{/each}
	</ol>
{/if}
