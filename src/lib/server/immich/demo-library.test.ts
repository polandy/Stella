import { describe, expect, it } from 'bun:test';
import { isImmichId, readPerson } from '../domain/immich/gateway';
import { DEMO_ADMIN_EMAIL } from '../db/demo-seed';
import { demoImmichLibrary } from './demo-library';
import { solidPng } from './png';

describe('demoImmichLibrary', () => {
	it('is the demo admin’s, so they are the one who sees Open in Immich', () => {
		expect(demoImmichLibrary().owner.email).toBe(DEMO_ADMIN_EMAIL);
	});

	it('names every face with an id the real parsers accept', () => {
		for (const face of demoImmichLibrary().people) {
			expect(isImmichId(face.id)).toBe(true);
			expect(readPerson({ id: face.id, name: face.name })).not.toBeNull();
		}
	});
});

describe('solidPng', () => {
	it('is a PNG of the asked size', () => {
		const png = solidPng(12, '#8839ef');
		expect([...png.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
		const header = new DataView(png.buffer, 16, 8);
		expect([header.getUint32(0), header.getUint32(4)]).toEqual([12, 12]);
	});

	it('holds the colour it was given, row by row', () => {
		const png = solidPng(2, '#102030');
		// IDAT: after the signature (8) and IHDR (25), the length (4) and type (4); then zlib's 2 header bytes.
		const idatLength = new DataView(png.buffer, 33, 4).getUint32(0);
		const deflated = png.slice(43, 41 + idatLength - 4);
		expect([...Bun.inflateSync(deflated)]).toEqual([0, 16, 32, 48, 16, 32, 48, 0, 16, 32, 48, 16, 32, 48]);
	});
});
