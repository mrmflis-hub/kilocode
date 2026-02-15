// kilocode_change - new file

/**
 * Health status of an agent
 */
export type HealthStatus = "healthy" | "unhealthy" | "unknown" | "recovering"

/**
 * Health check result for a single agent
 */
export interface HealthCheckResult {
	/** Agent ID */
	agentId: string

	/** Health status */
	status: HealthStatus

	/** Timestamp of the health check */
	timestamp: number

	/** Time since last activity in milliseconds */
	inactiveTimeMs: number

	/** Whether the agent responded to ping */
	respondedToPing: boolean

	/** Response time in milliseconds (if responded) */
	responseTimeMs?: number

	/** Error message if unhealthy */
	error?: string

	/** Number of consecutive failed health checks */
	consecutiveFailures: number

	/** Whether the agent was automatically restarted */
	restarted?: boolean
}

/**
 * Configuration for health monitoring
 */
export interface HealthMonitorConfig {
	/** Interval between health checks in milliseconds (default: 10000) */
	checkIntervalMs: number

	/** Timeout for ping response in milliseconds (default: 5000) */
	pingTimeoutMs: number

	/** Time without activity before considering agent unresponsive (default: 30000) */
	unresponsiveThresholdMs: number

	/** Number of consecutive failures before marking as unhealthy (default: 3) */
	failureThreshold: number

	/** Number of consecutive successes to mark recovering agent as healthy (default: 2) */
	recoveryThreshold: number

	/** Whether to automatically restart unhealthy agents (default: true) */
	autoRestart: boolean

	/** Maximum number of restart attempts before giving up (default: 3) */
	maxRestartAttempts: number

	/** Cooldown period between restart attempts in milliseconds (default: 10000) */
	restartCooldownMs: number
}

/**
 * Default health monitor configuration
 */
export const DEFAULT_HEALTH_MONITOR_CONFIG: HealthMonitorConfig = {
	checkIntervalMs: 10000,
	pingTimeoutMs: 5000,
	unresponsiveThresholdMs: 30000,
	failureThreshold: 3,
	recoveryThreshold: 2,
	autoRestart: true,
	maxRestartAttempts: 3,
	restartCooldownMs: 10000,
}

/**
 * Health event types
 */
export type HealthEventType =
	| "health_check_completed"
	| "agent_unhealthy"
	| "agent_recovering"
	| "agent_healthy"
	| "agent_restart_attempt"
	| "agent_restart_success"
	| "agent_restart_failed"
	| "agent_max_restarts_reached"

/**
 * Health event
 */
export interface HealthEvent {
	/** Event type */
	type: HealthEventType

	/** Agent ID */
	agentId: string

	/** Timestamp */
	timestamp: number

	/** Health check result (for health_check_completed events) */
	result?: HealthCheckResult

	/** Restart attempt number (for restart events) */
	restartAttempt?: number

	/** Error message (for error events) */
	error?: string
}

/**
 * Health statistics for the agent pool
 */
export interface HealthStatistics {
	/** Total number of agents */
	totalAgents: number

	/** Number of healthy agents */
	healthyAgents: number

	/** Number of unhealthy agents */
	unhealthyAgents: number

	/** Number of agents in unknown state */
	unknownAgents: number

	/** Number of recovering agents */
	recoveringAgents: number

	/** Total health checks performed */
	totalChecks: number

	/** Total restarts performed */
	totalRestarts: number

	/** Average response time in milliseconds */
	averageResponseTimeMs: number

	/** Last health check timestamp */
	lastCheckTimestamp: number
}

/**
 * Agent health state tracked by the monitor
 */
export interface AgentHealthState {
	/** Agent ID */
	agentId: string

	/** Current health status */
	status: HealthStatus

	/** Number of consecutive failed health checks */
	consecutiveFailures: number

	/** Number of consecutive successful health checks */
	consecutiveSuccesses: number

	/** Number of restart attempts */
	restartAttempts: number

	/** Last restart attempt timestamp */
	lastRestartAttempt: number

	/** Last health check result */
	lastCheckResult?: HealthCheckResult

	/** Timestamp when agent was first marked unhealthy */
	unhealthySince?: number

	/** Timestamp when agent started recovering */
	recoveringSince?: number
}

/**
 * Health check handler interface
 */
export interface HealthCheckHandler {
	/** Send a ping to the agent */
	sendPing(agentId: string): Promise<void>

	/** Check if agent responded to ping */
	checkPong(agentId: string, timeoutMs: number): Promise<boolean>

	/** Get agent's last activity timestamp */
	getLastActivity(agentId: string): number | undefined

	/** Restart an agent */
	restartAgent(agentId: string): Promise<boolean>
}

/**
 * Health monitor listener
 */
export type HealthMonitorListener = (event: HealthEvent) => void
