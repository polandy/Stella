import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/* Liveness probe for Docker/orchestrators (docs/07 §7.5). Public, no DB dependency. */

export const GET: RequestHandler = () => json({ status: 'ok' });
