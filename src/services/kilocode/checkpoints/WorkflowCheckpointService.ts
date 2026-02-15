// kilocode_change - new file

import { EventEmitter } from "events"
import type { WorkflowState } from "@kilocode/core-schemas"
import {
	type CheckpointId,
	type CheckpointStatus,
	type WorkflowCheckpoint,
	type CreateCheckpointOptions,
	type RestoreCheckpointOptions,
	type RestoreCheckpointResult,
	type ListCheckpointsOptions,
	type CheckpointEvent,
	type CheckpointEventType,
	type CleanupOptions,
	type CleanupResult,
	type CheckpointStats,
	type CheckpointStorageAdapter,
	type CheckpointServiceConfig,
	type WorkflowStateSnapshot,
	type WorkflowContextSnapshot,
	type CheckpointArtifactReference,
	type CheckpointAgentReference,
} from "./types"

/**
 * Generate a unique checkpoint ID
 */
function generateCheckpointId(): CheckpointId {
	return `checkpoint_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * In-memory storage adapter for checkpoints
 * Used for testing and as a default implementation
 */
export class MemoryCheckpointStorage implements CheckpointStorageAdapter {
	private checkpoints: Map<CheckpointId, WorkflowCheckpoint> = new Map()

	async get(id: CheckpointId): Promise<WorkflowCheckpoint | null> {
		return this.checkpoints.get(id) || null
	}

	async save(checkpoint: WorkflowCheckpoint): Promise<void> {
		this.checkpoints.set(checkpoint.id, { ...checkpoint })
	}

	async delete(id: CheckpointId): Promise<boolean> {
		return this.checkpoints.delete(id)
	}

	async list(options?: ListCheckpointsOptions): Promise<WorkflowCheckpoint[]> {
		let results = Array.from(this.checkpoints.values())

		if (options) {
			// Filter by session ID
			if (options.sessionId) {
				results = results.filter((c) => c.sessionId === options.sessionId)
			}

			// Filter by status
			if (options.status) {
				const statuses = Array.isArray(options.status) ? options.status : [options.status]
				results = results.filter((c) => statuses.includes(c.status))
			}

			// Filter by tags
			if (options.tags && options.tags.length > 0) {
				results = results.filter((c) => options.tags!.some((tag) => c.tags.includes(tag)))
			}

			// Filter by workflow state
			if (options.workflowState) {
				results = results.filter((c) => c.workflowState.state === options.workflowState)
			}

			// Sort
			if (options.sortBy) {
				const order = options.sortOrder === "desc" ? -1 : 1
				results.sort((a, b) => {
					let comparison = 0
					switch (options.sortBy) {
						case "createdAt":
							comparison = a.createdAt - b.createdAt
							// Use id as secondary sort key for deterministic ordering
							if (comparison === 0) {
								comparison = a.id.localeCompare(b.id)
							}
							break
						case "updatedAt":
							comparison = a.updatedAt - b.updatedAt
							// Use id as secondary sort key for deterministic ordering
							if (comparison === 0) {
								comparison = a.id.localeCompare(b.id)
							}
							break
						case "state":
							comparison = a.workflowState.state.localeCompare(b.workflowState.state)
							break
					}
					return comparison * order
				})
			}

			// Pagination
			if (options.offset !== undefined) {
				results = results.slice(options.offset)
			}
			if (options.limit !== undefined) {
				results = results.slice(0, options.limit)
			}
		}

		return results
	}

	async getStats(): Promise<CheckpointStats> {
		const checkpoints = Array.from(this.checkpoints.values())
		const sessions = new Set(checkpoints.map((c) => c.sessionId))

		return {
			total: checkpoints.length,
			active: checkpoints.filter((c) => c.status === "active").length,
			restored: checkpoints.filter((c) => c.status === "restored").length,
			expired: checkpoints.filter((c) => c.status === "expired").length,
			deleted: checkpoints.filter((c) => c.status === "deleted").length,
			sessions: sessions.size,
			oldestCheckpoint: checkpoints.length > 0 ? Math.min(...checkpoints.map((c) => c.createdAt)) : undefined,
			newestCheckpoint: checkpoints.length > 0 ? Math.max(...checkpoints.map((c) => c.createdAt)) : undefined,
		}
	}

	async clear(): Promise<void> {
		this.checkpoints.clear()
	}
}

/**
 * WorkflowCheckpointService - Manages workflow checkpoints for error recovery
 *
 * This service is responsible for:
 * - Creating checkpoints at state transitions
 * - Persisting checkpoints to storage
 * - Restoring workflow state from checkpoints
 * - Cleaning up old checkpoints
 * - Emitting checkpoint events
 *
 * Integration with WorkflowStateMachine:
 * - Listen to 'stateChange' events from WorkflowStateMachine
 * - Create checkpoints on major state transitions
 * - Provide rollback capability on errors
 */
export class WorkflowCheckpointService extends EventEmitter {
	private readonly storage: CheckpointStorageAdapter
	private readonly maxCheckpointsPerSession: number
	private readonly defaultExpirationHours: number
	private readonly autoCheckpoint: boolean
	private readonly autoCheckpointStates: Set<WorkflowState>
	private readonly emitEvents: boolean
	private cleanupInterval?: ReturnType<typeof setInterval>

	constructor(config: CheckpointServiceConfig) {
		super()

		this.storage = config.storage
		this.maxCheckpointsPerSession = config.maxCheckpointsPerSession ?? 10
		this.defaultExpirationHours = config.defaultExpirationHours ?? 24
		this.autoCheckpoint = config.autoCheckpoint ?? false
		this.autoCheckpointStates = new Set(config.autoCheckpointStates ?? [])
		this.emitEvents = config.emitEvents ?? true
	}

	/**
	 * Create a new checkpoint
	 * @param options - Checkpoint creation options
	 * @returns The created checkpoint
	 */
	async createCheckpoint(options: CreateCheckpointOptions): Promise<WorkflowCheckpoint> {
		const now = Date.now()
		const expiresAt = options.expiresIn
			? now + options.expiresIn
			: now + this.defaultExpirationHours * 60 * 60 * 1000

		const checkpoint: WorkflowCheckpoint = {
			id: generateCheckpointId(),
			sessionId: options.sessionId,
			name: options.name,
			description: options.description,
			status: "active",
			workflowState: options.workflowState,
			workflowContext: options.workflowContext,
			artifacts: options.artifacts ?? [],
			agents: options.agents ?? [],
			createdAt: now,
			updatedAt: now,
			expiresAt,
			tags: options.tags ?? [],
			metadata: options.metadata ?? {},
		}

		await this.storage.save(checkpoint)

		// Enforce max checkpoints per session
		await this.enforceMaxCheckpoints(options.sessionId)

		// Emit event
		this.emitCheckpointEvent("checkpoint_created", checkpoint.id, {
			sessionId: checkpoint.sessionId,
			state: checkpoint.workflowState.state,
		})

		return checkpoint
	}

	/**
	 * Get a checkpoint by ID
	 * @param id - Checkpoint ID
	 * @returns The checkpoint or null if not found
	 */
	async getCheckpoint(id: CheckpointId): Promise<WorkflowCheckpoint | null> {
		return this.storage.get(id)
	}

	/**
	 * Restore workflow from a checkpoint
	 * @param id - Checkpoint ID
	 * @param options - Restore options
	 * @returns Restore result
	 */
	async restoreCheckpoint(
		id: CheckpointId,
		options: RestoreCheckpointOptions = {},
	): Promise<RestoreCheckpointResult> {
		const checkpoint = await this.storage.get(id)

		if (!checkpoint) {
			return {
				success: false,
				error: `Checkpoint ${id} not found`,
				warnings: [],
			}
		}

		const warnings: string[] = []

		// Check if checkpoint is expired
		if (checkpoint.expiresAt && checkpoint.expiresAt < Date.now()) {
			warnings.push(`Checkpoint ${id} has expired`)
			// Update status to expired
			checkpoint.status = "expired"
			await this.storage.save(checkpoint)

			return {
				success: false,
				error: "Checkpoint has expired",
				warnings,
			}
		}

		// Check if checkpoint has already been restored
		if (checkpoint.status === "restored") {
			warnings.push(`Checkpoint ${id} has already been restored`)
		}

		// Build restored state
		const restoredState: WorkflowStateSnapshot = { ...checkpoint.workflowState }
		const restoredContext: WorkflowContextSnapshot = { ...checkpoint.workflowContext }
		const restoredArtifacts: CheckpointArtifactReference[] = options.restoreArtifacts
			? [...checkpoint.artifacts]
			: []
		const restoredAgents: CheckpointAgentReference[] = options.restoreAgents ? [...checkpoint.agents] : []

		// Merge custom metadata
		if (options.metadata) {
			restoredContext.metadata = { ...restoredContext.metadata, ...options.metadata }
		}

		// Update checkpoint status
		checkpoint.status = "restored"
		checkpoint.updatedAt = Date.now()
		await this.storage.save(checkpoint)

		// Emit event
		this.emitCheckpointEvent("checkpoint_restored", checkpoint.id, {
			sessionId: checkpoint.sessionId,
			state: checkpoint.workflowState.state,
		})

		return {
			success: true,
			checkpoint,
			warnings,
			restoredState,
			restoredContext,
			restoredArtifacts,
			restoredAgents,
		}
	}

	/**
	 * Delete a checkpoint
	 * @param id - Checkpoint ID
	 * @returns True if deleted, false if not found
	 */
	async deleteCheckpoint(id: CheckpointId): Promise<boolean> {
		const checkpoint = await this.storage.get(id)

		if (!checkpoint) {
			return false
		}

		// Mark as deleted instead of removing
		checkpoint.status = "deleted"
		checkpoint.updatedAt = Date.now()
		await this.storage.save(checkpoint)

		// Emit event
		this.emitCheckpointEvent("checkpoint_deleted", id, {
			sessionId: checkpoint.sessionId,
		})

		return true
	}

	/**
	 * List checkpoints with optional filters
	 * @param options - List options
	 * @returns Array of checkpoints
	 */
	async listCheckpoints(options?: ListCheckpointsOptions): Promise<WorkflowCheckpoint[]> {
		return this.storage.list(options)
	}

	/**
	 * Get the latest checkpoint for a session
	 * @param sessionId - Session ID
	 * @returns The latest checkpoint or null
	 */
	async getLatestCheckpoint(sessionId: string): Promise<WorkflowCheckpoint | null> {
		const checkpoints = await this.storage.list({
			sessionId,
			status: "active",
			sortBy: "createdAt",
			sortOrder: "desc",
			limit: 1,
		})

		return checkpoints[0] || null
	}

	/**
	 * Get checkpoints for a specific workflow state
	 * @param sessionId - Session ID
	 * @param state - Workflow state
	 * @returns Array of checkpoints
	 */
	async getCheckpointsForState(sessionId: string, state: WorkflowState): Promise<WorkflowCheckpoint[]> {
		return this.storage.list({
			sessionId,
			workflowState: state,
			status: "active",
			sortBy: "createdAt",
			sortOrder: "desc",
		})
	}

	/**
	 * Clean up old checkpoints
	 * @param options - Cleanup options
	 * @returns Cleanup result
	 */
	async cleanupCheckpoints(options: CleanupOptions = {}): Promise<CleanupResult> {
		const {
			olderThanHours = 24,
			statuses = ["expired", "deleted"],
			maxPerSession,
			sessionId,
			dryRun = false,
		} = options

		const cutoffTime = Date.now() - olderThanHours * 60 * 60 * 1000
		const removedIds: CheckpointId[] = []
		const errors: Array<{ checkpointId: CheckpointId; error: string }> = []

		// Get checkpoints to potentially remove by status/age
		const checkpoints = await this.storage.list({
			sessionId,
			status: statuses,
			sortBy: "createdAt",
			sortOrder: "asc",
		})

		// Filter by age
		const oldCheckpoints = checkpoints.filter((c) => c.createdAt < cutoffTime)

		// Also handle max per session - query ALL active checkpoints for this
		let excessCheckpoints: WorkflowCheckpoint[] = []
		if (maxPerSession !== undefined) {
			// Get all active checkpoints for maxPerSession check
			const allCheckpoints = await this.storage.list({
				sessionId,
				status: "active",
				sortBy: "createdAt",
				sortOrder: "asc",
			})

			const sessionGroups = new Map<string, WorkflowCheckpoint[]>()

			for (const checkpoint of allCheckpoints) {
				const existing = sessionGroups.get(checkpoint.sessionId) || []
				existing.push(checkpoint)
				sessionGroups.set(checkpoint.sessionId, existing)
			}

			for (const [, sessionCheckpoints] of sessionGroups) {
				if (sessionCheckpoints.length > maxPerSession) {
					// Sort by createdAt ascending (oldest first)
					sessionCheckpoints.sort((a, b) => a.createdAt - b.createdAt)
					// Get excess checkpoints (oldest ones)
					excessCheckpoints.push(...sessionCheckpoints.slice(0, sessionCheckpoints.length - maxPerSession))
				}
			}
		}

		// Combine and deduplicate
		const toRemove = new Map<CheckpointId, WorkflowCheckpoint>()
		for (const c of oldCheckpoints) {
			toRemove.set(c.id, c)
		}
		for (const c of excessCheckpoints) {
			toRemove.set(c.id, c)
		}

		// Remove checkpoints
		for (const checkpoint of toRemove.values()) {
			if (dryRun) {
				removedIds.push(checkpoint.id)
			} else {
				try {
					const deleted = await this.storage.delete(checkpoint.id)
					if (deleted) {
						removedIds.push(checkpoint.id)
					}
				} catch (error) {
					errors.push({
						checkpointId: checkpoint.id,
						error: error instanceof Error ? error.message : String(error),
					})
				}
			}
		}

		// Emit event
		if (!dryRun && removedIds.length > 0) {
			this.emitCheckpointEvent("cleanup_completed", "", {
				removedCount: removedIds.length,
				olderThanHours,
			})
		}

		return {
			removed: removedIds.length,
			removedIds,
			kept: checkpoints.length - removedIds.length,
			errors,
		}
	}

	/**
	 * Get checkpoint statistics
	 * @returns Checkpoint statistics
	 */
	async getStats(): Promise<CheckpointStats> {
		return this.storage.getStats()
	}

	/**
	 * Start periodic cleanup
	 * @param intervalHours - Cleanup interval in hours (default: 1)
	 */
	startPeriodicCleanup(intervalHours: number = 1): void {
		if (this.cleanupInterval) {
			this.stopPeriodicCleanup()
		}

		this.cleanupInterval = setInterval(
			async () => {
				try {
					await this.cleanupCheckpoints()
				} catch (error) {
					console.error("Periodic checkpoint cleanup failed:", error)
				}
			},
			intervalHours * 60 * 60 * 1000,
		)
	}

	/**
	 * Stop periodic cleanup
	 */
	stopPeriodicCleanup(): void {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval)
			this.cleanupInterval = undefined
		}
	}

	/**
	 * Check if auto-checkpoint is enabled for a state
	 * @param state - Workflow state
	 * @returns True if auto-checkpoint is enabled
	 */
	shouldAutoCheckpoint(state: WorkflowState): boolean {
		return this.autoCheckpoint && this.autoCheckpointStates.has(state)
	}

	/**
	 * Create a checkpoint from workflow state machine data
	 * This is a convenience method for integration with WorkflowStateMachine
	 * @param sessionId - Session ID
	 * @param state - Current workflow state
	 * @param previousState - Previous workflow state
	 * @param context - Workflow context
	 * @param history - State history
	 * @param artifacts - Artifact references
	 * @param agents - Agent references
	 * @param options - Optional checkpoint options (name, description, etc.)
	 * @returns The created checkpoint
	 */
	async createCheckpointFromWorkflow(
		sessionId: string,
		state: WorkflowState,
		previousState: WorkflowState | null,
		context: {
			userTask?: string
			currentStep: number
			totalSteps: number
			artifacts: string[]
			agents: string[]
			errorMessage?: string
			retryCount: number
			metadata: Record<string, unknown>
		},
		history: Array<{
			state: WorkflowState
			timestamp: number
			trigger?: string
			metadata?: Record<string, unknown>
		}>,
		artifacts: CheckpointArtifactReference[] = [],
		agents: CheckpointAgentReference[] = [],
		options?: { name?: string; description?: string; metadata?: Record<string, unknown> },
	): Promise<WorkflowCheckpoint> {
		const workflowState: WorkflowStateSnapshot = {
			state,
			previousState,
			timestamp: Date.now(),
			history: history.map((h) => ({
				state: h.state,
				timestamp: h.timestamp,
				trigger: h.trigger,
				metadata: h.metadata,
			})),
		}

		const workflowContext: WorkflowContextSnapshot = {
			userTask: context.userTask,
			currentStep: context.currentStep,
			totalSteps: context.totalSteps,
			artifacts: context.artifacts,
			agents: context.agents,
			errorMessage: context.errorMessage,
			retryCount: context.retryCount,
			metadata: context.metadata,
		}

		return this.createCheckpoint({
			sessionId,
			name: options?.name,
			description: options?.description,
			workflowState,
			workflowContext,
			artifacts,
			agents,
			tags: [state],
			metadata: options?.metadata,
		})
	}

	/**
	 * Dispose of the service
	 */
	dispose(): void {
		this.stopPeriodicCleanup()
		this.removeAllListeners()
	}

	/**
	 * Enforce maximum checkpoints per session
	 * @param sessionId - Session ID
	 */
	private async enforceMaxCheckpoints(sessionId: string): Promise<void> {
		if (this.maxCheckpointsPerSession <= 0) {
			return
		}

		const checkpoints = await this.storage.list({
			sessionId,
			status: "active",
			sortBy: "createdAt",
			sortOrder: "asc",
		})

		// Remove oldest checkpoints if over limit
		while (checkpoints.length > this.maxCheckpointsPerSession) {
			const oldest = checkpoints.shift()
			if (oldest) {
				await this.storage.delete(oldest.id)
			}
		}
	}

	/**
	 * Emit a checkpoint event
	 */
	private emitCheckpointEvent(
		type: CheckpointEventType,
		checkpointId: CheckpointId,
		data?: Record<string, unknown>,
	): void {
		if (!this.emitEvents) {
			return
		}

		const event: CheckpointEvent = {
			type,
			checkpointId,
			timestamp: Date.now(),
			data,
		}

		this.emit(type, event)
		this.emit("checkpoint", event)
	}
}

/**
 * Create a default checkpoint service with in-memory storage
 * @param options - Configuration options
 * @returns Configured checkpoint service
 */
export function createDefaultCheckpointService(
	options: Partial<CheckpointServiceConfig> = {},
): WorkflowCheckpointService {
	return new WorkflowCheckpointService({
		storage: new MemoryCheckpointStorage(),
		...options,
	})
}
