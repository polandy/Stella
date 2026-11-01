<script lang="ts">
	import type { MessageKey } from '$lib/i18n/translate';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { ShareChoice, ShareTarget } from '$lib/share/shared';
	import type { IconName } from '../ui/icons';
	import Icon from '../ui/Icon.svelte';

	/*
	 * Where a share goes (docs/02 §2.18.3): one of the targets `choicesFor` offers, as a radio
	 * group of rows. A target that cannot be picked stays in the list, dimmed, and says why, so
	 * the profile photo is not simply missing when several photos came or Stella is out of reach.
	 */

	interface Props {
		choices: readonly ShareChoice[];
		picked: ShareTarget | null;
		photoCount: number;
		onpick: (target: ShareTarget) => void;
	}
	let { choices, picked, photoCount, onpick }: Props = $props();

	const t = useTranslate();

	const LOOK: Record<ShareTarget, { icon: IconName; label: MessageKey }> = {
		gallery: { icon: 'photo', label: 'share.target.gallery' },
		avatar: { icon: 'self', label: 'share.target.avatar' },
		moment: { icon: 'write', label: 'share.target.moment' },
		gift: { icon: 'idea', label: 'share.target.gift' },
		todo: { icon: 'todo', label: 'share.target.todo' }
	};

	function hint(choice: ShareChoice): string {
		if (choice.blockedBy === 'severalPhotos') return t('share.blocked.severalPhotos');
		if (choice.blockedBy === 'offline') return t('share.blocked.offline');
		switch (choice.id) {
			case 'gallery':
				return t('share.target.galleryHint', { count: photoCount });
			case 'avatar':
				return t('share.target.avatarHint');
			case 'moment':
				return t('share.target.momentHint');
			case 'gift':
				return t('share.target.giftHint');
			case 'todo':
				return t('share.target.todoHint');
		}
	}
</script>

<fieldset class="flex flex-col gap-2.5">
	<legend class="mb-2.5 text-[15px] font-semibold text-fg">{t('share.as')}</legend>
	<div class="flex flex-col gap-1.5" data-testid="share-targets">
		{#each choices as choice (choice.id)}
			{@const on = picked === choice.id}
			<label
				class="flex min-h-14 items-center gap-3 rounded-app border bg-card px-3 py-2 text-fg {on
					? 'border-primary ring-1 ring-primary'
					: 'border-border-subtle'} {choice.blockedBy ? 'opacity-55' : 'cursor-pointer'}"
			>
				<span
					class="grid size-9 shrink-0 place-items-center rounded-control {on
						? 'bg-primary-soft text-primary'
						: 'bg-bg-sunken text-fg-muted'}"
				>
					<Icon name={LOOK[choice.id].icon} size={18} />
				</span>
				<span class="flex flex-1 flex-col">
					<span class="font-medium">{t(LOOK[choice.id].label)}</span>
					<span class="text-xs text-fg-muted">{hint(choice)}</span>
				</span>
				<input
					type="radio"
					name="share-target"
					value={choice.id}
					checked={on}
					disabled={choice.blockedBy !== null}
					onchange={() => onpick(choice.id)}
					class="size-5 accent-primary"
				/>
			</label>
		{/each}
	</div>
</fieldset>
