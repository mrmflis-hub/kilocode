import type { AgentInstance } from "./types"
import type { AgentMessage, MessageType } from "@kilocode/core-schemas"
import { RuntimeProcessHandler } from "../RuntimeProcessHandler"
import { AgentPoolManager } from "./AgentPoolManager"
import { FileLockingService, type LockEvent } from "../../../../services/kilocode/file-locking"

// Re-export types from core-schemas for convenience
export type { AgentMessage, MessageType }

/**
 * Message subscription handler
 */
type MessageHandler = (message: AgentMessage) => void | Promise<void>

/**
 * Subscription filter
 */
interface SubscriptionFilter {
	messageTypes?: MessageType[]
	from?: string
}

/**
 * Pending request waiting for response
 */
interface PendingRequest {
	correlationId: string
	resolve: (response: AgentMessage) => void
	reject: (error: Error) => void
	timeout: ReturnType<typeof setTimeout>
	createdAt: number
}

/**
 * Queued message for delivery
 */
interface QueuedMessage {
	message: AgentMessage
	targetAgentId: string
	queuedAt: number
	retryCount: number
}

/**
 * Message log entry
 */
interface MessageLogEntry {
	message: AgentMessage
	timestamp: number
	delivered: boolean
	error?: string
}

/**
 * MessageRouter - Inter-agent communication system
 *
 * This class is responsible for:
 * - Routing messages between agents via IPC
 * - Managing agent subscriptions
 * - Handling request/response patterns with correlation IDs
 * - Message queuing and delivery
 * - Message logging for debugging
 * - Handling IPC message size limits
 */
export class MessageRouter {
	// Agent subscriptions: agentId -> { handler, filter }
	private subscriptions: Map<string, { handler: MessageHandler; filter: SubscriptionFilter }> = new Map()

	// Pending requests: correlationId -> PendingRequest
	private pendingRequests: Map<string, PendingRequest> = new Map()

	// Message queue
	private messageQueue: QueuedMessage[] = []
	private queueProcessingInterval: ReturnType<typeof setInterval> | null = null
	private readonly queueProcessingIntervalMs = 100 // Process queue every 100ms
	private readonly maxQueueSize = 1000
	private readonly maxRetryCount = 3

	// Message log (circular buffer)
	private messageLog: MessageLogEntry[] = []
	private readonly maxLogSize = 1000

	// IPC message size limit (Node.js default is ~1MB for IPC)
	private readonly maxIPCMessageSize = 1024 * 1024 // 1MB

	// File locking service reference
	private fileLockingService: FileLockingService | null = null

	constructor(
		private readonly agentPoolManager: AgentPoolManager,
		private readonly processHandler: RuntimeProcessHandler,
	) {
		this.startQueueProcessing()
	}

	/**
	 * Set the file locking service reference
	 * This is called after the FileLockingService is created
	 */
	setFileLockingService(service: FileLockingService): void {
		this.fileLockingService = service
		// Subscribe to lock events and broadcast them to agents
		this.fileLockingService.subscribe(this.handleLockEvent.bind(this))
	}

	/**
	 * Handle lock events from FileLockingService and broadcast to relevant agents
	 */
	private async handleLockEvent(event: LockEvent): Promise<void> {
		// Create a message for the lock event
		const lockMessage: AgentMessage = {
			id: this.generateMessageId(),
			type: "notification",
			from: "file-locking-service",
			to: "broadcast",
			timestamp: Date.now(),
			payload: {
				notificationType: "file-lock-event",
				eventType: event.type,
				filePath: event.filePath,
				agentId: event.agentId,
				lockId: event.lockId,
				data: event.data,
			},
		}

		// Broadcast to all agents
		await this.routeMessage(lockMessage)
	}

	/**
	 * Route a message to the target agent(s)
	 * @param message - The message to route
	 * @throws Error if message validation fails or target not found
	 */
	async routeMessage(message: AgentMessage): Promise<void> {
		// Validate message structure
		this.validateMessage(message)

		// Add to log
		this.addToLog(message, false)

		// Handle broadcast
		if (message.to === "broadcast") {
			await this.broadcastMessage(message)
			return
		}

		// Route to specific agent
		const targetAgent = this.agentPoolManager.getAgent(message.to)
		if (!targetAgent) {
			const error = `Target agent ${message.to} not found`
			this.addToLog(message, false, error)
			throw new Error(error)
		}

		// Check if agent is ready to receive messages
		if (targetAgent.status !== "ready" && targetAgent.status !== "busy") {
			// Queue message for later delivery
			this.queueMessage(message, message.to)
			return
		}

		// Send message via IPC
		await this.sendToAgent(message, targetAgent)
	}

	/**
	 * Subscribe an agent to receive messages
	 * @param agentId - Agent ID to subscribe
	 * @param handler - Message handler function
	 * @param filter - Optional filter for message types and sources
	 */
	subscribe(agentId: string, handler: MessageHandler, filter?: SubscriptionFilter): void {
		this.subscriptions.set(agentId, { handler, filter: filter || {} })
	}

	/**
	 * Unsubscribe an agent from receiving messages
	 * @param agentId - Agent ID to unsubscribe
	 */
	unsubscribe(agentId: string): void {
		this.subscriptions.delete(agentId)
	}

	/**
	 * Send a request message and wait for response
	 * @param to - Target agent ID
	 * @param payload - Request payload
	 * @param timeoutMs - Timeout in milliseconds (default: 30000)
	 * @returns Response message
	 * @throws Error if timeout occurs or request fails
	 */
	async sendRequest(to: string, payload: AgentMessage["payload"], timeoutMs: number = 30000): Promise<AgentMessage> {
		const correlationId = this.generateCorrelationId()
		const from = "router" // Router acts as sender

		const request: AgentMessage = {
			id: this.generateMessageId(),
			type: "request",
			from,
			to,
			timestamp: Date.now(),
			payload,
			correlationId,
		}

		// Create promise for response
		const responsePromise = new Promise<AgentMessage>((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.pendingRequests.delete(correlationId)
				reject(new Error(`Request timeout after ${timeoutMs}ms`))
			}, timeoutMs)

			this.pendingRequests.set(correlationId, {
				correlationId,
				resolve,
				reject,
				timeout,
				createdAt: Date.now(),
			})
		})

		// Send request
		await this.routeMessage(request)

		// Wait for response
		return responsePromise
	}

	/**
	 * Send a response message to a request
	 * @param to - Target agent ID
	 * @param payload - Response payload
	 * @param correlationId - Correlation ID from original request
	 */
	async sendResponse(to: string, payload: AgentMessage["payload"], correlationId: string): Promise<void> {
		const from = "router" // Router acts as sender

		const response: AgentMessage = {
			id: this.generateMessageId(),
			type: "response",
			from,
			to,
			timestamp: Date.now(),
			payload,
			correlationId,
		}

		await this.routeMessage(response)
	}

	/**
	 * Queue a message for later delivery
	 * @param message - Message to queue
	 * @param targetAgentId - Target agent ID
	 */
	private queueMessage(message: AgentMessage, targetAgentId: string): void {
		if (this.messageQueue.length >= this.maxQueueSize) {
			// Remove oldest message
			this.messageQueue.shift()
		}

		this.messageQueue.push({
			message,
			targetAgentId,
			queuedAt: Date.now(),
			retryCount: 0,
		})
	}

	/**
	 * Start processing the message queue
	 */
	private startQueueProcessing(): void {
		this.queueProcessingInterval = setInterval(() => {
			this.processQueue()
		}, this.queueProcessingIntervalMs)
	}

	/**
	 * Process queued messages
	 */
	private processQueue(): void {
		if (this.messageQueue.length === 0) {
			return
		}

		const now = Date.now()
		const messagesToDeliver: QueuedMessage[] = []
		const messagesToRetry: QueuedMessage[] = []

		for (const queued of this.messageQueue) {
			const targetAgent = this.agentPoolManager.getAgent(queued.targetAgentId)

			if (!targetAgent) {
				// Agent no longer exists, skip
				continue
			}

			if (targetAgent.status === "ready" || targetAgent.status === "busy") {
				// Agent is ready, deliver message
				messagesToDeliver.push(queued)
			} else if (queued.retryCount < this.maxRetryCount) {
				// Agent not ready, retry later
				messagesToRetry.push(queued)
			}
			// else: max retries reached, drop message
		}

		// Clear queue
		this.messageQueue = messagesToRetry.map((m) => ({ ...m, retryCount: m.retryCount + 1 }))

		// Deliver messages
		for (const queued of messagesToDeliver) {
			const targetAgent = this.agentPoolManager.getAgent(queued.targetAgentId)
			if (!targetAgent) {
				continue
			}

			this.sendToAgent(queued.message, targetAgent)
				.then(() => {
					this.addToLog(queued.message, true)
				})
				.catch((error) => {
					this.addToLog(queued.message, false, error.message)
				})
		}
	}

	/**
	 * Send a message to an agent via IPC
	 * @param message - Message to send
	 * @param agent - Target agent instance
	 */
	private async sendToAgent(message: AgentMessage, agent: AgentInstance): Promise<void> {
		if (!agent.sessionId) {
			throw new Error(`Agent ${agent.agentId} has no session ID`)
		}

		// Check message size
		const messageSize = JSON.stringify(message).length
		if (messageSize > this.maxIPCMessageSize) {
			// Handle large message by sending reference instead
			await this.sendLargeMessage(message, agent)
			return
		}

		// Send via RuntimeProcessHandler
		await this.processHandler.sendMessage(agent.sessionId, {
			type: "agentMessage",
			message,
		})
	}

	/**
	 * Handle large messages by sending reference
	 * @param message - Large message to send
	 * @param agent - Target agent instance
	 */
	private async sendLargeMessage(message: AgentMessage, agent: AgentInstance): Promise<void> {
		// For now, we'll truncate the message payload
		// In a full implementation, we would store the full content
		// in ArtifactStore and send a reference instead
		const truncatedMessage: AgentMessage = {
			...message,
			payload: {
				...message.payload,
				_truncated: true,
				_originalSize: JSON.stringify(message.payload).length,
			},
		}

		await this.processHandler.sendMessage(agent.sessionId, {
			type: "agentMessage",
			message: truncatedMessage,
		})
	}

	/**
	 * Broadcast a message to all subscribed agents
	 * @param message - Message to broadcast
	 */
	private async broadcastMessage(message: AgentMessage): Promise<void> {
		const agents = this.agentPoolManager.getActiveAgents()
		const deliveryPromises: Promise<void>[] = []

		for (const agent of agents) {
			// Skip sender
			if (agent.agentId === message.from) {
				continue
			}

			// Check subscription filter
			const subscription = this.subscriptions.get(agent.agentId)
			if (subscription) {
				if (!this.matchesFilter(message, subscription.filter)) {
					continue
				}
			}

			// Send to agent
			deliveryPromises.push(this.sendToAgent(message, agent))
		}

		await Promise.allSettled(deliveryPromises)
	}

	/**
	 * Check if message matches subscription filter
	 * @param message - Message to check
	 * @param filter - Subscription filter
	 */
	private matchesFilter(message: AgentMessage, filter: SubscriptionFilter): boolean {
		if (filter.messageTypes && !filter.messageTypes.includes(message.type)) {
			return false
		}

		if (filter.from && message.from !== filter.from) {
			return false
		}

		return true
	}

	/**
	 * Validate message structure
	 * @param message - Message to validate
	 * @throws Error if validation fails
	 */
	private validateMessage(message: AgentMessage): void {
		if (!message.id || typeof message.id !== "string") {
			throw new Error("Invalid message: missing or invalid id")
		}

		if (!message.type || typeof message.type !== "string") {
			throw new Error("Invalid message: missing or invalid type")
		}

		if (!message.from || typeof message.from !== "string") {
			throw new Error("Invalid message: missing or invalid from")
		}

		if (!message.to || typeof message.to !== "string") {
			throw new Error("Invalid message: missing or invalid to")
		}

		if (!message.timestamp || typeof message.timestamp !== "number") {
			throw new Error("Invalid message: missing or invalid timestamp")
		}

		if (!message.payload) {
			throw new Error("Invalid message: missing payload")
		}
	}

	/**
	 * Add message to log
	 * @param message - Message to log
	 * @param delivered - Whether message was delivered
	 * @param error - Optional error message
	 */
	private addToLog(message: AgentMessage, delivered: boolean, error?: string): void {
		this.messageLog.push({
			message,
			timestamp: Date.now(),
			delivered,
			error,
		})

		// Maintain circular buffer
		if (this.messageLog.length > this.maxLogSize) {
			this.messageLog.shift()
		}
	}

	/**
	 * Get message log
	 * @param limit - Maximum number of entries to return
	 * @returns Message log entries
	 */
	getMessageLog(limit: number = 100): MessageLogEntry[] {
		return this.messageLog.slice(-limit)
	}

	/**
	 * Handle incoming message from agent
	 * @param message - Incoming message
	 */
	async handleIncomingMessage(message: AgentMessage): Promise<void> {
		// Check if this is a response to a pending request
		if (message.type === "response" && message.correlationId) {
			const pendingRequest = this.pendingRequests.get(message.correlationId)
			if (pendingRequest) {
				clearTimeout(pendingRequest.timeout)
				this.pendingRequests.delete(message.correlationId)
				pendingRequest.resolve(message)
				return
			}
		}

		// Route to subscribed agents
		const subscription = this.subscriptions.get(message.to)
		if (subscription) {
			if (this.matchesFilter(message, subscription.filter)) {
				await subscription.handler(message)
			}
		}
	}

	/**
	 * Generate unique message ID
	 */
	private generateMessageId(): string {
		return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
	}

	/**
	 * Generate unique correlation ID
	 */
	private generateCorrelationId(): string {
		return `corr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
	}

	/**
	 * Dispose of the message router and clean up resources
	 */
	dispose(): void {
		// Stop queue processing
		if (this.queueProcessingInterval) {
			clearInterval(this.queueProcessingInterval)
			this.queueProcessingInterval = null
		}

		// Clear pending requests
		for (const [correlationId, pending] of this.pendingRequests) {
			clearTimeout(pending.timeout)
			pending.reject(new Error("MessageRouter disposed"))
		}
		this.pendingRequests.clear()

		// Clear subscriptions
		this.subscriptions.clear()

		// Clear queue
		this.messageQueue = []

		// Clear log
		this.messageLog = []

		// Unsubscribe from file locking service
		if (this.fileLockingService) {
			this.fileLockingService.unsubscribe(this.handleLockEvent.bind(this))
		}
	}

	/**
	 * Send a file lock request on behalf of an agent
	 * @param agentId - Agent ID requesting the lock
	 * @param filePath - File path to lock
	 * @param mode - Lock mode (read or write)
	 * @param timeoutMs - Lock timeout
	 * @returns Lock acquisition result
	 */
	async requestFileLock(agentId: string, filePath: string, mode: "read" | "write" = "write", timeoutMs?: number) {
		if (!this.fileLockingService) {
			throw new Error("FileLockingService not initialized")
		}

		return this.fileLockingService.acquireLock({
			filePath,
			agentId,
			mode,
			timeoutMs,
		})
	}

	/**
	 * Release a file lock
	 * @param lockId - Lock ID to release
	 * @returns Whether the lock was released
	 */
	releaseFileLock(lockId: string): boolean {
		if (!this.fileLockingService) {
			throw new Error("FileLockingService not initialized")
		}

		return this.fileLockingService.releaseLock(lockId)
	}

	/**
	 * Get file lock status
	 * @param filePath - File path to check
	 * @returns Lock status information
	 */
	getFileLockStatus(filePath: string) {
		if (!this.fileLockingService) {
			throw new Error("FileLockingService not initialized")
		}

		return this.fileLockingService.getLockStatus(filePath)
	}
}
