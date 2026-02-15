// kilocode_change - new file
import { EventEmitter } from "events"
import {
	ContextWindowConfig,
	DEFAULT_CONTEXT_WINDOW_CONFIG,
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
	TOKEN_ESTIMATION,
	CONTEXT_PRIORITY,
} from "./types"

/**
 * ContextWindowMonitor - Monitors and manages context window usage
 *
 * This class provides:
 * - Context size tracking with token estimation
 * - Automatic and manual compression strategies
 * - Artifact archival for context management
 * - Hard limit enforcement with configurable actions
 * - Event emission for monitoring and alerting
 *
 * Design Principles:
 * - Proactive management: Act before limits are reached
 * - Graceful degradation: Compress before removing
 * - Priority-based: Keep high-priority items longer
 * - Event-driven: Notify consumers of state changes
 */
export class ContextWindowMonitor extends EventEmitter {
	private readonly config: ContextWindowConfig
	private readonly items: Map<string, ContextItem> = new Map()
	private itemIdCounter = 0
	private lastStatistics: ContextStatistics | null = null
	private currentUsageLevel: ContextUsageLevel = "normal"
	private disposed = false

	constructor(config?: Partial<ContextWindowConfig>) {
		super()
		this.config = { ...DEFAULT_CONTEXT_WINDOW_CONFIG, ...config }
	}

	/**
	 * Add a context item
	 * @param item - Item to add (without id and timestamps)
	 * @returns The generated item ID
	 */
	addItem(item: Omit<ContextItem, "id" | "addedAt" | "lastAccessedAt" | "accessCount">): string {
		const id = this.generateItemId()
		const now = Date.now()

		const fullItem: ContextItem = {
			...item,
			id,
			addedAt: now,
			lastAccessedAt: now,
			accessCount: 1,
		}

		this.items.set(id, fullItem)

		// Check if we need to take action
		this.checkAndAct()

		return id
	}

	/**
	 * Remove a context item
	 * @param id - Item ID to remove
	 * @returns Whether the item was removed
	 */
	removeItem(id: string): boolean {
		const removed = this.items.delete(id)
		if (removed) {
			this.emitStatisticsUpdate()
		}
		return removed
	}

	/**
	 * Update item access timestamp and count
	 * @param id - Item ID to touch
	 */
	touchItem(id: string): void {
		const item = this.items.get(id)
		if (item) {
			item.lastAccessedAt = Date.now()
			item.accessCount++
		}
	}

	/**
	 * Update item token count
	 * @param id - Item ID
	 * @param tokenCount - New token count
	 */
	updateItemTokens(id: string, tokenCount: number): void {
		const item = this.items.get(id)
		if (item) {
			item.tokenCount = tokenCount
			this.emitStatisticsUpdate()
		}
	}

	/**
	 * Get item by ID
	 * @param id - Item ID
	 * @returns The item or undefined
	 */
	getItem(id: string): ContextItem | undefined {
		return this.items.get(id)
	}

	/**
	 * Get all items of a specific type
	 * @param type - Item type
	 * @returns Array of items
	 */
	getItemsByType(type: ContextItemType): ContextItem[] {
		return Array.from(this.items.values()).filter((item) => item.type === type)
	}

	/**
	 * Get current context statistics
	 * @returns Current statistics
	 */
	getStatistics(): ContextStatistics {
		const stats = this.calculateStatistics()
		this.lastStatistics = stats
		return stats
	}

	/**
	 * Get recommended action based on current usage
	 * @returns Recommended action
	 */
	getRecommendedAction(): ContextAction {
		const stats = this.getStatistics()

		if (stats.usageLevel === "normal") {
			return {
				type: "none",
				reason: "Context usage is within normal limits",
				priority: "low",
				automatic: true,
			}
		}

		if (stats.usageLevel === "elevated") {
			return {
				type: "compress",
				reason: `Context usage at ${stats.usagePercentage.toFixed(1)}%, approaching warning threshold`,
				strategy: this.config.warningCompressionStrategy,
				priority: "low",
				automatic: this.config.autoCompress,
			}
		}

		if (stats.usageLevel === "high") {
			return {
				type: "compress",
				reason: `Context usage at ${stats.usagePercentage.toFixed(1)}%, high usage detected`,
				strategy: this.config.highCompressionStrategy,
				priority: "medium",
				automatic: this.config.autoCompress,
			}
		}

		// Critical
		return {
			type: "archive",
			reason: `Context usage at ${stats.usagePercentage.toFixed(1)}%, critical level reached`,
			strategy: this.config.criticalCompressionStrategy,
			priority: "critical",
			automatic: this.config.autoArchive,
			targetItems: this.getArchivableItemIds(),
		}
	}

	/**
	 * Perform compression on context items
	 * @param strategy - Compression strategy to use
	 * @returns Compression result
	 */
	async compress(strategy: CompressionStrategy): Promise<CompressionResult> {
		const tokensBefore = this.getTotalTokens()
		let itemsCompressed = 0
		let itemsRemoved = 0

		if (strategy === "none") {
			return {
				performed: false,
				strategy,
				tokensBefore,
				tokensAfter: tokensBefore,
				tokensSaved: 0,
				itemsCompressed: 0,
				itemsRemoved: 0,
				timestamp: Date.now(),
			}
		}

		// Get compressible items sorted by priority (lowest first)
		const compressibleItems = Array.from(this.items.values())
			.filter((item) => item.compressible)
			.sort((a, b) => a.priority - b.priority)

		const compressionRatio = this.getCompressionRatio(strategy)

		for (const item of compressibleItems) {
			// Check if we should remove or compress
			if (strategy === "emergency" && item.priority < CONTEXT_PRIORITY.NORMAL) {
				// Remove low-priority items in emergency mode
				this.items.delete(item.id)
				itemsRemoved++
			} else if (strategy === "aggressive" && item.priority < CONTEXT_PRIORITY.LOW) {
				// Remove minimal priority items in aggressive mode
				this.items.delete(item.id)
				itemsRemoved++
			} else {
				// Compress the item
				const newTokenCount = Math.ceil(item.tokenCount * (1 - compressionRatio))
				item.tokenCount = Math.max(1, newTokenCount)
				itemsCompressed++
			}
		}

		// Enforce limits on item counts
		itemsRemoved += this.enforceItemLimits(strategy)

		const tokensAfter = this.getTotalTokens()
		const result: CompressionResult = {
			performed: true,
			strategy,
			tokensBefore,
			tokensAfter,
			tokensSaved: tokensBefore - tokensAfter,
			itemsCompressed,
			itemsRemoved,
			timestamp: Date.now(),
		}

		// Emit event
		this.emitEvent("compression_performed", result)

		return result
	}

	/**
	 * Perform archival on context items
	 * @param options - Archival options
	 * @returns Archival result
	 */
	async archive(options?: ArtifactArchivalOptions): Promise<ArchivalResult> {
		const tokensBefore = this.getTotalTokens()
		const artifactIds: string[] = []
		let itemsArchived = 0

		// Get archivable items
		const archivableItems = this.getArchivableItems(options)

		for (const item of archivableItems) {
			if (item.referenceId) {
				artifactIds.push(item.referenceId)
			}
			this.items.delete(item.id)
			itemsArchived++
		}

		const tokensAfter = this.getTotalTokens()
		const result: ArchivalResult = {
			performed: itemsArchived > 0,
			itemsArchived,
			tokensSaved: tokensBefore - tokensAfter,
			artifactIds,
			timestamp: Date.now(),
		}

		// Emit event
		this.emitEvent("archival_performed", result)

		return result
	}

	/**
	 * Estimate tokens for a string
	 * @param text - Text to estimate
	 * @returns Estimated token count
	 */
	estimateTokens(text: string): number {
		if (!text) return 0

		// Simple estimation: characters / chars per token
		const charEstimate = Math.ceil(text.length / TOKEN_ESTIMATION.charsPerToken)

		// Word-based estimation
		const words = text.split(/\s+/).filter((w) => w.length > 0)
		const wordEstimate = Math.ceil(words.length * TOKEN_ESTIMATION.tokensPerWord)

		// Use the higher estimate for safety
		return Math.max(charEstimate, wordEstimate)
	}

	/**
	 * Estimate tokens for an object (JSON)
	 * @param obj - Object to estimate
	 * @returns Estimated token count
	 */
	estimateObjectTokens(obj: unknown): number {
		const json = JSON.stringify(obj)
		return this.estimateTokens(json) + TOKEN_ESTIMATION.jsonOverhead
	}

	/**
	 * Clear all items
	 */
	clear(): void {
		this.items.clear()
		this.emitStatisticsUpdate()
	}

	/**
	 * Dispose of the monitor
	 */
	dispose(): void {
		if (this.disposed) return
		this.disposed = true
		this.items.clear()
		this.removeAllListeners()
	}

	// ============================================================================
	// Private Methods
	// ============================================================================

	/**
	 * Generate unique item ID
	 */
	private generateItemId(): string {
		return `ctx_${++this.itemIdCounter}_${Date.now()}`
	}

	/**
	 * Get total token count
	 */
	private getTotalTokens(): number {
		let total = 0
		for (const item of this.items.values()) {
			total += item.tokenCount
		}
		return total
	}

	/**
	 * Calculate statistics
	 */
	private calculateStatistics(): ContextStatistics {
		const totalTokens = this.getTotalTokens()
		const usagePercentage = (totalTokens / this.config.maxTokens) * 100

		// Calculate by type
		const tokensByType: Record<ContextItemType, number> = {
			user_task: 0,
			workflow_state: 0,
			artifact_summary: 0,
			agent_status: 0,
			workflow_history: 0,
			todo_item: 0,
			mode_description: 0,
			metadata: 0,
		}

		const itemsByType: Record<ContextItemType, number> = {
			user_task: 0,
			workflow_state: 0,
			artifact_summary: 0,
			agent_status: 0,
			workflow_history: 0,
			todo_item: 0,
			mode_description: 0,
			metadata: 0,
		}

		let compressibleItemCount = 0
		let archivableItemCount = 0
		let potentialCompressionSavings = 0
		let potentialArchivalSavings = 0

		for (const item of this.items.values()) {
			tokensByType[item.type] += item.tokenCount
			itemsByType[item.type]++

			if (item.compressible) {
				compressibleItemCount++
				// Estimate 30% savings from compression
				potentialCompressionSavings += Math.floor(item.tokenCount * 0.3)
			}

			if (item.archivable) {
				archivableItemCount++
				potentialArchivalSavings += item.tokenCount
			}
		}

		return {
			totalTokens,
			maxTokens: this.config.maxTokens,
			usagePercentage,
			usageLevel: this.getUsageLevel(usagePercentage),
			tokensByType,
			itemsByType,
			compressibleItemCount,
			archivableItemCount,
			potentialCompressionSavings,
			potentialArchivalSavings,
			calculatedAt: Date.now(),
		}
	}

	/**
	 * Get usage level from percentage
	 */
	private getUsageLevel(percentage: number): ContextUsageLevel {
		if (percentage >= this.config.criticalThreshold) {
			return "critical"
		}
		if (percentage >= this.config.highThreshold) {
			return "high"
		}
		if (percentage >= this.config.warningThreshold) {
			return "elevated"
		}
		return "normal"
	}

	/**
	 * Get compression ratio for strategy
	 */
	private getCompressionRatio(strategy: CompressionStrategy): number {
		switch (strategy) {
			case "light":
				return 0.15
			case "moderate":
				return 0.3
			case "aggressive":
				return 0.5
			case "emergency":
				return 0.7
			default:
				return 0
		}
	}

	/**
	 * Get archivable items
	 */
	private getArchivableItems(options?: ArtifactArchivalOptions): ContextItem[] {
		const now = Date.now()
		const olderThan = options?.olderThan ?? 0
		const belowPriority = options?.belowPriority ?? CONTEXT_PRIORITY.NORMAL
		const keepMinPerType = options?.keepMinPerType ?? this.config.minItemsPerType
		const maxItems = options?.maxItems ?? 50

		// Count items being archived per type
		const archivedPerType = new Map<ContextItemType, number>()

		// Get all items of each type to track what would remain
		const itemsByType = new Map<ContextItemType, ContextItem[]>()
		for (const item of this.items.values()) {
			const items = itemsByType.get(item.type) ?? []
			items.push(item)
			itemsByType.set(item.type, items)
		}

		// Get candidates
		const candidates = Array.from(this.items.values())
			.filter((item) => {
				// Must be archivable
				if (!item.archivable) return false

				// Check priority
				if (item.priority >= belowPriority) return false

				// Check age
				if (olderThan > 0 && now - item.addedAt < olderThan) return false

				// Check specific IDs
				if (options?.artifactIds && item.referenceId) {
					return options.artifactIds.includes(item.referenceId)
				}

				return true
			})
			.sort((a, b) => {
				// Sort by priority (lowest first), then by access time (oldest first)
				if (a.priority !== b.priority) return a.priority - b.priority
				return a.lastAccessedAt - b.lastAccessedAt
			})

		// Filter to keep minimum per type
		const result: ContextItem[] = []
		for (const item of candidates) {
			const totalOfType = itemsByType.get(item.type)?.length ?? 0
			const alreadyArchived = archivedPerType.get(item.type) ?? 0

			// Keep at least minItemsPerType of each type
			if (totalOfType - alreadyArchived > keepMinPerType) {
				result.push(item)
				archivedPerType.set(item.type, alreadyArchived + 1)

				if (result.length >= maxItems) break
			}
		}

		return result
	}

	/**
	 * Get archivable item IDs
	 */
	private getArchivableItemIds(): string[] {
		return this.getArchivableItems({ maxItems: 20 }).map((item) => item.id)
	}

	/**
	 * Enforce item limits based on config
	 */
	private enforceItemLimits(strategy: CompressionStrategy): number {
		let removed = 0

		// Enforce history limit
		const historyItems = this.getItemsByType("workflow_history")
		if (historyItems.length > this.config.maxHistoryEntries) {
			const toRemove = historyItems.length - this.config.maxHistoryEntries
			const sorted = historyItems.sort((a, b) => a.addedAt - b.addedAt)
			for (let i = 0; i < toRemove; i++) {
				this.items.delete(sorted[i].id)
				removed++
			}
		}

		// Enforce artifact summary limit
		const artifactItems = this.getItemsByType("artifact_summary")
		if (artifactItems.length > this.config.maxArtifactSummaries) {
			const toRemove = artifactItems.length - this.config.maxArtifactSummaries
			const sorted = artifactItems.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt)
			for (let i = 0; i < toRemove; i++) {
				this.items.delete(sorted[i].id)
				removed++
			}
		}

		// Enforce todo limit
		const todoItems = this.getItemsByType("todo_item")
		if (todoItems.length > this.config.maxTodoItems) {
			const toRemove = todoItems.length - this.config.maxTodoItems
			const sorted = todoItems.sort((a, b) => a.priority - b.priority)
			for (let i = 0; i < toRemove; i++) {
				this.items.delete(sorted[i].id)
				removed++
			}
		}

		return removed
	}

	/**
	 * Check usage and take automatic action if needed
	 */
	private checkAndAct(): void {
		const stats = this.getStatistics()
		const previousLevel = this.currentUsageLevel

		// Update current level
		this.currentUsageLevel = stats.usageLevel

		// Emit usage changed event if level changed
		if (previousLevel !== stats.usageLevel) {
			this.emitEvent("usage_changed", undefined, stats)
		}

		// Check thresholds and emit events
		if (stats.usageLevel === "critical") {
			this.emitEvent("critical", undefined, stats)

			if (this.config.autoArchive) {
				const action = this.getRecommendedAction()
				if (action.automatic) {
					this.archive().catch((err) => {
						console.error("Auto-archive failed:", err)
					})
				}
			}
		} else if (stats.usageLevel === "high") {
			this.emitEvent("warning", undefined, stats)

			if (this.config.autoCompress) {
				this.compress(this.config.highCompressionStrategy).catch((err) => {
					console.error("Auto-compress failed:", err)
				})
			}
		} else if (stats.usageLevel === "elevated") {
			this.emitEvent("warning", undefined, stats)
		}

		// Check if limit exceeded
		if (stats.totalTokens > this.config.maxTokens) {
			this.emitEvent("limit_exceeded", undefined, stats)
		}
	}

	/**
	 * Emit statistics update event
	 */
	private emitStatisticsUpdate(): void {
		const stats = this.getStatistics()
		this.lastStatistics = stats
		this.emit("statisticsUpdate", stats)
	}

	/**
	 * Emit a context event
	 */
	private emitEvent(
		type: ContextEventType,
		result?: CompressionResult | ArchivalResult,
		statistics?: ContextStatistics,
		data?: Record<string, unknown>,
	): void {
		const event: ContextEvent = {
			type,
			timestamp: Date.now(),
			statistics: statistics ?? this.getStatistics(),
			result,
			data,
		}

		this.emit(type, event)
		this.emit("event", event)
	}
}

// Re-export types
export * from "./types"
