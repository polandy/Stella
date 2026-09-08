import type { AuthMessages } from '../en/auth';

/** German for `messages/en/auth.ts`. */
export const auth: AuthMessages = {
	'auth.signIn': 'Anmelden',
	'auth.signInTitle': 'Anmelden · Stella',
	'auth.signInWithSso': 'Mit SSO anmelden',
	'auth.or': 'oder',
	'auth.email': 'E-Mail',
	'auth.password': 'Passwort',
	'auth.signInAsDemo': 'Als Demo-Benutzer anmelden',
	'auth.demoHint': (p) => `Demodaten sind aktiv (SEED_DEMO). ${p.email}`,
	'auth.invalidInput': 'Bitte gib eine gültige E-Mail-Adresse und ein Passwort ein.',
	'auth.invalidCredentials': 'E-Mail-Adresse oder Passwort stimmt nicht.',
	'auth.sso.failed': 'Die Single-Sign-on-Anmeldung ist fehlgeschlagen. Bitte versuche es erneut.',
	'auth.sso.notAuthorized': 'Dein Konto darf sich hier nicht anmelden.',
	'auth.sso.noAccount':
		'Für dich gibt es noch kein Konto. Bitte eine Administratorin oder einen Administrator um eine Einladung.',
	'auth.shell.tagline': 'Die Menschen in deinem Leben — gemeinsam in Erinnerung behalten.',
	'auth.shell.blurb':
		'Ein ruhiger Ort für alles, was eine Familie über die Menschen um sie herum weiß. Einmal aufgeschrieben, von euch allen bewahrt, von niemandem sonst gesehen.',
	'auth.shell.footer': 'Selbst gehostet · deine Hardware · keine Telemetrie',
	'auth.setup.title': 'Einrichten · Stella',
	'auth.setup.heading': 'Willkommen bei Stella',
	'auth.setup.intro': 'Lege deinen Haushalt und dein Administrator-Konto an, um loszulegen.',
	'auth.setup.householdName': 'Name des Haushalts',
	'auth.setup.yourName': 'Dein Name',
	'auth.setup.submit': 'Haushalt anlegen',
	'auth.setup.needHousehold': 'Bitte gib deinem Haushalt einen Namen.',
	'auth.setup.needName': 'Bitte gib deinen Namen ein.',
	'auth.setup.needEmail': 'Bitte gib eine gültige E-Mail-Adresse ein.',
	'auth.setup.needPassword': 'Verwende mindestens 8 Zeichen.',
	'auth.setup.invalidInput': 'Ungültige Eingabe.',
	'auth.setup.alreadyDone': 'Die Einrichtung ist bereits abgeschlossen.'
};
