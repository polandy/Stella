/* Sign-in, first-run setup and the auth shell (docs/02 §2.1). */

export const auth = {
	'auth.signIn': 'Sign in',
	'auth.signInTitle': 'Sign in · Stella',
	'auth.signInWithSso': 'Sign in with SSO',
	'auth.or': 'or',
	'auth.email': 'Email',
	'auth.password': 'Password',
	'auth.signInAsDemo': 'Sign in as demo user',
	'auth.demoHint': (p: { email: string }) => `Demo data is on (SEED_DEMO). ${p.email}`,
	'auth.invalidInput': 'Please enter a valid email and password.',
	'auth.invalidCredentials': 'Invalid email or password.',
	'auth.sso.failed': 'Single sign-on failed. Please try again.',
	'auth.sso.notAuthorized': 'Your account is not permitted to sign in here.',
	'auth.sso.noAccount': 'No account exists for you yet. Ask an admin to invite you.',
	'auth.shell.tagline': 'The people in your life, remembered — together.',
	'auth.shell.blurb':
		'One quiet place for what a family knows about the people around it. Written down once, kept by all of you, seen by nobody else.',
	'auth.shell.footer': 'Self-hosted · your hardware · no telemetry',
	'auth.setup.title': 'Set up · Stella',
	'auth.setup.heading': 'Welcome to Stella',
	'auth.setup.intro': 'Create your household and admin account to get started.',
	'auth.setup.householdName': 'Household name',
	'auth.setup.yourName': 'Your name',
	'auth.setup.submit': 'Create household',
	'auth.setup.needHousehold': 'Please name your household.',
	'auth.setup.needName': 'Please enter your name.',
	'auth.setup.needEmail': 'Please enter a valid email.',
	'auth.setup.needPassword': 'Use at least 8 characters.',
	'auth.setup.invalidInput': 'Invalid input.',
	'auth.setup.alreadyDone': 'Setup has already been completed.'
};

/** The key set every translation of this area has to provide. */
export type AuthMessages = typeof auth;
