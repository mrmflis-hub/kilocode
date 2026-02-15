// kilocode_change - new file

/**
 * Context Integration Layer
 *
 * This module integrates ContextWindowMonitor with OrchestratorAgent,
 * providing automatic context management for the orchestrator's minimal context.
 *
 * Key Features:
 * - Automatic context tracking for orchestrator context changes
 * - Auto-compression when usage thresholds are reached
 * - Auto-archival of old artifact summaries
 * - Event forwarding to orchestrator
 */

import { EventEmitter } from "events"
import {
	ContextWindowMonitor,
	ContextStatistics,
	ContextEvent,
	ContextEventType,
	CompressionStrategy,
	CONTEXT_PRIORITY,
	ContextItemType,
} from "../../../../services/kilocode/context-monitoring"
import type { OrganiserContext, OrchestratorArtifactSummaryReference } from "./OrchestratorAgent"

/**
 * Context integration configuration
 */
export interface ContextIntegrationConfig {
	/** Maximum tokens for context window */
	maxTokens?: number

	/** Enable automatic compression */
	autoCompress?: boolean

	/** Enable automatic archival */
	autoArchive?: boolean

	/** Warning threshold percentage */
	warningThreshold?: number

	/** High threshold percentage */
	highThreshold?: number

	/** Critical threshold percentage */
	criticalThreshold?: number
}

/**
 * Context integration events
 */
export type ContextIntegrationEventType =
	| "context_warning"
	| "context_critical"
	| "context_compressed"
	| "context_archived"
	| "context_limit_exceeded"

/**
 * Context integration event payload
 */
export interface ContextIntegrationEvent {
	type: ContextIntegrationEventType
	statistics: ContextStatistics
	action?: "compress" | "archive"
	result?: {
		tokensSaved: number
		itemsAffected: number
	}
}

/**
 * ContextIntegration - Integrates ContextWindowMonitor with OrchestratorAgent
 *
 * This class provides:
 * - Automatic context tracking for orchestrator context changes
 * - Auto-compression when usage thresholds are reached
 * - Auto-archival of old artifact summaries
 * - Event forwarding to orchestrator
 */
export class ContextIntegration extends EventEmitter {
	private readonly monitor: ContextWindowMonitor
	private readonly config: ContextIntegrationConfig
	private disposed = false

	// Item ID mappings for tracking
	private readonly contextItemIds: Map<string, string> = new Map()

	constructor(config?: ContextIntegrationConfig) {
		super()
		this.config = config ?? {}

		// Create the monitor with config
		this.monitor = new ContextWindowMonitor({
			maxTokens: config?.maxTokens,
			autoCompress: config?.autoCompress ?? true,
			autoArchive: config?.autoArchive ?? true,
			warningThreshold: config?.warningThreshold,
			highThreshold: config?.highThreshold,
			criticalThreshold: config?.criticalThreshold,
		})

		// Subscribe to monitor events
		this.setupMonitorListeners()
	}

	/**
	 * Initialize context from an existing OrganiserContext
	 * @param context - The orchestrator context to track
	 */
	initializeFromContext(context: OrganiserContext): void {
		// Clear existing items
		this.monitor.clear()
		this.contextItemIds.clear()

		// Add user task (critical priority, not compressible or archivable)
		if (context.userTask) {
			const id = this.monitor.addItem({
				type: "user_task",
				tokenCount: this.monitor.estimateTokens(context.userTask),
				priority: CONTEXT_PRIORITY.CRITICAL,
				compressible: false,
				archivable: false,
			})
			this.contextItemIds.set("user_task", id)
		}

		// Add workflow state (critical priority)
		if (context.workflowState) {
			const id = this.monitor.addItem({
				type: "workflow_state",
				tokenCount: this.monitor.estimateTokens(context.workflowState),
				priority: CONTEXT_PRIORITY.CRITICAL,
				compressible: false,
				archivable: false,
			})
			this.contextItemIds.set("workflow_state", id)
		}

		// Add artifact summaries
		for (const artifact of context.artifacts) {
			this.addArtifactSummary(artifact)
		}

		// Add agent statuses
		for (const [agentId, status] of context.agentStatuses) {
			this.addAgentStatus(agentId, status)
		}

		// Add workflow history
		for (const state of context.workflowHistory) {
			this.addWorkflowHistoryEntry(state)
		}

		// Add todo items
		for (const todo of context.todoList) {
			this.addTodoItem(todo)
		}
	}

	/**
	 * Add an artifact summary to tracking
	 * @param artifact - Artifact summary reference
	 * @returns Item ID
	 */
	addArtifactSummary(artifact: OrchestratorArtifactSummaryReference): string {
		const id = this.monitor.addItem({
			type: "artifact_summary",
			tokenCount: this.monitor.estimateObjectTokens(artifact),
			priority: CONTEXT_PRIORITY.NORMAL,
			compressible: true,
			archivable: true,
			referenceId: artifact.artifactId,
		})
		this.contextItemIds.set(`artifact_${artifact.artifactId}`, id)
		return id
	}

	/**
	 * Remove an artifact summary from tracking
	 * @param artifactId - Artifact ID to remove
	 */
	removeArtifactSummary(artifactId: string): void {
		const itemId = this.contextItemIds.get(`artifact_${artifactId}`)
		if (itemId) {
			this.monitor.removeItem(itemId)
			this.contextItemIds.delete(`artifact_${artifactId}`)
		}
	}

	/**
	 * Add an agent status to tracking
	 * @param agentId - Agent ID
	 * @param status - Agent status
	 * @returns Item ID
	 */
	addAgentStatus(agentId: string, status: string): string {
		const id = this.monitor.addItem({
			type: "agent_status",
			tokenCount: this.monitor.estimateTokens(`${agentId}:${status}`),
			priority: CONTEXT_PRIORITY.HIGH,
			compressible: false,
			archivable: true,
			referenceId: agentId,
		})
		this.contextItemIds.set(`agent_${agentId}`, id)
		return id
	}

	/**
	 * Update an agent status
	 * @param agentId - Agent ID
	 * @param status - New status
	 */
	updateAgentStatus(agentId: string, status: string): void {
		const itemId = this.contextItemIds.get(`agent_${agentId}`)
		if (itemId) {
			this.monitor.updateItemTokens(itemId, this.monitor.estimateTokens(`${agentId}:${status}`))
			this.monitor.touchItem(itemId)
		} else {
			this.addAgentStatus(agentId, status)
		}
	}

	/**
	 * Remove an agent status from tracking
	 * @param agentId - Agent ID to remove
	 */
	removeAgentStatus(agentId: string): void {
		const itemId = this.contextItemIds.get(`agent_${agentId}`)
		if (itemId) {
			this.monitor.removeItem(itemId)
			this.contextItemIds.delete(`agent_${agentId}`)
		}
	}

	/**
	 * Add a workflow history entry
	 * @param state - Workflow state
	 * @returns Item ID
	 */
	addWorkflowHistoryEntry(state: string): string {
		const id = this.monitor.addItem({
			type: "workflow_history",
			tokenCount: this.monitor.estimateTokens(state),
			priority: CONTEXT_PRIORITY.LOW,
			compressible: true,
			archivable: true,
		})
		this.contextItemIds.set(`history_${id}`, id)
		return id
	}

	/**
	 * Add a todo item to tracking
	 * @param todo - Todo item string
	 * @param priority - Priority (default: NORMAL)
	 * @returns Item ID
	 */
	addTodoItem(todo: string, priority: number = CONTEXT_PRIORITY.NORMAL): string {
		const id = this.monitor.addItem({
			type: "todo_item",
			tokenCount: this.monitor.estimateTokens(todo),
			priority,
			compressible: true,
			archivable: true,
		})
		this.contextItemIds.set(`todo_${id}`, id)
		return id
	}

	/**
	 * Update user task
	 * @param task - New user task
	 */
	updateUserTask(task: string): void {
		const itemId = this.contextItemIds.get("user_task")
		if (itemId) {
			this.monitor.updateItemTokens(itemId, this.monitor.estimateTokens(task))
		}
	}

	/**
	 * Update workflow state
	 * @param state - New workflow state
	 */
	updateWorkflowState(state: string): void {
		const itemId = this.contextItemIds.get("workflow_state")
		if (itemId) {
			this.monitor.updateItemTokens(itemId, this.monitor.estimateTokens(state))
		}
	}

	/**
	 * Get current context statistics
	 * @returns Context statistics
	 */
	getStatistics(): ContextStatistics {
		return this.monitor.getStatistics()
	}

	/**
	 * Get recommended action
	 */
	getRecommendedAction(): { type: "compress" | "archive" | "none"; strategy?: CompressionStrategy } {
		const stats = this.getStatistics()

		if (stats.usageLevel === "critical") {
			return { type: "archive", strategy: "aggressive" }
		}

		if (stats.usageLevel === "high") {
			return { type: "compress", strategy: "moderate" }
		}

		if (stats.usageLevel === "elevated") {
			return { type: "compress", strategy: "light" }
		}

		return { type: "none" }
	}

	/**
	 * Manually trigger compression
	 * @param strategy - Compression strategy to use
	 */
	async compress(strategy: CompressionStrategy): Promise<void> {
		const result = await this.monitor.compress(strategy)

		if (result.performed) {
			this.emit("context_compressed", {
				type: "context_compressed",
				statistics: this.getStatistics(),
				action: "compress",
				result: {
					tokensSaved: result.tokensSaved,
					itemsAffected: result.itemsCompressed + result.itemsRemoved,
				},
			} as ContextIntegrationEvent)
		}
	}

	/**
	 * Manually trigger archival
	 * @param options - Archival options
	 */
	async archive(options?: {
		maxItems?: number
		olderThan?: number
		keepMinPerType?: number
		belowPriority?: number
	}): Promise<void> {
		const result = await this.monitor.archive(options)

		if (result.performed) {
			this.emit("context_archived", {
				type: "context_archived",
				statistics: this.getStatistics(),
				action: "archive",
				result: {
					tokensSaved: result.tokensSaved,
					itemsAffected: result.itemsArchived,
				},
			} as ContextIntegrationEvent)
		}
	}

	/**
	 * Get artifact IDs that should be archived
	 * @returns Array of artifact IDs to archive
	 */
	getArchivableArtifactIds(): string[] {
		const stats = this.getStatistics()
		const artifactItems = this.monitor.getItemsByType("artifact_summary")

		// Sort by last accessed (oldest first) and priority (lowest first)
		const sorted = artifactItems.sort((a, b) => {
			if (a.priority !== b.priority) return a.priority - b.priority
			return a.lastAccessedAt - b.lastAccessedAt
		})

		// Return artifact IDs for items that can be archived
		return sorted
			.filter((item) => item.archivable)
			.map((item) => item.referenceId)
			.filter((id): id is string => id !== undefined)
	}

	/**
	 * Check if context is in warning state
	 */
	isWarning(): boolean {
		const stats = this.getStatistics()
		return stats.usageLevel === "elevated" || stats.usageLevel === "high"
	}

	/**
	 * Check if context is in critical state
	 */
	isCritical(): boolean {
		return this.getStatistics().usageLevel === "critical"
	}

	/**
	 * Get context usage percentage
	 */
	getUsagePercentage(): number {
		return this.getStatistics().usagePercentage
	}

	/**
	 * Dispose of the integration
	 */
	dispose(): void {
		if (this.disposed) return
		this.disposed = true

		this.monitor.dispose()
		this.contextItemIds.clear()
		this.removeAllListeners()
	}

	// ============================================================================
	// Private Methods
	// ============================================================================

	/**
	 * Setup monitor event listeners
	 */
	private setupMonitorListeners(): void {
		// Forward warning events
		this.monitor.on("warning", (event: ContextEvent) => {
			this.emit("context_warning", {
				type: "context_warning",
				statistics: event.statistics,
			} as ContextIntegrationEvent)
		})

		// Forward critical events
		this.monitor.on("critical", (event: ContextEvent) => {
			this.emit("context_critical", {
				type: "context_critical",
				statistics: event.statistics,
			} as ContextIntegrationEvent)
		})

		// Forward limit exceeded events
		this.monitor.on("limit_exceeded", (event: ContextEvent) => {
			this.emit("context_limit_exceeded", {
				type: "context_limit_exceeded",
				statistics: event.statistics,
			} as ContextIntegrationEvent)
		})

		// Forward compression events
		this.monitor.on("compression_performed", (event: ContextEvent) => {
			const result = event.result as Extract<ContextEvent["result"], { tokensSaved: number }>
			this.emit("context_compressed", {
				type: "context_compressed",
				statistics: event.statistics,
				action: "compress",
				result: {
					tokensSaved: result?.tokensSaved ?? 0,
					itemsAffected: 0,
				},
			} as ContextIntegrationEvent)
		})

		// Forward archival events
		this.monitor.on("archival_performed", (event: ContextEvent) => {
			const result = event.result as Extract<ContextEvent["result"], { tokensSaved: number }>
			this.emit("context_archived", {
				type: "context_archived",
				statistics: event.statistics,
				action: "archive",
				result: {
					tokensSaved: result?.tokensSaved ?? 0,
					itemsAffected: 0,
				},
			} as ContextIntegrationEvent)
		})
	}
}

export default ContextIntegration
