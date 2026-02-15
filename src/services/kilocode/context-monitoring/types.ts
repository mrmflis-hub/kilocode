// kilocode_change - new file

/**
 * Context Window Monitoring Types
 *
 * This module provides types for monitoring and managing context window usage
 * in the orchestrator agent. The goal is to prevent context window overflow
 * while maintaining essential information for workflow coordination.
 */

/**
 * Context usage level
 */
export type ContextUsageLevel =
	| "normal" // Under 60% usage
	| "elevated" // 60-80% usage
	| "high" // 80-90% usage
	| "critical" // Over 90% usage

/**
 * Context compression strategy
 */
export type CompressionStrategy =
	| "none" // No compression
	| "light" // Remove whitespace, shorten descriptions
	| "moderate" // Compress summaries, remove details
	| "aggressive" // Maximum compression, keep only essentials
	| "emergency" // Archive older artifacts, minimal context

/**
 * Context item type for tracking
 */
export type ContextItemType =
	| "user_task" // User's original task
	| "workflow_state" // Current workflow state
	| "artifact_summary" // Artifact summary reference
	| "agent_status" // Agent status entry
	| "workflow_history" // Workflow history entry
	| "todo_item" // To-do list item
	| "mode_description" // Mode description
	| "metadata" // Other metadata

/**
 * Context item for tracking
 */
export interface ContextItem {
	/** Unique identifier for the item */
	id: string

	/** Type of context item */
	type: ContextItemType

	/** Estimated token count */
	tokenCount: number

	/** Priority (higher = more important to keep) */
	priority: number

	/** Whether this item can be compressed */
	compressible: boolean

	/** Whether this item can be archived */
	archivable: boolean

	/** Timestamp when item was added */
	addedAt: number

	/** Last access timestamp */
	lastAccessedAt: number

	/** Access count */
	accessCount: number

	/** Optional reference ID (e.g., artifact ID) */
	referenceId?: string
}

/**
 * Context window statistics
 */
export interface ContextStatistics {
	/** Total estimated tokens in context */
	totalTokens: number

	/** Maximum allowed tokens */
	maxTokens: number

	/** Usage percentage (0-100) */
	usagePercentage: number

	/** Current usage level */
	usageLevel: ContextUsageLevel

	/** Token count by item type */
	tokensByType: Record<ContextItemType, number>

	/** Number of items by type */
	itemsByType: Record<ContextItemType, number>

	/** Number of compressible items */
	compressibleItemCount: number

	/** Number of archivable items */
	archivableItemCount: number

	/** Potential savings from compression */
	potentialCompressionSavings: number

	/** Potential savings from archival */
	potentialArchivalSavings: number

	/** Timestamp of last calculation */
	calculatedAt: number
}

/**
 * Context window configuration
 */
export interface ContextWindowConfig {
	/** Maximum tokens allowed in context (default: 100000) */
	maxTokens: number

	/** Warning threshold percentage (default: 60) */
	warningThreshold: number

	/** High usage threshold percentage (default: 80) */
	highThreshold: number

	/** Critical threshold percentage (default: 90) */
	criticalThreshold: number

	/** Enable automatic compression (default: true) */
	autoCompress: boolean

	/** Enable automatic archival (default: true) */
	autoArchive: boolean

	/** Minimum items to keep per type (default: 3) */
	minItemsPerType: number

	/** Maximum workflow history entries (default: 20) */
	maxHistoryEntries: number

	/** Maximum artifact summaries (default: 100) */
	maxArtifactSummaries: number

	/** Maximum todo items (default: 50) */
	maxTodoItems: number

	/** Compression strategy to use at warning level */
	warningCompressionStrategy: CompressionStrategy

	/** Compression strategy to use at high level */
	highCompressionStrategy: CompressionStrategy

	/** Compression strategy to use at critical level */
	criticalCompressionStrategy: CompressionStrategy
}

/**
 * Compression result
 */
export interface CompressionResult {
	/** Whether compression was performed */
	performed: boolean

	/** Strategy used */
	strategy: CompressionStrategy

	/** Tokens before compression */
	tokensBefore: number

	/** Tokens after compression */
	tokensAfter: number

	/** Tokens saved */
	tokensSaved: number

	/** Items compressed */
	itemsCompressed: number

	/** Items removed */
	itemsRemoved: number

	/** Timestamp */
	timestamp: number
}

/**
 * Archival result
 */
export interface ArchivalResult {
	/** Whether archival was performed */
	performed: boolean

	/** Items archived */
	itemsArchived: number

	/** Tokens saved */
	tokensSaved: number

	/** Artifact IDs archived */
	artifactIds: string[]

	/** Timestamp */
	timestamp: number
}

/**
 * Context action to take
 */
export interface ContextAction {
	/** Action type */
	type: "compress" | "archive" | "notify" | "none"

	/** Reason for action */
	reason: string

	/** Recommended strategy (for compress) */
	strategy?: CompressionStrategy

	/** Items to target */
	targetItems?: string[]

	/** Priority of action */
	priority: "low" | "medium" | "high" | "critical"

	/** Whether action is automatic or requires approval */
	automatic: boolean
}

/**
 * Context window event type
 */
export type ContextEventType =
	| "usage_changed" // Usage level changed
	| "compression_performed" // Compression was performed
	| "archival_performed" // Archival was performed
	| "limit_exceeded" // Hard limit exceeded
	| "warning" // Warning threshold reached
	| "critical" // Critical threshold reached
	| "action_required" // Manual action required

/**
 * Context window event
 */
export interface ContextEvent {
	/** Event type */
	type: ContextEventType

	/** Timestamp */
	timestamp: number

	/** Current statistics */
	statistics: ContextStatistics

	/** Action taken or recommended */
	action?: ContextAction

	/** Result of action (if any) */
	result?: CompressionResult | ArchivalResult

	/** Additional data */
	data?: Record<string, unknown>
}

/**
 * Context window monitor interface
 */
export interface IContextWindowMonitor {
	/** Add a context item */
	addItem(item: Omit<ContextItem, "id" | "addedAt" | "lastAccessedAt" | "accessCount">): string

	/** Remove a context item */
	removeItem(id: string): boolean

	/** Update item access */
	touchItem(id: string): void

	/** Get current statistics */
	getStatistics(): ContextStatistics

	/** Get recommended action */
	getRecommendedAction(): ContextAction

	/** Perform compression */
	compress(strategy: CompressionStrategy): Promise<CompressionResult>

	/** Perform archival */
	archive(options?: { maxItems?: number; olderThan?: number }): Promise<ArchivalResult>

	/** Subscribe to events */
	on(event: ContextEventType, handler: (event: ContextEvent) => void): void

	/** Unsubscribe from events */
	off(event: ContextEventType, handler: (event: ContextEvent) => void): void

	/** Dispose */
	dispose(): void
}

/**
 * Summary compression options
 */
export interface SummaryCompressionOptions {
	/** Target token count */
	targetTokens?: number

	/** Strategy to use */
	strategy: CompressionStrategy

	/** Preserve key information */
	preserveKeys?: string[]

	/** Maximum compression ratio (0-1) */
	maxCompressionRatio?: number
}

/**
 * Artifact archival options
 */
export interface ArtifactArchivalOptions {
	/** Maximum items to archive */
	maxItems?: number

	/** Archive items older than (ms) */
	olderThan?: number

	/** Archive items with priority below */
	belowPriority?: number

	/** Keep minimum items per type */
	keepMinPerType?: number

	/** Specific artifact IDs to archive */
	artifactIds?: string[]
}

/**
 * Default context window configuration
 */
export const DEFAULT_CONTEXT_WINDOW_CONFIG: ContextWindowConfig = {
	maxTokens: 100000,
	warningThreshold: 60,
	highThreshold: 80,
	criticalThreshold: 90,
	autoCompress: true,
	autoArchive: true,
	minItemsPerType: 3,
	maxHistoryEntries: 20,
	maxArtifactSummaries: 100,
	maxTodoItems: 50,
	warningCompressionStrategy: "light",
	highCompressionStrategy: "moderate",
	criticalCompressionStrategy: "aggressive",
}

/**
 * Token estimation constants
 * These are approximate values for estimation purposes
 */
export const TOKEN_ESTIMATION = {
	/** Average characters per token (English text) */
	charsPerToken: 4,

	/** Average tokens per word */
	tokensPerWord: 1.3,

	/** Overhead tokens for message structure */
	messageOverhead: 4,

	/** Overhead tokens for JSON structure */
	jsonOverhead: 10,
}

/**
 * Priority levels for context items
 */
export const CONTEXT_PRIORITY = {
	/** Critical items that should never be removed */
	CRITICAL: 100,

	/** High priority items (current workflow state, active task) */
	HIGH: 75,

	/** Normal priority items (recent artifacts, active agents) */
	NORMAL: 50,

	/** Low priority items (old history, completed items) */
	LOW: 25,

	/** Minimal priority items (can be archived anytime) */
	MINIMAL: 10,
}
