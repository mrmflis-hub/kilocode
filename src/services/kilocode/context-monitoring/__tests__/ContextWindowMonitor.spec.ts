// kilocode_change - new file
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import {
	ContextWindowMonitor,
	DEFAULT_CONTEXT_WINDOW_CONFIG,
	CONTEXT_PRIORITY,
	TOKEN_ESTIMATION,
	CompressionStrategy,
	ContextUsageLevel,
	ContextItemType,
} from "../index"

describe("ContextWindowMonitor", () => {
	let monitor: ContextWindowMonitor

	beforeEach(() => {
		monitor = new ContextWindowMonitor({
			maxTokens: 1000,
			warningThreshold: 60,
			highThreshold: 80,
			criticalThreshold: 90,
			autoCompress: false, // Disable for testing
			autoArchive: false, // Disable for testing
		})
	})

	afterEach(() => {
		monitor.dispose()
	})

	describe("constructor", () => {
		it("should create monitor with default config", () => {
			const defaultMonitor = new ContextWindowMonitor()
			const stats = defaultMonitor.getStatistics()
			expect(stats.maxTokens).toBe(DEFAULT_CONTEXT_WINDOW_CONFIG.maxTokens)
			defaultMonitor.dispose()
		})

		it("should create monitor with custom config", () => {
			const customMonitor = new ContextWindowMonitor({
				maxTokens: 50000,
				warningThreshold: 50,
			})
			const stats = customMonitor.getStatistics()
			expect(stats.maxTokens).toBe(50000)
			customMonitor.dispose()
		})
	})

	describe("addItem", () => {
		it("should add an item and return ID", () => {
			const id = monitor.addItem({
				type: "user_task",
				tokenCount: 100,
				priority: CONTEXT_PRIORITY.CRITICAL,
				compressible: false,
				archivable: false,
			})

			expect(id).toBeDefined()
			expect(id.startsWith("ctx_")).toBe(true)
		})

		it("should track added items in statistics", () => {
			monitor.addItem({
				type: "user_task",
				tokenCount: 100,
				priority: CONTEXT_PRIORITY.CRITICAL,
				compressible: false,
				archivable: false,
			})

			const stats = monitor.getStatistics()
			expect(stats.totalTokens).toBe(100)
			expect(stats.itemsByType.user_task).toBe(1)
		})

		it("should set timestamps on added items", () => {
			const id = monitor.addItem({
				type: "user_task",
				tokenCount: 100,
				priority: CONTEXT_PRIORITY.CRITICAL,
				compressible: false,
				archivable: false,
			})

			const item = monitor.getItem(id)
			expect(item?.addedAt).toBeDefined()
			expect(item?.lastAccessedAt).toBeDefined()
			expect(item?.accessCount).toBe(1)
		})
	})

	describe("removeItem", () => {
		it("should remove an item", () => {
			const id = monitor.addItem({
				type: "user_task",
				tokenCount: 100,
				priority: CONTEXT_PRIORITY.CRITICAL,
				compressible: false,
				archivable: false,
			})

			const removed = monitor.removeItem(id)
			expect(removed).toBe(true)

			const stats = monitor.getStatistics()
			expect(stats.totalTokens).toBe(0)
		})

		it("should return false for non-existent item", () => {
			const removed = monitor.removeItem("non-existent")
			expect(removed).toBe(false)
		})
	})

	describe("touchItem", () => {
		it("should update lastAccessedAt and accessCount", () => {
			const id = monitor.addItem({
				type: "artifact_summary",
				tokenCount: 50,
				priority: CONTEXT_PRIORITY.NORMAL,
				compressible: true,
				archivable: true,
			})

			const before = monitor.getItem(id)
			const beforeAccessedAt = before?.lastAccessedAt

			// Wait a bit
			vi.useFakeTimers()
			vi.advanceTimersByTime(100)

			monitor.touchItem(id)

			const after = monitor.getItem(id)
			expect(after?.lastAccessedAt).toBeGreaterThan(beforeAccessedAt!)
			expect(after?.accessCount).toBe(2)

			vi.useRealTimers()
		})
	})

	describe("updateItemTokens", () => {
		it("should update token count for an item", () => {
			const id = monitor.addItem({
				type: "artifact_summary",
				tokenCount: 50,
				priority: CONTEXT_PRIORITY.NORMAL,
				compressible: true,
				archivable: true,
			})

			monitor.updateItemTokens(id, 100)

			const item = monitor.getItem(id)
			expect(item?.tokenCount).toBe(100)

			const stats = monitor.getStatistics()
			expect(stats.totalTokens).toBe(100)
		})
	})

	describe("getItemsByType", () => {
		it("should return items of specific type", () => {
			monitor.addItem({
				type: "artifact_summary",
				tokenCount: 50,
				priority: CONTEXT_PRIORITY.NORMAL,
				compressible: true,
				archivable: true,
			})

			monitor.addItem({
				type: "artifact_summary",
				tokenCount: 30,
				priority: CONTEXT_PRIORITY.NORMAL,
				compressible: true,
				archivable: true,
			})

			monitor.addItem({
				type: "agent_status",
				tokenCount: 20,
				priority: CONTEXT_PRIORITY.HIGH,
				compressible: false,
				archivable: true,
			})

			const artifactItems = monitor.getItemsByType("artifact_summary")
			expect(artifactItems).toHaveLength(2)

			const agentItems = monitor.getItemsByType("agent_status")
			expect(agentItems).toHaveLength(1)
		})
	})

	describe("getStatistics", () => {
		it("should calculate correct statistics", () => {
			monitor.addItem({
				type: "user_task",
				tokenCount: 100,
				priority: CONTEXT_PRIORITY.CRITICAL,
				compressible: false,
				archivable: false,
			})

			monitor.addItem({
				type: "artifact_summary",
				tokenCount: 200,
				priority: CONTEXT_PRIORITY.NORMAL,
				compressible: true,
				archivable: true,
			})

			const stats = monitor.getStatistics()

			expect(stats.totalTokens).toBe(300)
			expect(stats.maxTokens).toBe(1000)
			expect(stats.usagePercentage).toBe(30)
			expect(stats.usageLevel).toBe("normal")
			expect(stats.tokensByType.user_task).toBe(100)
			expect(stats.tokensByType.artifact_summary).toBe(200)
			expect(stats.itemsByType.user_task).toBe(1)
			expect(stats.itemsByType.artifact_summary).toBe(1)
			expect(stats.compressibleItemCount).toBe(1)
			expect(stats.archivableItemCount).toBe(1)
		})

		it("should calculate usage levels correctly", () => {
			// Normal: < 60%
			monitor.addItem({
				type: "metadata",
				tokenCount: 500,
				priority: CONTEXT_PRIORITY.LOW,
				compressible: true,
				archivable: true,
			})
			expect(monitor.getStatistics().usageLevel).toBe("normal")

			// Elevated: 60-80%
			monitor.addItem({
				type: "metadata",
				tokenCount: 150,
				priority: CONTEXT_PRIORITY.LOW,
				compressible: true,
				archivable: true,
			})
			expect(monitor.getStatistics().usageLevel).toBe("elevated")

			// High: 80-90%
			monitor.addItem({
				type: "metadata",
				tokenCount: 150,
				priority: CONTEXT_PRIORITY.LOW,
				compressible: true,
				archivable: true,
			})
			expect(monitor.getStatistics().usageLevel).toBe("high")

			// Critical: >= 90%
			monitor.addItem({
				type: "metadata",
				tokenCount: 100,
				priority: CONTEXT_PRIORITY.LOW,
				compressible: true,
				archivable: true,
			})
			expect(monitor.getStatistics().usageLevel).toBe("critical")
		})
	})

	describe("getRecommendedAction", () => {
		it("should return none for normal usage", () => {
			monitor.addItem({
				type: "user_task",
				tokenCount: 100,
				priority: CONTEXT_PRIORITY.CRITICAL,
				compressible: false,
				archivable: false,
			})

			const action = monitor.getRecommendedAction()
			expect(action.type).toBe("none")
			expect(action.priority).toBe("low")
		})

		it("should return compress for elevated usage", () => {
			monitor.addItem({
				type: "metadata",
				tokenCount: 650,
				priority: CONTEXT_PRIORITY.LOW,
				compressible: true,
				archivable: true,
			})

			const action = monitor.getRecommendedAction()
			expect(action.type).toBe("compress")
			expect(action.strategy).toBe("light")
		})

		it("should return compress for high usage", () => {
			monitor.addItem({
				type: "metadata",
				tokenCount: 850,
				priority: CONTEXT_PRIORITY.LOW,
				compressible: true,
				archivable: true,
			})

			const action = monitor.getRecommendedAction()
			expect(action.type).toBe("compress")
			expect(action.strategy).toBe("moderate")
		})

		it("should return archive for critical usage", () => {
			monitor.addItem({
				type: "metadata",
				tokenCount: 950,
				priority: CONTEXT_PRIORITY.LOW,
				compressible: true,
				archivable: true,
			})

			const action = monitor.getRecommendedAction()
			expect(action.type).toBe("archive")
			expect(action.priority).toBe("critical")
		})
	})

	describe("compress", () => {
		it("should return not performed for none strategy", async () => {
			const result = await monitor.compress("none")

			expect(result.performed).toBe(false)
			expect(result.tokensSaved).toBe(0)
		})

		it("should compress items with light strategy", async () => {
			monitor.addItem({
				type: "artifact_summary",
				tokenCount: 100,
				priority: CONTEXT_PRIORITY.NORMAL,
				compressible: true,
				archivable: true,
			})

			const result = await monitor.compress("light")

			expect(result.performed).toBe(true)
			expect(result.strategy).toBe("light")
			expect(result.tokensBefore).toBe(100)
			expect(result.tokensAfter).toBeLessThan(100)
			expect(result.tokensSaved).toBeGreaterThan(0)
			expect(result.itemsCompressed).toBe(1)
		})

		it("should compress more aggressively with moderate strategy", async () => {
			monitor.addItem({
				type: "artifact_summary",
				tokenCount: 100,
				priority: CONTEXT_PRIORITY.NORMAL,
				compressible: true,
				archivable: true,
			})

			const lightResult = await monitor.compress("light")
			// Reset
			monitor.dispose()
			const newMonitor = new ContextWindowMonitor({ maxTokens: 1000 })
			newMonitor.addItem({
				type: "artifact_summary",
				tokenCount: 100,
				priority: CONTEXT_PRIORITY.NORMAL,
				compressible: true,
				archivable: true,
			})

			const moderateResult = await newMonitor.compress("moderate")

			expect(moderateResult.tokensSaved).toBeGreaterThan(lightResult.tokensSaved)
			newMonitor.dispose()
		})

		it("should remove low priority items in aggressive strategy", async () => {
			monitor.addItem({
				type: "metadata",
				tokenCount: 100,
				priority: CONTEXT_PRIORITY.MINIMAL,
				compressible: true,
				archivable: true,
			})

			const result = await monitor.compress("aggressive")

			expect(result.performed).toBe(true)
			expect(result.itemsRemoved).toBeGreaterThan(0)
		})

		it("should remove more items in emergency strategy", async () => {
			monitor.addItem({
				type: "metadata",
				tokenCount: 100,
				priority: CONTEXT_PRIORITY.LOW,
				compressible: true,
				archivable: true,
			})

			monitor.addItem({
				type: "metadata",
				tokenCount: 100,
				priority: CONTEXT_PRIORITY.MINIMAL,
				compressible: true,
				archivable: true,
			})

			const result = await monitor.compress("emergency")

			expect(result.performed).toBe(true)
			expect(result.itemsRemoved).toBeGreaterThan(0)
		})

		it("should emit compression_performed event", async () => {
			const handler = vi.fn()
			monitor.on("compression_performed", handler)

			monitor.addItem({
				type: "artifact_summary",
				tokenCount: 100,
				priority: CONTEXT_PRIORITY.NORMAL,
				compressible: true,
				archivable: true,
			})

			await monitor.compress("light")

			expect(handler).toHaveBeenCalled()
			const event = handler.mock.calls[0][0]
			expect(event.type).toBe("compression_performed")
			expect(event.result).toBeDefined()
		})
	})

	describe("archive", () => {
		it("should archive archivable items", async () => {
			monitor.addItem({
				type: "artifact_summary",
				tokenCount: 100,
				priority: CONTEXT_PRIORITY.LOW,
				compressible: true,
				archivable: true,
				referenceId: "artifact_1",
			})

			const result = await monitor.archive({ keepMinPerType: 0 })

			expect(result.performed).toBe(true)
			expect(result.itemsArchived).toBe(1)
			expect(result.tokensSaved).toBe(100)
			expect(result.artifactIds).toContain("artifact_1")
		})

		it("should respect maxItems option", async () => {
			for (let i = 0; i < 10; i++) {
				monitor.addItem({
					type: "artifact_summary",
					tokenCount: 50,
					priority: CONTEXT_PRIORITY.LOW,
					compressible: true,
					archivable: true,
					referenceId: `artifact_${i}`,
				})
			}

			const result = await monitor.archive({ maxItems: 3 })

			expect(result.itemsArchived).toBe(3)
		})

		it("should respect olderThan option", async () => {
			vi.useFakeTimers()

			// Add old item
			monitor.addItem({
				type: "artifact_summary",
				tokenCount: 50,
				priority: CONTEXT_PRIORITY.LOW,
				compressible: true,
				archivable: true,
				referenceId: "old_artifact",
			})

			// Advance time
			vi.advanceTimersByTime(10000)

			// Add new item
			monitor.addItem({
				type: "artifact_summary",
				tokenCount: 50,
				priority: CONTEXT_PRIORITY.LOW,
				compressible: true,
				archivable: true,
				referenceId: "new_artifact",
			})

			const result = await monitor.archive({ olderThan: 5000, keepMinPerType: 0 })

			expect(result.artifactIds).toContain("old_artifact")
			expect(result.artifactIds).not.toContain("new_artifact")

			vi.useRealTimers()
		})

		it("should respect belowPriority option", async () => {
			monitor.addItem({
				type: "artifact_summary",
				tokenCount: 50,
				priority: CONTEXT_PRIORITY.HIGH,
				compressible: true,
				archivable: true,
				referenceId: "high_priority",
			})

			monitor.addItem({
				type: "artifact_summary",
				tokenCount: 50,
				priority: CONTEXT_PRIORITY.LOW,
				compressible: true,
				archivable: true,
				referenceId: "low_priority",
			})

			const result = await monitor.archive({ belowPriority: CONTEXT_PRIORITY.NORMAL, keepMinPerType: 0 })

			expect(result.artifactIds).toContain("low_priority")
			expect(result.artifactIds).not.toContain("high_priority")
		})

		it("should emit archival_performed event", async () => {
			const handler = vi.fn()
			monitor.on("archival_performed", handler)

			monitor.addItem({
				type: "artifact_summary",
				tokenCount: 100,
				priority: CONTEXT_PRIORITY.LOW,
				compressible: true,
				archivable: true,
				referenceId: "artifact_1",
			})

			await monitor.archive()

			expect(handler).toHaveBeenCalled()
			const event = handler.mock.calls[0][0]
			expect(event.type).toBe("archival_performed")
		})
	})

	describe("estimateTokens", () => {
		it("should estimate tokens for text", () => {
			const text = "This is a test string with multiple words"
			const tokens = monitor.estimateTokens(text)

			// Should be roughly words * tokensPerWord
			const wordCount = text.split(/\s+/).length
			expect(tokens).toBeGreaterThanOrEqual(Math.ceil(wordCount * TOKEN_ESTIMATION.tokensPerWord))
		})

		it("should return 0 for empty string", () => {
			expect(monitor.estimateTokens("")).toBe(0)
		})
	})

	describe("estimateObjectTokens", () => {
		it("should estimate tokens for objects", () => {
			const obj = { key: "value", nested: { data: 123 } }
			const tokens = monitor.estimateObjectTokens(obj)

			// Should include JSON overhead
			expect(tokens).toBeGreaterThan(TOKEN_ESTIMATION.jsonOverhead)
		})
	})

	describe("clear", () => {
		it("should clear all items", () => {
			monitor.addItem({
				type: "user_task",
				tokenCount: 100,
				priority: CONTEXT_PRIORITY.CRITICAL,
				compressible: false,
				archivable: false,
			})

			monitor.clear()

			const stats = monitor.getStatistics()
			expect(stats.totalTokens).toBe(0)
		})
	})

	describe("events", () => {
		it("should emit usage_changed event when level changes", () => {
			const handler = vi.fn()
			monitor.on("usage_changed", handler)

			// Add items to trigger level change
			monitor.addItem({
				type: "metadata",
				tokenCount: 700,
				priority: CONTEXT_PRIORITY.LOW,
				compressible: true,
				archivable: true,
			})

			expect(handler).toHaveBeenCalled()
		})

		it("should emit warning event at elevated level", () => {
			const handler = vi.fn()
			monitor.on("warning", handler)

			monitor.addItem({
				type: "metadata",
				tokenCount: 650,
				priority: CONTEXT_PRIORITY.LOW,
				compressible: true,
				archivable: true,
			})

			expect(handler).toHaveBeenCalled()
		})

		it("should emit critical event at critical level", () => {
			const handler = vi.fn()
			monitor.on("critical", handler)

			monitor.addItem({
				type: "metadata",
				tokenCount: 950,
				priority: CONTEXT_PRIORITY.LOW,
				compressible: true,
				archivable: true,
			})

			expect(handler).toHaveBeenCalled()
		})

		it("should emit limit_exceeded event when over max", () => {
			const handler = vi.fn()
			monitor.on("limit_exceeded", handler)

			monitor.addItem({
				type: "metadata",
				tokenCount: 1100, // Over max of 1000
				priority: CONTEXT_PRIORITY.LOW,
				compressible: true,
				archivable: true,
			})

			expect(handler).toHaveBeenCalled()
		})
	})

	describe("auto actions", () => {
		it("should auto-compress when enabled", async () => {
			vi.useFakeTimers()

			const autoMonitor = new ContextWindowMonitor({
				maxTokens: 1000,
				autoCompress: true,
				autoArchive: false,
			})

			const handler = vi.fn()
			autoMonitor.on("compression_performed", handler)

			// Add items to trigger high usage
			autoMonitor.addItem({
				type: "metadata",
				tokenCount: 850,
				priority: CONTEXT_PRIORITY.LOW,
				compressible: true,
				archivable: true,
			})

			// Allow async operations
			await vi.runAllTimersAsync()

			expect(handler).toHaveBeenCalled()

			autoMonitor.dispose()
			vi.useRealTimers()
		})

		it("should auto-archive when enabled at critical level", async () => {
			vi.useFakeTimers()

			const autoMonitor = new ContextWindowMonitor({
				maxTokens: 1000,
				autoCompress: false,
				autoArchive: true,
			})

			const handler = vi.fn()
			autoMonitor.on("archival_performed", handler)

			// Add items to trigger critical usage
			autoMonitor.addItem({
				type: "artifact_summary",
				tokenCount: 950,
				priority: CONTEXT_PRIORITY.LOW,
				compressible: true,
				archivable: true,
				referenceId: "artifact_1",
			})

			// Allow async operations
			await vi.runAllTimersAsync()

			expect(handler).toHaveBeenCalled()

			autoMonitor.dispose()
			vi.useRealTimers()
		})
	})

	describe("dispose", () => {
		it("should clean up resources", () => {
			monitor.addItem({
				type: "user_task",
				tokenCount: 100,
				priority: CONTEXT_PRIORITY.CRITICAL,
				compressible: false,
				archivable: false,
			})

			monitor.dispose()

			// Should not throw after dispose
			expect(() => monitor.getStatistics()).not.toThrow()
		})
	})
})
