// kilocode_change - new file

import { EventEmitter } from "events"
import { WorkflowStateMachine, type StateHistoryEntry, type WorkflowContext } from "./WorkflowStateMachine"
import type { WorkflowState } from "./types"
import { WorkflowCheckpointService } from "../../../../services/kilocode/checkpoints/WorkflowCheckpointService"
import type {
	WorkflowCheckpoint,
	RestoreCheckpointResult,
	CheckpointArtifactReference,
	CheckpointAgentReference,
} from "../../../../services/kilocode/checkpoints/types"

/**
 * Options for checkpoint integration
 */
export interface CheckpointIntegrationOptions {
	/** The workflow state machine to integrate with */
	stateMachine: WorkflowStateMachine
	/** The checkpoint service to use */
	checkpointService: WorkflowCheckpointService
	/** Session ID for checkpoints */
	sessionId: string
	/** Whether to auto-create checkpoints on state transitions */
	autoCheckpoint?: boolean
	/** States to auto-checkpoint (if autoCheckpoint is true) */
	autoCheckpointStates?: WorkflowState[]
	/** Callback to get artifact references for checkpoints */
	getArtifacts?: () => CheckpointArtifactReference[]
	/** Callback to get agent references for checkpoints */
	getAgents?: () => CheckpointAgentReference[]
}

/**
 * Result of rollback operation
 */
export interface RollbackResult {
	/** Whether rollback was successful */
	success: boolean
	/** The checkpoint that was restored */
	checkpoint?: WorkflowCheckpoint
	/** Error message if rollback failed */
	error?: string
	/** Warnings during rollback */
	warnings: string[]
	/** The restored state */
	restoredState?: WorkflowState
	/** The restored context */
	restoredContext?: WorkflowContext
}

/**
 * CheckpointIntegration - Connects WorkflowStateMachine with WorkflowCheckpointService
 *
 * This class provides:
 * - Automatic checkpoint creation on state transitions
 * - Manual checkpoint creation
 * - Rollback to previous checkpoints
 * - Recovery from errors using checkpoints
 *
 * Usage:
 * ```typescript
 * const stateMachine = new WorkflowStateMachine()
 * const checkpointService = createDefaultCheckpointService()
 *
 * const integration = new CheckpointIntegration({
 *   stateMachine,
 *   checkpointService,
 *   sessionId: 'session-123',
 *   autoCheckpoint: true,
 *   autoCheckpointStates: ['PLANNING', 'CODE_IMPLEMENTATION', 'TESTING'],
 * })
 *
 * // Create manual checkpoint
 * await integration.createCheckpoint('Before risky operation')
 *
 * // Rollback on error
 * const result = await integration.rollbackToLatest()
 * ```
 */
export class CheckpointIntegration extends EventEmitter {
	private readonly stateMachine: WorkflowStateMachine
	private readonly checkpointService: WorkflowCheckpointService
	private readonly sessionId: string
	private readonly autoCheckpoint: boolean
	private readonly autoCheckpointStates: Set<WorkflowState>
	private readonly getArtifacts?: () => CheckpointArtifactReference[]
	private readonly getAgents?: () => CheckpointAgentReference[]
	private boundHandleStateChange?: (event: unknown) => void

	constructor(options: CheckpointIntegrationOptions) {
		super()

		this.stateMachine = options.stateMachine
		this.checkpointService = options.checkpointService
		this.sessionId = options.sessionId
		this.autoCheckpoint = options.autoCheckpoint ?? false
		this.autoCheckpointStates = new Set(options.autoCheckpointStates ?? [])
		this.getArtifacts = options.getArtifacts
		this.getAgents = options.getAgents

		// Set up auto-checkpoint listener
		if (this.autoCheckpoint) {
			this.boundHandleStateChange = this.handleStateChange.bind(this)
			this.stateMachine.on("stateChange", this.boundHandleStateChange)
		}
	}

	/**
	 * Create a checkpoint for the current state
	 * @param name - Optional checkpoint name
	 * @param description - Optional checkpoint description
	 * @returns The created checkpoint
	 */
	async createCheckpoint(name?: string, description?: string): Promise<WorkflowCheckpoint> {
		const state = this.stateMachine.getState()
		const previousState = this.stateMachine.getPreviousState()
		const context = this.stateMachine.getContext()
		const history = this.stateMachine.getHistory()

		return this.checkpointService.createCheckpointFromWorkflow(
			this.sessionId,
			state,
			previousState,
			{
				userTask: context.userTask,
				currentStep: context.currentStep,
				totalSteps: context.totalSteps,
				artifacts: context.artifacts,
				agents: context.agents,
				errorMessage: context.errorMessage,
				retryCount: context.retryCount,
				metadata: context.metadata,
			},
			history.map((h) => ({
				state: h.state,
				timestamp: h.timestamp,
				trigger: h.trigger,
				metadata: h.metadata,
			})),
			this.getArtifacts?.() ?? [],
			this.getAgents?.() ?? [],
			{ name, description },
		)
	}

	/**
	 * Rollback to the latest checkpoint
	 * @returns Rollback result
	 */
	async rollbackToLatest(): Promise<RollbackResult> {
		const checkpoint = await this.checkpointService.getLatestCheckpoint(this.sessionId)

		if (!checkpoint) {
			return {
				success: false,
				error: "No checkpoint found for this session",
				warnings: [],
			}
		}

		return this.rollbackToCheckpoint(checkpoint.id)
	}

	/**
	 * Rollback to a specific checkpoint
	 * @param checkpointId - The checkpoint ID to rollback to
	 * @returns Rollback result
	 */
	async rollbackToCheckpoint(checkpointId: string): Promise<RollbackResult> {
		const result = await this.checkpointService.restoreCheckpoint(checkpointId, {
			restoreArtifacts: true,
			restoreAgents: true,
			restoreContext: true,
			restoreHistory: true,
		})

		if (!result.success || !result.restoredState || !result.restoredContext) {
			return {
				success: false,
				error: result.error,
				warnings: result.warnings,
			}
		}

		// Apply restored state to state machine
		// Note: This requires the state machine to have a method to restore state
		// For now, we emit an event that consumers can listen to
		this.emit("rollback", {
			checkpoint: result.checkpoint,
			restoredState: result.restoredState,
			restoredContext: result.restoredContext,
			restoredArtifacts: result.restoredArtifacts,
			restoredAgents: result.restoredAgents,
		})

		return {
			success: true,
			checkpoint: result.checkpoint,
			warnings: result.warnings,
			restoredState: result.restoredState.state,
			restoredContext: {
				userTask: result.restoredContext.userTask,
				currentStep: result.restoredContext.currentStep,
				totalSteps: result.restoredContext.totalSteps,
				artifacts: result.restoredContext.artifacts,
				agents: result.restoredContext.agents,
				errorMessage: result.restoredContext.errorMessage,
				retryCount: result.restoredContext.retryCount,
				metadata: result.restoredContext.metadata,
			},
		}
	}

	/**
	 * Rollback to a checkpoint for a specific state
	 * @param state - The state to rollback to
	 * @returns Rollback result
	 */
	async rollbackToState(state: WorkflowState): Promise<RollbackResult> {
		const checkpoints = await this.checkpointService.getCheckpointsForState(this.sessionId, state)

		if (checkpoints.length === 0) {
			return {
				success: false,
				error: `No checkpoint found for state ${state}`,
				warnings: [],
			}
		}

		// Use the most recent checkpoint for this state
		return this.rollbackToCheckpoint(checkpoints[0].id)
	}

	/**
	 * Get all checkpoints for this session
	 * @returns Array of checkpoints
	 */
	async getCheckpoints(): Promise<WorkflowCheckpoint[]> {
		return this.checkpointService.listCheckpoints({ sessionId: this.sessionId, status: "active" })
	}

	/**
	 * Get the latest checkpoint
	 * @returns The latest checkpoint or null
	 */
	async getLatestCheckpoint(): Promise<WorkflowCheckpoint | null> {
		return this.checkpointService.getLatestCheckpoint(this.sessionId)
	}

	/**
	 * Delete a checkpoint
	 * @param checkpointId - The checkpoint ID to delete
	 * @returns True if deleted
	 */
	async deleteCheckpoint(checkpointId: string): Promise<boolean> {
		return this.checkpointService.deleteCheckpoint(checkpointId)
	}

	/**
	 * Handle state change event for auto-checkpointing
	 */
	private async handleStateChange(event: unknown): Promise<void> {
		const stateChangeEvent = event as {
			newState: WorkflowState
			previousState: WorkflowState
			trigger?: string
		}

		if (this.autoCheckpointStates.has(stateChangeEvent.newState)) {
			try {
				await this.createCheckpoint(
					`Auto-checkpoint: ${stateChangeEvent.newState}`,
					`Triggered by: ${stateChangeEvent.trigger ?? "unknown"}`,
				)
				this.emit("autoCheckpoint", { state: stateChangeEvent.newState })
			} catch (error) {
				this.emit("checkpointError", {
					state: stateChangeEvent.newState,
					error: error instanceof Error ? error.message : String(error),
				})
			}
		}
	}

	/**
	 * Dispose of the integration
	 */
	dispose(): void {
		if (this.boundHandleStateChange) {
			this.stateMachine.off("stateChange", this.boundHandleStateChange)
		}
		this.removeAllListeners()
	}
}

/**
 * Create a checkpoint integration
 * @param options - Integration options
 * @returns The checkpoint integration
 */
export function createCheckpointIntegration(options: CheckpointIntegrationOptions): CheckpointIntegration {
	return new CheckpointIntegration(options)
}
