<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Button from '$lib/components/ui/Button.svelte';
	import FormError from '$lib/components/ui/FormError.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import MenuButton from '$lib/components/ui/MenuButton.svelte';
	import { syncModal } from '$lib/components/ui/modal';
	import { isOpenGift } from '$lib/gifts/gifts';
	import { panelOrder } from '$lib/gifts/group-panel';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { heldAnswer } from '$lib/undo/held-answer';
	import { removalKey } from '$lib/undo/keys';
	import { savedEnhance } from '$lib/undo/saved';
	import { whenChip } from '$lib/when/labels';
	import type { GiftGroupView } from '../../../routes/(app)/contacts/[id]/gift-group-view';
	import GiftGroupAdd from './GiftGroupAdd.svelte';
	import GiftGroupEdit from './GiftGroupEdit.svelte';
	import GiftGroupMember from './GiftGroupMember.svelte';
	import type { SelectablePerson } from '$lib/people/select';

	/*
	 * *Who has it?* (docs/dev/02 §2.25.11): one idea several people get, followed up from any of them —
	 * a sheet on a phone, a dialog on a desktop (D7). Each row says what it came to for that person.
	 */
	interface Props {
		group: GiftGroupView;
		/** The person whose card it opened on. */
		contactId: string;
		people: SelectablePerson[];
		today: string;
		error: string | null;
		open: boolean;
	}
	let { group, contactId, people, today, error, open = $bindable() }: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const removals = useRemovals();
	const uid = $props.id();
	const titleId = `${uid}-group-title`;
	let dialog = $state<HTMLDialogElement>();
	let view = $state<'list' | 'add' | 'edit'>('list');

	$effect(() => {
		syncModal(dialog, open, () => (view = 'list'));
	});

	const removeKey = $derived(removalKey('gift-group', `remove/${group.id}`));
	const boughtKey = $derived(removalKey('gift-group', `bought/${group.id}`));
	const removing = $derived(removals.isPending(removeKey));
	const members = $derived(
		panelOrder(
			group.members.filter(
				(m) =>
					!removals.isPending(removalKey('gift', m.giftId)) && !(removing && isOpenGift(m.state))
			)
		)
	);
	const openMembers = $derived(members.filter((m) => isOpenGift(m.state)));
	const ideas = $derived(
		removals.isPending(boughtKey) ? 0 : members.filter((m) => m.state === 'idea').length
	);
	const avatarOf = (id: string) => people.find((p) => p.id === id)?.avatarPhotoId ?? null;
	const rule = $derived(group.when ? whenChip(i18n, group.when) : t('gifts.group.now'));

	const held = (key: string, label: string) =>
		heldAnswer(
			{ holder: removals, fetch: (url, init) => window.fetch(url, init) },
			{
				key,
				label,
				onSending: () => {},
				onCommitted: () => void invalidateAll(),
				onFailed: () => {}
			}
		);
	const dissolved = savedEnhance(removals, t('components.saved'), () => (open = false));

	const MENU_ITEM =
		'flex w-full items-start gap-2 rounded-control px-2.5 py-1.5 text-left text-sm text-fg hover:bg-primary-soft focus-visible:bg-primary-soft';
</script>

<dialog
	bind:this={dialog}
	aria-labelledby={titleId}
	onclose={() => (open = false)}
	onclick={(event) => event.target === event.currentTarget && dialog?.close()}
	class="mx-auto mt-auto mb-0 w-full max-w-lg rounded-t-app border border-border bg-card p-0 text-fg shadow-pop backdrop:bg-bg-sunken/70 backdrop:backdrop-blur-sm md:m-auto md:rounded-app"
	data-testid="gift-group-panel"
>
	{#if open}
		<div class="flex max-h-[88vh] flex-col">
			<header class="flex items-center gap-1 px-4 pt-4">
				<h2 id={titleId} class="min-w-0 flex-1 text-lg font-semibold break-words">
					{view === 'edit' ? t('gifts.group.edit') : group.title}
				</h2>
				{#if view === 'list'}
					<Button
						variant="ghost"
						size="sm"
						type="button"
						icon="rename"
						label={t('gifts.group.edit')}
						onclick={() => (view = 'edit')}
					/>
					<MenuButton label={t('gifts.group.menu')} align="end" look="icon">
						{#snippet trigger()}<Icon name="more" size={16} />{/snippet}
						{#snippet children({ close })}
							<form method="POST" action="?/dissolveGiftGroup" use:enhance={dissolved}>
								<input type="hidden" name="groupId" value={group.id} />
								<button type="submit" role="menuitem" class={MENU_ITEM} onclick={close}>
									<Icon name="unlink" size={14} /><span
										>{t('gifts.group.dissolve')}<span class="block text-xs text-fg-subtle"
											>{t('gifts.group.dissolveHint')}</span
										></span
									>
								</button>
							</form>
							{#if openMembers.length}
								<form
									method="POST"
									action="?/removeGroupOpen"
									use:enhance={held(
										removeKey,
										t('gifts.group.removedOpen', { count: openMembers.length })
									)}
								>
									<input type="hidden" name="groupId" value={group.id} />
									<button
										type="submit"
										role="menuitem"
										class="{MENU_ITEM} text-danger"
										onclick={close}
									>
										<Icon name="remove" size={14} /><span
											>{t('gifts.group.removeOpen', { count: openMembers.length })}<span
												class="block text-xs text-fg-subtle">{t('gifts.group.removeOpenHint')}</span
											></span
										>
									</button>
								</form>
							{/if}
						{/snippet}
					</MenuButton>
				{/if}
				<Button
					variant="ghost"
					size="sm"
					type="button"
					icon="remove"
					label={t('common.close')}
					onclick={() => (open = false)}
				/>
			</header>
			<p class="flex flex-wrap gap-x-1.5 px-4 text-sm text-fg-muted">
				<span>{rule}</span><span aria-hidden="true">·</span>
				<span>{t(group.visibility === 'private' ? 'common.private' : 'common.shared')}</span>
				<span aria-hidden="true">·</span>
				<span
					>{group.mine
						? t('gifts.notedByYou')
						: t('gifts.notedBy', { name: group.notedBy ?? '…' })}</span
				>
			</p>

			<div class="min-h-0 flex-1 overflow-y-auto px-4 py-2">
				<FormError message={error} variant="inline" />
				{#if view === 'add'}
					<GiftGroupAdd
						{group}
						{people}
						{today}
						{rule}
						holding={openMembers.map((m) => m.contactId)}
						onDone={() => (view = 'list')}
					/>
				{:else if view === 'edit'}
					<GiftGroupEdit
						{group}
						{contactId}
						{today}
						open={openMembers}
						onDone={() => (view = 'list')}
					/>
				{:else}
					<ul class="flex flex-col divide-y divide-border-subtle">
						{#each members as member (member.giftId)}
							<GiftGroupMember
								{member}
								groupId={group.id}
								title={group.title}
								avatarPhotoId={avatarOf(member.contactId)}
								here={member.contactId === contactId}
								{today}
							/>
						{/each}
					</ul>
					{#if openMembers.length === 0}
						<p class="py-2 text-sm text-fg-subtle">{t('gifts.group.allHave')}</p>
					{/if}
				{/if}
			</div>

			{#if view === 'list'}
				<footer class="flex flex-wrap gap-2 border-t border-border-subtle px-4 py-3">
					<Button
						variant="secondary"
						size="sm"
						type="button"
						icon="add"
						onclick={() => (view = 'add')}
					>
						{t('gifts.group.addPerson')}
					</Button>
					<form
						method="POST"
						action="?/markGroupBought"
						use:enhance={held(boughtKey, t('gifts.group.boughtFor', { count: ideas }))}
					>
						<input type="hidden" name="groupId" value={group.id} />
						<Button variant="secondary" size="sm" icon="bought" disabled={ideas === 0}>
							{t('gifts.group.boughtAll', { count: ideas })}
						</Button>
					</form>
				</footer>
			{/if}
		</div>
	{/if}
</dialog>
