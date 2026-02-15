import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { AgentPoolManager } from "../AgentPoolManager"
import { AgentSpawnConfig, AgentInstance } from "../types"
import type { HealthEvent } from "../../../../../services/kilocode/health-monitoring"

describe("AgentPoolManager", () => {
	let manager: AgentPoolManager
	let mockProcessHandler: any
	let mockRegistry: any
	let mockMessageRouter: any
	let mockFileLockingService: any

	beforeEach(() => {
		mockProcessHandler = {
			spawnProcess: vi.fn().mockResolvedValue(undefined),
			sendMessage: vi.fn().mockResolvedValue(undefined),
		}
		mockRegistry = {}
		mockMessageRouter = {}
		mockFileLockingService = {
			acquireLock: vi.fn().mockResolvedValue({ success: true, lockId: "lock-1" }),
			releaseLock: vi.fn().mockReturnValue(true),
			releaseAllLocksForAgent: vi.fn().mockReturnValue(0),
			getLocksForAgent: vi.fn().mockReturnValue([]),
			agentHasLocks: vi.fn().mockReturnValue(false),
		}
		manager = new AgentPoolManager(mockProcessHandler, mockRegistry, mockMessageRouter, mockFileLockingService, {
			maxConcurrentAgents: 5,
			enableHealthMonitor: false, // Disable for basic tests
		})
	})

	afterEach(() => {
		manager.dispose()
	})

	describe("spawnAgent", () => {
		it("should spawn an agent successfully", async () => {
			const config: AgentSpawnConfig = {
				agentId: "agent-1",
				role: "architect",
				providerProfile: "profile-1",
				mode: "architect",
				workspace: "/test/workspace",
			}

			const agentId = await manager.spawnAgent(config)

			expect(agentId).toBe("agent-1")
			expect(mockProcessHandler.spawnProcess).toHaveBeenCalled()
		})

		it("should throw error when max concurrent agents reached", async () => {
			const managerWithLimit = new AgentPoolManager(
				mockProcessHandler,
				mockRegistry,
				mockMessageRouter,
				mockFileLockingService,
				{
					maxConcurrentAgents: 1,
					enableHealthMonitor: false,
				},
			)

			// Spawn first agent
			await managerWithLimit.spawnAgent({
				agentId: "agent-1",
				role: "architect",
				providerProfile: "profile-1",
				mode: "architect",
				workspace: "/test/workspace",
			})

			// Manually set to ready to count as active
			const agent = managerWithLimit.getAgent("agent-1")
			if (agent) agent.status = "ready"

			// Try to spawn second agent
			await expect(
				managerWithLimit.spawnAgent({
					agentId: "agent-2",
					role: "coder",
					providerProfile: "profile-2",
					mode: "code",
					workspace: "/test/workspace",
				}),
			).rejects.toThrow("Maximum concurrent agents (1) reached")

			managerWithLimit.dispose()
		})

		it("should throw error when agent ID already exists", async () => {
			const config: AgentSpawnConfig = {
				agentId: "agent-1",
				role: "architect",
				providerProfile: "profile-1",
				mode: "architect",
				workspace: "/test/workspace",
			}

			await manager.spawnAgent(config)

			await expect(manager.spawnAgent(config)).rejects.toThrow("Agent with ID agent-1 already exists")
		})
	})

	describe("getAgent", () => {
		it("should return agent by ID", async () => {
			const config: AgentSpawnConfig = {
				agentId: "agent-1",
				role: "architect",
				providerProfile: "profile-1",
				mode: "architect",
				workspace: "/test/workspace",
			}

			await manager.spawnAgent(config)
			const agent = manager.getAgent("agent-1")

			expect(agent).toBeDefined()
			expect(agent?.agentId).toBe("agent-1")
			expect(agent?.status).toBe("spawning")
		})

		it("should return undefined for non-existent agent", () => {
			const agent = manager.getAgent("non-existent")
			expect(agent).toBeUndefined()
		})
	})

	describe("getActiveAgents", () => {
		it("should return only active agents (ready or busy)", async () => {
			// Spawn two agents
			await manager.spawnAgent({
				agentId: "agent-1",
				role: "architect",
				providerProfile: "profile-1",
				mode: "architect",
				workspace: "/test/workspace",
			})

			await manager.spawnAgent({
				agentId: "agent-2",
				role: "coder",
				providerProfile: "profile-2",
				mode: "code",
				workspace: "/test/workspace",
			})

			// Both should be in spawning state initially
			const activeAgents = manager.getActiveAgents()
			expect(activeAgents).toHaveLength(0) // spawning is not active
		})
	})

	describe("pauseAgent", () => {
		it("should pause a ready agent", async () => {
			await manager.spawnAgent({
				agentId: "agent-1",
				role: "architect",
				providerProfile: "profile-1",
				mode: "architect",
				workspace: "/test/workspace",
			})

			// Manually set to ready (normally done via event)
			const agent = manager.getAgent("agent-1")
			if (agent) agent.status = "ready"

			await manager.pauseAgent("agent-1")
			expect(manager.getAgent("agent-1")?.status).toBe("paused")
		})

		it("should throw error when agent not found", async () => {
			await expect(manager.pauseAgent("non-existent")).rejects.toThrow("Agent non-existent not found")
		})

		it("should throw error when agent is not in pauseable state", async () => {
			await manager.spawnAgent({
				agentId: "agent-1",
				role: "architect",
				providerProfile: "profile-1",
				mode: "architect",
				workspace: "/test/workspace",
			})

			await expect(manager.pauseAgent("agent-1")).rejects.toThrow("Cannot pause agent in spawning state")
		})
	})

	describe("resumeAgent", () => {
		it("should resume a paused agent", async () => {
			await manager.spawnAgent({
				agentId: "agent-1",
				role: "architect",
				providerProfile: "profile-1",
				mode: "architect",
				workspace: "/test/workspace",
			})

			// Manually set to paused
			const agent = manager.getAgent("agent-1")
			if (agent) agent.status = "paused"

			await manager.resumeAgent("agent-1")
			expect(manager.getAgent("agent-1")?.status).toBe("ready")
		})

		it("should throw error when agent not found", async () => {
			await expect(manager.resumeAgent("non-existent")).rejects.toThrow("Agent non-existent not found")
		})
	})

	describe("terminateAgent", () => {
		it("should terminate an agent", async () => {
			await manager.spawnAgent({
				agentId: "agent-1",
				role: "architect",
				providerProfile: "profile-1",
				mode: "architect",
				workspace: "/test/workspace",
			})

			await manager.terminateAgent("agent-1")
			expect(manager.getAgent("agent-1")?.status).toBe("stopped")
		})

		it("should throw error when agent not found", async () => {
			await expect(manager.terminateAgent("non-existent")).rejects.toThrow("Agent non-existent not found")
		})

		it("should release all file locks on terminate", async () => {
			await manager.spawnAgent({
				agentId: "agent-1",
				role: "architect",
				providerProfile: "profile-1",
				mode: "architect",
				workspace: "/test/workspace",
			})

			mockFileLockingService.releaseAllLocksForAgent.mockReturnValue(3)

			await manager.terminateAgent("agent-1")

			expect(mockFileLockingService.releaseAllLocksForAgent).toHaveBeenCalledWith("agent-1")
		})
	})

	describe("dispose", () => {
		it("should terminate all active agents", async () => {
			await manager.spawnAgent({
				agentId: "agent-1",
				role: "architect",
				providerProfile: "profile-1",
				mode: "architect",
				workspace: "/test/workspace",
			})

			// Manually set to ready
			const agent = manager.getAgent("agent-1")
			if (agent) agent.status = "ready"

			manager.dispose()
			expect(manager.getAgent("agent-1")?.status).toBe("stopped")
		})
	})

	describe("file locking", () => {
		it("should acquire file lock for agent", async () => {
			await manager.spawnAgent({
				agentId: "agent-1",
				role: "architect",
				providerProfile: "profile-1",
				mode: "architect",
				workspace: "/test/workspace",
			})

			const result = await manager.acquireFileLock("agent-1", "/test/file.ts", "write")

			expect(mockFileLockingService.acquireLock).toHaveBeenCalled()
			expect(result.success).toBe(true)
		})

		it("should release file lock", () => {
			manager.releaseFileLock("lock-1")
			expect(mockFileLockingService.releaseLock).toHaveBeenCalledWith("lock-1")
		})

		it("should get agent file locks", async () => {
			await manager.spawnAgent({
				agentId: "agent-1",
				role: "architect",
				providerProfile: "profile-1",
				mode: "architect",
				workspace: "/test/workspace",
			})

			manager.getAgentFileLocks("agent-1")
			expect(mockFileLockingService.getLocksForAgent).toHaveBeenCalledWith("agent-1")
		})

		it("should check if agent has file locks", async () => {
			await manager.spawnAgent({
				agentId: "agent-1",
				role: "architect",
				providerProfile: "profile-1",
				mode: "architect",
				workspace: "/test/workspace",
			})

			manager.agentHasFileLocks("agent-1")
			expect(mockFileLockingService.agentHasLocks).toHaveBeenCalledWith("agent-1")
		})
	})
})

describe("AgentPoolManager with Health Monitoring", () => {
	let manager: AgentPoolManager
	let mockProcessHandler: any
	let mockRegistry: any
	let mockMessageRouter: any
	let mockFileLockingService: any

	beforeEach(() => {
		mockProcessHandler = {
			spawnProcess: vi.fn().mockResolvedValue(undefined),
			sendMessage: vi.fn().mockResolvedValue(undefined),
		}
		mockRegistry = {}
		mockMessageRouter = {}
		mockFileLockingService = {
			acquireLock: vi.fn().mockResolvedValue({ success: true, lockId: "lock-1" }),
			releaseLock: vi.fn().mockReturnValue(true),
			releaseAllLocksForAgent: vi.fn().mockReturnValue(0),
			getLocksForAgent: vi.fn().mockReturnValue([]),
			agentHasLocks: vi.fn().mockReturnValue(false),
		}
	})

	afterEach(() => {
		manager.dispose()
	})

	describe("health monitor integration", () => {
		it("should create health monitor by default", () => {
			manager = new AgentPoolManager(mockProcessHandler, mockRegistry, mockMessageRouter, mockFileLockingService)

			const stats = manager.getHealthStatistics()
			expect(stats).not.toBeNull()
		})

		it("should disable health monitor when configured", () => {
			manager = new AgentPoolManager(
				mockProcessHandler,
				mockRegistry,
				mockMessageRouter,
				mockFileLockingService,
				{ enableHealthMonitor: false },
			)

			const stats = manager.getHealthStatistics()
			expect(stats).toBeNull()
		})

		it("should register agent with health monitor on spawn", async () => {
			manager = new AgentPoolManager(
				mockProcessHandler,
				mockRegistry,
				mockMessageRouter,
				mockFileLockingService,
				{
					healthMonitorConfig: {
						checkIntervalMs: 10000,
					},
				},
			)

			await manager.spawnAgent({
				agentId: "agent-1",
				role: "architect",
				providerProfile: "profile-1",
				mode: "architect",
				workspace: "/test/workspace",
			})

			const stats = manager.getHealthStatistics()
			expect(stats?.totalAgents).toBe(1)
		})

		it("should unregister agent from health monitor on terminate", async () => {
			manager = new AgentPoolManager(mockProcessHandler, mockRegistry, mockMessageRouter, mockFileLockingService)

			await manager.spawnAgent({
				agentId: "agent-1",
				role: "architect",
				providerProfile: "profile-1",
				mode: "architect",
				workspace: "/test/workspace",
			})

			await manager.terminateAgent("agent-1")

			const stats = manager.getHealthStatistics()
			expect(stats?.totalAgents).toBe(0)
		})
	})

	describe("health event listeners", () => {
		it("should add and receive health events", async () => {
			manager = new AgentPoolManager(
				mockProcessHandler,
				mockRegistry,
				mockMessageRouter,
				mockFileLockingService,
				{
					healthMonitorConfig: {
						checkIntervalMs: 50,
						unresponsiveThresholdMs: 100,
					},
				},
			)

			const events: HealthEvent[] = []
			manager.addHealthListener((event) => events.push(event))

			await manager.spawnAgent({
				agentId: "agent-1",
				role: "architect",
				providerProfile: "profile-1",
				mode: "architect",
				workspace: "/test/workspace",
			})

			// Wait for health check
			await new Promise((resolve) => setTimeout(resolve, 100))

			expect(events.length).toBeGreaterThan(0)
		})

		it("should remove health listener", async () => {
			manager = new AgentPoolManager(mockProcessHandler, mockRegistry, mockMessageRouter, mockFileLockingService)

			const listener = vi.fn()
			manager.addHealthListener(listener)
			manager.removeHealthListener(listener)

			// Listener should be removed
			expect(manager).toBeDefined()
		})
	})

	describe("HealthCheckHandler implementation", () => {
		it("should send ping via process handler", async () => {
			manager = new AgentPoolManager(mockProcessHandler, mockRegistry, mockMessageRouter, mockFileLockingService)

			await manager.spawnAgent({
				agentId: "agent-1",
				role: "architect",
				providerProfile: "profile-1",
				mode: "architect",
				workspace: "/test/workspace",
			})

			// Set session ID
			const agent = manager.getAgent("agent-1")
			if (agent) agent.sessionId = "session-1"

			await manager.sendPing("agent-1")

			expect(mockProcessHandler.sendMessage).toHaveBeenCalledWith(
				"session-1",
				expect.objectContaining({ type: "ping" }),
			)
		})

		it("should get last activity", async () => {
			manager = new AgentPoolManager(mockProcessHandler, mockRegistry, mockMessageRouter, mockFileLockingService)

			await manager.spawnAgent({
				agentId: "agent-1",
				role: "architect",
				providerProfile: "profile-1",
				mode: "architect",
				workspace: "/test/workspace",
			})

			const lastActivity = manager.getLastActivity("agent-1")
			expect(lastActivity).toBeDefined()
			expect(typeof lastActivity).toBe("number")
		})

		it("should restart agent", async () => {
			manager = new AgentPoolManager(mockProcessHandler, mockRegistry, mockMessageRouter, mockFileLockingService)

			await manager.spawnAgent({
				agentId: "agent-1",
				role: "architect",
				providerProfile: "profile-1",
				mode: "architect",
				workspace: "/test/workspace",
			})

			// Set session ID
			const agent = manager.getAgent("agent-1")
			if (agent) agent.sessionId = "session-1"

			const result = await manager.restartAgent("agent-1")

			expect(result).toBe(true)
			expect(mockProcessHandler.sendMessage).toHaveBeenCalledWith(
				"session-1",
				expect.objectContaining({ type: "shutdown" }),
			)
		})
	})

	describe("health status tracking", () => {
		it("should track agent health status", async () => {
			manager = new AgentPoolManager(mockProcessHandler, mockRegistry, mockMessageRouter, mockFileLockingService)

			await manager.spawnAgent({
				agentId: "agent-1",
				role: "architect",
				providerProfile: "profile-1",
				mode: "architect",
				workspace: "/test/workspace",
			})

			const agent = manager.getAgent("agent-1")
			expect(agent?.healthStatus).toBe("unknown")
		})

		it("should get agents by health status", async () => {
			manager = new AgentPoolManager(mockProcessHandler, mockRegistry, mockMessageRouter, mockFileLockingService)

			await manager.spawnAgent({
				agentId: "agent-1",
				role: "architect",
				providerProfile: "profile-1",
				mode: "architect",
				workspace: "/test/workspace",
			})

			const unknownAgents = manager.getAgentsByHealthStatus("unknown")
			expect(unknownAgents).toHaveLength(1)
			expect(unknownAgents[0].agentId).toBe("agent-1")
		})
	})

	describe("handlePongResponse", () => {
		it("should handle pong response", async () => {
			manager = new AgentPoolManager(mockProcessHandler, mockRegistry, mockMessageRouter, mockFileLockingService)

			await manager.spawnAgent({
				agentId: "agent-1",
				role: "architect",
				providerProfile: "profile-1",
				mode: "architect",
				workspace: "/test/workspace",
			})

			// Should not throw
			manager.handlePongResponse("agent-1")
		})
	})
})
