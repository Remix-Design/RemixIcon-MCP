import { SemanticGroupConfig } from '../types';

/**
 * Enhanced semantic groups aligned with icon catalog
 */
export const SEMANTIC_GROUPS: SemanticGroupConfig = {
	design: {
		words: [
			{ word: 'design', weight: 1.5 },
			{ word: 'layout', weight: 1.4 },
			{ word: 'grid', weight: 1.3 },
			{ word: 'ruler', weight: 1.3 },
			{ word: 'paint', weight: 1.3 },
			{ word: 'brush', weight: 1.3 },
			{ word: 'color', weight: 1.3 },
			{ word: 'style', weight: 1.3 },
			{ word: 'theme', weight: 1.3 },
		],
		weight: 1.4,
		related: ['editor', 'system', 'development'],
		iconTypes: ['layout', 'grid', 'ruler', 'paint', 'brush', 'color'],
		metadata: {
			category: 'Design',
			priority: 1,
		},
	},
	system: {
		words: [
			{ word: 'system', weight: 1.5 },
			{ word: 'settings', weight: 1.4 },
			{ word: 'control', weight: 1.4 },
			{ word: 'config', weight: 1.3 },
			{ word: 'preferences', weight: 1.3 },
			{ word: 'admin', weight: 1.3 },
		],
		weight: 1.4,
		related: ['settings', 'admin', 'control'],
		iconTypes: ['settings', 'control', 'system', 'admin'],
		metadata: {
			category: 'System',
			priority: 1,
		},
	},
	development: {
		words: [
			{ word: 'development', weight: 1.5 },
			{ word: 'code', weight: 1.4 },
			{ word: 'programming', weight: 1.4 },
			{ word: 'terminal', weight: 1.4 },
			{ word: 'git', weight: 1.3 },
			{ word: 'debug', weight: 1.3 },
		],
		weight: 1.4,
		related: ['editor', 'system', 'terminal'],
		iconTypes: ['code', 'terminal', 'git', 'debug'],
		metadata: {
			category: 'Development',
			priority: 1,
		},
	},
	document: {
		words: [
			{ word: 'document', weight: 1.5 },
			{ word: 'file', weight: 1.4 },
			{ word: 'folder', weight: 1.4 },
			{ word: 'text', weight: 1.3 },
			{ word: 'pdf', weight: 1.3 },
			{ word: 'doc', weight: 1.3 },
		],
		weight: 1.4,
		related: ['file', 'editor', 'text'],
		iconTypes: ['file', 'folder', 'document', 'text'],
		metadata: {
			category: 'Document',
			priority: 1,
		},
	},
	business: {
		words: [
			{ word: 'business', weight: 1.5 },
			{ word: 'chart', weight: 1.4 },
			{ word: 'graph', weight: 1.4 },
			{ word: 'analytics', weight: 1.4 },
			{ word: 'presentation', weight: 1.3 },
			{ word: 'report', weight: 1.3 },
		],
		weight: 1.4,
		related: ['chart', 'finance', 'analytics'],
		iconTypes: ['chart', 'graph', 'presentation', 'report'],
		metadata: {
			category: 'Business',
			priority: 1,
		},
	},
	communication: {
		words: [
			{ word: 'communication', weight: 1.5 },
			{ word: 'chat', weight: 1.4 },
			{ word: 'message', weight: 1.4 },
			{ word: 'mail', weight: 1.4 },
			{ word: 'email', weight: 1.3 },
			{ word: 'notification', weight: 1.4 },
		],
		weight: 1.4,
		related: ['message', 'notification', 'chat'],
		iconTypes: ['chat', 'message', 'mail', 'notification'],
		metadata: {
			category: 'Communication',
			priority: 1,
		},
	},
	media: {
		words: [
			{ word: 'media', weight: 1.5 },
			{ word: 'image', weight: 1.4 },
			{ word: 'video', weight: 1.4 },
			{ word: 'music', weight: 1.4 },
			{ word: 'audio', weight: 1.3 },
			{ word: 'player', weight: 1.3 },
		],
		weight: 1.4,
		related: ['image', 'video', 'audio'],
		iconTypes: ['image', 'video', 'music', 'player'],
		metadata: {
			category: 'Media',
			priority: 1,
		},
	},
	device: {
		words: [
			{ word: 'device', weight: 1.5 },
			{ word: 'phone', weight: 1.4 },
			{ word: 'mobile', weight: 1.4 },
			{ word: 'tablet', weight: 1.4 },
			{ word: 'computer', weight: 1.3 },
			{ word: 'hardware', weight: 1.3 },
		],
		weight: 1.4,
		related: ['mobile', 'hardware', 'device'],
		iconTypes: ['phone', 'tablet', 'computer', 'device'],
		metadata: {
			category: 'Device',
			priority: 1,
		},
	},
	// Cross-category semantic groups
	status: {
		words: [
			{ word: 'status', weight: 1.4 },
			{ word: 'state', weight: 1.3 },
			{ word: 'condition', weight: 1.3 },
			{ word: 'progress', weight: 1.3 },
			{ word: 'loading', weight: 1.3 },
		],
		weight: 1.3,
		related: ['system', 'feedback', 'notification'],
		iconTypes: ['status', 'progress', 'loading'],
	},
	validation: {
		words: [
			{ word: 'validation', weight: 1.4 },
			{ word: 'check', weight: 1.4 },
			{ word: 'verify', weight: 1.3 },
			{ word: 'confirm', weight: 1.3 },
			{ word: 'valid', weight: 1.3 },
			{ word: 'invalid', weight: 1.3 },
		],
		weight: 1.3,
		related: ['system', 'form', 'feedback'],
		iconTypes: ['check', 'close', 'success', 'error'],
	},
	feedback: {
		words: [
			{ word: 'feedback', weight: 1.4 },
			{ word: 'alert', weight: 1.4 },
			{ word: 'warning', weight: 1.4 },
			{ word: 'error', weight: 1.4 },
			{ word: 'success', weight: 1.4 },
			{ word: 'info', weight: 1.3 },
		],
		weight: 1.3,
		related: ['system', 'notification', 'status'],
		iconTypes: ['alert', 'warning', 'error', 'success', 'info'],
	},
};
