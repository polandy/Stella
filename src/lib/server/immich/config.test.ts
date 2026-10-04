import { describe, expect, it } from 'bun:test';
import { DEMO_PUBLIC_URL, readImmichConfig } from './config';

const none = { IMMICH_URL: '', IMMICH_PUBLIC_URL: '', IMMICH_API_KEY: '', IMMICH_DEMO: false, SEED_DEMO: false };
const KEY = 'secret-key-0123456789';

describe('readImmichConfig', () => {
	it('leaves the feature off without IMMICH_URL', () => {
		expect(readImmichConfig(none)).toBeNull();
	});

	it('reads the URL and the key, links pointing at the same URL by default', () => {
		expect(readImmichConfig({ ...none, IMMICH_URL: 'http://immich-server:2283/', IMMICH_API_KEY: KEY })).toEqual({
			mode: 'http',
			url: 'http://immich-server:2283',
			publicUrl: 'http://immich-server:2283',
			apiKey: KEY
		});
	});

	it('points links at IMMICH_PUBLIC_URL when it is set', () => {
		const config = readImmichConfig({
			...none,
			IMMICH_URL: 'http://immich-server:2283',
			IMMICH_PUBLIC_URL: 'https://immich.example.com/',
			IMMICH_API_KEY: KEY
		});
		expect(config?.publicUrl).toBe('https://immich.example.com');
	});

	it('fails at start when only one of URL and key is set', () => {
		expect(() => readImmichConfig({ ...none, IMMICH_URL: 'http://immich-server:2283' })).toThrow(
			/IMMICH_URL and IMMICH_API_KEY/
		);
		expect(() => readImmichConfig({ ...none, IMMICH_API_KEY: KEY })).toThrow(/IMMICH_URL and IMMICH_API_KEY/);
	});

	it('fails on a URL that is not a web address, and never repeats the key', () => {
		for (const IMMICH_URL of ['immich-server:2283', 'ftp://immich', 'not a url']) {
			let message = '';
			try {
				readImmichConfig({ ...none, IMMICH_URL, IMMICH_API_KEY: KEY });
			} catch (error) {
				message = (error as Error).message;
			}
			expect(message).toContain('IMMICH_URL');
			expect(message).not.toContain(KEY);
		}
		expect(() =>
			readImmichConfig({ ...none, IMMICH_URL: 'http://immich-server:2283', IMMICH_PUBLIC_URL: 'javascript:alert(1)', IMMICH_API_KEY: KEY })
		).toThrow(/IMMICH_PUBLIC_URL/);
	});

	it('wires the stand-in Immich for the demo household', () => {
		expect(readImmichConfig({ ...none, IMMICH_DEMO: true, SEED_DEMO: true })).toEqual({
			mode: 'demo',
			publicUrl: DEMO_PUBLIC_URL
		});
	});

	it('refuses the stand-in anywhere but a demo, and beside a real Immich', () => {
		expect(() => readImmichConfig({ ...none, IMMICH_DEMO: true })).toThrow(/SEED_DEMO/);
		expect(() =>
			readImmichConfig({ ...none, IMMICH_DEMO: true, SEED_DEMO: true, IMMICH_URL: 'http://immich-server:2283', IMMICH_API_KEY: KEY })
		).toThrow(/IMMICH_DEMO/);
	});
});
