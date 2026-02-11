import { RuntimeProcessHandler } from "../RuntimeProcessHandler"
import { AgentInstance, AgentSpawnConfig } from "./types"
import { MessageRouter } from "./MessageRouter"
import { AgentRegistry } from "../AgentRegistry"

/**
 * AgentPoolManager - Spawns and manages multiple agent instances
 *
 * This class is responsible for:
 * - Spawning agent processes via RuntimeProcessHandler
 * - Tracking agent lifecycle (spawning, ready, busy, paused, stopped, error)
 * - Managing concurrent agent limits
 * - Health monitoring via periodic checks
 * - Cleanup on disposal
 */
export class AgentPoolManager {
	private agents: Map<string, AgentInstance> = new Map()
	private readonly maxConcurrentAgents: number
	private readonly processHandler: RuntimeProcessHandler
	private readonly registry: AgentRegistry
	private readonly messageRouter: MessageRouter
	private healthCheckInterval: ReturnType<typeof setInterval> | null = null
	private readonly healthCheckTimeoutMs: number = 30000 // 30 seconds

	constructor(
		processHandler: RuntimeProcessHandler,
		registry: AgentRegistry,
		messageRouter: MessageRouter,
		maxConcurrentAgents: number = 5,
	) {
		this.processHandler = processHandler
		this.registry = registry
		this.messageRouter = messageRouter
		this.maxConcurrentAgents = maxConcurrentAgents
		this.setupHealthMonitoring()
	}

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

		// Create agent configuration for RuntimeProcessHandler
		// This must match the AgentConfig interface in packages/agent-runtime/src/process.ts
		const agentConfig = {
			workspace: config.workspace,
			providerSettings: {}, // TODO: Get from ProviderSettingsManager
			mode: config.mode,
			autoApprove: config.autoApprove ?? false,
			sessionId: config.sessionId,
			customModes: config.customModes,
		}

		// Spawn process via RuntimeProcessHandler
		await this.processHandler.spawnProcess(
			"", // cliPath ignored for RuntimeProcessHandler
			config.workspace,
			config.task || "",
			agentConfig,
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
		}

		this.agents.set(config.agentId, instance)

		return config.agentId
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
		return Array.from(this.agents.values()).filter(
			(a) => a.status === "ready" || a.status === "busy",
		)
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
		// TODO: Implement IPC message sending
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
		// TODO: Implement IPC message sending
		agent.status = "ready"
		agent.lastActivityAt = Date.now()
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

		// Send terminate message via IPC
		// TODO: Implement IPC message sending
		agent.status = "stopped"
		agent.lastActivityAt = Date.now()
	}

	/**
	 * Dispose of the pool manager and clean up resources
	 */
	dispose(): void {
		if (this.healthCheckInterval) {
			clearInterval(this.healthCheckInterval)
			this.healthCheckInterval = null
		}

		// Terminate all active agents
		for (const [agentId, agent] of this.agents) {
			if (agent.status === "ready" || agent.status === "busy" || agent.status === "paused") {
				// Fire and forget - we don't want to block cleanup
				this.terminateAgent(agentId).catch((err) => {
					console.error(`Failed to terminate agent ${agentId} during cleanup:`, err)
				})
			}
		}

		this.agents.clear()
	}

	/**
	 * Handle events from agent processes
	 */
	private handleAgentEvent(agentId: string, sessionId: string, event: any): void {
		const agent = this.agents.get(agentId)
		if (!agent) return

		agent.lastActivityAt = Date.now()

		switch (event.type) {
			case "session_created":
				agent.status = "ready"
				agent.sessionId = sessionId
				break
			case "complete":
				agent.status = "ready"
				break
			case "error":
				agent.status = "error"
				agent.error = event.error?.message || "Unknown error"
				break
			case "exit":
				agent.status = "stopped"
				break
		}
	}

	/**
	 * Setup health monitoring to detect unresponsive agents
	 */
	private setupHealthMonitoring(): void {
		this.healthCheckInterval = setInterval(() => {
			const now = Date.now()

			for (const [agentId, agent] of this.agents) {
				// Skip agents that are already stopped or in error state
				if (agent.status === "stopped" || agent.status === "error") {
					continue
				}

				// Check if agent hasn't been active recently
				const inactiveTime = now - agent.lastActivityAt
				if (inactiveTime > this.healthCheckTimeoutMs) {
					console.warn(`Agent ${agentId} appears unresponsive (inactive for ${inactiveTime}ms)`)

					// Mark as error if unresponsive
					if (agent.status !== "spawning") {
						agent.status = "error"
						agent.error = `Unresponsive for ${inactiveTime}ms`
					}
				}
			}
		}, 10000) // Check every 10 seconds
	}
}
