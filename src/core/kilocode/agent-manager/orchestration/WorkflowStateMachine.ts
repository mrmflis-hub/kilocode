// kilocode_change - new file
import { WorkflowState, ArtifactType } from "./types"
import { EventEmitter } from "events"

/**
 * Valid workflow states
 */
export const WORKFLOW_STATES: WorkflowState[] = [
	"IDLE",
	"PLANNING",
	"PLAN_REVIEW",
	"PLAN_REVISION",
	"STRUCTURE_CREATION",
	"CODE_IMPLEMENTATION",
	"CODE_REVIEW",
	"CODE_FIXING",
	"DOCUMENTATION",
	"TESTING",
	"COMPLETED",
	"PAUSED",
	"ERROR",
]

/**
 * State transition triggers
 */
export type TransitionTrigger =
	| "start_task"
	| "plan_created"
	| "plan_approved"
	| "plan_needs_revision"
	| "plan_revised"
	| "structure_created"
	| "code_implemented"
	| "code_approved"
	| "code_needs_fixes"
	| "code_fixed"
	| "documentation_complete"
	| "tests_passed"
	| "tests_failed"
	| "error_occurred"
	| "pause_requested"
	| "resume_requested"
	| "cancel_requested"
	| "retry_requested"

/**
 * State transition definition
 */
export interface StateTransition {
	from: WorkflowState
	to: WorkflowState
	trigger: TransitionTrigger
	conditions?: string[]
	description?: string
}

/**
 * Workflow state history entry
 */
export interface StateHistoryEntry {
	state: WorkflowState
	timestamp: number
	trigger?: TransitionTrigger
	metadata?: Record<string, unknown>
}

/**
 * Workflow context data
 */
export interface WorkflowContext {
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
 * Workflow state change event
 */
export interface WorkflowStateChangeEvent {
	previousState: WorkflowState
	newState: WorkflowState
	trigger?: TransitionTrigger
	timestamp: number
	context: WorkflowContext
}

/**
 * Define valid state transitions
 * Based on the workflow described in documentation.md
 */
const VALID_TRANSITIONS: StateTransition[] = [
	// Start workflow
	{ from: "IDLE", to: "PLANNING", trigger: "start_task", description: "Start new task" },

	// Planning phase
	{ from: "PLANNING", to: "PLAN_REVIEW", trigger: "plan_created", description: "Plan created, ready for review" },
	{ from: "PLANNING", to: "ERROR", trigger: "error_occurred", description: "Error during planning" },

	// Plan review phase
	{
		from: "PLAN_REVIEW",
		to: "STRUCTURE_CREATION",
		trigger: "plan_approved",
		description: "Plan approved, start structure creation",
	},
	{ from: "PLAN_REVIEW", to: "PLAN_REVISION", trigger: "plan_needs_revision", description: "Plan needs revision" },
	{ from: "PLAN_REVIEW", to: "ERROR", trigger: "error_occurred", description: "Error during plan review" },

	// Plan revision phase
	{ from: "PLAN_REVISION", to: "PLAN_REVIEW", trigger: "plan_revised", description: "Plan revised, back to review" },
	{ from: "PLAN_REVISION", to: "ERROR", trigger: "error_occurred", description: "Error during plan revision" },

	// Structure creation phase
	{
		from: "STRUCTURE_CREATION",
		to: "CODE_IMPLEMENTATION",
		trigger: "structure_created",
		description: "Structure created, start coding",
	},
	{
		from: "STRUCTURE_CREATION",
		to: "ERROR",
		trigger: "error_occurred",
		description: "Error during structure creation",
	},

	// Code implementation phase
	{
		from: "CODE_IMPLEMENTATION",
		to: "CODE_REVIEW",
		trigger: "code_implemented",
		description: "Code implemented, ready for review",
	},
	{
		from: "CODE_IMPLEMENTATION",
		to: "ERROR",
		trigger: "error_occurred",
		description: "Error during code implementation",
	},

	// Code review phase
	{
		from: "CODE_REVIEW",
		to: "DOCUMENTATION",
		trigger: "code_approved",
		description: "Code approved, start documentation",
	},
	{ from: "CODE_REVIEW", to: "CODE_FIXING", trigger: "code_needs_fixes", description: "Code needs fixes" },
	{ from: "CODE_REVIEW", to: "ERROR", trigger: "error_occurred", description: "Error during code review" },

	// Code fixing phase
	{ from: "CODE_FIXING", to: "CODE_REVIEW", trigger: "code_fixed", description: "Code fixed, back to review" },
	{ from: "CODE_FIXING", to: "ERROR", trigger: "error_occurred", description: "Error during code fixing" },

	// Documentation phase
	{
		from: "DOCUMENTATION",
		to: "TESTING",
		trigger: "documentation_complete",
		description: "Documentation complete, start testing",
	},
	{ from: "DOCUMENTATION", to: "ERROR", trigger: "error_occurred", description: "Error during documentation" },

	// Testing phase
	{ from: "TESTING", to: "COMPLETED", trigger: "tests_passed", description: "Tests passed, workflow complete" },
	{ from: "TESTING", to: "CODE_FIXING", trigger: "tests_failed", description: "Tests failed, fix code" },
	{ from: "TESTING", to: "ERROR", trigger: "error_occurred", description: "Error during testing" },

	// Error handling
	{ from: "ERROR", to: "IDLE", trigger: "cancel_requested", description: "Cancel after error" },
	{ from: "ERROR", to: "PLANNING", trigger: "retry_requested", description: "Retry from planning" },

	// Pause/Resume - can pause from any active state
	{ from: "PLANNING", to: "PAUSED", trigger: "pause_requested", description: "Pause planning" },
	{ from: "PLAN_REVIEW", to: "PAUSED", trigger: "pause_requested", description: "Pause plan review" },
	{ from: "PLAN_REVISION", to: "PAUSED", trigger: "pause_requested", description: "Pause plan revision" },
	{ from: "STRUCTURE_CREATION", to: "PAUSED", trigger: "pause_requested", description: "Pause structure creation" },
	{ from: "CODE_IMPLEMENTATION", to: "PAUSED", trigger: "pause_requested", description: "Pause code implementation" },
	{ from: "CODE_REVIEW", to: "PAUSED", trigger: "pause_requested", description: "Pause code review" },
	{ from: "CODE_FIXING", to: "PAUSED", trigger: "pause_requested", description: "Pause code fixing" },
	{ from: "DOCUMENTATION", to: "PAUSED", trigger: "pause_requested", description: "Pause documentation" },
	{ from: "TESTING", to: "PAUSED", trigger: "pause_requested", description: "Pause testing" },

	// Resume - return to previous state
	{ from: "PAUSED", to: "PLANNING", trigger: "resume_requested", description: "Resume planning" },
	{ from: "PAUSED", to: "PLAN_REVIEW", trigger: "resume_requested", description: "Resume plan review" },
	{ from: "PAUSED", to: "PLAN_REVISION", trigger: "resume_requested", description: "Resume plan revision" },
	{ from: "PAUSED", to: "STRUCTURE_CREATION", trigger: "resume_requested", description: "Resume structure creation" },
	{
		from: "PAUSED",
		to: "CODE_IMPLEMENTATION",
		trigger: "resume_requested",
		description: "Resume code implementation",
	},
	{ from: "PAUSED", to: "CODE_REVIEW", trigger: "resume_requested", description: "Resume code review" },
	{ from: "PAUSED", to: "CODE_FIXING", trigger: "resume_requested", description: "Resume code fixing" },
	{ from: "PAUSED", to: "DOCUMENTATION", trigger: "resume_requested", description: "Resume documentation" },
	{ from: "PAUSED", to: "TESTING", trigger: "resume_requested", description: "Resume testing" },

	// Cancel - can cancel from any state
	{ from: "PLANNING", to: "IDLE", trigger: "cancel_requested", description: "Cancel planning" },
	{ from: "PLAN_REVIEW", to: "IDLE", trigger: "cancel_requested", description: "Cancel plan review" },
	{ from: "PLAN_REVISION", to: "IDLE", trigger: "cancel_requested", description: "Cancel plan revision" },
	{ from: "STRUCTURE_CREATION", to: "IDLE", trigger: "cancel_requested", description: "Cancel structure creation" },
	{ from: "CODE_IMPLEMENTATION", to: "IDLE", trigger: "cancel_requested", description: "Cancel code implementation" },
	{ from: "CODE_REVIEW", to: "IDLE", trigger: "cancel_requested", description: "Cancel code review" },
	{ from: "CODE_FIXING", to: "IDLE", trigger: "cancel_requested", description: "Cancel code fixing" },
	{ from: "DOCUMENTATION", to: "IDLE", trigger: "cancel_requested", description: "Cancel documentation" },
	{ from: "TESTING", to: "IDLE", trigger: "cancel_requested", description: "Cancel testing" },
	{ from: "PAUSED", to: "IDLE", trigger: "cancel_requested", description: "Cancel paused workflow" },
	{ from: "COMPLETED", to: "IDLE", trigger: "cancel_requested", description: "Reset completed workflow" },
]

/**
 * WorkflowStateMachine - Manages workflow state transitions
 *
 * This class is responsible for:
 * - Managing workflow state transitions
 * - Validating state transitions
 * - Tracking state history
 * - Persisting state to storage
 * - Handling pause/resume operations
 * - Emitting state change events
 */
export class WorkflowStateMachine extends EventEmitter {
	private currentState: WorkflowState = "IDLE"
	private previousState: WorkflowState | null = null
	private stateHistory: StateHistoryEntry[] = []
	private context: WorkflowContext
	private readonly maxHistorySize = 100
	private persistenceKey?: string
	private storage?: StorageAdapter

	/**
	 * Create a new WorkflowStateMachine
	 * @param options - Configuration options
	 */
	constructor(options?: {
		initialState?: WorkflowState
		persistenceKey?: string
		storage?: StorageAdapter
		context?: Partial<WorkflowContext>
	}) {
		super()

		this.persistenceKey = options?.persistenceKey
		this.storage = options?.storage

		this.context = {
			currentStep: 0,
			totalSteps: 10, // Default: 10 steps in workflow
			artifacts: [],
			agents: [],
			retryCount: 0,
			metadata: {},
			...options?.context,
		}

		if (options?.initialState) {
			this.currentState = options.initialState
		}

		// Record initial state in history
		this.recordStateEntry(this.currentState)

		// Load persisted state if available
		if (this.persistenceKey && this.storage) {
			this.loadState()
		}
	}

	/**
	 * Get the current workflow state
	 */
	getState(): WorkflowState {
		return this.currentState
	}

	/**
	 * Get the previous workflow state (before pause)
	 */
	getPreviousState(): WorkflowState | null {
		return this.previousState
	}

	/**
	 * Get the workflow context
	 */
	getContext(): Readonly<WorkflowContext> {
		return { ...this.context }
	}

	/**
	 * Update the workflow context
	 * @param updates - Context updates
	 */
	updateContext(updates: Partial<WorkflowContext>): void {
		this.context = { ...this.context, ...updates }
		this.saveState()
	}

	/**
	 * Get the state history
	 * @param limit - Maximum number of entries to return
	 */
	getHistory(limit?: number): StateHistoryEntry[] {
		if (limit) {
			return this.stateHistory.slice(-limit)
		}
		return [...this.stateHistory]
	}

	/**
	 * Check if a transition is valid
	 * @param to - Target state
	 * @param trigger - Transition trigger
	 */
	canTransitionTo(to: WorkflowState, trigger?: TransitionTrigger): boolean {
		return this.findValidTransition(to, trigger) !== undefined
	}

	/**
	 * Get all valid transitions from the current state
	 */
	getValidTransitions(): StateTransition[] {
		return VALID_TRANSITIONS.filter((t) => t.from === this.currentState)
	}

	/**
	 * Transition to a new state
	 * @param to - Target state
	 * @param trigger - Transition trigger
	 * @param metadata - Optional metadata
	 * @throws Error if transition is invalid
	 */
	transition(to: WorkflowState, trigger?: TransitionTrigger, metadata?: Record<string, unknown>): void {
		const transition = this.findValidTransition(to, trigger)

		if (!transition) {
			const validTransitions = this.getValidTransitions()
				.map((t) => `${t.to} (${t.trigger})`)
				.join(", ")
			throw new Error(
				`Invalid transition from ${this.currentState} to ${to}` +
					(trigger ? ` with trigger ${trigger}` : "") +
					`. Valid transitions: ${validTransitions}`,
			)
		}

		const previousState = this.currentState
		this.currentState = to

		// Handle pause/resume state tracking
		if (trigger === "pause_requested") {
			this.previousState = previousState
		} else if (trigger === "resume_requested") {
			// Clear previousState after successful resume
			this.previousState = null
		} else {
			this.previousState = null
		}

		// Update context
		this.updateContextForTransition(to, trigger)

		// Record in history
		this.recordStateEntry(to, trigger, metadata)

		// Save state
		this.saveState()

		// Emit state change event
		const event: WorkflowStateChangeEvent = {
			previousState,
			newState: to,
			trigger,
			timestamp: Date.now(),
			context: this.getContext(),
		}
		this.emit("stateChange", event)
	}

	/**
	 * Start a new task
	 * @param task - User task description
	 */
	startTask(task: string): void {
		if (this.currentState !== "IDLE") {
			throw new Error(`Cannot start task from ${this.currentState} state. Must be in IDLE state.`)
		}

		this.context.userTask = task
		this.transition("PLANNING", "start_task", { task })
	}

	/**
	 * Pause the workflow
	 */
	pause(): void {
		if (this.currentState === "PAUSED") {
			throw new Error("Workflow is already paused")
		}

		if (this.currentState === "IDLE" || this.currentState === "COMPLETED" || this.currentState === "ERROR") {
			throw new Error(`Cannot pause from ${this.currentState} state`)
		}

		this.transition("PAUSED", "pause_requested")
	}

	/**
	 * Resume the workflow
	 */
	resume(): void {
		if (this.currentState !== "PAUSED") {
			throw new Error("Workflow is not paused")
		}

		if (!this.previousState) {
			throw new Error("No previous state to resume to")
		}

		this.transition(this.previousState, "resume_requested")
	}

	/**
	 * Cancel the workflow
	 */
	cancel(): void {
		if (this.currentState === "IDLE") {
			throw new Error("Workflow is already in IDLE state")
		}

		this.transition("IDLE", "cancel_requested")
		this.resetContext()
	}

	/**
	 * Mark workflow as errored
	 * @param error - Error message
	 */
	setError(error: string): void {
		if (this.currentState === "ERROR" || this.currentState === "IDLE" || this.currentState === "COMPLETED") {
			throw new Error(`Cannot set error from ${this.currentState} state`)
		}

		this.context.errorMessage = error
		this.transition("ERROR", "error_occurred", { error })
	}

	/**
	 * Retry from error state
	 */
	retry(): void {
		if (this.currentState !== "ERROR") {
			throw new Error("Can only retry from ERROR state")
		}

		this.context.retryCount++
		this.context.errorMessage = undefined
		this.transition("PLANNING", "retry_requested")
	}

	/**
	 * Handle artifact creation
	 * @param artifactType - Type of artifact created
	 */
	handleArtifactCreated(artifactType: ArtifactType): void {
		switch (artifactType) {
			case "implementation_plan":
				if (this.currentState === "PLANNING") {
					this.transition("PLAN_REVIEW", "plan_created")
				}
				break

			case "pseudocode":
				if (this.currentState === "STRUCTURE_CREATION") {
					this.transition("CODE_IMPLEMENTATION", "structure_created")
				}
				break

			case "code":
				if (this.currentState === "CODE_IMPLEMENTATION") {
					this.transition("CODE_REVIEW", "code_implemented")
				} else if (this.currentState === "CODE_FIXING") {
					this.transition("CODE_REVIEW", "code_fixed")
				}
				break

			case "documentation":
				if (this.currentState === "DOCUMENTATION") {
					this.transition("TESTING", "documentation_complete")
				}
				break

			case "test_results":
				// Test results handling depends on content
				// This would be called with additional context
				break

			case "review_report":
				// Review handling depends on content
				// This would be called with additional context
				break
		}
	}

	/**
	 * Handle plan review result
	 * @param approved - Whether the plan was approved
	 */
	handlePlanReview(approved: boolean): void {
		if (this.currentState !== "PLAN_REVIEW") {
			throw new Error(`Cannot handle plan review from ${this.currentState} state`)
		}

		if (approved) {
			this.transition("STRUCTURE_CREATION", "plan_approved")
		} else {
			this.transition("PLAN_REVISION", "plan_needs_revision")
		}
	}

	/**
	 * Handle code review result
	 * @param approved - Whether the code was approved
	 */
	handleCodeReview(approved: boolean): void {
		if (this.currentState !== "CODE_REVIEW") {
			throw new Error(`Cannot handle code review from ${this.currentState} state`)
		}

		if (approved) {
			this.transition("DOCUMENTATION", "code_approved")
		} else {
			this.transition("CODE_FIXING", "code_needs_fixes")
		}
	}

	/**
	 * Handle test results
	 * @param passed - Whether tests passed
	 */
	handleTestResults(passed: boolean): void {
		if (this.currentState !== "TESTING") {
			throw new Error(`Cannot handle test results from ${this.currentState} state`)
		}

		if (passed) {
			this.transition("COMPLETED", "tests_passed")
		} else {
			this.transition("CODE_FIXING", "tests_failed")
		}
	}

	/**
	 * Add an artifact to the context
	 * @param artifactId - Artifact ID
	 */
	addArtifact(artifactId: string): void {
		if (!this.context.artifacts.includes(artifactId)) {
			this.context.artifacts.push(artifactId)
			this.saveState()
		}
	}

	/**
	 * Add an agent to the context
	 * @param agentId - Agent ID
	 */
	addAgent(agentId: string): void {
		if (!this.context.agents.includes(agentId)) {
			this.context.agents.push(agentId)
			this.saveState()
		}
	}

	/**
	 * Remove an agent from the context
	 * @param agentId - Agent ID
	 */
	removeAgent(agentId: string): void {
		const index = this.context.agents.indexOf(agentId)
		if (index !== -1) {
			this.context.agents.splice(index, 1)
			this.saveState()
		}
	}

	/**
	 * Check if workflow is in a terminal state
	 */
	isTerminalState(): boolean {
		return this.currentState === "COMPLETED" || this.currentState === "IDLE"
	}

	/**
	 * Check if workflow is active
	 */
	isActive(): boolean {
		return !this.isTerminalState() && this.currentState !== "PAUSED" && this.currentState !== "ERROR"
	}

	/**
	 * Check if workflow is paused
	 */
	isPaused(): boolean {
		return this.currentState === "PAUSED"
	}

	/**
	 * Check if workflow has error
	 */
	hasError(): boolean {
		return this.currentState === "ERROR"
	}

	/**
	 * Get progress percentage
	 */
	getProgress(): number {
		const stateProgress: Record<WorkflowState, number> = {
			IDLE: 0,
			PLANNING: 10,
			PLAN_REVIEW: 20,
			PLAN_REVISION: 20,
			STRUCTURE_CREATION: 30,
			CODE_IMPLEMENTATION: 50,
			CODE_REVIEW: 60,
			CODE_FIXING: 60,
			DOCUMENTATION: 80,
			TESTING: 90,
			COMPLETED: 100,
			PAUSED: -1, // Special case
			ERROR: -1, // Special case
		}

		return stateProgress[this.currentState] ?? 0
	}

	/**
	 * Reset the workflow to initial state
	 */
	reset(): void {
		this.currentState = "IDLE"
		this.previousState = null
		this.stateHistory = []
		this.resetContext()
		this.recordStateEntry("IDLE")
		this.saveState()
		this.emit("reset", { timestamp: Date.now() })
	}

	/**
	 * Dispose of the state machine
	 */
	dispose(): void {
		this.removeAllListeners()
	}

	/**
	 * Find a valid transition
	 */
	private findValidTransition(to: WorkflowState, trigger?: TransitionTrigger): StateTransition | undefined {
		return VALID_TRANSITIONS.find((t) => {
			if (t.from !== this.currentState || t.to !== to) {
				return false
			}

			// If trigger is specified, it must match
			if (trigger && t.trigger !== trigger) {
				return false
			}

			return true
		})
	}

	/**
	 * Record a state entry in history
	 */
	private recordStateEntry(
		state: WorkflowState,
		trigger?: TransitionTrigger,
		metadata?: Record<string, unknown>,
	): void {
		this.stateHistory.push({
			state,
			timestamp: Date.now(),
			trigger,
			metadata,
		})

		// Maintain history size limit
		if (this.stateHistory.length > this.maxHistorySize) {
			this.stateHistory.shift()
		}
	}

	/**
	 * Update context based on state transition
	 */
	private updateContextForTransition(to: WorkflowState, trigger?: TransitionTrigger): void {
		// Update step number based on state
		const stepMap: Partial<Record<WorkflowState, number>> = {
			PLANNING: 1,
			PLAN_REVIEW: 2,
			PLAN_REVISION: 2,
			STRUCTURE_CREATION: 3,
			CODE_IMPLEMENTATION: 4,
			CODE_REVIEW: 5,
			CODE_FIXING: 5,
			DOCUMENTATION: 6,
			TESTING: 7,
			COMPLETED: 8,
		}

		if (stepMap[to] !== undefined) {
			this.context.currentStep = stepMap[to]!
		}

		// Clear error message when leaving ERROR state
		if (this.currentState === "ERROR" && to !== "ERROR") {
			this.context.errorMessage = undefined
		}
	}

	/**
	 * Reset context to initial values
	 */
	private resetContext(): void {
		this.context = {
			currentStep: 0,
			totalSteps: 10,
			artifacts: [],
			agents: [],
			retryCount: 0,
			metadata: {},
		}
	}

	/**
	 * Save state to storage
	 */
	private saveState(): void {
		if (!this.persistenceKey || !this.storage) {
			return
		}

		const stateData = {
			currentState: this.currentState,
			previousState: this.previousState,
			context: this.context,
			history: this.stateHistory.slice(-50), // Save last 50 entries
		}

		this.storage.setItem(this.persistenceKey, JSON.stringify(stateData)).catch((error) => {
			console.error("Failed to save workflow state:", error)
		})
	}

	/**
	 * Load state from storage
	 */
	private loadState(): void {
		if (!this.persistenceKey || !this.storage) {
			return
		}

		this.storage.getItem(this.persistenceKey).then((data) => {
			if (!data) {
				return
			}

			try {
				const stateData = JSON.parse(data)
				this.currentState = stateData.currentState || "IDLE"
				this.previousState = stateData.previousState || null
				this.context = { ...this.context, ...stateData.context }
				this.stateHistory = stateData.history || []

				this.emit("loaded", { state: this.currentState, timestamp: Date.now() })
			} catch (error) {
				console.error("Failed to load workflow state:", error)
			}
		})
	}
}

/**
 * Storage adapter interface for persistence
 */
export interface StorageAdapter {
	getItem(key: string): Promise<string | null>
	setItem(key: string, value: string): Promise<void>
	removeItem(key: string): Promise<void>
}

/**
 * In-memory storage adapter for testing
 */
export class MemoryStorageAdapter implements StorageAdapter {
	private storage: Map<string, string> = new Map()

	async getItem(key: string): Promise<string | null> {
		return this.storage.get(key) || null
	}

	async setItem(key: string, value: string): Promise<void> {
		this.storage.set(key, value)
	}

	async removeItem(key: string): Promise<void> {
		this.storage.delete(key)
	}

	clear(): void {
		this.storage.clear()
	}
}
