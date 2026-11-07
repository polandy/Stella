<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import PhotoSourceMenu from '$lib/components/immich/PhotoSourceMenu.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';

	/*
	 * The moment composer's photo button: an icon button, as it acts at once (docs/05 §5.7),
	 * with a badge counting what was picked. With Immich on the instance it opens a menu that
	 * also offers *From Immich* (docs/02 §2.24.9).
	 */

	interface Props {
		count: number;
		immichLibrary: boolean;
		onfiles: (files: File[]) => void;
		onimmich: () => void;
	}
	let { count, immichLibrary, onfiles, onimmich }: Props = $props();

	const t = useTranslate();
</script>

<!-- `sr-only`, not `hidden`: a hidden input is out of the tab order, and the photo button with
     it (WCAG 2.1.1). The button shows where focus is instead. -->
{#snippet photoBadge()}
	<Icon name="photo" size={17} />
	{#if count}<span
			class="absolute -top-0.5 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-fg tabular-nums"
			aria-hidden="true"
			data-testid="photo-count">{count}</span
		>{/if}
{/snippet}
{#if immichLibrary}
	<PhotoSourceMenu
		label={t('composer.addPhotos')}
		trigger={photoBadge}
		look="icon"
		{onfiles}
		{onimmich}
	/>
{:else}
	<label
		title={t('composer.addPhotos')}
		class="relative grid size-8 cursor-pointer place-items-center rounded-full text-fg-muted transition-colors hover:bg-card-hover hover:text-fg has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus-ring"
	>
		{@render photoBadge()}
		<input
			type="file"
			accept="image/*"
			multiple
			aria-label={t('composer.addPhotos')}
			onchange={(e) => onfiles(Array.from((e.currentTarget as HTMLInputElement).files ?? []))}
			class="sr-only"
		/>
	</label>
{/if}
