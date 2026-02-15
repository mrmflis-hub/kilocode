// kilocode_change - new file
import { EventEmitter } from "events"
import {
	RequestPriority,
	CircuitState,
	RateLimitInfo,
	QueuedRequest,
	RateLimitResult,
	CircuitBreakerStatus,
	RateLimitEvent,
	RateLimitEventType,
	CostEstimate,
	BudgetStatus,
} from "@kilocode/core-schemas"
import {
	RateLimitingManagerConfig,
	ProviderRateLimitConfig,
	QueueRequest,
	RequestHandler,
	RateLimitEventHandler,
	TokenUsage,
	CheckRateLimitOptions,
} from "./types"
import { RequestQueue } from "./RequestQueue"
import { CircuitBreaker } from "./CircuitBreaker"

/**
 * Default configuration for the rate limiting manager
 */
const DEFAULT_CONFIG: Required<RateLimitingManagerConfig> = {
	defaultRequestsPerMinute: 60,
	defaultTokensPerMinute: 100000,
	enableBudgetTracking: true,
	totalBudgetUsd: 100,
	budgetPeriodMs: 30 * 24 * 60 * 60 * 1000, // 30 days
	enableCircuitBreaker: true,
	circuitBreakerThreshold: 5,
	circuitBreakerResetMs: 30000,
	maxQueueSize: 1000,
	defaultRequestTimeoutMs: 60000,
	enableMonitoring: true,
	monitoringIntervalMs: 5000,
}

/**
 * RateLimitingManager
 *
 * Centralized rate limiting system for multi-agent orchestration.
 * Provides:
 * - Request queuing with priority
 * - Provider-specific rate limit tracking
 * - Circuit breaker pattern
 * - Exponential backoff
 * - Cost estimation
 * - Budget limit enforcement
 */
export class RateLimitingManager extends EventEmitter {
	private config: Required<RateLimitingManagerConfig>
	private providerConfigs: Map<string, ProviderRateLimitConfig> = new Map()
	private rateLimitInfos: Map<string, RateLimitInfo> = new Map()
	private circuitBreakers: Map<string, CircuitBreaker> = new Map()
	private requestQueues: Map<string, RequestQueue> = new Map()
	private globalQueue: RequestQueue
	private tokenUsageHistory: TokenUsage[] = []
	private budgetUsed = 0
	private budgetPeriodStart: number
	private monitoringInterval: ReturnType<typeof setInterval> | null = null
	private requestHandler: RequestHandler | null = null

	constructor(config: Partial<RateLimitingManagerConfig> = {}) {
		super()
		this.config = { ...DEFAULT_CONFIG, ...config }
		this.budgetPeriodStart = Date.now()
		this.globalQueue = new RequestQueue({
			maxSize: this.config.maxQueueSize,
			defaultTimeoutMs: this.config.defaultRequestTimeoutMs,
			enablePriority: true,
		})

		// Forward events from global queue
		this.globalQueue.subscribe((event) =>
			this.emitEvent(event.type, event.providerId, event.agentId, event.requestId, event.data),
		)

		if (this.config.enableMonitoring) {
			this.startMonitoring()
		}
	}

	/**
	 * Register a provider with its rate limit configuration
	 */
	registerProvider(config: ProviderRateLimitConfig): void {
		this.providerConfigs.set(config.providerId, config)

		// Initialize rate limit info
		this.rateLimitInfos.set(config.providerId, {
			providerId: config.providerId,
			requestsPerMinute: config.requestsPerMinute,
			tokensPerMinute: config.tokensPerMinute,
			requestsUsed: 0,
			tokensUsed: 0,
			windowStartMs: Date.now(),
			windowDurationMs: 60000, // 1 minute window
		})

		// Initialize circuit breaker if enabled
		if (this.config.enableCircuitBreaker) {
			const circuitBreaker = new CircuitBreaker(config.providerId, {
				failureThreshold: this.config.circuitBreakerThreshold,
				successThreshold: 3,
				resetTimeoutMs: this.config.circuitBreakerResetMs,
				failureWindowMs: 60000,
			})
			this.circuitBreakers.set(config.providerId, circuitBreaker)

			// Forward events from circuit breaker
			circuitBreaker.subscribe((event) =>
				this.emitEvent(event.type, event.providerId, undefined, undefined, event.data),
			)
		}

		// Initialize provider-specific queue
		const queue = new RequestQueue({
			maxSize: this.config.maxQueueSize,
			defaultTimeoutMs: this.config.defaultRequestTimeoutMs,
			enablePriority: true,
		})
		this.requestQueues.set(config.providerId, queue)

		// Forward events from provider queue
		queue.subscribe((event) =>
			this.emitEvent(event.type, event.providerId, event.agentId, event.requestId, event.data),
		)
	}

	/**
	 * Unregister a provider
	 */
	unregisterProvider(providerId: string): void {
		this.providerConfigs.delete(providerId)
		this.rateLimitInfos.delete(providerId)

		const circuitBreaker = this.circuitBreakers.get(providerId)
		if (circuitBreaker) {
			circuitBreaker.dispose()
			this.circuitBreakers.delete(providerId)
		}

		const queue = this.requestQueues.get(providerId)
		if (queue) {
			queue.dispose()
			this.requestQueues.delete(providerId)
		}
	}

	/**
	 * Set the request handler for processing queued requests
	 */
	setRequestHandler(handler: RequestHandler): void {
		this.requestHandler = handler
	}

	/**
	 * Check if a request is allowed under rate limits
	 */
	checkRateLimit(options: CheckRateLimitOptions): RateLimitResult {
		const { providerId, agentId, estimatedTokens, priority, bypassQueue } = options

		// Check if provider is registered
		const providerConfig = this.providerConfigs.get(providerId)
		if (!providerConfig) {
			return {
				allowed: false,
				reason: `Provider ${providerId} is not registered`,
			}
		}

		// Check circuit breaker
		const circuitBreaker = this.circuitBreakers.get(providerId)
		if (circuitBreaker && !circuitBreaker.isAllowed()) {
			const timeUntilRetry = circuitBreaker.getTimeUntilRetry()
			return {
				allowed: false,
				waitTimeMs: timeUntilRetry ?? undefined,
				reason: `Circuit breaker is open for provider ${providerId}`,
			}
		}

		// Check budget
		if (this.config.enableBudgetTracking) {
			const estimatedCost = this.estimateCost(providerId, estimatedTokens, 0)
			if (this.budgetUsed + estimatedCost.estimatedCostUsd > this.config.totalBudgetUsd) {
				this.emitEvent("budget_exceeded", providerId, agentId, undefined, {
					budgetUsed: this.budgetUsed,
					budgetTotal: this.config.totalBudgetUsd,
					estimatedCost: estimatedCost.estimatedCostUsd,
				})
				return {
					allowed: false,
					reason: "Budget limit exceeded",
				}
			}
		}

		// Get or create rate limit info
		let rateLimitInfo = this.rateLimitInfos.get(providerId)
		if (!rateLimitInfo) {
			rateLimitInfo = {
				providerId,
				requestsPerMinute: this.config.defaultRequestsPerMinute,
				tokensPerMinute: this.config.defaultTokensPerMinute,
				requestsUsed: 0,
				tokensUsed: 0,
				windowStartMs: Date.now(),
				windowDurationMs: 60000,
			}
			this.rateLimitInfos.set(providerId, rateLimitInfo)
		}

		// Reset window if expired
		this.resetWindowIfNeeded(rateLimitInfo)

		// Check rate limits
		const remainingRequests = rateLimitInfo.requestsPerMinute - rateLimitInfo.requestsUsed
		const remainingTokens = rateLimitInfo.tokensPerMinute - rateLimitInfo.tokensUsed

		if (remainingRequests <= 0 || remainingTokens < estimatedTokens) {
			// Calculate wait time
			const windowEnd = rateLimitInfo.windowStartMs + rateLimitInfo.windowDurationMs
			const waitTimeMs = Math.max(0, windowEnd - Date.now())

			if (bypassQueue) {
				return {
					allowed: false,
					waitTimeMs,
					reason: "Rate limit exceeded",
					remainingRequests,
					remainingTokens,
				}
			}

			// Queue the request
			const requestId = this.queueRequest({
				agentId,
				providerId,
				priority,
				estimatedTokens,
			})

			return {
				allowed: false,
				waitTimeMs,
				reason: "Request queued due to rate limit",
				remainingRequests,
				remainingTokens,
			}
		}

		return {
			allowed: true,
			remainingRequests,
			remainingTokens,
		}
	}

	/**
	 * Record a request that was made
	 */
	recordRequest(providerId: string, inputTokens: number, outputTokens: number, success: boolean): void {
		// Update rate limit info
		const rateLimitInfo = this.rateLimitInfos.get(providerId)
		if (rateLimitInfo) {
			this.resetWindowIfNeeded(rateLimitInfo)
			rateLimitInfo.requestsUsed++
			rateLimitInfo.tokensUsed += inputTokens + outputTokens
		}

		// Update circuit breaker
		const circuitBreaker = this.circuitBreakers.get(providerId)
		if (circuitBreaker) {
			if (success) {
				circuitBreaker.recordSuccess()
			} else {
				circuitBreaker.recordFailure()
			}
		}

		// Update budget
		if (this.config.enableBudgetTracking) {
			const cost = this.estimateCost(providerId, inputTokens, outputTokens)
			this.budgetUsed += cost.estimatedCostUsd
		}

		// Record token usage
		this.tokenUsageHistory.push({
			providerId,
			inputTokens,
			outputTokens,
			timestamp: Date.now(),
		})

		// Prune old history (keep last hour)
		const oneHourAgo = Date.now() - 60 * 60 * 1000
		this.tokenUsageHistory = this.tokenUsageHistory.filter((u) => u.timestamp >= oneHourAgo)

		// Emit event
		this.emitEvent("request_processed", providerId, undefined, undefined, {
			inputTokens,
			outputTokens,
			success,
		})
	}

	/**
	 * Queue a request for later processing
	 */
	queueRequest(request: QueueRequest): string | null {
		const queue = this.requestQueues.get(request.providerId) ?? this.globalQueue
		return queue.enqueue(request)
	}

	/**
	 * Process queued requests for a provider
	 */
	async processQueue(providerId: string): Promise<void> {
		if (!this.requestHandler) {
			return
		}

		const queue = this.requestQueues.get(providerId) ?? this.globalQueue

		while (!queue.isEmpty) {
			const request = queue.peek()
			if (!request) break

			// Check if request can be processed
			const result = this.checkRateLimit({
				providerId: request.providerId,
				agentId: request.agentId,
				estimatedTokens: request.estimatedTokens,
				priority: request.priority,
				bypassQueue: true,
			})

			if (!result.allowed) {
				// Can't process more requests right now
				break
			}

			// Dequeue and process
			queue.dequeue()
			try {
				await this.requestHandler(request)
			} catch (error) {
				// Handler error - record as failure
				this.recordRequest(request.providerId, request.estimatedTokens, 0, false)
			}
		}
	}

	/**
	 * Estimate cost for a request
	 */
	estimateCost(providerId: string, inputTokens: number, outputTokens: number): CostEstimate {
		const providerConfig = this.providerConfigs.get(providerId)

		const inputCost = (providerConfig?.costPerInputToken ?? 0.00001) * inputTokens
		const outputCost = (providerConfig?.costPerOutputToken ?? 0.00003) * outputTokens

		return {
			providerId,
			inputTokens,
			outputTokens,
			estimatedCostUsd: inputCost + outputCost,
			modelId: providerConfig?.modelId,
		}
	}

	/**
	 * Get budget status
	 */
	getBudgetStatus(): BudgetStatus {
		const now = Date.now()
		const periodEnd = this.budgetPeriodStart + this.config.budgetPeriodMs

		// Calculate projected cost based on usage rate
		const periodElapsed = now - this.budgetPeriodStart
		const usageRate = this.budgetUsed / (periodElapsed / this.config.budgetPeriodMs)
		const projectedCost = usageRate * this.config.budgetPeriodMs

		return {
			totalBudgetUsd: this.config.totalBudgetUsd,
			usedBudgetUsd: this.budgetUsed,
			remainingBudgetUsd: this.config.totalBudgetUsd - this.budgetUsed,
			periodStartMs: this.budgetPeriodStart,
			periodDurationMs: this.config.budgetPeriodMs,
			projectedCostUsd: projectedCost,
		}
	}

	/**
	 * Get rate limit info for a provider
	 */
	getRateLimitInfo(providerId: string): RateLimitInfo | null {
		const info = this.rateLimitInfos.get(providerId)
		if (!info) return null

		// Reset window if needed and return updated info
		this.resetWindowIfNeeded(info)
		return { ...info }
	}

	/**
	 * Get circuit breaker status for a provider
	 */
	getCircuitBreakerStatus(providerId: string): CircuitBreakerStatus | null {
		const circuitBreaker = this.circuitBreakers.get(providerId)
		return circuitBreaker?.getStatus() ?? null
	}

	/**
	 * Get all circuit breaker statuses
	 */
	getAllCircuitBreakerStatuses(): CircuitBreakerStatus[] {
		return Array.from(this.circuitBreakers.values()).map((cb) => cb.getStatus())
	}

	/**
	 * Get queue statistics for a provider
	 */
	getQueueStats(providerId?: string): {
		totalRequests: number
		byPriority: Record<RequestPriority, number>
		byProvider: Record<string, number>
		oldestRequestAge: number
	} {
		if (providerId) {
			const queue = this.requestQueues.get(providerId)
			return (
				queue?.getStats() ?? {
					totalRequests: 0,
					byPriority: { critical: 0, high: 0, normal: 0, low: 0 },
					byProvider: { [providerId]: 0 },
					oldestRequestAge: 0,
				}
			)
		}
		return this.globalQueue.getStats()
	}

	/**
	 * Get token usage history
	 */
	getTokenUsageHistory(durationMs: number = 60 * 60 * 1000): TokenUsage[] {
		const cutoff = Date.now() - durationMs
		return this.tokenUsageHistory.filter((u) => u.timestamp >= cutoff)
	}

	/**
	 * Subscribe to rate limiting events
	 */
	subscribe(handler: RateLimitEventHandler): void {
		this.on("rateLimitEvent", handler)
	}

	/**
	 * Unsubscribe from rate limiting events
	 */
	unsubscribe(handler: RateLimitEventHandler): void {
		this.off("rateLimitEvent", handler)
	}

	/**
	 * Reset budget period
	 */
	resetBudgetPeriod(): void {
		this.budgetPeriodStart = Date.now()
		this.budgetUsed = 0
	}

	/**
	 * Force circuit breaker open for a provider
	 */
	forceCircuitOpen(providerId: string): void {
		const circuitBreaker = this.circuitBreakers.get(providerId)
		if (circuitBreaker) {
			circuitBreaker.forceOpen()
		}
	}

	/**
	 * Force circuit breaker closed for a provider
	 */
	forceCircuitClose(providerId: string): void {
		const circuitBreaker = this.circuitBreakers.get(providerId)
		if (circuitBreaker) {
			circuitBreaker.forceClose()
		}
	}

	/**
	 * Dispose of the rate limiting manager
	 */
	dispose(): void {
		if (this.monitoringInterval) {
			clearInterval(this.monitoringInterval)
			this.monitoringInterval = null
		}

		// Dispose all circuit breakers
		for (const circuitBreaker of this.circuitBreakers.values()) {
			circuitBreaker.dispose()
		}

		// Dispose all queues
		for (const queue of this.requestQueues.values()) {
			queue.dispose()
		}

		this.globalQueue.dispose()
		this.removeAllListeners()
	}

	// Private methods

	/**
	 * Reset rate limit window if expired
	 */
	private resetWindowIfNeeded(info: RateLimitInfo): void {
		const now = Date.now()
		if (now >= info.windowStartMs + info.windowDurationMs) {
			info.windowStartMs = now
			info.requestsUsed = 0
			info.tokensUsed = 0
		}
	}

	/**
	 * Start monitoring interval
	 */
	private startMonitoring(): void {
		this.monitoringInterval = setInterval(() => {
			this.monitorRateLimits()
		}, this.config.monitoringIntervalMs)
	}

	/**
	 * Monitor rate limits and emit events
	 */
	private monitorRateLimits(): void {
		for (const [providerId, info] of this.rateLimitInfos) {
			this.resetWindowIfNeeded(info)

			const remainingRequests = info.requestsPerMinute - info.requestsUsed
			const remainingTokens = info.tokensPerMinute - info.tokensUsed

			// Emit event if rate limit is close to being hit
			if (remainingRequests <= 5 || remainingTokens <= 10000) {
				this.emitEvent("rate_limit_hit", providerId, undefined, undefined, {
					remainingRequests,
					remainingTokens,
					requestsPerMinute: info.requestsPerMinute,
					tokensPerMinute: info.tokensPerMinute,
				})
			}
		}
	}

	/**
	 * Emit a rate limit event
	 */
	private emitEvent(
		type: RateLimitEventType,
		providerId: string | undefined,
		agentId: string | undefined,
		requestId: string | undefined,
		data?: Record<string, unknown>,
	): void {
		const event: RateLimitEvent = {
			type,
			providerId,
			agentId,
			requestId,
			timestamp: Date.now(),
			data,
		}

		this.emit("rateLimitEvent", event)
	}
}
