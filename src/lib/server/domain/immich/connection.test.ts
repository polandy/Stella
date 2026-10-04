import { describe, expect, it } from 'bun:test';
import type { Clock } from '../../clock';
import { createFakeImmichGateway } from '../../immich/fake-gateway';
import {
	createImmichConnection,
	FAILURE_RETRY_MS,
	isKeyOwner,
	isSupportedVersion,
	STATUS_INTERVAL_MS
} from './connection';
import { testLibrary } from './test-library';

function fakeClock(start = 1_000): Clock & { advance(ms: number): void } {
	let now = start;
	return { now: () => now, advance: (ms) => void (now += ms) };
}

function connect() {
	const gateway = createFakeImmichGateway(testLibrary());
	const clock = fakeClock();
	return { gateway, clock, connection: createImmichConnection({ gateway, clock }) };
}

describe('isSupportedVersion', () => {
	it('takes 3.2 and newer, and nothing older (decision §9.5)', () => {
		expect(isSupportedVersion({ major: 3, minor: 2, patch: 0 })).toBe(true);
		expect(isSupportedVersion({ major: 3, minor: 10, patch: 0 })).toBe(true);
		expect(isSupportedVersion({ major: 4, minor: 0, patch: 0 })).toBe(true);
		expect(isSupportedVersion({ major: 3, minor: 1, patch: 9 })).toBe(false);
		expect(isSupportedVersion({ major: 2, minor: 9, patch: 0 })).toBe(false);
	});
});

describe('createImmichConnection', () => {
	it('says whose Immich it reads, and which version', async () => {
		const { connection } = connect();
		expect(await connection.status()).toEqual({
			state: 'connected',
			version: '3.2.4',
			owner: { name: 'Anna', email: 'anna@example.test' }
		});
	});

	it('says plainly when the server is older than 3.2, and asks nothing else', async () => {
		const { gateway, connection } = connect();
		gateway.library.version = { major: 3, minor: 1, patch: 2 };
		expect(await connection.status()).toEqual({ state: 'tooOld', version: '3.1.2' });
		expect(gateway.calls).toEqual(['version']);
	});

	it('reports an Immich that does not answer', async () => {
		const { gateway, connection } = connect();
		gateway.failing = { version: 'unreachable' };
		expect(await connection.status()).toEqual({ state: 'unreachable' });
	});

	it('reports a revoked key', async () => {
		const { gateway, connection } = connect();
		gateway.failing = { owner: 'unauthorized' };
		expect(await connection.status()).toEqual({ state: 'keyRejected' });
	});

	it('names the scope a key is missing', async () => {
		for (const [call, scope] of [
			['owner', 'user.read'],
			['listPeople', 'person.read'],
			['personStatistics', 'person.statistics']
		] as const) {
			const { gateway, connection } = connect();
			gateway.failing = { [call]: 'forbidden' };
			expect(await connection.status()).toEqual({ state: 'missingScope', scope });
		}
	});

	it('cannot check the statistics scope in an empty library, and does not pretend to', async () => {
		const { gateway, connection } = connect();
		gateway.library.people = [];
		expect((await connection.status()).state).toBe('connected');
		expect(gateway.calls).not.toContain('personStatistics');
		expect(gateway.calls).toContain('listPeople');
	});

	it('asks Immich again only once the answer has aged', async () => {
		const { gateway, clock, connection } = connect();
		await connection.status();
		await connection.status();
		expect(gateway.calls.filter((c) => c === 'version')).toHaveLength(1);

		clock.advance(STATUS_INTERVAL_MS);
		await connection.status();
		expect(gateway.calls.filter((c) => c === 'version')).toHaveLength(2);
	});

	it('tries again sooner after a failure, so a restarted Immich is seen quickly', async () => {
		const { gateway, clock, connection } = connect();
		gateway.failing = { version: 'unreachable' };
		await connection.status();

		gateway.failing = {};
		clock.advance(FAILURE_RETRY_MS - 1);
		expect((await connection.status()).state).toBe('unreachable');
		clock.advance(1);
		expect((await connection.status()).state).toBe('connected');
	});

	it('asks once when two pages ask at the same moment', async () => {
		const { gateway, connection } = connect();
		await Promise.all([connection.status(), connection.status()]);
		expect(gateway.calls.filter((c) => c === 'version')).toHaveLength(1);
	});
});

describe('isKeyOwner', () => {
	const connected = {
		state: 'connected' as const,
		version: '3.2.4',
		owner: { name: 'Anna', email: 'Anna@Example.test' }
	};

	it('recognises the key owner by email, whatever its case', () => {
		expect(isKeyOwner(connected, 'anna@example.test')).toBe(true);
		expect(isKeyOwner(connected, ' anna@example.test ')).toBe(true);
	});

	it('is nobody else, and nobody at all without a connection', () => {
		expect(isKeyOwner(connected, 'bert@example.test')).toBe(false);
		expect(isKeyOwner({ state: 'unreachable' }, 'anna@example.test')).toBe(false);
	});
});
