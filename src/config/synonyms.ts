import { SynonymGroupMap, SynonymMap } from '../types';

/**
 * Synonym configuration for enhanced search matching
 */
export const SYNONYMS: SynonymMap = {
	// UI/UX related
	interface: ['ui', 'gui', 'layout', 'screen'],
	user: ['client', 'person', 'account'],
	navigation: ['menu', 'nav', 'sidebar', 'drawer'],
	settings: ['preferences', 'config', 'configuration', 'setup'],

	// Status related
	status: ['state', 'condition', 'mode'],
	loading: ['spinner', 'progress', 'wait', 'processing'],
	error: ['mistake', 'fault', 'failure', 'invalid'],
	success: ['complete', 'done', 'finished', 'valid'],

	// Actions
	add: ['create', 'new', 'plus', 'insert'],
	delete: ['remove', 'trash', 'erase'],
	edit: ['modify', 'change', 'update'],
	save: ['store', 'keep', 'preserve'],

	// Data visualization
	chart: ['graph', 'plot', 'diagram'],
	analytics: ['statistics', 'metrics', 'analysis'],
	dashboard: ['panel', 'monitor', 'overview'],

	// Communication
	message: ['notification', 'alert', 'info'],
	chat: ['conversation', 'talk', 'discuss'],
	mail: ['email', 'inbox', 'letter'],

	// Development
	code: ['programming', 'development', 'coding'],
	debug: ['test', 'inspect', 'diagnose'],
	terminal: ['console', 'shell', 'command'],

	// Security
	security: ['protection', 'safety', 'guard'],
	lock: ['secure', 'protect', 'block'],
	authentication: ['login', 'signin', 'auth'],

	// Media
	image: ['picture', 'photo', 'graphic'],
	video: ['movie', 'film', 'clip'],
	audio: ['sound', 'music', 'voice'],

	// Document
	document: ['file', 'doc', 'paper'],
	folder: ['directory', 'catalog', 'category'],
	text: ['content', 'writing', 'word'],
};

/**
 * Synonym groups for semantic matching
 */
export const SYNONYM_GROUPS: SynonymGroupMap = {
	ui: ['interface', 'layout', 'design', 'screen'],
	status: ['state', 'condition', 'indicator'],
	action: ['operation', 'task', 'function'],
	data: ['information', 'content', 'record'],
	communication: ['message', 'notification', 'alert'],
	development: ['programming', 'coding', 'software'],
	media: ['multimedia', 'content', 'file'],
	security: ['protection', 'safety', 'privacy'],
};
