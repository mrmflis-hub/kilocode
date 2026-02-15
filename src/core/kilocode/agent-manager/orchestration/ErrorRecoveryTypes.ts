// kilocode_change - new file

import type { WorkflowState } from "./types"
import type { HealthEvent } from "../../../../services/kilocode/health-monitoring/types"
import type { AgentMessage } from "@kilocode/core-schemas"

/**
 * Error types that can occur in the orchestration system
 */
export type OrchestrationErrorType =
	| "agent_failure"
	| "agent_timeout"
	| "agent_unhealthy"
	| "task_execution_error"
	| "message_delivery_error"
	| "checkpoint_error"
	| "resource_exhausted"
	| "rate_limit_exceeded"
	| "provider_error"
	| "validation_error"
	| "unknown_error"

/**
 * Severity level of an error
 */
export type ErrorSeverity = "low" | "medium" | "high" | "critical"

/**
 * Recovery strategy types
 */
export type RecoveryStrategyType =
	| "retry"
	| "reassign"
	| "rollback"
	| "restart_agent"
	| "graceful_degradation"
	| "abort"
	| "notify_user"

/**
 * Error context information
 */
export interface ErrorContext {
	/** Unique error identifier */
	errorId: string
	/** Type of error */
	errorType: OrchestrationErrorType
	/** Severity level */
	severity: ErrorSeverity
	/** Error message */
	message: string
	/** Original error if available */
	originalError?: Error
	/** Timestamp when error occurred */
	timestamp: number
	/** Agent ID if error is agent-related */
	agentId?: string
	/** Session ID if error is session-related */
	sessionId?: string
	/** Workflow state when error occurred */
	workflowState?: WorkflowState
	/** Task ID if error is task-related */
	taskId?: string
	/** Message that caused the error */
	messageContext?: AgentMessage
	/** Additional metadata */
	metadata?: Record<string, unknown>
	/** Number of retry attempts so far */
	retryCount?: number
}

/**
 * Recovery strategy configuration
 */
export interface RecoveryStrategy {
	/** Strategy type */
	type: RecoveryStrategyType
	/** Priority of this strategy (lower = higher priority) */
	priority: number
	/** Maximum number of attempts for this strategy */
	maxAttempts: number
	/** Delay between attempts in milliseconds */
	delayMs: number
	/** Whether to use exponential backoff */
	exponentialBackoff: boolean
	/** Maximum delay for exponential backoff */
	maxDelayMs?: number
	/** Backoff multiplier */
	backoffMultiplier?: number
	/** Conditions for applying this strategy */
	conditions?: RecoveryCondition[]
	/** Callback to execute before strategy */
	preAction?: (context: ErrorContext) => Promise<void>
	/** Callback to execute after strategy */
	postAction?: (context: ErrorContext, success: boolean) => Promise<void>
}

/**
 * Condition for applying a recovery strategy
 */
export interface RecoveryCondition {
	/** Condition type */
	type: "error_type" | "severity" | "retry_count" | "agent_status" | "custom"
	/** Condition operator */
	operator: "equals" | "not_equals" | "greater_than" | "less_than" | "in" | "not_in"
	/** Condition value */
	value: unknown
}

/**
 * Result of a recovery attempt
 */
export interface RecoveryResult {
	/** Whether recovery was successful */
	success: boolean
	/** Strategy that was applied */
	strategy: RecoveryStrategyType
	/** Number of attempts made */
	attempts: number
	/** Error if recovery failed */
	error?: string
	/** New agent ID if task was reassigned */
	newAgentId?: string
	/** Checkpoint ID if rollback was performed */
	rollbackCheckpointId?: string
	/** Timestamp when recovery completed */
	timestamp: number
	/** Additional result data */
	data?: Record<string, unknown>
}

/**
 * Error event for listeners
 */
export interface ErrorEvent {
	/** Event type */
	type: ErrorEventType
	/** Error context */
	context: ErrorContext
	/** Recovery result if recovery was attempted */
	recoveryResult?: RecoveryResult
	/** Timestamp */
	timestamp: number
}

/**
 * Error event types
 */
export type ErrorEventType =
	| "error_occurred"
	| "recovery_started"
	| "recovery_attempt"
	| "recovery_success"
	| "recovery_failed"
	| "max_retries_exceeded"
	| "circuit_breaker_opened"
	| "circuit_breaker_closed"
	| "graceful_degradation_activated"
	| "user_notification_sent"

/**
 * Circuit breaker state
 */
export type CircuitBreakerState = "closed" | "open" | "half_open"

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
	/** Number of failures before opening circuit */
	failureThreshold: number
	/** Time in ms before attempting to close circuit */
	resetTimeoutMs: number
	/** Number of successes in half-open state to close circuit */
	successThreshold: number
	/** Time window for counting failures in ms */
	failureWindowMs: number
}

/**
 * Circuit breaker status
 */
export interface CircuitBreakerStatus {
	/** Current state */
	state: CircuitBreakerState
	/** Number of consecutive failures */
	failureCount: number
	/** Number of consecutive successes (for half-open state) */
	successCount: number
	/** Timestamp when circuit was opened */
	openedAt?: number
	/** Timestamp when circuit can attempt to close */
	canCloseAt?: number
	/** Total times circuit has opened */
	totalOpens: number
}

/**
 * Error recovery configuration
 */
export interface ErrorRecoveryConfig {
	/** Whether error recovery is enabled */
	enabled: boolean
	/** Default maximum retry attempts */
	maxRetryAttempts: number
	/** Default delay between retries in ms */
	defaultRetryDelayMs: number
	/** Maximum delay for exponential backoff */
	maxRetryDelayMs: number
	/** Exponential backoff multiplier */
	backoffMultiplier: number
	/** Whether to enable circuit breaker */
	enableCircuitBreaker: boolean
	/** Circuit breaker configuration */
	circuitBreakerConfig: CircuitBreakerConfig
	/** Whether to enable graceful degradation */
	enableGracefulDegradation: boolean
	/** Whether to notify users of errors */
	notifyUserOnError: boolean
	/** Minimum severity to notify user */
	userNotificationSeverity: ErrorSeverity
	/** Whether to enable fallback strategies when primary fails */
	enableFallbacks: boolean
	/** Strategies to apply for each error type */
	strategies: Map<OrchestrationErrorType, RecoveryStrategy[]>
}

/**
 * Default error recovery configuration
 */
export const DEFAULT_ERROR_RECOVERY_CONFIG: ErrorRecoveryConfig = {
	enabled: true,
	maxRetryAttempts: 3,
	defaultRetryDelayMs: 1000,
	maxRetryDelayMs: 30000,
	backoffMultiplier: 2,
	enableCircuitBreaker: true,
	circuitBreakerConfig: {
		failureThreshold: 5,
		resetTimeoutMs: 60000,
		successThreshold: 2,
		failureWindowMs: 60000,
	},
	enableGracefulDegradation: true,
	notifyUserOnError: true,
	userNotificationSeverity: "high",
	enableFallbacks: true,
	strategies: new Map(),
}

/**
 * Task reassignment options
 */
export interface TaskReassignmentOptions {
	/** Original agent ID */
	fromAgentId: string
	/** Reason for reassignment */
	reason: string
	/** Preferred new agent role */
	preferredRole?: string
	/** Whether to preserve task context */
	preserveContext: boolean
	/** Maximum time to wait for new agent in ms */
	timeoutMs?: number
}

/**
 * Graceful degradation options
 */
export interface GracefulDegradationOptions {
	/** Whether to skip optional steps */
	skipOptionalSteps: boolean
	/** Whether to reduce parallelism */
	reduceParallelism: boolean
	/** Maximum agents to use during degradation */
	maxAgents?: number
	/** Whether to use fallback providers */
	useFallbackProviders: boolean
	/** Custom fallback behavior */
	customBehavior?: () => Promise<void>
}

/**
 * User notification options
 */
export interface UserNotificationOptions {
	/** Notification type */
	type: "error" | "warning" | "info"
	/** Title */
	title: string
	/** Message */
	message: string
	/** Whether to require user action */
	requireAction: boolean
	/** Actions available to user */
	actions?: UserNotificationAction[]
	/** Timeout for auto-dismiss in ms (0 = no auto-dismiss) */
	timeoutMs: number
}

/**
 * User notification action
 */
export interface UserNotificationAction {
	/** Action ID */
	id: string
	/** Action label */
	label: string
	/** Whether this is the primary action */
	primary?: boolean
}

/**
 * Error statistics
 */
export interface ErrorStatistics {
	/** Total errors encountered */
	totalErrors: number
	/** Errors by type */
	errorsByType: Record<OrchestrationErrorType, number>
	/** Errors by severity */
	errorsBySeverity: Record<ErrorSeverity, number>
	/** Recovery attempts */
	totalRecoveryAttempts: number
	/** Successful recoveries */
	successfulRecoveries: number
	/** Failed recoveries */
	failedRecoveries: number
	/** Average recovery time in ms */
	averageRecoveryTimeMs: number
	/** Circuit breaker opens */
	circuitBreakerOpens: number
	/** Graceful degradation activations */
	gracefulDegradationActivations: number
	/** User notifications sent */
	userNotificationsSent: number
	/** Last error timestamp */
	lastErrorTimestamp?: number
}

/**
 * Error recovery handler interface
 */
export interface ErrorRecoveryHandler {
	/** Handle an error */
	handleError(context: ErrorContext): Promise<RecoveryResult>
	/** Check if recovery is possible */
	canRecover(context: ErrorContext): boolean
	/** Get recovery strategy */
	getStrategy(context: ErrorContext): RecoveryStrategy | null
}

/**
 * Error listener type
 */
export type ErrorListener = (event: ErrorEvent) => void

/**
 * Recovery action result for tracking
 */
export interface RecoveryActionRecord {
	/** Action ID */
	id: string
	/** Error context */
	errorContext: ErrorContext
	/** Strategy applied */
	strategy: RecoveryStrategyType
	/** Start timestamp */
	startedAt: number
	/** End timestamp */
	completedAt?: number
	/** Result */
	result?: RecoveryResult
	/** Whether the action is in progress */
	inProgress: boolean
}
