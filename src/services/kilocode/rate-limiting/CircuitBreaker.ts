// kilocode_change - new file
import { EventEmitter } from "events"
import {
	CircuitState,
	CircuitBreakerStatus,
	RateLimitEvent,
	RateLimitEventType,
} from "@kilocode/core-schemas/orchestration"
import { CircuitBreakerConfig, RateLimitEventHandler } from "./types"

/**
 * Default configuration for the circuit breaker
 */
const DEFAULT_CONFIG: Required<CircuitBreakerConfig> = {
	failureThreshold: 5,
	successThreshold: 3,
	resetTimeoutMs: 30000, // 30 seconds
	failureWindowMs: 60000, // 1 minute
}

/**
 * CircuitBreaker
 *
 * Implements the circuit breaker pattern to prevent cascading failures
 * when a provider is experiencing issues.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Requests are blocked, waiting for reset timeout
 * - HALF_OPEN: Testing if provider has recovered
 */
export class CircuitBreaker extends EventEmitter {
	private providerId: string
	private config: Required<CircuitBreakerConfig>
	private state: CircuitState = "closed"
	private failureCount = 0
	private successCount = 0
	private lastFailureTime: number | null = null
	private lastStateChange: number
	private nextRetryTime: number | null = null
	private failures: number[] = [] // Timestamps of recent failures

	constructor(providerId: string, config: CircuitBreakerConfig = {}) {
		super()
		this.providerId = providerId
		this.config = { ...DEFAULT_CONFIG, ...config }
		this.lastStateChange = Date.now()
	}

	/**
	 * Check if requests are allowed
	 */
	isAllowed(): boolean {
		switch (this.state) {
			case "closed":
				return true
			case "open":
				// Check if we should transition to half-open
				if (this.nextRetryTime && Date.now() >= this.nextRetryTime) {
					this.transitionTo("half-open")
					return true
				}
				return false
			case "half-open":
				return true
		}
	}

	/**
	 * Record a successful request
	 */
	recordSuccess(): void {
		switch (this.state) {
			case "closed":
				// Reset failure count on success
				this.failureCount = 0
				this.failures = []
				break
			case "half-open":
				this.successCount++
				if (this.successCount >= this.config.successThreshold) {
					this.transitionTo("closed")
				}
				break
			case "open":
				// Shouldn't happen, but handle gracefully
				break
		}
	}

	/**
	 * Record a failed request
	 */
	recordFailure(): void {
		const now = Date.now()

		switch (this.state) {
			case "closed":
				// Add failure to window
				this.failures.push(now)
				this.pruneFailures()

				this.failureCount = this.failures.length
				this.lastFailureTime = now

				if (this.failureCount >= this.config.failureThreshold) {
					this.transitionTo("open")
				}
				break
			case "half-open":
				// Any failure in half-open goes back to open
				this.transitionTo("open")
				break
			case "open":
				// Already open, update last failure time
				this.lastFailureTime = now
				break
		}
	}

	/**
	 * Get the current state
	 */
	getState(): CircuitState {
		return this.state
	}

	/**
	 * Get the current status
	 */
	getStatus(): CircuitBreakerStatus {
		return {
			providerId: this.providerId,
			state: this.state,
			failureCount: this.failureCount,
			successCount: this.successCount,
			lastFailureTime: this.lastFailureTime ?? undefined,
			lastStateChange: this.lastStateChange,
			nextRetryTime: this.nextRetryTime ?? undefined,
		}
	}

	/**
	 * Force the circuit to open
	 */
	forceOpen(): void {
		this.transitionTo("open")
	}

	/**
	 * Force the circuit to close
	 */
	forceClose(): void {
		this.transitionTo("closed")
	}

	/**
	 * Reset the circuit breaker
	 */
	reset(): void {
		this.transitionTo("closed")
	}

	/**
	 * Get time until next retry attempt (for open state)
	 */
	getTimeUntilRetry(): number | null {
		if (this.state !== "open" || !this.nextRetryTime) {
			return null
		}

		const remaining = this.nextRetryTime - Date.now()
		return remaining > 0 ? remaining : 0
	}

	/**
	 * Subscribe to circuit breaker events
	 */
	subscribe(handler: RateLimitEventHandler): void {
		this.on("rateLimitEvent", handler)
	}

	/**
	 * Unsubscribe from circuit breaker events
	 */
	unsubscribe(handler: RateLimitEventHandler): void {
		this.off("rateLimitEvent", handler)
	}

	/**
	 * Dispose of the circuit breaker
	 */
	dispose(): void {
		this.removeAllListeners()
	}

	// Private methods

	/**
	 * Transition to a new state
	 */
	private transitionTo(newState: CircuitState): void {
		const oldState = this.state
		this.state = newState
		this.lastStateChange = Date.now()

		// Reset counters based on new state
		switch (newState) {
			case "closed":
				this.failureCount = 0
				this.successCount = 0
				this.failures = []
				this.nextRetryTime = null
				this.lastFailureTime = null
				break
			case "open":
				this.successCount = 0
				this.nextRetryTime = Date.now() + this.config.resetTimeoutMs
				break
			case "half-open":
				this.successCount = 0
				this.nextRetryTime = null
				break
		}

		// Emit event
		const eventType: RateLimitEventType =
			newState === "open" ? "circuit_opened" : newState === "closed" ? "circuit_closed" : "circuit_half_open"

		this.emitEvent(eventType, {
			oldState,
			newState,
			failureCount: this.failureCount,
		})
	}

	/**
	 * Remove failures outside the window
	 */
	private pruneFailures(): void {
		const cutoff = Date.now() - this.config.failureWindowMs
		this.failures = this.failures.filter((t) => t >= cutoff)
	}

	/**
	 * Emit a rate limit event
	 */
	private emitEvent(type: RateLimitEventType, data?: Record<string, unknown>): void {
		const event: RateLimitEvent = {
			type,
			providerId: this.providerId,
			timestamp: Date.now(),
			data,
		}

		this.emit("rateLimitEvent", event)
	}
}
