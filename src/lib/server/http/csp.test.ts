import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { CSP_DIRECTIVES, formActionDirective } from './csp';

describe('the Content-Security-Policy', () => {
	it('runs no script but Stella’s own and the nonced inline ones', () => {
		expect(CSP_DIRECTIVES['script-src']).toEqual(['self']);
		expect(CSP_DIRECTIVES['object-src']).toEqual(['none']);
		expect(CSP_DIRECTIVES['frame-ancestors']).toEqual(['none']);
	});

	it('gives every inline script in app.html the nonce, or the policy would block it', () => {
		const html = readFileSync('src/app.html', 'utf8');
		const scripts = html.match(/<script\b[^>]*>/g) ?? [];
		expect(scripts.length).toBeGreaterThan(0);
		for (const tag of scripts) expect(tag).toContain('nonce="%sveltekit.nonce%"');
	});

	it('lets a sign-out form reach the identity provider, and nowhere else', () => {
		expect(formActionDirective('https://auth.example.test/realms/family')).toBe(
			"form-action 'self' https://auth.example.test"
		);
		expect(formActionDirective(null)).toBe("form-action 'self'");
	});
});
