/* To-dos: what the household still owes a person, on the person page (docs/02 §2.26). */

export const todos = {
	'todos.title': 'To do',
	// The card as one line, with nothing open (docs/05 §5.5).
	'todos.none': 'Nothing open.',
	'todos.add': 'To do',
	'todos.form.for': (p: { name: string }) => `To do for ${p.name}`,
	'todos.form.what': 'What is still to do?',
	'todos.form.whatPlaceholder': 'e.g. give the book back',
	'todos.form.by': 'By',
	'todos.form.addDay': 'By a day',
	'todos.form.noDay': 'No day',
	'todos.dueBy': (p: { day: string }) => `by ${p.day}`,
	'todos.overdueSince': (p: { day: string }) => `overdue since ${p.day}`,
	'todos.notedBy': (p: { name: string }) => `noted by ${p.name}`,
	// The checkbox's name: what ticking it does.
	'todos.tick': (p: { title: string }) => `Done: ${p.title}`,
	'todos.edit': (p: { title: string }) => `Change: ${p.title}`,
	'todos.remove': (p: { title: string }) => `Remove: ${p.title}`,
	// The toasts, with *Undo* beside them.
	'todos.done': (p: { title: string }) => `Done: ${p.title}`,
	'todos.removed': 'To-do removed'
};

/** The key set every translation of this area has to provide. */
export type TodosMessages = typeof todos;
