import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/* Health check for Docker and the PWA's reachability probe (docs/dev/07 §7.5.1). Public. */

export const GET: RequestHandler = ({ locals }) => {
	const report = locals.services.health.check();
	const headers = { 'cache-control': 'no-store' };
	return report.ok
		? json({ status: 'ok', version: report.version, migrations: report.migrations }, { headers })
		: json({ status: 'unavailable', version: report.version }, { status: 503, headers });
};
