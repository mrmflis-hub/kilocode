// kilocode_change - new file

import type { WorkflowState, ArtifactType } from "@kilocode/core-schemas"

/**
 * Unique identifier for a checkpoint
 */
export type CheckpointId = string

/**
 * Checkpoint status
 */
export type CheckpointStatus = "active" | "restored" | "expired" | "deleted"

/**
 * Workflow state snapshot for checkpoint
 */
export interface WorkflowStateSnapshot {
	/** Current workflow state */
	state: WorkflowState
	/** Previous workflow state (before pause) */
	previousState: WorkflowState | null
	/** Timestamp when state was captured */
	timestamp: number
	/** State history up to this point */
	history: StateHistorySnapshot[]
}

/**
 * State history entry snapshot
 */
export interface StateHistorySnapshot {
	/** State at this point */
	state: WorkflowState
	/** Timestamp of state entry */
	timestamp: number
	/** Trigger that caused the transition */
	trigger?: string
	/** Additional metadata */
	metadata?: Record<string, unknown>
}

/**
 * Workflow context snapshot for checkpoint
 */
export interface WorkflowContextSnapshot {
	/** User's original task */
	userTask?: string
	/** Current workflow step number */
	currentStep: number
	/** Total expected steps */
	totalSteps: number
	/** Artifact IDs produced during workflow */
	artifacts: string[]
	/** Agent IDs involved in workflow */
	agents: string[]
	/** Error message if in ERROR state */
	errorMessage?: string
	/** Retry count for current step */
	retryCount: number
	/** Custom metadata */
	metadata: Record<string, unknown>
}

/**
 * Artifact reference in checkpoint
 */
export interface CheckpointArtifactReference {
	/** Artifact ID */
	id: string
	/** Artifact type */
	type: ArtifactType
	/** Artifact status at checkpoint time */
	status: string
	/** Timestamp when artifact was created */
	createdAt: number
}

/**
 * Agent reference in checkpoint
 */
export interface CheckpointAgentReference {
	/** Agent ID */
	id: string
	/** Agent role */
	role: string
	/** Agent status at checkpoint time */
	status: string
	/** Timestamp when agent was spawned */
	spawnedAt: number
}

/**
 * Checkpoint data structure
 */
export interface WorkflowCheckpoint {
	/** Unique checkpoint identifier */
	id: CheckpointId
	/** Workflow session ID this checkpoint belongs to */
	sessionId: string
	/** Checkpoint name (optional) */
	name?: string
	/** Checkpoint description (optional) */
	description?: string
	/** Checkpoint status */
	status: CheckpointStatus
	/** Workflow state snapshot */
	workflowState: WorkflowStateSnapshot
	/** Workflow context snapshot */
	workflowContext: WorkflowContextSnapshot
	/** Artifact references at checkpoint time */
	artifacts: CheckpointArtifactReference[]
	/** Agent references at checkpoint time */
	agents: CheckpointAgentReference[]
	/** Timestamp when checkpoint was created */
	createdAt: number
	/** Timestamp when checkpoint was last updated */
	updatedAt: number
	/** Timestamp when checkpoint expires (optional) */
	expiresAt?: number
	/** Tags for categorizing checkpoints */
	tags: string[]
	/** Custom metadata */
	metadata: Record<string, unknown>
}

/**
 * Options for creating a checkpoint
 */
export interface CreateCheckpointOptions {
	/** Workflow session ID */
	sessionId: string
	/** Checkpoint name (optional) */
	name?: string
	/** Checkpoint description (optional) */
	description?: string
	/** Workflow state to checkpoint */
	workflowState: WorkflowStateSnapshot
	/** Workflow context to checkpoint */
	workflowContext: WorkflowContextSnapshot
	/** Artifact references to include */
	artifacts?: CheckpointArtifactReference[]
	/** Agent references to include */
	agents?: CheckpointAgentReference[]
	/** Expiration time in milliseconds from now (optional) */
	expiresIn?: number
	/** Tags for categorizing */
	tags?: string[]
	/** Custom metadata */
	metadata?: Record<string, unknown>
}

/**
 * Options for restoring from a checkpoint
 */
export interface RestoreCheckpointOptions {
	/** Whether to restore artifacts */
	restoreArtifacts?: boolean
	/** Whether to restore agents */
	restoreAgents?: boolean
	/** Whether to restore context */
	restoreContext?: boolean
	/** Whether to restore state history */
	restoreHistory?: boolean
	/** Custom metadata to merge */
	metadata?: Record<string, unknown>
}

/**
 * Result of checkpoint restoration
 */
export interface RestoreCheckpointResult {
	/** Whether restoration was successful */
	success: boolean
	/** Restored checkpoint */
	checkpoint?: WorkflowCheckpoint
	/** Error message if restoration failed */
	error?: string
	/** Warnings during restoration */
	warnings: string[]
	/** Restored state */
	restoredState?: WorkflowStateSnapshot
	/** Restored context */
	restoredContext?: WorkflowContextSnapshot
	/** Restored artifact references */
	restoredArtifacts?: CheckpointArtifactReference[]
	/** Restored agent references */
	restoredAgents?: CheckpointAgentReference[]
}

/**
 * Options for listing checkpoints
 */
export interface ListCheckpointsOptions {
	/** Filter by session ID */
	sessionId?: string
	/** Filter by status */
	status?: CheckpointStatus | CheckpointStatus[]
	/** Filter by tags (any match) */
	tags?: string[]
	/** Filter by workflow state */
	workflowState?: WorkflowState
	/** Maximum number of results */
	limit?: number
	/** Offset for pagination */
	offset?: number
	/** Sort by field */
	sortBy?: "createdAt" | "updatedAt" | "state"
	/** Sort order */
	sortOrder?: "asc" | "desc"
}

/**
 * Checkpoint event types
 */
export type CheckpointEventType =
	| "checkpoint_created"
	| "checkpoint_restored"
	| "checkpoint_deleted"
	| "checkpoint_expired"
	| "cleanup_completed"

/**
 * Checkpoint event
 */
export interface CheckpointEvent {
	/** Event type */
	type: CheckpointEventType
	/** Checkpoint ID */
	checkpointId: CheckpointId
	/** Timestamp */
	timestamp: number
	/** Additional data */
	data?: Record<string, unknown>
}

/**
 * Checkpoint cleanup options
 */
export interface CleanupOptions {
	/** Remove checkpoints older than this many hours */
	olderThanHours?: number
	/** Remove checkpoints with these statuses */
	statuses?: CheckpointStatus[]
	/** Maximum number of checkpoints to keep per session */
	maxPerSession?: number
	/** Only remove checkpoints for this session */
	sessionId?: string
	/** Whether to dry run (report only, don't delete) */
	dryRun?: boolean
}

/**
 * Checkpoint cleanup result
 */
export interface CleanupResult {
	/** Number of checkpoints removed */
	removed: number
	/** IDs of removed checkpoints */
	removedIds: CheckpointId[]
	/** Number of checkpoints kept */
	kept: number
	/** Errors during cleanup */
	errors: Array<{ checkpointId: CheckpointId; error: string }>
}

/**
 * Checkpoint statistics
 */
export interface CheckpointStats {
	/** Total number of checkpoints */
	total: number
	/** Number of active checkpoints */
	active: number
	/** Number of restored checkpoints */
	restored: number
	/** Number of expired checkpoints */
	expired: number
	/** Number of deleted checkpoints */
	deleted: number
	/** Number of sessions with checkpoints */
	sessions: number
	/** Oldest checkpoint timestamp */
	oldestCheckpoint?: number
	/** Newest checkpoint timestamp */
	newestCheckpoint?: number
	/** Total storage size in bytes (if available) */
	totalSizeBytes?: number
}

/**
 * Storage adapter interface for checkpoint persistence
 */
export interface CheckpointStorageAdapter {
	/** Get a checkpoint by ID */
	get(id: CheckpointId): Promise<WorkflowCheckpoint | null>
	/** Save a checkpoint */
	save(checkpoint: WorkflowCheckpoint): Promise<void>
	/** Delete a checkpoint */
	delete(id: CheckpointId): Promise<boolean>
	/** List checkpoints with options */
	list(options?: ListCheckpointsOptions): Promise<WorkflowCheckpoint[]>
	/** Get checkpoint statistics */
	getStats(): Promise<CheckpointStats>
	/** Clear all checkpoints */
	clear(): Promise<void>
}

/**
 * Checkpoint service configuration
 */
export interface CheckpointServiceConfig {
	/** Storage adapter for persistence */
	storage: CheckpointStorageAdapter
	/** Maximum checkpoints per session (default: 10) */
	maxCheckpointsPerSession?: number
	/** Default checkpoint expiration in hours (default: 24) */
	defaultExpirationHours?: number
	/** Whether to auto-create checkpoints on state transitions */
	autoCheckpoint?: boolean
	/** States to auto-checkpoint (if autoCheckpoint is true) */
	autoCheckpointStates?: WorkflowState[]
	/** Whether to emit events */
	emitEvents?: boolean
}
