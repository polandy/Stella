import { requireViewer } from '$lib/server/auth/guards';
import { membersViewerFirst } from '$lib/server/domain/household/members';
import { buildStream } from '$lib/server/domain/stream/stream';
import { tagKey } from '$lib/hashtags/hashtags';
import { TAG_PAGE_LIMIT, tagSummary } from '$lib/hashtags/tag-pages';
import type { PageServerLoad } from './$types';
import { streamForView } from '../../_shared/stream-view';

/*
 * A tag's own page (docs/02 §2.20.2): every moment the viewer may see that carries it, across
 * everyone's journals, newest first. The moments are the stream's own read narrowed to the tag,
 * so they are scoped exactly as Home's are; one on a private moment of someone else's never
 * shows, and a tag only there reads as unknown.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	const viewer = requireViewer(locals);
	const key = tagKey(params.key);

	const [members, items, entryTags] = await Promise.all([
		membersViewerFirst(locals.services.household.memberDeps, viewer),
		buildStream(
			locals.services.media.streamDeps,
			viewer,
			{ kind: 'moment', memberId: null, tag: key },
			TAG_PAGE_LIMIT
		),
		locals.services.story.entryTags.listVisibleTo(viewer)
	]);
	// A read narrowed to a tag holds only moments; the narrowing here says so to the types.
	const moments = (
		await streamForView(locals.services.people.contactNameDeps, viewer, items)
	).filter((item) => item.kind === 'moment');
	const summary = tagSummary(key, entryTags, moments);

	return {
		key,
		// The breadcrumb's last step: the household's spelling, or what was asked for.
		tag: { name: summary?.name ?? params.key },
		summary,
		members,
		stream: moments
	};
};
