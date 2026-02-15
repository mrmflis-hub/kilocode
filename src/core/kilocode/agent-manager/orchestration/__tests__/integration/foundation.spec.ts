// kilocode_change - new file
/**
 * Integration tests for Foundation components
 *
 * Tests the integration between:
 * - AgentPoolManager
 * - MessageRouter
 * - AgentRegistry
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import * as os from "node:os"

// Import Foundation components
import { AgentPoolManager } from "../../AgentPoolManager"
import { MessageRouter } from "../../MessageRouter"
import type { AgentMessage } from "../../MessageRouter"
import type { AgentSpawnConfig, AgentInstance } from "../../types"
import { AgentRegistry } from "../../../AgentRegistry"

// Mock RuntimeProcessHandler
interface MockProcessHandler {
	spawnProcess: ReturnType<typeof vi.fn>
	sendMessage: ReturnType<typeof vi.fn>
}

const createMockProcessHandler = (): MockProcessHandler => ({
	spawnProcess: vi.fn().mockResolvedValue(undefined),
	sendMessage: vi.fn().mockResolvedValue(undefined),
})

// Helper function to simulate AgentPoolManager.handleAgentEvent
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

// Create a mock FileLockingService with all required methods
const createMockFileLockingService = () => ({
	acquireLock: vi.fn().mockResolvedValue({ success: true, lockId: "lock-1", locked: true }),
	releaseLock: vi.fn().mockResolvedValue(undefined),
	getLockStatus: vi.fn().mockReturnValue({ isLocked: false }),
	releaseAllLocksForAgent: vi.fn().mockResolvedValue(undefined),
	dispose: vi.fn(),
})

// Create a mock AgentPoolManager for MessageRouter tests
const createMockAgentPoolManager = (agents: AgentInstance[]) => ({
	getAgent: vi.fn((id: string) => agents.find((a) => a.agentId === id)),
	getActiveAgents: vi.fn(() => agents.filter((a) => a.status === "ready" || a.status === "busy")),
})

describe("Foundation Integration Tests", () => {
	describe("1. Agent Pool Manager + Message Router Integration", () => {
		let mockProcessHandler: MockProcessHandler
		let registry: AgentRegistry
		let messageRouter: MessageRouter
		let fileLockingService: any
		let agentPoolManager: AgentPoolManager
		let tempDir: string

		beforeEach(async () => {
			// Create temporary directory
			tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "foundation-test-"))

			// Create mock process handler
			mockProcessHandler = createMockProcessHandler()

			// Create registry
			registry = new AgentRegistry()

			// Create file locking service mock with all required methods
			fileLockingService = createMockFileLockingService()

			// Create message router
			messageRouter = new MessageRouter({} as AgentPoolManager, mockProcessHandler as unknown as any)

			// Create agent pool manager
			agentPoolManager = new AgentPoolManager(
				mockProcessHandler as unknown as any,
				registry,
				messageRouter,
				fileLockingService,
				{ maxConcurrentAgents: 5 }, // max concurrent agents
			)

			// Set the pool manager reference in message router
			// @ts-expect-error - accessing private property for testing
			messageRouter.agentPoolManager = agentPoolManager
		})

		afterEach(async () => {
			agentPoolManager.dispose()
			messageRouter.dispose()
			fileLockingService.dispose()

			// Clean up temp directory
			await fs.rm(tempDir, { recursive: true, force: true })
		})

		it("should spawn agent and route message through MessageRouter", async () => {
			const config: AgentSpawnConfig = {
				agentId: "test-agent-1",
				role: "architect",
				providerProfile: "anthropic",
				mode: "architect",
				workspace: tempDir,
			}

			// Spawn agent
			const agentId = await agentPoolManager.spawnAgent(config)
			expect(agentId).toBe("test-agent-1")

			// Verify agent is tracked
			const agent = agentPoolManager.getAgent(agentId)
			expect(agent).toBeDefined()
			expect(agent?.status).toBe("spawning")

			// Simulate agent becoming ready
			simulateAgentEvent(agentPoolManager, agentId, "session-1", {
				type: "session_created",
			})

			// Verify agent status updated
			const readyAgent = agentPoolManager.getAgent(agentId)
			expect(readyAgent?.status).toBe("ready")
			expect(readyAgent?.sessionId).toBe("session-1")

			// Route message through MessageRouter
			const message: AgentMessage = {
				id: "msg-1",
				type: "request",
				from: "organiser",
				to: agentId,
				timestamp: Date.now(),
				payload: {
					task: "Analyze repository",
					taskType: "analyze",
					context: {
						artifactIds: [],
						instructions: "Analyze the codebase structure",
					},
				},
			}

			await messageRouter.routeMessage(message)

			// Verify message was sent via process handler
			expect(mockProcessHandler.sendMessage).toHaveBeenCalledWith(
				"session-1",
				expect.objectContaining({
					type: "agentMessage",
					message,
				}),
			)
		})

		it("should handle concurrent agents - spawn and activate to count toward limit", async () => {
			const agents: string[] = []

			// Spawn 3 agents
			for (let i = 0; i < 3; i++) {
				const agentId = await agentPoolManager.spawnAgent({
					agentId: `agent-${i}`,
					role: "coder",
					providerProfile: "anthropic",
					mode: "code",
					workspace: tempDir,
				})
				agents.push(agentId)
			}

			expect(agents).toHaveLength(3)

			// Activate all agents - now they should count toward the limit
			for (let i = 0; i < 3; i++) {
				simulateAgentEvent(agentPoolManager, agents[i], `session-${i}`, {
					type: "session_created",
				})
			}

			// Now active count should be 3
			expect(agentPoolManager.getActiveAgentCount()).toBe(3)

			// Spawn 2 more agents (total 5, at the limit)
			for (let i = 3; i < 5; i++) {
				const agentId = await agentPoolManager.spawnAgent({
					agentId: `agent-${i}`,
					role: "coder",
					providerProfile: "anthropic",
					mode: "code",
					workspace: tempDir,
				})
				agents.push(agentId)
			}

			// Activate the remaining 2
			for (let i = 3; i < 5; i++) {
				simulateAgentEvent(agentPoolManager, agents[i], `session-${i}`, {
					type: "session_created",
				})
			}

			// Now at limit of 5
			expect(agentPoolManager.getActiveAgentCount()).toBe(5)

			// Should throw when exceeding limit (spawning a 6th)
			await expect(
				agentPoolManager.spawnAgent({
					agentId: "agent-excess",
					role: "coder",
					providerProfile: "anthropic",
					mode: "code",
					workspace: tempDir,
				}),
			).rejects.toThrow("Maximum concurrent agents")
		})

		it("should activate agents and verify active count", async () => {
			// Spawn and activate agents
			for (let i = 0; i < 3; i++) {
				const agentId = await agentPoolManager.spawnAgent({
					agentId: `active-agent-${i}`,
					role: "coder",
					providerProfile: "anthropic",
					mode: "code",
					workspace: tempDir,
				})

				// Activate the agent
				simulateAgentEvent(agentPoolManager, agentId, `session-${i}`, {
					type: "session_created",
				})
			}

			// Now active count should be 3
			expect(agentPoolManager.getActiveAgentCount()).toBe(3)
		})
	})

	describe("2. Message Router Request/Response with Correlation IDs", () => {
		let mockProcessHandler: MockProcessHandler
		let mockAgentPoolManager: any
		let messageRouter: MessageRouter

		beforeEach(() => {
			mockProcessHandler = createMockProcessHandler()
			mockAgentPoolManager = {
				getAgent: vi.fn(),
				getActiveAgents: vi.fn(() => []),
			}

			messageRouter = new MessageRouter(
				mockAgentPoolManager as unknown as AgentPoolManager,
				mockProcessHandler as unknown as any,
			)
		})

		afterEach(() => {
			messageRouter.dispose()
		})

		it("should route direct messages to specific ready agents via IPC", async () => {
			// Create a ready agent for direct messaging
			const mockAgent: AgentInstance = {
				agentId: "test-agent",
				role: "coder",
				mode: "code",
				providerProfile: "anthropic",
				status: "ready",
				sessionId: "session-1",
				spawnedAt: Date.now(),
				lastActivityAt: Date.now(),
			}
			mockAgentPoolManager.getAgent.mockReturnValue(mockAgent)

			const directMessage: AgentMessage = {
				id: "direct-1",
				type: "request",
				from: "organiser",
				to: "test-agent",
				timestamp: Date.now(),
				payload: {
					task: "Execute task",
					taskType: "execute",
					context: {
						artifactIds: [],
						instructions: "Do the thing",
					},
				},
			}

			await messageRouter.routeMessage(directMessage)

			// Message should be sent via IPC to the agent's session
			expect(mockProcessHandler.sendMessage).toHaveBeenCalledWith(
				"session-1",
				expect.objectContaining({
					type: "agentMessage",
					message: directMessage,
				}),
			)
		})

		it("should broadcast messages to all active agents via IPC", async () => {
			// Create agents with ready status (required for getActiveAgents)
			const agent1: AgentInstance = {
				agentId: "listener-1",
				role: "coder",
				mode: "code",
				providerProfile: "anthropic",
				status: "ready",
				sessionId: "session-1",
				spawnedAt: Date.now(),
				lastActivityAt: Date.now(),
			}
			const agent2: AgentInstance = {
				agentId: "listener-2",
				role: "coder",
				mode: "code",
				providerProfile: "anthropic",
				status: "ready",
				sessionId: "session-2",
				spawnedAt: Date.now(),
				lastActivityAt: Date.now(),
			}

			mockAgentPoolManager.getActiveAgents.mockReturnValue([agent1, agent2])
			mockAgentPoolManager.getAgent.mockImplementation((id: string) => {
				if (id === "listener-1") return agent1
				if (id === "listener-2") return agent2
				return undefined
			})

			// Subscribe both agents (subscriptions don't affect IPC delivery)
			messageRouter.subscribe("listener-1", async () => {})
			messageRouter.subscribe("listener-2", async () => {})

			// Send broadcast message
			const broadcastMessage: AgentMessage = {
				id: "broadcast-1",
				type: "notification",
				from: "organiser",
				to: "broadcast",
				timestamp: Date.now(),
				payload: {
					notificationType: "shutdown",
					reason: "Maintenance",
				},
			}

			await messageRouter.routeMessage(broadcastMessage)

			// Both agents should receive the message via IPC
			expect(mockProcessHandler.sendMessage).toHaveBeenCalledTimes(2)
			expect(mockProcessHandler.sendMessage).toHaveBeenCalledWith(
				"session-1",
				expect.objectContaining({
					type: "agentMessage",
					message: broadcastMessage,
				}),
			)
			expect(mockProcessHandler.sendMessage).toHaveBeenCalledWith(
				"session-2",
				expect.objectContaining({
					type: "agentMessage",
					message: broadcastMessage,
				}),
			)
		})

		it("should queue messages for agents that are not ready", async () => {
			// Create a spawning agent (not ready)
			const spawningAgent: AgentInstance = {
				agentId: "spawning-agent",
				role: "coder",
				mode: "code",
				providerProfile: "anthropic",
				status: "spawning",
				spawnedAt: Date.now(),
				lastActivityAt: Date.now(),
			}

			mockAgentPoolManager.getAgent.mockReturnValue(spawningAgent)

			const message: AgentMessage = {
				id: "queued-1",
				type: "request",
				from: "organiser",
				to: "spawning-agent",
				timestamp: Date.now(),
				payload: {
					task: "Wait for agent",
					taskType: "analyze",
					context: {
						artifactIds: [],
						instructions: "Wait for agent to be ready",
					},
				},
			}

			await messageRouter.routeMessage(message)

			// Message should NOT be sent via IPC since agent is not ready
			expect(mockProcessHandler.sendMessage).not.toHaveBeenCalled()
		})

		it("should throw error for unknown target agent", async () => {
			mockAgentPoolManager.getAgent.mockReturnValue(undefined)

			const message: AgentMessage = {
				id: "unknown-1",
				type: "request",
				from: "organiser",
				to: "unknown-agent",
				timestamp: Date.now(),
				payload: {
					task: "Find agent",
					taskType: "plan",
					context: {
						artifactIds: [],
						instructions: "Find the unknown agent",
					},
				},
			}

			await expect(messageRouter.routeMessage(message)).rejects.toThrow("Target agent unknown-agent not found")
		})
	})

	describe("3. AgentRegistry Multi-Agent Session Management", () => {
		let registry: AgentRegistry

		beforeEach(() => {
			registry = new AgentRegistry()
		})

		it("should create and manage multi-agent sessions", async () => {
			// Create session
			const session = registry.createMultiAgentSession({
				workspace: "/test/workspace",
				userTask: "Implement feature X",
			})
			const sessionId = session.sessionId

			expect(sessionId).toBeDefined()
			expect(session.userTask).toBe("Implement feature X")
			expect(session.status).toBe("initializing")

			// Add agents to session
			registry.addAgentToSession(sessionId, "agent-1", "architect")
			registry.addAgentToSession(sessionId, "agent-2", "coder")

			// Verify agents added
			const sessionData = registry.getMultiAgentSession(sessionId)
			expect(sessionData?.agents).toHaveLength(2)

			// Update agent status
			registry.updateAgentStatus("agent-1", "busy")
			const updatedAgent = registry
				.getAgentsForSession(sessionId)
				.find((a: { agentId: string }) => a.agentId === "agent-1")
			expect(updatedAgent?.status).toBe("busy")

			// Remove agent
			registry.removeAgentFromSession("agent-2")
			const afterRemove = registry.getMultiAgentSession(sessionId)
			expect(afterRemove?.agents).toHaveLength(1)

			// Verify session tracking
			const hasRunning = registry.hasRunningMultiAgentSessions()
			expect(hasRunning).toBe(true)
		})

		it("should track agent-to-session mapping", async () => {
			const session = registry.createMultiAgentSession({
				workspace: "/test/workspace",
				userTask: "Track agent session",
			})
			const sessionId = session.sessionId

			registry.addAgentToSession(sessionId, "tracked-agent", "debugger")

			// Get session for agent
			const retrievedSessionId = registry.getSessionForAgent("tracked-agent")
			expect(retrievedSessionId).toBe(sessionId)

			// Remove and verify mapping cleared
			registry.removeAgentFromSession("tracked-agent")
			const afterRemove = registry.getSessionForAgent("tracked-agent")
			expect(afterRemove).toBeUndefined()
		})

		it("should manage artifact summaries in sessions", async () => {
			const session = registry.createMultiAgentSession({
				workspace: "/test/workspace",
				userTask: "Manage artifacts",
			})
			const sessionId = session.sessionId

			// Add artifact summaries
			registry.addArtifactToSession(sessionId, {
				artifactId: "art-1",
				artifactType: "plan",
				summary: "Implementation plan created",
				status: "in_progress",
				producerRole: "architect",
			})

			registry.addArtifactToSession(sessionId, {
				artifactId: "art-2",
				artifactType: "code",
				summary: "Code implementation",
				status: "completed",
				producerRole: "coder",
			})

			// Verify artifacts tracked
			const artifacts = registry.getArtifactSummariesForSession(sessionId)
			expect(artifacts).toHaveLength(2)

			const sessionData = registry.getMultiAgentSession(sessionId)
			expect(sessionData?.artifactSummaries).toHaveLength(2)
		})

		it("should update workflow state", async () => {
			const session = registry.createMultiAgentSession({
				workspace: "/test/workspace",
				userTask: "Update workflow",
			})
			const sessionId = session.sessionId

			// Update workflow state
			const updated = registry.updateMultiAgentSessionWorkflowState(
				sessionId,
				"PLANNING",
				"Analyzing requirements",
			)

			expect(updated?.workflowState).toBe("PLANNING")
			expect(updated?.currentStepDescription).toBe("Analyzing requirements")
			expect(updated?.workflowHistory).toContain("PLANNING")
		})

		it("should update session status", async () => {
			const session = registry.createMultiAgentSession({
				workspace: "/test/workspace",
				userTask: "Update status",
			})
			const sessionId = session.sessionId

			// Complete session
			const completed = registry.updateMultiAgentSessionStatus(sessionId, "completed")
			expect(completed?.status).toBe("completed")
			expect(completed?.completedAt).toBeDefined()

			// Error status
			const errored = registry.updateMultiAgentSessionStatus(sessionId, "error", "Agent failed")
			expect(errored?.status).toBe("error")
			expect(errored?.error).toBe("Agent failed")
		})

		it("should get all multi-agent sessions", async () => {
			// Create multiple sessions
			registry.createMultiAgentSession({
				workspace: "/test/workspace",
				userTask: "Session 1",
			})

			registry.createMultiAgentSession({
				workspace: "/test/workspace",
				userTask: "Session 2",
			})

			const sessions = registry.getMultiAgentSessions()
			expect(sessions).toHaveLength(2)
		})
	})

	describe("4. Agent Pool Manager Lifecycle", () => {
		let mockProcessHandler: MockProcessHandler
		let registry: AgentRegistry
		let messageRouter: MessageRouter
		let fileLockingService: any
		let agentPoolManager: AgentPoolManager
		let tempDir: string

		beforeEach(async () => {
			tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "lifecycle-test-"))
			mockProcessHandler = createMockProcessHandler()
			registry = new AgentRegistry()
			fileLockingService = createMockFileLockingService()
			messageRouter = new MessageRouter({} as AgentPoolManager, mockProcessHandler as unknown as any)
			agentPoolManager = new AgentPoolManager(
				mockProcessHandler as unknown as any,
				registry,
				messageRouter,
				fileLockingService,
				{ maxConcurrentAgents: 5 },
			)
			// @ts-expect-error - accessing private property for testing
			messageRouter.agentPoolManager = agentPoolManager
		})

		afterEach(async () => {
			agentPoolManager.dispose()
			messageRouter.dispose()
			fileLockingService.dispose()
			await fs.rm(tempDir, { recursive: true, force: true })
		})

		it("should get all agents including stopped/error states", async () => {
			const agentId = await agentPoolManager.spawnAgent({
				agentId: "lifecycle-agent",
				role: "coder",
				providerProfile: "anthropic",
				mode: "code",
				workspace: tempDir,
			})

			expect(agentId).toBe("lifecycle-agent")

			// Get all agents should include spawning agent
			const allAgents = agentPoolManager.getAllAgents()
			expect(allAgents).toHaveLength(1)
			expect(allAgents[0]?.agentId).toBe("lifecycle-agent")
		})

		it("should throw error when agent ID already exists", async () => {
			const config: AgentSpawnConfig = {
				agentId: "duplicate-test",
				role: "architect",
				providerProfile: "anthropic",
				mode: "architect",
				workspace: tempDir,
			}

			await agentPoolManager.spawnAgent(config)

			await expect(agentPoolManager.spawnAgent(config)).rejects.toThrow(
				"Agent with ID duplicate-test already exists",
			)
		})

		it("should get agent by ID", async () => {
			const agentId = await agentPoolManager.spawnAgent({
				agentId: "get-test-agent",
				role: "coder",
				providerProfile: "anthropic",
				mode: "code",
				workspace: tempDir,
			})

			const agent = agentPoolManager.getAgent(agentId)
			expect(agent).toBeDefined()
			expect(agent?.agentId).toBe("get-test-agent")
		})
	})
})
