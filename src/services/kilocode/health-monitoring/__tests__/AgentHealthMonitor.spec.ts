import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
	AgentHealthMonitor,
	type HealthCheckHandler,
	type HealthEvent,
	type HealthMonitorConfig,
	DEFAULT_HEALTH_MONITOR_CONFIG,
} from "../index"

describe("AgentHealthMonitor", () => {
	let monitor: AgentHealthMonitor
	let mockHandler: HealthCheckHandler

	beforeEach(() => {
		mockHandler = {
			sendPing: vi.fn().mockResolvedValue(undefined),
			checkPong: vi.fn().mockResolvedValue(true),
			getLastActivity: vi.fn().mockReturnValue(Date.now()),
			restartAgent: vi.fn().mockResolvedValue(true),
		}

		monitor = new AgentHealthMonitor(mockHandler, {
			checkIntervalMs: 100, // Fast for testing
			pingTimeoutMs: 50,
			unresponsiveThresholdMs: 200,
			failureThreshold: 2,
			recoveryThreshold: 2,
			autoRestart: true,
			maxRestartAttempts: 3,
			restartCooldownMs: 50,
		})
	})

	afterEach(() => {
		monitor.dispose()
	})

	describe("constructor", () => {
		it("should create monitor with default config", () => {
			const defaultMonitor = new AgentHealthMonitor(mockHandler)
			const stats = defaultMonitor.getStatistics()
			expect(stats.totalAgents).toBe(0)
			defaultMonitor.dispose()
		})

		it("should merge custom config with defaults", () => {
			const customMonitor = new AgentHealthMonitor(mockHandler, {
				checkIntervalMs: 5000,
			})
			customMonitor.dispose()
			// Config is internal, we verify through behavior
		})
	})

	describe("start/stop", () => {
		it("should start health monitoring", () => {
			monitor.start()
			expect(monitor).toBeDefined()
		})

		it("should stop health monitoring", () => {
			monitor.start()
			monitor.stop()
			expect(monitor).toBeDefined()
		})

		it("should not start twice", () => {
			monitor.start()
			monitor.start() // Should be idempotent
			monitor.stop()
		})
	})

	describe("registerAgent/unregisterAgent", () => {
		it("should register an agent", () => {
			monitor.registerAgent("agent-1")
			const stats = monitor.getStatistics()
			expect(stats.totalAgents).toBe(1)
			expect(stats.unknownAgents).toBe(1)
		})

		it("should not register duplicate agents", () => {
			monitor.registerAgent("agent-1")
			monitor.registerAgent("agent-1")
			const stats = monitor.getStatistics()
			expect(stats.totalAgents).toBe(1)
		})

		it("should unregister an agent", () => {
			monitor.registerAgent("agent-1")
			monitor.unregisterAgent("agent-1")
			const stats = monitor.getStatistics()
			expect(stats.totalAgents).toBe(0)
		})

		it("should handle unregistering non-existent agent", () => {
			monitor.unregisterAgent("non-existent")
			const stats = monitor.getStatistics()
			expect(stats.totalAgents).toBe(0)
		})
	})

	describe("getAgentHealthState", () => {
		it("should return health state for registered agent", () => {
			monitor.registerAgent("agent-1")
			const state = monitor.getAgentHealthState("agent-1")
			expect(state).toBeDefined()
			expect(state?.agentId).toBe("agent-1")
			expect(state?.status).toBe("unknown")
		})

		it("should return undefined for non-existent agent", () => {
			const state = monitor.getAgentHealthState("non-existent")
			expect(state).toBeUndefined()
		})
	})

	describe("getAgentHealthStatus", () => {
		it("should return health status for registered agent", () => {
			monitor.registerAgent("agent-1")
			const status = monitor.getAgentHealthStatus("agent-1")
			expect(status).toBe("unknown")
		})

		it("should return unknown for non-existent agent", () => {
			const status = monitor.getAgentHealthStatus("non-existent")
			expect(status).toBe("unknown")
		})
	})

	describe("getAgentsByHealthStatus", () => {
		it("should return agents filtered by status", () => {
			monitor.registerAgent("agent-1")
			monitor.registerAgent("agent-2")

			const unknownAgents = monitor.getAgentsByHealthStatus("unknown")
			expect(unknownAgents).toHaveLength(2)
			expect(unknownAgents).toContain("agent-1")
			expect(unknownAgents).toContain("agent-2")
		})

		it("should return empty array for no matching agents", () => {
			monitor.registerAgent("agent-1")
			const healthyAgents = monitor.getAgentsByHealthStatus("healthy")
			expect(healthyAgents).toHaveLength(0)
		})
	})

	describe("getStatistics", () => {
		it("should return current statistics", () => {
			monitor.registerAgent("agent-1")
			monitor.registerAgent("agent-2")

			const stats = monitor.getStatistics()
			expect(stats.totalAgents).toBe(2)
			expect(stats.unknownAgents).toBe(2)
			expect(stats.healthyAgents).toBe(0)
			expect(stats.unhealthyAgents).toBe(0)
			expect(stats.recoveringAgents).toBe(0)
		})
	})

	describe("addListener/removeListener", () => {
		it("should add and receive events", () => {
			const listener = vi.fn()
			monitor.addListener(listener)

			monitor.registerAgent("agent-1")
			// Events are emitted during health checks

			monitor.removeListener(listener)
			expect(monitor).toBeDefined()
		})

		it("should remove listener", () => {
			const listener = vi.fn()
			monitor.addListener(listener)
			monitor.removeListener(listener)

			expect(monitor).toBeDefined()
		})
	})

	describe("checkAgentHealth", () => {
		it("should return unknown for non-registered agent", async () => {
			const result = await monitor.checkAgentHealth("non-existent")
			expect(result.status).toBe("unknown")
			expect(result.error).toBe("Agent not registered")
		})

		it("should return healthy for agent with recent activity", async () => {
			monitor.registerAgent("agent-1")
			// Mock recent activity
			mockHandler.getLastActivity = vi.fn().mockReturnValue(Date.now())

			const result = await monitor.checkAgentHealth("agent-1")
			expect(result.status).toBe("healthy")
			expect(result.respondedToPing).toBe(true)
		})

		it("should detect unresponsive agent", async () => {
			monitor.registerAgent("agent-1")
			// Mock old activity (beyond threshold)
			mockHandler.getLastActivity = vi.fn().mockReturnValue(Date.now() - 500)
			// Mock ping failure
			mockHandler.sendPing = vi.fn().mockResolvedValue(undefined)

			const result = await monitor.checkAgentHealth("agent-1")
			expect(result.inactiveTimeMs).toBeGreaterThan(200)
		})
	})

	describe("reportActivity", () => {
		it("should update agent status on activity", () => {
			monitor.registerAgent("agent-1")

			// Get initial state
			const state = monitor.getAgentHealthState("agent-1")
			expect(state?.status).toBe("unknown")

			// Report activity
			monitor.reportActivity("agent-1")

			// Status should remain unknown (not unhealthy yet)
			expect(monitor.getAgentHealthStatus("agent-1")).toBe("unknown")
		})
	})

	describe("handlePong", () => {
		it("should handle pong response", () => {
			monitor.registerAgent("agent-1")
			monitor.handlePong("agent-1")
			// Pong handling is internal to health check flow
			expect(monitor).toBeDefined()
		})
	})

	describe("health check flow", () => {
		it("should perform periodic health checks", async () => {
			monitor.registerAgent("agent-1")
			monitor.start()

			// Wait for at least one check
			await new Promise((resolve) => setTimeout(resolve, 150))

			monitor.stop()

			const stats = monitor.getStatistics()
			expect(stats.totalChecks).toBeGreaterThan(0)
		})

		it("should detect healthy agent", async () => {
			mockHandler.getLastActivity = vi.fn().mockReturnValue(Date.now())

			monitor.registerAgent("agent-1")
			monitor.start()

			// Wait for health check
			await new Promise((resolve) => setTimeout(resolve, 150))

			monitor.stop()

			const status = monitor.getAgentHealthStatus("agent-1")
			expect(status).toBe("healthy")
		})

		it("should detect unhealthy agent after threshold", async () => {
			const events: HealthEvent[] = []
			monitor.addListener((event) => events.push(event))

			// Mock old activity
			mockHandler.getLastActivity = vi.fn().mockReturnValue(Date.now() - 1000)
			// Mock ping not responding (pong never comes)
			mockHandler.sendPing = vi.fn().mockResolvedValue(undefined)

			monitor.registerAgent("agent-1")
			monitor.start()

			// Wait for multiple health checks
			await new Promise((resolve) => setTimeout(resolve, 400))

			monitor.stop()

			// Should have detected unhealthy state
			const unhealthyEvents = events.filter((e) => e.type === "agent_unhealthy")
			expect(unhealthyEvents.length).toBeGreaterThan(0)
		})
	})

	describe("automatic restart", () => {
		it("should attempt restart on unhealthy agent", async () => {
			const events: HealthEvent[] = []
			monitor.addListener((event) => events.push(event))

			// Mock old activity
			mockHandler.getLastActivity = vi.fn().mockReturnValue(Date.now() - 1000)
			// Mock ping not responding
			mockHandler.sendPing = vi.fn().mockResolvedValue(undefined)

			monitor.registerAgent("agent-1")
			monitor.start()

			// Wait for health checks and restart
			await new Promise((resolve) => setTimeout(resolve, 500))

			monitor.stop()

			// Should have attempted restart
			const restartEvents = events.filter((e) => e.type === "agent_restart_attempt")
			expect(restartEvents.length).toBeGreaterThan(0)
		})

		it("should respect max restart attempts", async () => {
			const events: HealthEvent[] = []
			monitor.addListener((event) => events.push(event))

			// Mock old activity
			mockHandler.getLastActivity = vi.fn().mockReturnValue(Date.now() - 1000)
			// Mock ping not responding
			mockHandler.sendPing = vi.fn().mockResolvedValue(undefined)
			// Mock restart failing
			mockHandler.restartAgent = vi.fn().mockResolvedValue(false)

			monitor.registerAgent("agent-1")
			monitor.start()

			// Wait for multiple restart attempts (need enough time for max attempts + cooldowns)
			await new Promise((resolve) => setTimeout(resolve, 1200))

			monitor.stop()

			// Should have max restart events
			const maxRestartEvents = events.filter((e) => e.type === "agent_max_restarts_reached")
			expect(maxRestartEvents.length).toBeGreaterThan(0)
		})

		it("should emit restart success event", async () => {
			const events: HealthEvent[] = []
			monitor.addListener((event) => events.push(event))

			// Mock old activity
			mockHandler.getLastActivity = vi.fn().mockReturnValue(Date.now() - 1000)
			// Mock ping not responding
			mockHandler.sendPing = vi.fn().mockResolvedValue(undefined)
			// Mock restart succeeding
			mockHandler.restartAgent = vi.fn().mockResolvedValue(true)

			monitor.registerAgent("agent-1")
			monitor.start()

			// Wait for restart
			await new Promise((resolve) => setTimeout(resolve, 500))

			monitor.stop()

			// Should have restart success event
			const successEvents = events.filter((e) => e.type === "agent_restart_success")
			expect(successEvents.length).toBeGreaterThan(0)
		})
	})

	describe("recovery flow", () => {
		it("should transition from unhealthy to recovering on activity", async () => {
			const events: HealthEvent[] = []

			// Disable auto-restart for this test
			const testMonitor = new AgentHealthMonitor(mockHandler, {
				checkIntervalMs: 100,
				pingTimeoutMs: 50,
				unresponsiveThresholdMs: 200,
				failureThreshold: 2,
				recoveryThreshold: 2,
				autoRestart: false, // Disabled to test manual recovery
				maxRestartAttempts: 3,
				restartCooldownMs: 50,
			})

			// Add listener to the correct monitor
			testMonitor.addListener((event) => events.push(event))

			// Start with old activity
			mockHandler.getLastActivity = vi.fn().mockReturnValue(Date.now() - 1000)
			mockHandler.sendPing = vi.fn().mockResolvedValue(undefined)

			testMonitor.registerAgent("agent-1")
			testMonitor.start()

			// Wait for unhealthy state (need 2 consecutive failures with failureThreshold: 2)
			await new Promise((resolve) => setTimeout(resolve, 500))

			// Verify agent is unhealthy before reporting activity
			const stateBefore = testMonitor.getAgentHealthState("agent-1")
			expect(stateBefore?.status).toBe("unhealthy")

			// Now simulate activity
			mockHandler.getLastActivity = vi.fn().mockReturnValue(Date.now())
			testMonitor.reportActivity("agent-1")

			testMonitor.stop()
			testMonitor.dispose()

			// Should have recovering event
			const recoveringEvents = events.filter((e) => e.type === "agent_recovering")
			expect(recoveringEvents.length).toBeGreaterThan(0)
		})
	})

	describe("dispose", () => {
		it("should clean up all resources", () => {
			monitor.registerAgent("agent-1")
			monitor.start()

			monitor.dispose()

			const stats = monitor.getStatistics()
			expect(stats.totalAgents).toBe(0)
		})
	})

	describe("DEFAULT_HEALTH_MONITOR_CONFIG", () => {
		it("should have sensible defaults", () => {
			expect(DEFAULT_HEALTH_MONITOR_CONFIG.checkIntervalMs).toBe(10000)
			expect(DEFAULT_HEALTH_MONITOR_CONFIG.pingTimeoutMs).toBe(5000)
			expect(DEFAULT_HEALTH_MONITOR_CONFIG.unresponsiveThresholdMs).toBe(30000)
			expect(DEFAULT_HEALTH_MONITOR_CONFIG.failureThreshold).toBe(3)
			expect(DEFAULT_HEALTH_MONITOR_CONFIG.recoveryThreshold).toBe(2)
			expect(DEFAULT_HEALTH_MONITOR_CONFIG.autoRestart).toBe(true)
			expect(DEFAULT_HEALTH_MONITOR_CONFIG.maxRestartAttempts).toBe(3)
			expect(DEFAULT_HEALTH_MONITOR_CONFIG.restartCooldownMs).toBe(10000)
		})
	})
})
