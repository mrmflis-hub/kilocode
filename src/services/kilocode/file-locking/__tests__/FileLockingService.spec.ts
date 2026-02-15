// kilocode_change - new file
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { FileLockingService } from "../FileLockingService"
import type { LockEvent, AcquireLockResult, LockStatusInfo, FileLock } from "../types"

describe("FileLockingService", () => {
	let service: FileLockingService

	beforeEach(() => {
		service = new FileLockingService({
			defaultTimeoutMs: 5000,
			defaultMaxWaitMs: 1000,
			expirationCheckIntervalMs: 100,
		})
	})

	afterEach(() => {
		service.dispose()
	})

	describe("acquireLock", () => {
		it("should acquire a write lock successfully", async () => {
			const result = await service.acquireLock({
				filePath: "/test/file.ts",
				agentId: "agent-1",
				mode: "write",
			})

			expect(result.success).toBe(true)
			expect(result.lockId).toBeDefined()
			expect(result.waitedMs).toBeGreaterThanOrEqual(0)
			expect(result.retries).toBe(0)
		})

		it("should acquire a read lock successfully", async () => {
			const result = await service.acquireLock({
				filePath: "/test/file.ts",
				agentId: "agent-1",
				mode: "read",
			})

			expect(result.success).toBe(true)
			expect(result.lockId).toBeDefined()
		})

		it("should fail to acquire lock when file is write-locked by another agent", async () => {
			// First agent acquires write lock
			const result1 = await service.acquireLock({
				filePath: "/test/file.ts",
				agentId: "agent-1",
				mode: "write",
				maxWaitMs: 100, // Short wait for test
			})
			expect(result1.success).toBe(true)

			// Second agent tries to acquire lock
			const result2 = await service.acquireLock({
				filePath: "/test/file.ts",
				agentId: "agent-2",
				mode: "write",
				maxWaitMs: 100,
				retryDelayMs: 50,
			})

			expect(result2.success).toBe(false)
			expect(result2.error).toBeDefined()
			expect(result2.conflict).toBeDefined()
			expect(result2.conflict?.conflictingAgentId).toBe("agent-1")
		})

		it("should fail when trying to write-lock a read-locked file", async () => {
			// First agent acquires read lock
			const result1 = await service.acquireLock({
				filePath: "/test/file.ts",
				agentId: "agent-1",
				mode: "read",
			})
			expect(result1.success).toBe(true)

			// Second agent tries to acquire write lock
			const result2 = await service.acquireLock({
				filePath: "/test/file.ts",
				agentId: "agent-2",
				mode: "write",
				maxWaitMs: 100,
				retryDelayMs: 50,
			})

			expect(result2.success).toBe(false)
			expect(result2.conflict?.conflictingMode).toBe("read")
		})

		it("should return conflict information on failure", async () => {
			await service.acquireLock({
				filePath: "/test/file.ts",
				agentId: "agent-1",
				mode: "write",
			})

			const result = await service.acquireLock({
				filePath: "/test/file.ts",
				agentId: "agent-2",
				mode: "write",
				maxWaitMs: 100,
				retryDelayMs: 50,
			})

			expect(result.conflict).toEqual({
				filePath: "/test/file.ts",
				conflictingAgentId: "agent-1",
				conflictingMode: "write",
				requestedMode: "write",
				detectedAt: expect.any(Number),
			})
		})

		it("should use exponential backoff for retries", async () => {
			await service.acquireLock({
				filePath: "/test/file.ts",
				agentId: "agent-1",
				mode: "write",
			})

			const startTime = Date.now()
			await service.acquireLock({
				filePath: "/test/file.ts",
				agentId: "agent-2",
				mode: "write",
				maxWaitMs: 500,
				retryDelayMs: 50,
				maxRetryDelayMs: 200,
				backoffMultiplier: 2,
			})
			const elapsed = Date.now() - startTime

			// Should have waited approximately maxWaitMs
			expect(elapsed).toBeGreaterThanOrEqual(400)
		})
	})

	describe("releaseLock", () => {
		it("should release a lock successfully", async () => {
			const result = await service.acquireLock({
				filePath: "/test/file.ts",
				agentId: "agent-1",
				mode: "write",
			})
			expect(result.success).toBe(true)

			const released = service.releaseLock(result.lockId!)
			expect(released).toBe(true)

			// Should be able to acquire lock again
			const result2 = await service.acquireLock({
				filePath: "/test/file.ts",
				agentId: "agent-2",
				mode: "write",
			})
			expect(result2.success).toBe(true)
		})

		it("should return false for non-existent lock", () => {
			const released = service.releaseLock("non-existent-lock")
			expect(released).toBe(false)
		})

		it("should allow waiting agent to acquire lock after release", async () => {
			// First agent acquires lock
			const result1 = await service.acquireLock({
				filePath: "/test/file.ts",
				agentId: "agent-1",
				mode: "write",
			})

			// Second agent starts waiting
			const acquirePromise = service.acquireLock({
				filePath: "/test/file.ts",
				agentId: "agent-2",
				mode: "write",
				maxWaitMs: 2000,
				retryDelayMs: 100,
			})

			// Wait a bit then release first lock
			await new Promise((resolve) => setTimeout(resolve, 200))
			service.releaseLock(result1.lockId!)

			// Second agent should now acquire the lock
			const result2 = await acquirePromise
			expect(result2.success).toBe(true)
		})
	})

	describe("releaseAllLocksForAgent", () => {
		it("should release all locks held by an agent", async () => {
			await service.acquireLock({
				filePath: "/test/file1.ts",
				agentId: "agent-1",
				mode: "write",
			})
			await service.acquireLock({
				filePath: "/test/file2.ts",
				agentId: "agent-1",
				mode: "write",
			})

			const releasedCount = service.releaseAllLocksForAgent("agent-1")
			expect(releasedCount).toBe(2)

			expect(service.isLocked("/test/file1.ts")).toBe(false)
			expect(service.isLocked("/test/file2.ts")).toBe(false)
		})

		it("should return 0 if agent has no locks", () => {
			const releasedCount = service.releaseAllLocksForAgent("unknown-agent")
			expect(releasedCount).toBe(0)
		})
	})

	describe("getLockStatus", () => {
		it("should return correct status for locked file", async () => {
			await service.acquireLock({
				filePath: "/test/file.ts",
				agentId: "agent-1",
				mode: "write",
				description: "Test lock",
			})

			const status = service.getLockStatus("/test/file.ts")

			expect(status).toEqual({
				filePath: "/test/file.ts",
				isLocked: true,
				lockHolder: "agent-1",
				lockMode: "write",
				waitingCount: 0,
				waitingAgents: [],
			})
		})

		it("should return correct status for unlocked file", () => {
			const status = service.getLockStatus("/test/unlocked.ts")

			expect(status).toEqual({
				filePath: "/test/unlocked.ts",
				isLocked: false,
				lockHolder: undefined,
				lockMode: undefined,
				waitingCount: 0,
				waitingAgents: [],
			})
		})
	})

	describe("isLocked", () => {
		it("should return true for locked file", async () => {
			await service.acquireLock({
				filePath: "/test/file.ts",
				agentId: "agent-1",
				mode: "write",
			})

			expect(service.isLocked("/test/file.ts")).toBe(true)
		})

		it("should return false for unlocked file", () => {
			expect(service.isLocked("/test/unlocked.ts")).toBe(false)
		})
	})

	describe("agentHasLocks", () => {
		it("should return true if agent has locks", async () => {
			await service.acquireLock({
				filePath: "/test/file.ts",
				agentId: "agent-1",
				mode: "write",
			})

			expect(service.agentHasLocks("agent-1")).toBe(true)
		})

		it("should return false if agent has no locks", () => {
			expect(service.agentHasLocks("unknown-agent")).toBe(false)
		})
	})

	describe("getLocksForAgent", () => {
		it("should return all locks for an agent", async () => {
			await service.acquireLock({
				filePath: "/test/file1.ts",
				agentId: "agent-1",
				mode: "write",
			})
			await service.acquireLock({
				filePath: "/test/file2.ts",
				agentId: "agent-1",
				mode: "read",
			})

			const locks = service.getLocksForAgent("agent-1")

			expect(locks).toHaveLength(2)
			expect(locks.map((l) => l.filePath)).toContain("/test/file1.ts")
			expect(locks.map((l) => l.filePath)).toContain("/test/file2.ts")
		})

		it("should return empty array for agent with no locks", () => {
			const locks = service.getLocksForAgent("unknown-agent")
			expect(locks).toHaveLength(0)
		})
	})

	describe("getAllLocks", () => {
		it("should return all active locks", async () => {
			await service.acquireLock({
				filePath: "/test/file1.ts",
				agentId: "agent-1",
				mode: "write",
			})
			await service.acquireLock({
				filePath: "/test/file2.ts",
				agentId: "agent-2",
				mode: "write",
			})

			const locks = service.getAllLocks()

			expect(locks).toHaveLength(2)
		})
	})

	describe("events", () => {
		it("should emit acquired event when lock is acquired", async () => {
			const handler = vi.fn()
			service.subscribe(handler)

			await service.acquireLock({
				filePath: "/test/file.ts",
				agentId: "agent-1",
				mode: "write",
			})

			expect(handler).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "acquired",
					filePath: "/test/file.ts",
					agentId: "agent-1",
				}),
			)
		})

		it("should emit released event when lock is released", async () => {
			const handler = vi.fn()
			service.subscribe(handler)

			const result = await service.acquireLock({
				filePath: "/test/file.ts",
				agentId: "agent-1",
				mode: "write",
			})

			handler.mockClear()

			service.releaseLock(result.lockId!)

			expect(handler).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "released",
					filePath: "/test/file.ts",
					agentId: "agent-1",
					lockId: result.lockId,
				}),
			)
		})

		it("should emit conflict event when lock conflict occurs", async () => {
			const handler = vi.fn()
			service.subscribe(handler)

			await service.acquireLock({
				filePath: "/test/file.ts",
				agentId: "agent-1",
				mode: "write",
			})

			handler.mockClear()

			await service.acquireLock({
				filePath: "/test/file.ts",
				agentId: "agent-2",
				mode: "write",
				maxWaitMs: 50,
				retryDelayMs: 20,
			})

			expect(handler).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "conflict",
					filePath: "/test/file.ts",
					agentId: "agent-2",
				}),
			)
		})

		it("should emit timeout event when lock acquisition times out", async () => {
			const handler = vi.fn()
			service.subscribe(handler)

			await service.acquireLock({
				filePath: "/test/file.ts",
				agentId: "agent-1",
				mode: "write",
			})

			handler.mockClear()

			await service.acquireLock({
				filePath: "/test/file.ts",
				agentId: "agent-2",
				mode: "write",
				maxWaitMs: 50,
				retryDelayMs: 20,
			})

			expect(handler).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "timeout",
					filePath: "/test/file.ts",
					agentId: "agent-2",
				}),
			)
		})

		it("should emit waiting event during retries", async () => {
			const handler = vi.fn()
			service.subscribe(handler)

			await service.acquireLock({
				filePath: "/test/file.ts",
				agentId: "agent-1",
				mode: "write",
			})

			handler.mockClear()

			await service.acquireLock({
				filePath: "/test/file.ts",
				agentId: "agent-2",
				mode: "write",
				maxWaitMs: 100,
				retryDelayMs: 30,
			})

			expect(handler).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "waiting",
					filePath: "/test/file.ts",
					agentId: "agent-2",
				}),
			)
		})

		it("should unsubscribe from events", async () => {
			const handler = vi.fn()
			service.subscribe(handler)
			service.unsubscribe(handler)

			await service.acquireLock({
				filePath: "/test/file.ts",
				agentId: "agent-1",
				mode: "write",
			})

			expect(handler).not.toHaveBeenCalled()
		})
	})

	describe("lock expiration", () => {
		it("should automatically release expired locks", async () => {
			service.dispose() // Dispose default service

			service = new FileLockingService({
				defaultTimeoutMs: 100, // 100ms timeout
				expirationCheckIntervalMs: 50, // Check every 50ms
			})

			await service.acquireLock({
				filePath: "/test/file.ts",
				agentId: "agent-1",
				mode: "write",
				timeoutMs: 100,
			})

			expect(service.isLocked("/test/file.ts")).toBe(true)

			// Wait for expiration
			await new Promise((resolve) => setTimeout(resolve, 200))

			expect(service.isLocked("/test/file.ts")).toBe(false)
		})
	})

	describe("dispose", () => {
		it("should clean up all resources", async () => {
			await service.acquireLock({
				filePath: "/test/file.ts",
				agentId: "agent-1",
				mode: "write",
			})

			service.dispose()

			expect(service.getAllLocks()).toHaveLength(0)
		})

		it("should clear all event listeners", async () => {
			const handler = vi.fn()
			service.subscribe(handler)

			service.dispose()

			// After dispose, no events should be emitted
			await service.acquireLock({
				filePath: "/test/file.ts",
				agentId: "agent-1",
				mode: "write",
			})

			expect(handler).not.toHaveBeenCalled()
		})
	})

	describe("concurrent access", () => {
		it("should handle multiple concurrent lock requests", async () => {
			const promises = []

			for (let i = 0; i < 5; i++) {
				promises.push(
					service.acquireLock({
						filePath: "/test/file.ts",
						agentId: `agent-${i}`,
						mode: "write",
						maxWaitMs: 500,
						retryDelayMs: 50,
					}),
				)
			}

			const results = await Promise.all(promises)

			// Only one should succeed
			const successCount = results.filter((r) => r.success).length
			expect(successCount).toBe(1)
		})

		it("should handle multiple files concurrently", async () => {
			const promises = []

			for (let i = 0; i < 5; i++) {
				promises.push(
					service.acquireLock({
						filePath: `/test/file${i}.ts`,
						agentId: `agent-${i}`,
						mode: "write",
					}),
				)
			}

			const results = await Promise.all(promises)

			// All should succeed (different files)
			const successCount = results.filter((r) => r.success).length
			expect(successCount).toBe(5)
		})
	})
})
