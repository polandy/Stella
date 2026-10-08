import { describe, expect, it } from 'bun:test';
import { mentionToken } from '$lib/mentions/mentions';
import { composerFor, linkSuggestionAmong, peopleNamedBy, photosPosted } from './home-view';

/*
 * What Home reads off its address and its capture form (docs/02 §2.22): the people a link hint
 * or `?about=` names, kept only when the viewer may still act on them, and the photos a moment
 * carries, field by field in step.
 */

const params = (query: string) => new URLSearchParams(query);
const onList = [
	{ id: 'anna', displayName: 'Anna' },
	{ id: 'ben', displayName: 'Ben' }
];

describe('peopleNamedBy', () => {
	it('names a link hint’s pair and the person a moment is about', () => {
		expect(peopleNamedBy(params('link=anna,ben&about=cleo')).ids).toEqual(['anna', 'ben', 'cleo']);
	});

	it('names nobody on a bare Home', () => {
		expect(peopleNamedBy(params('')).ids).toEqual([]);
	});

	it('reads only the first two of a longer pair, and nothing of an empty one', () => {
		expect(peopleNamedBy(params('link=anna,ben,cleo')).ids).toEqual(['anna', 'ben']);
		expect(peopleNamedBy(params('link=,&about=')).ids).toEqual([]);
	});
});

describe('linkSuggestionAmong', () => {
	it('offers to link the pair when the viewer may act on both', () => {
		expect(linkSuggestionAmong(peopleNamedBy(params('link=anna,ben')), onList)).toEqual({
			a: { id: 'anna', name: 'Anna' },
			b: { id: 'ben', name: 'Ben' }
		});
	});

	it('drops the hint silently when either one is out of sight or archived', () => {
		expect(linkSuggestionAmong(peopleNamedBy(params('link=anna,cleo')), onList)).toBeNull();
		expect(linkSuggestionAmong(peopleNamedBy(params('link=cleo,ben')), onList)).toBeNull();
	});

	it('offers nothing for half a pair', () => {
		expect(linkSuggestionAmong(peopleNamedBy(params('link=anna')), onList)).toBeNull();
	});
});

describe('composerFor', () => {
	it('opens the composer about the person `?about=` names, as stored', () => {
		const query = params('about=ben');
		expect(composerFor(query, peopleNamedBy(query), onList)).toEqual({
			compose: true,
			draft: `${mentionToken('ben')} `
		});
	});

	it('opens it about nobody for a person out of sight or unknown', () => {
		const query = params('about=cleo');
		expect(composerFor(query, peopleNamedBy(query), onList)).toEqual({
			compose: false,
			draft: null
		});
	});

	it('opens it empty when asked to compose, and stays shut otherwise', () => {
		const asked = params('compose');
		expect(composerFor(asked, peopleNamedBy(asked), onList)).toEqual({
			compose: true,
			draft: null
		});
		expect(composerFor(params(''), peopleNamedBy(params('')), onList)).toEqual({
			compose: false,
			draft: null
		});
	});
});

describe('photosPosted', () => {
	const file = (name: string) => new File([new Uint8Array([1])], name);
	const formWith = (fields: [string, string | File][]) => {
		const form = new FormData();
		for (const [name, value] of fields) form.append(name, value);
		return form;
	};

	it('reads each photo’s fields in step, with the id the composer named it by', () => {
		const [image, thumb] = [file('a.webp'), file('a-thumb.webp')];
		const posted = photosPosted(
			formWith([
				['image', image],
				['thumb', thumb],
				['width', '800'],
				['height', '600'],
				['photoId', 'p1']
			])
		);
		expect(posted).toHaveLength(1);
		expect(posted[0]).toMatchObject({ width: 800, height: 600, photoId: 'p1' });
		expect(posted[0]?.image.name).toBe('a.webp');
		expect(posted[0]?.thumb.name).toBe('a-thumb.webp');
	});

	it('leaves the id to be made when the composer named none', () => {
		const posted = photosPosted(
			formWith([
				['image', file('a')],
				['thumb', file('b')],
				['width', '1'],
				['height', '1'],
				['photoId', '']
			])
		);
		expect(posted.map((p) => p.photoId)).toEqual([null]);
	});

	it('skips a photo whose image or thumb is not a file, and keeps the rest in step', () => {
		const posted = photosPosted(
			formWith([
				['image', 'not a file'],
				['image', file('second')],
				['thumb', file('first-thumb')],
				['thumb', file('second-thumb')],
				['width', '1'],
				['width', '2'],
				['height', '1'],
				['height', '2'],
				['photoId', 'p1'],
				['photoId', 'p2']
			])
		);
		expect(posted.map((p) => [p.image.name, p.thumb.name, p.width, p.photoId])).toEqual([
			['second', 'second-thumb', 2, 'p2']
		]);
	});

	it('passes a size that does not read on as not a number, for the command to refuse', () => {
		const posted = photosPosted(
			formWith([
				['image', file('a')],
				['thumb', file('b')]
			])
		);
		expect(posted.map((p) => [p.width, p.height])).toEqual([[NaN, NaN]]);
	});

	it('reads no photos from a form that carries none', () => {
		expect(photosPosted(formWith([['body', 'text']]))).toEqual([]);
	});
});
