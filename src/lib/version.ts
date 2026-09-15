import { version } from '../../package.json';

/*
 * Which Stella this is. release-please writes the number into package.json when it cuts a
 * release, and the published image is built from that tag — so the field is the released
 * version for every real deployment, and the last released one in a development checkout.
 */
export const APP_VERSION: string = version;
