<script lang="ts">
	import MemberConfirmStep, {
		type ConfirmLine
	} from '$lib/components/members/MemberConfirmStep.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';

	/*
	 * Removing a member (docs/02 §2.1): what the removal ends and what it keeps. Focus starts on
	 * *Keep*, so a second Enter removes nobody.
	 */
	interface Preview {
		memberId: string;
		name: string;
		privateRecords: number;
		signsInWithSso: boolean;
		onlyAdminWithPassword: boolean;
	}
	let {
		preview,
		onkeep,
		onremoved
	}: { preview: Preview; onkeep: () => void; onremoved: () => void } = $props();

	const t = useTranslate();
	const name = $derived(preview.name);

	const lines = $derived(
		[
			{ icon: 'signOut', text: t('settings.members.confirm.signOut', { name }) },
			{ icon: 'shared', text: t('settings.members.confirm.shared', { name }) },
			preview.privateRecords > 0 && {
				icon: 'private',
				text: t('settings.members.confirm.private', { name, count: preview.privateRecords })
			},
			preview.signsInWithSso && {
				icon: 'openElsewhere',
				text: t('settings.members.confirm.sso', { name })
			},
			preview.onlyAdminWithPassword && {
				icon: 'apiToken',
				text: t('settings.members.confirm.lastAdmin', { name }),
				alert: true
			}
		].filter((line): line is ConfirmLine => typeof line === 'object')
	);
</script>

<MemberConfirmStep
	memberId={preview.memberId}
	heading={t('settings.members.confirm.heading', { name })}
	{lines}
	action="?/remove"
	submit={t('settings.members.confirm.submit', { name })}
	submitVariant="danger"
	keep={t('settings.members.confirm.keep', { name })}
	testid="remove-member-confirm"
	{onkeep}
	ondone={onremoved}
/>
