// kilocode_change - new file
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { CircuitBreaker } from "../CircuitBreaker"
import type { RateLimitEvent, CircuitBreakerStatus } from "../types"

describe("CircuitBreaker", () => {
	let circuitBreaker: CircuitBreaker

	beforeEach(() => {
		circuitBreaker = new CircuitBreaker("provider-1", {
			failureThreshold: 3,
			successThreshold: 2,
			resetTimeoutMs: 100,
			failureWindowMs: 1000,
		})
	})

	afterEach(() => {
		circuitBreaker.dispose()
	})

	describe("initial state", () => {
		it("should start in closed state", () => {
			expect(circuitBreaker.getState()).toBe("closed")
			expect(circuitBreaker.isAllowed()).toBe(true)
		})

		it("should have correct initial status", () => {
			const status = circuitBreaker.getStatus()

			expect(status.providerId).toBe("provider-1")
			expect(status.state).toBe("closed")
			expect(status.failureCount).toBe(0)
			expect(status.successCount).toBe(0)
			expect(status.lastFailureTime).toBeUndefined()
		})
	})

	describe("closed state", () => {
		it("should allow requests in closed state", () => {
			expect(circuitBreaker.isAllowed()).toBe(true)
		})

		it("should reset failure count on success", () => {
			circuitBreaker.recordFailure()
			circuitBreaker.recordFailure()
			expect(circuitBreaker.getStatus().failureCount).toBe(2)

			circuitBreaker.recordSuccess()
			expect(circuitBreaker.getStatus().failureCount).toBe(0)
		})

		it("should transition to open after threshold failures", () => {
			circuitBreaker.recordFailure()
			circuitBreaker.recordFailure()
			expect(circuitBreaker.getState()).toBe("closed")

			circuitBreaker.recordFailure()
			expect(circuitBreaker.getState()).toBe("open")
		})

		it("should emit circuit_opened event when transitioning to open", () => {
			const handler = vi.fn()
			circuitBreaker.subscribe(handler)

			circuitBreaker.recordFailure()
			circuitBreaker.recordFailure()
			circuitBreaker.recordFailure()

			expect(handler).toHaveBeenCalled()
			const event = handler.mock.calls.find((call) => call[0].type === "circuit_opened")?.[0] as RateLimitEvent
			expect(event).toBeDefined()
			expect(event.providerId).toBe("provider-1")
		})
	})

	describe("open state", () => {
		beforeEach(() => {
			// Force to open state
			circuitBreaker.recordFailure()
			circuitBreaker.recordFailure()
			circuitBreaker.recordFailure()
		})

		it("should block requests in open state", () => {
			expect(circuitBreaker.getState()).toBe("open")
			expect(circuitBreaker.isAllowed()).toBe(false)
		})

		it("should transition to half-open after reset timeout", async () => {
			expect(circuitBreaker.getState()).toBe("open")

			// Wait for reset timeout
			await new Promise((resolve) => setTimeout(resolve, 150))

			expect(circuitBreaker.isAllowed()).toBe(true)
			expect(circuitBreaker.getState()).toBe("half-open")
		})

		it("should return time until retry", () => {
			const timeUntilRetry = circuitBreaker.getTimeUntilRetry()
			expect(timeUntilRetry).toBeGreaterThan(0)
			expect(timeUntilRetry).toBeLessThanOrEqual(100)
		})

		it("should return null for time until retry in closed state", () => {
			const closedBreaker = new CircuitBreaker("provider-2")
			expect(closedBreaker.getTimeUntilRetry()).toBeNull()
			closedBreaker.dispose()
		})

		it("should emit circuit_half_open event when transitioning", async () => {
			const handler = vi.fn()
			circuitBreaker.subscribe(handler)

			// Wait for reset timeout
			await new Promise((resolve) => setTimeout(resolve, 150))

			// Trigger the transition by calling isAllowed
			circuitBreaker.isAllowed()

			const event = handler.mock.calls.find((call) => call[0].type === "circuit_half_open")?.[0] as RateLimitEvent
			expect(event).toBeDefined()
		})
	})

	describe("half-open state", () => {
		beforeEach(async () => {
			// Force to open state
			circuitBreaker.recordFailure()
			circuitBreaker.recordFailure()
			circuitBreaker.recordFailure()

			// Wait for reset timeout to transition to half-open
			await new Promise((resolve) => setTimeout(resolve, 150))
			circuitBreaker.isAllowed()
		})

		it("should allow requests in half-open state", () => {
			expect(circuitBreaker.getState()).toBe("half-open")
			expect(circuitBreaker.isAllowed()).toBe(true)
		})

		it("should transition to closed after success threshold", () => {
			circuitBreaker.recordSuccess()
			expect(circuitBreaker.getState()).toBe("half-open")

			circuitBreaker.recordSuccess()
			expect(circuitBreaker.getState()).toBe("closed")
		})

		it("should transition to open on any failure", () => {
			circuitBreaker.recordFailure()
			expect(circuitBreaker.getState()).toBe("open")
		})

		it("should emit circuit_closed event when transitioning to closed", () => {
			const handler = vi.fn()
			circuitBreaker.subscribe(handler)

			circuitBreaker.recordSuccess()
			circuitBreaker.recordSuccess()

			const event = handler.mock.calls.find((call) => call[0].type === "circuit_closed")?.[0] as RateLimitEvent
			expect(event).toBeDefined()
		})
	})

	describe("failure window", () => {
		it("should only count failures within the window", async () => {
			const shortWindowBreaker = new CircuitBreaker("provider-2", {
				failureThreshold: 3,
				successThreshold: 2,
				resetTimeoutMs: 100,
				failureWindowMs: 50, // 50ms window
			})

			// Record 2 failures
			shortWindowBreaker.recordFailure()
			shortWindowBreaker.recordFailure()

			// Wait for window to expire
			await new Promise((resolve) => setTimeout(resolve, 100))

			// Record another failure - should not trip because old failures expired
			shortWindowBreaker.recordFailure()
			expect(shortWindowBreaker.getState()).toBe("closed")

			// Record 2 more quickly - should trip now
			shortWindowBreaker.recordFailure()
			shortWindowBreaker.recordFailure()
			expect(shortWindowBreaker.getState()).toBe("open")

			shortWindowBreaker.dispose()
		})
	})

	describe("force operations", () => {
		it("should force open the circuit", () => {
			circuitBreaker.forceOpen()
			expect(circuitBreaker.getState()).toBe("open")
			expect(circuitBreaker.isAllowed()).toBe(false)
		})

		it("should force close the circuit", () => {
			circuitBreaker.recordFailure()
			circuitBreaker.recordFailure()
			circuitBreaker.recordFailure()
			expect(circuitBreaker.getState()).toBe("open")

			circuitBreaker.forceClose()
			expect(circuitBreaker.getState()).toBe("closed")
			expect(circuitBreaker.isAllowed()).toBe(true)
		})

		it("should reset the circuit", () => {
			circuitBreaker.recordFailure()
			circuitBreaker.recordFailure()
			circuitBreaker.recordFailure()

			circuitBreaker.reset()

			expect(circuitBreaker.getState()).toBe("closed")
			expect(circuitBreaker.getStatus().failureCount).toBe(0)
		})
	})

	describe("getStatus", () => {
		it("should return complete status", () => {
			circuitBreaker.recordFailure()

			const status = circuitBreaker.getStatus()

			expect(status.providerId).toBe("provider-1")
			expect(status.state).toBe("closed")
			expect(status.failureCount).toBe(1)
			expect(status.successCount).toBe(0)
			expect(status.lastFailureTime).toBeDefined()
			expect(status.lastStateChange).toBeDefined()
		})

		it("should include nextRetryTime in open state", () => {
			circuitBreaker.recordFailure()
			circuitBreaker.recordFailure()
			circuitBreaker.recordFailure()

			const status = circuitBreaker.getStatus()

			expect(status.state).toBe("open")
			expect(status.nextRetryTime).toBeDefined()
		})
	})

	describe("subscribe/unsubscribe", () => {
		it("should subscribe to events", () => {
			const handler = vi.fn()
			circuitBreaker.subscribe(handler)

			circuitBreaker.recordFailure()
			circuitBreaker.recordFailure()
			circuitBreaker.recordFailure()

			expect(handler).toHaveBeenCalled()
		})

		it("should unsubscribe from events", () => {
			const handler = vi.fn()
			circuitBreaker.subscribe(handler)
			circuitBreaker.unsubscribe(handler)

			circuitBreaker.recordFailure()
			circuitBreaker.recordFailure()
			circuitBreaker.recordFailure()

			expect(handler).not.toHaveBeenCalled()
		})
	})
})
