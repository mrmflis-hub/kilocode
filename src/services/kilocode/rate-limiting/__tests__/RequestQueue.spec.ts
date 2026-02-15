// kilocode_change - new file
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { RequestQueue } from "../RequestQueue"
import type { RateLimitEvent, QueuedRequest } from "../types"

describe("RequestQueue", () => {
	let queue: RequestQueue

	beforeEach(() => {
		queue = new RequestQueue({
			maxSize: 10,
			defaultTimeoutMs: 5000,
			enablePriority: true,
		})
	})

	afterEach(() => {
		queue.dispose()
	})

	describe("enqueue", () => {
		it("should enqueue a request successfully", () => {
			const requestId = queue.enqueue({
				agentId: "agent-1",
				providerId: "provider-1",
				priority: "normal",
				estimatedTokens: 1000,
			})

			expect(requestId).toBeDefined()
			expect(requestId).toMatch(/^req_\d+_\d+$/)
			expect(queue.size).toBe(1)
		})

		it("should return null when queue is full", () => {
			const smallQueue = new RequestQueue({
				maxSize: 2,
				defaultTimeoutMs: 5000,
				enablePriority: true,
			})

			smallQueue.enqueue({
				agentId: "agent-1",
				providerId: "provider-1",
				priority: "normal",
				estimatedTokens: 1000,
			})
			smallQueue.enqueue({
				agentId: "agent-2",
				providerId: "provider-1",
				priority: "normal",
				estimatedTokens: 1000,
			})

			const result = smallQueue.enqueue({
				agentId: "agent-3",
				providerId: "provider-1",
				priority: "normal",
				estimatedTokens: 1000,
			})

			expect(result).toBeNull()
			expect(smallQueue.size).toBe(2)
			smallQueue.dispose()
		})

		it("should order requests by priority", () => {
			queue.enqueue({
				agentId: "agent-1",
				providerId: "provider-1",
				priority: "low",
				estimatedTokens: 1000,
			})
			queue.enqueue({
				agentId: "agent-2",
				providerId: "provider-1",
				priority: "critical",
				estimatedTokens: 1000,
			})
			queue.enqueue({
				agentId: "agent-3",
				providerId: "provider-1",
				priority: "high",
				estimatedTokens: 1000,
			})

			const first = queue.dequeue()
			const second = queue.dequeue()
			const third = queue.dequeue()

			expect(first?.agentId).toBe("agent-2") // critical
			expect(second?.agentId).toBe("agent-3") // high
			expect(third?.agentId).toBe("agent-1") // low
		})

		it("should maintain FIFO order for same priority", () => {
			queue.enqueue({
				agentId: "agent-1",
				providerId: "provider-1",
				priority: "normal",
				estimatedTokens: 1000,
			})
			queue.enqueue({
				agentId: "agent-2",
				providerId: "provider-1",
				priority: "normal",
				estimatedTokens: 1000,
			})
			queue.enqueue({
				agentId: "agent-3",
				providerId: "provider-1",
				priority: "normal",
				estimatedTokens: 1000,
			})

			const first = queue.dequeue()
			const second = queue.dequeue()
			const third = queue.dequeue()

			expect(first?.agentId).toBe("agent-1")
			expect(second?.agentId).toBe("agent-2")
			expect(third?.agentId).toBe("agent-3")
		})

		it("should emit request_queued event", () => {
			const handler = vi.fn()
			queue.subscribe(handler)

			queue.enqueue({
				agentId: "agent-1",
				providerId: "provider-1",
				priority: "normal",
				estimatedTokens: 1000,
			})

			expect(handler).toHaveBeenCalledTimes(1)
			const event = handler.mock.calls[0][0] as RateLimitEvent
			expect(event.type).toBe("request_queued")
			expect(event.agentId).toBe("agent-1")
			expect(event.providerId).toBe("provider-1")
		})
	})

	describe("dequeue", () => {
		it("should return null when queue is empty", () => {
			expect(queue.dequeue()).toBeNull()
		})

		it("should return and remove the first request", () => {
			queue.enqueue({
				agentId: "agent-1",
				providerId: "provider-1",
				priority: "normal",
				estimatedTokens: 1000,
			})

			const request = queue.dequeue()

			expect(request).toBeDefined()
			expect(request?.agentId).toBe("agent-1")
			expect(queue.size).toBe(0)
		})
	})

	describe("peek", () => {
		it("should return null when queue is empty", () => {
			expect(queue.peek()).toBeNull()
		})

		it("should return the first request without removing it", () => {
			queue.enqueue({
				agentId: "agent-1",
				providerId: "provider-1",
				priority: "normal",
				estimatedTokens: 1000,
			})

			const request = queue.peek()

			expect(request).toBeDefined()
			expect(request?.agentId).toBe("agent-1")
			expect(queue.size).toBe(1)
		})
	})

	describe("remove", () => {
		it("should remove a specific request", () => {
			const requestId = queue.enqueue({
				agentId: "agent-1",
				providerId: "provider-1",
				priority: "normal",
				estimatedTokens: 1000,
			})

			const removed = queue.remove(requestId!)

			expect(removed).toBe(true)
			expect(queue.size).toBe(0)
		})

		it("should return false if request not found", () => {
			const removed = queue.remove("non-existent")
			expect(removed).toBe(false)
		})

		it("should emit request_rejected event when removed", () => {
			const handler = vi.fn()
			queue.subscribe(handler)

			const requestId = queue.enqueue({
				agentId: "agent-1",
				providerId: "provider-1",
				priority: "normal",
				estimatedTokens: 1000,
			})

			handler.mockClear()
			queue.remove(requestId!)

			expect(handler).toHaveBeenCalledTimes(1)
			const event = handler.mock.calls[0][0] as RateLimitEvent
			expect(event.type).toBe("request_rejected")
		})
	})

	describe("getRequest", () => {
		it("should return the request by ID", () => {
			const requestId = queue.enqueue({
				agentId: "agent-1",
				providerId: "provider-1",
				priority: "normal",
				estimatedTokens: 1000,
			})

			const request = queue.getRequest(requestId!)

			expect(request).toBeDefined()
			expect(request?.requestId).toBe(requestId)
		})

		it("should return null if request not found", () => {
			const request = queue.getRequest("non-existent")
			expect(request).toBeNull()
		})
	})

	describe("getRequestsForAgent", () => {
		it("should return all requests for a specific agent", () => {
			queue.enqueue({
				agentId: "agent-1",
				providerId: "provider-1",
				priority: "normal",
				estimatedTokens: 1000,
			})
			queue.enqueue({
				agentId: "agent-1",
				providerId: "provider-2",
				priority: "high",
				estimatedTokens: 2000,
			})
			queue.enqueue({
				agentId: "agent-2",
				providerId: "provider-1",
				priority: "normal",
				estimatedTokens: 1000,
			})

			const requests = queue.getRequestsForAgent("agent-1")

			expect(requests).toHaveLength(2)
			expect(requests.every((r) => r.agentId === "agent-1")).toBe(true)
		})

		it("should return empty array if no requests for agent", () => {
			const requests = queue.getRequestsForAgent("non-existent")
			expect(requests).toHaveLength(0)
		})
	})

	describe("getRequestsForProvider", () => {
		it("should return all requests for a specific provider", () => {
			queue.enqueue({
				agentId: "agent-1",
				providerId: "provider-1",
				priority: "normal",
				estimatedTokens: 1000,
			})
			queue.enqueue({
				agentId: "agent-2",
				providerId: "provider-1",
				priority: "high",
				estimatedTokens: 2000,
			})
			queue.enqueue({
				agentId: "agent-1",
				providerId: "provider-2",
				priority: "normal",
				estimatedTokens: 1000,
			})

			const requests = queue.getRequestsForProvider("provider-1")

			expect(requests).toHaveLength(2)
			expect(requests.every((r) => r.providerId === "provider-1")).toBe(true)
		})
	})

	describe("getQueuePosition", () => {
		it("should return the position of a request", () => {
			const id1 = queue.enqueue({
				agentId: "agent-1",
				providerId: "provider-1",
				priority: "normal",
				estimatedTokens: 1000,
			})
			const id2 = queue.enqueue({
				agentId: "agent-2",
				providerId: "provider-1",
				priority: "normal",
				estimatedTokens: 1000,
			})

			expect(queue.getQueuePosition(id1!)).toBe(1)
			expect(queue.getQueuePosition(id2!)).toBe(2)
		})

		it("should return -1 if request not found", () => {
			expect(queue.getQueuePosition("non-existent")).toBe(-1)
		})
	})

	describe("getStats", () => {
		it("should return queue statistics", () => {
			queue.enqueue({
				agentId: "agent-1",
				providerId: "provider-1",
				priority: "critical",
				estimatedTokens: 1000,
			})
			queue.enqueue({
				agentId: "agent-2",
				providerId: "provider-1",
				priority: "high",
				estimatedTokens: 2000,
			})
			queue.enqueue({
				agentId: "agent-3",
				providerId: "provider-2",
				priority: "normal",
				estimatedTokens: 1500,
			})

			const stats = queue.getStats()

			expect(stats.totalRequests).toBe(3)
			expect(stats.byPriority.critical).toBe(1)
			expect(stats.byPriority.high).toBe(1)
			expect(stats.byPriority.normal).toBe(1)
			expect(stats.byPriority.low).toBe(0)
			expect(stats.byProvider["provider-1"]).toBe(2)
			expect(stats.byProvider["provider-2"]).toBe(1)
		})
	})

	describe("clear", () => {
		it("should clear all requests", () => {
			queue.enqueue({
				agentId: "agent-1",
				providerId: "provider-1",
				priority: "normal",
				estimatedTokens: 1000,
			})
			queue.enqueue({
				agentId: "agent-2",
				providerId: "provider-1",
				priority: "high",
				estimatedTokens: 2000,
			})

			queue.clear()

			expect(queue.size).toBe(0)
			expect(queue.isEmpty).toBe(true)
		})

		it("should emit request_rejected event for each cleared request", () => {
			const handler = vi.fn()
			queue.subscribe(handler)

			queue.enqueue({
				agentId: "agent-1",
				providerId: "provider-1",
				priority: "normal",
				estimatedTokens: 1000,
			})
			queue.enqueue({
				agentId: "agent-2",
				providerId: "provider-1",
				priority: "high",
				estimatedTokens: 2000,
			})

			handler.mockClear()
			queue.clear()

			expect(handler).toHaveBeenCalledTimes(2)
		})
	})

	describe("expiration", () => {
		it("should remove expired requests on dequeue", async () => {
			const shortQueue = new RequestQueue({
				maxSize: 10,
				defaultTimeoutMs: 50, // 50ms timeout
				enablePriority: true,
			})

			shortQueue.enqueue({
				agentId: "agent-1",
				providerId: "provider-1",
				priority: "normal",
				estimatedTokens: 1000,
				timeoutMs: 50,
			})

			// Wait for expiration
			await new Promise((resolve) => setTimeout(resolve, 100))

			// Trigger expiration check via dequeue
			const request = shortQueue.dequeue()

			expect(request).toBeNull()
			shortQueue.dispose()
		})
	})

	describe("properties", () => {
		it("should report correct size", () => {
			expect(queue.size).toBe(0)

			queue.enqueue({
				agentId: "agent-1",
				providerId: "provider-1",
				priority: "normal",
				estimatedTokens: 1000,
			})
			expect(queue.size).toBe(1)

			queue.enqueue({
				agentId: "agent-2",
				providerId: "provider-1",
				priority: "high",
				estimatedTokens: 2000,
			})
			expect(queue.size).toBe(2)
		})

		it("should report isEmpty correctly", () => {
			expect(queue.isEmpty).toBe(true)

			queue.enqueue({
				agentId: "agent-1",
				providerId: "provider-1",
				priority: "normal",
				estimatedTokens: 1000,
			})
			expect(queue.isEmpty).toBe(false)
		})

		it("should report isFull correctly", () => {
			const smallQueue = new RequestQueue({
				maxSize: 2,
				defaultTimeoutMs: 5000,
				enablePriority: true,
			})

			expect(smallQueue.isFull).toBe(false)

			smallQueue.enqueue({
				agentId: "agent-1",
				providerId: "provider-1",
				priority: "normal",
				estimatedTokens: 1000,
			})
			expect(smallQueue.isFull).toBe(false)

			smallQueue.enqueue({
				agentId: "agent-2",
				providerId: "provider-1",
				priority: "normal",
				estimatedTokens: 1000,
			})
			expect(smallQueue.isFull).toBe(true)
			smallQueue.dispose()
		})
	})
})
