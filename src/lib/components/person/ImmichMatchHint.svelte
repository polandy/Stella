<script lang="ts">
	import { applyAction, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Button from '$lib/components/ui/Button.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { MatchHintFace } from './immich-match-hint.svelte';

	/*
	 * The Photos card's suggestion (docs/02 §2.24.7): one quiet row, the Immich face beside a
	 * question — *Is this Lena? Immich has “Lena Brunner” with 1,764 photos.* — and the three
	 * answers. It arrives after the page and stands at the card's foot, so nothing above it moves.
	 *
	 * *Link* posts the card menu's own `linkImmich` and then reloads the page's data in place: the
	 * person is linked, the row goes, and the card loads their Immich photos. A refusal is said on
	 * the card's Immich line, as for a pick in the picker. *Choose another* opens that picker;
	 * *Ignore* is handed to the card, which holds it for the undo window.
	 */
	interface Props {
		face: MatchHintFace;
		/** What the question asks by: *Is this Lena?* */
		askName: string;
		/** The person's shown name, for the buttons' accessible names. */
		contactName: string;
		onchoose: () => void;
		onignore: (event: SubmitEvent) => void;
	}
	let { face, askName, contactName, onchoose, onignore }: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;

	let linking = $state(false);
	const link: SubmitFunction = () => {
		linking = true;
		return async ({ result }) => {
			// The action answers a plain post with a redirect to the card; here the page stays.
			if (result.type === 'redirect') await invalidateAll();
			else await applyAction(result);
			linking = false;
		};
	};

	const facts = $derived(
		face.photoCount === null
			? t('immich.hint.hasUncounted', { immichName: face.name })
			: t('immich.hint.has', {
					immichName: face.name,
					count: face.photoCount,
					shown: new Intl.NumberFormat(i18n.intlLocale).format(face.photoCount)
				})
	);
</script>

<section
	aria-label={t('immich.hint.label', { name: contactName })}
	class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border-subtle pt-3"
	data-testid="immich-match-hint"
>
	<img
		src={face.faceUrl}
		alt={t('immich.match.face', { name: face.name })}
		width="40"
		height="40"
		class="size-10 shrink-0 rounded-full bg-bg-sunken object-cover"
	/>
	<p class="min-w-0 flex-1 basis-48 text-sm">
		<span class="font-medium text-fg">{t('immich.hint.question', { name: askName })}</span>
		<span class="text-fg-muted">{facts}</span>
	</p>
	<!-- The answers wrap as a group under the question on a phone, never off the card. -->
	<div class="flex flex-wrap items-center gap-2">
		<form method="POST" action="?/linkImmich" use:enhance={link}>
			<input type="hidden" name="immichPersonId" value={face.personId} />
			<Button
				variant="primary"
				size="sm"
				disabled={linking}
				label={t('immich.picker.link', { immichName: face.name, name: contactName })}
			>
				{t('immich.match.link')}
			</Button>
		</form>
		<Button variant="ghost" size="sm" type="button" disabled={linking} onclick={onchoose}>
			{t('immich.hint.choose')}
		</Button>
		<form method="POST" action="?/ignoreImmichMatch" onsubmit={onignore}>
			<input type="hidden" name="immichPersonId" value={face.personId} />
			<Button
				variant="ghost"
				size="sm"
				disabled={linking}
				label={t('immich.match.ignoreLabel', { name: contactName })}
			>
				{t('immich.match.ignore')}
			</Button>
		</form>
	</div>
</section>
