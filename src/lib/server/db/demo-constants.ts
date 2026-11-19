/**
 * Credentials of the demo admin the seed creates. Exported so the login page can offer a
 * one-click demo sign-in while SEED_DEMO is on — never in a real deployment.
 */
export const DEMO_ADMIN_EMAIL = 'demo@stella.local';
export const DEMO_ADMIN_PASSWORD = 'stella-demo-1234';

/** The demo household's second member, who wrote some of the story. Same password. */
export const DEMO_MEMBER_EMAIL = 'nina@stella.local';

/**
 * A third member, Lukas, whom an admin may remove (docs/dev/02 §2.1) without taking away the member
 * the other specs sign in as. Same password; one shared and one private note of his own.
 */
export const DEMO_THIRD_MEMBER_EMAIL = 'lukas@stella.local';
export const DEMO_THIRD_MEMBER_ID = 'demo-user-lukas';
