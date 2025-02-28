import { SynonymMap } from '../types';

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

	// Social Actions
	share: [
		'forward',
		'distribute',
		'spread',
		'repost',
		'retweet',
		'share-box',
		'share-circle',
		'share-forward',
		'share-2',
		'send',
		'publish',
		'broadcast',
	],
	like: ['favorite', 'heart', 'thumbsup', 'upvote', 'thumb-up', 'love', 'appreciate', 'hearts', 'thumbs-up'],
	dislike: ['thumbsdown', 'thumb-down', 'downvote', 'unlike', 'thumbs-down', 'negative'],
	comment: ['reply', 'respond', 'feedback', 'discuss', 'reply-all', 'message', 'chat', 'conversation', 'discussion'],
	follow: ['subscribe', 'track', 'watch', 'friend', 'connect', 'following', 'follower', 'subscription'],
	post: ['publish', 'upload', 'create', 'submit', 'send', 'share', 'broadcast', 'content'],

	// Social Elements
	social: ['community', 'network', 'connect', 'platform', 'social-network', 'social-media', 'social-platform'],
	profile: ['account', 'identity', 'personal', 'bio', 'avatar', 'user', 'profile-page', 'user-info'],
	friend: ['contact', 'connection', 'follower', 'peer', 'friend-list', 'buddy', 'connection-list'],
	group: ['community', 'circle', 'team', 'channel', 'group-chat', 'collection', 'gathering'],

	// Social Platforms
	twitter: ['tweet', 'twitter-x', 'x-social', 'twitter-social', 'twitter-share', 'twitter-post'],
	facebook: ['fb', 'facebook-social', 'meta', 'facebook-share', 'facebook-post', 'facebook-like'],
	instagram: ['ig', 'insta', 'instagram-social', 'instagram-post', 'instagram-share', 'instagram-story'],
	wechat: ['weixin', 'wechat-social', 'wechat-channels', 'wechat-share', 'wechat-post'],
	snapchat: ['snap', 'snapchat-social', 'ghost', 'snapchat-story', 'snapchat-share'],

	// Media specific
	multimedia: ['media', 'content', 'file', 'asset', 'resource'],
	player: ['playback', 'stream', 'play', 'audio-player', 'media-player'],
};

/**
 * Synonym group configuration
 */
export const SYNONYM_GROUPS = {
	ui: ['interface', 'layout', 'design', 'screen'],
	status: ['state', 'condition', 'indicator'],
	action: ['operation', 'task', 'function', 'activity'],
	data: ['information', 'content', 'record', 'file'],
	communication: ['message', 'notification', 'alert', 'chat', 'social'],
	development: ['programming', 'coding', 'software', 'development'],
	media: ['multimedia', 'content', 'player', 'stream'],
	security: ['protection', 'safety', 'privacy', 'secure'],
	social: [
		'share',
		'network',
		'community',
		'profile',
		'connect',
		'follow',
		'like',
		'comment',
		'post',
		'friend',
		'group',
		'social-network',
		'social-media',
	],
	platform: ['twitter', 'facebook', 'instagram', 'linkedin', 'wechat', 'snapchat', 'social', 'social-platform'],
	interaction: ['like', 'share', 'comment', 'follow', 'post', 'react', 'engage', 'interact', 'respond'],
} as const satisfies Record<string, readonly string[]>;
