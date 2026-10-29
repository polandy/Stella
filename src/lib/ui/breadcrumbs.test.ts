import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import { breadcrumbs } from './breadcrumbs';

/*
 * The top bar's trail (docs/05 §5.4): from the route and the page's data. A phone shows only
 * the crumb before the last, so whatever stands there is where its back link goes.
 */

const t = createTranslator('en');
const CIRCLE = '/(app)/circles/[id]';

describe('breadcrumbs', () => {
	it('is Home alone on Home', () => {
		expect(breadcrumbs('/(app)', {}, {}, t)).toEqual([{ label: 'Home' }]);
	});

	it('names a person under People', () => {
		expect(
			breadcrumbs('/(app)/contacts/[id]', { contact: { displayName: 'Ada' } }, { id: 'c1' }, t)
		).toEqual([
			{ label: 'Home', href: '/' },
			{ label: 'People', href: '/contacts' },
			{ label: 'Ada' }
		]);
	});

	it("puts a tag's page under Tags, named with its #", () => {
		expect(breadcrumbs('/(app)/tags', {}, {}, t)).toEqual([
			{ label: 'Home', href: '/' },
			{ label: 'Tags' }
		]);
		expect(
			breadcrumbs('/(app)/tags/[key]', { tag: { name: 'Gurten' } }, { key: 'gurten' }, t)
		).toEqual([
			{ label: 'Home', href: '/' },
			{ label: 'Tags', href: '/tags' },
			{ label: '#Gurten' }
		]);
		// An unknown tag still names what was asked for.
		expect(breadcrumbs('/(app)/tags/[key]', {}, { key: 'nowhere' }, t).at(-1)).toEqual({
			label: '#nowhere'
		});
	});

	it('puts a top-level circle straight under Circles', () => {
		expect(
			breadcrumbs(CIRCLE, { circle: { name: 'Choir' }, nesting: { ancestors: [] } }, { id: 'k' }, t)
		).toEqual([
			{ label: 'Home', href: '/' },
			{ label: 'Circles', href: '/circles' },
			{ label: 'Choir' }
		]);
	});

	it('walks a sub-circle down from the outermost circle, each ancestor a link', () => {
		const trail = breadcrumbs(
			CIRCLE,
			{
				circle: { name: 'Choir 6b' },
				nesting: {
					ancestors: [
						{ id: 's', name: 'School' },
						{ id: 'c', name: 'Class 6b' }
					]
				}
			},
			{ id: 'k' },
			t
		);
		expect(trail).toEqual([
			{ label: 'Home', href: '/' },
			{ label: 'Circles', href: '/circles' },
			{ label: 'School', href: '/circles/s' },
			{ label: 'Class 6b', href: '/circles/c' },
			{ label: 'Choir 6b' }
		]);
		// What a phone's back link takes: the direct parent, not the list.
		expect(trail.at(-2)).toEqual({ label: 'Class 6b', href: '/circles/c' });
	});

	it('puts the circle before Arrange people, so a phone goes back to the circle', () => {
		const trail = breadcrumbs(
			`${CIRCLE}/arrange`,
			{ circle: { name: 'School' }, nesting: { ancestors: [{ id: 'u', name: 'Campus' }] } },
			{ id: 's' },
			t
		);
		expect(trail).toEqual([
			{ label: 'Home', href: '/' },
			{ label: 'Circles', href: '/circles' },
			{ label: 'Campus', href: '/circles/u' },
			{ label: 'School', href: '/circles/s' },
			{ label: 'Arrange people' }
		]);
	});
});
