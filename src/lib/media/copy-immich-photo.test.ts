import { describe, expect, it } from 'bun:test';
import { immichMediaUrl } from '../immich/media-url';
import { copyImmichPhoto } from './copy-immich-photo';

/*
 * A photo from the Immich library, copied through the signed proxy (docs/02 §2.24.9): the file
 * goes on to the image pipeline, and its token to the server, which dates the copy by it.
 */

/** A proxy that gives `response` and records what it was asked for. */
const answering =
	(response: Response) =>
	(asked: string[]) =>
	async (url: string): Promise<Response> => {
		asked.push(url);
		return response;
	};

describe('copying a photo from Immich', () => {
	it('fetches the preview and hands on the picture with the token it was signed by', async () => {
		const asked: string[] = [];
		const copy = await copyImmichPhoto(
			immichMediaUrl('tok.sig'),
			answering(new Response(new Blob(['jpeg'], { type: 'image/jpeg' })))(asked)
		);
		expect(asked).toEqual([immichMediaUrl('tok.sig')]);
		expect(copy.immichToken).toBe('tok.sig');
		expect(copy.file.type).toBe('image/jpeg');
		expect(await copy.file.text()).toBe('jpeg');
	});

	it('refuses a URL that is not the proxy’s without fetching it', async () => {
		const asked: string[] = [];
		const fetcher = answering(new Response(new Blob(['jpeg'], { type: 'image/jpeg' })))(asked);
		await expect(copyImmichPhoto('https://elsewhere.example/a.jpg', fetcher)).rejects.toThrow();
		expect(asked).toEqual([]);
	});

	it('fails loud when the proxy refuses or sends no picture', async () => {
		const url = immichMediaUrl('tok.sig');
		await expect(
			copyImmichPhoto(url, answering(new Response(null, { status: 404 }))([]))
		).rejects.toThrow('404');
		await expect(
			copyImmichPhoto(url, answering(new Response(new Blob(['<html>'], { type: 'text/html' })))([]))
		).rejects.toThrow('no picture');
	});
});
