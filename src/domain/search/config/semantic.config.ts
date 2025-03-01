/**
 * Semantic configuration
 * Defines semantic groups and synonym mappings for search enhancement
 */

/**
 * Semantic group interface
 * Defines a group of semantically related words
 */
export interface SemanticGroup {
	/**
	 * Words in the semantic group with optional weights
	 */
	words: Array<{
		/**
		 * The word
		 */
		word: string;

		/**
		 * Optional weight for the word
		 */
		weight?: number;
	}>;

	/**
	 * Related terms for the semantic group
	 */
	related: string[];

	/**
	 * Icon types associated with the group
	 */
	iconTypes?: string[];

	/**
	 * Weight for the entire group
	 */
	weight: number;

	/**
	 * Additional metadata for the group
	 */
	metadata?: {
		/**
		 * Priority of the group (1-5)
		 */
		priority?: number;

		/**
		 * Description of the group
		 */
		description?: string;
	};
}

/**
 * Semantic groups organized by concept
 */
export const SEMANTIC_GROUPS: Record<string, SemanticGroup> = {
	// UI Elements
	UI_ELEMENTS: {
		words: [
			{ word: 'button', weight: 2.0 },
			{ word: 'icon', weight: 2.0 },
			{ word: 'menu', weight: 1.8 },
			{ word: 'dropdown', weight: 1.7 },
			{ word: 'modal', weight: 1.6 },
			{ word: 'dialog', weight: 1.6 },
			{ word: 'form', weight: 1.5 },
			{ word: 'input', weight: 1.5 },
			{ word: 'checkbox', weight: 1.5 },
			{ word: 'toggle', weight: 1.5 },
		],
		related: ['interface', 'component', 'element', 'control', 'widget'],
		iconTypes: ['ui', 'interface', 'component'],
		weight: 1.8,
		metadata: {
			priority: 4,
			description: 'UI elements and components',
		},
	},

	// Navigation
	NAVIGATION: {
		words: [
			{ word: 'arrow', weight: 2.0 },
			{ word: 'navigation', weight: 2.0 },
			{ word: 'menu', weight: 1.8 },
			{ word: 'back', weight: 1.7 },
			{ word: 'forward', weight: 1.7 },
			{ word: 'up', weight: 1.5 },
			{ word: 'down', weight: 1.5 },
			{ word: 'left', weight: 1.5 },
			{ word: 'right', weight: 1.5 },
			{ word: 'home', weight: 1.8 },
		],
		related: ['direction', 'move', 'navigate', 'go', 'browse'],
		iconTypes: ['navigation', 'arrows', 'direction'],
		weight: 1.7,
		metadata: {
			priority: 4,
			description: 'Navigation and directional concepts',
		},
	},

	// Actions
	ACTIONS: {
		words: [
			{ word: 'add', weight: 2.0 },
			{ word: 'delete', weight: 2.0 },
			{ word: 'remove', weight: 1.9 },
			{ word: 'edit', weight: 1.8 },
			{ word: 'save', weight: 1.8 },
			{ word: 'cancel', weight: 1.7 },
			{ word: 'close', weight: 1.7 },
			{ word: 'open', weight: 1.7 },
			{ word: 'search', weight: 1.8 },
			{ word: 'refresh', weight: 1.6 },
		],
		related: ['action', 'perform', 'do', 'execute', 'trigger'],
		iconTypes: ['action', 'operation', 'function'],
		weight: 1.9,
		metadata: {
			priority: 5,
			description: 'User actions and operations',
		},
	},

	// Communication
	COMMUNICATION: {
		words: [
			{ word: 'message', weight: 2.0 },
			{ word: 'email', weight: 2.0 },
			{ word: 'chat', weight: 1.9 },
			{ word: 'phone', weight: 1.8 },
			{ word: 'call', weight: 1.8 },
			{ word: 'comment', weight: 1.7 },
			{ word: 'notification', weight: 1.8 },
			{ word: 'alert', weight: 1.7 },
			{ word: 'share', weight: 1.7 },
			{ word: 'send', weight: 1.6 },
		],
		related: ['communicate', 'contact', 'notify', 'inform', 'connect'],
		iconTypes: ['communication', 'message', 'notification'],
		weight: 1.7,
		metadata: {
			priority: 4,
			description: 'Communication and messaging concepts',
		},
	},

	// Media
	MEDIA: {
		words: [
			{ word: 'image', weight: 2.0 },
			{ word: 'video', weight: 2.0 },
			{ word: 'audio', weight: 1.9 },
			{ word: 'music', weight: 1.8 },
			{ word: 'photo', weight: 1.8 },
			{ word: 'camera', weight: 1.8 },
			{ word: 'play', weight: 1.7 },
			{ word: 'pause', weight: 1.7 },
			{ word: 'stop', weight: 1.6 },
			{ word: 'record', weight: 1.6 },
		],
		related: ['media', 'multimedia', 'file', 'content', 'entertainment'],
		iconTypes: ['media', 'multimedia', 'player'],
		weight: 1.6,
		metadata: {
			priority: 3,
			description: 'Media and multimedia concepts',
		},
	},

	// Files
	FILES: {
		words: [
			{ word: 'file', weight: 2.0 },
			{ word: 'document', weight: 2.0 },
			{ word: 'folder', weight: 1.9 },
			{ word: 'save', weight: 1.8 },
			{ word: 'download', weight: 1.8 },
			{ word: 'upload', weight: 1.8 },
			{ word: 'attachment', weight: 1.7 },
			{ word: 'export', weight: 1.6 },
			{ word: 'import', weight: 1.6 },
			{ word: 'archive', weight: 1.5 },
		],
		related: ['storage', 'data', 'document', 'content', 'attachment'],
		iconTypes: ['file', 'document', 'folder'],
		weight: 1.6,
		metadata: {
			priority: 3,
			description: 'File and document management',
		},
	},
};

/**
 * Synonym groups for related terms
 */
export const SYNONYM_GROUPS: Record<string, string[]> = {
	DELETE: ['delete', 'remove', 'trash', 'erase', 'clear'],
	ADD: ['add', 'create', 'new', 'plus', 'insert'],
	EDIT: ['edit', 'modify', 'change', 'update', 'alter'],
	SAVE: ['save', 'store', 'keep', 'preserve', 'retain'],
	SEARCH: ['search', 'find', 'lookup', 'seek', 'query'],
	SETTINGS: ['settings', 'preferences', 'options', 'configuration', 'setup'],
	USER: ['user', 'person', 'profile', 'account', 'member'],
	NOTIFICATION: ['notification', 'alert', 'message', 'reminder', 'update'],
	SHARE: ['share', 'send', 'distribute', 'publish', 'broadcast'],
	DOWNLOAD: ['download', 'get', 'fetch', 'retrieve', 'obtain'],
};

/**
 * Direct synonym mappings
 */
export const SYNONYM_MAP: Record<string, string[]> = {
	delete: ['remove', 'trash', 'erase'],
	remove: ['delete', 'trash', 'erase'],
	add: ['create', 'new', 'plus'],
	create: ['add', 'new', 'make'],
	edit: ['modify', 'change', 'update'],
	save: ['store', 'keep', 'preserve'],
	search: ['find', 'lookup', 'seek'],
	settings: ['preferences', 'options', 'config'],
	user: ['person', 'profile', 'account'],
	notification: ['alert', 'message', 'reminder'],
	share: ['send', 'distribute', 'publish'],
	download: ['get', 'fetch', 'retrieve'],
	upload: ['send', 'put', 'transfer'],
	message: ['chat', 'comment', 'text'],
	image: ['picture', 'photo', 'graphic'],
	video: ['movie', 'clip', 'film'],
	audio: ['sound', 'music', 'voice'],
	file: ['document', 'item', 'attachment'],
	folder: ['directory', 'collection', 'group'],
	arrow: ['pointer', 'direction', 'indicator'],
	menu: ['list', 'options', 'selections'],
	button: ['control', 'trigger', 'action'],
	icon: ['symbol', 'glyph', 'image'],
};

/**
 * Semantic search weight configuration
 */
export const SEMANTIC_WEIGHTS = {
	exactMatch: 1.0,
	synonymMatch: 0.9,
	conceptRelation: 0.8,
	semanticGroup: 0.7,
	categoryMatch: 0.6,
	multiTerm: 0.5,
	compoundMatch: 0.4,
	semanticMatch: 0.3,
	abstractConcept: 0.2,
	concreteMatch: 0.8,
};
