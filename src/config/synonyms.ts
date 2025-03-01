import { SynonymConfig } from '../types/synonyms';

/**
 * Enhanced synonym configuration for search matching
 */
export const synonyms: SynonymConfig = {
	// Core synonyms for direct matching
	words: {
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
	},

	// Semantic groups for broader matching
	groups: {
		ui: ['interface', 'layout', 'design', 'screen'],
		status: ['state', 'condition', 'indicator'],
		action: ['operation', 'task', 'function', 'activity'],
		data: ['information', 'content', 'record', 'file'],
		communication: ['message', 'notification', 'alert', 'chat', 'social'],
		development: ['programming', 'coding', 'software', 'development'],
		media: ['multimedia', 'content', 'player', 'stream'],
		security: ['protection', 'safety', 'privacy', 'secure'],
		social: ['share', 'network', 'community', 'profile', 'connect', 'follow', 'like', 'comment', 'post', 'friend', 'group'],
		platform: ['twitter', 'facebook', 'instagram', 'linkedin', 'wechat', 'snapchat'],
		interaction: ['like', 'share', 'comment', 'follow', 'post', 'react', 'engage'],
	},
} as const;
