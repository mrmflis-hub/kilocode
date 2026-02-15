// kilocode_change - new file

import { describe, it, expect, beforeEach, vi } from "vitest"
import { WorkflowStateMachine } from "../WorkflowStateMachine"
import { CheckpointIntegration, createCheckpointIntegration } from "../CheckpointIntegration"
import {
	WorkflowCheckpointService,
	MemoryCheckpointStorage,
} from "../../../../../services/kilocode/checkpoints/WorkflowCheckpointService"

describe("CheckpointIntegration", () => {
	let stateMachine: WorkflowStateMachine
	let checkpointService: WorkflowCheckpointService
	let integration: CheckpointIntegration

	beforeEach(() => {
		stateMachine = new WorkflowStateMachine()
		const storage = new MemoryCheckpointStorage()
		checkpointService = new WorkflowCheckpointService({ storage })
		integration = new CheckpointIntegration({
			stateMachine,
			checkpointService,
			sessionId: "test-session",
		})
	})

	describe("constructor", () => {
		it("should create integration with default options", () => {
			expect(integration).toBeDefined()
		})

		it("should create integration with auto-checkpoint enabled", () => {
			const autoIntegration = new CheckpointIntegration({
				stateMachine,
				checkpointService,
				sessionId: "test-session",
				autoCheckpoint: true,
				autoCheckpointStates: ["PLANNING", "CODE_IMPLEMENTATION"],
			})
			expect(autoIntegration).toBeDefined()
		})
	})

	describe("createCheckpoint", () => {
		it("should create a checkpoint for current state", async () => {
			// Set up state machine
			stateMachine.startTask("Test task")
			stateMachine.updateContext({
				currentStep: 1,
				totalSteps: 5,
			})

			const checkpoint = await integration.createCheckpoint("Test checkpoint", "Test description")

			expect(checkpoint).toBeDefined()
			expect(checkpoint.name).toBe("Test checkpoint")
			expect(checkpoint.description).toBe("Test description")
			expect(checkpoint.sessionId).toBe("test-session")
			expect(checkpoint.workflowState.state).toBe("PLANNING")
		})

		it("should create checkpoint with artifacts and agents", async () => {
			stateMachine.startTask("Test task")

			const integrationWithCallbacks = new CheckpointIntegration({
				stateMachine,
				checkpointService,
				sessionId: "test-session",
				getArtifacts: () => [
					{ id: "artifact-1", type: "implementation_plan", status: "completed", createdAt: Date.now() },
				],
				getAgents: () => [{ id: "agent-1", role: "architect", status: "ready", spawnedAt: Date.now() }],
			})

			const checkpoint = await integrationWithCallbacks.createCheckpoint()

			expect(checkpoint.artifacts).toHaveLength(1)
			expect(checkpoint.agents).toHaveLength(1)
		})
	})

	describe("rollbackToLatest", () => {
		it("should return error when no checkpoint exists", async () => {
			const result = await integration.rollbackToLatest()

			expect(result.success).toBe(false)
			expect(result.error).toContain("No checkpoint found")
		})

		it("should rollback to latest checkpoint", async () => {
			// Create initial state and checkpoint
			stateMachine.startTask("Original task")
			stateMachine.updateContext({
				currentStep: 1,
				totalSteps: 5,
			})

			await integration.createCheckpoint("Initial checkpoint")

			// Change state - transition through valid states
			stateMachine.transition("PLAN_REVIEW", "plan_created")
			stateMachine.updateContext({
				currentStep: 2,
				totalSteps: 5,
			})

			// Rollback
			const result = await integration.rollbackToLatest()

			expect(result.success).toBe(true)
			expect(result.restoredState).toBe("PLANNING")
		})
	})

	describe("rollbackToState", () => {
		it("should return error when no checkpoint for state exists", async () => {
			const result = await integration.rollbackToState("PLANNING")

			expect(result.success).toBe(false)
			expect(result.error).toContain("No checkpoint found for state")
		})

		it("should rollback to checkpoint for specific state", async () => {
			// Create checkpoints for multiple states
			stateMachine.startTask("Planning task")
			stateMachine.updateContext({
				currentStep: 1,
				totalSteps: 5,
			})
			await integration.createCheckpoint("Planning checkpoint")

			stateMachine.transition("PLAN_REVIEW", "plan_created")
			stateMachine.updateContext({
				currentStep: 2,
				totalSteps: 5,
			})
			await integration.createCheckpoint("Plan review checkpoint")

			// Rollback to PLANNING
			const result = await integration.rollbackToState("PLANNING")

			expect(result.success).toBe(true)
			expect(result.restoredState).toBe("PLANNING")
		})
	})

	describe("getCheckpoints", () => {
		it("should return empty array when no checkpoints exist", async () => {
			const checkpoints = await integration.getCheckpoints()
			expect(checkpoints).toHaveLength(0)
		})

		it("should return all checkpoints for session", async () => {
			stateMachine.startTask("Test task")
			await integration.createCheckpoint("Checkpoint 1")
			await integration.createCheckpoint("Checkpoint 2")

			const checkpoints = await integration.getCheckpoints()

			expect(checkpoints).toHaveLength(2)
		})
	})

	describe("getLatestCheckpoint", () => {
		it("should return null when no checkpoints exist", async () => {
			const checkpoint = await integration.getLatestCheckpoint()
			expect(checkpoint).toBeNull()
		})

		it("should return most recent checkpoint", async () => {
			stateMachine.startTask("Test task")
			await integration.createCheckpoint("First checkpoint")

			// Add small delay to ensure different timestamps
			await new Promise((resolve) => setTimeout(resolve, 10))

			stateMachine.transition("PLAN_REVIEW", "plan_created")
			await integration.createCheckpoint("Second checkpoint")

			const checkpoint = await integration.getLatestCheckpoint()

			expect(checkpoint).toBeDefined()
			expect(checkpoint?.name).toBe("Second checkpoint")
		})
	})

	describe("deleteCheckpoint", () => {
		it("should delete a checkpoint", async () => {
			stateMachine.startTask("Test task")
			const checkpoint = await integration.createCheckpoint("Test checkpoint")

			const deleted = await integration.deleteCheckpoint(checkpoint.id)

			expect(deleted).toBe(true)

			const checkpoints = await integration.getCheckpoints()
			expect(checkpoints).toHaveLength(0)
		})
	})

	describe("auto-checkpoint", () => {
		it("should auto-create checkpoint on state transition when enabled", async () => {
			const autoIntegration = new CheckpointIntegration({
				stateMachine,
				checkpointService,
				sessionId: "auto-test-session",
				autoCheckpoint: true,
				autoCheckpointStates: ["PLANNING"],
			})

			// Listen for auto-checkpoint event
			const autoCheckpointListener = vi.fn()
			autoIntegration.on("autoCheckpoint", autoCheckpointListener)

			// Transition to PLANNING state
			stateMachine.startTask("Test task")

			// Wait for async checkpoint creation
			await new Promise((resolve) => setTimeout(resolve, 100))

			expect(autoCheckpointListener).toHaveBeenCalledWith({ state: "PLANNING" })

			autoIntegration.dispose()
		})

		it("should not auto-create checkpoint for non-configured states", async () => {
			const autoIntegration = new CheckpointIntegration({
				stateMachine,
				checkpointService,
				sessionId: "auto-test-session",
				autoCheckpoint: true,
				autoCheckpointStates: ["PLANNING"],
			})

			const autoCheckpointListener = vi.fn()
			autoIntegration.on("autoCheckpoint", autoCheckpointListener)

			// Start task (goes to PLANNING) then transition to PLAN_REVIEW
			stateMachine.startTask("Test task")
			await new Promise((resolve) => setTimeout(resolve, 100))
			autoCheckpointListener.mockClear()

			// Transition to a state not in autoCheckpointStates
			stateMachine.transition("PLAN_REVIEW", "plan_created")
			await new Promise((resolve) => setTimeout(resolve, 100))

			expect(autoCheckpointListener).not.toHaveBeenCalled()

			autoIntegration.dispose()
		})
	})

	describe("events", () => {
		it("should emit rollback event", async () => {
			stateMachine.startTask("Test task")
			stateMachine.updateContext({
				currentStep: 1,
				totalSteps: 5,
			})
			await integration.createCheckpoint("Test checkpoint")

			const rollbackListener = vi.fn()
			integration.on("rollback", rollbackListener)

			await integration.rollbackToLatest()

			expect(rollbackListener).toHaveBeenCalled()
		})
	})

	describe("dispose", () => {
		it("should clean up listeners", async () => {
			const autoIntegration = new CheckpointIntegration({
				stateMachine,
				checkpointService,
				sessionId: "test-session",
				autoCheckpoint: true,
				autoCheckpointStates: ["PLANNING"],
			})

			autoIntegration.dispose()

			// Verify no more auto-checkpoints are created
			const autoCheckpointListener = vi.fn()
			autoIntegration.on("autoCheckpoint", autoCheckpointListener)

			stateMachine.startTask("Test task")
			await new Promise((resolve) => setTimeout(resolve, 100))

			// Should not trigger since we disposed
			expect(autoCheckpointListener).not.toHaveBeenCalled()
		})
	})

	describe("createCheckpointIntegration factory", () => {
		it("should create integration instance", () => {
			const integration = createCheckpointIntegration({
				stateMachine,
				checkpointService,
				sessionId: "factory-test",
			})

			expect(integration).toBeInstanceOf(CheckpointIntegration)
		})
	})
})
