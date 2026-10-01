/*
 * The on-demand review (docs/concepts/relationship-suggestions.md §6.5) hangs on the URL
 * rather than on component state: pressing *Check suggestions* is a page the household can
 * reload, come back to, and keep after confirming one of the rows. What was declined comes
 * with it, behind a disclosure — so a *no* is never out of reach and costs no second request.
 */
export const REVIEW_PARAM = 'review';

/** The person page with the review panel open, back at the relationships card. */
export const reviewPath = (contactId: string) => `/contacts/${contactId}?${REVIEW_PARAM}#relationships`;
