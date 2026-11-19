<script lang="ts">
	import { enhance } from '#lib/forms/enhance.js';
	import type { SubmitFunction } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import GiftGiveForm from '#lib/components/person/GiftGiveForm.svelte';
	import Avatar from '#lib/components/ui/Avatar.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import MenuButton from '#lib/components/ui/MenuButton.svelte';
	import WhenChip from '#lib/components/when/WhenChip.svelte';
	import { dayLabel } from '#lib/dates/labels.js';
	import { isOpenGift } from '#lib/gifts/gifts.js';
	import { ideaState } from '#lib/gifts/idea-when.js';
	import { occasionLabel } from '#lib/gifts/labels.js';
	import { useI18n } from '#lib/i18n/context.svelte.js';
	import { contactSectionPath } from '#lib/people/sections.js';
	import { useRemovals } from '#lib/undo/context.svelte.js';
	import { heldAnswer } from '#lib/undo/held-answer.js';
	import { removalKey } from '#lib/undo/keys.js';
	import { savedEnhance } from '#lib/undo/saved.js';
	import type { GiftGroupView } from '../../../routes/(app)/contacts/[id]/gift-group-view';

	/*
	 * One person in *Who has it?* (docs/dev/02 §2.25.11): what their gift came to, *Given…*, and a ⋯
	 * for the rest. A row changes only their gift; *Not bought* and *Remove* wait out their undo window.
	 */
	interface Props {
		member: GiftGroupView['members'][number];
		groupId: string;
		title: string;
		avatarPhotoId: string | null;
		/** The person whose card the panel opened on: no link to the card already open. */
		here: boolean;
		today: string;
	}
	let { member, groupId, title, avatarPhotoId, here, today }: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const removals = useRemovals();
	let giving = $state(false);

	const open = $derived(isOpenGift(member.state));
	const fields = $derived({ groupId, contactId: member.contactId });
	const standing = $derived(
		member.state === 'idea' ? ideaState(member, member.birth, today) : null
	);
	const given = $derived(
		member.givenOn
			? [
					t('gifts.group.given', { day: dayLabel(i18n, member.givenOn) }),
					member.occasion ? `(${occasionLabel(t, member.occasion)})` : null
				]
					.filter(Boolean)
					.join(' ')
			: null
	);

	const savedGiven = savedEnhance(removals, t('components.saved'), () => (giving = false));
	const saved = savedEnhance(removals, t('components.saved'), () => {});
	const held = (bought: boolean) =>
		heldAnswer(
			{ holder: removals, fetch: (url, init) => window.fetch(url, init) },
			{
				key: removalKey('gift', member.giftId),
				label: bought ? t('gifts.notBought.title', { title: member.title }) : t('gifts.removed'),
				onSending: () => {},
				onCommitted: () => void invalidateAll(),
				onFailed: () => {}
			}
		);

	// The menu closes once the submit has read the form: closing on click unmounts it first.
	const thenClose =
		(submit: SubmitFunction, close: () => void): SubmitFunction =>
		(input) => {
			const after = submit(input);
			close();
			return after;
		};

	const MENU_ITEM =
		'flex w-full items-start gap-2 rounded-control px-2.5 py-1.5 text-left text-sm text-fg hover:bg-primary-soft focus-visible:bg-primary-soft';
</script>

<li class="flex gap-3 py-2.5" data-testid="group-member" data-contact={member.contactId}>
	<Avatar id={member.contactId} name={member.name} {avatarPhotoId} size={32} />
	<div class="min-w-0 flex-1">
		<p class="font-medium text-fg">{member.name}</p>
		<div class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-fg-muted">
			{#if given}
				<span class="inline-flex items-center gap-1 text-success-text"
					><Icon name="done" size={12} />{given}</span
				>
			{:else}
				{#if member.state === 'bought'}
					<span class="inline-flex items-center gap-1"
						><Icon name="bought" size={12} />{t('gifts.group.bought')} ·</span
					>
				{/if}
				{#if member.when}
					<WhenChip when={member.when} state={standing} {today} />
				{:else}
					<span>{t('gifts.group.openNow')}</span>
				{/if}
				{#if member.ownWhen}
					<span class="rounded-full bg-bg-sunken px-2 py-0.5 text-xs"
						>{t('gifts.group.ownWhen')}</span
					>
				{/if}
				{#if member.ownTitle}
					<span class="rounded-full bg-bg-sunken px-2 py-0.5 text-xs"
						>{t('gifts.group.ownTitle')}</span
					>
				{/if}
			{/if}
		</div>
		{#if giving}
			<GiftGiveForm
				gift={{ id: member.giftId, title: member.ownTitle ? member.title : title }}
				{today}
				error={null}
				submit={savedGiven}
				onCancel={() => (giving = false)}
				action="?/markGroupGiftGiven"
				{fields}
			/>
		{/if}
	</div>
	<div class="flex shrink-0 items-start gap-1">
		{#if open && !giving}
			<Button variant="secondary" size="sm" type="button" onclick={() => (giving = true)}>
				{t('gifts.markGiven.open')}
			</Button>
		{/if}
		<MenuButton label={t('gifts.group.rowMenu', { name: member.name })} align="end" look="icon">
			{#snippet trigger()}<Icon name="more" size={16} />{/snippet}
			{#snippet children({ close })}
				{#if member.state === 'bought'}
					<form
						method="POST"
						action="?/markGroupGiftBought"
						use:enhance={(input) => thenClose(held(true), close)(input)}
					>
						<input type="hidden" name="giftId" value={member.giftId} />
						<input type="hidden" name="groupId" value={groupId} />
						<input type="hidden" name="contactId" value={member.contactId} />
						<button type="submit" role="menuitem" class={MENU_ITEM}>
							<Icon name="bought" size={14} />{t('gifts.notBought')}
						</button>
					</form>
				{/if}
				{#if !here}
					<a
						href={contactSectionPath(member.contactId, 'gifts')}
						role="menuitem"
						class={MENU_ITEM}
						onclick={close}
					>
						<Icon name="forward" size={14} />{t('gifts.group.openCard', { name: member.name })}
					</a>
				{/if}
				<form method="POST" action="?/detachGroupGift" use:enhance={thenClose(saved, close)}>
					<input type="hidden" name="groupId" value={groupId} />
					<input type="hidden" name="giftId" value={member.giftId} />
					<button type="submit" role="menuitem" class={MENU_ITEM}>
						<Icon name="unlink" size={14} /><span
							>{t('gifts.group.detach')}<span class="block text-xs text-fg-subtle"
								>{t('gifts.group.detachHint', { name: member.name })}</span
							></span
						>
					</button>
				</form>
				{#if open}
					<form
						method="POST"
						action="?/removeGroupGift"
						use:enhance={(input) => thenClose(held(false), close)(input)}
					>
						<input type="hidden" name="giftId" value={member.giftId} />
						<input type="hidden" name="groupId" value={groupId} />
						<input type="hidden" name="contactId" value={member.contactId} />
						<button type="submit" role="menuitem" class="{MENU_ITEM} text-danger">
							<Icon name="remove" size={14} />{t('gifts.group.removeFor', { name: member.name })}
						</button>
					</form>
				{/if}
			{/snippet}
		</MenuButton>
	</div>
</li>
