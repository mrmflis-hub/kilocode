// kilocode_change - new file

import {
	HealthStatus,
	HealthCheckResult,
	HealthMonitorConfig,
	DEFAULT_HEALTH_MONITOR_CONFIG,
	HealthEvent,
	HealthEventType,
	HealthStatistics,
	AgentHealthState,
	HealthCheckHandler,
	HealthMonitorListener,
} from "./types"

/**
 * AgentHealthMonitor - Monitors agent health and handles automatic recovery
 *
 * This class is responsible for:
 * - Periodic health checks via ping/pong mechanism
 * - Detecting unresponsive agents
 * - Automatic restart of failed agents
 * - Health event notifications
 * - Health statistics tracking
 */
export class AgentHealthMonitor {
	private config: HealthMonitorConfig
	private handler: HealthCheckHandler
	private agentStates: Map<string, AgentHealthState> = new Map()
	private listeners: Set<HealthMonitorListener> = new Set()
	private checkInterval: ReturnType<typeof setInterval> | null = null
	private pendingPongs: Map<
		string,
		{ resolve: (responded: boolean) => void; timeout: ReturnType<typeof setTimeout> }
	> = new Map()
	private statistics: HealthStatistics = {
		totalAgents: 0,
		healthyAgents: 0,
		unhealthyAgents: 0,
		unknownAgents: 0,
		recoveringAgents: 0,
		totalChecks: 0,
		totalRestarts: 0,
		averageResponseTimeMs: 0,
		lastCheckTimestamp: 0,
	}
	private responseTimes: number[] = []
	private readonly maxResponseTimeSamples = 100

	constructor(handler: HealthCheckHandler, config?: Partial<HealthMonitorConfig>) {
		this.handler = handler
		this.config = { ...DEFAULT_HEALTH_MONITOR_CONFIG, ...config }
	}

	/**
	 * Start health monitoring
	 */
	start(): void {
		if (this.checkInterval) {
			return
		}

		this.checkInterval = setInterval(() => {
			this.performHealthChecks().catch((error) => {
				console.error("Health check error:", error)
			})
		}, this.config.checkIntervalMs)
	}

	/**
	 * Stop health monitoring
	 */
	stop(): void {
		if (this.checkInterval) {
			clearInterval(this.checkInterval)
			this.checkInterval = null
		}

		// Clear pending pongs
		for (const [agentId, { resolve, timeout }] of this.pendingPongs) {
			clearTimeout(timeout)
			resolve(false)
		}
		this.pendingPongs.clear()
	}

	/**
	 * Register an agent for health monitoring
	 * @param agentId - Agent ID to register
	 */
	registerAgent(agentId: string): void {
		if (!this.agentStates.has(agentId)) {
			this.agentStates.set(agentId, {
				agentId,
				status: "unknown",
				consecutiveFailures: 0,
				consecutiveSuccesses: 0,
				restartAttempts: 0,
				lastRestartAttempt: 0,
			})
			this.updateStatistics()
		}
	}

	/**
	 * Unregister an agent from health monitoring
	 * @param agentId - Agent ID to unregister
	 */
	unregisterAgent(agentId: string): void {
		this.agentStates.delete(agentId)
		this.pendingPongs.delete(agentId)
		this.updateStatistics()
	}

	/**
	 * Get health state for an agent
	 * @param agentId - Agent ID
	 * @returns Agent health state or undefined
	 */
	getAgentHealthState(agentId: string): AgentHealthState | undefined {
		return this.agentStates.get(agentId)
	}

	/**
	 * Get health status for an agent
	 * @param agentId - Agent ID
	 * @returns Health status or "unknown"
	 */
	getAgentHealthStatus(agentId: string): HealthStatus {
		return this.agentStates.get(agentId)?.status ?? "unknown"
	}

	/**
	 * Get all agents with a specific health status
	 * @param status - Health status to filter by
	 * @returns Array of agent IDs
	 */
	getAgentsByHealthStatus(status: HealthStatus): string[] {
		return Array.from(this.agentStates.values())
			.filter((state) => state.status === status)
			.map((state) => state.agentId)
	}

	/**
	 * Get current health statistics
	 * @returns Health statistics
	 */
	getStatistics(): HealthStatistics {
		return { ...this.statistics }
	}

	/**
	 * Add a health event listener
	 * @param listener - Listener function
	 */
	addListener(listener: HealthMonitorListener): void {
		this.listeners.add(listener)
	}

	/**
	 * Remove a health event listener
	 * @param listener - Listener function
	 */
	removeListener(listener: HealthMonitorListener): void {
		this.listeners.delete(listener)
	}

	/**
	 * Perform a manual health check on a specific agent
	 * @param agentId - Agent ID to check
	 * @returns Health check result
	 */
	async checkAgentHealth(agentId: string): Promise<HealthCheckResult> {
		const state = this.agentStates.get(agentId)
		if (!state) {
			return {
				agentId,
				status: "unknown",
				timestamp: Date.now(),
				inactiveTimeMs: 0,
				respondedToPing: false,
				error: "Agent not registered",
				consecutiveFailures: 0,
			}
		}

		return this.performHealthCheck(agentId, state)
	}

	/**
	 * Mark an agent as having activity (reset inactive timer)
	 * @param agentId - Agent ID
	 */
	reportActivity(agentId: string): void {
		const state = this.agentStates.get(agentId)
		if (state && state.status === "unhealthy") {
			// Agent was unhealthy but now has activity - start recovery
			state.status = "recovering"
			state.recoveringSince = Date.now()
			state.consecutiveSuccesses = 1
			this.emitEvent({
				type: "agent_recovering",
				agentId,
				timestamp: Date.now(),
			})
		}
	}

	/**
	 * Handle pong response from agent
	 * @param agentId - Agent ID that responded
	 */
	handlePong(agentId: string): void {
		const pending = this.pendingPongs.get(agentId)
		if (pending) {
			clearTimeout(pending.timeout)
			pending.resolve(true)
			this.pendingPongs.delete(agentId)
		}
	}

	/**
	 * Dispose of the health monitor
	 */
	dispose(): void {
		this.stop()
		this.listeners.clear()
		this.agentStates.clear()
		this.responseTimes = []
		// Reset statistics
		this.statistics = {
			totalAgents: 0,
			healthyAgents: 0,
			unhealthyAgents: 0,
			unknownAgents: 0,
			recoveringAgents: 0,
			totalChecks: 0,
			totalRestarts: 0,
			averageResponseTimeMs: 0,
			lastCheckTimestamp: 0,
		}
	}

	/**
	 * Perform health checks on all registered agents
	 */
	private async performHealthChecks(): Promise<void> {
		const checkPromises: Promise<HealthCheckResult>[] = []

		for (const [agentId, state] of this.agentStates) {
			checkPromises.push(this.performHealthCheck(agentId, state))
		}

		const results = await Promise.allSettled(checkPromises)

		// Process results
		for (const result of results) {
			if (result.status === "fulfilled") {
				this.processHealthCheckResult(result.value)
			}
		}

		this.statistics.lastCheckTimestamp = Date.now()
		this.statistics.totalChecks++
		this.updateStatistics()
	}

	/**
	 * Perform health check on a single agent
	 */
	private async performHealthCheck(agentId: string, state: AgentHealthState): Promise<HealthCheckResult> {
		const now = Date.now()
		const lastActivity = this.handler.getLastActivity(agentId) ?? state.lastCheckResult?.timestamp ?? now
		const inactiveTimeMs = now - lastActivity

		// Check if agent is beyond unresponsive threshold
		if (inactiveTimeMs > this.config.unresponsiveThresholdMs) {
			// Agent is unresponsive - try ping
			const pingResult = await this.sendPingAndWait(agentId)

			const result: HealthCheckResult = {
				agentId,
				status: pingResult.responded ? "healthy" : "unhealthy",
				timestamp: now,
				inactiveTimeMs,
				respondedToPing: pingResult.responded,
				responseTimeMs: pingResult.responseTimeMs,
				consecutiveFailures: pingResult.responded ? 0 : state.consecutiveFailures + 1,
			}

			if (!pingResult.responded) {
				result.error = `Agent unresponsive for ${inactiveTimeMs}ms`
			}

			return result
		}

		// Agent has recent activity - consider healthy
		return {
			agentId,
			status: "healthy",
			timestamp: now,
			inactiveTimeMs,
			respondedToPing: true, // Activity counts as response
			consecutiveFailures: 0,
		}
	}

	/**
	 * Send ping and wait for pong response
	 */
	private async sendPingAndWait(agentId: string): Promise<{ responded: boolean; responseTimeMs?: number }> {
		const startTime = Date.now()

		// Create promise that resolves when pong is received
		const pongPromise = new Promise<boolean>((resolve) => {
			const timeout = setTimeout(() => {
				this.pendingPongs.delete(agentId)
				resolve(false)
			}, this.config.pingTimeoutMs)

			this.pendingPongs.set(agentId, { resolve, timeout })
		})

		// Send ping
		try {
			await this.handler.sendPing(agentId)
		} catch (error) {
			this.pendingPongs.delete(agentId)
			return { responded: false }
		}

		// Wait for pong
		const responded = await pongPromise
		const responseTimeMs = Date.now() - startTime

		if (responded) {
			this.recordResponseTime(responseTimeMs)
		}

		return { responded, responseTimeMs: responded ? responseTimeMs : undefined }
	}

	/**
	 * Process health check result and update state
	 */
	private processHealthCheckResult(result: HealthCheckResult): void {
		const state = this.agentStates.get(result.agentId)
		if (!state) return

		const previousStatus = state.status
		state.lastCheckResult = result

		if (result.status === "healthy") {
			state.consecutiveFailures = 0
			state.consecutiveSuccesses++

			// Check if recovering agent should be marked healthy
			if (state.status === "recovering" && state.consecutiveSuccesses >= this.config.recoveryThreshold) {
				state.status = "healthy"
				state.unhealthySince = undefined
				state.recoveringSince = undefined
				this.emitEvent({
					type: "agent_healthy",
					agentId: result.agentId,
					timestamp: Date.now(),
					result,
				})
			} else if (state.status === "unknown" || state.status === "unhealthy") {
				state.status = "healthy"
				state.unhealthySince = undefined
				this.emitEvent({
					type: "agent_healthy",
					agentId: result.agentId,
					timestamp: Date.now(),
					result,
				})
			}
		} else if (result.status === "unhealthy") {
			state.consecutiveSuccesses = 0
			state.consecutiveFailures++

			// Check if we should mark as unhealthy
			if (state.consecutiveFailures >= this.config.failureThreshold) {
				const wasUnhealthy = state.status === "unhealthy"

				if (state.status !== "unhealthy") {
					state.status = "unhealthy"
					state.unhealthySince = Date.now()
					this.emitEvent({
						type: "agent_unhealthy",
						agentId: result.agentId,
						timestamp: Date.now(),
						result,
					})
				}

				// Attempt automatic restart if enabled (on each check while unhealthy)
				if (this.config.autoRestart) {
					this.attemptRestart(result.agentId, state).catch((error) => {
						console.error(`Restart failed for agent ${result.agentId}:`, error)
					})
				}
			}
		}

		// Emit health check completed event
		this.emitEvent({
			type: "health_check_completed",
			agentId: result.agentId,
			timestamp: Date.now(),
			result,
		})
	}

	/**
	 * Attempt to restart an unhealthy agent
	 */
	private async attemptRestart(agentId: string, state: AgentHealthState): Promise<boolean> {
		const now = Date.now()

		// Check cooldown
		if (now - state.lastRestartAttempt < this.config.restartCooldownMs) {
			return false
		}

		// Check max attempts
		if (state.restartAttempts >= this.config.maxRestartAttempts) {
			this.emitEvent({
				type: "agent_max_restarts_reached",
				agentId,
				timestamp: now,
				error: `Maximum restart attempts (${this.config.maxRestartAttempts}) reached`,
			})
			return false
		}

		state.restartAttempts++
		state.lastRestartAttempt = now

		this.emitEvent({
			type: "agent_restart_attempt",
			agentId,
			timestamp: now,
			restartAttempt: state.restartAttempts,
		})

		try {
			const success = await this.handler.restartAgent(agentId)

			if (success) {
				state.status = "recovering"
				state.recoveringSince = Date.now()
				state.consecutiveFailures = 0
				state.consecutiveSuccesses = 0
				this.statistics.totalRestarts++

				this.emitEvent({
					type: "agent_restart_success",
					agentId,
					timestamp: Date.now(),
					restartAttempt: state.restartAttempts,
				})

				return true
			} else {
				this.emitEvent({
					type: "agent_restart_failed",
					agentId,
					timestamp: Date.now(),
					restartAttempt: state.restartAttempts,
					error: "Restart handler returned false",
				})

				return false
			}
		} catch (error) {
			this.emitEvent({
				type: "agent_restart_failed",
				agentId,
				timestamp: Date.now(),
				restartAttempt: state.restartAttempts,
				error: error instanceof Error ? error.message : String(error),
			})

			return false
		}
	}

	/**
	 * Record response time for statistics
	 */
	private recordResponseTime(responseTimeMs: number): void {
		this.responseTimes.push(responseTimeMs)
		if (this.responseTimes.length > this.maxResponseTimeSamples) {
			this.responseTimes.shift()
		}
	}

	/**
	 * Update statistics
	 */
	private updateStatistics(): void {
		let healthy = 0
		let unhealthy = 0
		let unknown = 0
		let recovering = 0

		for (const state of this.agentStates.values()) {
			switch (state.status) {
				case "healthy":
					healthy++
					break
				case "unhealthy":
					unhealthy++
					break
				case "unknown":
					unknown++
					break
				case "recovering":
					recovering++
					break
			}
		}

		this.statistics.totalAgents = this.agentStates.size
		this.statistics.healthyAgents = healthy
		this.statistics.unhealthyAgents = unhealthy
		this.statistics.unknownAgents = unknown
		this.statistics.recoveringAgents = recovering

		// Calculate average response time
		if (this.responseTimes.length > 0) {
			this.statistics.averageResponseTimeMs =
				this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length
		}
	}

	/**
	 * Emit an event to all listeners
	 */
	private emitEvent(event: HealthEvent): void {
		for (const listener of this.listeners) {
			try {
				listener(event)
			} catch (error) {
				console.error("Health event listener error:", error)
			}
		}
	}
}
