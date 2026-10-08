/*
 * The Drizzle schema, one file per bounded context (docs/03 §3.0); drizzle.config.ts reads
 * this barrel, and every `from './schema'` import resolves here.
 */

export * from './household';
export * from './people';
export * from './relationships';
export * from './notes';
export * from './story';
export * from './media';
export * from './circles';
export * from './suggestions';
export * from './immich';
export * from './commands';
export * from './activity';
