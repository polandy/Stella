// Imported relatively, like `relationships/roles.ts`, so the module carries no SvelteKit alias.
import type { Translate } from '../i18n/translate';
import { roleTermLabel } from '../relationships/roles';
import type { ShelfCaption } from './model/shelf-captions';

/*
 * The family tree's shelf captions in the viewer's language (docs/05 §5.8, docs/02 §2.19):
 * "Friend of Sandra", "Freundin von Sandra +1", "Lena, Noah +2". `nameOf` gives the name a
 * person is called by on the map.
 */
export function captionWords(
	t: Translate,
	caption: ShelfCaption,
	nameOf: (id: string) => string
): string {
	if (caption.kind === 'members') {
		const [first, second] = caption.ids.map(nameOf);
		const names = second === undefined ? first : t('graph.tree.namePair', { first, second });
		return caption.more > 0 ? t('graph.tree.andMore', { text: names, count: caption.more }) : names;
	}
	const name = nameOf(caption.anchor);
	const said =
		'label' in caption.role
			? t('graph.tree.ownWords', { words: caption.role.label, name })
			: t('graph.tree.tieOf', {
					role: roleTermLabel(t, caption.role.term, caption.role.variant) ?? caption.role.term,
					name
				});
	return caption.more > 0 ? t('graph.tree.andMore', { text: said, count: caption.more }) : said;
}
