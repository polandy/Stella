/*
 * The server's "today" as an ISO day, read off the injected clock rather than the wall clock
 * (docs/08 §8.2 item 10), so the edge and the use-cases agree on what now is. The day is the
 * one in the process's time zone — the household's — which is why `TZ` is pinned wherever
 * tests run (docs/08 §8.4.2).
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** The clock's calendar day as `YYYY-MM-DD`. */
export function todayFor(clock: { now(): number }): string {
	const d = new Date(clock.now());
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
