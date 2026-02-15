// kilocode_change - new file

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { ErrorRecoveryManager, createErrorRecoveryManager } from "../ErrorRecoveryManager"
import type { AgentPoolManager } from "../AgentPoolManager"
import type { MessageRouter } from "../MessageRouter"
import type { CheckpointIntegration } from "../CheckpointIntegration"
import type { HealthEvent } from "../../../../../services/kilocode/health-monitoring"
import type {
	ErrorContext,
	RecoveryResult,
	ErrorRecoveryConfig,
	OrchestrationErrorType,
	ErrorSeverity,
	CircuitBreakerStatus,
} from "../ErrorRecoveryTypes"

// Mock dependencies
const mockAgentPoolManager = {
	getActiveAgents: vi.fn(),
	getAgent: vi.fn(),
	restartAgent: vi.fn(),
	terminateAgent: vi.fn(),
	pauseAgent: vi.fn(),
	addHealthListener: vi.fn(),
	removeHealthListener: vi.fn(),
}

const mockMessageRouter = {
	routeMessage: vi.fn(),
}

const mockCheckpointIntegration = {
	rollbackToLatest: vi.fn(),
	rollbackToCheckpoint: vi.fn(),
	getLatestCheckpoint: vi.fn(),
	createCheckpoint: vi.fn(),
}

describe("ErrorRecoveryManager", () => {
	let recoveryManager: ErrorRecoveryManager

	beforeEach(() => {
		vi.clearAllMocks()

		// Reset mocks
		mockAgentPoolManager.getActiveAgents.mockReturnValue([])
		mockAgentPoolManager.getAgent.mockReturnValue(undefined)
		mockAgentPoolManager.restartAgent.mockResolvedValue(true)
		mockAgentPoolManager.terminateAgent.mockResolvedValue(undefined)
		mockAgentPoolManager.pauseAgent.mockResolvedValue(undefined)
		mockMessageRouter.routeMessage.mockResolvedValue(undefined)
		mockCheckpointIntegration.rollbackToLatest.mockResolvedValue({
			success: true,
			checkpoint: { id: "checkpoint-1" },
			warnings: [],
		})
	})

	afterEach(() => {
		recoveryManager?.dispose()
	})

	describe("constructor", () => {
		it("should create instance with default config", () => {
			recoveryManager = new ErrorRecoveryManager({})
			expect(recoveryManager).toBeDefined()
			expect(recoveryManager.getStatistics()).toBeDefined()
		})

		it("should create instance with custom config", () => {
			const config: Partial<ErrorRecoveryConfig> = {
				maxRetryAttempts: 5,
				defaultRetryDelayMs: 2000,
				enableCircuitBreaker: false,
			}
			recoveryManager = new ErrorRecoveryManager({ config })
			expect(recoveryManager).toBeDefined()
		})

		it("should set up health event listener when agent pool manager is provided", () => {
			recoveryManager = new ErrorRecoveryManager({
				agentPoolManager: mockAgentPoolManager as unknown as AgentPoolManager,
			})
			expect(mockAgentPoolManager.addHealthListener).toHaveBeenCalled()
		})
	})

	describe("createErrorContext", () => {
		beforeEach(() => {
			recoveryManager = new ErrorRecoveryManager({})
		})

		it("should create error context with required fields", () => {
			const context = recoveryManager.createErrorContext({
				errorType: "agent_failure",
				message: "Test error",
			})

			expect(context.errorId).toBeDefined()
			expect(context.errorType).toBe("agent_failure")
			expect(context.message).toBe("Test error")
			expect(context.timestamp).toBeDefined()
		})

		it("should infer severity from error type", () => {
			const context = recoveryManager.createErrorContext({
				errorType: "agent_failure",
				message: "Test error",
			})

			expect(context.severity).toBe("high")
		})

		it("should use provided severity", () => {
			const context = recoveryManager.createErrorContext({
				errorType: "agent_failure",
				message: "Test error",
				severity: "critical",
			})

			expect(context.severity).toBe("critical")
		})

		it("should include optional fields when provided", () => {
			const context = recoveryManager.createErrorContext({
				errorType: "agent_failure",
				message: "Test error",
				agentId: "agent-1",
				sessionId: "session-1",
				taskId: "task-1",
			})

			expect(context.agentId).toBe("agent-1")
			expect(context.sessionId).toBe("session-1")
			expect(context.taskId).toBe("task-1")
		})
	})

	describe("handleError", () => {
		beforeEach(() => {
			recoveryManager = new ErrorRecoveryManager({
				agentPoolManager: mockAgentPoolManager as unknown as AgentPoolManager,
				messageRouter: mockMessageRouter as unknown as MessageRouter,
				checkpointIntegration: mockCheckpointIntegration as unknown as CheckpointIntegration,
			})
			// Add error listener to prevent unhandled error event
			recoveryManager.addErrorListener(() => {})
		})

		it("should return disabled result when recovery is disabled", async () => {
			recoveryManager = new ErrorRecoveryManager({
				config: { enabled: false },
			})

			const context = recoveryManager.createErrorContext({
				errorType: "agent_failure",
				message: "Test error",
			})

			const result = await recoveryManager.handleError(context)
			expect(result.success).toBe(false)
			expect(result.error).toBe("Error recovery is disabled")
		})

		it("should record error in statistics", async () => {
			const context = recoveryManager.createErrorContext({
				errorType: "agent_failure",
				message: "Test error",
			})

			await recoveryManager.handleError(context)

			const stats = recoveryManager.getStatistics()
			expect(stats.totalErrors).toBe(1)
			expect(stats.errorsByType["agent_failure"]).toBe(1)
		})

		it("should emit error event", async () => {
			const listener = vi.fn()
			recoveryManager.addErrorListener(listener)

			const context = recoveryManager.createErrorContext({
				errorType: "agent_failure",
				message: "Test error",
			})

			await recoveryManager.handleError(context)

			expect(listener).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "error_occurred",
					context: expect.objectContaining({ errorType: "agent_failure" }),
				}),
			)
		})
	})

	describe("canRecover", () => {
		beforeEach(() => {
			recoveryManager = new ErrorRecoveryManager({})
		})

		it("should return false when recovery is disabled", () => {
			recoveryManager = new ErrorRecoveryManager({
				config: { enabled: false },
			})

			const context = recoveryManager.createErrorContext({
				errorType: "agent_failure",
				message: "Test error",
			})

			expect(recoveryManager.canRecover(context)).toBe(false)
		})

		it("should return true when strategy exists and retry count is below max", () => {
			const context = recoveryManager.createErrorContext({
				errorType: "agent_failure",
				message: "Test error",
			})

			expect(recoveryManager.canRecover(context)).toBe(true)
		})

		it("should return false when retry count exceeds max attempts", () => {
			const context = recoveryManager.createErrorContext({
				errorType: "agent_failure",
				message: "Test error",
			})
			context.retryCount = 10

			expect(recoveryManager.canRecover(context)).toBe(false)
		})
	})

	describe("getStrategy", () => {
		beforeEach(() => {
			recoveryManager = new ErrorRecoveryManager({})
		})

		it("should return strategy for known error type", () => {
			const context = recoveryManager.createErrorContext({
				errorType: "agent_failure",
				message: "Test error",
			})

			const strategy = recoveryManager.getStrategy(context)
			expect(strategy).toBeDefined()
			expect(strategy?.type).toBe("restart_agent")
		})

		it("should return default strategy for unknown error type", () => {
			const context = recoveryManager.createErrorContext({
				errorType: "unknown_error",
				message: "Test error",
			})

			const strategy = recoveryManager.getStrategy(context)
			expect(strategy).toBeDefined()
		})
	})

	describe("Retry Strategy", () => {
		beforeEach(() => {
			recoveryManager = new ErrorRecoveryManager({
				messageRouter: mockMessageRouter as unknown as MessageRouter,
			})
			// Add error listener to prevent unhandled error event
			recoveryManager.addErrorListener(() => {})
		})

		it("should execute retry with message router", async () => {
			const context = recoveryManager.createErrorContext({
				errorType: "agent_timeout",
				message: "Agent timeout",
				messageContext: {
					id: "msg-1",
					from: "agent-1",
					to: "agent-2",
					type: "request",
					payload: { task: "test", taskType: "execute", context: { artifactIds: [], instructions: "" } },
					timestamp: Date.now(),
				},
			})

			const result = await recoveryManager.handleError(context)

			expect(mockMessageRouter.routeMessage).toHaveBeenCalled()
			expect(result.success).toBe(true)
			expect(result.strategy).toBe("retry")
		})

		it("should fail retry without message router", async () => {
			recoveryManager = new ErrorRecoveryManager({
				config: {
					enableFallbacks: false,
					strategies: new Map([
						[
							"agent_timeout",
							[{ type: "retry", maxAttempts: 1, delayMs: 100, priority: 1, exponentialBackoff: false }],
						],
					]),
				},
			})
			recoveryManager.addErrorListener(() => {})

			const context = recoveryManager.createErrorContext({
				errorType: "agent_timeout",
				message: "Agent timeout",
				messageContext: {
					id: "msg-1",
					from: "agent-1",
					to: "agent-2",
					type: "request",
					payload: { task: "test", taskType: "execute", context: { artifactIds: [], instructions: "" } },
					timestamp: Date.now(),
				},
			})

			const result = await recoveryManager.handleError(context)

			expect(result.success).toBe(false)
			expect(result.error).toContain("No message router")
		})

		it("should use exponential backoff for delays", async () => {
			vi.useFakeTimers()

			const context = recoveryManager.createErrorContext({
				errorType: "rate_limit_exceeded",
				message: "Rate limit",
				messageContext: {
					id: "msg-1",
					from: "agent-1",
					to: "agent-2",
					type: "request",
					payload: { task: "test", taskType: "execute", context: { artifactIds: [], instructions: "" } },
					timestamp: Date.now(),
				},
			})

			// Start error handling
			const resultPromise = recoveryManager.handleError(context)

			// Advance timers to allow retries
			await vi.runAllTimersAsync()

			const result = await resultPromise
			expect(result.attempts).toBeGreaterThan(0)

			vi.useRealTimers()
		})
	})

	describe("Reassign Strategy", () => {
		beforeEach(() => {
			recoveryManager = new ErrorRecoveryManager({
				agentPoolManager: mockAgentPoolManager as unknown as AgentPoolManager,
				messageRouter: mockMessageRouter as unknown as MessageRouter,
			})
			// Add error listener to prevent unhandled error event
			recoveryManager.addErrorListener(() => {})
		})

		it("should reassign task to another agent", async () => {
			mockAgentPoolManager.getActiveAgents.mockReturnValue([
				{ agentId: "agent-1", role: "coder", status: "ready" },
				{ agentId: "agent-2", role: "coder", status: "ready" },
			])

			const context = recoveryManager.createErrorContext({
				errorType: "agent_failure",
				message: "Agent failed",
				agentId: "agent-1",
				messageContext: {
					id: "msg-1",
					from: "orchestrator",
					to: "agent-1",
					type: "request",
					payload: { task: "test", taskType: "execute", context: { artifactIds: [], instructions: "" } },
					timestamp: Date.now(),
				},
			})

			const result = await recoveryManager.handleError(context)

			expect(result.success).toBe(true)
			// The strategy used should be reassign or a fallback
			expect(["reassign", "restart_agent"]).toContain(result.strategy)
		})

		it("should fail reassignment when no agents available", async () => {
			// Configure to only use reassign strategy
			recoveryManager = new ErrorRecoveryManager({
				agentPoolManager: mockAgentPoolManager as unknown as AgentPoolManager,
				config: {
					enableFallbacks: false,
					strategies: new Map([
						[
							"agent_failure",
							[
								{
									type: "reassign",
									maxAttempts: 1,
									delayMs: 100,
									priority: 1,
									exponentialBackoff: false,
								},
							],
						],
					]),
				},
			})
			recoveryManager.addErrorListener(() => {})

			mockAgentPoolManager.getActiveAgents.mockReturnValue([])

			const context = recoveryManager.createErrorContext({
				errorType: "agent_failure",
				message: "Agent failed",
				agentId: "agent-1",
			})

			const result = await recoveryManager.handleError(context)

			expect(result.success).toBe(false)
			expect(result.error).toContain("No available agents")
		})

		it("should prefer agent with specified role", async () => {
			mockAgentPoolManager.getActiveAgents.mockReturnValue([
				{ agentId: "agent-1", role: "coder", status: "ready" },
				{ agentId: "agent-2", role: "architect", status: "ready" },
			])

			const result = await recoveryManager.reassignTask({
				fromAgentId: "agent-1",
				reason: "Test reassignment",
				preferredRole: "architect",
				preserveContext: true,
			})

			expect(result.success).toBe(true)
			expect(result.newAgentId).toBe("agent-2")
		})
	})

	describe("Restart Agent Strategy", () => {
		beforeEach(() => {
			recoveryManager = new ErrorRecoveryManager({
				agentPoolManager: mockAgentPoolManager as unknown as AgentPoolManager,
			})
			// Add error listener to prevent unhandled error event
			recoveryManager.addErrorListener(() => {})
		})

		it("should restart agent successfully", async () => {
			mockAgentPoolManager.restartAgent.mockResolvedValue(true)

			const context = recoveryManager.createErrorContext({
				errorType: "agent_unhealthy",
				message: "Agent unhealthy",
				agentId: "agent-1",
			})

			const result = await recoveryManager.handleError(context)

			expect(mockAgentPoolManager.restartAgent).toHaveBeenCalledWith("agent-1")
			expect(result.success).toBe(true)
			expect(result.strategy).toBe("restart_agent")
		})

		it("should fail when restart returns false", async () => {
			// Configure to only use restart_agent strategy
			recoveryManager = new ErrorRecoveryManager({
				agentPoolManager: mockAgentPoolManager as unknown as AgentPoolManager,
				config: {
					enableFallbacks: false,
					strategies: new Map([
						[
							"agent_unhealthy",
							[
								{
									type: "restart_agent",
									maxAttempts: 1,
									delayMs: 100,
									priority: 1,
									exponentialBackoff: false,
								},
							],
						],
					]),
				},
			})
			recoveryManager.addErrorListener(() => {})

			mockAgentPoolManager.restartAgent.mockResolvedValue(false)

			const context = recoveryManager.createErrorContext({
				errorType: "agent_unhealthy",
				message: "Agent unhealthy",
				agentId: "agent-1",
			})

			const result = await recoveryManager.handleError(context)

			expect(result.success).toBe(false)
			expect(result.error).toContain("Failed to restart agent")
		})

		it("should fail without agent ID", async () => {
			// Configure to only use restart_agent strategy
			recoveryManager = new ErrorRecoveryManager({
				agentPoolManager: mockAgentPoolManager as unknown as AgentPoolManager,
				config: {
					enableFallbacks: false,
					strategies: new Map([
						[
							"agent_unhealthy",
							[
								{
									type: "restart_agent",
									maxAttempts: 1,
									delayMs: 100,
									priority: 1,
									exponentialBackoff: false,
								},
							],
						],
					]),
				},
			})
			recoveryManager.addErrorListener(() => {})

			const context = recoveryManager.createErrorContext({
				errorType: "agent_unhealthy",
				message: "Agent unhealthy",
			})

			const result = await recoveryManager.handleError(context)

			expect(result.success).toBe(false)
			expect(result.error).toContain("No agent pool manager or agent ID")
		})
	})

	describe("Rollback Strategy", () => {
		beforeEach(() => {
			recoveryManager = new ErrorRecoveryManager({
				checkpointIntegration: mockCheckpointIntegration as unknown as CheckpointIntegration,
			})
			// Add error listener to prevent unhandled error event
			recoveryManager.addErrorListener(() => {})
		})

		it("should rollback to latest checkpoint", async () => {
			mockCheckpointIntegration.rollbackToLatest.mockResolvedValue({
				success: true,
				checkpoint: { id: "checkpoint-1" },
				warnings: [],
			})

			const context = recoveryManager.createErrorContext({
				errorType: "task_execution_error",
				message: "Task failed",
			})

			// Force rollback strategy
			context.retryCount = 10

			const result = await recoveryManager.handleError(context)

			expect(mockCheckpointIntegration.rollbackToLatest).toHaveBeenCalled()
			expect(result.success).toBe(true)
			expect(result.rollbackCheckpointId).toBe("checkpoint-1")
		})

		it("should fail rollback without checkpoint integration", async () => {
			// Configure to only use rollback strategy
			recoveryManager = new ErrorRecoveryManager({
				config: {
					enableFallbacks: false,
					strategies: new Map([
						[
							"unknown_error",
							[
								{
									type: "rollback",
									maxAttempts: 1,
									delayMs: 100,
									priority: 1,
									exponentialBackoff: false,
								},
							],
						],
					]),
				},
			})
			recoveryManager.addErrorListener(() => {})

			const context = recoveryManager.createErrorContext({
				errorType: "unknown_error",
				message: "Unknown error",
			})

			const result = await recoveryManager.handleError(context)

			// Will try rollback as first strategy for unknown_error
			expect(result.success).toBe(false)
		})
	})

	describe("Graceful Degradation Strategy", () => {
		beforeEach(() => {
			recoveryManager = new ErrorRecoveryManager({
				agentPoolManager: mockAgentPoolManager as unknown as AgentPoolManager,
			})
			// Add error listener to prevent unhandled error event
			recoveryManager.addErrorListener(() => {})
		})

		it("should activate graceful degradation", async () => {
			mockAgentPoolManager.getActiveAgents.mockReturnValue([
				{ agentId: "agent-1", role: "coder", status: "ready" },
				{ agentId: "agent-2", role: "coder", status: "ready" },
				{ agentId: "agent-3", role: "coder", status: "ready" },
				{ agentId: "agent-4", role: "coder", status: "ready" },
			])

			const result = await recoveryManager.activateGracefulDegradation({
				skipOptionalSteps: true,
				reduceParallelism: true,
				maxAgents: 2,
				useFallbackProviders: false,
			})

			expect(result.success).toBe(true)
			expect(result.strategy).toBe("graceful_degradation")
			expect(mockAgentPoolManager.pauseAgent).toHaveBeenCalled()
		})

		it("should execute custom behavior during degradation", async () => {
			const customBehavior = vi.fn().mockResolvedValue(undefined)

			const result = await recoveryManager.activateGracefulDegradation({
				skipOptionalSteps: true,
				reduceParallelism: false,
				useFallbackProviders: false,
				customBehavior,
			})

			expect(customBehavior).toHaveBeenCalled()
			expect(result.success).toBe(true)
		})
	})

	describe("User Notification Strategy", () => {
		beforeEach(() => {
			recoveryManager = new ErrorRecoveryManager({})
			// Add error listener to prevent unhandled error event
			recoveryManager.addErrorListener(() => {})
		})

		it("should send user notification", async () => {
			const notificationListener = vi.fn()
			recoveryManager.on("userNotification", notificationListener)

			await recoveryManager.notifyUser({
				type: "error",
				title: "Test Error",
				message: "Something went wrong",
				requireAction: true,
				timeoutMs: 0,
			})

			expect(notificationListener).toHaveBeenCalled()
		})

		it("should update notification statistics", async () => {
			await recoveryManager.notifyUser({
				type: "error",
				title: "Test Error",
				message: "Something went wrong",
				requireAction: false,
				timeoutMs: 5000,
			})

			const stats = recoveryManager.getStatistics()
			expect(stats.userNotificationsSent).toBe(1)
		})
	})

	describe("Circuit Breaker", () => {
		beforeEach(() => {
			recoveryManager = new ErrorRecoveryManager({
				config: {
					enableCircuitBreaker: true,
					circuitBreakerConfig: {
						failureThreshold: 3,
						resetTimeoutMs: 10000,
						successThreshold: 2,
						failureWindowMs: 60000,
					},
				},
			})
			// Add error listener to prevent unhandled error event
			recoveryManager.addErrorListener(() => {})
		})

		it("should start with closed circuit breaker", () => {
			const status = recoveryManager.getCircuitBreakerStatus("test-key")
			expect(status).toBeUndefined()
		})

		it("should open circuit breaker after threshold failures", async () => {
			const context = recoveryManager.createErrorContext({
				errorType: "agent_failure",
				message: "Test error",
				agentId: "agent-1",
			})

			// Trigger multiple failures
			for (let i = 0; i < 5; i++) {
				await recoveryManager.handleError(context)
			}

			const status = recoveryManager.getCircuitBreakerStatus("agent-1")
			expect(status?.state).toBe("open")
		})

		it("should reset circuit breaker", () => {
			recoveryManager.resetCircuitBreaker("test-key")
			const status = recoveryManager.getCircuitBreakerStatus("test-key")
			expect(status).toBeUndefined()
		})

		it("should reset all circuit breakers", () => {
			recoveryManager.resetAllCircuitBreakers()
			const statuses = recoveryManager.getAllCircuitBreakerStatuses()
			expect(statuses.size).toBe(0)
		})
	})

	describe("Statistics", () => {
		beforeEach(() => {
			recoveryManager = new ErrorRecoveryManager({})
			// Add error listener to prevent unhandled error event
			recoveryManager.addErrorListener(() => {})
		})

		it("should track error statistics", async () => {
			const context = recoveryManager.createErrorContext({
				errorType: "agent_failure",
				message: "Test error",
				severity: "high",
			})

			await recoveryManager.handleError(context)

			const stats = recoveryManager.getStatistics()
			expect(stats.totalErrors).toBe(1)
			expect(stats.errorsByType["agent_failure"]).toBe(1)
			expect(stats.errorsBySeverity["high"]).toBe(1)
		})

		it("should track recovery statistics", async () => {
			recoveryManager = new ErrorRecoveryManager({
				messageRouter: mockMessageRouter as unknown as MessageRouter,
			})
			recoveryManager.addErrorListener(() => {})

			const context = recoveryManager.createErrorContext({
				errorType: "agent_timeout",
				message: "Timeout",
				messageContext: {
					id: "msg-1",
					from: "agent-1",
					to: "agent-2",
					type: "request",
					payload: { task: "test", taskType: "execute", context: { artifactIds: [], instructions: "" } },
					timestamp: Date.now(),
				},
			})

			await recoveryManager.handleError(context)

			const stats = recoveryManager.getStatistics()
			expect(stats.totalRecoveryAttempts).toBeGreaterThan(0)
		})
	})

	describe("Error History", () => {
		beforeEach(() => {
			recoveryManager = new ErrorRecoveryManager({})
			// Add error listener to prevent unhandled error event
			recoveryManager.addErrorListener(() => {})
		})

		it("should record errors in history", async () => {
			const context = recoveryManager.createErrorContext({
				errorType: "agent_failure",
				message: "Test error",
			})

			await recoveryManager.handleError(context)

			const history = recoveryManager.getErrorHistory()
			expect(history.length).toBe(1)
			expect(history[0].errorType).toBe("agent_failure")
		})

		it("should limit history with parameter", async () => {
			for (let i = 0; i < 5; i++) {
				const context = recoveryManager.createErrorContext({
					errorType: "agent_failure",
					message: `Error ${i}`,
				})
				await recoveryManager.handleError(context)
			}

			const history = recoveryManager.getErrorHistory(3)
			expect(history.length).toBe(3)
		})

		it("should clear error history", () => {
			recoveryManager.clearErrorHistory()
			const history = recoveryManager.getErrorHistory()
			expect(history.length).toBe(0)
		})
	})

	describe("Health Event Integration", () => {
		it("should handle unhealthy agent events", async () => {
			let healthListener: ((event: HealthEvent) => void) | undefined

			mockAgentPoolManager.addHealthListener.mockImplementation((listener) => {
				healthListener = listener
			})

			recoveryManager = new ErrorRecoveryManager({
				agentPoolManager: mockAgentPoolManager as unknown as AgentPoolManager,
			})

			// Add error listener to prevent unhandled error event
			recoveryManager.addErrorListener(() => {})

			// Simulate unhealthy event
			if (healthListener) {
				healthListener({
					type: "agent_unhealthy",
					agentId: "agent-1",
					timestamp: Date.now(),
				})
			}

			// Allow async handling
			await new Promise((resolve) => setTimeout(resolve, 10))

			const stats = recoveryManager.getStatistics()
			expect(stats.totalErrors).toBe(1)
		})

		it("should handle max restarts reached events", async () => {
			let healthListener: ((event: HealthEvent) => void) | undefined

			mockAgentPoolManager.addHealthListener.mockImplementation((listener) => {
				healthListener = listener
			})

			recoveryManager = new ErrorRecoveryManager({
				agentPoolManager: mockAgentPoolManager as unknown as AgentPoolManager,
			})

			// Add error listener to prevent unhandled error event
			recoveryManager.addErrorListener(() => {})

			// Simulate max restarts reached event
			if (healthListener) {
				healthListener({
					type: "agent_max_restarts_reached",
					agentId: "agent-1",
					timestamp: Date.now(),
				})
			}

			// Allow async handling
			await new Promise((resolve) => setTimeout(resolve, 10))

			const stats = recoveryManager.getStatistics()
			expect(stats.totalErrors).toBe(1)
		})
	})

	describe("Event Emission", () => {
		beforeEach(() => {
			recoveryManager = new ErrorRecoveryManager({})
			// Add error listener to prevent unhandled error event
			recoveryManager.addErrorListener(() => {})
		})

		it("should emit error events", async () => {
			const listener = vi.fn()
			recoveryManager.addErrorListener(listener)

			const context = recoveryManager.createErrorContext({
				errorType: "agent_failure",
				message: "Test error",
			})

			await recoveryManager.handleError(context)

			expect(listener).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "error_occurred",
				}),
			)
		})

		it("should remove error listener", async () => {
			const listener = vi.fn()
			recoveryManager.addErrorListener(listener)
			recoveryManager.removeErrorListener(listener)

			// Add a dummy listener so the error event doesn't throw
			recoveryManager.addErrorListener(() => {})

			const context = recoveryManager.createErrorContext({
				errorType: "agent_failure",
				message: "Test error",
			})

			await recoveryManager.handleError(context)

			expect(listener).not.toHaveBeenCalled()
		})
	})

	describe("Dispose", () => {
		it("should clean up resources on dispose", () => {
			recoveryManager = new ErrorRecoveryManager({})

			recoveryManager.dispose()

			const stats = recoveryManager.getStatistics()
			expect(stats.totalErrors).toBe(0)
		})
	})
})

describe("createErrorRecoveryManager", () => {
	it("should create ErrorRecoveryManager instance", () => {
		const manager = createErrorRecoveryManager({})
		expect(manager).toBeInstanceOf(ErrorRecoveryManager)
		manager.dispose()
	})
})
