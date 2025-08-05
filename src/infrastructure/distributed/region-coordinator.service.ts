import { DurableObject } from 'cloudflare:workers';
import { ILogger } from '../logging/logger';
import { ErrorHandler, ErrorType } from '../error/error-handler';
import { TelemetryService } from '../observability/telemetry.service';

/**
 * Region information
 */
export interface RegionInfo {
	id: string;
	name: string;
	location: string;
	status: 'active' | 'degraded' | 'offline';
	load: number; // 0-1 scale
	latency: number; // milliseconds
	lastHeartbeat: number;
	capabilities: string[];
	metadata: Record<string, any>;
}

/**
 * Coordination message types
 */
export interface CoordinationMessage {
	type: 'heartbeat' | 'sync_request' | 'sync_response' | 'failover' | 'load_balance' | 'health_check';
	sourceRegion: string;
	targetRegion?: string;
	timestamp: number;
	payload: any;
	correlationId: string;
}

/**
 * Synchronization state
 */
export interface SyncState {
	lastSyncTime: number;
	version: number;
	regions: Record<string, {
		lastSync: number;
		version: number;
		status: 'synced' | 'syncing' | 'out_of_sync';
	}>;
	pendingOperations: Array<{
		id: string;
		operation: string;
		data: any;
		timestamp: number;
		retryCount: number;
	}>;
}

/**
 * Load balancing configuration
 */
interface LoadBalancingConfig {
	strategy: 'round_robin' | 'least_loaded' | 'geographic' | 'weighted';
	weights: Record<string, number>;
	healthCheckInterval: number;
	failoverThreshold: number;
	maxRetries: number;
}

/**
 * Regional cache entry
 */
interface RegionalCacheEntry {
	key: string;
	data: any;
	timestamp: number;
	ttl: number;
	sourceRegion: string;
	syncStatus: 'local' | 'syncing' | 'synced';
}

/**
 * Durable Object for coordinating multi-region operations
 * Handles region registration, health monitoring, and data synchronization
 */
export { RegionCoordinatorDO };

export class RegionCoordinatorDO extends DurableObject {
	private regions = new Map<string, RegionInfo>();
	private syncState: SyncState;
	private loadBalancingConfig: LoadBalancingConfig;
	private regionalCache = new Map<string, RegionalCacheEntry>();
	private heartbeatInterval?: number;
	
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		
		// Initialize sync state
		this.syncState = {
			lastSyncTime: Date.now(),
			version: 1,
			regions: {},
			pendingOperations: []
		};
		
		// Initialize load balancing config
		this.loadBalancingConfig = {
			strategy: 'least_loaded',
			weights: {},
			healthCheckInterval: 30000, // 30 seconds
			failoverThreshold: 0.8, // 80% failure rate
			maxRetries: 3
		};
		
		// Start heartbeat monitoring
		this.startHeartbeatMonitoring();
	}

	/**
	 * Register a region with the coordinator
	 */
	async registerRegion(regionInfo: Omit<RegionInfo, 'lastHeartbeat'>): Promise<{ success: boolean; regionId: string }> {
		const region: RegionInfo = {
			...regionInfo,
			lastHeartbeat: Date.now()
		};
		
		this.regions.set(region.id, region);
		
		// Initialize sync state for new region
		this.syncState.regions[region.id] = {
			lastSync: Date.now(),
			version: this.syncState.version,
			status: 'synced'
		};
		
		// Update load balancing weights
		this.loadBalancingConfig.weights[region.id] = 1.0;
		
		console.log(`Region registered: ${region.id} (${region.name}) at ${region.location}`);
		
		return { success: true, regionId: region.id };
	}

	/**
	 * Handle heartbeat from region
	 */
	async heartbeat(regionId: string, healthData: {
		load: number;
		latency: number;
		status: RegionInfo['status'];
		capabilities: string[];
		metadata?: Record<string, any>;
	}): Promise<{ acknowledged: boolean; syncRequired: boolean }> {
		const region = this.regions.get(regionId);
		if (!region) {
			return { acknowledged: false, syncRequired: false };
		}
		
		// Update region health
		region.load = healthData.load;
		region.latency = healthData.latency;
		region.status = healthData.status;
		region.capabilities = healthData.capabilities;
		region.lastHeartbeat = Date.now();
		
		if (healthData.metadata) {
			region.metadata = { ...region.metadata, ...healthData.metadata };
		}
		
		// Check if sync is required
		const regionSync = this.syncState.regions[regionId];
		const syncRequired = !regionSync || regionSync.version < this.syncState.version;
		
		return { acknowledged: true, syncRequired };
	}

	/**
	 * Get optimal region for request routing
	 */
	async getOptimalRegion(
		clientLocation?: string,
		requirements?: { capabilities?: string[]; maxLatency?: number }
	): Promise<{ regionId: string; region: RegionInfo } | null> {
		const availableRegions = Array.from(this.regions.values()).filter(
			region => region.status === 'active' && this.isRegionHealthy(region)
		);
		
		if (availableRegions.length === 0) {
			return null;
		}
		
		// Filter by requirements
		let candidateRegions = availableRegions;
		
		if (requirements?.capabilities) {
			candidateRegions = candidateRegions.filter(region =>
				requirements.capabilities!.every(cap => region.capabilities.includes(cap))
			);
		}
		
		if (requirements?.maxLatency) {
			candidateRegions = candidateRegions.filter(region =>
				region.latency <= requirements.maxLatency!
			);
		}
		
		if (candidateRegions.length === 0) {
			return null;
		}
		
		// Apply load balancing strategy
		const selectedRegion = this.selectRegionByStrategy(candidateRegions, clientLocation);
		
		return selectedRegion ? { regionId: selectedRegion.id, region: selectedRegion } : null;
	}

	/**
	 * Synchronize data across regions
	 */
	async synchronizeData(
		operation: string,
		data: any,
		sourceRegionId: string,
		targetRegions?: string[]
	): Promise<{ success: boolean; syncedRegions: string[]; failedRegions: string[] }> {
		const syncId = `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
		const targets = targetRegions || Array.from(this.regions.keys()).filter(id => id !== sourceRegionId);
		
		// Add to pending operations
		this.syncState.pendingOperations.push({
			id: syncId,
			operation,
			data,
			timestamp: Date.now(),
			retryCount: 0
		});
		
		const syncPromises = targets.map(async (regionId) => {
			const region = this.regions.get(regionId);
			if (!region || region.status !== 'active') {
				return { regionId, success: false, error: 'Region unavailable' };
			}
			
			try {
				// Update regional sync state
				this.syncState.regions[regionId] = {
					...this.syncState.regions[regionId],
					status: 'syncing'
				};
				
				// Simulate sync operation (in real implementation, this would call the region's endpoint)
				await this.performRegionSync(regionId, operation, data);
				
				this.syncState.regions[regionId] = {
					lastSync: Date.now(),
					version: this.syncState.version,
					status: 'synced'
				};
				
				return { regionId, success: true };
				
			} catch (error) {
				this.syncState.regions[regionId] = {
					...this.syncState.regions[regionId],
					status: 'out_of_sync'
				};
				
				return { regionId, success: false, error: error.message };
			}
		});
		
		const results = await Promise.allSettled(syncPromises);
		const syncedRegions: string[] = [];
		const failedRegions: string[] = [];
		
		results.forEach((result, index) => {
			if (result.status === 'fulfilled' && result.value.success) {
				syncedRegions.push(targets[index]);
			} else {
				failedRegions.push(targets[index]);
			}
		});
		
		// Remove from pending operations
		this.syncState.pendingOperations = this.syncState.pendingOperations.filter(op => op.id !== syncId);
		
		// Update sync version
		if (syncedRegions.length > 0) {
			this.syncState.version++;
			this.syncState.lastSyncTime = Date.now();
		}
		
		return {
			success: failedRegions.length === 0,
			syncedRegions,
			failedRegions
		};
	}

	/**
	 * Handle failover scenario
	 */
	async handleFailover(failedRegionId: string): Promise<{ newPrimaryRegion: string; affectedRegions: string[] }> {
		const failedRegion = this.regions.get(failedRegionId);
		if (!failedRegion) {
			throw new Error(`Unknown region: ${failedRegionId}`);
		}
		
		// Mark region as offline
		failedRegion.status = 'offline';
		failedRegion.lastHeartbeat = 0;
		
		// Find replacement region
		const candidateRegions = Array.from(this.regions.values()).filter(
			region => region.id !== failedRegionId &&
					  region.status === 'active' &&
					  this.isRegionHealthy(region)
		);
		
		if (candidateRegions.length === 0) {
			throw new Error('No healthy regions available for failover');
		}
		
		// Select best replacement based on load and capabilities
		const newPrimaryRegion = candidateRegions.reduce((best, current) => {
			if (current.load < best.load && current.capabilities.length >= best.capabilities.length) {
				return current;
			}
			return best;
		});
		
		// Update load balancing weights
		delete this.loadBalancingConfig.weights[failedRegionId];
		this.redistributeTraffic(failedRegionId, newPrimaryRegion.id);
		
		console.log(`Failover completed: ${failedRegionId} -> ${newPrimaryRegion.id}`);
		
		return {
			newPrimaryRegion: newPrimaryRegion.id,
			affectedRegions: candidateRegions.map(r => r.id)
		};
	}

	/**
	 * Get coordination state and metrics
	 */
	async getCoordinationState(): Promise<{
		regions: RegionInfo[];
		syncState: SyncState;
		loadBalancing: LoadBalancingConfig;
		healthMetrics: {
			totalRegions: number;
			healthyRegions: number;
			averageLoad: number;
			averageLatency: number;
		};
	}> {
		const regions = Array.from(this.regions.values());
		const healthyRegions = regions.filter(r => this.isRegionHealthy(r));
		
		const healthMetrics = {
			totalRegions: regions.length,
			healthyRegions: healthyRegions.length,
			averageLoad: healthyRegions.length > 0 
				? healthyRegions.reduce((sum, r) => sum + r.load, 0) / healthyRegions.length 
				: 0,
			averageLatency: healthyRegions.length > 0 
				? healthyRegions.reduce((sum, r) => sum + r.latency, 0) / healthyRegions.length 
				: 0
		};
		
		return {
			regions,
			syncState: this.syncState,
			loadBalancing: this.loadBalancingConfig,
			healthMetrics
		};
	}

	/**
	 * Handle coordination messages
	 */
	async handleCoordinationMessage(message: CoordinationMessage): Promise<any> {
		switch (message.type) {
			case 'heartbeat':
				return await this.heartbeat(
					message.sourceRegion,
					message.payload
				);
				
			case 'sync_request':
				return await this.synchronizeData(
					message.payload.operation,
					message.payload.data,
					message.sourceRegion,
					message.payload.targetRegions
				);
				
			case 'health_check':
				return await this.getCoordinationState();
				
			case 'failover':
				return await this.handleFailover(message.payload.failedRegion);
				
			case 'load_balance':
				return await this.getOptimalRegion(
					message.payload.clientLocation,
					message.payload.requirements
				);
				
			default:
				throw new Error(`Unknown message type: ${message.type}`);
		}
	}

	/**
	 * Start heartbeat monitoring
	 */
	private startHeartbeatMonitoring(): void {
		this.heartbeatInterval = setInterval(() => {
			this.checkRegionHealth();
		}, this.loadBalancingConfig.healthCheckInterval) as any;
	}

	/**
	 * Check health of all regions
	 */
	private checkRegionHealth(): void {
		const now = Date.now();
		const healthTimeout = this.loadBalancingConfig.healthCheckInterval * 2;
		
		for (const [regionId, region] of this.regions.entries()) {
			if (now - region.lastHeartbeat > healthTimeout) {
				if (region.status === 'active') {
					region.status = 'degraded';
					console.warn(`Region ${regionId} marked as degraded due to missed heartbeats`);
				} else if (region.status === 'degraded' && now - region.lastHeartbeat > healthTimeout * 2) {
					region.status = 'offline';
					console.error(`Region ${regionId} marked as offline`);
					// Trigger failover if needed
					this.handleFailover(regionId).catch(error => {
						console.error(`Failover failed for region ${regionId}:`, error);
					});
				}
			}
		}
	}

	/**
	 * Check if region is healthy
	 */
	private isRegionHealthy(region: RegionInfo): boolean {
		const now = Date.now();
		const healthTimeout = this.loadBalancingConfig.healthCheckInterval * 2;
		
		return region.status === 'active' &&
			   region.load < 0.9 && // Not overloaded
			   now - region.lastHeartbeat < healthTimeout;
	}

	/**
	 * Select region based on load balancing strategy
	 */
	private selectRegionByStrategy(regions: RegionInfo[], clientLocation?: string): RegionInfo | null {
		if (regions.length === 0) return null;
		if (regions.length === 1) return regions[0];
		
		switch (this.loadBalancingConfig.strategy) {
			case 'round_robin':
				// Simple round-robin (stateless implementation)
				return regions[Date.now() % regions.length];
				
			case 'least_loaded':
				return regions.reduce((best, current) => 
					current.load < best.load ? current : best
				);
				
			case 'geographic':
				if (clientLocation) {
					// Find region closest to client (simplified)
					const clientRegion = regions.find(r => 
						r.location.toLowerCase().includes(clientLocation.toLowerCase())
					);
					if (clientRegion) return clientRegion;
				}
				// Fallback to least loaded
				return regions.reduce((best, current) => 
					current.load < best.load ? current : best
				);
				
			case 'weighted':
				// Weighted random selection
				const totalWeight = regions.reduce((sum, region) => 
					sum + (this.loadBalancingConfig.weights[region.id] || 1), 0
				);
				let random = Math.random() * totalWeight;
				
				for (const region of regions) {
					const weight = this.loadBalancingConfig.weights[region.id] || 1;
					random -= weight;
					if (random <= 0) return region;
				}
				return regions[0];
				
			default:
				return regions[0];
		}
	}

	/**
	 * Perform actual region synchronization
	 */
	private async performRegionSync(regionId: string, operation: string, data: any): Promise<void> {
		// In a real implementation, this would make HTTP calls to the region's endpoints
		// For simulation, we'll just add a delay
		await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
		
		// Simulate occasional failures
		if (Math.random() < 0.05) { // 5% failure rate
			throw new Error(`Sync failed for region ${regionId}`);
		}
		
		console.log(`Synced operation '${operation}' to region ${regionId}`);
	}

	/**
	 * Redistribute traffic after failover
	 */
	private redistributeTraffic(failedRegionId: string, newPrimaryRegionId: string): void {
		const failedWeight = this.loadBalancingConfig.weights[failedRegionId] || 0;
		const activeRegions = Array.from(this.regions.values()).filter(r => 
			r.status === 'active' && r.id !== failedRegionId
		);
		
		if (activeRegions.length === 0) return;
		
		// Distribute failed region's weight among active regions
		const additionalWeight = failedWeight / activeRegions.length;
		
		activeRegions.forEach(region => {
			this.loadBalancingConfig.weights[region.id] = 
				(this.loadBalancingConfig.weights[region.id] || 1) + additionalWeight;
		});
		
		console.log(`Redistributed traffic from ${failedRegionId} to ${activeRegions.length} active regions`);
	}
}

/**
 * Region coordinator service for managing distributed operations
 */
export class RegionCoordinatorService {
	private readonly errorHandler: ErrorHandler;
	private coordinatorDO: DurableObjectStub;
	private currentRegion: RegionInfo;
	
	constructor(
		private readonly logger: ILogger,
		private readonly env: Env,
		private readonly telemetryService?: TelemetryService,
		private readonly regionConfig?: {
			regionId: string;
			regionName: string;
			location: string;
			capabilities: string[];
		}
	) {
		this.errorHandler = new ErrorHandler(logger);
		
		// Get Durable Object stub
		const coordinatorId = env.REGION_COORDINATOR?.idFromName('global-coordinator');
		this.coordinatorDO = env.REGION_COORDINATOR?.get(coordinatorId!);
		
		// Initialize current region info
		this.currentRegion = {
			id: regionConfig?.regionId || 'default',
			name: regionConfig?.regionName || 'Default Region',
			location: regionConfig?.location || 'unknown',
			status: 'active',
			load: 0,
			latency: 0,
			lastHeartbeat: Date.now(),
			capabilities: regionConfig?.capabilities || ['search', 'cache'],
			metadata: {}
		};
	}

	/**
	 * Initialize region coordination
	 */
	async initialize(): Promise<void> {
		try {
			// Register this region with coordinator
			const response = await this.coordinatorDO.registerRegion(
				this.currentRegion
			);
			
			if (response.success) {
				this.logger.info('Region registered successfully', {
					regionId: this.currentRegion.id,
					name: this.currentRegion.name,
					location: this.currentRegion.location
				});
				
				// Start heartbeat
				this.startHeartbeat();
			} else {
				throw new Error('Failed to register region');
			}
			
		} catch (error) {
			this.logger.error('Failed to initialize region coordination', { error: error.message });
			throw error;
		}
	}

	/**
	 * Get optimal region for request routing
	 */
	async routeRequest(
		clientLocation?: string,
		requirements?: { capabilities?: string[]; maxLatency?: number }
	): Promise<{ regionId: string; region: RegionInfo } | null> {
		try {
			return await this.coordinatorDO.getOptimalRegion(clientLocation, requirements);
		} catch (error) {
			this.logger.error('Failed to get optimal region', { error: error.message });
			return null;
		}
	}

	/**
	 * Synchronize data across regions
	 */
	async syncData(
		operation: string,
		data: any,
		targetRegions?: string[]
	): Promise<{ success: boolean; syncedRegions: string[]; failedRegions: string[] }> {
		try {
			return await this.coordinatorDO.synchronizeData(
				operation,
				data,
				this.currentRegion.id,
				targetRegions
			);
		} catch (error) {
			this.logger.error('Failed to sync data', { error: error.message });
			return { success: false, syncedRegions: [], failedRegions: targetRegions || [] };
		}
	}

	/**
	 * Get coordination state
	 */
	async getCoordinationState(): Promise<any> {
		try {
			return await this.coordinatorDO.getCoordinationState();
		} catch (error) {
			this.logger.error('Failed to get coordination state', { error: error.message });
			return null;
		}
	}

	/**
	 * Update region health metrics
	 */
	updateHealthMetrics(load: number, latency: number, metadata?: Record<string, any>): void {
		this.currentRegion.load = load;
		this.currentRegion.latency = latency;
		if (metadata) {
			this.currentRegion.metadata = { ...this.currentRegion.metadata, ...metadata };
		}
	}

	/**
	 * Start heartbeat to coordinator
	 */
	private startHeartbeat(): void {
		const sendHeartbeat = async () => {
			try {
				const result = await this.coordinatorDO.heartbeat(this.currentRegion.id, {
					load: this.currentRegion.load,
					latency: this.currentRegion.latency,
					status: this.currentRegion.status,
					capabilities: this.currentRegion.capabilities,
					metadata: this.currentRegion.metadata
				});
				
				if (result.acknowledged) {
					this.logger.debug('Heartbeat acknowledged', { 
						regionId: this.currentRegion.id,
						syncRequired: result.syncRequired
					});
					
					// Handle sync if required
					if (result.syncRequired) {
						// Trigger synchronization process
						this.logger.info('Synchronization required', { regionId: this.currentRegion.id });
					}
				}
				
			} catch (error) {
				this.logger.warn('Heartbeat failed', { 
					regionId: this.currentRegion.id,
					error: error.message 
				});
			}
		};
		
		// Send initial heartbeat
		sendHeartbeat();
		
		// Schedule regular heartbeats
		setInterval(sendHeartbeat, 30000); // Every 30 seconds
	}
}