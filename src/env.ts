import { defineEnvVars, type EnvVarConfig } from '@sveltejs/kit/env';
import { configKeys } from '#lib/server/config-schema.js';

/*
 * Declares every variable to SvelteKit, which hands only declared ones to `$app/env/private`.
 * Each passes through as read; `src/lib/server/config.ts` validates them together.
 */
const passThrough: EnvVarConfig<string> = { schema: (value) => value };

export const variables = defineEnvVars(
	Object.fromEntries(configKeys.map((key) => [key, passThrough]))
);
