// kilocode_change - new file

import { EventEmitter } from "events"
import type { AgentPoolManager } from "./AgentPoolManager"
import type { MessageRouter } from "./MessageRouter"
import type { CheckpointIntegration } from "./CheckpointIntegration"
import type { HealthEvent } from "../../../../services/kilocode/health-monitoring/types"
import type { AgentMessage } from "@kilocode/core-schemas"
import type { WorkflowState } from "./types"
import {
	type ErrorContext,
	type RecoveryResult,
	type RecoveryStrategy,
	type RecoveryStrategyType,
	type ErrorEvent,
	type ErrorListener,
	type ErrorRecoveryConfig,
	type CircuitBreakerStatus,
	type CircuitBreakerConfig,
	type ErrorStatistics,
	type OrchestrationErrorType,
	type ErrorSeverity,
	type TaskReassignmentOptions,
	type GracefulDegradationOptions,
	type UserNotificationOptions,
	type RecoveryActionRecord,
	DEFAULT_ERROR_RECOVERY_CONFIG,
} from "./ErrorRecoveryTypes"

/**
 * ErrorRecoveryManager - Handles error recovery for the orchestration system
 *
 * This class provides:
 * - Task reassignment on agent failure
 * - Retry with exponential backoff
 * - Circuit breaker for repeated failures
 * - Graceful degradation
 * - User notification of errors
 *
 * Usage:
 * ```typescript
 * const recoveryManager = new ErrorRecoveryManager({
 *   agentPoolManager,
 *   messageRouter,
 *   checkpointIntegration,
 * })
 *
 * // Handle an error
 * const result = await recoveryManager.handleError(errorContext)
 *
 * // Listen for error events
 * recoveryManager.addListener((event) => {
 *   console.log('Error event:', event.type)
 * })
 * ```
 */
export class ErrorRecoveryManager extends EventEmitter {
	private readonly config: ErrorRecoveryConfig
	private readonly agentPoolManager?: AgentPoolManager
	private readonly messageRouter?: MessageRouter
	private readonly checkpointIntegration?: CheckpointIntegration
	private readonly circuitBreakers: Map<string, CircuitBreakerStatus> = new Map()
	private readonly errorHistory: ErrorContext[] = []
	private readonly recoveryActions: Map<string, RecoveryActionRecord> = new Map()
	private readonly statistics: ErrorStatistics
	private errorIdCounter = 0
	private actionIdCounter = 0

	constructor(options: {
		agentPoolManager?: AgentPoolManager
		messageRouter?: MessageRouter
		checkpointIntegration?: CheckpointIntegration
		config?: Partial<ErrorRecoveryConfig>
	}) {
		super()

		this.agentPoolManager = options.agentPoolManager
		this.messageRouter = options.messageRouter
		this.checkpointIntegration = options.checkpointIntegration

		// Merge provided config with defaults
		this.config = {
			...DEFAULT_ERROR_RECOVERY_CONFIG,
			...options.config,
			circuitBreakerConfig: {
				...DEFAULT_ERROR_RECOVERY_CONFIG.circuitBreakerConfig,
				...options.config?.circuitBreakerConfig,
			},
			strategies: options.config?.strategies ?? this.getDefaultStrategies(),
		}

		// Initialize statistics
		this.statistics = this.createEmptyStatistics()

		// Set up health event listener if agent pool manager is available
		if (this.agentPoolManager) {
			this.setupHealthEventListener()
		}
	}

	// ============================================================================
	// Public API
	// ============================================================================

	/**
	 * Handle an error and attempt recovery
	 * @param context - Error context
	 * @returns Recovery result
	 */
	async handleError(context: ErrorContext): Promise<RecoveryResult> {
		if (!this.config.enabled) {
			return this.createDisabledResult()
		}

		// Record error
		this.recordError(context)

		// Emit error event
		this.emitErrorEvent("error_occurred", context)

		// Check circuit breaker
		const circuitKey = this.getCircuitBreakerKey(context)
		if (this.isCircuitOpen(circuitKey)) {
			return this.handleOpenCircuit(context, circuitKey)
		}

		// Get recovery strategy
		const strategy = this.getStrategy(context)
		if (!strategy) {
			return this.createNoStrategyResult(context)
		}

		// Execute recovery
		return this.executeRecovery(context, strategy)
	}

	/**
	 * Create an error context from various error sources
	 */
	createErrorContext(options: {
		errorType: OrchestrationErrorType
		message: string
		severity?: ErrorSeverity
		agentId?: string
		sessionId?: string
		workflowState?: WorkflowState
		taskId?: string
		originalError?: Error
		messageContext?: AgentMessage
		metadata?: Record<string, unknown>
	}): ErrorContext {
		return {
			errorId: this.generateErrorId(),
			errorType: options.errorType,
			severity: options.severity ?? this.inferSeverity(options.errorType),
			message: options.message,
			originalError: options.originalError,
			timestamp: Date.now(),
			agentId: options.agentId,
			sessionId: options.sessionId,
			workflowState: options.workflowState,
			taskId: options.taskId,
			messageContext: options.messageContext,
			metadata: options.metadata,
			retryCount: 0,
		}
	}

	/**
	 * Check if recovery is possible for the given error
	 */
	canRecover(context: ErrorContext): boolean {
		if (!this.config.enabled) {
			return false
		}

		const strategy = this.getStrategy(context)
		return strategy !== null && (context.retryCount ?? 0) < strategy.maxAttempts
	}

	/**
	 * Get the recovery strategy for an error
	 */
	getStrategy(context: ErrorContext): RecoveryStrategy | null {
		const strategies = this.config.strategies.get(context.errorType)
		if (!strategies || strategies.length === 0) {
			// Return default strategy
			return this.getDefaultStrategy(context.errorType)
		}

		// Find first matching strategy based on conditions
		for (const strategy of strategies) {
			if (this.matchesConditions(strategy, context)) {
				return strategy
			}
		}

		// Return first strategy if no conditions match
		return strategies[0]
	}

	/**
	 * Add an error event listener
	 */
	addErrorListener(listener: ErrorListener): void {
		this.on("error", listener)
	}

	/**
	 * Remove an error event listener
	 */
	removeErrorListener(listener: ErrorListener): void {
		this.off("error", listener)
	}

	/**
	 * Get error statistics
	 */
	getStatistics(): ErrorStatistics {
		return { ...this.statistics }
	}

	/**
	 * Get circuit breaker status for a key
	 */
	getCircuitBreakerStatus(key: string): CircuitBreakerStatus | undefined {
		return this.circuitBreakers.get(key)
	}

	/**
	 * Get all circuit breaker statuses
	 */
	getAllCircuitBreakerStatuses(): Map<string, CircuitBreakerStatus> {
		return new Map(this.circuitBreakers)
	}

	/**
	 * Reset a circuit breaker
	 */
	resetCircuitBreaker(key: string): void {
		this.circuitBreakers.delete(key)
	}

	/**
	 * Reset all circuit breakers
	 */
	resetAllCircuitBreakers(): void {
		this.circuitBreakers.clear()
	}

	/**
	 * Get error history
	 */
	getErrorHistory(limit?: number): ErrorContext[] {
		const history = [...this.errorHistory].reverse()
		return limit ? history.slice(0, limit) : history
	}

	/**
	 * Clear error history
	 */
	clearErrorHistory(): void {
		this.errorHistory.length = 0
	}

	/**
	 * Manually trigger task reassignment
	 */
	async reassignTask(options: TaskReassignmentOptions): Promise<RecoveryResult> {
		const context = this.createErrorContext({
			errorType: "agent_failure",
			message: `Task reassignment requested: ${options.reason}`,
			severity: "medium",
			agentId: options.fromAgentId,
		})

		return this.executeReassignment(context, options)
	}

	/**
	 * Manually trigger graceful degradation
	 */
	async activateGracefulDegradation(options: GracefulDegradationOptions): Promise<RecoveryResult> {
		const context = this.createErrorContext({
			errorType: "resource_exhausted",
			message: "Graceful degradation activated",
			severity: "high",
		})

		return this.executeGracefulDegradation(context, options)
	}

	/**
	 * Send user notification
	 */
	async notifyUser(options: UserNotificationOptions): Promise<void> {
		const context = this.createErrorContext({
			errorType: "unknown_error",
			message: options.message,
			severity: options.type === "error" ? "high" : options.type === "warning" ? "medium" : "low",
		})

		await this.executeUserNotification(context, options)
	}

	/**
	 * Dispose of the manager
	 */
	dispose(): void {
		this.removeAllListeners()
		this.circuitBreakers.clear()
		this.errorHistory.length = 0
		this.recoveryActions.clear()
	}

	// ============================================================================
	// Recovery Strategy Implementations
	// ============================================================================

	/**
	 * Execute recovery strategy
	 */
	private async executeRecovery(context: ErrorContext, strategy: RecoveryStrategy): Promise<RecoveryResult> {
		const actionId = this.generateActionId()
		const action: RecoveryActionRecord = {
			id: actionId,
			errorContext: context,
			strategy: strategy.type,
			startedAt: Date.now(),
			inProgress: true,
		}
		this.recoveryActions.set(actionId, action)

		this.emitErrorEvent("recovery_started", context, undefined)

		let attempts = 0
		let lastError: string | undefined

		while (attempts < strategy.maxAttempts) {
			attempts++
			context.retryCount = attempts

			this.emitErrorEvent("recovery_attempt", context, undefined)

			try {
				// Execute pre-action if defined
				if (strategy.preAction) {
					await strategy.preAction(context)
				}

				// Execute strategy
				const result = await this.executeStrategyAction(context, strategy)

				// Execute post-action if defined
				if (strategy.postAction) {
					await strategy.postAction(context, result.success)
				}

				if (result.success) {
					// Record success
					action.completedAt = Date.now()
					action.result = result
					action.inProgress = false

					// Update circuit breaker
					this.recordSuccess(this.getCircuitBreakerKey(context))

					// Update statistics
					this.statistics.successfulRecoveries++
					this.statistics.totalRecoveryAttempts += attempts

					this.emitErrorEvent("recovery_success", context, result)

					return result
				}

				lastError = result.error

				// Wait before retry with exponential backoff
				if (attempts < strategy.maxAttempts) {
					const delay = this.calculateDelay(strategy, attempts)
					await this.sleep(delay)
				}
			} catch (error) {
				lastError = error instanceof Error ? error.message : String(error)
			}
		}

		// All attempts failed
		const failedResult: RecoveryResult = {
			success: false,
			strategy: strategy.type,
			attempts,
			error: lastError ?? "Max attempts exceeded",
			timestamp: Date.now(),
		}

		action.completedAt = Date.now()
		action.result = failedResult
		action.inProgress = false

		// Record failure
		this.recordFailure(this.getCircuitBreakerKey(context))

		// Update statistics
		this.statistics.failedRecoveries++
		this.statistics.totalRecoveryAttempts += attempts

		this.emitErrorEvent("recovery_failed", context, failedResult)

		// Try fallback strategy if available
		return this.tryFallbackStrategy(context, strategy, failedResult)
	}

	/**
	 * Execute a specific strategy action
	 */
	private async executeStrategyAction(context: ErrorContext, strategy: RecoveryStrategy): Promise<RecoveryResult> {
		switch (strategy.type) {
			case "retry":
				return this.executeRetry(context, strategy)

			case "reassign":
				return this.executeReassignment(context, {
					fromAgentId: context.agentId ?? "",
					reason: context.message,
					preserveContext: true,
				})

			case "rollback":
				return this.executeRollback(context)

			case "restart_agent":
				return this.executeAgentRestart(context)

			case "graceful_degradation":
				return this.executeGracefulDegradation(context, {
					skipOptionalSteps: true,
					reduceParallelism: true,
					useFallbackProviders: false,
				})

			case "abort":
				return this.executeAbort(context)

			case "notify_user":
				return this.executeUserNotification(context, {
					type: "error",
					title: "Orchestration Error",
					message: context.message,
					requireAction: context.severity === "critical",
					timeoutMs: 0,
				})

			default:
				return {
					success: false,
					strategy: strategy.type,
					attempts: 1,
					error: `Unknown strategy type: ${strategy.type}`,
					timestamp: Date.now(),
				}
		}
	}

	/**
	 * Execute retry strategy
	 */
	private async executeRetry(context: ErrorContext, strategy: RecoveryStrategy): Promise<RecoveryResult> {
		// For retry, we simply return success if we have a message router
		// The actual retry logic is handled by the caller
		if (!this.messageRouter || !context.messageContext) {
			return {
				success: false,
				strategy: "retry",
				attempts: context.retryCount ?? 1,
				error: "No message router or message context available for retry",
				timestamp: Date.now(),
			}
		}

		try {
			// Re-send the original message via routeMessage
			await this.messageRouter.routeMessage({
				id: `${context.messageContext.id}_retry_${context.retryCount}`,
				from: context.messageContext.from,
				to: context.messageContext.to,
				type: context.messageContext.type,
				payload: context.messageContext.payload,
				timestamp: Date.now(),
				correlationId: context.messageContext.correlationId,
			})

			return {
				success: true,
				strategy: "retry",
				attempts: context.retryCount ?? 1,
				timestamp: Date.now(),
			}
		} catch (error) {
			return {
				success: false,
				strategy: "retry",
				attempts: context.retryCount ?? 1,
				error: error instanceof Error ? error.message : String(error),
				timestamp: Date.now(),
			}
		}
	}

	/**
	 * Execute task reassignment
	 */
	private async executeReassignment(
		context: ErrorContext,
		options: TaskReassignmentOptions,
	): Promise<RecoveryResult> {
		if (!this.agentPoolManager) {
			return {
				success: false,
				strategy: "reassign",
				attempts: 1,
				error: "No agent pool manager available for reassignment",
				timestamp: Date.now(),
			}
		}

		try {
			// Get available agents
			const activeAgents = this.agentPoolManager.getActiveAgents()

			// Filter out the failed agent
			const availableAgents = activeAgents.filter((a) => a.agentId !== options.fromAgentId)

			if (availableAgents.length === 0) {
				return {
					success: false,
					strategy: "reassign",
					attempts: 1,
					error: "No available agents for reassignment",
					timestamp: Date.now(),
				}
			}

			// Select best agent for reassignment
			const targetAgent = options.preferredRole
				? (availableAgents.find((a) => a.role === options.preferredRole) ?? availableAgents[0])
				: availableAgents[0]

			// Reassign task via message router
			if (this.messageRouter && context.messageContext) {
				await this.messageRouter.routeMessage({
					id: `${context.messageContext.id}_reassign_${Date.now()}`,
					from: "orchestrator",
					to: targetAgent.agentId,
					type: context.messageContext.type,
					payload: context.messageContext.payload,
					timestamp: Date.now(),
				})
			}

			return {
				success: true,
				strategy: "reassign",
				attempts: 1,
				newAgentId: targetAgent.agentId,
				timestamp: Date.now(),
			}
		} catch (error) {
			return {
				success: false,
				strategy: "reassign",
				attempts: 1,
				error: error instanceof Error ? error.message : String(error),
				timestamp: Date.now(),
			}
		}
	}

	/**
	 * Execute rollback to checkpoint
	 */
	private async executeRollback(context: ErrorContext): Promise<RecoveryResult> {
		if (!this.checkpointIntegration) {
			return {
				success: false,
				strategy: "rollback",
				attempts: 1,
				error: "No checkpoint integration available for rollback",
				timestamp: Date.now(),
			}
		}

		try {
			const result = await this.checkpointIntegration.rollbackToLatest()

			return {
				success: result.success,
				strategy: "rollback",
				attempts: 1,
				error: result.error,
				rollbackCheckpointId: result.checkpoint?.id,
				timestamp: Date.now(),
				data: {
					restoredState: result.restoredState,
					warnings: result.warnings,
				},
			}
		} catch (error) {
			return {
				success: false,
				strategy: "rollback",
				attempts: 1,
				error: error instanceof Error ? error.message : String(error),
				timestamp: Date.now(),
			}
		}
	}

	/**
	 * Execute agent restart
	 */
	private async executeAgentRestart(context: ErrorContext): Promise<RecoveryResult> {
		if (!this.agentPoolManager || !context.agentId) {
			return {
				success: false,
				strategy: "restart_agent",
				attempts: 1,
				error: "No agent pool manager or agent ID available for restart",
				timestamp: Date.now(),
			}
		}

		try {
			const success = await this.agentPoolManager.restartAgent(context.agentId)

			return {
				success,
				strategy: "restart_agent",
				attempts: 1,
				error: success ? undefined : "Failed to restart agent",
				timestamp: Date.now(),
			}
		} catch (error) {
			return {
				success: false,
				strategy: "restart_agent",
				attempts: 1,
				error: error instanceof Error ? error.message : String(error),
				timestamp: Date.now(),
			}
		}
	}

	/**
	 * Execute graceful degradation
	 */
	private async executeGracefulDegradation(
		context: ErrorContext,
		options: GracefulDegradationOptions,
	): Promise<RecoveryResult> {
		this.statistics.gracefulDegradationActivations++
		this.emitErrorEvent("graceful_degradation_activated", context, undefined)

		try {
			// Execute custom behavior if provided
			if (options.customBehavior) {
				await options.customBehavior()
			}

			// Reduce parallelism if requested
			if (options.reduceParallelism && this.agentPoolManager) {
				const agents = this.agentPoolManager.getActiveAgents()
				const maxAgents = options.maxAgents ?? Math.ceil(agents.length / 2)

				// Pause excess agents
				for (let i = maxAgents; i < agents.length; i++) {
					await this.agentPoolManager.pauseAgent(agents[i].agentId)
				}
			}

			return {
				success: true,
				strategy: "graceful_degradation",
				attempts: 1,
				timestamp: Date.now(),
				data: {
					skipOptionalSteps: options.skipOptionalSteps,
					reduceParallelism: options.reduceParallelism,
					maxAgents: options.maxAgents,
				},
			}
		} catch (error) {
			return {
				success: false,
				strategy: "graceful_degradation",
				attempts: 1,
				error: error instanceof Error ? error.message : String(error),
				timestamp: Date.now(),
			}
		}
	}

	/**
	 * Execute abort
	 */
	private async executeAbort(context: ErrorContext): Promise<RecoveryResult> {
		// Terminate all agents
		if (this.agentPoolManager) {
			const agents = this.agentPoolManager.getActiveAgents()
			for (const agent of agents) {
				try {
					await this.agentPoolManager.terminateAgent(agent.agentId)
				} catch {
					// Ignore errors during abort
				}
			}
		}

		return {
			success: true,
			strategy: "abort",
			attempts: 1,
			timestamp: Date.now(),
		}
	}

	/**
	 * Execute user notification
	 */
	private async executeUserNotification(
		context: ErrorContext,
		options: UserNotificationOptions,
	): Promise<RecoveryResult> {
		this.statistics.userNotificationsSent++
		this.emitErrorEvent("user_notification_sent", context, undefined)

		// Emit notification event that UI can listen to
		this.emit("userNotification", {
			...options,
			errorContext: context,
			timestamp: Date.now(),
		})

		return {
			success: true,
			strategy: "notify_user",
			attempts: 1,
			timestamp: Date.now(),
			data: {
				notification: options,
			},
		}
	}

	/**
	 * Try fallback strategy when primary fails
	 */
	private async tryFallbackStrategy(
		context: ErrorContext,
		failedStrategy: RecoveryStrategy,
		failedResult: RecoveryResult,
	): Promise<RecoveryResult> {
		// Check if fallbacks are enabled
		if (!this.config.enableFallbacks) {
			return failedResult
		}

		// Define fallback chain
		const fallbackChain: RecoveryStrategyType[] = this.getFallbackChain(failedStrategy.type)

		for (const fallbackType of fallbackChain) {
			if (fallbackType === failedStrategy.type) continue

			const fallbackStrategy = this.getDefaultStrategyForType(fallbackType)
			if (fallbackStrategy) {
				const result = await this.executeStrategyAction(context, fallbackStrategy)
				if (result.success) {
					return result
				}
			}
		}

		// All fallbacks failed, return the original failure
		return failedResult
	}

	// ============================================================================
	// Circuit Breaker
	// ============================================================================

	/**
	 * Get circuit breaker key for an error context
	 */
	private getCircuitBreakerKey(context: ErrorContext): string {
		return context.agentId ?? context.errorType
	}

	/**
	 * Check if circuit breaker is open
	 */
	private isCircuitOpen(key: string): boolean {
		const status = this.circuitBreakers.get(key)
		if (!status) return false

		if (status.state === "open") {
			// Check if we can transition to half-open
			if (status.canCloseAt && Date.now() >= status.canCloseAt) {
				status.state = "half_open"
				status.successCount = 0
				this.emit("circuitBreakerStateChange", { key, state: "half_open" })
				return false
			}
			return true
		}

		return false
	}

	/**
	 * Handle error when circuit is open
	 */
	private handleOpenCircuit(context: ErrorContext, circuitKey: string): RecoveryResult {
		this.emitErrorEvent("circuit_breaker_opened", context, undefined)

		// Try graceful degradation
		if (this.config.enableGracefulDegradation) {
			return {
				success: false,
				strategy: "graceful_degradation",
				attempts: 0,
				error: "Circuit breaker is open, graceful degradation recommended",
				timestamp: Date.now(),
			}
		}

		return {
			success: false,
			strategy: "abort",
			attempts: 0,
			error: "Circuit breaker is open",
			timestamp: Date.now(),
		}
	}

	/**
	 * Record a success for circuit breaker
	 */
	private recordSuccess(key: string): void {
		const status = this.circuitBreakers.get(key)
		if (!status) return

		if (status.state === "half_open") {
			status.successCount++
			if (status.successCount >= this.config.circuitBreakerConfig.successThreshold) {
				status.state = "closed"
				status.failureCount = 0
				status.successCount = 0
				this.emit("circuitBreakerStateChange", { key, state: "closed" })
				this.emitErrorEvent("circuit_breaker_closed", {} as ErrorContext, undefined)
			}
		} else if (status.state === "closed") {
			status.failureCount = 0
		}
	}

	/**
	 * Record a failure for circuit breaker
	 */
	private recordFailure(key: string): void {
		let status = this.circuitBreakers.get(key)
		if (!status) {
			status = this.createCircuitBreakerStatus()
			this.circuitBreakers.set(key, status)
		}

		status.failureCount++

		if (status.state === "half_open") {
			// Failure in half-open state, back to open
			status.state = "open"
			status.openedAt = Date.now()
			status.canCloseAt = Date.now() + this.config.circuitBreakerConfig.resetTimeoutMs
			status.totalOpens++
			this.emit("circuitBreakerStateChange", { key, state: "open" })
		} else if (
			status.state === "closed" &&
			status.failureCount >= this.config.circuitBreakerConfig.failureThreshold
		) {
			// Threshold reached, open circuit
			status.state = "open"
			status.openedAt = Date.now()
			status.canCloseAt = Date.now() + this.config.circuitBreakerConfig.resetTimeoutMs
			status.totalOpens++
			this.statistics.circuitBreakerOpens++
			this.emit("circuitBreakerStateChange", { key, state: "open" })
			this.emitErrorEvent("circuit_breaker_opened", {} as ErrorContext, undefined)
		}
	}

	// ============================================================================
	// Helper Methods
	// ============================================================================

	/**
	 * Generate error ID
	 */
	private generateErrorId(): string {
		return `err_${++this.errorIdCounter}_${Date.now()}`
	}

	/**
	 * Generate action ID
	 */
	private generateActionId(): string {
		return `action_${++this.actionIdCounter}_${Date.now()}`
	}

	/**
	 * Record error in history
	 */
	private recordError(context: ErrorContext): void {
		this.errorHistory.push(context)
		this.statistics.totalErrors++
		this.statistics.lastErrorTimestamp = context.timestamp

		// Update error type counts
		if (!this.statistics.errorsByType[context.errorType]) {
			this.statistics.errorsByType[context.errorType] = 0
		}
		this.statistics.errorsByType[context.errorType]++

		// Update severity counts
		if (!this.statistics.errorsBySeverity[context.severity]) {
			this.statistics.errorsBySeverity[context.severity] = 0
		}
		this.statistics.errorsBySeverity[context.severity]++
	}

	/**
	 * Emit error event
	 */
	private emitErrorEvent(type: ErrorEvent["type"], context: ErrorContext, result?: RecoveryResult): void {
		const event: ErrorEvent = {
			type,
			context,
			recoveryResult: result,
			timestamp: Date.now(),
		}
		this.emit("error", event)
	}

	/**
	 * Calculate delay with exponential backoff
	 */
	private calculateDelay(strategy: RecoveryStrategy, attempt: number): number {
		if (!strategy.exponentialBackoff) {
			return strategy.delayMs
		}

		const multiplier = strategy.backoffMultiplier ?? this.config.backoffMultiplier
		const delay = strategy.delayMs * Math.pow(multiplier, attempt - 1)
		const maxDelay = strategy.maxDelayMs ?? this.config.maxRetryDelayMs

		return Math.min(delay, maxDelay)
	}

	/**
	 * Sleep for specified milliseconds
	 */
	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms))
	}

	/**
	 * Infer severity from error type
	 */
	private inferSeverity(errorType: OrchestrationErrorType): ErrorSeverity {
		const severityMap: Record<OrchestrationErrorType, ErrorSeverity> = {
			agent_failure: "high",
			agent_timeout: "medium",
			agent_unhealthy: "high",
			task_execution_error: "medium",
			message_delivery_error: "medium",
			checkpoint_error: "high",
			resource_exhausted: "critical",
			rate_limit_exceeded: "low",
			provider_error: "high",
			validation_error: "low",
			unknown_error: "medium",
		}
		return severityMap[errorType] ?? "medium"
	}

	/**
	 * Check if strategy matches conditions
	 */
	private matchesConditions(strategy: RecoveryStrategy, context: ErrorContext): boolean {
		if (!strategy.conditions || strategy.conditions.length === 0) {
			return true
		}

		return strategy.conditions.every((condition) => {
			let value: unknown

			switch (condition.type) {
				case "error_type":
					value = context.errorType
					break
				case "severity":
					value = context.severity
					break
				case "retry_count":
					value = context.retryCount ?? 0
					break
				case "agent_status":
					value = context.agentId ? this.agentPoolManager?.getAgent(context.agentId)?.status : undefined
					break
				case "custom":
					value = context.metadata
					break
				default:
					return true
			}

			return this.evaluateCondition(value, condition.operator, condition.value)
		})
	}

	/**
	 * Evaluate a condition
	 */
	private evaluateCondition(value: unknown, operator: string, expected: unknown): boolean {
		switch (operator) {
			case "equals":
				return value === expected
			case "not_equals":
				return value !== expected
			case "greater_than":
				return (value as number) > (expected as number)
			case "less_than":
				return (value as number) < (expected as number)
			case "in":
				return Array.isArray(expected) && expected.includes(value)
			case "not_in":
				return Array.isArray(expected) && !expected.includes(value)
			default:
				return false
		}
	}

	/**
	 * Get default strategies for all error types
	 */
	private getDefaultStrategies(): Map<OrchestrationErrorType, RecoveryStrategy[]> {
		const strategies = new Map<OrchestrationErrorType, RecoveryStrategy[]>()

		// Agent failure: try restart, then reassign
		strategies.set("agent_failure", [
			{ type: "restart_agent", priority: 1, maxAttempts: 2, delayMs: 1000, exponentialBackoff: true },
			{ type: "reassign", priority: 2, maxAttempts: 1, delayMs: 0, exponentialBackoff: false },
		])

		// Agent timeout: retry with backoff
		strategies.set("agent_timeout", [
			{ type: "retry", priority: 1, maxAttempts: 3, delayMs: 2000, exponentialBackoff: true },
		])

		// Agent unhealthy: restart
		strategies.set("agent_unhealthy", [
			{ type: "restart_agent", priority: 1, maxAttempts: 3, delayMs: 5000, exponentialBackoff: true },
		])

		// Task execution error: retry
		strategies.set("task_execution_error", [
			{ type: "retry", priority: 1, maxAttempts: 3, delayMs: 1000, exponentialBackoff: true },
			{ type: "rollback", priority: 2, maxAttempts: 1, delayMs: 0, exponentialBackoff: false },
		])

		// Message delivery error: retry
		strategies.set("message_delivery_error", [
			{ type: "retry", priority: 1, maxAttempts: 3, delayMs: 500, exponentialBackoff: true },
		])

		// Checkpoint error: notify user
		strategies.set("checkpoint_error", [
			{ type: "notify_user", priority: 1, maxAttempts: 1, delayMs: 0, exponentialBackoff: false },
		])

		// Resource exhausted: graceful degradation
		strategies.set("resource_exhausted", [
			{ type: "graceful_degradation", priority: 1, maxAttempts: 1, delayMs: 0, exponentialBackoff: false },
		])

		// Rate limit exceeded: wait and retry
		strategies.set("rate_limit_exceeded", [
			{ type: "retry", priority: 1, maxAttempts: 5, delayMs: 5000, exponentialBackoff: true, maxDelayMs: 60000 },
		])

		// Provider error: retry with backoff
		strategies.set("provider_error", [
			{ type: "retry", priority: 1, maxAttempts: 3, delayMs: 2000, exponentialBackoff: true },
		])

		// Validation error: notify user
		strategies.set("validation_error", [
			{ type: "notify_user", priority: 1, maxAttempts: 1, delayMs: 0, exponentialBackoff: false },
		])

		// Unknown error: try rollback, then notify
		strategies.set("unknown_error", [
			{ type: "rollback", priority: 1, maxAttempts: 1, delayMs: 0, exponentialBackoff: false },
			{ type: "notify_user", priority: 2, maxAttempts: 1, delayMs: 0, exponentialBackoff: false },
		])

		return strategies
	}

	/**
	 * Get default strategy for an error type
	 */
	private getDefaultStrategy(errorType: OrchestrationErrorType): RecoveryStrategy | null {
		const strategies = this.config.strategies.get(errorType)
		if (strategies && strategies.length > 0) {
			return strategies[0]
		}

		// Return a generic retry strategy
		return {
			type: "retry",
			priority: 1,
			maxAttempts: this.config.maxRetryAttempts,
			delayMs: this.config.defaultRetryDelayMs,
			exponentialBackoff: true,
			maxDelayMs: this.config.maxRetryDelayMs,
		}
	}

	/**
	 * Get default strategy for a strategy type
	 */
	private getDefaultStrategyForType(type: RecoveryStrategyType): RecoveryStrategy | null {
		return {
			type,
			priority: 1,
			maxAttempts: 1,
			delayMs: 1000,
			exponentialBackoff: false,
		}
	}

	/**
	 * Get fallback chain for a strategy type
	 */
	private getFallbackChain(type: RecoveryStrategyType): RecoveryStrategyType[] {
		const chains: Record<RecoveryStrategyType, RecoveryStrategyType[]> = {
			retry: ["reassign", "rollback", "notify_user"],
			reassign: ["rollback", "notify_user"],
			rollback: ["notify_user"],
			restart_agent: ["reassign", "rollback"],
			graceful_degradation: ["notify_user"],
			abort: ["notify_user"],
			notify_user: [],
		}
		return chains[type] ?? []
	}

	/**
	 * Create empty statistics object
	 */
	private createEmptyStatistics(): ErrorStatistics {
		return {
			totalErrors: 0,
			errorsByType: {} as Record<OrchestrationErrorType, number>,
			errorsBySeverity: {} as Record<ErrorSeverity, number>,
			totalRecoveryAttempts: 0,
			successfulRecoveries: 0,
			failedRecoveries: 0,
			averageRecoveryTimeMs: 0,
			circuitBreakerOpens: 0,
			gracefulDegradationActivations: 0,
			userNotificationsSent: 0,
		}
	}

	/**
	 * Create circuit breaker status
	 */
	private createCircuitBreakerStatus(): CircuitBreakerStatus {
		return {
			state: "closed",
			failureCount: 0,
			successCount: 0,
			totalOpens: 0,
		}
	}

	/**
	 * Create disabled result
	 */
	private createDisabledResult(): RecoveryResult {
		return {
			success: false,
			strategy: "abort",
			attempts: 0,
			error: "Error recovery is disabled",
			timestamp: Date.now(),
		}
	}

	/**
	 * Create no strategy result
	 */
	private createNoStrategyResult(context: ErrorContext): RecoveryResult {
		return {
			success: false,
			strategy: "abort",
			attempts: 0,
			error: `No recovery strategy found for error type: ${context.errorType}`,
			timestamp: Date.now(),
		}
	}

	/**
	 * Set up health event listener
	 */
	private setupHealthEventListener(): void {
		if (!this.agentPoolManager) return

		this.agentPoolManager.addHealthListener((event: HealthEvent) => {
			if (event.type === "agent_unhealthy" || event.type === "agent_max_restarts_reached") {
				const context = this.createErrorContext({
					errorType: "agent_unhealthy",
					message: `Agent ${event.agentId} is unhealthy: ${event.error ?? "unknown reason"}`,
					severity: "high",
					agentId: event.agentId,
				})

				// Fire and forget - we don't want to block health monitoring
				this.handleError(context).catch((err) => {
					console.error("Failed to handle unhealthy agent error:", err)
				})
			}
		})
	}
}

/**
 * Create an error recovery manager
 */
export function createErrorRecoveryManager(options: {
	agentPoolManager?: AgentPoolManager
	messageRouter?: MessageRouter
	checkpointIntegration?: CheckpointIntegration
	config?: Partial<ErrorRecoveryConfig>
}): ErrorRecoveryManager {
	return new ErrorRecoveryManager(options)
}
