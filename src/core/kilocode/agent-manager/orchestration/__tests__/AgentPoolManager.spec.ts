import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { AgentPoolManager } from "../AgentPoolManager"
import { AgentSpawnConfig, AgentInstance } from "../types"

describe("AgentPoolManager", () => {
	let manager: AgentPoolManager
	let mockProcessHandler: any
	let mockRegistry: any
	let mockMessageRouter: any

	beforeEach(() => {
		mockProcessHandler = {
			spawnProcess: vi.fn().mockResolvedValue(undefined),
		}
		mockRegistry = {}
		mockMessageRouter = {}
		manager = new AgentPoolManager(mockProcessHandler, mockRegistry, mockMessageRouter, 5)
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
				1, // Max 1 agent
			)

			// Spawn first agent
			await managerWithLimit.spawnAgent({
				agentId: "agent-1",
				role: "architect",
				providerProfile: "profile-1",
				mode: "architect",
				workspace: "/test/workspace",
			})

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

			await expect(manager.spawnAgent(config)).rejects.toThrow(
				"Agent with ID agent-1 already exists",
			)
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
			await expect(manager.pauseAgent("non-existent")).rejects.toThrow(
				"Agent non-existent not found",
			)
		})

		it("should throw error when agent is not in pauseable state", async () => {
			await manager.spawnAgent({
				agentId: "agent-1",
				role: "architect",
				providerProfile: "profile-1",
				mode: "architect",
				workspace: "/test/workspace",
			})

			await expect(manager.pauseAgent("agent-1")).rejects.toThrow(
				"Cannot pause agent in spawning state",
			)
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
			await expect(manager.resumeAgent("non-existent")).rejects.toThrow(
				"Agent non-existent not found",
			)
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
			await expect(manager.terminateAgent("non-existent")).rejects.toThrow(
				"Agent non-existent not found",
			)
		})
	})

	describe("dispose", () => {
		it("should clear health check interval", () => {
			const clearIntervalSpy = vi.spyOn(global, "clearInterval")
			manager.dispose()
			expect(clearIntervalSpy).toHaveBeenCalled()
		})

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
})
