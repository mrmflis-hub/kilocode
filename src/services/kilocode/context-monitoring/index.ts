// kilocode_change - new file

/**
 * Context Window Monitoring Module
 *
 * This module provides context window monitoring and management for the
 * multi-agent orchestration system. It helps prevent context window overflow
 * by tracking usage, compressing summaries, and archiving old artifacts.
 *
 * Key Features:
 * - Token estimation and tracking
 * - Automatic and manual compression strategies
 * - Artifact archival for context management
 * - Event-driven notifications for usage changes
 *
 * Usage:
 * ```typescript
 * import { ContextWindowMonitor, CONTEXT_PRIORITY } from './context-monitoring'
 *
 * const monitor = new ContextWindowMonitor({
 *   maxTokens: 100000,
 *   autoCompress: true,
 * })
 *
 * // Add context items
 * const itemId = monitor.addItem({
 *   type: 'artifact_summary',
 *   tokenCount: 500,
 *   priority: CONTEXT_PRIORITY.NORMAL,
 *   compressible: true,
 *   archivable: true,
 *   referenceId: 'artifact_123',
 * })
 *
 * // Get statistics
 * const stats = monitor.getStatistics()
 * console.log(`Usage: ${stats.usagePercentage}%`)
 *
 * // Subscribe to events
 * monitor.on('critical', (event) => {
 *   console.log('Critical context usage!', event.statistics.usagePercentage)
 * })
 * ```
 */

export {
	ContextWindowMonitor,
	DEFAULT_CONTEXT_WINDOW_CONFIG,
	TOKEN_ESTIMATION,
	CONTEXT_PRIORITY,
} from "./ContextWindowMonitor"

export type {
	ContextWindowConfig,
	ContextItem,
	ContextItemType,
	ContextStatistics,
	ContextUsageLevel,
	CompressionStrategy,
	CompressionResult,
	ArchivalResult,
	ContextAction,
	ContextEvent,
	ContextEventType,
	SummaryCompressionOptions,
	ArtifactArchivalOptions,
} from "./ContextWindowMonitor"
