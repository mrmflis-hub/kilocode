// kilocode_change - new file
import { EventEmitter } from "events"
import { QueuedRequest, RequestPriority, RateLimitEvent, RateLimitEventType } from "@kilocode/core-schemas"
import { RequestQueueConfig, RateLimitEventHandler } from "./types"

/**
 * Default configuration for the request queue
 */
const DEFAULT_CONFIG: Required<RequestQueueConfig> = {
	maxSize: 1000,
	defaultTimeoutMs: 60000, // 1 minute
	enablePriority: true,
}

/**
 * Priority values for ordering (lower = higher priority)
 */
const PRIORITY_VALUES: Record<RequestPriority, number> = {
	critical: 0,
	high: 1,
	normal: 2,
	low: 3,
}

/**
 * RequestQueue
 *
 * Manages a priority queue of requests waiting to be processed.
 * Supports:
 * - Priority-based ordering
 * - Request expiration
 * - Queue size limits
 * - Event notifications
 */
export class RequestQueue extends EventEmitter {
	private queue: QueuedRequest[] = []
	private config: Required<RequestQueueConfig>
	private requestIdCounter = 0
	private processingInterval: ReturnType<typeof setInterval> | null = null

	constructor(config: RequestQueueConfig = {}) {
		super()
		this.config = { ...DEFAULT_CONFIG, ...config }
	}

	/**
	 * Enqueue a request
	 * @returns The request ID if successful, null if queue is full
	 */
	enqueue(options: {
		agentId: string
		providerId: string
		priority: RequestPriority
		estimatedTokens: number
		timeoutMs?: number
		metadata?: Record<string, unknown>
	}): string | null {
		// Check if queue is full
		if (this.queue.length >= this.config.maxSize) {
			this.emitEvent("request_rejected", options.providerId, options.agentId, undefined, {
				reason: "Queue is full",
			})
			return null
		}

		const requestId = this.generateRequestId()
		const timeoutMs = options.timeoutMs ?? this.config.defaultTimeoutMs

		const request: QueuedRequest = {
			requestId,
			agentId: options.agentId,
			providerId: options.providerId,
			priority: options.priority,
			estimatedTokens: options.estimatedTokens,
			queuedAt: Date.now(),
			expiresAt: Date.now() + timeoutMs,
			metadata: options.metadata,
		}

		// Insert in priority order
		if (this.config.enablePriority) {
			this.insertByPriority(request)
		} else {
			this.queue.push(request)
		}

		this.emitEvent("request_queued", options.providerId, options.agentId, requestId, {
			priority: options.priority,
			estimatedTokens: options.estimatedTokens,
			queuePosition: this.getQueuePosition(requestId),
		})

		return requestId
	}

	/**
	 * Dequeue the next request
	 */
	dequeue(): QueuedRequest | null {
		// Remove expired requests first
		this.removeExpiredRequests()

		if (this.queue.length === 0) {
			return null
		}

		return this.queue.shift() ?? null
	}

	/**
	 * Peek at the next request without removing it
	 */
	peek(): QueuedRequest | null {
		this.removeExpiredRequests()
		return this.queue[0] ?? null
	}

	/**
	 * Remove a specific request from the queue
	 */
	remove(requestId: string): boolean {
		const index = this.queue.findIndex((r) => r.requestId === requestId)
		if (index === -1) {
			return false
		}

		const removed = this.queue.splice(index, 1)[0]
		this.emitEvent("request_rejected", removed.providerId, removed.agentId, requestId, {
			reason: "Removed from queue",
		})

		return true
	}

	/**
	 * Get a request by ID
	 */
	getRequest(requestId: string): QueuedRequest | null {
		return this.queue.find((r) => r.requestId === requestId) ?? null
	}

	/**
	 * Get all requests for a specific agent
	 */
	getRequestsForAgent(agentId: string): QueuedRequest[] {
		return this.queue.filter((r) => r.agentId === agentId)
	}

	/**
	 * Get all requests for a specific provider
	 */
	getRequestsForProvider(providerId: string): QueuedRequest[] {
		return this.queue.filter((r) => r.providerId === providerId)
	}

	/**
	 * Get the position of a request in the queue
	 */
	getQueuePosition(requestId: string): number {
		const index = this.queue.findIndex((r) => r.requestId === requestId)
		return index === -1 ? -1 : index + 1
	}

	/**
	 * Get the current queue size
	 */
	get size(): number {
		return this.queue.length
	}

	/**
	 * Check if the queue is empty
	 */
	get isEmpty(): boolean {
		return this.queue.length === 0
	}

	/**
	 * Check if the queue is full
	 */
	get isFull(): boolean {
		return this.queue.length >= this.config.maxSize
	}

	/**
	 * Get queue statistics
	 */
	getStats(): {
		totalRequests: number
		byPriority: Record<RequestPriority, number>
		byProvider: Record<string, number>
		oldestRequestAge: number
	} {
		const now = Date.now()
		const byPriority: Record<RequestPriority, number> = {
			critical: 0,
			high: 0,
			normal: 0,
			low: 0,
		}
		const byProvider: Record<string, number> = {}
		let oldestTimestamp = now

		for (const request of this.queue) {
			byPriority[request.priority]++
			byProvider[request.providerId] = (byProvider[request.providerId] || 0) + 1
			if (request.queuedAt < oldestTimestamp) {
				oldestTimestamp = request.queuedAt
			}
		}

		return {
			totalRequests: this.queue.length,
			byPriority,
			byProvider,
			oldestRequestAge: now - oldestTimestamp,
		}
	}

	/**
	 * Clear all requests from the queue
	 */
	clear(): void {
		for (const request of this.queue) {
			this.emitEvent("request_rejected", request.providerId, request.agentId, request.requestId, {
				reason: "Queue cleared",
			})
		}
		this.queue = []
	}

	/**
	 * Subscribe to queue events
	 */
	subscribe(handler: RateLimitEventHandler): void {
		this.on("rateLimitEvent", handler)
	}

	/**
	 * Unsubscribe from queue events
	 */
	unsubscribe(handler: RateLimitEventHandler): void {
		this.off("rateLimitEvent", handler)
	}

	/**
	 * Dispose of the queue
	 */
	dispose(): void {
		if (this.processingInterval) {
			clearInterval(this.processingInterval)
			this.processingInterval = null
		}
		this.clear()
		this.removeAllListeners()
	}

	// Private methods

	/**
	 * Insert a request in priority order
	 */
	private insertByPriority(request: QueuedRequest): void {
		const priorityValue = PRIORITY_VALUES[request.priority]

		// Find insertion point
		let insertIndex = this.queue.length
		for (let i = 0; i < this.queue.length; i++) {
			const existingPriority = PRIORITY_VALUES[this.queue[i].priority]
			if (priorityValue < existingPriority) {
				insertIndex = i
				break
			}
		}

		this.queue.splice(insertIndex, 0, request)
	}

	/**
	 * Remove expired requests from the queue
	 */
	private removeExpiredRequests(): void {
		const now = Date.now()
		const expiredRequests = this.queue.filter((r) => r.expiresAt && r.expiresAt < now)

		for (const expired of expiredRequests) {
			this.remove(expired.requestId)
		}
	}

	/**
	 * Generate a unique request ID
	 */
	private generateRequestId(): string {
		return `req_${++this.requestIdCounter}_${Date.now()}`
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
