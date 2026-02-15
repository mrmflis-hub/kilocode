// kilocode_change - new file
import { EventEmitter } from "events"
import type { AgentMessage } from "@kilocode/core-schemas"
import { WorkflowStateMachine } from "./WorkflowStateMachine"
import { AgentPoolManager } from "./AgentPoolManager"
import { MessageRouter } from "./MessageRouter"
import type { ArtifactStore } from "../../../../services/kilocode/artifact-store"
import { RoleRegistry, getDefaultModeForRole } from "./roles"

// ============================================================================
// Type Definitions (Local to avoid module resolution issues)
// ============================================================================

/**
 * Workflow states for the orchestration
 */
export type OrchestratorWorkflowState =
	| "IDLE"
	| "PLANNING"
	| "PLAN_REVIEW"
	| "PLAN_REVISION"
	| "STRUCTURE_CREATION"
	| "CODE_IMPLEMENTATION"
	| "CODE_REVIEW"
	| "CODE_FIXING"
	| "DOCUMENTATION"
	| "TESTING"
	| "COMPLETED"
	| "PAUSED"
	| "ERROR"

/**
 * Artifact types for the orchestration
 */
export type OrchestratorArtifactType =
	| "user_task"
	| "implementation_plan"
	| "pseudocode"
	| "code"
	| "review_report"
	| "documentation"
	| "test_results"
	| "error_report"

/**
 * Artifact summary reference for multi-agent session context
 */
export interface OrchestratorArtifactSummaryReference {
	artifactId: string
	artifactType: string
	summary: string
	status: string
	producerRole: string
}

/**
 * Artifact message payload
 */
interface ArtifactMessagePayload {
	artifactId: string
	artifactType: OrchestratorArtifactType
	summary: string
	metadata: Record<string, unknown>
}

/**
 * Status message payload
 */
interface StatusMessagePayload {
	agentId: string
	status: "idle" | "working" | "waiting" | "error"
	progress?: number
	currentTask?: string
}

/**
 * Response message payload
 */
interface ResponseMessagePayload {
	success: boolean
	result?: unknown
	error?: string
	artifactId?: string
}

/**
 * Error message payload
 */
interface ErrorMessagePayload {
	errorType: "agent_error" | "validation_error" | "timeout" | "rate_limit"
	message: string
	details?: unknown
	recoverable: boolean
}

/**
 * Control message payload
 */
interface ControlMessagePayload {
	action: "pause" | "resume" | "terminate" | "retry"
	reason?: string
}

/**
 * Request task payload
 */
interface RequestTaskPayload {
	task: string
	taskType: "analyze" | "plan" | "implement" | "review" | "document" | "test"
	context: {
		artifactIds: string[]
		instructions: string
		constraints?: string[]
	}
}

/**
 * Organiser context - minimal context for the orchestrator
 */
export interface OrganiserContext {
	/** User's original task */
	userTask: string

	/** Current workflow state */
	workflowState: OrchestratorWorkflowState

	/** Artifact summary references (with id and type) */
	artifacts: OrchestratorArtifactSummaryReference[]

	/** Agent statuses */
	agentStatuses: Map<string, string>

	/** Current workflow step */
	currentStep: string | null

	/** Mode descriptions */
	modeDescriptions: Map<string, string>

	/** To-do list */
	todoList: string[]

	/** Workflow history for debugging */
	workflowHistory: OrchestratorWorkflowState[]
}

/**
 * Orchestrator state change event
 */
interface OrchestratorStateChangeEvent {
	previousState: OrchestratorWorkflowState
	newState: OrchestratorWorkflowState
	trigger?: string
	timestamp: number
	context: {
		currentStep: number
		totalSteps: number
		artifacts: string[]
		agents: string[]
	}
}

/**
 * Orchestrator agent options
 */
interface OrchestratorAgentOptions {
	/** Persistence key for state machine */
	persistenceKey?: string

	/** Storage adapter for persistence */
	storage?: {
		getItem(key: string): Promise<string | null>
		setItem(key: string, value: string): Promise<void>
		removeItem(key: string): Promise<void>
	}
}

// ============================================================================
// OrchestratorAgent Class
// ============================================================================

/**
 * OrchestratorAgent - Coordinates all other agents, maintains minimal context, and manages workflow state
 *
 * This class is responsible for:
 * - Maintaining minimal context (task, workflow state, artifact summaries only)
 * - Coordinating agent spawning and task delegation
 * - Managing workflow state machine transitions
 * - Routing messages between agents
 * - Handling user interactions
 *
 * Key Design Principles:
 * - Minimal context: Only stores summaries, not full artifact content
 * - Agent isolation: Each agent runs in its own process
 * - Event-driven: Uses EventEmitter for communication
 * - Type-safe: Uses TypeScript types for all messages
 */
export class OrchestratorAgent extends EventEmitter {
	// Minimal context - only summaries, not full content
	private context: OrganiserContext

	// Core components
	private readonly agentPool: AgentPoolManager
	private readonly messageRouter: MessageRouter
	private readonly artifactStore: ArtifactStore
	private readonly stateMachine: WorkflowStateMachine
	private readonly roleRegistry: RoleRegistry

	// Timeout management
	private readonly defaultTaskTimeoutMs = 300000 // 5 minutes
	private readonly agentResponseTimeouts: Map<string, NodeJS.Timeout> = new Map()

	// Health monitoring
	private healthCheckInterval: ReturnType<typeof setInterval> | null = null
	private readonly healthCheckIntervalMs = 30000 // 30 seconds

	// Message ID counter
	private messageIdCounter = 0

	constructor(
		agentPool: AgentPoolManager,
		messageRouter: MessageRouter,
		artifactStore: ArtifactStore,
		roleRegistry: RoleRegistry,
		options?: OrchestratorAgentOptions,
	) {
		super()

		this.agentPool = agentPool
		this.messageRouter = messageRouter
		this.artifactStore = artifactStore
		this.roleRegistry = roleRegistry
		this.stateMachine = new WorkflowStateMachine({
			initialState: "IDLE",
			persistenceKey: options?.persistenceKey,
			storage: options?.storage,
			context: {
				userTask: "",
				currentStep: 0,
				totalSteps: 8, // Default workflow steps
				artifacts: [],
				agents: [],
				retryCount: 0,
				metadata: {},
			},
		})

		// Initialize minimal context
		this.context = {
			userTask: "",
			workflowState: "IDLE",
			artifacts: [],
			agentStatuses: new Map(),
			currentStep: null,
			modeDescriptions: new Map(),
			todoList: [],
			workflowHistory: [],
		}

		// Subscribe to state machine events
		this.stateMachine.on("stateChange", this.handleStateChange.bind(this))

		// Subscribe to messages from agents
		this.messageRouter.subscribe(this.getOrganiserId(), this.handleIncomingMessage.bind(this))

		// Start health monitoring
		this.startHealthMonitoring()
	}

	/**
	 * Get the organiser's unique ID
	 */
	private getOrganiserId(): string {
		return "organiser"
	}

	/**
	 * Start a new task
	 * @param task - User's task description
	 * @param workspace - Workspace directory
	 */
	async startTask(task: string, workspace: string): Promise<string> {
		if (this.stateMachine.getState() !== "IDLE") {
			throw new Error(`Cannot start task from ${this.stateMachine.getState()} state. Must be in IDLE state.`)
		}

		const taskId = this.generateTaskId()

		// Update context
		this.context.userTask = task
		this.context.workflowState = "PLANNING"
		this.context.workflowHistory = ["PLANNING"]

		// Start the workflow
		this.stateMachine.startTask(task)

		// Spawn Architect agent
		const architectAgentId = await this.spawnAgentWithRole("architect", workspace, task)

		// Send task to Architect
		await this.sendTaskToAgent(architectAgentId, {
			task,
			taskType: "plan",
			context: {
				artifactIds: [],
				instructions: "Create a comprehensive implementation plan for the user's task.",
				constraints: ["Follow best practices", "Consider edge cases", "Ensure testability"],
			},
		})

		return taskId
	}

	/**
	 * Handle incoming message from an agent
	 */
	private async handleIncomingMessage(message: AgentMessage): Promise<void> {
		switch (message.type) {
			case "artifact":
				await this.handleArtifactMessage(message)
				break

			case "status":
				await this.handleStatusMessage(message)
				break

			case "response":
				await this.handleResponseMessage(message)
				break

			case "error":
				await this.handleErrorMessage(message)
				break

			case "control":
				await this.handleControlMessage(message)
				break

			default:
				console.warn(`Unknown message type: ${message.type}`)
		}
	}

	/**
	 * Handle artifact message from agent
	 */
	private async handleArtifactMessage(message: AgentMessage): Promise<void> {
		const payload = message.payload as ArtifactMessagePayload

		// Get artifact summary (NOT full content)
		const summary = this.artifactStore.getArtifactSummary(payload.artifactId)
		if (!summary) {
			console.error(`Artifact ${payload.artifactId} not found`)
			return
		}

		// Create artifact reference with type info
		const artifactRef: OrchestratorArtifactSummaryReference = {
			artifactId: payload.artifactId,
			artifactType: payload.artifactType,
			summary: summary.brief,
			status: "completed",
			producerRole: message.from,
		}

		// Add to context
		this.context.artifacts.push(artifactRef)

		// Clear timeout for this agent
		this.clearAgentTimeout(message.from)

		// Handle based on artifact type
		await this.handleArtifactByType(payload.artifactType, artifactRef)

		// Update state machine
		this.stateMachine.addArtifact(payload.artifactId)
	}

	/**
	 * Handle artifact based on its type
	 */
	private async handleArtifactByType(
		artifactType: OrchestratorArtifactType,
		artifactRef: OrchestratorArtifactSummaryReference,
	): Promise<void> {
		switch (artifactType) {
			case "implementation_plan":
				// Transition to PLAN_REVIEW state
				if (this.stateMachine.getState() === "PLANNING") {
					this.stateMachine.handleArtifactCreated("implementation_plan")
					await this.requestPlanReview()
				}
				break

			case "pseudocode":
				// Transition to CODE_IMPLEMENTATION state
				if (this.stateMachine.getState() === "STRUCTURE_CREATION") {
					this.stateMachine.handleArtifactCreated("pseudocode")
					await this.startCodeImplementation()
				}
				break

			case "code":
				// Transition to CODE_REVIEW state
				if (this.stateMachine.getState() === "CODE_IMPLEMENTATION") {
					this.stateMachine.handleArtifactCreated("code")
					await this.requestCodeReview()
				}
				break

			case "review_report":
				// Handle review based on state
				await this.handleReviewReport(artifactRef)
				break

			case "documentation":
				// Transition to TESTING state
				if (this.stateMachine.getState() === "DOCUMENTATION") {
					this.stateMachine.handleArtifactCreated("documentation")
					await this.startTesting()
				}
				break

			case "test_results":
				// Handle test results
				await this.handleTestResults(artifactRef)
				break

			default:
				console.log(`Unhandled artifact type: ${artifactType}`)
		}
	}

	/**
	 * Handle status message from agent
	 */
	private async handleStatusMessage(message: AgentMessage): Promise<void> {
		const payload = message.payload as StatusMessagePayload

		// Update agent status
		this.context.agentStatuses.set(payload.agentId, payload.status)

		// Update state machine context
		this.stateMachine.updateContext({
			currentStep: this.stateMachine.getContext().currentStep,
		})

		// Emit progress event
		this.emit("progress", {
			agentId: payload.agentId,
			status: payload.status,
			progress: payload.progress,
			currentTask: payload.currentTask,
		})
	}

	/**
	 * Handle response message from agent
	 */
	private async handleResponseMessage(message: AgentMessage): Promise<void> {
		const payload = message.payload as ResponseMessagePayload

		// Clear timeout
		this.clearAgentTimeout(message.from)

		// Emit response event
		this.emit("response", {
			agentId: message.from,
			success: payload.success,
			result: payload.result,
			error: payload.error,
			artifactId: payload.artifactId,
		})

		// Update agent status
		this.context.agentStatuses.set(message.from, "idle")
	}

	/**
	 * Handle error message from agent
	 */
	private async handleErrorMessage(message: AgentMessage): Promise<void> {
		const payload = message.payload as ErrorMessagePayload

		// Clear timeout
		this.clearAgentTimeout(message.from)

		// Update agent status
		this.context.agentStatuses.set(message.from, "error")

		// Set error in state machine
		if (this.stateMachine.getState() !== "IDLE" && this.stateMachine.getState() !== "COMPLETED") {
			this.stateMachine.setError(`${payload.errorType}: ${payload.message}`)
		}

		// Emit error event
		this.emit("agentError", {
			agentId: message.from,
			errorType: payload.errorType,
			message: payload.message,
			details: payload.details,
			recoverable: payload.recoverable,
		})
	}

	/**
	 * Handle control message from agent or user
	 */
	private async handleControlMessage(message: AgentMessage): Promise<void> {
		const payload = message.payload as ControlMessagePayload

		switch (payload.action) {
			case "pause":
				this.stateMachine.pause()
				break

			case "resume":
				this.stateMachine.resume()
				break

			case "terminate":
				await this.terminateAgent(message.from)
				break

			case "retry":
				await this.retryCurrentStep()
				break
		}

		// Emit control event
		this.emit("control", {
			agentId: message.from,
			action: payload.action,
			reason: payload.reason,
		})
	}

	/**
	 * Handle state change from state machine
	 */
	private handleStateChange(event: OrchestratorStateChangeEvent): void {
		this.context.workflowState = event.newState as OrchestratorWorkflowState
		this.context.workflowHistory.push(event.newState as OrchestratorWorkflowState)

		// Emit state change event
		this.emit("stateChange", event)
	}

	/**
	 * Request plan review from Code Sceptic
	 */
	private async requestPlanReview(): Promise<void> {
		const planArtifact = this.context.artifacts.find((a) => a.artifactType === "implementation_plan")
		if (!planArtifact) {
			console.error("No plan artifact found for review")
			return
		}

		// Spawn Code Sceptic agent
		const scepticAgentId = await this.spawnAgentWithRole("code-sceptic", "", "")

		// Send review request
		await this.sendTaskToAgent(scepticAgentId, {
			task: `Review the implementation plan`,
			taskType: "review",
			context: {
				artifactIds: [planArtifact.artifactId],
				instructions: "Review the implementation plan for quality, completeness, and potential issues.",
				constraints: ["Check for edge cases", "Verify testability", "Assess complexity"],
			},
		})
	}

	/**
	 * Handle review report artifact
	 */
	private async handleReviewReport(artifactRef: OrchestratorArtifactSummaryReference): Promise<void> {
		const state = this.stateMachine.getState()

		if (state === "PLAN_REVIEW") {
			// Check if plan was approved (in a real implementation, this would be in the artifact content)
			// For now, we auto-approve after review
			this.stateMachine.handlePlanReview(true)
			await this.startStructureCreation()
		} else if (state === "CODE_REVIEW") {
			// Check if code was approved
			this.stateMachine.handleCodeReview(true)
			await this.startDocumentation()
		}
	}

	/**
	 * Start structure creation phase
	 */
	private async startStructureCreation(): Promise<void> {
		// Spawn Primary Coder agent
		const coderAgentId = await this.spawnAgentWithRole("primary-coder", "", "")

		// Get plan artifact
		const planArtifact = this.context.artifacts.find((a) => a.artifactType === "implementation_plan")
		if (!planArtifact) {
			console.error("No plan artifact found")
			return
		}

		// Send structure creation task
		await this.sendTaskToAgent(coderAgentId, {
			task: "Create file structure and pseudocode based on the implementation plan",
			taskType: "implement",
			context: {
				artifactIds: [planArtifact.artifactId],
				instructions: "Create file structure and pseudocode for the implementation plan.",
				constraints: ["Follow the plan closely", "Consider file organization", "Ensure modularity"],
			},
		})
	}

	/**
	 * Start code implementation phase
	 */
	private async startCodeImplementation(): Promise<void> {
		// Spawn Secondary Coder agent
		const coderAgentId = await this.spawnAgentWithRole("secondary-coder", "", "")

		// Get pseudocode artifact
		const pseudocodeArtifact = this.context.artifacts.find((a) => a.artifactType === "pseudocode")
		if (!pseudocodeArtifact) {
			console.error("No pseudocode artifact found")
			return
		}

		// Send code implementation task
		await this.sendTaskToAgent(coderAgentId, {
			task: "Implement the actual code based on the pseudocode",
			taskType: "implement",
			context: {
				artifactIds: [pseudocodeArtifact.artifactId],
				instructions: "Implement the actual code based on the pseudocode structure.",
				constraints: ["Follow best practices", "Add comments", "Handle errors"],
			},
		})
	}

	/**
	 * Request code review
	 */
	private async requestCodeReview(): Promise<void> {
		// Spawn Code Sceptic agent for code review
		const scepticAgentId = await this.spawnAgentWithRole("code-sceptic", "", "")

		// Get code artifact
		const codeArtifact = this.context.artifacts.find((a) => a.artifactType === "code")
		if (!codeArtifact) {
			console.error("No code artifact found for review")
			return
		}

		// Send review request
		await this.sendTaskToAgent(scepticAgentId, {
			task: "Review the implemented code",
			taskType: "review",
			context: {
				artifactIds: [codeArtifact.artifactId],
				instructions: "Review the code for bugs, performance issues, and code quality.",
				constraints: ["Check for edge cases", "Verify error handling", "Assess readability"],
			},
		})
	}

	/**
	 * Start documentation phase
	 */
	private async startDocumentation(): Promise<void> {
		// Spawn Documentation Writer agent
		const docAgentId = await this.spawnAgentWithRole("documentation-writer", "", "")

		// Get code artifact
		const codeArtifact = this.context.artifacts.find((a) => a.artifactType === "code")
		if (!codeArtifact) {
			console.error("No code artifact found for documentation")
			return
		}

		// Send documentation task
		await this.sendTaskToAgent(docAgentId, {
			task: "Generate documentation for the implemented code",
			taskType: "document",
			context: {
				artifactIds: [codeArtifact.artifactId],
				instructions: "Generate comprehensive documentation for the code.",
				constraints: ["Include code examples", "Document APIs", "Add README if appropriate"],
			},
		})
	}

	/**
	 * Handle test results artifact
	 */
	private async handleTestResults(artifactRef: OrchestratorArtifactSummaryReference): Promise<void> {
		// Check if tests passed (in a real implementation, this would be in the artifact content)
		const passed = true // Placeholder

		this.stateMachine.handleTestResults(passed)

		if (passed) {
			// Workflow complete
			this.emit("workflowComplete", {
				task: this.context.userTask,
				artifacts: this.context.artifacts,
				workflowHistory: this.context.workflowHistory,
			})
		}
	}

	/**
	 * Start testing phase
	 */
	private async startTesting(): Promise<void> {
		// Spawn Debugger/Tester agent
		const testerAgentId = await this.spawnAgentWithRole("debugger", "", "")

		// Get code artifact
		const codeArtifact = this.context.artifacts.find((a) => a.artifactType === "code")
		if (!codeArtifact) {
			console.error("No code artifact found for testing")
			return
		}

		// Send testing task
		await this.sendTaskToAgent(testerAgentId, {
			task: "Run tests on the implemented code",
			taskType: "test",
			context: {
				artifactIds: [codeArtifact.artifactId],
				instructions: "Run tests on the implemented code and report results.",
				constraints: ["Include unit tests", "Test edge cases", "Report all failures"],
			},
		})
	}

	/**
	 * Retry the current step
	 */
	private async retryCurrentStep(): Promise<void> {
		this.stateMachine.retry()

		// Re-spawn the agent for the current state
		const state = this.stateMachine.getState()

		switch (state) {
			case "PLANNING":
				await this.startTask(this.context.userTask, "")
				break
			case "PLAN_REVIEW":
				await this.requestPlanReview()
				break
			case "STRUCTURE_CREATION":
				await this.startStructureCreation()
				break
			case "CODE_IMPLEMENTATION":
				await this.startCodeImplementation()
				break
			case "CODE_REVIEW":
				await this.requestCodeReview()
				break
			case "DOCUMENTATION":
				await this.startDocumentation()
				break
			case "TESTING":
				await this.startTesting()
				break
		}
	}

	/**
	 * Pause the workflow
	 */
	async pause(): Promise<void> {
		this.stateMachine.pause()

		// Broadcast pause to all agents
		await this.broadcastToAllAgents({
			type: "control",
			action: "pause",
		} as unknown as AgentMessage)
	}

	/**
	 * Resume the workflow
	 */
	async resume(): Promise<void> {
		this.stateMachine.resume()

		// Broadcast resume to all agents
		await this.broadcastToAllAgents({
			type: "control",
			action: "resume",
		} as unknown as AgentMessage)
	}

	/**
	 * Cancel the workflow
	 */
	async cancel(): Promise<void> {
		// Terminate all agents
		for (const agentId of this.context.agentStatuses.keys()) {
			await this.terminateAgent(agentId)
		}

		// Clear context
		this.context.artifacts = []
		this.context.agentStatuses.clear()
		this.context.workflowHistory = []

		// Reset state machine
		this.stateMachine.cancel()
	}

	/**
	 * Spawn an agent with a specific role
	 */
	private async spawnAgentWithRole(role: string, workspace: string, task: string): Promise<string> {
		const agentId = `${role}_${Date.now()}_${this.generateMessageId()}`

		await this.agentPool.spawnAgent({
			agentId,
			role,
			providerProfile: this.getProviderProfileForRole(role),
			mode: this.getModeForRole(role),
			workspace,
			task,
			autoApprove: false,
		})

		// Add to state machine
		this.stateMachine.addAgent(agentId)

		// Track agent status
		this.context.agentStatuses.set(agentId, "spawning")

		return agentId
	}

	/**
	 * Send a task to an agent
	 */
	private async sendTaskToAgent(agentId: string, task: RequestTaskPayload): Promise<void> {
		// Update agent status
		this.context.agentStatuses.set(agentId, "busy")

		// Set timeout for agent response
		this.setAgentTimeout(agentId)

		// Send message via router
		await this.messageRouter.routeMessage({
			id: this.generateMessageId(),
			type: "request",
			from: this.getOrganiserId(),
			to: agentId,
			timestamp: Date.now(),
			payload: task,
		} as AgentMessage)
	}

	/**
	 * Broadcast message to all active agents
	 */
	private async broadcastToAllAgents(payload: AgentMessage): Promise<void> {
		const agents = this.agentPool.getActiveAgents()

		for (const agent of agents) {
			await this.messageRouter.routeMessage({
				id: this.generateMessageId(),
				type: payload.type,
				from: this.getOrganiserId(),
				to: agent.agentId,
				timestamp: Date.now(),
				payload: payload.payload,
			} as AgentMessage)
		}
	}

	/**
	 * Terminate a specific agent
	 */
	private async terminateAgent(agentId: string): Promise<void> {
		this.clearAgentTimeout(agentId)
		await this.agentPool.terminateAgent(agentId)
		this.context.agentStatuses.delete(agentId)
	}

	/**
	 * Set timeout for agent response
	 */
	private setAgentTimeout(agentId: string): void {
		const timeout = setTimeout(() => {
			console.warn(`Agent ${agentId} timed out`)
			this.handleAgentTimeout(agentId)
		}, this.defaultTaskTimeoutMs)

		this.agentResponseTimeouts.set(agentId, timeout)
	}

	/**
	 * Clear agent timeout
	 */
	private clearAgentTimeout(agentId: string): void {
		const timeout = this.agentResponseTimeouts.get(agentId)
		if (timeout) {
			clearTimeout(timeout)
			this.agentResponseTimeouts.delete(agentId)
		}
	}

	/**
	 * Handle agent timeout
	 */
	private handleAgentTimeout(agentId: string): void {
		// Update status
		this.context.agentStatuses.set(agentId, "error")

		// Emit timeout event
		this.emit("agentTimeout", { agentId })

		// Attempt to terminate the timed-out agent
		this.terminateAgent(agentId).catch((err) => {
			console.error(`Failed to terminate timed-out agent ${agentId}:`, err)
		})
	}

	/**
	 * Start health monitoring
	 */
	private startHealthMonitoring(): void {
		this.healthCheckInterval = setInterval(() => {
			this.performHealthCheck()
		}, this.healthCheckIntervalMs)
	}

	/**
	 * Perform health check on all agents
	 */
	private performHealthCheck(): void {
		const agents = this.agentPool.getActiveAgents()

		for (const agent of agents) {
			const status = this.context.agentStatuses.get(agent.agentId)
			if (status === "busy" || status === "spawning") {
				// Agent is working, check if it's still responsive
				const elapsed = Date.now() - agent.lastActivityAt
				if (elapsed > this.healthCheckIntervalMs * 2) {
					console.warn(`Agent ${agent.agentId} appears unresponsive (last activity: ${elapsed}ms ago)`)
				}
			}
		}
	}

	/**
	 * Get provider profile for a role
	 */
	private getProviderProfileForRole(role: string): string {
		// Use RoleRegistry to get provider profile
		const profile = this.roleRegistry.getProviderProfileForRole(role)
		if (profile) {
			return profile.id
		}

		// Fallback to default profiles based on role
		const profileMap: Record<string, string> = {
			architect: "default-architect",
			"code-sceptic": "default-sceptic",
			"primary-coder": "default-coder",
			"secondary-coder": "default-coder",
			"documentation-writer": "default-writer",
			debugger: "default-debugger",
		}
		return profileMap[role] || "default"
	}

	/**
	 * Get mode for a role
	 */
	private getModeForRole(role: string): string {
		// Use RoleRegistry to get mode
		const mode = this.roleRegistry.getModeForRole(role)
		if (mode) {
			return mode
		}

		// Fallback to role definitions
		const fallbackMode = getDefaultModeForRole(role)
		if (fallbackMode) {
			return fallbackMode
		}

		// Final fallback
		return "code"
	}

	/**
	 * Generate unique task ID
	 */
	private generateTaskId(): string {
		return `task_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
	}

	/**
	 * Generate unique message ID
	 */
	private generateMessageId(): string {
		return `msg_${++this.messageIdCounter}_${Date.now()}`
	}

	/**
	 * Get current context
	 */
	getContext(): Readonly<OrganiserContext> {
		return { ...this.context }
	}

	/**
	 * Get current workflow state
	 */
	getState(): OrchestratorWorkflowState {
		return this.stateMachine.getState() as OrchestratorWorkflowState
	}

	/**
	 * Get workflow progress
	 */
	getProgress(): number {
		return this.stateMachine.getProgress()
	}

	/**
	 * Get artifact summaries
	 */
	getArtifactSummaries(): OrchestratorArtifactSummaryReference[] {
		return [...this.context.artifacts]
	}

	/**
	 * Get agent statuses
	 */
	getAgentStatuses(): Map<string, string> {
		return new Map(this.context.agentStatuses)
	}

	/**
	 * Dispose of the orchestrator
	 */
	dispose(): void {
		// Stop health monitoring
		if (this.healthCheckInterval) {
			clearInterval(this.healthCheckInterval)
			this.healthCheckInterval = null
		}

		// Clear all timeouts
		for (const timeout of this.agentResponseTimeouts.values()) {
			clearTimeout(timeout)
		}
		this.agentResponseTimeouts.clear()

		// Cancel workflow
		this.stateMachine.cancel()

		// Dispose state machine
		this.stateMachine.dispose()

		// Unsubscribe from messages
		this.messageRouter.unsubscribe(this.getOrganiserId())

		// Remove all listeners
		this.removeAllListeners()
	}
}

// Re-export types for convenience
export type {
	ArtifactMessagePayload,
	StatusMessagePayload,
	ResponseMessagePayload,
	ErrorMessagePayload,
	ControlMessagePayload,
	RequestTaskPayload,
	OrchestratorStateChangeEvent,
	OrchestratorAgentOptions,
}
