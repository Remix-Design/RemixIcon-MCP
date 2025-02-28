import { SemanticGroupConfig, SynonymGroupMap, SynonymMap } from '../types';

/**
 * Enhanced semantic groups aligned with icon catalog
 * Includes both concrete and abstract concepts
 */
export const SEMANTIC_GROUPS: SemanticGroupConfig = {
	// Abstract Concepts
	success: {
		words: [
			{ word: 'success', weight: 2.0 },
			{ word: 'achievement', weight: 1.9 },
			{ word: 'victory', weight: 1.9 },
			{ word: 'win', weight: 1.8 },
			{ word: 'accomplish', weight: 1.8 },
			{ word: 'triumph', weight: 1.8 },
		],
		weight: 2.0,
		related: ['trophy', 'medal', 'star', 'certificate', 'award'],
		iconTypes: ['trophy-line', 'medal-line', 'star-line', 'award-line'],
		metadata: {
			description: 'Icons representing success and achievement',
			category: 'Business',
			priority: 2,
		},
	},

	// Concrete Categories
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
			// Adding security concepts
			{ word: 'security', weight: 1.5 },
			{ word: 'protection', weight: 1.4 },
			{ word: 'safety', weight: 1.4 },
			{ word: 'guard', weight: 1.3 },
		],
		weight: 1.5,
		related: ['settings', 'admin', 'control', 'shield', 'lock', 'key', 'fingerprint'],
		iconTypes: ['settings', 'control', 'system', 'admin', 'shield-line', 'lock-line', 'key-line'],
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
			{ word: 'document', weight: 1.6 },
			{ word: 'file', weight: 1.6 },
			{ word: 'folder', weight: 1.5 },
			{ word: 'text', weight: 1.4 },
			{ word: 'pdf', weight: 1.4 },
			{ word: 'doc', weight: 1.4 },
			{ word: 'operation', weight: 1.4 },
			{ word: 'management', weight: 1.3 },
		],
		weight: 1.5,
		related: ['file', 'editor', 'text', 'operation'],
		iconTypes: ['file', 'folder', 'document', 'text', 'operation'],
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
			{ word: 'communication', weight: 1.6 },
			{ word: 'chat', weight: 1.5 },
			{ word: 'message', weight: 1.5 },
			{ word: 'mail', weight: 1.5 },
			{ word: 'email', weight: 1.4 },
			{ word: 'notification', weight: 1.4 },
		],
		weight: 1.5,
		related: ['message', 'notification', 'chat', 'social'],
		iconTypes: ['chat', 'message', 'mail', 'notification'],
		metadata: {
			category: 'Communication',
			priority: 2,
		},
	},

	media: {
		words: [
			{ word: 'multimedia', weight: 1.5 },
			{ word: 'image', weight: 1.4 },
			{ word: 'video', weight: 1.4 },
			{ word: 'music', weight: 1.3 },
			{ word: 'audio', weight: 1.3 },
			{ word: 'player', weight: 1.3 },
		],
		weight: 1.3,
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

	social: {
		words: [
			// 核心社交动作
			{ word: 'share', weight: 2.2 },
			{ word: 'like', weight: 2.2 },
			{ word: 'comment', weight: 2.2 },
			{ word: 'social', weight: 2.1 },
			{ word: 'network', weight: 2.1 },
			// 具体动作
			{ word: 'heart', weight: 2.0 },
			{ word: 'thumbsup', weight: 2.0 },
			{ word: 'thumb-up', weight: 2.0 },
			{ word: 'reply', weight: 2.0 },
			{ word: 'forward', weight: 2.0 },
			{ word: 'repost', weight: 2.0 },
			// 社交功能
			{ word: 'profile', weight: 1.9 },
			{ word: 'follow', weight: 1.9 },
			{ word: 'community', weight: 1.9 },
			{ word: 'connect', weight: 1.9 },
			{ word: 'post', weight: 1.9 },
			// 社交关系
			{ word: 'friend', weight: 1.8 },
			{ word: 'group', weight: 1.8 },
			// 社交平台
			{ word: 'twitter', weight: 1.7 },
			{ word: 'facebook', weight: 1.7 },
			{ word: 'instagram', weight: 1.7 },
			{ word: 'wechat', weight: 1.7 },
			{ word: 'snapchat', weight: 1.7 },
		],
		weight: 2.2,
		related: ['communication', 'user', 'share', 'profile', 'network', 'interaction'],
		iconTypes: [
			// 分享相关
			'share',
			'share-box',
			'share-circle',
			'share-forward',
			'share-2',
			'stackshare',
			'forward',
			'repost',
			'send',
			// 点赞相关
			'thumb-up',
			'thumb-down',
			'heart',
			'like',
			'favorite',
			'thumbs-up',
			'thumbs-down',
			'hearts',
			'dislike',
			// 评论相关
			'comment',
			'reply',
			'reply-all',
			'chat',
			'message',
			'discuss',
			// 社交功能
			'user',
			'profile',
			'group',
			'follow',
			'friend',
			'account',
			'avatar',
			// 社交平台
			'twitter',
			'facebook',
			'instagram',
			'wechat',
			'snapchat',
			'weixin',
			'fb',
			'meta',
			'tweet',
		],
		metadata: {
			category: 'Social',
			priority: 5,
		},
	},

	// Cross-category semantic groups with enhanced weights
	status: {
		words: [
			{ word: 'status', weight: 1.6 },
			{ word: 'state', weight: 1.5 },
			{ word: 'condition', weight: 1.5 },
			{ word: 'progress', weight: 1.8 },
			{ word: 'growth', weight: 1.7 },
			{ word: 'improvement', weight: 1.6 },
			{ word: 'development', weight: 1.6 },
			{ word: 'loading', weight: 1.5 },
		],
		weight: 1.6,
		related: ['system', 'feedback', 'notification', 'chart', 'graph', 'arrow-up', 'trending-up'],
		iconTypes: ['status', 'progress', 'loading', 'line-chart-line', 'bar-chart-line', 'arrow-up-line'],
		metadata: {
			priority: 2,
		},
	},

	time: {
		words: [
			{ word: 'time', weight: 1.7 },
			{ word: 'process', weight: 1.6 },
			{ word: 'duration', weight: 1.5 },
			{ word: 'schedule', weight: 1.5 },
			{ word: 'period', weight: 1.4 },
			{ word: 'timing', weight: 1.4 },
		],
		weight: 1.6,
		related: ['clock', 'timer', 'hourglass', 'calendar', 'loading'],
		iconTypes: ['time-line', 'timer-line', 'hourglass-line'],
		metadata: {
			category: 'System',
			priority: 2,
		},
	},

	emotion: {
		words: [
			{ word: 'emotion', weight: 1.8 },
			{ word: 'mood', weight: 1.7 },
			{ word: 'feeling', weight: 1.7 },
			{ word: 'expression', weight: 1.6 },
			{ word: 'sentiment', weight: 1.6 },
		],
		weight: 1.7,
		related: ['smile', 'laugh', 'sad', 'angry', 'face'],
		iconTypes: ['emotion-line', 'emotion-happy-line', 'emotion-sad-line'],
		metadata: {
			category: 'User & Faces',
			priority: 2,
		},
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

	interaction: {
		words: [
			{ word: 'interaction', weight: 1.5 },
			{ word: 'engage', weight: 1.4 },
			{ word: 'react', weight: 1.4 },
			{ word: 'response', weight: 1.4 },
			{ word: 'action', weight: 1.3 },
		],
		weight: 1.4,
		related: ['social', 'communication', 'feedback'],
		iconTypes: ['like', 'comment', 'share', 'follow'],
	},

	sharing: {
		words: [
			{ word: 'sharing', weight: 1.5 },
			{ word: 'distribute', weight: 1.4 },
			{ word: 'spread', weight: 1.4 },
			{ word: 'forward', weight: 1.4 },
			{ word: 'repost', weight: 1.4 },
		],
		weight: 1.4,
		related: ['social', 'communication', 'network'],
		iconTypes: ['share', 'forward', 'repost', 'send'],
	},
};

/**
 * Semantic search weight configuration
 */
export const SEMANTIC_WEIGHTS = {
	exactMatch: 1.0,
	synonymMatch: 0.8,
	relatedMatch: 0.7,
	categoryMatch: 0.5,
	contextMatch: 0.4,
	abstractConceptMatch: 0.9,
	concreteMatch: 0.8,
};

/**
 * Synonym mapping for enhanced search matching
 */
export const SYNONYM_MAP: SynonymMap = {
	success: ['achievement', 'victory', 'accomplishment', 'triumph', 'win'],
	progress: ['growth', 'advancement', 'development', 'improvement'],
	security: ['protection', 'safety', 'guard', 'defense'],
	emotion: ['mood', 'feeling', 'expression', 'sentiment'],
	time: ['duration', 'period', 'schedule', 'timing'],
	share: ['distribute', 'spread', 'forward', 'repost'],
	communication: ['chat', 'message', 'mail', 'notification'],
	social: ['network', 'community', 'connect', 'interact'],
};

/**
 * Contextual synonym groups for semantic search
 */
export const SYNONYM_GROUPS: SynonymGroupMap = {
	business_success: ['trophy', 'medal', 'award', 'certificate', 'star'],
	business_growth: ['chart', 'graph', 'trending', 'statistics', 'analytics'],
	system_security: ['shield', 'lock', 'key', 'fingerprint', 'password'],
	time_process: ['clock', 'timer', 'hourglass', 'calendar', 'schedule'],
	user_emotion: ['smile', 'laugh', 'happy', 'sad', 'angry', 'face'],
	social_interaction: ['like', 'comment', 'share', 'follow', 'react'],
	communication_tools: ['chat', 'message', 'mail', 'notification', 'alert'],
};
