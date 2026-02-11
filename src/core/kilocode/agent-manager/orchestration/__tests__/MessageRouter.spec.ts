import { describe, test, expect, vi, beforeEach, afterEach } from "vitest"
import { MessageRouter, type AgentMessage } from "../MessageRouter"
import { AgentPoolManager } from "../AgentPoolManager"
import { RuntimeProcessHandler } from "../../RuntimeProcessHandler"
import type { AgentInstance } from "../types"

describe("MessageRouter", () => {
	let messageRouter: MessageRouter
	let mockAgentPoolManager: AgentPoolManager
	let mockProcessHandler: RuntimeProcessHandler
	let mockAgent: AgentInstance

	beforeEach(() => {
		// Create mock agent
		mockAgent = {
			agentId: "test-agent-1",
			role: "architect",
			mode: "architect",
			providerProfile: "test-profile",
			status: "ready",
			sessionId: "test-session-1",
			spawnedAt: Date.now(),
			lastActivityAt: Date.now(),
		}

		// Create mock AgentPoolManager
		mockAgentPoolManager = {
			getAgent: vi.fn((agentId: string) => {
				if (agentId === mockAgent.agentId) {
					return mockAgent
				}
				return undefined
			}),
			getActiveAgents: vi.fn(() => [mockAgent]),
		} as unknown as AgentPoolManager

		// Create mock RuntimeProcessHandler
		mockProcessHandler = {
			sendMessage: vi.fn().mockResolvedValue(undefined),
		} as unknown as RuntimeProcessHandler

		// Create MessageRouter
		messageRouter = new MessageRouter(mockAgentPoolManager, mockProcessHandler)
	})

	afterEach(() => {
		messageRouter.dispose()
	})

	describe("routeMessage", () => {
		test("should route message to target agent", async () => {
			const message: AgentMessage = {
				id: "msg-1",
				type: "request",
				from: "sender",
				to: mockAgent.agentId,
				timestamp: Date.now(),
				payload: {
					task: "test task",
					taskType: "analyze",
					context: {
						artifactIds: [],
						instructions: "test instructions",
					},
				},
			}

			await messageRouter.routeMessage(message)

			expect(mockProcessHandler.sendMessage).toHaveBeenCalledWith(
				mockAgent.sessionId,
				expect.objectContaining({
					type: "agentMessage",
					message,
				}),
			)
		})

		test("should throw error if target agent not found", async () => {
			const message: AgentMessage = {
				id: "msg-1",
				type: "request",
				from: "sender",
				to: "non-existent-agent",
				timestamp: Date.now(),
				payload: {
					task: "test task",
					taskType: "analyze",
					context: {
						artifactIds: [],
						instructions: "test instructions",
					},
				},
			}

			await expect(messageRouter.routeMessage(message)).rejects.toThrow(
				"Target agent non-existent-agent not found",
			)
		})

		test("should queue message if agent is not ready", async () => {
			mockAgent.status = "spawning"

			const message: AgentMessage = {
				id: "msg-1",
				type: "request",
				from: "sender",
				to: mockAgent.agentId,
				timestamp: Date.now(),
				payload: {
					task: "test task",
					taskType: "analyze",
					context: {
						artifactIds: [],
						instructions: "test instructions",
					},
				},
			}

			await messageRouter.routeMessage(message)

			// Message should be queued, not sent immediately
			expect(mockProcessHandler.sendMessage).not.toHaveBeenCalled()
		})

		test("should broadcast message to all active agents", async () => {
			const message: AgentMessage = {
				id: "msg-1",
				type: "status",
				from: "sender",
				to: "broadcast",
				timestamp: Date.now(),
				payload: {
					agentId: "sender",
					status: "idle",
				},
			}

			await messageRouter.routeMessage(message)

			expect(mockProcessHandler.sendMessage).toHaveBeenCalled()
		})
	})

	describe("subscribe and unsubscribe", () => {
		test("should subscribe agent to receive messages", () => {
			const handler = vi.fn()
			messageRouter.subscribe("agent-1", handler)

			// Subscription should be registered
			expect(messageRouter["subscriptions"].has("agent-1")).toBe(true)
		})

		test("should unsubscribe agent from receiving messages", () => {
			const handler = vi.fn()
			messageRouter.subscribe("agent-1", handler)
			messageRouter.unsubscribe("agent-1")

			// Subscription should be removed
			expect(messageRouter["subscriptions"].has("agent-1")).toBe(false)
		})
	})

	describe("sendRequest and sendResponse", () => {
		test("should send request and wait for response", async () => {
			const requestPayload = {
				task: "test task",
				taskType: "analyze" as const,
				context: {
					artifactIds: [],
					instructions: "test instructions",
				},
			}

			// Send request
			const requestPromise = messageRouter.sendRequest(mockAgent.agentId, requestPayload, 5000)

			// Simulate response
			const responseMessage: AgentMessage = {
				id: "msg-2",
				type: "response",
				from: mockAgent.agentId,
				to: "router",
				timestamp: Date.now(),
				payload: {
					success: true,
					result: "test result",
				},
				correlationId: messageRouter["pendingRequests"].keys().next().value,
			}

			// Handle incoming response
			await messageRouter.handleIncomingMessage(responseMessage)

			// Wait for request to complete
			const response = await requestPromise

			expect(response).toEqual(responseMessage)
		})

		test("should timeout if no response received", async () => {
			const requestPayload = {
				task: "test task",
				taskType: "analyze" as const,
				context: {
					artifactIds: [],
					instructions: "test instructions",
				},
			}

			await expect(
				messageRouter.sendRequest(mockAgent.agentId, requestPayload, 100),
			).rejects.toThrow("Request timeout after 100ms")
		})

		test("should send response to request", async () => {
			const responsePayload = {
				success: true,
				result: "test result",
			}

			await messageRouter.sendResponse(mockAgent.agentId, responsePayload, "corr-123")

			expect(mockProcessHandler.sendMessage).toHaveBeenCalledWith(
				mockAgent.sessionId,
				expect.objectContaining({
					type: "agentMessage",
					message: expect.objectContaining({
						type: "response",
						correlationId: "corr-123",
					}),
				}),
			)
		})
	})

	describe("message validation", () => {
		test("should throw error for invalid message", async () => {
			const invalidMessage = {
				id: "msg-1",
				// Missing required fields
			} as unknown as AgentMessage

			await expect(messageRouter.routeMessage(invalidMessage)).rejects.toThrow()
		})
	})

	describe("message logging", () => {
		test("should log messages", async () => {
			const message: AgentMessage = {
				id: "msg-1",
				type: "request",
				from: "sender",
				to: mockAgent.agentId,
				timestamp: Date.now(),
				payload: {
					task: "test task",
					taskType: "analyze",
					context: {
						artifactIds: [],
						instructions: "test instructions",
					},
				},
			}

			await messageRouter.routeMessage(message)

			const log = messageRouter.getMessageLog()
			expect(log.length).toBeGreaterThan(0)
			expect(log[0].message).toEqual(message)
		})

		test("should limit log size", async () => {
			// Send more messages than max log size
			for (let i = 0; i < 1100; i++) {
				const message: AgentMessage = {
					id: `msg-${i}`,
					type: "request",
					from: "sender",
					to: mockAgent.agentId,
					timestamp: Date.now(),
					payload: {
						task: "test task",
						taskType: "analyze",
						context: {
							artifactIds: [],
							instructions: "test instructions",
						},
					},
				}

				await messageRouter.routeMessage(message)
			}

			const log = messageRouter.getMessageLog()
			// Log should be limited to maxLogSize (1000)
			expect(log.length).toBeLessThanOrEqual(1000)
		})
	})

	describe("dispose", () => {
		test("should clean up resources on dispose", () => {
			// Add some subscriptions
			messageRouter.subscribe("agent-1", vi.fn())
			messageRouter.subscribe("agent-2", vi.fn())

			// Dispose
			messageRouter.dispose()

			// Subscriptions should be cleared
			expect(messageRouter["subscriptions"].size).toBe(0)

			// Queue should be cleared
			expect(messageRouter["messageQueue"].length).toBe(0)

			// Log should be cleared
			expect(messageRouter["messageLog"].length).toBe(0)
		})
	})

	describe("message queuing", () => {
		test("should process queued messages when agent becomes ready", async () => {
			// Set agent to not ready
			mockAgent.status = "spawning"

			const message: AgentMessage = {
				id: "msg-1",
				type: "request",
				from: "sender",
				to: mockAgent.agentId,
				timestamp: Date.now(),
				payload: {
					task: "test task",
					taskType: "analyze",
					context: {
						artifactIds: [],
						instructions: "test instructions",
					},
				},
			}

			// Route message (should be queued)
			await messageRouter.routeMessage(message)

			// Make agent ready
			mockAgent.status = "ready"

			// Wait for queue processing
			await new Promise((resolve) => setTimeout(resolve, 200))

			// Message should be sent
			expect(mockProcessHandler.sendMessage).toHaveBeenCalled()
		})
	})
})
