// kilocode_change - new file

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import {
	WorkflowCheckpointService,
	MemoryCheckpointStorage,
	createDefaultCheckpointService,
} from "../WorkflowCheckpointService"
import type { WorkflowCheckpoint, CreateCheckpointOptions, CheckpointStorageAdapter, CheckpointStats } from "../types"
import type { WorkflowState } from "@kilocode/core-schemas"

describe("WorkflowCheckpointService", () => {
	let service: WorkflowCheckpointService
	let storage: MemoryCheckpointStorage

	beforeEach(() => {
		storage = new MemoryCheckpointStorage()
		service = new WorkflowCheckpointService({
			storage,
			maxCheckpointsPerSession: 5,
			defaultExpirationHours: 24,
		})
	})

	afterEach(() => {
		service.dispose()
	})

	describe("createCheckpoint", () => {
		it("should create a checkpoint with required fields", async () => {
			const options: CreateCheckpointOptions = {
				sessionId: "session-1",
				workflowState: {
					state: "PLANNING",
					previousState: null,
					timestamp: Date.now(),
					history: [],
				},
				workflowContext: {
					currentStep: 1,
					totalSteps: 10,
					artifacts: [],
					agents: [],
					retryCount: 0,
					metadata: {},
				},
			}

			const checkpoint = await service.createCheckpoint(options)

			expect(checkpoint.id).toBeDefined()
			expect(checkpoint.id).toMatch(/^checkpoint_/)
			expect(checkpoint.sessionId).toBe("session-1")
			expect(checkpoint.status).toBe("active")
			expect(checkpoint.workflowState.state).toBe("PLANNING")
			expect(checkpoint.createdAt).toBeDefined()
			expect(checkpoint.updatedAt).toBeDefined()
			expect(checkpoint.expiresAt).toBeDefined()
		})

		it("should create a checkpoint with optional fields", async () => {
			const options: CreateCheckpointOptions = {
				sessionId: "session-1",
				name: "Test Checkpoint",
				description: "Test description",
				workflowState: {
					state: "CODE_IMPLEMENTATION",
					previousState: "STRUCTURE_CREATION",
					timestamp: Date.now(),
					history: [{ state: "PLANNING", timestamp: Date.now() - 1000 }],
				},
				workflowContext: {
					userTask: "Implement feature X",
					currentStep: 4,
					totalSteps: 10,
					artifacts: ["artifact-1"],
					agents: ["agent-1"],
					retryCount: 0,
					metadata: { key: "value" },
				},
				artifacts: [
					{ id: "artifact-1", type: "implementation_plan", status: "completed", createdAt: Date.now() },
				],
				agents: [{ id: "agent-1", role: "architect", status: "ready", spawnedAt: Date.now() }],
				tags: ["important", "milestone"],
				metadata: { customField: "customValue" },
			}

			const checkpoint = await service.createCheckpoint(options)

			expect(checkpoint.name).toBe("Test Checkpoint")
			expect(checkpoint.description).toBe("Test description")
			expect(checkpoint.workflowContext.userTask).toBe("Implement feature X")
			expect(checkpoint.artifacts).toHaveLength(1)
			expect(checkpoint.agents).toHaveLength(1)
			expect(checkpoint.tags).toContain("important")
			expect(checkpoint.tags).toContain("milestone")
			expect(checkpoint.metadata.customField).toBe("customValue")
		})

		it("should set expiration time based on options", async () => {
			const options: CreateCheckpointOptions = {
				sessionId: "session-1",
				workflowState: {
					state: "PLANNING",
					previousState: null,
					timestamp: Date.now(),
					history: [],
				},
				workflowContext: {
					currentStep: 1,
					totalSteps: 10,
					artifacts: [],
					agents: [],
					retryCount: 0,
					metadata: {},
				},
				expiresIn: 2 * 60 * 60 * 1000, // 2 hours
			}

			const checkpoint = await service.createCheckpoint(options)
			const expectedExpiry = checkpoint.createdAt + 2 * 60 * 60 * 1000

			expect(checkpoint.expiresAt).toBeCloseTo(expectedExpiry, -3)
		})

		it("should emit checkpoint_created event", async () => {
			const eventHandler = vi.fn()
			service.on("checkpoint_created", eventHandler)

			await service.createCheckpoint({
				sessionId: "session-1",
				workflowState: {
					state: "PLANNING",
					previousState: null,
					timestamp: Date.now(),
					history: [],
				},
				workflowContext: {
					currentStep: 1,
					totalSteps: 10,
					artifacts: [],
					agents: [],
					retryCount: 0,
					metadata: {},
				},
			})

			expect(eventHandler).toHaveBeenCalledTimes(1)
			expect(eventHandler).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "checkpoint_created",
					checkpointId: expect.stringMatching(/^checkpoint_/),
				}),
			)
		})

		it("should enforce max checkpoints per session", async () => {
			// Create 7 checkpoints for the same session (max is 5)
			for (let i = 0; i < 7; i++) {
				await service.createCheckpoint({
					sessionId: "session-1",
					workflowState: {
						state: "PLANNING",
						previousState: null,
						timestamp: Date.now(),
						history: [],
					},
					workflowContext: {
						currentStep: 1,
						totalSteps: 10,
						artifacts: [],
						agents: [],
						retryCount: 0,
						metadata: {},
					},
				})
			}

			const checkpoints = await service.listCheckpoints({ sessionId: "session-1" })
			expect(checkpoints.length).toBe(5)
		})
	})

	describe("getCheckpoint", () => {
		it("should return a checkpoint by ID", async () => {
			const created = await service.createCheckpoint({
				sessionId: "session-1",
				workflowState: {
					state: "PLANNING",
					previousState: null,
					timestamp: Date.now(),
					history: [],
				},
				workflowContext: {
					currentStep: 1,
					totalSteps: 10,
					artifacts: [],
					agents: [],
					retryCount: 0,
					metadata: {},
				},
			})

			const retrieved = await service.getCheckpoint(created.id)
			expect(retrieved).toBeDefined()
			expect(retrieved?.id).toBe(created.id)
		})

		it("should return null for non-existent checkpoint", async () => {
			const retrieved = await service.getCheckpoint("non-existent")
			expect(retrieved).toBeNull()
		})
	})

	describe("restoreCheckpoint", () => {
		it("should restore a checkpoint successfully", async () => {
			const checkpoint = await service.createCheckpoint({
				sessionId: "session-1",
				workflowState: {
					state: "CODE_IMPLEMENTATION",
					previousState: "STRUCTURE_CREATION",
					timestamp: Date.now(),
					history: [{ state: "PLANNING", timestamp: Date.now() - 1000 }],
				},
				workflowContext: {
					userTask: "Test task",
					currentStep: 4,
					totalSteps: 10,
					artifacts: ["artifact-1"],
					agents: ["agent-1"],
					retryCount: 0,
					metadata: {},
				},
				artifacts: [
					{ id: "artifact-1", type: "implementation_plan", status: "completed", createdAt: Date.now() },
				],
				agents: [{ id: "agent-1", role: "architect", status: "ready", spawnedAt: Date.now() }],
			})

			const result = await service.restoreCheckpoint(checkpoint.id, {
				restoreArtifacts: true,
				restoreAgents: true,
			})

			expect(result.success).toBe(true)
			expect(result.checkpoint).toBeDefined()
			expect(result.restoredState).toBeDefined()
			expect(result.restoredState?.state).toBe("CODE_IMPLEMENTATION")
			expect(result.restoredContext?.userTask).toBe("Test task")
			expect(result.restoredArtifacts).toHaveLength(1)
			expect(result.restoredAgents).toHaveLength(1)
			expect(result.warnings).toHaveLength(0)
		})

		it("should return error for non-existent checkpoint", async () => {
			const result = await service.restoreCheckpoint("non-existent")

			expect(result.success).toBe(false)
			expect(result.error).toContain("not found")
		})

		it("should return error for expired checkpoint", async () => {
			const checkpoint = await service.createCheckpoint({
				sessionId: "session-1",
				workflowState: {
					state: "PLANNING",
					previousState: null,
					timestamp: Date.now(),
					history: [],
				},
				workflowContext: {
					currentStep: 1,
					totalSteps: 10,
					artifacts: [],
					agents: [],
					retryCount: 0,
					metadata: {},
				},
				expiresIn: -1000, // Already expired
			})

			const result = await service.restoreCheckpoint(checkpoint.id)

			expect(result.success).toBe(false)
			expect(result.error).toContain("expired")
		})

		it("should warn when restoring already restored checkpoint", async () => {
			const checkpoint = await service.createCheckpoint({
				sessionId: "session-1",
				workflowState: {
					state: "PLANNING",
					previousState: null,
					timestamp: Date.now(),
					history: [],
				},
				workflowContext: {
					currentStep: 1,
					totalSteps: 10,
					artifacts: [],
					agents: [],
					retryCount: 0,
					metadata: {},
				},
			})

			// First restore
			await service.restoreCheckpoint(checkpoint.id)

			// Second restore
			const result = await service.restoreCheckpoint(checkpoint.id)

			expect(result.success).toBe(true)
			expect(result.warnings).toContainEqual(expect.stringContaining("already been restored"))
		})

		it("should respect restore options", async () => {
			const checkpoint = await service.createCheckpoint({
				sessionId: "session-1",
				workflowState: {
					state: "CODE_IMPLEMENTATION",
					previousState: null,
					timestamp: Date.now(),
					history: [],
				},
				workflowContext: {
					currentStep: 4,
					totalSteps: 10,
					artifacts: [],
					agents: [],
					retryCount: 0,
					metadata: {},
				},
				artifacts: [{ id: "artifact-1", type: "code", status: "completed", createdAt: Date.now() }],
				agents: [{ id: "agent-1", role: "coder", status: "ready", spawnedAt: Date.now() }],
			})

			const result = await service.restoreCheckpoint(checkpoint.id, {
				restoreArtifacts: false,
				restoreAgents: false,
			})

			expect(result.success).toBe(true)
			expect(result.restoredArtifacts).toHaveLength(0)
			expect(result.restoredAgents).toHaveLength(0)
		})

		it("should merge custom metadata on restore", async () => {
			const checkpoint = await service.createCheckpoint({
				sessionId: "session-1",
				workflowState: {
					state: "PLANNING",
					previousState: null,
					timestamp: Date.now(),
					history: [],
				},
				workflowContext: {
					currentStep: 1,
					totalSteps: 10,
					artifacts: [],
					agents: [],
					retryCount: 0,
					metadata: { existing: "value" },
				},
			})

			const result = await service.restoreCheckpoint(checkpoint.id, {
				metadata: { newKey: "newValue" },
			})

			expect(result.success).toBe(true)
			expect(result.restoredContext?.metadata.existing).toBe("value")
			expect(result.restoredContext?.metadata.newKey).toBe("newValue")
		})

		it("should emit checkpoint_restored event", async () => {
			const eventHandler = vi.fn()
			service.on("checkpoint_restored", eventHandler)

			const checkpoint = await service.createCheckpoint({
				sessionId: "session-1",
				workflowState: {
					state: "PLANNING",
					previousState: null,
					timestamp: Date.now(),
					history: [],
				},
				workflowContext: {
					currentStep: 1,
					totalSteps: 10,
					artifacts: [],
					agents: [],
					retryCount: 0,
					metadata: {},
				},
			})

			await service.restoreCheckpoint(checkpoint.id)

			expect(eventHandler).toHaveBeenCalledTimes(1)
		})
	})

	describe("deleteCheckpoint", () => {
		it("should delete a checkpoint", async () => {
			const checkpoint = await service.createCheckpoint({
				sessionId: "session-1",
				workflowState: {
					state: "PLANNING",
					previousState: null,
					timestamp: Date.now(),
					history: [],
				},
				workflowContext: {
					currentStep: 1,
					totalSteps: 10,
					artifacts: [],
					agents: [],
					retryCount: 0,
					metadata: {},
				},
			})

			const deleted = await service.deleteCheckpoint(checkpoint.id)
			expect(deleted).toBe(true)

			const retrieved = await service.getCheckpoint(checkpoint.id)
			expect(retrieved?.status).toBe("deleted")
		})

		it("should return false for non-existent checkpoint", async () => {
			const deleted = await service.deleteCheckpoint("non-existent")
			expect(deleted).toBe(false)
		})

		it("should emit checkpoint_deleted event", async () => {
			const eventHandler = vi.fn()
			service.on("checkpoint_deleted", eventHandler)

			const checkpoint = await service.createCheckpoint({
				sessionId: "session-1",
				workflowState: {
					state: "PLANNING",
					previousState: null,
					timestamp: Date.now(),
					history: [],
				},
				workflowContext: {
					currentStep: 1,
					totalSteps: 10,
					artifacts: [],
					agents: [],
					retryCount: 0,
					metadata: {},
				},
			})

			await service.deleteCheckpoint(checkpoint.id)

			expect(eventHandler).toHaveBeenCalledTimes(1)
		})
	})

	describe("listCheckpoints", () => {
		beforeEach(async () => {
			// Create test checkpoints with delays to ensure different timestamps
			await service.createCheckpoint({
				sessionId: "session-1",
				workflowState: { state: "PLANNING", previousState: null, timestamp: Date.now(), history: [] },
				workflowContext: {
					currentStep: 1,
					totalSteps: 10,
					artifacts: [],
					agents: [],
					retryCount: 0,
					metadata: {},
				},
				tags: ["important"],
			})

			// Add delay to ensure different timestamps for proper sorting
			await new Promise((resolve) => setTimeout(resolve, 10))

			await service.createCheckpoint({
				sessionId: "session-1",
				workflowState: {
					state: "CODE_IMPLEMENTATION",
					previousState: null,
					timestamp: Date.now(),
					history: [],
				},
				workflowContext: {
					currentStep: 4,
					totalSteps: 10,
					artifacts: [],
					agents: [],
					retryCount: 0,
					metadata: {},
				},
				tags: ["milestone"],
			})

			await new Promise((resolve) => setTimeout(resolve, 10))

			await service.createCheckpoint({
				sessionId: "session-2",
				workflowState: { state: "PLANNING", previousState: null, timestamp: Date.now(), history: [] },
				workflowContext: {
					currentStep: 1,
					totalSteps: 10,
					artifacts: [],
					agents: [],
					retryCount: 0,
					metadata: {},
				},
			})
		})

		it("should list all checkpoints", async () => {
			const checkpoints = await service.listCheckpoints()
			expect(checkpoints.length).toBe(3)
		})

		it("should filter by session ID", async () => {
			const checkpoints = await service.listCheckpoints({ sessionId: "session-1" })
			expect(checkpoints.length).toBe(2)
			expect(checkpoints.every((c) => c.sessionId === "session-1")).toBe(true)
		})

		it("should filter by workflow state", async () => {
			const checkpoints = await service.listCheckpoints({ workflowState: "PLANNING" })
			expect(checkpoints.length).toBe(2)
			expect(checkpoints.every((c) => c.workflowState.state === "PLANNING")).toBe(true)
		})

		it("should filter by tags", async () => {
			const checkpoints = await service.listCheckpoints({ tags: ["important"] })
			expect(checkpoints.length).toBe(1)
			expect(checkpoints[0].tags).toContain("important")
		})

		it("should sort by createdAt ascending", async () => {
			const checkpoints = await service.listCheckpoints({ sortBy: "createdAt", sortOrder: "asc" })
			expect(checkpoints[0].workflowState.state).toBe("PLANNING")
		})

		it("should sort by createdAt descending", async () => {
			const checkpoints = await service.listCheckpoints({ sortBy: "createdAt", sortOrder: "desc" })
			expect(checkpoints[0].workflowState.state).toBe("PLANNING")
		})

		it("should apply limit and offset", async () => {
			const checkpoints = await service.listCheckpoints({ limit: 2, offset: 1 })
			expect(checkpoints.length).toBe(2)
		})
	})

	describe("getLatestCheckpoint", () => {
		it("should return the latest checkpoint for a session", async () => {
			await service.createCheckpoint({
				sessionId: "session-1",
				workflowState: { state: "PLANNING", previousState: null, timestamp: Date.now(), history: [] },
				workflowContext: {
					currentStep: 1,
					totalSteps: 10,
					artifacts: [],
					agents: [],
					retryCount: 0,
					metadata: {},
				},
			})

			await new Promise((resolve) => setTimeout(resolve, 10))

			const latest = await service.createCheckpoint({
				sessionId: "session-1",
				workflowState: {
					state: "CODE_IMPLEMENTATION",
					previousState: null,
					timestamp: Date.now(),
					history: [],
				},
				workflowContext: {
					currentStep: 4,
					totalSteps: 10,
					artifacts: [],
					agents: [],
					retryCount: 0,
					metadata: {},
				},
			})

			const retrieved = await service.getLatestCheckpoint("session-1")
			expect(retrieved?.id).toBe(latest.id)
		})

		it("should return null for session with no checkpoints", async () => {
			const retrieved = await service.getLatestCheckpoint("non-existent-session")
			expect(retrieved).toBeNull()
		})
	})

	describe("getCheckpointsForState", () => {
		it("should return checkpoints for a specific state", async () => {
			await service.createCheckpoint({
				sessionId: "session-1",
				workflowState: { state: "PLANNING", previousState: null, timestamp: Date.now(), history: [] },
				workflowContext: {
					currentStep: 1,
					totalSteps: 10,
					artifacts: [],
					agents: [],
					retryCount: 0,
					metadata: {},
				},
			})

			await service.createCheckpoint({
				sessionId: "session-1",
				workflowState: {
					state: "CODE_IMPLEMENTATION",
					previousState: null,
					timestamp: Date.now(),
					history: [],
				},
				workflowContext: {
					currentStep: 4,
					totalSteps: 10,
					artifacts: [],
					agents: [],
					retryCount: 0,
					metadata: {},
				},
			})

			await service.createCheckpoint({
				sessionId: "session-1",
				workflowState: { state: "PLANNING", previousState: null, timestamp: Date.now(), history: [] },
				workflowContext: {
					currentStep: 1,
					totalSteps: 10,
					artifacts: [],
					agents: [],
					retryCount: 0,
					metadata: {},
				},
			})

			const checkpoints = await service.getCheckpointsForState("session-1", "PLANNING")
			expect(checkpoints.length).toBe(2)
		})
	})

	describe("cleanupCheckpoints", () => {
		it("should remove old checkpoints", async () => {
			// Create an old checkpoint
			const oldCheckpoint = await service.createCheckpoint({
				sessionId: "session-1",
				workflowState: { state: "PLANNING", previousState: null, timestamp: Date.now(), history: [] },
				workflowContext: {
					currentStep: 1,
					totalSteps: 10,
					artifacts: [],
					agents: [],
					retryCount: 0,
					metadata: {},
				},
			})

			// Manually set old timestamp
			const stored = await storage.get(oldCheckpoint.id)
			if (stored) {
				stored.createdAt = Date.now() - 48 * 60 * 60 * 1000 // 48 hours ago
				stored.status = "expired"
				await storage.save(stored)
			}

			const result = await service.cleanupCheckpoints({ olderThanHours: 24 })

			expect(result.removed).toBe(1)
			expect(result.removedIds).toContain(oldCheckpoint.id)
		})

		it("should enforce max per session", async () => {
			// Create more checkpoints than max
			for (let i = 0; i < 7; i++) {
				await service.createCheckpoint({
					sessionId: "session-1",
					workflowState: { state: "PLANNING", previousState: null, timestamp: Date.now(), history: [] },
					workflowContext: {
						currentStep: 1,
						totalSteps: 10,
						artifacts: [],
						agents: [],
						retryCount: 0,
						metadata: {},
					},
				})
			}

			const result = await service.cleanupCheckpoints({ maxPerSession: 3 })

			expect(result.removed).toBe(2) // 5 - 3 = 2 removed
		})

		it("should support dry run", async () => {
			await service.createCheckpoint({
				sessionId: "session-1",
				workflowState: { state: "PLANNING", previousState: null, timestamp: Date.now(), history: [] },
				workflowContext: {
					currentStep: 1,
					totalSteps: 10,
					artifacts: [],
					agents: [],
					retryCount: 0,
					metadata: {},
				},
			})

			const result = await service.cleanupCheckpoints({ dryRun: true })

			expect(result.removed).toBe(0)
		})
	})

	describe("getStats", () => {
		it("should return checkpoint statistics", async () => {
			await service.createCheckpoint({
				sessionId: "session-1",
				workflowState: { state: "PLANNING", previousState: null, timestamp: Date.now(), history: [] },
				workflowContext: {
					currentStep: 1,
					totalSteps: 10,
					artifacts: [],
					agents: [],
					retryCount: 0,
					metadata: {},
				},
			})

			await service.createCheckpoint({
				sessionId: "session-2",
				workflowState: {
					state: "CODE_IMPLEMENTATION",
					previousState: null,
					timestamp: Date.now(),
					history: [],
				},
				workflowContext: {
					currentStep: 4,
					totalSteps: 10,
					artifacts: [],
					agents: [],
					retryCount: 0,
					metadata: {},
				},
			})

			const stats = await service.getStats()

			expect(stats.total).toBe(2)
			expect(stats.active).toBe(2)
			expect(stats.sessions).toBe(2)
		})
	})

	describe("periodic cleanup", () => {
		it("should start and stop periodic cleanup", () => {
			service.startPeriodicCleanup(1)
			expect(service["cleanupInterval"]).toBeDefined()

			service.stopPeriodicCleanup()
			expect(service["cleanupInterval"]).toBeUndefined()
		})
	})

	describe("shouldAutoCheckpoint", () => {
		it("should return false when auto-checkpoint is disabled", () => {
			expect(service.shouldAutoCheckpoint("PLANNING")).toBe(false)
		})

		it("should return true when auto-checkpoint is enabled for state", () => {
			const autoService = new WorkflowCheckpointService({
				storage,
				autoCheckpoint: true,
				autoCheckpointStates: ["PLANNING", "CODE_IMPLEMENTATION"],
			})

			expect(autoService.shouldAutoCheckpoint("PLANNING")).toBe(true)
			expect(autoService.shouldAutoCheckpoint("CODE_IMPLEMENTATION")).toBe(true)
			expect(autoService.shouldAutoCheckpoint("TESTING")).toBe(false)

			autoService.dispose()
		})
	})

	describe("createCheckpointFromWorkflow", () => {
		it("should create checkpoint from workflow state machine data", async () => {
			const checkpoint = await service.createCheckpointFromWorkflow(
				"session-1",
				"CODE_IMPLEMENTATION",
				"STRUCTURE_CREATION",
				{
					userTask: "Implement feature X",
					currentStep: 4,
					totalSteps: 10,
					artifacts: ["artifact-1"],
					agents: ["agent-1"],
					retryCount: 0,
					metadata: { key: "value" },
				},
				[
					{ state: "PLANNING", timestamp: Date.now() - 3000, trigger: "start_task" },
					{ state: "PLAN_REVIEW", timestamp: Date.now() - 2000, trigger: "plan_created" },
					{ state: "STRUCTURE_CREATION", timestamp: Date.now() - 1000, trigger: "plan_approved" },
				],
				[{ id: "artifact-1", type: "implementation_plan", status: "completed", createdAt: Date.now() }],
				[{ id: "agent-1", role: "architect", status: "ready", spawnedAt: Date.now() }],
			)

			expect(checkpoint.sessionId).toBe("session-1")
			expect(checkpoint.workflowState.state).toBe("CODE_IMPLEMENTATION")
			expect(checkpoint.workflowState.previousState).toBe("STRUCTURE_CREATION")
			expect(checkpoint.workflowState.history).toHaveLength(3)
			expect(checkpoint.workflowContext.userTask).toBe("Implement feature X")
			expect(checkpoint.artifacts).toHaveLength(1)
			expect(checkpoint.agents).toHaveLength(1)
			expect(checkpoint.tags).toContain("CODE_IMPLEMENTATION")
		})
	})

	describe("dispose", () => {
		it("should clean up resources", () => {
			service.startPeriodicCleanup(1)
			const listener = vi.fn()
			service.on("checkpoint", listener)

			service.dispose()

			expect(service["cleanupInterval"]).toBeUndefined()
			expect(service.listenerCount("checkpoint")).toBe(0)
		})
	})
})

describe("MemoryCheckpointStorage", () => {
	let storage: MemoryCheckpointStorage

	beforeEach(() => {
		storage = new MemoryCheckpointStorage()
	})

	describe("get and save", () => {
		it("should save and retrieve a checkpoint", async () => {
			const checkpoint: WorkflowCheckpoint = {
				id: "checkpoint-1",
				sessionId: "session-1",
				status: "active",
				workflowState: {
					state: "PLANNING",
					previousState: null,
					timestamp: Date.now(),
					history: [],
				},
				workflowContext: {
					currentStep: 1,
					totalSteps: 10,
					artifacts: [],
					agents: [],
					retryCount: 0,
					metadata: {},
				},
				artifacts: [],
				agents: [],
				createdAt: Date.now(),
				updatedAt: Date.now(),
				tags: [],
				metadata: {},
			}

			await storage.save(checkpoint)
			const retrieved = await storage.get("checkpoint-1")

			expect(retrieved).toBeDefined()
			expect(retrieved?.id).toBe("checkpoint-1")
		})

		it("should return null for non-existent checkpoint", async () => {
			const retrieved = await storage.get("non-existent")
			expect(retrieved).toBeNull()
		})
	})

	describe("delete", () => {
		it("should delete a checkpoint", async () => {
			const checkpoint: WorkflowCheckpoint = {
				id: "checkpoint-1",
				sessionId: "session-1",
				status: "active",
				workflowState: {
					state: "PLANNING",
					previousState: null,
					timestamp: Date.now(),
					history: [],
				},
				workflowContext: {
					currentStep: 1,
					totalSteps: 10,
					artifacts: [],
					agents: [],
					retryCount: 0,
					metadata: {},
				},
				artifacts: [],
				agents: [],
				createdAt: Date.now(),
				updatedAt: Date.now(),
				tags: [],
				metadata: {},
			}

			await storage.save(checkpoint)
			const deleted = await storage.delete("checkpoint-1")

			expect(deleted).toBe(true)
			expect(await storage.get("checkpoint-1")).toBeNull()
		})

		it("should return false for non-existent checkpoint", async () => {
			const deleted = await storage.delete("non-existent")
			expect(deleted).toBe(false)
		})
	})

	describe("list", () => {
		beforeEach(async () => {
			await storage.save({
				id: "checkpoint-1",
				sessionId: "session-1",
				status: "active",
				workflowState: { state: "PLANNING", previousState: null, timestamp: Date.now(), history: [] },
				workflowContext: {
					currentStep: 1,
					totalSteps: 10,
					artifacts: [],
					agents: [],
					retryCount: 0,
					metadata: {},
				},
				artifacts: [],
				agents: [],
				createdAt: Date.now(),
				updatedAt: Date.now(),
				tags: ["important"],
				metadata: {},
			})

			await storage.save({
				id: "checkpoint-2",
				sessionId: "session-1",
				status: "restored",
				workflowState: {
					state: "CODE_IMPLEMENTATION",
					previousState: null,
					timestamp: Date.now(),
					history: [],
				},
				workflowContext: {
					currentStep: 4,
					totalSteps: 10,
					artifacts: [],
					agents: [],
					retryCount: 0,
					metadata: {},
				},
				artifacts: [],
				agents: [],
				createdAt: Date.now() + 1000,
				updatedAt: Date.now(),
				tags: [],
				metadata: {},
			})

			await storage.save({
				id: "checkpoint-3",
				sessionId: "session-2",
				status: "active",
				workflowState: { state: "PLANNING", previousState: null, timestamp: Date.now(), history: [] },
				workflowContext: {
					currentStep: 1,
					totalSteps: 10,
					artifacts: [],
					agents: [],
					retryCount: 0,
					metadata: {},
				},
				artifacts: [],
				agents: [],
				createdAt: Date.now() + 2000,
				updatedAt: Date.now(),
				tags: ["important"],
				metadata: {},
			})
		})

		it("should list all checkpoints", async () => {
			const checkpoints = await storage.list()
			expect(checkpoints.length).toBe(3)
		})

		it("should filter by session ID", async () => {
			const checkpoints = await storage.list({ sessionId: "session-1" })
			expect(checkpoints.length).toBe(2)
		})

		it("should filter by status", async () => {
			const checkpoints = await storage.list({ status: "active" })
			expect(checkpoints.length).toBe(2)
		})

		it("should filter by multiple statuses", async () => {
			const checkpoints = await storage.list({ status: ["active", "restored"] })
			expect(checkpoints.length).toBe(3)
		})

		it("should filter by tags", async () => {
			const checkpoints = await storage.list({ tags: ["important"] })
			expect(checkpoints.length).toBe(2)
		})

		it("should filter by workflow state", async () => {
			const checkpoints = await storage.list({ workflowState: "PLANNING" })
			expect(checkpoints.length).toBe(2)
		})

		it("should sort by createdAt descending", async () => {
			const checkpoints = await storage.list({ sortBy: "createdAt", sortOrder: "desc" })
			expect(checkpoints[0].id).toBe("checkpoint-3")
		})

		it("should apply limit", async () => {
			const checkpoints = await storage.list({ limit: 2 })
			expect(checkpoints.length).toBe(2)
		})

		it("should apply offset", async () => {
			const checkpoints = await storage.list({ offset: 1 })
			expect(checkpoints.length).toBe(2)
		})
	})

	describe("getStats", () => {
		it("should return correct statistics", async () => {
			await storage.save({
				id: "checkpoint-1",
				sessionId: "session-1",
				status: "active",
				workflowState: { state: "PLANNING", previousState: null, timestamp: Date.now(), history: [] },
				workflowContext: {
					currentStep: 1,
					totalSteps: 10,
					artifacts: [],
					agents: [],
					retryCount: 0,
					metadata: {},
				},
				artifacts: [],
				agents: [],
				createdAt: Date.now(),
				updatedAt: Date.now(),
				tags: [],
				metadata: {},
			})

			await storage.save({
				id: "checkpoint-2",
				sessionId: "session-1",
				status: "restored",
				workflowState: {
					state: "CODE_IMPLEMENTATION",
					previousState: null,
					timestamp: Date.now(),
					history: [],
				},
				workflowContext: {
					currentStep: 4,
					totalSteps: 10,
					artifacts: [],
					agents: [],
					retryCount: 0,
					metadata: {},
				},
				artifacts: [],
				agents: [],
				createdAt: Date.now(),
				updatedAt: Date.now(),
				tags: [],
				metadata: {},
			})

			await storage.save({
				id: "checkpoint-3",
				sessionId: "session-2",
				status: "expired",
				workflowState: { state: "PLANNING", previousState: null, timestamp: Date.now(), history: [] },
				workflowContext: {
					currentStep: 1,
					totalSteps: 10,
					artifacts: [],
					agents: [],
					retryCount: 0,
					metadata: {},
				},
				artifacts: [],
				agents: [],
				createdAt: Date.now(),
				updatedAt: Date.now(),
				tags: [],
				metadata: {},
			})

			const stats = await storage.getStats()

			expect(stats.total).toBe(3)
			expect(stats.active).toBe(1)
			expect(stats.restored).toBe(1)
			expect(stats.expired).toBe(1)
			expect(stats.sessions).toBe(2)
		})
	})

	describe("clear", () => {
		it("should clear all checkpoints", async () => {
			await storage.save({
				id: "checkpoint-1",
				sessionId: "session-1",
				status: "active",
				workflowState: { state: "PLANNING", previousState: null, timestamp: Date.now(), history: [] },
				workflowContext: {
					currentStep: 1,
					totalSteps: 10,
					artifacts: [],
					agents: [],
					retryCount: 0,
					metadata: {},
				},
				artifacts: [],
				agents: [],
				createdAt: Date.now(),
				updatedAt: Date.now(),
				tags: [],
				metadata: {},
			})

			await storage.clear()

			const checkpoints = await storage.list()
			expect(checkpoints.length).toBe(0)
		})
	})
})

describe("createDefaultCheckpointService", () => {
	it("should create a service with default configuration", () => {
		const service = createDefaultCheckpointService()

		expect(service).toBeInstanceOf(WorkflowCheckpointService)
		expect(service["maxCheckpointsPerSession"]).toBe(10)
		expect(service["defaultExpirationHours"]).toBe(24)

		service.dispose()
	})

	it("should create a service with custom configuration", () => {
		const service = createDefaultCheckpointService({
			maxCheckpointsPerSession: 20,
			defaultExpirationHours: 48,
			autoCheckpoint: true,
			autoCheckpointStates: ["PLANNING"],
		})

		expect(service["maxCheckpointsPerSession"]).toBe(20)
		expect(service["defaultExpirationHours"]).toBe(48)
		expect(service["autoCheckpoint"]).toBe(true)
		expect(service.shouldAutoCheckpoint("PLANNING")).toBe(true)

		service.dispose()
	})
})
