// kilocode_change - new file
import {
	RequestPriority,
	CircuitState,
	RateLimitInfo,
	QueuedRequest,
	RateLimitResult,
	CircuitBreakerStatus,
	RateLimitEventType,
	RateLimitEvent,
	CostEstimate,
	BudgetStatus,
} from "@kilocode/core-schemas/orchestration"

// Re-export types from core-schemas
export {
	RequestPriority,
	CircuitState,
	RateLimitInfo,
	QueuedRequest,
	RateLimitResult,
	CircuitBreakerStatus,
	RateLimitEventType,
	RateLimitEvent,
	CostEstimate,
	BudgetStatus,
}

/**
 * Configuration for the rate limiting manager
 */
export interface RateLimitingManagerConfig {
	/** Default rate limits per provider */
	defaultRequestsPerMinute: number
	defaultTokensPerMinute: number
	/** Enable budget tracking */
	enableBudgetTracking: boolean
	/** Total budget in USD */
	totalBudgetUsd: number
	/** Budget period duration in milliseconds */
	budgetPeriodMs: number
	/** Enable circuit breaker */
	enableCircuitBreaker: boolean
	/** Circuit breaker failure threshold */
	circuitBreakerThreshold: number
	/** Circuit breaker reset timeout in milliseconds */
	circuitBreakerResetMs: number
	/** Request queue max size */
	maxQueueSize: number
	/** Default request timeout in milliseconds */
	defaultRequestTimeoutMs: number
	/** Enable monitoring */
	enableMonitoring: boolean
	/** Monitoring interval in milliseconds */
	monitoringIntervalMs: number
}

/**
 * Provider-specific rate limit configuration
 */
export interface ProviderRateLimitConfig {
	providerId: string
	requestsPerMinute: number
	tokensPerMinute: number
	costPerInputToken?: number
	costPerOutputToken?: number
	modelId?: string
}

/**
 * Request to be queued for rate limiting
 */
export interface QueueRequest {
	agentId: string
	providerId: string
	priority: RequestPriority
	estimatedTokens: number
	timeoutMs?: number
	metadata?: Record<string, unknown>
}

/**
 * Handler for processing a queued request
 */
export type RequestHandler = (request: QueuedRequest) => Promise<unknown>

/**
 * Event handler for rate limiting events
 */
export type RateLimitEventHandler = (event: RateLimitEvent) => void

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
	/** Number of failures before opening circuit */
	failureThreshold: number
	/** Number of successes in half-open state to close circuit */
	successThreshold: number
	/** Time to wait before attempting to close circuit (half-open state) */
	resetTimeoutMs: number
	/** Time window for counting failures */
	failureWindowMs: number
}

/**
 * Request queue configuration
 */
export interface RequestQueueConfig {
	/** Maximum number of requests in the queue */
	maxSize: number
	/** Default timeout for requests */
	defaultTimeoutMs: number
	/** Enable priority ordering */
	enablePriority: boolean
}

/**
 * Token usage tracking
 */
export interface TokenUsage {
	providerId: string
	inputTokens: number
	outputTokens: number
	timestamp: number
}

/**
 * Rate limit check options
 */
export interface CheckRateLimitOptions {
	providerId: string
	agentId: string
	estimatedTokens: number
	priority: RequestPriority
	bypassQueue?: boolean
}
