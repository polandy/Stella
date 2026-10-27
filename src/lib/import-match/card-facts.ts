import type { IncomingCard } from './card';
import type { Fact } from './merge-plan';

/*
 * The incoming side of a review card (docs/02 §2.16), as facts like the ones a merge plan
 * adds, so the review step lists both sides with one component. The picture is not a fact
 * here: the step says whether it is on the card or only a link.
 */

export function cardFacts(card: Omit<IncomingCard, 'hash'>): Fact[] {
	const fields = (kind: 'email' | 'phone' | 'address' | 'url', list: IncomingCard['emails']) =>
		list.map((f): Fact => ({ kind, value: f.value, label: f.label }));
	const text = (kind: 'company' | 'jobTitle' | 'nickname', value: string | null): Fact[] =>
		value ? [{ kind, value }] : [];
	return [
		...fields('email', card.emails),
		...fields('phone', card.phones),
		...fields('address', card.addresses),
		...fields('url', card.urls),
		...(card.birthday ? [{ kind: 'birthday' as const, date: card.birthday }] : []),
		...text('company', card.company),
		...text('jobTitle', card.jobTitle),
		...text('nickname', card.nickname),
		...card.tags.map((name): Fact => ({ kind: 'tag', name }))
	];
}
