<script lang="ts">
	import MemberConfirmStep, {
		type ConfirmLine
	} from '$lib/components/members/MemberConfirmStep.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';

	/*
	 * Restoring a former member (docs/02 §2.1): how they sign in again, that nothing signs them
	 * in on its own, and what of theirs comes back. Focus starts on *Cancel*: restoring opens a
	 * door again, so it is confirmed like the removal that closed it.
	 */
	interface Preview {
		memberId: string;
		name: string;
		privateRecords: number;
		signIn: { password: boolean; sso: boolean };
	}
	let {
		preview,
		onkeep,
		onrestored
	}: { preview: Preview; onkeep: () => void; onrestored: () => void } = $props();

	const t = useTranslate();
	const name = $derived(preview.name);

	const signInLine = $derived(
		preview.signIn.password && preview.signIn.sso
			? t('settings.members.restoreConfirm.signIn.both', { name })
			: preview.signIn.sso
				? t('settings.members.restoreConfirm.signIn.sso', { name })
				: preview.signIn.password
					? t('settings.members.restoreConfirm.signIn.password', { name })
					: t('settings.members.restoreConfirm.signIn.none', { name })
	);

	const lines = $derived(
		[
			{ icon: 'self', text: signInLine },
			{ icon: 'signOut', text: t('settings.members.restoreConfirm.fresh') },
			preview.privateRecords > 0 && {
				icon: 'private',
				text: t('settings.members.restoreConfirm.private', {
					name,
					count: preview.privateRecords
				})
			},
			preview.signIn.sso && {
				icon: 'openElsewhere',
				text: t('settings.members.restoreConfirm.sso', { name })
			}
		].filter((line): line is ConfirmLine => typeof line === 'object')
	);
</script>

<MemberConfirmStep
	memberId={preview.memberId}
	heading={t('settings.members.restoreConfirm.heading', { name })}
	{lines}
	action="?/restore"
	submit={t('settings.members.restoreConfirm.submit', { name })}
	submitVariant="primary"
	keep={t('common.cancel')}
	testid="restore-member-confirm"
	{onkeep}
	ondone={onrestored}
/>
