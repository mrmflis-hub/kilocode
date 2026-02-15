// kilocode_change - new file
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import {
	WorkflowStateMachine,
	MemoryStorageAdapter,
	WORKFLOW_STATES,
	type TransitionTrigger,
	type StateHistoryEntry,
	type WorkflowStateChangeEvent,
} from "../WorkflowStateMachine"
import type { WorkflowState } from "../types"

describe("WorkflowStateMachine", () => {
	let stateMachine: WorkflowStateMachine

	beforeEach(() => {
		stateMachine = new WorkflowStateMachine()
	})

	afterEach(() => {
		stateMachine.dispose()
	})

	describe("initialization", () => {
		it("should initialize with IDLE state", () => {
			expect(stateMachine.getState()).toBe("IDLE")
		})

		it("should initialize with custom initial state", () => {
			const sm = new WorkflowStateMachine({ initialState: "PLANNING" })
			expect(sm.getState()).toBe("PLANNING")
			sm.dispose()
		})

		it("should initialize with custom context", () => {
			const sm = new WorkflowStateMachine({
				context: { userTask: "Test task", currentStep: 1 },
			})
			expect(sm.getContext().userTask).toBe("Test task")
			sm.dispose()
		})

		it("should record initial state in history", () => {
			const history = stateMachine.getHistory()
			expect(history).toHaveLength(1)
			expect(history[0].state).toBe("IDLE")
		})
	})

	describe("state transitions", () => {
		it("should transition from IDLE to PLANNING on start_task", () => {
			stateMachine.startTask("Test task")
			expect(stateMachine.getState()).toBe("PLANNING")
			expect(stateMachine.getContext().userTask).toBe("Test task")
		})

		it("should throw error for invalid transition", () => {
			expect(() => {
				stateMachine.transition("CODE_IMPLEMENTATION")
			}).toThrow("Invalid transition from IDLE to CODE_IMPLEMENTATION")
		})

		it("should transition through full workflow", () => {
			// IDLE -> PLANNING
			stateMachine.startTask("Test task")
			expect(stateMachine.getState()).toBe("PLANNING")

			// PLANNING -> PLAN_REVIEW
			stateMachine.transition("PLAN_REVIEW", "plan_created")
			expect(stateMachine.getState()).toBe("PLAN_REVIEW")

			// PLAN_REVIEW -> STRUCTURE_CREATION
			stateMachine.transition("STRUCTURE_CREATION", "plan_approved")
			expect(stateMachine.getState()).toBe("STRUCTURE_CREATION")

			// STRUCTURE_CREATION -> CODE_IMPLEMENTATION
			stateMachine.transition("CODE_IMPLEMENTATION", "structure_created")
			expect(stateMachine.getState()).toBe("CODE_IMPLEMENTATION")

			// CODE_IMPLEMENTATION -> CODE_REVIEW
			stateMachine.transition("CODE_REVIEW", "code_implemented")
			expect(stateMachine.getState()).toBe("CODE_REVIEW")

			// CODE_REVIEW -> DOCUMENTATION
			stateMachine.transition("DOCUMENTATION", "code_approved")
			expect(stateMachine.getState()).toBe("DOCUMENTATION")

			// DOCUMENTATION -> TESTING
			stateMachine.transition("TESTING", "documentation_complete")
			expect(stateMachine.getState()).toBe("TESTING")

			// TESTING -> COMPLETED
			stateMachine.transition("COMPLETED", "tests_passed")
			expect(stateMachine.getState()).toBe("COMPLETED")
		})

		it("should handle plan revision flow", () => {
			stateMachine.startTask("Test task")
			stateMachine.transition("PLAN_REVIEW", "plan_created")
			stateMachine.transition("PLAN_REVISION", "plan_needs_revision")
			expect(stateMachine.getState()).toBe("PLAN_REVISION")

			stateMachine.transition("PLAN_REVIEW", "plan_revised")
			expect(stateMachine.getState()).toBe("PLAN_REVIEW")
		})

		it("should handle code fixing flow", () => {
			stateMachine.startTask("Test task")
			stateMachine.transition("PLAN_REVIEW", "plan_created")
			stateMachine.transition("STRUCTURE_CREATION", "plan_approved")
			stateMachine.transition("CODE_IMPLEMENTATION", "structure_created")
			stateMachine.transition("CODE_REVIEW", "code_implemented")
			stateMachine.transition("CODE_FIXING", "code_needs_fixes")
			expect(stateMachine.getState()).toBe("CODE_FIXING")

			stateMachine.transition("CODE_REVIEW", "code_fixed")
			expect(stateMachine.getState()).toBe("CODE_REVIEW")
		})

		it("should handle test failure flow", () => {
			stateMachine.startTask("Test task")
			stateMachine.transition("PLAN_REVIEW", "plan_created")
			stateMachine.transition("STRUCTURE_CREATION", "plan_approved")
			stateMachine.transition("CODE_IMPLEMENTATION", "structure_created")
			stateMachine.transition("CODE_REVIEW", "code_implemented")
			stateMachine.transition("DOCUMENTATION", "code_approved")
			stateMachine.transition("TESTING", "documentation_complete")
			stateMachine.transition("CODE_FIXING", "tests_failed")
			expect(stateMachine.getState()).toBe("CODE_FIXING")
		})
	})

	describe("transition validation", () => {
		it("should validate transitions with canTransitionTo", () => {
			expect(stateMachine.canTransitionTo("PLANNING", "start_task")).toBe(true)
			expect(stateMachine.canTransitionTo("CODE_IMPLEMENTATION")).toBe(false)
		})

		it("should return valid transitions from current state", () => {
			stateMachine.startTask("Test task")
			const validTransitions = stateMachine.getValidTransitions()
			expect(validTransitions.length).toBeGreaterThan(0)
			expect(validTransitions.some((t) => t.to === "PLAN_REVIEW")).toBe(true)
			expect(validTransitions.some((t) => t.to === "ERROR")).toBe(true)
		})
	})

	describe("pause and resume", () => {
		it("should pause from active state", () => {
			stateMachine.startTask("Test task")
			stateMachine.pause()
			expect(stateMachine.getState()).toBe("PAUSED")
			expect(stateMachine.getPreviousState()).toBe("PLANNING")
		})

		it("should resume to previous state", () => {
			stateMachine.startTask("Test task")
			stateMachine.pause()
			stateMachine.resume()
			expect(stateMachine.getState()).toBe("PLANNING")
			expect(stateMachine.getPreviousState()).toBeNull()
		})

		it("should throw error when pausing from IDLE", () => {
			expect(() => stateMachine.pause()).toThrow("Cannot pause from IDLE state")
		})

		it("should throw error when pausing from PAUSED", () => {
			stateMachine.startTask("Test task")
			stateMachine.pause()
			expect(() => stateMachine.pause()).toThrow("already paused")
		})

		it("should throw error when resuming from non-PAUSED state", () => {
			expect(() => stateMachine.resume()).toThrow("not paused")
		})

		it("should be able to pause from any active state", () => {
			const activeStates: WorkflowState[] = [
				"PLANNING",
				"PLAN_REVIEW",
				"STRUCTURE_CREATION",
				"CODE_IMPLEMENTATION",
				"CODE_REVIEW",
				"DOCUMENTATION",
				"TESTING",
			]

			for (const state of activeStates) {
				const sm = new WorkflowStateMachine({ initialState: state })
				sm.pause()
				expect(sm.getState()).toBe("PAUSED")
				sm.dispose()
			}
		})
	})

	describe("cancel", () => {
		it("should cancel and return to IDLE", () => {
			stateMachine.startTask("Test task")
			stateMachine.cancel()
			expect(stateMachine.getState()).toBe("IDLE")
		})

		it("should reset context on cancel", () => {
			stateMachine.startTask("Test task")
			stateMachine.addArtifact("artifact-1")
			stateMachine.cancel()
			expect(stateMachine.getContext().userTask).toBeUndefined()
			expect(stateMachine.getContext().artifacts).toHaveLength(0)
		})

		it("should throw error when canceling from IDLE", () => {
			expect(() => stateMachine.cancel()).toThrow("already in IDLE state")
		})
	})

	describe("error handling", () => {
		it("should transition to ERROR state", () => {
			stateMachine.startTask("Test task")
			stateMachine.setError("Something went wrong")
			expect(stateMachine.getState()).toBe("ERROR")
			expect(stateMachine.getContext().errorMessage).toBe("Something went wrong")
		})

		it("should retry from ERROR state", () => {
			stateMachine.startTask("Test task")
			stateMachine.setError("Error")
			stateMachine.retry()
			expect(stateMachine.getState()).toBe("PLANNING")
			expect(stateMachine.getContext().retryCount).toBe(1)
		})

		it("should throw error when setting error from invalid state", () => {
			expect(() => stateMachine.setError("Error")).toThrow("Cannot set error from IDLE state")
		})

		it("should throw error when retrying from non-ERROR state", () => {
			expect(() => stateMachine.retry()).toThrow("Can only retry from ERROR state")
		})
	})

	describe("artifact handling", () => {
		it("should handle implementation_plan artifact", () => {
			stateMachine.startTask("Test task")
			stateMachine.handleArtifactCreated("implementation_plan")
			expect(stateMachine.getState()).toBe("PLAN_REVIEW")
		})

		it("should handle pseudocode artifact", () => {
			stateMachine.startTask("Test task")
			stateMachine.transition("PLAN_REVIEW", "plan_created")
			stateMachine.transition("STRUCTURE_CREATION", "plan_approved")
			stateMachine.handleArtifactCreated("pseudocode")
			expect(stateMachine.getState()).toBe("CODE_IMPLEMENTATION")
		})

		it("should handle code artifact from CODE_IMPLEMENTATION", () => {
			stateMachine.startTask("Test task")
			stateMachine.transition("PLAN_REVIEW", "plan_created")
			stateMachine.transition("STRUCTURE_CREATION", "plan_approved")
			stateMachine.transition("CODE_IMPLEMENTATION", "structure_created")
			stateMachine.handleArtifactCreated("code")
			expect(stateMachine.getState()).toBe("CODE_REVIEW")
		})

		it("should handle code artifact from CODE_FIXING", () => {
			stateMachine.startTask("Test task")
			stateMachine.transition("PLAN_REVIEW", "plan_created")
			stateMachine.transition("STRUCTURE_CREATION", "plan_approved")
			stateMachine.transition("CODE_IMPLEMENTATION", "structure_created")
			stateMachine.transition("CODE_REVIEW", "code_implemented")
			stateMachine.transition("CODE_FIXING", "code_needs_fixes")
			stateMachine.handleArtifactCreated("code")
			expect(stateMachine.getState()).toBe("CODE_REVIEW")
		})

		it("should handle documentation artifact", () => {
			stateMachine.startTask("Test task")
			stateMachine.transition("PLAN_REVIEW", "plan_created")
			stateMachine.transition("STRUCTURE_CREATION", "plan_approved")
			stateMachine.transition("CODE_IMPLEMENTATION", "structure_created")
			stateMachine.transition("CODE_REVIEW", "code_implemented")
			stateMachine.transition("DOCUMENTATION", "code_approved")
			stateMachine.handleArtifactCreated("documentation")
			expect(stateMachine.getState()).toBe("TESTING")
		})
	})

	describe("review handling", () => {
		it("should handle plan approval", () => {
			stateMachine.startTask("Test task")
			stateMachine.transition("PLAN_REVIEW", "plan_created")
			stateMachine.handlePlanReview(true)
			expect(stateMachine.getState()).toBe("STRUCTURE_CREATION")
		})

		it("should handle plan rejection", () => {
			stateMachine.startTask("Test task")
			stateMachine.transition("PLAN_REVIEW", "plan_created")
			stateMachine.handlePlanReview(false)
			expect(stateMachine.getState()).toBe("PLAN_REVISION")
		})

		it("should handle code approval", () => {
			stateMachine.startTask("Test task")
			stateMachine.transition("PLAN_REVIEW", "plan_created")
			stateMachine.transition("STRUCTURE_CREATION", "plan_approved")
			stateMachine.transition("CODE_IMPLEMENTATION", "structure_created")
			stateMachine.transition("CODE_REVIEW", "code_implemented")
			stateMachine.handleCodeReview(true)
			expect(stateMachine.getState()).toBe("DOCUMENTATION")
		})

		it("should handle code rejection", () => {
			stateMachine.startTask("Test task")
			stateMachine.transition("PLAN_REVIEW", "plan_created")
			stateMachine.transition("STRUCTURE_CREATION", "plan_approved")
			stateMachine.transition("CODE_IMPLEMENTATION", "structure_created")
			stateMachine.transition("CODE_REVIEW", "code_implemented")
			stateMachine.handleCodeReview(false)
			expect(stateMachine.getState()).toBe("CODE_FIXING")
		})
	})

	describe("test results handling", () => {
		it("should handle passed tests", () => {
			stateMachine.startTask("Test task")
			stateMachine.transition("PLAN_REVIEW", "plan_created")
			stateMachine.transition("STRUCTURE_CREATION", "plan_approved")
			stateMachine.transition("CODE_IMPLEMENTATION", "structure_created")
			stateMachine.transition("CODE_REVIEW", "code_implemented")
			stateMachine.transition("DOCUMENTATION", "code_approved")
			stateMachine.transition("TESTING", "documentation_complete")
			stateMachine.handleTestResults(true)
			expect(stateMachine.getState()).toBe("COMPLETED")
		})

		it("should handle failed tests", () => {
			stateMachine.startTask("Test task")
			stateMachine.transition("PLAN_REVIEW", "plan_created")
			stateMachine.transition("STRUCTURE_CREATION", "plan_approved")
			stateMachine.transition("CODE_IMPLEMENTATION", "structure_created")
			stateMachine.transition("CODE_REVIEW", "code_implemented")
			stateMachine.transition("DOCUMENTATION", "code_approved")
			stateMachine.transition("TESTING", "documentation_complete")
			stateMachine.handleTestResults(false)
			expect(stateMachine.getState()).toBe("CODE_FIXING")
		})
	})

	describe("context management", () => {
		it("should add artifacts to context", () => {
			stateMachine.addArtifact("artifact-1")
			expect(stateMachine.getContext().artifacts).toContain("artifact-1")
		})

		it("should not add duplicate artifacts", () => {
			stateMachine.addArtifact("artifact-1")
			stateMachine.addArtifact("artifact-1")
			expect(stateMachine.getContext().artifacts).toHaveLength(1)
		})

		it("should add agents to context", () => {
			stateMachine.addAgent("agent-1")
			expect(stateMachine.getContext().agents).toContain("agent-1")
		})

		it("should remove agents from context", () => {
			stateMachine.addAgent("agent-1")
			stateMachine.removeAgent("agent-1")
			expect(stateMachine.getContext().agents).not.toContain("agent-1")
		})

		it("should update context", () => {
			stateMachine.updateContext({ metadata: { key: "value" } })
			expect(stateMachine.getContext().metadata).toEqual({ key: "value" })
		})
	})

	describe("state history", () => {
		it("should track state history", () => {
			stateMachine.startTask("Test task")
			stateMachine.transition("PLAN_REVIEW", "plan_created")

			const history = stateMachine.getHistory()
			expect(history).toHaveLength(3)
			expect(history[0].state).toBe("IDLE")
			expect(history[1].state).toBe("PLANNING")
			expect(history[2].state).toBe("PLAN_REVIEW")
		})

		it("should include trigger in history", () => {
			stateMachine.startTask("Test task")
			const history = stateMachine.getHistory()
			expect(history[1].trigger).toBe("start_task")
		})

		it("should limit history size", () => {
			const sm = new WorkflowStateMachine()
			// Generate more than maxHistorySize entries
			for (let i = 0; i < 150; i++) {
				sm.updateContext({ metadata: { iteration: i } })
			}
			const history = sm.getHistory()
			expect(history.length).toBeLessThanOrEqual(100)
			sm.dispose()
		})

		it("should return limited history", () => {
			stateMachine.startTask("Test task")
			stateMachine.transition("PLAN_REVIEW", "plan_created")
			stateMachine.transition("STRUCTURE_CREATION", "plan_approved")

			const history = stateMachine.getHistory(2)
			expect(history).toHaveLength(2)
		})
	})

	describe("events", () => {
		it("should emit stateChange event", () => {
			const listener = vi.fn()
			stateMachine.on("stateChange", listener)

			stateMachine.startTask("Test task")

			expect(listener).toHaveBeenCalledTimes(1)
			const event = listener.mock.calls[0][0] as WorkflowStateChangeEvent
			expect(event.previousState).toBe("IDLE")
			expect(event.newState).toBe("PLANNING")
			expect(event.trigger).toBe("start_task")
		})

		it("should emit reset event", () => {
			const listener = vi.fn()
			stateMachine.on("reset", listener)

			stateMachine.reset()

			expect(listener).toHaveBeenCalledTimes(1)
		})
	})

	describe("state queries", () => {
		it("should identify terminal states", () => {
			expect(stateMachine.isTerminalState()).toBe(true) // IDLE

			stateMachine.startTask("Test task")
			expect(stateMachine.isTerminalState()).toBe(false) // PLANNING

			stateMachine.transition("PLAN_REVIEW", "plan_created")
			stateMachine.transition("STRUCTURE_CREATION", "plan_approved")
			stateMachine.transition("CODE_IMPLEMENTATION", "structure_created")
			stateMachine.transition("CODE_REVIEW", "code_implemented")
			stateMachine.transition("DOCUMENTATION", "code_approved")
			stateMachine.transition("TESTING", "documentation_complete")
			stateMachine.transition("COMPLETED", "tests_passed")
			expect(stateMachine.isTerminalState()).toBe(true) // COMPLETED
		})

		it("should identify active state", () => {
			expect(stateMachine.isActive()).toBe(false) // IDLE

			stateMachine.startTask("Test task")
			expect(stateMachine.isActive()).toBe(true) // PLANNING

			stateMachine.pause()
			expect(stateMachine.isActive()).toBe(false) // PAUSED
		})

		it("should identify paused state", () => {
			expect(stateMachine.isPaused()).toBe(false)

			stateMachine.startTask("Test task")
			stateMachine.pause()
			expect(stateMachine.isPaused()).toBe(true)
		})

		it("should identify error state", () => {
			expect(stateMachine.hasError()).toBe(false)

			stateMachine.startTask("Test task")
			stateMachine.setError("Error")
			expect(stateMachine.hasError()).toBe(true)
		})
	})

	describe("progress", () => {
		it("should return 0 for IDLE state", () => {
			expect(stateMachine.getProgress()).toBe(0)
		})

		it("should return 100 for COMPLETED state", () => {
			const sm = new WorkflowStateMachine({ initialState: "COMPLETED" })
			expect(sm.getProgress()).toBe(100)
			sm.dispose()
		})

		it("should return -1 for PAUSED and ERROR states", () => {
			stateMachine.startTask("Test task")
			stateMachine.pause()
			expect(stateMachine.getProgress()).toBe(-1)

			stateMachine.resume()
			stateMachine.setError("Error")
			expect(stateMachine.getProgress()).toBe(-1)
		})

		it("should return increasing progress through workflow", () => {
			const progressValues: number[] = []

			stateMachine.startTask("Test task")
			progressValues.push(stateMachine.getProgress())

			stateMachine.transition("PLAN_REVIEW", "plan_created")
			progressValues.push(stateMachine.getProgress())

			stateMachine.transition("STRUCTURE_CREATION", "plan_approved")
			progressValues.push(stateMachine.getProgress())

			stateMachine.transition("CODE_IMPLEMENTATION", "structure_created")
			progressValues.push(stateMachine.getProgress())

			// Verify progress is increasing
			for (let i = 1; i < progressValues.length; i++) {
				expect(progressValues[i]).toBeGreaterThan(progressValues[i - 1])
			}
		})
	})

	describe("reset", () => {
		it("should reset to IDLE state", () => {
			stateMachine.startTask("Test task")
			stateMachine.transition("PLAN_REVIEW", "plan_created")
			stateMachine.reset()

			expect(stateMachine.getState()).toBe("IDLE")
			expect(stateMachine.getHistory()).toHaveLength(1)
			expect(stateMachine.getContext().artifacts).toHaveLength(0)
		})
	})

	describe("persistence", () => {
		it("should save state to storage", async () => {
			const storage = new MemoryStorageAdapter()
			const sm = new WorkflowStateMachine({
				persistenceKey: "test-workflow",
				storage,
			})

			sm.startTask("Test task")

			// Wait for async save
			await new Promise((resolve) => setTimeout(resolve, 10))

			const savedData = await storage.getItem("test-workflow")
			expect(savedData).not.toBeNull()

			const parsed = JSON.parse(savedData!)
			expect(parsed.currentState).toBe("PLANNING")

			sm.dispose()
		})

		it("should load state from storage", async () => {
			const storage = new MemoryStorageAdapter()

			// Save initial state
			await storage.setItem(
				"test-workflow",
				JSON.stringify({
					currentState: "CODE_IMPLEMENTATION",
					previousState: null,
					context: {
						userTask: "Loaded task",
						currentStep: 4,
						artifacts: ["artifact-1"],
						agents: ["agent-1"],
						retryCount: 0,
						metadata: {},
					},
					history: [{ state: "CODE_IMPLEMENTATION", timestamp: Date.now() }],
				}),
			)

			const sm = new WorkflowStateMachine({
				persistenceKey: "test-workflow",
				storage,
			})

			// Wait for async load
			await new Promise((resolve) => setTimeout(resolve, 10))

			expect(sm.getState()).toBe("CODE_IMPLEMENTATION")
			expect(sm.getContext().userTask).toBe("Loaded task")

			sm.dispose()
		})
	})
})

describe("WORKFLOW_STATES", () => {
	it("should contain all expected states", () => {
		expect(WORKFLOW_STATES).toContain("IDLE")
		expect(WORKFLOW_STATES).toContain("PLANNING")
		expect(WORKFLOW_STATES).toContain("PLAN_REVIEW")
		expect(WORKFLOW_STATES).toContain("PLAN_REVISION")
		expect(WORKFLOW_STATES).toContain("STRUCTURE_CREATION")
		expect(WORKFLOW_STATES).toContain("CODE_IMPLEMENTATION")
		expect(WORKFLOW_STATES).toContain("CODE_REVIEW")
		expect(WORKFLOW_STATES).toContain("CODE_FIXING")
		expect(WORKFLOW_STATES).toContain("DOCUMENTATION")
		expect(WORKFLOW_STATES).toContain("TESTING")
		expect(WORKFLOW_STATES).toContain("COMPLETED")
		expect(WORKFLOW_STATES).toContain("PAUSED")
		expect(WORKFLOW_STATES).toContain("ERROR")
	})
})

describe("MemoryStorageAdapter", () => {
	let storage: MemoryStorageAdapter

	beforeEach(() => {
		storage = new MemoryStorageAdapter()
	})

	it("should store and retrieve items", async () => {
		await storage.setItem("key", "value")
		const value = await storage.getItem("key")
		expect(value).toBe("value")
	})

	it("should return null for missing items", async () => {
		const value = await storage.getItem("missing")
		expect(value).toBeNull()
	})

	it("should remove items", async () => {
		await storage.setItem("key", "value")
		await storage.removeItem("key")
		const value = await storage.getItem("key")
		expect(value).toBeNull()
	})

	it("should clear all items", async () => {
		await storage.setItem("key1", "value1")
		await storage.setItem("key2", "value2")
		storage.clear()
		expect(await storage.getItem("key1")).toBeNull()
		expect(await storage.getItem("key2")).toBeNull()
	})
})
