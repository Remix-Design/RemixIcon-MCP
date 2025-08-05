import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RegionCoordinatorService, RegionCoordinatorDO } from '../../src/infrastructure/distributed/region-coordinator.service';
import { ConsoleLogger, LogLevel } from '../../src/infrastructure/logging/logger';

describe('Region Coordination Tests', () => {
	let logger: ConsoleLogger;
	let mockEnv: any;
	let mockTelemetryService: any;
	let regionCoordinatorService: RegionCoordinatorService;
	let mockDurableObjectStub: any;

	beforeEach(() => {
		logger = new ConsoleLogger(LogLevel.DEBUG);
		
		// Mock Durable Object stub
		mockDurableObjectStub = {
			registerRegion: vi.fn(),
			heartbeat: vi.fn(),
			getOptimalRegion: vi.fn(),
			synchronizeData: vi.fn(),
			getCoordinationState: vi.fn(),
			handleFailover: vi.fn()
		};

		// Mock environment with Durable Object binding
		mockEnv = {
			REGION_COORDINATOR: {
				idFromName: vi.fn().mockReturnValue('coordinator-id'),
				get: vi.fn().mockReturnValue(mockDurableObjectStub)
			},
			CF_REGION: 'us-east-1',
			CF_COLO: 'DFW'
		};

		// Mock telemetry service
		mockTelemetryService = {
			recordMetric: vi.fn(),
			recordEvent: vi.fn(),
			startTrace: vi.fn().mockReturnValue({ end: vi.fn() })
		};

		// Initialize service
		regionCoordinatorService = new RegionCoordinatorService(
			logger,
			mockEnv,
			mockTelemetryService,
			{
				regionId: 'us-east-1',
				regionName: 'US East 1',
				location: 'DFW',
				capabilities: ['search', 'cache', 'ai']
			}
		);
	});

	describe('RegionCoordinatorService', () => {
		it('should initialize and register region', async () => {
			mockDurableObjectStub.registerRegion.mockResolvedValue({
				success: true,
				regionId: 'us-east-1'
			});

			await regionCoordinatorService.initialize();

			expect(mockDurableObjectStub.registerRegion).toHaveBeenCalledWith(
				expect.objectContaining({
					id: 'us-east-1',
					name: 'US East 1',
					location: 'DFW',
					capabilities: ['search', 'cache', 'ai']
				})
			);
		});

		it('should route requests to optimal region', async () => {
			const mockOptimalRegion = {
				regionId: 'us-west-1',
				region: {
					id: 'us-west-1',
					name: 'US West 1',
					location: 'SFO',
					status: 'active',
					load: 0.3,
					latency: 50,
					lastHeartbeat: Date.now(),
					capabilities: ['search', 'cache'],
					metadata: {}
				}
			};

			mockDurableObjectStub.getOptimalRegion.mockResolvedValue(mockOptimalRegion);

			const result = await regionCoordinatorService.routeRequest(
				'california',
				{ capabilities: ['search'], maxLatency: 100 }
			);

			expect(result).toEqual(mockOptimalRegion);
			expect(mockDurableObjectStub.getOptimalRegion).toHaveBeenCalledWith(
				'california',
				{ capabilities: ['search'], maxLatency: 100 }
			);
		});

		it('should synchronize data across regions', async () => {
			const syncResult = {
				success: true,
				syncedRegions: ['us-west-1', 'eu-west-1'],
				failedRegions: []
			};

			mockDurableObjectStub.synchronizeData.mockResolvedValue(syncResult);

			const result = await regionCoordinatorService.syncData(
				'cache_update',
				{ key: 'test', value: 'data' },
				['us-west-1', 'eu-west-1']
			);

			expect(result).toEqual(syncResult);
			expect(mockDurableObjectStub.synchronizeData).toHaveBeenCalledWith(
				'cache_update',
				{ key: 'test', value: 'data' },
				'us-east-1',
				['us-west-1', 'eu-west-1']
			);
		});

		it('should get coordination state', async () => {
			const mockState = {
				regions: [
					{
						id: 'us-east-1',
						name: 'US East 1',
						status: 'active',
						load: 0.4,
						latency: 45
					},
					{
						id: 'us-west-1',
						name: 'US West 1',
						status: 'active',
						load: 0.3,
						latency: 50
					}
				],
				healthMetrics: {
					totalRegions: 2,
					healthyRegions: 2,
					averageLoad: 0.35,
					averageLatency: 47.5
				}
			};

			mockDurableObjectStub.getCoordinationState.mockResolvedValue(mockState);

			const result = await regionCoordinatorService.getCoordinationState();

			expect(result).toEqual(mockState);
		});

		it('should update health metrics', () => {
			regionCoordinatorService.updateHealthMetrics(0.6, 75, { 
				cpuUsage: 0.4, 
				memoryUsage: 0.5 
			});

			// Health metrics are updated internally and sent via heartbeat
			expect(true).toBe(true); // Basic test that no errors are thrown
		});

		it('should handle coordination service failures gracefully', async () => {
			mockDurableObjectStub.getOptimalRegion.mockRejectedValue(
				new Error('Coordinator unavailable')
			);

			const result = await regionCoordinatorService.routeRequest('test-location');

			expect(result).toBeNull();
		});
	});

	describe('RegionCoordinatorDO', () => {
		let coordinatorDO: RegionCoordinatorDO;
		let mockDurableObjectState: any;
		let mockEnvForDO: any;

		beforeEach(() => {
			mockDurableObjectState = {
				storage: {
					get: vi.fn(),
					put: vi.fn(),
					delete: vi.fn()
				}
			};

			mockEnvForDO = {
				CF_REGION: 'global'
			};

			coordinatorDO = new RegionCoordinatorDO(mockDurableObjectState, mockEnvForDO);
		});

		it('should register new regions', async () => {
			const regionInfo = {
				id: 'us-east-1',
				name: 'US East 1',
				location: 'DFW',
				status: 'active' as const,
				load: 0.3,
				latency: 45,
				capabilities: ['search', 'cache'],
				metadata: {}
			};

			const result = await coordinatorDO.registerRegion(regionInfo);

			expect(result.success).toBe(true);
			expect(result.regionId).toBe('us-east-1');
		});

		it('should handle heartbeats and detect sync requirements', async () => {
			// First register a region
			await coordinatorDO.registerRegion({
				id: 'us-east-1',
				name: 'US East 1',
				location: 'DFW',
				status: 'active',
				load: 0.3,
				latency: 45,
				capabilities: ['search'],
				metadata: {}
			});

			const result = await coordinatorDO.heartbeat('us-east-1', {
				load: 0.4,
				latency: 50,
				status: 'active',
				capabilities: ['search', 'cache']
			});

			expect(result.acknowledged).toBe(true);
			expect(typeof result.syncRequired).toBe('boolean');
		});

		it('should select optimal region using different strategies', async () => {
			// Register multiple regions
			const regions = [
				{
					id: 'us-east-1',
					name: 'US East 1',
					location: 'DFW',
					status: 'active' as const,
					load: 0.6,
					latency: 50,
					capabilities: ['search', 'cache'],
					metadata: {}
				},
				{
					id: 'us-west-1',
					name: 'US West 1',
					location: 'SFO',
					status: 'active' as const,
					load: 0.3,
					latency: 40,
					capabilities: ['search', 'cache', 'ai'],
					metadata: {}
				}
			];

			for (const region of regions) {
				await coordinatorDO.registerRegion(region);
			}

			// Test optimal region selection
			const result = await coordinatorDO.getOptimalRegion(
				'california',
				{ capabilities: ['ai'], maxLatency: 60 }
			);

			expect(result).toBeDefined();
			expect(result?.region.capabilities).toContain('ai');
		});

		it('should synchronize data across multiple regions', async () => {
			// Register regions
			const regions = ['us-east-1', 'us-west-1', 'eu-west-1'];
			
			for (const regionId of regions) {
				await coordinatorDO.registerRegion({
					id: regionId,
					name: `Region ${regionId}`,
					location: 'unknown',
					status: 'active',
					load: 0.3,
					latency: 50,
					capabilities: ['search'],
					metadata: {}
				});
			}

			const result = await coordinatorDO.synchronizeData(
				'cache_invalidation',
				{ keys: ['icon1', 'icon2'] },
				'us-east-1',
				['us-west-1', 'eu-west-1']
			);

			expect(result.success).toBeDefined();
			expect(result.syncedRegions).toBeDefined();
			expect(result.failedRegions).toBeDefined();
			expect(result.syncedRegions.length + result.failedRegions.length).toBeGreaterThan(0);
		});

		it('should handle failover scenarios', async () => {
			// Register regions
			const regions = [
				{
					id: 'primary',
					name: 'Primary Region',
					location: 'DFW',
					status: 'active' as const,
					load: 0.9,
					latency: 100,
					capabilities: ['search'],
					metadata: {}
				},
				{
					id: 'backup',
					name: 'Backup Region',
					location: 'SFO',
					status: 'active' as const,
					load: 0.2,
					latency: 50,
					capabilities: ['search', 'cache'],
					metadata: {}
				}
			];

			for (const region of regions) {
				await coordinatorDO.registerRegion(region);
			}

			const result = await coordinatorDO.handleFailover('primary');

			expect(result.newPrimaryRegion).toBe('backup');
			expect(result.affectedRegions).toContain('backup');
		});

		it('should provide coordination state and health metrics', async () => {
			// Register a few regions
			const regions = [
				{
					id: 'region1',
					name: 'Region 1',
					location: 'DFW',
					status: 'active' as const,
					load: 0.4,
					latency: 45,
					capabilities: ['search'],
					metadata: {}
				},
				{
					id: 'region2',
					name: 'Region 2',
					location: 'SFO',
					status: 'degraded' as const,
					load: 0.8,
					latency: 80,
					capabilities: ['search'],
					metadata: {}
				}
			];

			for (const region of regions) {
				await coordinatorDO.registerRegion(region);
			}

			const state = await coordinatorDO.getCoordinationState();

			expect(state.regions).toHaveLength(2);
			expect(state.healthMetrics.totalRegions).toBe(2);
			expect(state.healthMetrics.healthyRegions).toBe(1); // Only 'active' regions are healthy
			expect(state.loadBalancing).toBeDefined();
			expect(state.syncState).toBeDefined();
		});

		it('should handle coordination messages', async () => {
			// Register a region first
			await coordinatorDO.registerRegion({
				id: 'test-region',
				name: 'Test Region',
				location: 'TEST',
				status: 'active',
				load: 0.3,
				latency: 45,
				capabilities: ['search'],
				metadata: {}
			});

			const heartbeatMessage = {
				type: 'heartbeat' as const,
				sourceRegion: 'test-region',
				timestamp: Date.now(),
				correlationId: 'test-123',
				payload: {
					load: 0.4,
					latency: 50,
					status: 'active',
					capabilities: ['search', 'cache']
				}
			};

			const result = await coordinatorDO.handleCoordinationMessage(heartbeatMessage);

			expect(result.acknowledged).toBe(true);
		});
	});

	describe('Integration Scenarios', () => {
		it('should handle complete region lifecycle', async () => {
			mockDurableObjectStub.registerRegion.mockResolvedValue({
				success: true,
				regionId: 'us-east-1'
			});

			mockDurableObjectStub.heartbeat.mockResolvedValue({
				acknowledged: true,
				syncRequired: false
			});

			// 1. Initialize region
			await regionCoordinatorService.initialize();

			// 2. Update health metrics
			regionCoordinatorService.updateHealthMetrics(0.5, 60, { 
				activeConnections: 100 
			});

			// 3. Route requests
			mockDurableObjectStub.getOptimalRegion.mockResolvedValue({
				regionId: 'us-west-1',
				region: { id: 'us-west-1', name: 'US West 1' }
			});

			const routingResult = await regionCoordinatorService.routeRequest('california');
			expect(routingResult).toBeDefined();

			// 4. Sync data
			mockDurableObjectStub.synchronizeData.mockResolvedValue({
				success: true,
				syncedRegions: ['us-west-1'],
				failedRegions: []
			});

			const syncResult = await regionCoordinatorService.syncData(
				'index_update',
				{ version: 2, changes: ['icon1', 'icon2'] }
			);

			expect(syncResult.success).toBe(true);
		});

		it('should demonstrate load balancing across regions', async () => {
			const coordinatorDO = new RegionCoordinatorDO({} as any, {} as any);

			// Register regions with different loads
			const regions = [
				{ id: 'low-load', load: 0.2, latency: 50 },
				{ id: 'medium-load', load: 0.5, latency: 45 },
				{ id: 'high-load', load: 0.8, latency: 40 }
			];

			for (const region of regions) {
				await coordinatorDO.registerRegion({
					...region,
					name: `Region ${region.id}`,
					location: 'TEST',
					status: 'active',
					capabilities: ['search'],
					metadata: {}
				});
			}

			// Request optimal region multiple times
			const selections = [];
			for (let i = 0; i < 10; i++) {
				const result = await coordinatorDO.getOptimalRegion();
				if (result) {
					selections.push(result.regionId);
				}
			}

			// Should prefer regions with lower load
			expect(selections.filter(id => id === 'low-load').length)
				.toBeGreaterThan(selections.filter(id => id === 'high-load').length);
		});
	});
});