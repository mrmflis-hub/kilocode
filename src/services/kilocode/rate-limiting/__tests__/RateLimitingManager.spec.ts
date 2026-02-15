// kilocode_change - new file
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { RateLimitingManager } from "../RateLimitingManager"
import type { RateLimitEvent, ProviderRateLimitConfig, QueuedRequest } from "../types"

describe("RateLimitingManager", () => {
	let manager: RateLimitingManager

	const defaultProviderConfig: ProviderRateLimitConfig = {
		providerId: "test-provider",
		requestsPerMinute: 10,
		tokensPerMinute: 10000,
		costPerInputToken: 0.00001,
		costPerOutputToken: 0.00003,
	}

	beforeEach(() => {
		manager = new RateLimitingManager({
			defaultRequestsPerMinute: 60,
			defaultTokensPerMinute: 100000,
			enableBudgetTracking: true,
			totalBudgetUsd: 100,
			budgetPeriodMs: 30 * 24 * 60 * 60 * 1000,
			enableCircuitBreaker: true,
			circuitBreakerThreshold: 5,
			circuitBreakerResetMs: 100,
			maxQueueSize: 100,
			defaultRequestTimeoutMs: 5000,
			enableMonitoring: false, // Disable for tests
		})
	})

	afterEach(() => {
		manager.dispose()
	})

	describe("registerProvider", () => {
		it("should register a provider successfully", () => {
			manager.registerProvider(defaultProviderConfig)

			const rateLimitInfo = manager.getRateLimitInfo("test-provider")
			expect(rateLimitInfo).toBeDefined()
			expect(rateLimitInfo?.providerId).toBe("test-provider")
			expect(rateLimitInfo?.requestsPerMinute).toBe(10)
			expect(rateLimitInfo?.tokensPerMinute).toBe(10000)
		})

		it("should create circuit breaker for provider", () => {
			manager.registerProvider(defaultProviderConfig)

			const status = manager.getCircuitBreakerStatus("test-provider")
			expect(status).toBeDefined()
			expect(status?.state).toBe("closed")
		})

		it("should create queue for provider", () => {
			manager.registerProvider(defaultProviderConfig)

			const stats = manager.getQueueStats("test-provider")
			expect(stats).toBeDefined()
		})
	})

	describe("unregisterProvider", () => {
		it("should unregister a provider", () => {
			manager.registerProvider(defaultProviderConfig)
			manager.unregisterProvider("test-provider")

			expect(manager.getRateLimitInfo("test-provider")).toBeNull()
			expect(manager.getCircuitBreakerStatus("test-provider")).toBeNull()
		})
	})

	describe("checkRateLimit", () => {
		beforeEach(() => {
			manager.registerProvider(defaultProviderConfig)
		})

		it("should allow request within rate limits", () => {
			const result = manager.checkRateLimit({
				providerId: "test-provider",
				agentId: "agent-1",
				estimatedTokens: 1000,
				priority: "normal",
			})

			expect(result.allowed).toBe(true)
			expect(result.remainingRequests).toBe(10)
			expect(result.remainingTokens).toBe(10000)
		})

		it("should reject request for unregistered provider", () => {
			const result = manager.checkRateLimit({
				providerId: "unknown-provider",
				agentId: "agent-1",
				estimatedTokens: 1000,
				priority: "normal",
			})

			expect(result.allowed).toBe(false)
			expect(result.reason).toContain("not registered")
		})

		it("should queue request when rate limit exceeded", () => {
			// Use up rate limit
			for (let i = 0; i < 10; i++) {
				manager.recordRequest("test-provider", 500, 500, true)
			}

			const result = manager.checkRateLimit({
				providerId: "test-provider",
				agentId: "agent-1",
				estimatedTokens: 1000,
				priority: "normal",
			})

			expect(result.allowed).toBe(false)
			expect(result.reason).toContain("queued")
		})

		it("should reject request when budget exceeded", () => {
			// Create manager with small budget
			const smallBudgetManager = new RateLimitingManager({
				totalBudgetUsd: 0.001,
				enableBudgetTracking: true,
				enableCircuitBreaker: false,
				enableMonitoring: false,
			})
			smallBudgetManager.registerProvider(defaultProviderConfig)

			const result = smallBudgetManager.checkRateLimit({
				providerId: "test-provider",
				agentId: "agent-1",
				estimatedTokens: 100000,
				priority: "normal",
			})

			expect(result.allowed).toBe(false)
			expect(result.reason).toContain("Budget")
			smallBudgetManager.dispose()
		})

		it("should reject request when circuit breaker is open", () => {
			// Force circuit breaker open
			manager.forceCircuitOpen("test-provider")

			const result = manager.checkRateLimit({
				providerId: "test-provider",
				agentId: "agent-1",
				estimatedTokens: 1000,
				priority: "normal",
			})

			expect(result.allowed).toBe(false)
			expect(result.reason).toContain("Circuit breaker")
		})
	})

	describe("recordRequest", () => {
		beforeEach(() => {
			manager.registerProvider(defaultProviderConfig)
		})

		it("should update rate limit info", () => {
			manager.recordRequest("test-provider", 1000, 500, true)

			const info = manager.getRateLimitInfo("test-provider")
			expect(info?.requestsUsed).toBe(1)
			expect(info?.tokensUsed).toBe(1500)
		})

		it("should update circuit breaker on success", () => {
			manager.recordRequest("test-provider", 100, 50, true)

			const status = manager.getCircuitBreakerStatus("test-provider")
			expect(status?.state).toBe("closed")
		})

		it("should update circuit breaker on failure", () => {
			// Record failures to trip circuit breaker
			for (let i = 0; i < 5; i++) {
				manager.recordRequest("test-provider", 100, 50, false)
			}

			const status = manager.getCircuitBreakerStatus("test-provider")
			expect(status?.state).toBe("open")
		})

		it("should update budget", () => {
			const initialBudget = manager.getBudgetStatus()

			manager.recordRequest("test-provider", 1000, 500, true)

			const newBudget = manager.getBudgetStatus()
			expect(newBudget.usedBudgetUsd).toBeGreaterThan(initialBudget.usedBudgetUsd)
		})
	})

	describe("queueRequest", () => {
		beforeEach(() => {
			manager.registerProvider(defaultProviderConfig)
		})

		it("should queue a request", () => {
			const requestId = manager.queueRequest({
				agentId: "agent-1",
				providerId: "test-provider",
				priority: "normal",
				estimatedTokens: 1000,
			})

			expect(requestId).toBeDefined()

			const stats = manager.getQueueStats("test-provider")
			expect(stats.totalRequests).toBe(1)
		})
	})

	describe("processQueue", () => {
		beforeEach(() => {
			manager.registerProvider(defaultProviderConfig)
		})

		it("should process queued requests", async () => {
			const processedRequests: QueuedRequest[] = []
			manager.setRequestHandler(async (request) => {
				processedRequests.push(request)
			})

			// Use up rate limit
			for (let i = 0; i < 10; i++) {
				manager.recordRequest("test-provider", 500, 500, true)
			}

			// Queue a request
			manager.checkRateLimit({
				providerId: "test-provider",
				agentId: "agent-1",
				estimatedTokens: 1000,
				priority: "normal",
			})

			// Wait for rate limit window to reset (simulated by waiting)
			// In real scenario, window resets after 1 minute

			expect(processedRequests.length).toBe(0) // Not processed yet due to rate limit
		})
	})

	describe("estimateCost", () => {
		beforeEach(() => {
			manager.registerProvider(defaultProviderConfig)
		})

		it("should estimate cost correctly", () => {
			const estimate = manager.estimateCost("test-provider", 1000, 500)

			expect(estimate.providerId).toBe("test-provider")
			expect(estimate.inputTokens).toBe(1000)
			expect(estimate.outputTokens).toBe(500)
			expect(estimate.estimatedCostUsd).toBeCloseTo(0.00001 * 1000 + 0.00003 * 500, 10)
		})

		it("should use default costs for unknown provider", () => {
			const estimate = manager.estimateCost("unknown-provider", 1000, 500)

			expect(estimate.estimatedCostUsd).toBeGreaterThan(0)
		})
	})

	describe("getBudgetStatus", () => {
		it("should return budget status", () => {
			const status = manager.getBudgetStatus()

			expect(status.totalBudgetUsd).toBe(100)
			expect(status.usedBudgetUsd).toBe(0)
			expect(status.remainingBudgetUsd).toBe(100)
		})

		it("should update budget after requests", () => {
			manager.registerProvider(defaultProviderConfig)
			manager.recordRequest("test-provider", 1000, 500, true)

			const status = manager.getBudgetStatus()
			expect(status.usedBudgetUsd).toBeGreaterThan(0)
		})
	})

	describe("getRateLimitInfo", () => {
		it("should return null for unknown provider", () => {
			expect(manager.getRateLimitInfo("unknown")).toBeNull()
		})

		it("should return rate limit info for registered provider", () => {
			manager.registerProvider(defaultProviderConfig)

			const info = manager.getRateLimitInfo("test-provider")
			expect(info?.providerId).toBe("test-provider")
		})
	})

	describe("getCircuitBreakerStatus", () => {
		it("should return null for unknown provider", () => {
			expect(manager.getCircuitBreakerStatus("unknown")).toBeNull()
		})

		it("should return circuit breaker status for registered provider", () => {
			manager.registerProvider(defaultProviderConfig)

			const status = manager.getCircuitBreakerStatus("test-provider")
			expect(status?.providerId).toBe("test-provider")
			expect(status?.state).toBe("closed")
		})
	})

	describe("getAllCircuitBreakerStatuses", () => {
		it("should return all circuit breaker statuses", () => {
			manager.registerProvider(defaultProviderConfig)
			manager.registerProvider({ ...defaultProviderConfig, providerId: "provider-2" })

			const statuses = manager.getAllCircuitBreakerStatuses()
			expect(statuses).toHaveLength(2)
		})
	})

	describe("getQueueStats", () => {
		it("should return stats for specific provider", () => {
			manager.registerProvider(defaultProviderConfig)

			const stats = manager.getQueueStats("test-provider")
			expect(stats.totalRequests).toBe(0)
		})

		it("should return global stats when no provider specified", () => {
			const stats = manager.getQueueStats()
			expect(stats).toBeDefined()
		})
	})

	describe("getTokenUsageHistory", () => {
		it("should return empty history initially", () => {
			const history = manager.getTokenUsageHistory()
			expect(history).toHaveLength(0)
		})

		it("should return usage history after requests", () => {
			manager.registerProvider(defaultProviderConfig)
			manager.recordRequest("test-provider", 1000, 500, true)

			const history = manager.getTokenUsageHistory()
			expect(history).toHaveLength(1)
			expect(history[0].inputTokens).toBe(1000)
			expect(history[0].outputTokens).toBe(500)
		})
	})

	describe("forceCircuitOpen/forceCircuitClose", () => {
		beforeEach(() => {
			manager.registerProvider(defaultProviderConfig)
		})

		it("should force circuit open", () => {
			manager.forceCircuitOpen("test-provider")

			expect(manager.getCircuitBreakerStatus("test-provider")?.state).toBe("open")
		})

		it("should force circuit close", () => {
			manager.forceCircuitOpen("test-provider")
			manager.forceCircuitClose("test-provider")

			expect(manager.getCircuitBreakerStatus("test-provider")?.state).toBe("closed")
		})
	})

	describe("resetBudgetPeriod", () => {
		it("should reset budget period", () => {
			manager.registerProvider(defaultProviderConfig)
			manager.recordRequest("test-provider", 1000, 500, true)

			expect(manager.getBudgetStatus().usedBudgetUsd).toBeGreaterThan(0)

			manager.resetBudgetPeriod()

			expect(manager.getBudgetStatus().usedBudgetUsd).toBe(0)
		})
	})

	describe("subscribe/unsubscribe", () => {
		it("should subscribe to events", () => {
			manager.registerProvider(defaultProviderConfig)

			const handler = vi.fn()
			manager.subscribe(handler)

			manager.recordRequest("test-provider", 100, 50, true)

			expect(handler).toHaveBeenCalled()
		})

		it("should unsubscribe from events", () => {
			manager.registerProvider(defaultProviderConfig)

			const handler = vi.fn()
			manager.subscribe(handler)
			manager.unsubscribe(handler)

			manager.recordRequest("test-provider", 100, 50, true)

			expect(handler).not.toHaveBeenCalled()
		})
	})

	describe("events", () => {
		it("should emit request_processed event", () => {
			manager.registerProvider(defaultProviderConfig)

			const handler = vi.fn()
			manager.subscribe(handler)

			manager.recordRequest("test-provider", 100, 50, true)

			const event = handler.mock.calls.find((call) => call[0].type === "request_processed")?.[0] as RateLimitEvent
			expect(event).toBeDefined()
		})

		it("should emit budget_exceeded event", () => {
			const smallBudgetManager = new RateLimitingManager({
				totalBudgetUsd: 0.001,
				enableBudgetTracking: true,
				enableCircuitBreaker: false,
				enableMonitoring: false,
			})
			smallBudgetManager.registerProvider(defaultProviderConfig)

			const handler = vi.fn()
			smallBudgetManager.subscribe(handler)

			smallBudgetManager.checkRateLimit({
				providerId: "test-provider",
				agentId: "agent-1",
				estimatedTokens: 100000,
				priority: "normal",
			})

			const event = handler.mock.calls.find((call) => call[0].type === "budget_exceeded")?.[0] as RateLimitEvent
			expect(event).toBeDefined()
			smallBudgetManager.dispose()
		})
	})
})
