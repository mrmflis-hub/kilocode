// kilocode_change - new file
/**
 * Performance benchmarks for Multi-Agent Orchestration System
 *
 * Tests performance characteristics of:
 * - Agent spawning
 * - Message routing
 * - Artifact storage (mocked)
 * - Concurrent agent management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import * as os from "node:os"

// Import components under test
import { AgentPoolManager } from "../../AgentPoolManager"
import { MessageRouter } from "../../MessageRouter"
import type { AgentMessage } from "../../MessageRouter"
import type { AgentSpawnConfig } from "../../types"
import { AgentRegistry } from "../../../AgentRegistry"

// Mock RuntimeProcessHandler
interface MockProcessHandler {
	spawnProcess: ReturnType<typeof vi.fn>
	sendMessage: ReturnType<typeof vi.fn>
	dispose: ReturnType<typeof vi.fn>
}

const createMockProcessHandler = (): MockProcessHandler => ({
	spawnProcess: vi.fn().mockResolvedValue(undefined),
	sendMessage: vi.fn().mockResolvedValue(undefined),
	dispose: vi.fn(),
})

// Helper to simulate agent events
const simulateAgentEvent = (
	poolManager: AgentPoolManager,
	agentId: string,
	sessionId: string,
	event: { type: string; error?: { message: string } },
): void => {
	const agent = poolManager.getAgent(agentId)
	if (!agent) return

	agent.lastActivityAt = Date.now()

	if (event.type === "session_created") {
		agent.status = "ready"
		agent.sessionId = sessionId
	} else if (event.type === "complete") {
		agent.status = "ready"
	} else if (event.type === "error") {
		agent.status = "error"
		agent.error = event.error?.message
	}
}

// Create mock FileLockingService (for testing orchestration performance)
const createMockFileLockingService = () => ({
	acquireLock: vi.fn().mockResolvedValue({ success: true, lockId: "lock-1", locked: true }),
	releaseLock: vi.fn().mockResolvedValue(undefined),
	getLockStatus: vi.fn().mockReturnValue({ isLocked: false }),
	releaseAllLocksForAgent: vi.fn().mockResolvedValue(undefined),
	dispose: vi.fn(),
})

// Create mock ArtifactStore (for testing orchestration performance)
interface MockArtifactStore {
	storeArtifact: ReturnType<typeof vi.fn>
	getArtifactSummaries: ReturnType<typeof vi.fn>
	getArtifact: ReturnType<typeof vi.fn>
	initialize: ReturnType<typeof vi.fn>
	dispose: ReturnType<typeof vi.fn>
}

const createMockArtifactStore = (): MockArtifactStore => ({
	storeArtifact: vi.fn().mockResolvedValue({ id: "artifact-1", summary: "test" }),
	getArtifactSummaries: vi.fn().mockResolvedValue([]),
	getArtifact: vi.fn().mockResolvedValue(null),
	initialize: vi.fn().mockResolvedValue(undefined),
	dispose: vi.fn(),
})

// Performance measurement helper
interface PerformanceMetrics {
	operation: string
	durationMs: number
	iterations: number
	averageMs: number
	minMs: number
	maxMs: number
}

const measurePerformance = async (
	operation: string,
	fn: () => Promise<void> | void,
	iterations: number = 100,
): Promise<PerformanceMetrics> => {
	const durations: number[] = []

	for (let i = 0; i < iterations; i++) {
		const start = performance.now()
		await fn()
		const end = performance.now()
		durations.push(end - start)
	}

	const sorted = [...durations].sort((a, b) => a - b)

	return {
		operation,
		durationMs: durations.reduce((a, b) => a + b, 0),
		iterations,
		averageMs: durations.reduce((a, b) => a + b, 0) / iterations,
		minMs: sorted[0],
		maxMs: sorted[sorted.length - 1],
	}
}

// Baseline thresholds (in milliseconds)
const PERFORMANCE_BASELINES = {
	agentSpawn: 50, // Max 50ms for agent spawn operation (mock)
	messageRoute: 10, // Max 10ms for message routing (in-memory)
	artifactStore: 100, // Max 100ms for artifact storage (mock)
	concurrentAgents: 500, // Max 500ms for 5 concurrent agent operations
}

describe("Performance Benchmarks", () => {
	describe("1. Agent Spawning Performance", () => {
		let mockProcessHandler: MockProcessHandler
		let registry: AgentRegistry
		let messageRouter: MessageRouter
		let fileLockingService: ReturnType<typeof createMockFileLockingService>
		let agentPoolManager: AgentPoolManager
		let tempDir: string

		beforeEach(async () => {
			tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "perf-agent-spawn-"))
			mockProcessHandler = createMockProcessHandler()
			registry = new AgentRegistry()
			fileLockingService = createMockFileLockingService()
			messageRouter = new MessageRouter({} as AgentPoolManager, mockProcessHandler as unknown as any)
			agentPoolManager = new AgentPoolManager(
				mockProcessHandler as unknown as any,
				registry,
				messageRouter,
				fileLockingService as unknown as any,
				{ maxConcurrentAgents: 5 },
			)
		})

		afterEach(async () => {
			agentPoolManager.dispose()
			messageRouter.dispose()
			fileLockingService.dispose()
			await fs.rm(tempDir, { recursive: true, force: true })
		})

		it("should spawn agents within performance threshold", async () => {
			const iterations = 50
			const config: AgentSpawnConfig = {
				agentId: "perf-agent",
				role: "architect",
				providerProfile: "anthropic",
				mode: "architect",
				workspace: tempDir,
			}

			const metrics = await measurePerformance(
				"agent-spawn",
				async () => {
					const uniqueId = `perf-agent-${Date.now()}-${Math.random().toString(36).slice(2)}`
					await agentPoolManager.spawnAgent({ ...config, agentId: uniqueId })
				},
				iterations,
			)

			console.log(`Agent Spawn Performance:`, metrics)

			// Verify performance meets baseline
			expect(metrics.averageMs).toBeLessThan(PERFORMANCE_BASELINES.agentSpawn)
		})

		it("should handle rapid sequential spawns efficiently", async () => {
			const start = performance.now()

			// Spawn 5 agents sequentially
			for (let i = 0; i < 5; i++) {
				const uniqueId = `rapid-spawn-${i}-${Date.now()}`
				await agentPoolManager.spawnAgent({
					agentId: uniqueId,
					role: "coder",
					providerProfile: "anthropic",
					mode: "code",
					workspace: tempDir,
				})
			}

			const duration = performance.now() - start

			console.log(`Sequential 5-agent spawn: ${duration.toFixed(2)}ms`)
			expect(duration).toBeLessThan(200) // Should complete in under 200ms
		})

		it("should track active agent count efficiently", async () => {
			// Spawn some agents first
			for (let i = 0; i < 3; i++) {
				const uniqueId = `count-test-${i}-${Date.now()}`
				await agentPoolManager.spawnAgent({
					agentId: uniqueId,
					role: "coder",
					providerProfile: "anthropic",
					mode: "code",
					workspace: tempDir,
				})
			}

			// Measure getActiveAgentCount performance
			const metrics = await measurePerformance(
				"getActiveAgentCount",
				() => {
					agentPoolManager.getActiveAgentCount()
				},
				1000,
			)

			console.log(`getActiveAgentCount Performance:`, metrics)
			expect(metrics.averageMs).toBeLessThan(1) // Should be near-instant
		})

		it("should get agent efficiently", async () => {
			// Spawn some agents first
			for (let i = 0; i < 3; i++) {
				const uniqueId = `get-test-${i}-${Date.now()}`
				await agentPoolManager.spawnAgent({
					agentId: uniqueId,
					role: "coder",
					providerProfile: "anthropic",
					mode: "code",
					workspace: tempDir,
				})
			}

			// Measure getAgent performance
			const metrics = await measurePerformance(
				"getAgent",
				() => {
					agentPoolManager.getAgent("get-test-1-" + (global as any).testTimestamp || "")
				},
				1000,
			)

			console.log(`getAgent Performance:`, metrics)
			expect(metrics.averageMs).toBeLessThan(1) // Should be near-instant
		})
	})

	describe("2. Message Routing Performance", () => {
		let mockProcessHandler: MockProcessHandler
		let messageRouter: MessageRouter
		let agentPoolManager: AgentPoolManager
		let registry: AgentRegistry
		let fileLockingService: ReturnType<typeof createMockFileLockingService>
		let tempDir: string

		beforeEach(async () => {
			tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "perf-msg-"))
			mockProcessHandler = createMockProcessHandler()
			registry = new AgentRegistry()
			fileLockingService = createMockFileLockingService()
			messageRouter = new MessageRouter({} as AgentPoolManager, mockProcessHandler as unknown as any)
			agentPoolManager = new AgentPoolManager(
				mockProcessHandler as unknown as any,
				registry,
				messageRouter,
				fileLockingService as unknown as any,
				{ maxConcurrentAgents: 5 },
			)
			// Set the pool manager reference in message router (like foundation tests)
			// @ts-expect-error - accessing private property for testing
			messageRouter.agentPoolManager = agentPoolManager
		})

		afterEach(async () => {
			messageRouter.dispose()
			agentPoolManager.dispose()
			fileLockingService.dispose()
			await fs.rm(tempDir, { recursive: true, force: true })
		})

		it("should route messages within performance threshold", async () => {
			// Spawn an agent first so routing can succeed
			const agentId = "perf-agent-1"
			await agentPoolManager.spawnAgent({
				agentId,
				role: "coder",
				providerProfile: "anthropic",
				mode: "code",
				workspace: tempDir,
			})

			const message: AgentMessage = {
				id: "perf-msg",
				type: "request",
				from: "organiser",
				to: agentId,
				timestamp: Date.now(),
				payload: {
					task: "Test task",
					taskType: "analyze",
					context: {
						artifactIds: [],
						instructions: "Test",
					},
				},
			}

			const metrics = await measurePerformance(
				"message-route",
				async () => {
					await messageRouter.routeMessage(message)
				},
				100,
			)

			console.log(`Message Routing Performance:`, metrics)
			expect(metrics.averageMs).toBeLessThan(PERFORMANCE_BASELINES.messageRoute)
		})

		it("should handle high-frequency messages efficiently", async () => {
			// Spawn an agent first so routing can succeed
			const agentId = "perf-agent-2"
			await agentPoolManager.spawnAgent({
				agentId,
				role: "coder",
				providerProfile: "anthropic",
				mode: "code",
				workspace: tempDir,
			})

			const messages: AgentMessage[] = []
			for (let i = 0; i < 100; i++) {
				messages.push({
					id: `perf-msg-${i}`,
					type: "request",
					from: "organiser",
					to: agentId,
					timestamp: Date.now(),
					payload: {
						task: `Test task ${i}`,
						taskType: "analyze",
						context: {
							artifactIds: [],
							instructions: "Test",
						},
					},
				})
			}

			const start = performance.now()

			for (const msg of messages) {
				await messageRouter.routeMessage(msg)
			}

			const duration = performance.now() - start
			const avgPerMessage = duration / messages.length

			console.log(`100 messages: ${duration.toFixed(2)}ms (avg: ${avgPerMessage.toFixed(3)}ms each)`)
			expect(avgPerMessage).toBeLessThan(PERFORMANCE_BASELINES.messageRoute)
		})
	})

	describe("3. Artifact Store Performance (Mocked)", () => {
		let mockArtifactStore: MockArtifactStore

		beforeEach(() => {
			mockArtifactStore = createMockArtifactStore()
		})

		afterEach(() => {
			mockArtifactStore.dispose()
		})

		it("should store artifacts within performance threshold (mock)", async () => {
			const metrics = await measurePerformance(
				"artifact-store-mock",
				async () => {
					await mockArtifactStore.storeArtifact({
						type: "code",
						content: "test content",
						producer: "test",
					})
				},
				100,
			)

			console.log(`Artifact Store Mock Performance:`, metrics)
			expect(metrics.averageMs).toBeLessThan(PERFORMANCE_BASELINES.artifactStore)
		})

		it("should retrieve artifact summaries efficiently (mock)", async () => {
			// Pre-populate mock
			mockArtifactStore.getArtifactSummaries.mockResolvedValue([
				{ id: "1", summary: "test" },
				{ id: "2", summary: "test2" },
			])

			const metrics = await measurePerformance(
				"artifact-summary-retrieval-mock",
				async () => {
					await mockArtifactStore.getArtifactSummaries({})
				},
				100,
			)

			console.log(`Artifact Summary Retrieval Mock Performance:`, metrics)
			expect(metrics.averageMs).toBeLessThan(10)
		})

		it("should handle bulk operations efficiently (mock)", async () => {
			const metrics = await measurePerformance(
				"bulk-artifact-mock",
				async () => {
					for (let i = 0; i < 20; i++) {
						await mockArtifactStore.storeArtifact({
							type: "code",
							content: `content ${i}`,
							producer: "test",
						})
					}
				},
				10,
			)

			console.log(`Bulk Artifact Mock Performance:`, metrics)
			expect(metrics.averageMs).toBeLessThan(PERFORMANCE_BASELINES.artifactStore * 2)
		})
	})

	describe("4. Concurrent Agent Performance", () => {
		let mockProcessHandler: MockProcessHandler
		let registry: AgentRegistry
		let messageRouter: MessageRouter
		let fileLockingService: ReturnType<typeof createMockFileLockingService>
		let agentPoolManager: AgentPoolManager
		let tempDir: string

		beforeEach(async () => {
			tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "perf-concurrent-"))
			mockProcessHandler = createMockProcessHandler()
			registry = new AgentRegistry()
			fileLockingService = createMockFileLockingService()
			messageRouter = new MessageRouter({} as AgentPoolManager, mockProcessHandler as unknown as any)
			agentPoolManager = new AgentPoolManager(
				mockProcessHandler as unknown as any,
				registry,
				messageRouter,
				fileLockingService as unknown as any,
				{ maxConcurrentAgents: 5 },
			)
		})

		afterEach(async () => {
			agentPoolManager.dispose()
			messageRouter.dispose()
			fileLockingService.dispose()
			await fs.rm(tempDir, { recursive: true, force: true })
		})

		it("should enforce concurrent agent limits efficiently", async () => {
			// Try to spawn more than the limit
			const spawnPromises: Promise<void>[] = []

			for (let i = 0; i < 7; i++) {
				const uniqueId = `concurrent-limit-${i}-${Date.now()}`
				spawnPromises.push(
					(async () => {
						try {
							await agentPoolManager.spawnAgent({
								agentId: uniqueId,
								role: "coder",
								providerProfile: "anthropic",
								mode: "code",
								workspace: tempDir,
							})
						} catch (error) {
							// Expected for agents beyond limit
						}
					})(),
				)
			}

			const start = performance.now()
			await Promise.all(spawnPromises)
			const duration = performance.now() - start

			console.log(`Concurrent limit enforcement: ${duration.toFixed(2)}ms`)

			const activeCount = agentPoolManager.getActiveAgentCount()
			expect(activeCount).toBeLessThanOrEqual(5)
			expect(duration).toBeLessThan(PERFORMANCE_BASELINES.concurrentAgents)
		})

		it("should manage agent lifecycle efficiently under load", async () => {
			const operations: (() => Promise<void>)[] = []

			// Spawn
			for (let i = 0; i < 3; i++) {
				const uniqueId = `lifecycle-${i}-${Date.now()}`
				operations.push(async () => {
					await agentPoolManager.spawnAgent({
						agentId: uniqueId,
						role: "coder",
						providerProfile: "anthropic",
						mode: "code",
						workspace: tempDir,
					})
				})
			}

			// Terminate
			operations.push(async () => {
				const agents = agentPoolManager.getActiveAgents()
				if (agents.length > 0) {
					await agentPoolManager.terminateAgent(agents[0].agentId)
				}
			})

			const start = performance.now()

			// Run all operations
			await Promise.all(operations)

			const duration = performance.now() - start

			console.log(`Lifecycle operations (3 spawn + 1 terminate): ${duration.toFixed(2)}ms`)
			expect(duration).toBeLessThan(200)
		})

		it("should handle concurrent message routing to multiple agents", async () => {
			// Create agents first
			const agentIds: string[] = []
			for (let i = 0; i < 3; i++) {
				const uniqueId = `multi-msg-${i}-${Date.now()}`
				await agentPoolManager.spawnAgent({
					agentId: uniqueId,
					role: "coder",
					providerProfile: "anthropic",
					mode: "code",
					workspace: tempDir,
				})
				agentIds.push(uniqueId)
			}

			// Set the pool manager reference in message router
			// @ts-expect-error - accessing private property for testing
			messageRouter.agentPoolManager = agentPoolManager

			// Send messages to all agents concurrently
			const sendPromises = agentIds.map((agentId) =>
				messageRouter.routeMessage({
					id: `msg-to-${agentId}`,
					type: "request",
					from: "organiser",
					to: agentId,
					timestamp: Date.now(),
					payload: {
						task: "Test",
						taskType: "analyze",
						context: { artifactIds: [], instructions: "Test" },
					},
				}),
			)

			const start = performance.now()
			await Promise.all(sendPromises)
			const duration = performance.now() - start

			console.log(`Concurrent routing (3 agents): ${duration.toFixed(2)}ms`)
			expect(duration).toBeLessThan(50)
		})

		it("should get all active agents efficiently", async () => {
			// Create agents first
			for (let i = 0; i < 5; i++) {
				const uniqueId = `active-agents-${i}-${Date.now()}`
				await agentPoolManager.spawnAgent({
					agentId: uniqueId,
					role: "coder",
					providerProfile: "anthropic",
					mode: "code",
					workspace: tempDir,
				})
			}

			// Measure getActiveAgents performance
			const metrics = await measurePerformance(
				"getActiveAgents",
				() => {
					agentPoolManager.getActiveAgents()
				},
				1000,
			)

			console.log(`getActiveAgents Performance:`, metrics)
			expect(metrics.averageMs).toBeLessThan(1)
		})
	})

	describe("5. Performance Baselines", () => {
		it("should establish and document performance baselines", () => {
			const baselines = PERFORMANCE_BASELINES

			console.log("Performance Baselines:", baselines)

			// Verify all baselines are defined
			expect(baselines.agentSpawn).toBeGreaterThan(0)
			expect(baselines.messageRoute).toBeGreaterThan(0)
			expect(baselines.artifactStore).toBeGreaterThan(0)
			expect(baselines.concurrentAgents).toBeGreaterThan(0)

			// Log baseline expectations
			console.log(`
Performance Baseline Expectations:
- Agent Spawn: < ${baselines.agentSpawn}ms
- Message Route: < ${baselines.messageRoute}ms
- Artifact Store: < ${baselines.artifactStore}ms
- Concurrent Operations: < ${baselines.concurrentAgents}ms
			`)
		})

		it("should measure and report system performance characteristics", async () => {
			const results: Record<string, PerformanceMetrics> = {}

			// Quick measurements for baseline reporting
			results.mapOperations = await measurePerformance(
				"map-get",
				() => {
					const map = new Map<string, number>()
					for (let i = 0; i < 100; i++) {
						map.set(`key-${i}`, i)
					}
					for (let i = 0; i < 100; i++) {
						map.get(`key-${i}`)
					}
				},
				100,
			)

			results.arrayFilter = await measurePerformance(
				"array-filter",
				() => {
					const arr = Array.from({ length: 1000 }, (_, i) => i)
					arr.filter((x) => x % 2 === 0)
				},
				100,
			)

			console.log("System Performance Characteristics:", results)

			// Verify operations are reasonably fast
			expect(results.mapOperations?.averageMs).toBeLessThan(5)
			expect(results.arrayFilter?.averageMs).toBeLessThan(10)
		})

		it("should benchmark async operation overhead", async () => {
			const results: Record<string, PerformanceMetrics> = {}

			// Measure promise resolution overhead
			results.promiseResolved = await measurePerformance(
				"promise-resolved",
				async () => {
					await Promise.resolve()
				},
				1000,
			)

			// Measure setTimeout overhead (minimal)
			results.setTimeoutZero = await measurePerformance(
				"set-timeout-zero",
				async () => {
					await new Promise((resolve) => setTimeout(resolve, 0))
				},
				100,
			)

			console.log("Async Operation Overhead:", results)

			// Promise.resolve should be very fast
			expect(results.promiseResolved?.averageMs).toBeLessThan(1)
		})
	})
})
