import { RuntimeProcessHandler } from "../RuntimeProcessHandler"
import { AgentInstance, AgentSpawnConfig } from "./types"
import { MessageRouter } from "./MessageRouter"
import { AgentRegistry } from "../AgentRegistry"
import { FileLockingService } from "../../../../services/kilocode/file-locking"
import {
	AgentHealthMonitor,
	type HealthCheckHandler,
	type HealthMonitorConfig,
	type HealthEvent,
	type HealthStatus,
} from "../../../../services/kilocode/health-monitoring"
import type { ModeConfig } from "@roo-code/types"
import type { OrchestrationConfigService } from "../../../../services/kilocode/OrchestrationConfigService"
import type { ProviderSettingsWithId } from "@roo-code/types"
import type { StreamEvent, ErrorStreamEvent } from "../CliOutputParser"

/**
 * AgentPoolManager - Spawns and manages multiple agent instances
 *
 * This class is responsible for:
 * - Spawning agent processes via RuntimeProcessHandler
 * - Tracking agent lifecycle (spawning, ready, busy, paused, stopped, error)
 * - Managing concurrent agent limits
 * - Health monitoring via AgentHealthMonitor
 * - File lock management for agents
 * - Cleanup on disposal
 */
export class AgentPoolManager implements HealthCheckHandler {
	private agents: Map<string, AgentInstance> = new Map()
	private readonly maxConcurrentAgents: number
	private readonly processHandler: RuntimeProcessHandler
	private readonly registry: AgentRegistry
	private readonly messageRouter: MessageRouter
	private readonly fileLockingService: FileLockingService
	private readonly orchestrationConfigService: OrchestrationConfigService | null
	private readonly providerSettingsManager: {
		getProfile: (params: { id: string }) => Promise<ProviderSettingsWithId & { name: string }>
	} | null
	private healthMonitor: AgentHealthMonitor | null = null
	private agentConfigs: Map<string, AgentSpawnConfig> = new Map() // Store configs for restart
	private healthMonitorListeners: ((event: HealthEvent) => void)[] = []

	constructor(
		processHandler: RuntimeProcessHandler,
		registry: AgentRegistry,
		messageRouter: MessageRouter,
		fileLockingService: FileLockingService,
		options?: {
			orchestrationConfigService?: OrchestrationConfigService
			providerSettingsManager?: {
				getProfile: (params: { id: string }) => Promise<ProviderSettingsWithId & { name: string }>
			}
			maxConcurrentAgents?: number
			healthMonitorConfig?: Partial<HealthMonitorConfig>
			enableHealthMonitor?: boolean
		},
	) {
		this.processHandler = processHandler
		this.registry = registry
		this.messageRouter = messageRouter
		this.fileLockingService = fileLockingService
		this.orchestrationConfigService = options?.orchestrationConfigService ?? null
		this.providerSettingsManager = options?.providerSettingsManager ?? null
		this.maxConcurrentAgents = options?.maxConcurrentAgents ?? 5

		// Initialize health monitor (enabled by default)
		if (options?.enableHealthMonitor !== false) {
			this.healthMonitor = new AgentHealthMonitor(this, options?.healthMonitorConfig)
			this.setupHealthMonitorListeners()
			this.healthMonitor.start()
		}
	}

	// ============================================================================
	// HealthCheckHandler Interface Implementation
	// ============================================================================

	/**
	 * Send a ping to an agent via IPC
	 * @param agentId - Agent ID to ping
	 */
	async sendPing(agentId: string): Promise<void> {
		const agent = this.agents.get(agentId)
		if (!agent || !agent.sessionId) {
			throw new Error(`Agent ${agentId} not found or has no session`)
		}

		// Send ping via RuntimeProcessHandler
		await this.processHandler.sendMessage(agent.sessionId, {
			type: "ping",
			timestamp: Date.now(),
		})
	}

	/**
	 * Check if agent responded to ping (handled by handlePong)
	 * This is managed by the health monitor's internal state
	 * @param agentId - Agent ID to check
	 * @param timeoutMs - Timeout in milliseconds
	 */
	async checkPong(agentId: string, timeoutMs: number): Promise<boolean> {
		// This is handled internally by the health monitor via handlePong
		// The health monitor sets up its own promise-based waiting
		return true // Placeholder - actual check is done by health monitor
	}

	/**
	 * Get agent's last activity timestamp
	 * @param agentId - Agent ID
	 * @returns Last activity timestamp or undefined
	 */
	getLastActivity(agentId: string): number | undefined {
		return this.agents.get(agentId)?.lastActivityAt
	}

	/**
	 * Restart an agent
	 * @param agentId - Agent ID to restart
	 * @returns Whether restart was successful
	 */
	async restartAgent(agentId: string): Promise<boolean> {
		const agent = this.agents.get(agentId)
		const config = this.agentConfigs.get(agentId)

		if (!agent || !config) {
			return false
		}

		try {
			// Release all locks before restart
			this.fileLockingService.releaseAllLocksForAgent(agentId)

			// Terminate existing agent
			if (agent.sessionId) {
				await this.processHandler.sendMessage(agent.sessionId, {
					type: "shutdown",
				})
			}

			// Remove old agent from tracking
			this.agents.delete(agentId)
			if (this.healthMonitor) {
				this.healthMonitor.unregisterAgent(agentId)
			}

			// Generate new agent ID for restart
			const newAgentId = `${config.role}_${Date.now()}`
			const newConfig: AgentSpawnConfig = {
				...config,
				agentId: newAgentId,
			}

			// Spawn new agent
			await this.spawnAgent(newConfig)

			return true
		} catch (error) {
			console.error(`Failed to restart agent ${agentId}:`, error)
			return false
		}
	}

	// ============================================================================
	// Agent Management Methods
	// ============================================================================

	/**
	 * Spawn a new agent process
	 * @param config - Agent spawn configuration
	 * @returns Agent ID
	 * @throws Error if max concurrent agents reached
	 */
	async spawnAgent(config: AgentSpawnConfig): Promise<string> {
		if (this.getActiveAgentCount() >= this.maxConcurrentAgents) {
			throw new Error(`Maximum concurrent agents (${this.maxConcurrentAgents}) reached`)
		}

		// Check if agent already exists
		if (this.agents.has(config.agentId)) {
			throw new Error(`Agent with ID ${config.agentId} already exists`)
		}

		// Store config for potential restart
		this.agentConfigs.set(config.agentId, config)

		// Get provider settings from OrchestrationConfigService
		const providerSettings = await this.getProviderSettings(config.role, config.providerProfile)

		// Create agent configuration for RuntimeProcessHandler
		// This must match the AgentConfig interface in packages/agent-runtime/src/process.ts
		// Note: customModes is optional and should only be passed if properly typed
		const agentConfig: {
			workspace: string
			providerSettings: Record<string, unknown>
			mode: string
			autoApprove: boolean
			sessionId?: string
			customModes?: ModeConfig[]
		} = {
			workspace: config.workspace,
			providerSettings: providerSettings ?? {},
			mode: config.mode,
			autoApprove: config.autoApprove ?? false,
			sessionId: config.sessionId,
		}

		// Only add customModes if provided and properly typed
		if (config.customModes && config.customModes.length > 0) {
			agentConfig.customModes = config.customModes as ModeConfig[]
		}

		// Spawn process via RuntimeProcessHandler
		this.processHandler.spawnProcess(
			"", // cliPath ignored for RuntimeProcessHandler
			config.workspace,
			config.task || "",
			{
				...agentConfig,
				apiConfiguration: providerSettings as import("@roo-code/types").ProviderSettings,
			},
			(sessionId, event) => this.handleAgentEvent(config.agentId, sessionId, event),
		)

		// Create and track agent instance
		const instance: AgentInstance = {
			agentId: config.agentId,
			role: config.role,
			mode: config.mode,
			providerProfile: config.providerProfile,
			status: "spawning",
			spawnedAt: Date.now(),
			lastActivityAt: Date.now(),
			healthStatus: "unknown",
		}

		this.agents.set(config.agentId, instance)

		// Register with health monitor
		if (this.healthMonitor) {
			this.healthMonitor.registerAgent(config.agentId)
		}

		return config.agentId
	}

	/**
	 * Get provider settings for agent spawning
	 * Uses OrchestrationConfigService if available, otherwise falls back to direct profile
	 */
	private async getProviderSettings(
		role: string,
		providerProfileId?: string,
	): Promise<Record<string, unknown> | null> {
		// Try to get settings from OrchestrationConfigService first
		if (this.orchestrationConfigService && this.providerSettingsManager) {
			const settings = await this.orchestrationConfigService.getProviderSettingsForRole(
				role,
				this.providerSettingsManager,
			)
			return settings?.settings ?? null
		}

		// Fallback: return empty settings if no config service available
		return null
	}

	/**
	 * Get an agent instance by ID
	 */
	getAgent(agentId: string): AgentInstance | undefined {
		return this.agents.get(agentId)
	}

	/**
	 * Get all active agents (ready or busy status)
	 */
	getActiveAgents(): AgentInstance[] {
		return Array.from(this.agents.values()).filter((a) => a.status === "ready" || a.status === "busy")
	}

	/**
	 * Get count of active agents
	 */
	getActiveAgentCount(): number {
		return this.getActiveAgents().length
	}

	/**
	 * Get all agents (including stopped/error states)
	 */
	getAllAgents(): AgentInstance[] {
		return Array.from(this.agents.values())
	}

	/**
	 * Get agents by health status
	 * @param status - Health status to filter by
	 * @returns Array of agent instances
	 */
	getAgentsByHealthStatus(status: HealthStatus): AgentInstance[] {
		return Array.from(this.agents.values()).filter((a) => a.healthStatus === status)
	}

	/**
	 * Pause an agent
	 * @param agentId - Agent ID to pause
	 */
	async pauseAgent(agentId: string): Promise<void> {
		const agent = this.agents.get(agentId)
		if (!agent) {
			throw new Error(`Agent ${agentId} not found`)
		}

		if (agent.status !== "ready" && agent.status !== "busy") {
			throw new Error(`Cannot pause agent in ${agent.status} state`)
		}

		// Send pause message via IPC
		if (agent.sessionId) {
			await this.processHandler.sendMessage(agent.sessionId, {
				type: "pause",
			})
		}

		agent.status = "paused"
		agent.lastActivityAt = Date.now()
	}

	/**
	 * Resume a paused agent
	 * @param agentId - Agent ID to resume
	 */
	async resumeAgent(agentId: string): Promise<void> {
		const agent = this.agents.get(agentId)
		if (!agent) {
			throw new Error(`Agent ${agentId} not found`)
		}

		if (agent.status !== "paused") {
			throw new Error(`Cannot resume agent in ${agent.status} state`)
		}

		// Send resume message via IPC
		if (agent.sessionId) {
			await this.processHandler.sendMessage(agent.sessionId, {
				type: "resume",
			})
		}

		agent.status = "ready"
		agent.lastActivityAt = Date.now()

		// Notify health monitor of activity
		if (this.healthMonitor) {
			this.healthMonitor.reportActivity(agentId)
		}
	}

	/**
	 * Terminate an agent
	 * @param agentId - Agent ID to terminate
	 */
	async terminateAgent(agentId: string): Promise<void> {
		const agent = this.agents.get(agentId)
		if (!agent) {
			throw new Error(`Agent ${agentId} not found`)
		}

		// Release all file locks held by this agent
		const releasedCount = this.fileLockingService.releaseAllLocksForAgent(agentId)
		if (releasedCount > 0) {
			console.log(`Released ${releasedCount} file locks for agent ${agentId}`)
		}

		// Send terminate message via IPC
		if (agent.sessionId) {
			await this.processHandler.sendMessage(agent.sessionId, {
				type: "shutdown",
			})
		}

		agent.status = "stopped"
		agent.lastActivityAt = Date.now()

		// Unregister from health monitor
		if (this.healthMonitor) {
			this.healthMonitor.unregisterAgent(agentId)
		}
	}

	/**
	 * Handle pong response from agent
	 * @param agentId - Agent ID that responded
	 */
	handlePongResponse(agentId: string): void {
		if (this.healthMonitor) {
			this.healthMonitor.handlePong(agentId)
		}

		// Update agent activity
		const agent = this.agents.get(agentId)
		if (agent) {
			agent.lastActivityAt = Date.now()
		}
	}

	/**
	 * Add a health event listener
	 * @param listener - Listener function
	 */
	addHealthListener(listener: (event: HealthEvent) => void): void {
		this.healthMonitorListeners.push(listener)
	}

	/**
	 * Remove a health event listener
	 * @param listener - Listener function
	 */
	removeHealthListener(listener: (event: HealthEvent) => void): void {
		const index = this.healthMonitorListeners.indexOf(listener)
		if (index !== -1) {
			this.healthMonitorListeners.splice(index, 1)
		}
	}

	/**
	 * Get health statistics
	 * @returns Health statistics or null if health monitoring is disabled
	 */
	getHealthStatistics() {
		return this.healthMonitor?.getStatistics() ?? null
	}

	/**
	 * Dispose of the pool manager and clean up resources
	 */
	dispose(): void {
		// Stop health monitor
		if (this.healthMonitor) {
			this.healthMonitor.stop()
			this.healthMonitor.dispose()
			this.healthMonitor = null
		}

		// Terminate all active agents and release their locks
		for (const [agentId, agent] of this.agents) {
			if (agent.status === "ready" || agent.status === "busy" || agent.status === "paused") {
				// Release all locks for this agent
				this.fileLockingService.releaseAllLocksForAgent(agentId)

				// Fire and forget - we don't want to block cleanup
				this.terminateAgent(agentId).catch((err) => {
					console.error(`Failed to terminate agent ${agentId} during cleanup:`, err)
				})
			}
			// Set status to stopped instead of removing
			agent.status = "stopped"
		}

		this.agentConfigs.clear()
		this.healthMonitorListeners = []
	}

	/**
	 * Acquire a file lock for an agent
	 * @param agentId - Agent ID requesting the lock
	 * @param filePath - File path to lock
	 * @param mode - Lock mode (read or write)
	 * @param timeoutMs - Lock timeout in milliseconds
	 * @returns Lock acquisition result
	 */
	async acquireFileLock(agentId: string, filePath: string, mode: "read" | "write" = "write", timeoutMs?: number) {
		const agent = this.agents.get(agentId)
		if (!agent) {
			throw new Error(`Agent ${agentId} not found`)
		}

		return this.fileLockingService.acquireLock({
			filePath,
			agentId,
			mode,
			timeoutMs,
			description: `Lock acquired by agent ${agentId} (${agent.role})`,
		})
	}

	/**
	 * Release a specific file lock
	 * @param lockId - Lock ID to release
	 * @returns Whether the lock was released
	 */
	releaseFileLock(lockId: string): boolean {
		return this.fileLockingService.releaseLock(lockId)
	}

	/**
	 * Get all file locks held by an agent
	 * @param agentId - Agent ID
	 * @returns Array of file locks
	 */
	getAgentFileLocks(agentId: string) {
		return this.fileLockingService.getLocksForAgent(agentId)
	}

	/**
	 * Check if an agent holds any file locks
	 * @param agentId - Agent ID
	 * @returns Whether the agent has any locks
	 */
	agentHasFileLocks(agentId: string): boolean {
		return this.fileLockingService.agentHasLocks(agentId)
	}

	/**
	 * Handle events from agent processes
	 */
	private handleAgentEvent(agentId: string, sessionId: string, event: StreamEvent): void {
		const agent = this.agents.get(agentId)
		if (!agent) return

		agent.lastActivityAt = Date.now()

		// Notify health monitor of activity
		if (this.healthMonitor) {
			this.healthMonitor.reportActivity(agentId)
		}

		switch (event.streamEventType) {
			case "session_created":
				agent.status = "ready"
				agent.sessionId = sessionId
				agent.healthStatus = "healthy"
				break
			case "complete":
				agent.status = "ready"
				break
			case "error":
				agent.status = "error"
				agent.error = (event as ErrorStreamEvent).error || "Unknown error"
				agent.healthStatus = "unhealthy"
				// Release all locks when agent errors
				this.fileLockingService.releaseAllLocksForAgent(agentId)
				break
			case "interrupted":
				agent.status = "stopped"
				// Release all locks when agent exits
				this.fileLockingService.releaseAllLocksForAgent(agentId)
				break
		}
	}

	/**
	 * Setup health monitor event listeners
	 */
	private setupHealthMonitorListeners(): void {
		if (!this.healthMonitor) return

		this.healthMonitor.addListener((event: HealthEvent) => {
			// Update agent health status
			const agent = this.agents.get(event.agentId)
			if (agent) {
				switch (event.type) {
					case "agent_healthy":
						agent.healthStatus = "healthy"
						agent.consecutiveFailures = 0
						break
					case "agent_unhealthy":
						agent.healthStatus = "unhealthy"
						break
					case "agent_recovering":
						agent.healthStatus = "recovering"
						break
					case "health_check_completed":
						if (event.result) {
							agent.lastHealthCheck = event.result.timestamp
							agent.consecutiveFailures = event.result.consecutiveFailures
						}
						break
					case "agent_restart_success":
						agent.healthStatus = "recovering"
						agent.restartAttempts = (agent.restartAttempts ?? 0) + 1
						break
					case "agent_restart_failed":
						agent.restartAttempts = (agent.restartAttempts ?? 0) + 1
						break
				}
			}

			// Forward to external listeners
			for (const listener of this.healthMonitorListeners) {
				try {
					listener(event)
				} catch (error) {
					console.error("Health event listener error:", error)
				}
			}
		})
	}
}
