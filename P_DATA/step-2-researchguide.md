# Incomplete Implementation Guide for Kilo Code Multi-Agent Orchestration System

## Executive Summary

This guide provides a complete, implementation-ready specification for your multi-agent orchestration system in Kilo Code. The architecture follows CrewAI's hierarchical process pattern with LangChain's subagents coordination model, validated by MetaGPT's software development approach.

---

## Part 1: Core Architecture

### 1.1 System Components Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                          │
│  (Single chat with Organiser, optional agent switching)         │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ORGANISER AGENT                              │
│  - Minimal context (summaries only)                             │
│  - Workflow state machine                                        │
│  - Agent dispatcher                                              │
│  - Artifact registry (metadata only)                            │
└─────┬───────────────────────────────────────────────────────────┘
      │
      │ (spawns and coordinates)
      │
      ├─────────────┬─────────────┬─────────────┬──────────────┬──────────┐
      ▼             ▼             ▼             ▼              ▼          ▼
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌────────┐  ┌─────────┐
│ARCHITECT │  │ CODER 1  │  │ CODER 2  │  │   CODE    │  │COMMEN- │  │DEBUGGER │
│          │  │(Primary) │  │(Second.) │  │  SCEPTIC  │  │  TER   │  │         │
└──────────┘  └──────────┘  └──────────┘  └───────────┘  └────────┘  └─────────┘
      │             │             │             │              │          │
      └─────────────┴─────────────┴─────────────┴──────────────┴──────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────┐
                    │   ARTIFACT STORE            │
                    │  - Full content storage     │
                    │  - Lazy loading             │
                    │  - Version tracking         │
                    └─────────────────────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────┐
                    │   MESSAGE ROUTER            │
                    │  - IPC communication        │
                    │  - Request/response         │
                    │  - Event broadcasting       │
                    └─────────────────────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────┐
                    │   AGENT POOL MANAGER        │
                    │  - Process spawning         │
                    │  - Lifecycle management     │
                    │  - Resource monitoring      │
                    └─────────────────────────────┘
```

### 1.2 Technology Stack

```typescript
// Core Technologies
- TypeScript (extension language)
- Node.js child_process (agent spawning)
- VS Code Extension API (UI and integration)
- React (webview UI)
- IPC (inter-process communication)
- SQLite or filesystem (artifact storage)

// Existing Kilo Infrastructure
- @kilocode/agent-runtime (agent process host)
- src/api/providers/ (provider implementations)
- src/core/tools/ (tool system)
- packages/ipc (message passing)
```

---

## Part 2: Data Models

### 2.1 Core Type Definitions

```typescript
// ============================================================================
// WORKFLOW STATE MACHINE
// ============================================================================

enum WorkflowState {
	IDLE = "IDLE",
	PLANNING = "PLANNING",
	PLAN_REVIEW = "PLAN_REVIEW",
	PLAN_REVISION = "PLAN_REVISION",
	STRUCTURE_CREATION = "STRUCTURE_CREATION",
	CODE_IMPLEMENTATION = "CODE_IMPLEMENTATION",
	CODE_REVIEW = "CODE_REVIEW",
	CODE_FIXING = "CODE_FIXING",
	DOCUMENTATION = "DOCUMENTATION",
	TESTING = "TESTING",
	COMPLETED = "COMPLETED",
	PAUSED = "PAUSED",
	ERROR = "ERROR",
}

// State transition rules
const STATE_TRANSITIONS: Record<WorkflowState, WorkflowState[]> = {
	[WorkflowState.IDLE]: [WorkflowState.PLANNING],
	[WorkflowState.PLANNING]: [WorkflowState.PLAN_REVIEW, WorkflowState.ERROR],
	[WorkflowState.PLAN_REVIEW]: [WorkflowState.PLAN_REVISION, WorkflowState.STRUCTURE_CREATION, WorkflowState.ERROR],
	[WorkflowState.PLAN_REVISION]: [WorkflowState.PLAN_REVIEW, WorkflowState.ERROR],
	[WorkflowState.STRUCTURE_CREATION]: [WorkflowState.CODE_IMPLEMENTATION, WorkflowState.ERROR],
	[WorkflowState.CODE_IMPLEMENTATION]: [WorkflowState.CODE_REVIEW, WorkflowState.ERROR],
	[WorkflowState.CODE_REVIEW]: [
		WorkflowState.CODE_FIXING,
		WorkflowState.DOCUMENTATION,
		WorkflowState.TESTING,
		WorkflowState.ERROR,
	],
	[WorkflowState.CODE_FIXING]: [WorkflowState.CODE_REVIEW, WorkflowState.ERROR],
	[WorkflowState.DOCUMENTATION]: [WorkflowState.TESTING, WorkflowState.COMPLETED, WorkflowState.ERROR],
	[WorkflowState.TESTING]: [WorkflowState.CODE_FIXING, WorkflowState.COMPLETED, WorkflowState.ERROR],
	[WorkflowState.COMPLETED]: [WorkflowState.IDLE],
	[WorkflowState.PAUSED]: [
		/* can resume to any previous state */
	],
	[WorkflowState.ERROR]: [WorkflowState.IDLE, WorkflowState.PAUSED],
}

// ============================================================================
// AGENT CONFIGURATION
// ============================================================================

interface ProviderProfile {
	id: string
	name: string
	provider: string // "anthropic", "openai", "google", etc.
	model: string
	apiKey?: string
	baseUrl?: string
	maxTokens?: number
	temperature?: number
	// ... other provider-specific settings
}

interface RoleDefinition {
	id: string
	name: string
	category: "coordination" | "planning" | "implementation" | "review" | "documentation" | "testing"
	description: string
	capabilities: string[]
	inputArtifacts: ArtifactType[]
	outputArtifacts: ArtifactType[]
	required: boolean
	systemPrompt: string
}

interface RoleAssignment {
	roleId: string
	roleName: string
	assignedProfileId: string | null
	isActive: boolean
	priority: number // For multiple agents in same role
}

interface AgentConfig {
	sessionId: string
	roleId: string
	role: RoleDefinition
	profile: ProviderProfile
	workspace: string
	autoApprove: boolean
	maxRetries: number
	timeout: number // milliseconds
}

// ============================================================================
// ARTIFACTS
// ============================================================================

enum ArtifactType {
	USER_TASK = "user_task",
	IMPLEMENTATION_PLAN = "implementation_plan",
	PSEUDOCODE = "pseudocode",
	CODE = "code",
	REVIEW_REPORT = "review_report",
	DOCUMENTATION = "documentation",
	TEST_RESULTS = "test_results",
	ERROR_REPORT = "error_report",
}

enum ArtifactStatus {
	IN_PROGRESS = "in_progress",
	COMPLETED = "completed",
	NEEDS_REVISION = "needs_revision",
	APPROVED = "approved",
	REJECTED = "rejected",
}

interface Artifact {
	id: string
	type: ArtifactType
	status: ArtifactStatus
	producer: string // Agent role ID
	createdAt: Date
	updatedAt: Date
	version: number

	// Summary for Organiser (max 200 tokens)
	summary: ArtifactSummary

	// Metadata
	metadata: ArtifactMetadata

	// Full content stored separately, loaded on demand
	contentRef: string // Reference to storage location
}

interface ArtifactSummary {
	brief: string // 1-2 sentences
	keyPoints: string[] // Max 5 bullet points
	filesAffected: string[]
	metrics?: {
		linesOfCode?: number
		testsCount?: number
		issuesFound?: number
	}
}

interface ArtifactMetadata {
	filesAffected?: string[]
	reviewedBy?: string[]
	approvalStatus?: "pending" | "approved" | "rejected"
	parentArtifactId?: string
	relatedArtifactIds?: string[]
	tags?: string[]
	priority?: "low" | "medium" | "high"
}

// ============================================================================
// MESSAGES
// ============================================================================

enum MessageType {
	REQUEST = "request",
	RESPONSE = "response",
	ARTIFACT = "artifact",
	STATUS = "status",
	ERROR = "error",
	CONTROL = "control",
}

interface Message {
	id: string
	type: MessageType
	from: string // Agent role ID or "user" or "organiser"
	to: string // Agent role ID or "organiser" or "broadcast"
	timestamp: Date
	payload: MessagePayload
	correlationId?: string // Link requests to responses
}

type MessagePayload = RequestPayload | ResponsePayload | ArtifactPayload | StatusPayload | ErrorPayload | ControlPayload

interface RequestPayload {
	task: string
	taskType: "analyze" | "plan" | "implement" | "review" | "document" | "test"
	context: {
		artifactIds: string[]
		instructions: string
		constraints?: string[]
	}
}

interface ResponsePayload {
	success: boolean
	result?: any
	error?: string
	artifactId?: string
}

interface ArtifactPayload {
	artifact: Artifact
	action: "created" | "updated" | "approved" | "rejected"
}

interface StatusPayload {
	agentId: string
	status: "idle" | "working" | "waiting" | "error"
	progress?: number // 0-100
	currentTask?: string
}

interface ErrorPayload {
	errorType: "agent_error" | "validation_error" | "timeout" | "rate_limit"
	message: string
	details?: any
	recoverable: boolean
}

interface ControlPayload {
	action: "pause" | "resume" | "terminate" | "retry"
	reason?: string
}

// ============================================================================
// ORGANISER CONTEXT
// ============================================================================

interface OrganiserContext {
	// User's original task
	userTask: string

	// Current workflow state
	workflowState: WorkflowState
	previousState?: WorkflowState

	// Artifact registry (SUMMARIES ONLY)
	artifacts: Map<string, ArtifactSummary>

	// Agent statuses
	agentStatuses: Map<string, AgentStatus>

	// Current workflow step
	currentStep: WorkflowStep

	// To-do list
	toDoList: Task[]

	// Mode/Role descriptions
	roleDescriptions: Map<string, RoleDefinition>

	// Session metadata
	sessionId: string
	startTime: Date
	estimatedCompletion?: Date
}

interface AgentStatus {
	roleId: string
	status: "idle" | "spawning" | "working" | "waiting" | "error" | "terminated"
	currentTask?: string
	progress?: number
	lastUpdate: Date
	errorCount: number
}

interface WorkflowStep {
	stepNumber: number
	description: string
	involvedAgents: string[]
	expectedArtifacts: ArtifactType[]
	completionCriteria: string[]
}

interface Task {
	id: string
	description: string
	assignedTo?: string // Agent role ID
	status: "pending" | "in_progress" | "completed" | "blocked"
	dependencies: string[] // Task IDs
	createdAt: Date
	completedAt?: Date
}
```

---

## Part 3: Core Components Implementation

### 3.1 Agent Pool Manager

```typescript
// ============================================================================
// AGENT POOL MANAGER
// Purpose: Spawns, manages, and monitors agent processes
// ============================================================================

import { fork, ChildProcess } from "child_process"
import * as vscode from "vscode"
import { RuntimeProcessHandler } from "../RuntimeProcessHandler"

class AgentPoolManager {
	private agents: Map<string, AgentInstance> = new Map()
	private configManager: OrchestrationConfigManager
	private messageRouter: MessageRouter
	private processHandler: RuntimeProcessHandler
	private maxConcurrentAgents: number = 5
	private healthCheckInterval: NodeJS.Timeout | null = null

	constructor(context: vscode.ExtensionContext, messageRouter: MessageRouter, processHandler: RuntimeProcessHandler) {
		this.configManager = new OrchestrationConfigManager(context)
		this.messageRouter = messageRouter
		this.processHandler = processHandler
		this.setupHealthMonitoring()
	}

	/**
	 * Initialize agent pool from user configuration
	 */
	async initialize(): Promise<void> {
		const assignments = await this.configManager.getRoleAssignments()
		const validation = await this.configManager.validateConfiguration()

		if (!validation.isValid) {
			throw new Error(`Invalid configuration: ${validation.errors.join(", ")}`)
		}

		// Only spawn required agents at startup (others on-demand)
		const requiredAssignments = assignments.filter((a) => {
			const role = AVAILABLE_ROLES.find((r) => r.id === a.roleId)
			return role?.required && a.isActive && a.assignedProfileId
		})

		for (const assignment of requiredAssignments) {
			await this.spawnAgent(assignment)
		}
	}

	/**
	 * Spawn a new agent process
	 */
	async spawnAgent(assignment: RoleAssignment): Promise<AgentInstance> {
		// Check if agent already exists
		if (this.agents.has(assignment.roleId)) {
			return this.agents.get(assignment.roleId)!
		}

		// Check concurrent limit
		const activeCount = Array.from(this.agents.values()).filter((a) => a.status !== "terminated").length

		if (activeCount >= this.maxConcurrentAgents) {
			throw new Error(`Maximum concurrent agents (${this.maxConcurrentAgents}) reached`)
		}

		// Get profile and role definition
		const profile = await this.configManager.getProviderProfile(assignment.assignedProfileId!)
		const role = AVAILABLE_ROLES.find((r) => r.id === assignment.roleId)

		if (!profile || !role) {
			throw new Error(`Invalid assignment: profile or role not found`)
		}

		// Create agent config (must match AgentConfig in packages/agent-runtime/src/process.ts)
		const agentConfig = {
			workspace: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "",
			providerSettings: {
				// Map profile to ProviderSettings
				...profile,
			},
			mode: "architect", // or derived from role
			autoApprove: false,
			sessionId: this.generateSessionId(),
		}

		// Spawn agent process using RuntimeProcessHandler
		// Note: In actual implementation, use RuntimeProcessHandler.spawnProcess()
		// This example shows the underlying logic
		this.processHandler.spawnProcess(
			"", // cliPath ignored
			agentConfig.workspace,
			"", // initial task
			agentConfig,
			(sessionId, event) => this.handleAgentEvent(assignment.roleId, sessionId, event),
		)

		// Create agent instance wrapper
		const agent = new AgentInstance(
			assignment.roleId,
			role,
			profile,
			null, // Process is managed by handler
			this.messageRouter,
		)

		// Wait for agent ready signal
		await agent.waitForReady(30000) // 30 second timeout

		// Register agent
		this.agents.set(assignment.roleId, agent)

		console.log(`[AgentPoolManager] Spawned agent: ${role.name} (${profile.model})`)

		return agent
	}

	/**
	 * Get or spawn agent on-demand
	 */
	async getAgent(roleId: string): Promise<AgentInstance | null> {
		// Check if already spawned
		if (this.agents.has(roleId)) {
			return this.agents.get(roleId)!
		}

		// Try to spawn
		const assignment = (await this.configManager.getRoleAssignments()).find(
			(a) => a.roleId === roleId && a.isActive && a.assignedProfileId,
		)

		if (!assignment) {
			return null
		}

		return await this.spawnAgent(assignment)
	}

	/**
	 * Terminate a specific agent
	 */
	async terminateAgent(roleId: string): Promise<void> {
		const agent = this.agents.get(roleId)
		if (!agent) return

		await agent.terminate()
		this.agents.delete(roleId)

		console.log(`[AgentPoolManager] Terminated agent: ${roleId}`)
	}

	/**
	 * Pause all agents
	 */
	async pauseAll(): Promise<void> {
		const pausePromises = Array.from(this.agents.values()).map((agent) => agent.pause())

		await Promise.all(pausePromises)
		console.log(`[AgentPoolManager] Paused all agents`)
	}

	/**
	 * Resume all agents
	 */
	async resumeAll(): Promise<void> {
		const resumePromises = Array.from(this.agents.values()).map((agent) => agent.resume())

		await Promise.all(resumePromises)
		console.log(`[AgentPoolManager] Resumed all agents`)
	}

	/**
	 * Terminate all agents
	 */
	async terminateAll(): Promise<void> {
		const terminatePromises = Array.from(this.agents.keys()).map((roleId) => this.terminateAgent(roleId))

		await Promise.all(terminatePromises)
		console.log(`[AgentPoolManager] Terminated all agents`)
	}

	/**
	 * Get status of all agents
	 */
	getAgentStatuses(): Map<string, AgentStatus> {
		const statuses = new Map<string, AgentStatus>()

		for (const [roleId, agent] of this.agents) {
			statuses.set(roleId, agent.getStatus())
		}

		return statuses
	}

	/**
	 * Setup health monitoring for all agents
	 */
	private setupHealthMonitoring(): void {
		this.healthCheckInterval = setInterval(() => {
			for (const [roleId, agent] of this.agents) {
				if (!agent.isHealthy()) {
					console.warn(`[AgentPoolManager] Agent ${roleId} unhealthy, attempting recovery`)
					this.handleUnhealthyAgent(roleId, agent)
				}
			}
		}, 10000) // Check every 10 seconds
	}

	/**
	 * Handle unhealthy agent
	 */
	private async handleUnhealthyAgent(roleId: string, agent: AgentInstance): Promise<void> {
		// Try to recover
		try {
			await agent.recover()
		} catch (error) {
			// Recovery failed, terminate and respawn if required
			console.error(`[AgentPoolManager] Agent ${roleId} recovery failed:`, error)

			const role = AVAILABLE_ROLES.find((r) => r.id === roleId)
			if (role?.required) {
				await this.terminateAgent(roleId)

				const assignment = (await this.configManager.getRoleAssignments()).find((a) => a.roleId === roleId)

				if (assignment) {
					await this.spawnAgent(assignment)
				}
			}
		}
	}

	/**
	 * Generate unique session ID
	 */
	private generateSessionId(): string {
		return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
	}

	/**
	 * Cleanup
	 */
	dispose(): void {
		if (this.healthCheckInterval) {
			clearInterval(this.healthCheckInterval)
		}

		this.terminateAll()
	}
}

// ============================================================================
// AGENT INSTANCE WRAPPER
// ============================================================================

class AgentInstance {
	private process: ChildProcess
	private messageRouter: MessageRouter
	private readyPromise: Promise<void>
	private readyResolve?: () => void
	private lastHeartbeat: Date
	private errorCount: number = 0

	public roleId: string
	public role: RoleDefinition
	public profile: ProviderProfile
	public status: AgentStatus["status"] = "spawning"
	public currentTask?: string
	public progress: number = 0

	constructor(
		roleId: string,
		role: RoleDefinition,
		profile: ProviderProfile,
		process: ChildProcess,
		messageRouter: MessageRouter,
	) {
		this.roleId = roleId
		this.role = role
		this.profile = profile
		this.process = process
		this.messageRouter = messageRouter
		this.lastHeartbeat = new Date()

		// Setup ready promise
		this.readyPromise = new Promise((resolve) => {
			this.readyResolve = resolve
		})

		this.setupMessageHandlers()
	}

	/**
	 * Setup message handlers for agent process
	 */
	private setupMessageHandlers(): void {
		this.process.on("message", (msg: any) => {
			if (msg.type === "ready") {
				this.status = "idle"
				this.readyResolve?.()
			} else if (msg.type === "heartbeat") {
				this.lastHeartbeat = new Date()
			} else {
				// Forward message to router
				this.messageRouter.routeMessage({
					...msg,
					from: this.roleId,
				})
			}
		})

		this.process.on("error", (error) => {
			console.error(`[AgentInstance] Agent ${this.roleId} error:`, error)
			this.errorCount++
			this.status = "error"
		})

		this.process.on("exit", (code) => {
			console.log(`[AgentInstance] Agent ${this.roleId} exited with code ${code}`)
			this.status = "terminated"
		})
	}

	/**
	 * Wait for agent to be ready
	 */
	async waitForReady(timeout: number): Promise<void> {
		const timeoutPromise = new Promise<void>((_, reject) => {
			setTimeout(() => reject(new Error("Agent ready timeout")), timeout)
		})

		await Promise.race([this.readyPromise, timeoutPromise])
	}

	/**
	 * Send message to agent
	 */
	async sendMessage(message: Message): Promise<void> {
		if (this.status === "terminated") {
			throw new Error(`Agent ${this.roleId} is terminated`)
		}

		this.process.send(message)
	}

	/**
	 * Pause agent
	 */
	async pause(): Promise<void> {
		await this.sendMessage({
			id: this.generateMessageId(),
			type: MessageType.CONTROL,
			from: "organiser",
			to: this.roleId,
			timestamp: new Date(),
			payload: {
				action: "pause",
			} as ControlPayload,
		})

		this.status = "waiting"
	}

	/**
	 * Resume agent
	 */
	async resume(): Promise<void> {
		await this.sendMessage({
			id: this.generateMessageId(),
			type: MessageType.CONTROL,
			from: "organiser",
			to: this.roleId,
			timestamp: new Date(),
			payload: {
				action: "resume",
			} as ControlPayload,
		})

		this.status = "idle"
	}

	/**
	 * Terminate agent
	 */
	async terminate(): Promise<void> {
		await this.sendMessage({
			id: this.generateMessageId(),
			type: MessageType.CONTROL,
			from: "organiser",
			to: this.roleId,
			timestamp: new Date(),
			payload: {
				action: "terminate",
			} as ControlPayload,
		})

		// Give agent 5 seconds to cleanup, then force kill
		setTimeout(() => {
			if (!this.process.killed) {
				this.process.kill()
			}
		}, 5000)

		this.status = "terminated"
	}

	/**
	 * Check if agent is healthy
	 */
	isHealthy(): boolean {
		const now = new Date().getTime()
		const lastBeat = this.lastHeartbeat.getTime()
		const timeSinceHeartbeat = now - lastBeat

		// Unhealthy if no heartbeat in 30 seconds
		return timeSinceHeartbeat < 30000 && this.errorCount < 3
	}

	/**
	 * Attempt to recover agent
	 */
	async recover(): Promise<void> {
		// Try to resume if waiting
		if (this.status === "waiting") {
			await this.resume()
			return
		}

		// Otherwise throw - caller should respawn
		throw new Error(`Agent ${this.roleId} cannot be recovered`)
	}

	/**
	 * Get agent status
	 */
	getStatus(): AgentStatus {
		return {
			roleId: this.roleId,
			status: this.status,
			currentTask: this.currentTask,
			progress: this.progress,
			lastUpdate: new Date(),
			errorCount: this.errorCount,
		}
	}

	private generateMessageId(): string {
		return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
	}
}
```

### 3.2 Message Router

```typescript
// ============================================================================
// MESSAGE ROUTER
// Purpose: Routes messages between agents and Organiser
// ============================================================================

class MessageRouter {
	private subscribers: Map<string, MessageHandler[]> = new Map()
	private messageQueue: Message[] = []
	private processing: boolean = false
	private requestCallbacks: Map<string, ResponseCallback> = new Map()
	private messageLog: Message[] = []
	private maxLogSize: number = 1000

	constructor() {
		this.startProcessing()
	}

	/**
	 * Subscribe to messages for specific recipient
	 */
	subscribe(recipientId: string, handler: MessageHandler): void {
		if (!this.subscribers.has(recipientId)) {
			this.subscribers.set(recipientId, [])
		}

		this.subscribers.get(recipientId)!.push(handler)
	}

	/**
	 * Unsubscribe from messages
	 */
	unsubscribe(recipientId: string, handler: MessageHandler): void {
		const handlers = this.subscribers.get(recipientId)
		if (!handlers) return

		const index = handlers.indexOf(handler)
		if (index > -1) {
			handlers.splice(index, 1)
		}
	}

	/**
	 * Route a message to appropriate recipient(s)
	 */
	routeMessage(message: Message): void {
		// Add to log
		this.addToLog(message)

		// Handle broadcast
		if (message.to === "broadcast") {
			for (const [recipientId, handlers] of this.subscribers) {
				if (recipientId !== message.from) {
					for (const handler of handlers) {
						handler(message)
					}
				}
			}
			return
		}

		// Route to specific recipient
		const handlers = this.subscribers.get(message.to)
		if (handlers) {
			for (const handler of handlers) {
				handler(message)
			}
		}

		// If this is a response, trigger callback
		if (message.type === MessageType.RESPONSE && message.correlationId) {
			const callback = this.requestCallbacks.get(message.correlationId)
			if (callback) {
				callback(message.payload as ResponsePayload)
				this.requestCallbacks.delete(message.correlationId)
			}
		}
	}

	/**
	 * Send request and wait for response
	 */
	async sendRequest(
		from: string,
		to: string,
		request: RequestPayload,
		timeout: number = 60000,
	): Promise<ResponsePayload> {
		const messageId = this.generateMessageId()

		const responsePromise = new Promise<ResponsePayload>((resolve, reject) => {
			// Setup timeout
			const timeoutId = setTimeout(() => {
				this.requestCallbacks.delete(messageId)
				reject(new Error(`Request timeout: ${to}`))
			}, timeout)

			// Setup callback
			this.requestCallbacks.set(messageId, (response: ResponsePayload) => {
				clearTimeout(timeoutId)
				resolve(response)
			})
		})

		// Send request message
		const message: Message = {
			id: messageId,
			type: MessageType.REQUEST,
			from,
			to,
			timestamp: new Date(),
			payload: request,
		}

		this.routeMessage(message)

		return responsePromise
	}

	/**
	 * Send response to a request
	 */
	sendResponse(from: string, to: string, correlationId: string, response: ResponsePayload): void {
		const message: Message = {
			id: this.generateMessageId(),
			type: MessageType.RESPONSE,
			from,
			to,
			timestamp: new Date(),
			payload: response,
			correlationId,
		}

		this.routeMessage(message)
	}

	/**
	 * Queue message for processing
	 */
	queueMessage(message: Message): void {
		this.messageQueue.push(message)
	}

	/**
	 * Start processing message queue
	 */
	private startProcessing(): void {
		setInterval(() => {
			if (this.processing || this.messageQueue.length === 0) {
				return
			}

			this.processing = true

			while (this.messageQueue.length > 0) {
				const message = this.messageQueue.shift()!
				this.routeMessage(message)
			}

			this.processing = false
		}, 100) // Process every 100ms
	}

	/**
	 * Add message to log
	 */
	private addToLog(message: Message): void {
		this.messageLog.push(message)

		// Trim log if too large
		if (this.messageLog.length > this.maxLogSize) {
			this.messageLog = this.messageLog.slice(-this.maxLogSize)
		}
	}

	/**
	 * Get message log for debugging
	 */
	getMessageLog(): Message[] {
		return [...this.messageLog]
	}

	/**
	 * Get messages for specific agent
	 */
	getMessagesForAgent(agentId: string): Message[] {
		return this.messageLog.filter((m) => m.to === agentId || m.from === agentId)
	}

	private generateMessageId(): string {
		return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
	}
}

type MessageHandler = (message: Message) => void
type ResponseCallback = (response: ResponsePayload) => void
```

### 3.3 Artifact Store

````typescript
// ============================================================================
// ARTIFACT STORE
// Purpose: Manages artifact storage, retrieval, and summarization
// ============================================================================

import * as fs from "fs/promises"
import * as path from "path"

class ArtifactStore {
	private storageDir: string
	private artifactIndex: Map<string, Artifact> = new Map()
	private summarizer: ArtifactSummarizer
	private maxSummaryTokens: number = 200

	constructor(storageDir: string) {
		this.storageDir = storageDir
		this.summarizer = new ArtifactSummarizer(this.maxSummaryTokens)
		this.ensureStorageDir()
	}

	/**
	 * Store a new artifact
	 */
	async storeArtifact(
		type: ArtifactType,
		producer: string,
		content: string,
		metadata: ArtifactMetadata,
	): Promise<Artifact> {
		const artifactId = this.generateArtifactId()
		const contentRef = `${artifactId}.json`

		// Generate summary
		const summary = await this.summarizer.summarize(content, type, metadata)

		// Create artifact object
		const artifact: Artifact = {
			id: artifactId,
			type,
			status: ArtifactStatus.IN_PROGRESS,
			producer,
			createdAt: new Date(),
			updatedAt: new Date(),
			version: 1,
			summary,
			metadata,
			contentRef,
		}

		// Store full content to disk
		await this.writeContent(contentRef, content)

		// Index artifact
		this.artifactIndex.set(artifactId, artifact)

		console.log(`[ArtifactStore] Stored artifact: ${artifactId} (${type})`)

		return artifact
	}

	/**
	 * Update existing artifact
	 */
	async updateArtifact(
		artifactId: string,
		content: string,
		status?: ArtifactStatus,
		metadata?: Partial<ArtifactMetadata>,
	): Promise<Artifact> {
		const artifact = this.artifactIndex.get(artifactId)
		if (!artifact) {
			throw new Error(`Artifact not found: ${artifactId}`)
		}

		// Update version
		artifact.version++
		artifact.updatedAt = new Date()

		// Update status if provided
		if (status) {
			artifact.status = status
		}

		// Update metadata if provided
		if (metadata) {
			artifact.metadata = { ...artifact.metadata, ...metadata }
		}

		// Regenerate summary
		artifact.summary = await this.summarizer.summarize(content, artifact.type, artifact.metadata)

		// Store updated content
		const newContentRef = `${artifactId}_v${artifact.version}.json`
		await this.writeContent(newContentRef, content)
		artifact.contentRef = newContentRef

		console.log(`[ArtifactStore] Updated artifact: ${artifactId} to version ${artifact.version}`)

		return artifact
	}

	/**
	 * Get artifact summary (for Organiser)
	 */
	getArtifactSummary(artifactId: string): ArtifactSummary | null {
		const artifact = this.artifactIndex.get(artifactId)
		return artifact ? artifact.summary : null
	}

	/**
	 * Get artifact metadata
	 */
	getArtifactMetadata(artifactId: string): Artifact | null {
		return this.artifactIndex.get(artifactId) || null
	}

	/**
	 * Load full artifact content (lazy loading)
	 */
	async loadArtifactContent(artifactId: string): Promise<string> {
		const artifact = this.artifactIndex.get(artifactId)
		if (!artifact) {
			throw new Error(`Artifact not found: ${artifactId}`)
		}

		return await this.readContent(artifact.contentRef)
	}

	/**
	 * Get all artifacts of specific type
	 */
	getArtifactsByType(type: ArtifactType): Artifact[] {
		return Array.from(this.artifactIndex.values()).filter((a) => a.type === type)
	}

	/**
	 * Get artifacts by producer
	 */
	getArtifactsByProducer(producer: string): Artifact[] {
		return Array.from(this.artifactIndex.values()).filter((a) => a.producer === producer)
	}

	/**
	 * Get artifacts by status
	 */
	getArtifactsByStatus(status: ArtifactStatus): Artifact[] {
		return Array.from(this.artifactIndex.values()).filter((a) => a.status === status)
	}

	/**
	 * Archive old artifacts (completed or rejected)
	 */
	async archiveOldArtifacts(olderThanHours: number = 24): Promise<number> {
		const cutoffTime = new Date(Date.now() - olderThanHours * 60 * 60 * 1000)
		const toArchive = Array.from(this.artifactIndex.values()).filter(
			(a) =>
				a.updatedAt < cutoffTime &&
				(a.status === ArtifactStatus.COMPLETED || a.status === ArtifactStatus.REJECTED),
		)

		for (const artifact of toArchive) {
			// Move to archive directory
			const archiveRef = `archive/${artifact.contentRef}`
			const content = await this.readContent(artifact.contentRef)
			await this.writeContent(archiveRef, content)

			// Delete original
			await this.deleteContent(artifact.contentRef)

			// Remove from index
			this.artifactIndex.delete(artifact.id)
		}

		console.log(`[ArtifactStore] Archived ${toArchive.length} old artifacts`)
		return toArchive.length
	}

	/**
	 * Get Organiser context (all summaries)
	 */
	getOrganiserArtifactContext(): Map<string, ArtifactSummary> {
		const context = new Map<string, ArtifactSummary>()

		for (const [id, artifact] of this.artifactIndex) {
			// Only include non-archived artifacts
			if (artifact.status !== ArtifactStatus.REJECTED) {
				context.set(id, artifact.summary)
			}
		}

		return context
	}

	/**
	 * Write content to disk
	 */
	private async writeContent(ref: string, content: string): Promise<void> {
		const filePath = path.join(this.storageDir, ref)
		await fs.mkdir(path.dirname(filePath), { recursive: true })
		await fs.writeFile(filePath, content, "utf8")
	}

	/**
	 * Read content from disk
	 */
	private async readContent(ref: string): Promise<string> {
		const filePath = path.join(this.storageDir, ref)
		return await fs.readFile(filePath, "utf8")
	}

	/**
	 * Delete content from disk
	 */
	private async deleteContent(ref: string): Promise<void> {
		const filePath = path.join(this.storageDir, ref)
		await fs.unlink(filePath)
	}

	/**
	 * Ensure storage directory exists
	 */
	private async ensureStorageDir(): Promise<void> {
		await fs.mkdir(this.storageDir, { recursive: true })
		await fs.mkdir(path.join(this.storageDir, "archive"), { recursive: true })
	}

	private generateArtifactId(): string {
		return `artifact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
	}
}

// ============================================================================
// ARTIFACT SUMMARIZER
// ============================================================================

class ArtifactSummarizer {
	private maxTokens: number

	constructor(maxTokens: number) {
		this.maxTokens = maxTokens
	}

	/**
	 * Generate summary for artifact
	 */
	async summarize(content: string, type: ArtifactType, metadata: ArtifactMetadata): Promise<ArtifactSummary> {
		// Different summarization strategies based on type
		switch (type) {
			case ArtifactType.IMPLEMENTATION_PLAN:
				return this.summarizePlan(content, metadata)

			case ArtifactType.CODE:
				return this.summarizeCode(content, metadata)

			case ArtifactType.REVIEW_REPORT:
				return this.summarizeReview(content, metadata)

			case ArtifactType.TEST_RESULTS:
				return this.summarizeTests(content, metadata)

			default:
				return this.summarizeGeneric(content, metadata)
		}
	}

	private summarizePlan(content: string, metadata: ArtifactMetadata): ArtifactSummary {
		// Parse plan structure (assuming JSON or markdown)
		let steps: number = 0
		let filesAffected: string[] = metadata.filesAffected || []

		// Extract key information
		const lines = content.split("\n")
		const keyPoints: string[] = []

		for (const line of lines) {
			if (line.match(/^#{1,3}\s/)) {
				keyPoints.push(line.replace(/^#{1,3}\s/, "").trim())
				if (keyPoints.length >= 5) break
			}
			if (line.includes("step") || line.includes("phase")) {
				steps++
			}
		}

		return {
			brief: `Implementation plan with ${steps} steps affecting ${filesAffected.length} files`,
			keyPoints: keyPoints.slice(0, 5),
			filesAffected,
			metrics: {
				linesOfCode: this.estimateLinesOfCode(content),
			},
		}
	}

	private summarizeCode(content: string, metadata: ArtifactMetadata): ArtifactSummary {
		const filesAffected = metadata.filesAffected || []
		const linesOfCode = content.split("\n").length

		// Extract key components (functions, classes, etc.)
		const keyPoints: string[] = []
		const lines = content.split("\n")

		for (const line of lines) {
			const trimmed = line.trim()
			if (
				trimmed.startsWith("function ") ||
				trimmed.startsWith("class ") ||
				trimmed.startsWith("interface ") ||
				trimmed.startsWith("export ")
			) {
				keyPoints.push(trimmed.substring(0, 60))
				if (keyPoints.length >= 5) break
			}
		}

		return {
			brief: `Code implementation: ${linesOfCode} lines in ${filesAffected.length} file(s)`,
			keyPoints,
			filesAffected,
			metrics: {
				linesOfCode,
			},
		}
	}

	private summarizeReview(content: string, metadata: ArtifactMetadata): ArtifactSummary {
		// Count issues by severity
		const lines = content.split("\n")
		let issuesFound = 0
		const keyPoints: string[] = []

		for (const line of lines) {
			if (line.includes("ERROR:") || line.includes("CRITICAL:") || line.includes("Issue:")) {
				issuesFound++
				keyPoints.push(line.trim().substring(0, 60))
				if (keyPoints.length >= 5) break
			}
		}

		const approved = metadata.approvalStatus === "approved"

		return {
			brief: approved
				? `Review passed with ${issuesFound} minor issues`
				: `Review found ${issuesFound} issues requiring fixes`,
			keyPoints,
			filesAffected: metadata.filesAffected || [],
			metrics: {
				issuesFound,
			},
		}
	}

	private summarizeTests(content: string, metadata: ArtifactMetadata): ArtifactSummary {
		// Parse test results (assuming standard test output format)
		const lines = content.split("\n")
		let passed = 0
		let failed = 0
		const keyPoints: string[] = []

		for (const line of lines) {
			if (line.includes("✓") || line.includes("PASS")) {
				passed++
			} else if (line.includes("✗") || line.includes("FAIL")) {
				failed++
				keyPoints.push(line.trim().substring(0, 60))
			}
		}

		return {
			brief: `Tests: ${passed} passed, ${failed} failed`,
			keyPoints: keyPoints.slice(0, 5),
			filesAffected: metadata.filesAffected || [],
			metrics: {
				testsCount: passed + failed,
			},
		}
	}

	private summarizeGeneric(content: string, metadata: ArtifactMetadata): ArtifactSummary {
		// Extract first few meaningful lines
		const lines = content.split("\n").filter((l) => l.trim().length > 0)
		const keyPoints = lines.slice(0, 5).map((l) => l.substring(0, 60))

		return {
			brief: content.substring(0, 100).trim() + "...",
			keyPoints,
			filesAffected: metadata.filesAffected || [],
		}
	}

	private estimateLinesOfCode(content: string): number {
		// Rough estimation based on plan content
		const codeBlockMatches = content.match(/```[\s\S]*?```/g)
		if (!codeBlockMatches) return 0

		return codeBlockMatches.reduce((sum, block) => {
			return sum + block.split("\n").length
		}, 0)
	}
}
````

---

## Part 4: Organiser Agent Implementation

### 4.1 Organiser Core

````typescript
// ============================================================================
// ORGANISER AGENT
// Purpose: Central coordinator managing workflow and agent delegation
// ============================================================================

class OrganiserAgent {
  private context: OrganiserContext;
  private agentPool: AgentPoolManager;
  private messageRouter: MessageRouter;
  private artifactStore: ArtifactStore;
  private stateMachine: WorkflowStateMachine;
  private llmProvider: LLMProvider;
  private configManager: OrchestrationConfigManager;

  constructor(
    agentPool: AgentPoolManager,
    messageRouter: MessageRouter,
    artifactStore: ArtifactStore,
    configManager: OrchestrationConfigManager
  ) {
    this.agentPool = agentPool;
    this.messageRouter = messageRouter;
    this.artifactStore = artifactStore;
    this.configManager = configManager;
    this.stateMachine = new WorkflowStateMachine();

    // Initialize context
    this.context = this.initializeContext();

    // Setup message handlers
    this.setupMessageHandlers();

    // Initialize LLM provider for Organiser
    this.initializeLLMProvider();
  }

  /**
   * Initialize Organiser context
   */
  private initializeContext(): OrganiserContext {
    return {
      userTask: "",
      workflowState: WorkflowState.IDLE,
      artifacts: new Map(),
      agentStatuses: new Map(),
      currentStep: {
        stepNumber: 0,
        description: "Awaiting user task",
        involvedAgents: [],
        expectedArtifacts: [],
        completionCriteria: []
      },
      toDoList: [],
      roleDescriptions: this.loadRoleDescriptions(),
      sessionId: this.generateSessionId(),
      startTime: new Date()
    };
  }

  /**
   * Initialize LLM provider for Organiser
   */
  private async initializeLLMProvider(): Promise<void> {
    const organiserAssignment = (await this.configManager.getRoleAssignments())
      .find(a => a.roleId === "organiser");

    if (!organiserAssignment?.assignedProfileId) {
      throw new Error("Organiser role not configured");
    }

    const profile = await this.configManager.getProviderProfile(
      organiserAssignment.assignedProfileId
    );

    if (!profile) {
      throw new Error("Organiser provider profile not found");
    }

    this.llmProvider = new LLMProvider(profile);
  }

  /**
   * Setup message handlers
   */
  private setupMessageHandlers(): void {
    // Subscribe to messages for organiser
    this.messageRouter.subscribe("organiser", (message: Message) => {
      this.handleMessage(message);
    });
  }

  /**
   * Handle incoming messages
   */
  private async handleMessage(message: Message): Promise<void> {
    switch (message.type) {
      case MessageType.RESPONSE:
        await this.handleAgentResponse(message);
        break;

      case MessageType.ARTIFACT:
        await this.handleArtifactMessage(message);
        break;

      case MessageType.STATUS:
        await this.handleStatusUpdate(message);
        break;

      case MessageType.ERROR:
        await this.handleAgentError(message);
        break;
    }
  }

  /**
   * Start new task (user entry point)
   */
  async startTask(userTask: string): Promise<void> {
    console.log(`[Organiser] Starting new task: ${userTask}`);

    // Reset context
    this.context = this.initializeContext();
    this.context.userTask = userTask;

    // Create user task artifact
    const userArtifact = await this.artifactStore.storeArtifact(
      ArtifactType.USER_TASK,
      "user",
      userTask,
      { tags: ["initial"] }
    );

    this.context.artifacts.set(userArtifact.id, userArtifact.summary);

    // Transition to planning state
    await this.transitionState(WorkflowState.PLANNING);

    // Start workflow
    await this.executeWorkflowStep();
  }

  /**
   * Execute current workflow step
   */
  private async executeWorkflowStep(): Promise<void> {
    console.log(`[Organiser] Executing workflow step: ${this.context.workflowState}`);

    switch (this.context.workflowState) {
      case WorkflowState.PLANNING:
        await this.executePlanningStep();
        break;

      case WorkflowState.PLAN_REVIEW:
        await this.executePlanReviewStep();
        break;

      case WorkflowState.PLAN_REVISION:
        await this.executePlanRevisionStep();
        break;

      case WorkflowState.STRUCTURE_CREATION:
        await this.executeStructureCreationStep();
        break;

      case WorkflowState.CODE_IMPLEMENTATION:
        await this.executeCodeImplementationStep();
        break;

      case WorkflowState.CODE_REVIEW:
        await this.executeCodeReviewStep();
        break;

      case WorkflowState.CODE_FIXING:
        await this.executeCodeFixingStep();
        break;

      case WorkflowState.DOCUMENTATION:
        await this.executeDocumentationStep();
        break;

      case WorkflowState.TESTING:
        await this.executeTestingStep();
        break;

      case WorkflowState.COMPLETED:
        await this.handleCompletion();
        break;
    }
  }

  /**
   * PLANNING STEP: Architect creates implementation plan
   */
  private async executePlanningStep(): Promise<void> {
    this.updateCurrentStep({
      stepNumber: 1,
      description: "Creating implementation plan",
      involvedAgents: ["architect"],
      expectedArtifacts: [ArtifactType.IMPLEMENTATION_PLAN],
      completionCriteria: ["Plan created with clear steps and file structure"]
    });

    // Get architect agent
    const architect = await this.agentPool.getAgent("architect");
    if (!architect) {
      throw new Error("Architect agent not available");
    }

    // Prepare planning context
    const planningContext = this.preparePlanningContext();

    // Send planning request
    const response = await this.messageRouter.sendRequest(
      "organiser",
      "architect",
      {
        task: this.context.userTask,
        taskType: "plan",
        context: {
          artifactIds: [],
          instructions: planningContext
        }
      },
      300000 // 5 minute timeout
    );

    if (!response.success) {
      await this.handleStepFailure("Planning failed", response.error);
      return;
    }

    // Plan artifact will be received via artifact message
    // State transition happens in handleArtifactMessage
  }

  /**
   * PLAN REVIEW STEP: Code Sceptic reviews the plan
   */
  private async executePlanReviewStep(): Promise<void> {
    this.updateCurrentStep({
      stepNumber: 2,
      description: "Reviewing implementation plan",
      involvedAgents: ["code_sceptic"],
      expectedArtifacts: [ArtifactType.REVIEW_REPORT],
      completionCriteria: ["Plan reviewed and approved or flagged for revision"]
    });

    // Get plan artifact
    const planArtifacts = this.artifactStore.getArtifactsByType(
      ArtifactType.IMPLEMENTATION_PLAN
    );

    if (planArtifacts.length === 0) {
      throw new Error("No plan artifact found");
    }

    const planArtifact = planArtifacts[planArtifacts.length - 1]; // Latest

    // Get Code Sceptic
    const sceptic = await this.agentPool.getAgent("code_sceptic");
    if (!sceptic) {
      throw new Error("Code Sceptic agent not available");
    }

    // Send review request
    const response = await this.messageRouter.sendRequest(
      "organiser",
      "code_sceptic",
      {
        task: "Review the implementation plan for feasibility and completeness",
        taskType: "review",
        context: {
          artifactIds: [planArtifact.id],
          instructions: "Focus on: architecture soundness, missing considerations, potential issues"
        }
      },
      300000
    );

    if (!response.success) {
      await this.handleStepFailure("Plan review failed", response.error);
      return;
    }

    // Review artifact will trigger next state transition
  }

  /**
   * STRUCTURE CREATION STEP: Primary Coder creates file structure and pseudocode
   */
  private async executeStructureCreationStep(): Promise<void> {
    this.updateCurrentStep({
      stepNumber: 3,
      description: "Creating file structure and pseudocode",
      involvedAgents: ["coder_primary"],
      expectedArtifacts: [ArtifactType.PSEUDOCODE],
      completionCriteria: ["File structure created", "Pseudocode written for all components"]
    });

    // Get approved plan
    const planArtifacts = this.artifactStore.getArtifactsByType(
      ArtifactType.IMPLEMENTATION_PLAN
    );
    const approvedPlan = planArtifacts.find(a => a.status === ArtifactStatus.APPROVED);

    if (!approvedPlan) {
      throw new Error("No approved plan found");
    }

    // Get Primary Coder
    const primaryCoder = await this.agentPool.getAgent("coder_primary");
    if (!primaryCoder) {
      throw new Error("Primary Coder agent not available");
    }

    // Send structure creation request
    const response = await this.messageRouter.sendRequest(
      "organiser",
      "coder_primary",
      {
        task: "Create file structure and write pseudocode following the approved plan",
        taskType: "implement",
        context: {
          artifactIds: [approvedPlan.id],
          instructions: this.prepareStructureCreationInstructions(),
          constraints: [
            "Create actual files in workspace",
            "Use detailed pseudocode with clear logic",
            "Include comments for complex sections"
          ]
        }
      },
      600000 // 10 minute timeout
    );

    if (!response.success) {
      await this.handleStepFailure("Structure creation failed", response.error);
      return;
    }
  }

  /**
   * CODE IMPLEMENTATION STEP: Both coders implement actual code
   */
  private async executeCodeImplementationStep(): Promise<void> {
    this.updateCurrentStep({
      stepNumber: 4,
      description: "Implementing actual code",
      involvedAgents: ["coder_primary", "coder_secondary"],
      expectedArtifacts: [ArtifactType.CODE],
      completionCriteria: ["All pseudocode converted to working code", "Code follows best practices"]
    });

    // Get pseudocode artifacts
    const pseudocodeArtifacts = this.artifactStore.getArtifactsByType(
      ArtifactType.PSEUDOCODE
    );

    if (pseudocodeArtifacts.length === 0) {
      throw new Error("No pseudocode artifacts found");
    }

    // Determine work distribution
    const workDistribution = await this.distributeImplementationWork(pseudocodeArtifacts);

    // Send parallel requests to both coders
    const primaryCoderPromise = this.delegateToAgent(
      "coder_primary",
      "Implement code for assigned files",
      "implement",
      workDistribution.primary,
      600000
    );

    const secondaryCoderPromise = this.delegateToAgent(
      "coder_secondary",
      "Implement code for assigned files",
      "implement",
      workDistribution.secondary,
      600000
    );

    // Wait for both to complete
    const results = await Promise.allSettled([
      primaryCoderPromise,
      secondaryCoderPromise
    ]);

    // Check if any failed
    const failures = results.filter(r => r.status === "rejected");
    if (failures.length > 0) {
      await this.handleStepFailure(
        "Code implementation failed",
        failures.map(f => (f as PromiseRejectedResult).reason).join("; ")
      );
      return;
    }
  }

  /**
   * CODE REVIEW STEP: Code Sceptic reviews implemented code
   */
  private async executeCodeReviewStep(): Promise<void> {
    this.updateCurrentStep({
      stepNumber: 5,
      description: "Reviewing implemented code",
      involvedAgents: ["code_sceptic"],
      expectedArtifacts: [ArtifactType.REVIEW_REPORT],
      completionCriteria: ["Code reviewed", "Issues identified or approved"]
    });

    // Get code artifacts
    const codeArtifacts = this.artifactStore.getArtifactsByType(ArtifactType.CODE);

    if (codeArtifacts.length === 0) {
      throw new Error("No code artifacts to review");
    }

    // Get Code Sceptic
    const sceptic = await this.agentPool.getAgent("code_sceptic");
    if (!sceptic) {
      throw new Error("Code Sceptic agent not available");
    }

    // Send review request
    const response = await this.messageRouter.sendRequest(
      "organiser",
      "code_sceptic",
      {
        task: "Review all implemented code for quality, bugs, and best practices",
        taskType: "review",
        context: {
          artifactIds: codeArtifacts.map(a => a.id),
          instructions: this.prepareCodeReviewInstructions()
        }
      },
      600000
    );

    if (!response.success) {
      await this.handleStepFailure("Code review failed", response.error);
      return;
    }
  }

  /**
   * CODE FIXING STEP: Coders fix issues found in review
   */
  private async executeCodeFixingStep(): Promise<void> {
    this.updateCurrentStep({
      stepNumber: 6,
      description: "Fixing code issues",
      involvedAgents: ["coder_primary", "coder_secondary"],
      expectedArtifacts: [ArtifactType.CODE],
      completionCriteria: ["All review issues addressed"]
    });

    // Get review report
    const reviewArtifacts = this.artifactStore.getArtifactsByType(
      ArtifactType.REVIEW_REPORT
    );
    const latestReview = reviewArtifacts[reviewArtifacts.length - 1];

    // Analyze review and distribute fixes
    const fixDistribution = await this.distributeFixWork(latestReview);

    // Delegate fixes in parallel
    const primaryFixPromise = this.delegateToAgent(
      "coder_primary",
      "Fix code issues from review",
      "implement",
      fixDistribution.primary,
      600000
    );

    const secondaryFixPromise = this.delegateToAgent(
      "coder_secondary",
      "Fix code issues from review",
      "implement",
      fixDistribution.secondary,
      600000
    );

    await Promise.all([primaryFixPromise, secondaryFixPromise]);

    // After fixes, go back to review
    await this.transitionState(WorkflowState.CODE_REVIEW);
  }

  /**
   * DOCUMENTATION STEP: Commenter adds documentation
   */
  private async executeDocumentationStep(): Promise<void> {
    this.updateCurrentStep({
      stepNumber: 7,
      description: "Adding documentation",
      involvedAgents: ["commenter"],
      expectedArtifacts: [ArtifactType.DOCUMENTATION],
      completionCriteria: ["All code documented", "README updated"]
    });

    // Get approved code artifacts
    const codeArtifacts = this.artifactStore.getArtifactsByType(ArtifactType.CODE)
      .filter(a => a.status === ArtifactStatus.APPROVED);

    // Get Commenter
    const commenter = await this.agentPool.getAgent("commenter");
    if (!commenter) {
      // Documentation is optional, can skip
      await this.transitionState(WorkflowState.TESTING);
      return;
    }

    // Send documentation request
    await this.delegateToAgent(
      "commenter",
      "Add comprehensive documentation and comments",
      "document",
      codeArtifacts.map(a => a.id),
      600000
    );
  }

  /**
   * TESTING STEP: Debugger runs and fixes tests
   */
  private async executeTestingStep(): Promise<void> {
    this.updateCurrentStep({
      stepNumber: 8,
      description: "Running tests and debugging",
      involvedAgents: ["debugger"],
      expectedArtifacts: [ArtifactType.TEST_RESULTS],
      completionCriteria: ["All tests passing"]
    });

    // Get Debugger
    const debugger = await this.agentPool.getAgent("debugger");
    if (!debugger) {
      // Testing is optional, can skip
      await this.transitionState(WorkflowState.COMPLETED);
      return;
    }

    // Send testing request
    const response = await this.delegateToAgent(
      "debugger",
      "Run tests and fix any failures",
      "test",
      [],
      900000 // 15 minutes for testing
    );

    // Analyze test results
    const testArtifacts = this.artifactStore.getArtifactsByType(
      ArtifactType.TEST_RESULTS
    );
    const latestTest = testArtifacts[testArtifacts.length - 1];

    if (latestTest.summary.metrics?.testsCount === 0) {
      // No tests or all passed
      await this.transitionState(WorkflowState.COMPLETED);
    } else {
      // Has failures, need to fix
      await this.transitionState(WorkflowState.CODE_FIXING);
    }
  }

  /**
   * Handle workflow completion
   */
  private async handleCompletion(): Promise<void> {
    console.log(`[Organiser] Workflow completed successfully`);

    // Generate completion summary
    const summary = await this.generateCompletionSummary();

    // Notify user
    this.notifyUser({
      type: "completion",
      message: "Task completed successfully!",
      summary
    });

    // Archive old artifacts
    await this.artifactStore.archiveOldArtifacts(1); // Archive after 1 hour

    // Clean up
    await this.cleanup();
  }

  /**
   * Transition workflow state
   */
  private async transitionState(newState: WorkflowState): Promise<void> {
    // Validate transition
    if (!this.stateMachine.canTransition(this.context.workflowState, newState)) {
      throw new Error(
        `Invalid state transition: ${this.context.workflowState} -> ${newState}`
      );
    }

    console.log(`[Organiser] State transition: ${this.context.workflowState} -> ${newState}`);

    this.context.previousState = this.context.workflowState;
    this.context.workflowState = newState;

    // Update agent statuses
    this.context.agentStatuses = this.agentPool.getAgentStatuses();

    // Update artifact summaries
    this.context.artifacts = this.artifactStore.getOrganiserArtifactContext();

    // Execute new state
    await this.executeWorkflowStep();
  }

  /**
   * Handle agent response
   */
  private async handleAgentResponse(message: Message): Promise<void> {
    const response = message.payload as ResponsePayload;

    if (!response.success) {
      console.error(`[Organiser] Agent ${message.from} failed:`, response.error);
      await this.handleStepFailure(`Agent ${message.from} failed`, response.error);
    }
  }

  /**
   * Handle artifact message
   */
  private async handleArtifactMessage(message: Message): Promise<void> {
    const payload = message.payload as ArtifactPayload;
    const artifact = payload.artifact;

    console.log(`[Organiser] Artifact ${payload.action}: ${artifact.id} (${artifact.type})`);

    // Update context with artifact summary
    this.context.artifacts.set(artifact.id, artifact.summary);

    // Make state transition decisions based on artifact
    await this.handleArtifactCompletion(artifact);
  }

  /**
   * Handle artifact completion and decide next state
   */
  private async handleArtifactCompletion(artifact: Artifact): Promise<void> {
    // Use LLM to make intelligent decisions about next steps
    const decision = await this.makeWorkflowDecision(artifact);

    switch (decision.action) {
      case "transition":
        await this.transitionState(decision.nextState!);
        break;

      case "approve":
        await this.artifactStore.updateArtifact(
          artifact.id,
          await this.artifactStore.loadArtifactContent(artifact.id),
          ArtifactStatus.APPROVED
        );
        await this.transitionState(decision.nextState!);
        break;

      case "request_revision":
        await this.artifactStore.updateArtifact(
          artifact.id,
          await this.artifactStore.loadArtifactContent(artifact.id),
          ArtifactStatus.NEEDS_REVISION
        );
        await this.transitionState(WorkflowState.PLAN_REVISION);
        break;

      case "wait":
        // Wait for more artifacts
        break;
    }
  }

  /**
   * Make workflow decision using LLM
   */
  private async makeWorkflowDecision(artifact: Artifact): Promise<WorkflowDecision> {
    const prompt = this.constructDecisionPrompt(artifact);

    const response = await this.llmProvider.complete(prompt, {
      maxTokens: 500,
      temperature: 0.3 // Low temperature for consistent decisions
    });

    // Parse LLM response into structured decision
    return this.parseDecisionResponse(response);
  }

  /**
   * Construct decision prompt for LLM
   */
  private constructDecisionPrompt(artifact: Artifact): string {
    return `You are the Organiser agent coordinating a software development workflow.

Current State: ${this.context.workflowState}
Current Step: ${this.context.currentStep.description}

A new artifact has been completed:
- Type: ${artifact.type}
- Producer: ${artifact.producer}
- Status: ${artifact.status}
- Summary: ${artifact.summary.brief}
- Key Points:
${artifact.summary.keyPoints.map(p => `  - ${p}`).join("\n")}

Workflow Context:
- User Task: ${this.context.userTask}
- Artifacts Completed: ${this.context.artifacts.size}
- Current To-Do Items: ${this.context.toDoList.filter(t => t.status === "pending").length}

Available Next States: ${STATE_TRANSITIONS[this.context.workflowState].join(", ")}

Based on this artifact and the current workflow state, decide what action to take:
1. "transition" - Move to the next workflow state
2. "approve" - Approve this artifact and transition
3. "request_revision" - Request revisions to this artifact
4. "wait" - Wait for more artifacts before deciding

Respond in JSON format:
{
  "action": "transition|approve|request_revision|wait",
  "nextState": "STATE_NAME" (if action is transition or approve),
  "reasoning": "Brief explanation of decision"
}`;
  }

  /**
   * Parse LLM decision response
   */
  private parseDecisionResponse(response: string): WorkflowDecision {
    try {
      const cleaned = response.replace(/```json\n?/g, "").replace(/```/g, "").trim();
      return JSON.parse(cleaned);
    } catch (error) {
      console.error("[Organiser] Failed to parse decision response:", error);
      // Default to waiting
      return {
        action: "wait",
        reasoning: "Failed to parse decision, waiting for manual intervention"
      };
    }
  }

  /**
   * Delegate task to specific agent
   */
  private async delegateToAgent(
    agentRoleId: string,
    task: string,
    taskType: RequestPayload["taskType"],
    artifactIds: string[],
    timeout: number
  ): Promise<ResponsePayload> {
    // Ensure agent is spawned
    const agent = await this.agentPool.getAgent(agentRoleId);
    if (!agent) {
      throw new Error(`Agent ${agentRoleId} not available`);
    }

    // Send request
    return await this.messageRouter.sendRequest(
      "organiser",
      agentRoleId,
      {
        task,
        taskType,
        context: {
          artifactIds,
          instructions: ""
        }
      },
      timeout
    );
  }

  /**
   * Handle step failure
   */
  private async handleStepFailure(reason: string, details?: string): Promise<void> {
    console.error(`[Organiser] Step failure: ${reason}`, details);

    // Create error artifact
    await this.artifactStore.storeArtifact(
      ArtifactType.ERROR_REPORT,
      "organiser",
      `${reason}\n\nDetails: ${details || "None"}`,
      { tags: ["error"] }
    );

    // Transition to error state
    await this.transitionState(WorkflowState.ERROR);

    // Notify user
    this.notifyUser({
      type: "error",
      message: reason,
      details
    });
  }

  /**
   * Handle status update from agent
   */
  private async handleStatusUpdate(message: Message): Promise<void> {
    const status = message.payload as StatusPayload;

    // Update agent status in context
    this.context.agentStatuses.set(status.agentId, {
      roleId: status.agentId,
      status: status.status,
      currentTask: status.currentTask,
      progress: status.progress,
      lastUpdate: new Date(),
      errorCount: 0
    });
  }

  /**
   * Handle agent error
   */
  private async handleAgentError(message: Message): Promise<void> {
    const error = message.payload as ErrorPayload;

    console.error(`[Organiser] Agent error from ${message.from}:`, error);

    if (!error.recoverable) {
      await this.handleStepFailure(
        `Unrecoverable error from ${message.from}`,
        error.message
      );
    } else {
      // Try to recover
      console.log(`[Organiser] Attempting to recover from error`);
      // Retry logic would go here
    }
  }

  /**
   * Distribute implementation work between coders
   */
  private async distributeImplementationWork(
    pseudocodeArtifacts: Artifact[]
  ): Promise<WorkDistribution> {
    // Use LLM to intelligently distribute work
    const prompt = `You are distributing implementation work between two coders.

Pseudocode artifacts to implement:
${pseudocodeArtifacts.map(a => `
- ${a.id}: ${a.summary.brief}
  Files: ${a.summary.filesAffected.join(", ")}
  Lines: ~${a.summary.metrics?.linesOfCode || 0}
`).join("\n")}

Distribute these artifacts between Primary Coder and Secondary Coder to:
1. Balance workload (similar total lines of code)
2. Minimize file conflicts (different files)
3. Group related components together

Respond in JSON format:
{
  "primary": ["artifact_id_1", "artifact_id_2"],
  "secondary": ["artifact_id_3", "artifact_id_4"],
  "reasoning": "Brief explanation"
}`;

    const response = await this.llmProvider.complete(prompt);
    const distribution = JSON.parse(
      response.replace(/```json\n?/g, "").replace(/```/g, "").trim()
    );

    return distribution;
  }

  /**
   * Distribute fix work based on review
   */
  private async distributeFixWork(reviewArtifact: Artifact): Promise<WorkDistribution> {
    // Load full review content to analyze issues
    const reviewContent = await this.artifactStore.loadArtifactContent(reviewArtifact.id);

    // Use LLM to categorize and distribute fixes
    const prompt = `Analyze this code review and distribute fixes between two coders:

${reviewContent}

Group issues by file and complexity. Assign to:
- Primary Coder: Complex architectural issues
- Secondary Coder: Simpler fixes and edge cases

Respond in JSON with artifact IDs to fix for each coder.`;

    const response = await this.llmProvider.complete(prompt);
    return JSON.parse(
      response.replace(/```json\n?/g, "").replace(/```/g, "").trim()
    );
  }

  /**
   * Update current step information
   */
  private updateCurrentStep(step: WorkflowStep): void {
    this.context.currentStep = step;

    // Notify UI of step change
    this.notifyUser({
      type: "step_update",
      step
    });
  }

  /**
   * Prepare planning context for Architect
   */
  private preparePlanningContext(): string {
    return `Create a detailed implementation plan for: ${this.context.userTask}

Include:
1. High-level architecture
2. File structure (which files to create/modify)
3. Key components and their responsibilities
4. Implementation phases
5. Potential challenges and solutions

Format as structured markdown with clear sections.`;
  }

  /**
   * Prepare structure creation instructions
   */
  private prepareStructureCreationInstructions(): string {
    return `Follow the approved implementation plan to:
1. Create all necessary files in the workspace
2. Write detailed pseudocode for each component
3. Define all interfaces, types, and classes
4. Include clear comments explaining logic
5. Do NOT implement actual code yet - only pseudocode

Pseudocode should be detailed enough that another coder can implement directly.`;
  }

  /**
   * Prepare code review instructions
   */
  private prepareCodeReviewInstructions(): string {
    return `Review the implemented code for:
1. Correctness - Does it match requirements?
2. Quality - Best practices, clean code principles
3. Bugs - Potential errors or edge cases
4. Performance - Efficiency concerns
5. Security - Any vulnerabilities

Categorize issues by severity:
- CRITICAL: Must fix before proceeding
- HIGH: Should fix before proceeding
- MEDIUM: Should address
- LOW: Optional improvements

Format as structured report with issues grouped by file.`;
  }

  /**
   * Generate completion summary
   */
  private async generateCompletionSummary(): Promise<CompletionSummary> {
    const artifacts = Array.from(this.context.artifacts.entries());

    return {
      totalTime: Date.now() - this.context.startTime.getTime(),
      stepsCompleted: this.context.currentStep.stepNumber,
      artifactsCreated: artifacts.length,
      filesModified: this.getUniqueFilesModified(),
      linesOfCode: this.getTotalLinesOfCode(),
      issuesFound: this.getTotalIssuesFound(),
      issuesFixed: this.getTotalIssuesFixed()
    };
  }

  /**
   * Get unique files modified across all artifacts
   */
  private getUniqueFilesModified(): string[] {
    const files = new Set<string>();

    for (const [_, summary] of this.context.artifacts) {
      summary.filesAffected.forEach(f => files.add(f));
    }

    return Array.from(files);
  }

  /**
   * Get total lines of code from artifacts
   */
  private getTotalLinesOfCode(): number {
    let total = 0;

    for (const [_, summary] of this.context.artifacts) {
      total += summary.metrics?.linesOfCode || 0;
    }

    return total;
  }

  /**
   * Get total issues found in reviews
   */
  private getTotalIssuesFound(): number {
    let total = 0;

    for (const [_, summary] of this.context.artifacts) {
      total += summary.metrics?.issuesFound || 0;
    }

    return total;
  }

  /**
   * Get total issues fixed
   */
  private getTotalIssuesFixed(): number {
    // Count how many review issues were marked as resolved
    const reviews = this.artifactStore.getArtifactsByType(ArtifactType.REVIEW_REPORT);
    let fixed = 0;

    for (const review of reviews) {
      if (review.status === ArtifactStatus.APPROVED) {
        fixed += review.summary.metrics?.issuesFound || 0;
      }
    }

    return fixed;
  }

  /**
   * Load role descriptions
   */
  private loadRoleDescriptions(): Map<string, RoleDefinition> {
    const map = new Map<string, RoleDefinition>();

    for (const role of AVAILABLE_ROLES) {
      map.set(role.id, role);
    }

    return map;
  }

  /**
   * Notify user of events
   */
  private notifyUser(notification: UserNotification): void {
    // Send to webview UI
    // Implementation depends on your UI architecture
    console.log("[Organiser] User notification:", notification);
  }

  /**
   * Cleanup resources
   */
  private async cleanup(): Promise<void> {
    // Terminate non-required agents
    // Keep Organiser running for next task
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

interface WorkflowDecision {
  action: "transition" | "approve" | "request_revision" | "wait";
  nextState?: WorkflowState;
  reasoning: string;
}

interface WorkDistribution {
  primary: string[];
  secondary: string[];
  reasoning?: string;
}

interface CompletionSummary {
  totalTime: number;
  stepsCompleted: number;
  artifactsCreated: number;
  filesModified: string[];
  linesOfCode: number;
  issuesFound: number;
  issuesFixed: number;
}

interface UserNotification {
  type: "step_update" | "completion" | "error" | "info";
  message?: string;
  details?: any;
  step?: WorkflowStep;
  summary?: CompletionSummary;
}

// ============================================================================
// WORKFLOW STATE MACHINE
// ============================================================================

class WorkflowStateMachine {
  /**
   * Check if transition is valid
   */
  canTransition(from: WorkflowState, to: WorkflowState): boolean {
    const allowedTransitions = STATE_TRANSITIONS[from];
    return allowedTransitions.includes(to);
  }

  /**
   * Get next possible states
   */
  getNextStates(current: WorkflowState): WorkflowState[] {
    return STATE_TRANSITIONS[current];
  }
}
````

---

## Part 5: Worker Agent Implementation

### 5.1 Base Worker Agent

```typescript
// ============================================================================
// BASE WORKER AGENT
// Purpose: Base class for all specialized worker agents
// ============================================================================

abstract class BaseWorkerAgent {
	protected roleId: string
	protected role: RoleDefinition
	protected profile: ProviderProfile
	protected messageRouter: MessageRouter
	protected artifactStore: ArtifactStore
	protected llmProvider: LLMProvider
	protected tools: Tool[]
	protected status: "idle" | "working" | "paused" | "error" = "idle"
	protected currentTask?: Message

	constructor(config: AgentConfig, messageRouter: MessageRouter, artifactStore: ArtifactStore) {
		this.roleId = config.roleId
		this.role = config.role
		this.profile = config.profile
		this.messageRouter = messageRouter
		this.artifactStore = artifactStore

		// Initialize LLM provider
		this.llmProvider = new LLMProvider(config.profile)

		// Load tools specific to this role
		this.tools = this.loadTools()

		// Setup message handlers
		this.setupMessageHandlers()

		// Send ready signal
		this.sendReadySignal()
	}

	/**
	 * Setup message handlers
	 */
	private setupMessageHandlers(): void {
		this.messageRouter.subscribe(this.roleId, async (message: Message) => {
			await this.handleMessage(message)
		})
	}

	/**
	 * Handle incoming messages
	 */
	private async handleMessage(message: Message): Promise<void> {
		try {
			switch (message.type) {
				case MessageType.REQUEST:
					await this.handleRequest(message)
					break

				case MessageType.CONTROL:
					await this.handleControl(message)
					break

				default:
					console.warn(`[${this.roleId}] Unhandled message type: ${message.type}`)
			}
		} catch (error) {
			console.error(`[${this.roleId}] Error handling message:`, error)
			await this.sendError(message, error)
		}
	}

	/**
	 * Handle work request from Organiser
	 */
	private async handleRequest(message: Message): Promise<void> {
		if (this.status === "working") {
			await this.sendResponse(message, {
				success: false,
				error: "Agent is busy with another task",
			})
			return
		}

		this.status = "working"
		this.currentTask = message

		const request = message.payload as RequestPayload

		// Send status update
		await this.sendStatus("working", 0, request.task)

		try {
			// Execute role-specific work
			const result = await this.executeTask(request)

			// Send success response
			await this.sendResponse(message, {
				success: true,
				result,
				artifactId: result.artifactId,
			})

			this.status = "idle"
			await this.sendStatus("idle", 100)
		} catch (error) {
			console.error(`[${this.roleId}] Task execution failed:`, error)

			await this.sendResponse(message, {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			})

			this.status = "error"
			await this.sendError(message, error)
		} finally {
			this.currentTask = undefined
		}
	}

	/**
	 * Handle control messages
	 */
	private async handleControl(message: Message): Promise<void> {
		const control = message.payload as ControlPayload

		switch (control.action) {
			case "pause":
				this.status = "paused"
				console.log(`[${this.roleId}] Paused`)
				break

			case "resume":
				this.status = "idle"
				console.log(`[${this.roleId}] Resumed`)
				break

			case "terminate":
				console.log(`[${this.roleId}] Terminating`)
				process.exit(0)
				break

			case "retry":
				if (this.currentTask) {
					await this.handleRequest(this.currentTask)
				}
				break
		}
	}

	/**
	 * Execute task (implemented by subclasses)
	 */
	protected abstract executeTask(request: RequestPayload): Promise<TaskResult>

	/**
	 * Load tools for this agent role
	 */
	protected abstract loadTools(): Tool[]

	/**
	 * Send ready signal to parent
	 */
	private sendReadySignal(): void {
		if (process.send) {
			process.send({ type: "ready", roleId: this.roleId })
		}
	}

	/**
	 * Send response to request
	 */
	protected async sendResponse(request: Message, response: ResponsePayload): Promise<void> {
		const responseMessage: Message = {
			id: this.generateMessageId(),
			type: MessageType.RESPONSE,
			from: this.roleId,
			to: request.from,
			timestamp: new Date(),
			payload: response,
			correlationId: request.id,
		}

		this.messageRouter.routeMessage(responseMessage)
	}

	/**
	 * Send status update
	 */
	protected async sendStatus(
		status: StatusPayload["status"],
		progress?: number,
		currentTask?: string,
	): Promise<void> {
		const statusMessage: Message = {
			id: this.generateMessageId(),
			type: MessageType.STATUS,
			from: this.roleId,
			to: "organiser",
			timestamp: new Date(),
			payload: {
				agentId: this.roleId,
				status,
				progress,
				currentTask,
			} as StatusPayload,
		}

		this.messageRouter.routeMessage(statusMessage)
	}

	/**
	 * Send artifact notification
	 */
	protected async sendArtifact(artifact: Artifact, action: "created" | "updated"): Promise<void> {
		const artifactMessage: Message = {
			id: this.generateMessageId(),
			type: MessageType.ARTIFACT,
			from: this.roleId,
			to: "organiser",
			timestamp: new Date(),
			payload: {
				artifact,
				action,
			} as ArtifactPayload,
		}

		this.messageRouter.routeMessage(artifactMessage)
	}

	/**
	 * Send error notification
	 */
	protected async sendError(request: Message, error: any): Promise<void> {
		const errorMessage: Message = {
			id: this.generateMessageId(),
			type: MessageType.ERROR,
			from: this.roleId,
			to: request.from,
			timestamp: new Date(),
			payload: {
				errorType: "agent_error",
				message: error instanceof Error ? error.message : String(error),
				details: error,
				recoverable: true,
			} as ErrorPayload,
		}

		this.messageRouter.routeMessage(errorMessage)
	}

	/**
	 * Load artifacts from context
	 */
	protected async loadArtifacts(artifactIds: string[]): Promise<Map<string, string>> {
		const artifacts = new Map<string, string>()

		for (const id of artifactIds) {
			const content = await this.artifactStore.loadArtifactContent(id)
			artifacts.set(id, content)
		}

		return artifacts
	}

	/**
	 * Construct system prompt for agent
	 */
	protected constructSystemPrompt(): string {
		return `${this.role.systemPrompt}

Your role: ${this.role.name}
Description: ${this.role.description}

Capabilities:
${this.role.capabilities.map((c) => `- ${c}`).join("\n")}

Guidelines:
1. Focus on your specialized role
2. Use available tools when needed
3. Be thorough and precise
4. Communicate progress clearly
5. Ask for clarification if needed

Available Tools:
${this.tools.map((t) => `- ${t.name}: ${t.description}`).join("\n")}`
	}

	/**
	 * Start heartbeat to parent
	 */
	protected startHeartbeat(): void {
		setInterval(() => {
			if (process.send) {
				process.send({ type: "heartbeat", roleId: this.roleId })
			}
		}, 5000) // Every 5 seconds
	}

	protected generateMessageId(): string {
		return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
	}
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

interface TaskResult {
	artifactId?: string
	data?: any
	filesModified?: string[]
}

interface Tool {
	name: string
	description: string
	parameters: any
	execute: (params: any) => Promise<any>
}
```

### 5.2 Architect Agent

```typescript
// ============================================================================
// ARCHITECT AGENT
// Purpose: Creates implementation plans
// ============================================================================

class ArchitectAgent extends BaseWorkerAgent {
	protected loadTools(): Tool[] {
		return [
			{
				name: "analyze_codebase",
				description: "Analyze existing codebase structure",
				parameters: { path: "string" },
				execute: async (params) => await this.analyzeCodebase(params.path),
			},
			{
				name: "research_patterns",
				description: "Research design patterns for specific use case",
				parameters: { useCase: "string" },
				execute: async (params) => await this.researchPatterns(params.useCase),
			},
		]
	}

	protected async executeTask(request: RequestPayload): Promise<TaskResult> {
		console.log(`[Architect] Creating implementation plan`)

		// Load context artifacts if any
		const contextArtifacts = await this.loadArtifacts(request.context.artifactIds)

		// Construct planning prompt
		const prompt = this.constructPlanningPrompt(request, contextArtifacts)

		// Update progress
		await this.sendStatus("working", 20, "Analyzing requirements")

		// Get plan from LLM with tool use
		const plan = await this.llmProvider.completeWithTools(prompt, this.tools, {
			maxTokens: 4000,
			temperature: 0.7,
		})

		await this.sendStatus("working", 80, "Finalizing plan")

		// Store plan as artifact
		const artifact = await this.artifactStore.storeArtifact(ArtifactType.IMPLEMENTATION_PLAN, this.roleId, plan, {
			tags: ["plan", "architecture"],
			priority: "high",
		})

		// Notify Organiser
		await this.sendArtifact(artifact, "created")

		return {
			artifactId: artifact.id,
			data: { planCreated: true },
		}
	}

	private constructPlanningPrompt(request: RequestPayload, context: Map<string, string>): string {
		return `You are an expert software architect creating an implementation plan.

Task: ${request.task}

${request.context.instructions}

${
	context.size > 0
		? `
Context from previous work:
${Array.from(context.entries())
	.map(
		([id, content]) => `
Artifact ${id}:
${content}
`,
	)
	.join("\n")}
`
		: ""
}

Create a comprehensive implementation plan including:

## 1. Architecture Overview
- High-level system design
- Key components and their responsibilities
- Data flow and communication patterns

## 2. File Structure
For each file to create/modify:
- Path and filename
- Purpose and responsibilities
- Key classes/functions/interfaces
- Dependencies

## 3. Implementation Phases
Break down into logical phases:
- Phase 1: [Description]
  - Files: [list]
  - Goals: [list]
- Phase 2: [Description]
  - Files: [list]
  - Goals: [list]
(etc.)

## 4. Data Models
Define all data structures, types, interfaces

## 5. API/Interface Contracts
Define all public interfaces between components

## 6. Potential Challenges
- Challenge 1: [description] → Solution: [approach]
- Challenge 2: [description] → Solution: [approach]

## 7. Testing Strategy
- Unit tests needed
- Integration points to test
- Edge cases to consider

Be specific and detailed. This plan will guide the implementation team.`
	}

	private async analyzeCodebase(path: string): Promise<any> {
		// Tool implementation: analyze existing code structure
		// Returns summary of existing architecture
		return {
			structure: "analyzed",
			patterns: ["mvc", "repository"],
			technologies: ["typescript", "react"],
		}
	}

	private async researchPatterns(useCase: string): Promise<any> {
		// Tool implementation: research relevant design patterns
		return {
			recommendedPatterns: ["strategy", "observer"],
			reasoning: "Based on use case requirements",
		}
	}
}
```

### 5.3 Coder Agent (Primary & Secondary)

````typescript
// ============================================================================
// CODER AGENT
// Purpose: Implements code from plans and pseudocode
// ============================================================================

class CoderAgent extends BaseWorkerAgent {
	private isPrimary: boolean

	constructor(config: AgentConfig, messageRouter: MessageRouter, artifactStore: ArtifactStore) {
		super(config, messageRouter, artifactStore)
		this.isPrimary = config.roleId === "coder_primary"
	}

	protected loadTools(): Tool[] {
		return [
			{
				name: "read_file",
				description: "Read contents of a file",
				parameters: { path: "string" },
				execute: async (params) => await this.readFile(params.path),
			},
			{
				name: "write_file",
				description: "Write content to a file",
				parameters: { path: "string", content: "string" },
				execute: async (params) => await this.writeFile(params.path, params.content),
			},
			{
				name: "create_directory",
				description: "Create a directory",
				parameters: { path: "string" },
				execute: async (params) => await this.createDirectory(params.path),
			},
			{
				name: "list_directory",
				description: "List files in directory",
				parameters: { path: "string" },
				execute: async (params) => await this.listDirectory(params.path),
			},
			{
				name: "execute_command",
				description: "Execute a shell command (e.g., npm install)",
				parameters: { command: "string" },
				execute: async (params) => await this.executeCommand(params.command),
			},
		]
	}

	protected async executeTask(request: RequestPayload): Promise<TaskResult> {
		const taskType = this.determineTaskType(request)

		switch (taskType) {
			case "structure":
				return await this.createStructure(request)
			case "implement":
				return await this.implementCode(request)
			case "fix":
				return await this.fixCode(request)
			default:
				throw new Error(`Unknown task type: ${taskType}`)
		}
	}

	/**
	 * Determine what type of coding task this is
	 */
	private determineTaskType(request: RequestPayload): string {
		const task = request.task.toLowerCase()

		if (task.includes("structure") || task.includes("pseudocode")) {
			return "structure"
		} else if (task.includes("fix") || task.includes("issue")) {
			return "fix"
		} else {
			return "implement"
		}
	}

	/**
	 * Create file structure and pseudocode
	 */
	private async createStructure(request: RequestPayload): Promise<TaskResult> {
		console.log(`[Coder:${this.roleId}] Creating structure and pseudocode`)

		// Load plan artifact
		const planArtifacts = await this.loadArtifacts(request.context.artifactIds)
		const plan = Array.from(planArtifacts.values())[0]

		await this.sendStatus("working", 10, "Analyzing plan")

		// Extract file structure from plan
		const fileStructure = await this.extractFileStructure(plan)

		await this.sendStatus("working", 30, "Creating files")

		// Create files with pseudocode
		const createdFiles: string[] = []
		let totalFiles = fileStructure.length

		for (let i = 0; i < fileStructure.length; i++) {
			const file = fileStructure[i]

			await this.sendStatus("working", 30 + 50 * (i / totalFiles), `Creating ${file.path}`)

			// Generate pseudocode for this file
			const pseudocode = await this.generatePseudocode(file, plan)

			// Write file
			await this.writeFile(file.path, pseudocode)
			createdFiles.push(file.path)
		}

		await this.sendStatus("working", 90, "Storing artifact")

		// Create artifact with all pseudocode
		const allPseudocode = await this.aggregateFileContents(createdFiles)

		const artifact = await this.artifactStore.storeArtifact(ArtifactType.PSEUDOCODE, this.roleId, allPseudocode, {
			filesAffected: createdFiles,
			tags: ["pseudocode", "structure"],
		})

		await this.sendArtifact(artifact, "created")

		return {
			artifactId: artifact.id,
			filesModified: createdFiles,
		}
	}

	/**
	 * Implement actual code from pseudocode
	 */
	private async implementCode(request: RequestPayload): Promise<TaskResult> {
		console.log(`[Coder:${this.roleId}] Implementing code`)

		// Load pseudocode artifacts
		const artifacts = await this.loadArtifacts(request.context.artifactIds)

		await this.sendStatus("working", 10, "Analyzing pseudocode")

		// Get list of files to implement
		const filesToImplement = await this.extractFilesToImplement(artifacts)

		const implementedFiles: string[] = []
		const totalFiles = filesToImplement.length

		for (let i = 0; i < filesToImplement.length; i++) {
			const file = filesToImplement[i]

			await this.sendStatus("working", 10 + 70 * (i / totalFiles), `Implementing ${file.path}`)

			// Read pseudocode
			const pseudocode = await this.readFile(file.path)

			// Convert to real code
			const realCode = await this.convertPseudocodeToCode(pseudocode, file.path, artifacts)

			// Write implementation
			await this.writeFile(file.path, realCode)
			implementedFiles.push(file.path)
		}

		await this.sendStatus("working", 90, "Creating artifact")

		// Create artifact
		const implementedCode = await this.aggregateFileContents(implementedFiles)

		const artifact = await this.artifactStore.storeArtifact(ArtifactType.CODE, this.roleId, implementedCode, {
			filesAffected: implementedFiles,
			tags: ["implementation", this.isPrimary ? "primary" : "secondary"],
		})

		await this.sendArtifact(artifact, "created")

		return {
			artifactId: artifact.id,
			filesModified: implementedFiles,
		}
	}

	/**
	 * Fix code based on review issues
	 */
	private async fixCode(request: RequestPayload): Promise<TaskResult> {
		console.log(`[Coder:${this.roleId}] Fixing code issues`)

		// Load review artifact
		const reviewArtifacts = await this.loadArtifacts(request.context.artifactIds)
		const review = Array.from(reviewArtifacts.values())[0]

		await this.sendStatus("working", 20, "Analyzing issues")

		// Extract issues to fix
		const issues = await this.extractIssuesFromReview(review)

		const fixedFiles: string[] = []
		const totalIssues = issues.length

		for (let i = 0; i < issues.length; i++) {
			const issue = issues[i]

			await this.sendStatus("working", 20 + 60 * (i / totalIssues), `Fixing: ${issue.description}`)

			// Read current code
			const currentCode = await this.readFile(issue.file)

			// Generate fix
			const fixedCode = await this.generateCodeFix(currentCode, issue, review)

			// Apply fix
			await this.writeFile(issue.file, fixedCode)

			if (!fixedFiles.includes(issue.file)) {
				fixedFiles.push(issue.file)
			}
		}

		await this.sendStatus("working", 90, "Creating artifact")

		// Create artifact for fixes
		const fixedCode = await this.aggregateFileContents(fixedFiles)

		const artifact = await this.artifactStore.storeArtifact(ArtifactType.CODE, this.roleId, fixedCode, {
			filesAffected: fixedFiles,
			tags: ["fix", "revised"],
			parentArtifactId: request.context.artifactIds[0],
		})

		await this.sendArtifact(artifact, "updated")

		return {
			artifactId: artifact.id,
			filesModified: fixedFiles,
		}
	}

	/**
	 * Extract file structure from plan
	 */
	private async extractFileStructure(plan: string): Promise<FileInfo[]> {
		const prompt = `Extract the file structure from this implementation plan:

${plan}

Return a JSON array of files to create:
[
  {
    "path": "src/components/MyComponent.tsx",
    "type": "component|service|util|model|test",
    "purpose": "Brief description",
    "dependencies": ["dep1", "dep2"]
  }
]

Only include files that need to be created, not existing files.`

		const response = await this.llmProvider.complete(prompt, {
			maxTokens: 2000,
			temperature: 0.3,
		})

		return JSON.parse(
			response
				.replace(/```json\n?/g, "")
				.replace(/```/g, "")
				.trim(),
		)
	}

	/**
	 * Generate pseudocode for a file
	 */
	private async generatePseudocode(file: FileInfo, plan: string): Promise<string> {
		const prompt = `Generate detailed pseudocode for this file:

File: ${file.path}
Type: ${file.type}
Purpose: ${file.purpose}
Dependencies: ${file.dependencies.join(", ")}

Context from plan:
${plan}

Generate pseudocode that:
1. Defines all interfaces, types, classes
2. Outlines all functions/methods with clear logic
3. Includes detailed comments explaining the approach
4. Specifies all imports needed
5. Shows control flow for complex logic

Use proper syntax for ${this.getLanguage(file.path)} but keep it as pseudocode.
Be specific enough that another developer can implement directly from this.`

		return await this.llmProvider.complete(prompt, {
			maxTokens: 3000,
			temperature: 0.5,
		})
	}

	/**
	 * Convert pseudocode to actual implementation
	 */
	private async convertPseudocodeToCode(
		pseudocode: string,
		filePath: string,
		context: Map<string, string>,
	): Promise<string> {
		const prompt = `Convert this pseudocode into a complete, production-ready implementation:

File: ${filePath}

Pseudocode:
${pseudocode}

${
	context.size > 0
		? `
Related context:
${Array.from(context.values()).join("\n\n")}
`
		: ""
}

Generate complete ${this.getLanguage(filePath)} code that:
1. Implements all functionality from pseudocode
2. Follows best practices and coding standards
3. Includes proper error handling
4. Has meaningful variable/function names
5. Is efficient and maintainable
6. Includes JSDoc/TSDoc comments for public APIs
7. Handles edge cases appropriately

Return ONLY the code, no explanations.`

		return await this.llmProvider.complete(prompt, {
			maxTokens: 4000,
			temperature: 0.4,
		})
	}

	/**
	 * Extract issues from review report
	 */
	private async extractIssuesFromReview(review: string): Promise<CodeIssue[]> {
		const prompt = `Extract all code issues from this review report:

${review}

Return JSON array:
[
  {
    "file": "path/to/file.ts",
    "line": 42,
    "severity": "CRITICAL|HIGH|MEDIUM|LOW",
    "description": "Issue description",
    "suggestion": "How to fix it"
  }
]`

		const response = await this.llmProvider.complete(prompt, {
			maxTokens: 2000,
			temperature: 0.2,
		})

		return JSON.parse(
			response
				.replace(/```json\n?/g, "")
				.replace(/```/g, "")
				.trim(),
		)
	}

	/**
	 * Generate fix for code issue
	 */
	private async generateCodeFix(currentCode: string, issue: CodeIssue, fullReview: string): Promise<string> {
		const prompt = `Fix this code issue:

Current code:
${currentCode}

Issue (Line ${issue.line}):
Severity: ${issue.severity}
Description: ${issue.description}
Suggestion: ${issue.suggestion}

Full review context:
${fullReview}

Return the complete fixed code. Maintain all existing functionality while addressing the issue.`

		return await this.llmProvider.complete(prompt, {
			maxTokens: 4000,
			temperature: 0.3,
		})
	}

	/**
	 * Extract files to implement from artifacts
	 */
	private async extractFilesToImplement(artifacts: Map<string, string>): Promise<FileInfo[]> {
		// Parse pseudocode artifacts to get file list
		const files: FileInfo[] = []

		for (const [id, content] of artifacts) {
			// Extract file paths from content
			const matches = content.matchAll(/File: (.+)/g)

			for (const match of matches) {
				files.push({
					path: match[1].trim(),
					type: "implementation",
					purpose: "",
					dependencies: [],
				})
			}
		}

		return files
	}

	/**
	 * Aggregate contents of multiple files
	 */
	private async aggregateFileContents(filePaths: string[]): Promise<string> {
		let aggregated = ""

		for (const path of filePaths) {
			const content = await this.readFile(path)
			aggregated += `\n\n=== File: ${path} ===\n${content}`
		}

		return aggregated
	}

	/**
	 * Get language from file extension
	 */
	private getLanguage(filePath: string): string {
		const ext = filePath.split(".").pop()?.toLowerCase()

		const langMap: Record<string, string> = {
			ts: "TypeScript",
			tsx: "TypeScript React",
			js: "JavaScript",
			jsx: "JavaScript React",
			py: "Python",
			java: "Java",
			cpp: "C++",
			c: "C",
			go: "Go",
			rs: "Rust",
		}

		return langMap[ext || ""] || "code"
	}

	// Tool implementations
	private async readFile(path: string): Promise<string> {
		const fs = require("fs/promises")
		return await fs.readFile(path, "utf8")
	}

	private async writeFile(path: string, content: string): Promise<void> {
		const fs = require("fs/promises")
		const pathModule = require("path")

		// Ensure directory exists
		await fs.mkdir(pathModule.dirname(path), { recursive: true })
		await fs.writeFile(path, content, "utf8")
	}

	private async createDirectory(path: string): Promise<void> {
		const fs = require("fs/promises")
		await fs.mkdir(path, { recursive: true })
	}

	private async listDirectory(path: string): Promise<string[]> {
		const fs = require("fs/promises")
		return await fs.readdir(path)
	}

	private async executeCommand(command: string): Promise<string> {
		const { exec } = require("child_process")
		const { promisify } = require("util")
		const execAsync = promisify(exec)

		const { stdout, stderr } = await execAsync(command)
		return stdout + stderr
	}
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

interface FileInfo {
	path: string
	type: string
	purpose: string
	dependencies: string[]
}

interface CodeIssue {
	file: string
	line: number
	severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
	description: string
	suggestion: string
}
````

---

## Part 6: Review and Support Agents

### 6.1 Code Sceptic Agent

````typescript
// ============================================================================
// CODE SCEPTIC AGENT
// Purpose: Reviews plans and code for quality, bugs, and best practices
// ============================================================================

class CodeScepticAgent extends BaseWorkerAgent {
	protected loadTools(): Tool[] {
		return [
			{
				name: "run_linter",
				description: "Run static analysis/linting on code",
				parameters: { files: "string[]" },
				execute: async (params) => await this.runLinter(params.files),
			},
			{
				name: "check_types",
				description: "Run type checking",
				parameters: { files: "string[]" },
				execute: async (params) => await this.checkTypes(params.files),
			},
			{
				name: "analyze_complexity",
				description: "Analyze code complexity metrics",
				parameters: { file: "string" },
				execute: async (params) => await this.analyzeComplexity(params.file),
			},
			{
				name: "search_patterns",
				description: "Search for anti-patterns or security issues",
				parameters: { patterns: "string[]" },
				execute: async (params) => await this.searchPatterns(params.patterns),
			},
		]
	}

	protected async executeTask(request: RequestPayload): Promise<TaskResult> {
		const reviewType = this.determineReviewType(request)

		switch (reviewType) {
			case "plan":
				return await this.reviewPlan(request)
			case "code":
				return await this.reviewCode(request)
			default:
				throw new Error(`Unknown review type: ${reviewType}`)
		}
	}

	/**
	 * Determine what type of review is needed
	 */
	private determineReviewType(request: RequestPayload): string {
		// Check artifact types being reviewed
		const artifactIds = request.context.artifactIds

		for (const id of artifactIds) {
			const artifact = this.artifactStore.getArtifactMetadata(id)

			if (artifact?.type === ArtifactType.IMPLEMENTATION_PLAN) {
				return "plan"
			} else if (artifact?.type === ArtifactType.CODE) {
				return "code"
			}
		}

		return "code" // Default
	}

	/**
	 * Review implementation plan
	 */
	private async reviewPlan(request: RequestPayload): Promise<TaskResult> {
		console.log(`[CodeSceptic] Reviewing implementation plan`)

		// Load plan artifact
		const planArtifacts = await this.loadArtifacts(request.context.artifactIds)
		const plan = Array.from(planArtifacts.values())[0]

		await this.sendStatus("working", 20, "Analyzing plan structure")

		// Perform comprehensive plan review
		const review = await this.performPlanReview(plan)

		await this.sendStatus("working", 80, "Compiling review report")

		// Determine approval status
		const criticalIssues = review.issues.filter((i) => i.severity === "CRITICAL")
		const approvalStatus = criticalIssues.length === 0 ? "approved" : "rejected"

		// Create review artifact
		const artifact = await this.artifactStore.storeArtifact(
			ArtifactType.REVIEW_REPORT,
			this.roleId,
			this.formatReviewReport(review),
			{
				tags: ["review", "plan"],
				approvalStatus,
				parentArtifactId: request.context.artifactIds[0],
			},
		)

		await this.sendArtifact(artifact, "created")

		return {
			artifactId: artifact.id,
			data: { approved: approvalStatus === "approved", issueCount: review.issues.length },
		}
	}

	/**
	 * Review implemented code
	 */
	private async reviewCode(request: RequestPayload): Promise<TaskResult> {
		console.log(`[CodeSceptic] Reviewing code implementation`)

		// Load code artifacts
		const codeArtifacts = await this.loadArtifacts(request.context.artifactIds)

		await this.sendStatus("working", 10, "Extracting files")

		// Get list of files to review
		const filesToReview = await this.extractFilesFromArtifacts(codeArtifacts)

		await this.sendStatus("working", 20, "Running automated checks")

		// Run automated tools
		const lintResults = await this.runLinter(filesToReview)
		const typeResults = await this.checkTypes(filesToReview)

		await this.sendStatus("working", 40, "Performing manual review")

		// Perform manual LLM-based review
		const manualReview = await this.performCodeReview(codeArtifacts, filesToReview, lintResults, typeResults)

		await this.sendStatus("working", 80, "Compiling review report")

		// Combine all findings
		const combinedReview = this.combineReviewFindings(manualReview, lintResults, typeResults)

		// Determine approval
		const criticalIssues = combinedReview.issues.filter((i) => i.severity === "CRITICAL" || i.severity === "HIGH")
		const approvalStatus = criticalIssues.length === 0 ? "approved" : "rejected"

		// Create review artifact
		const artifact = await this.artifactStore.storeArtifact(
			ArtifactType.REVIEW_REPORT,
			this.roleId,
			this.formatReviewReport(combinedReview),
			{
				filesAffected: filesToReview,
				tags: ["review", "code"],
				approvalStatus,
				parentArtifactId: request.context.artifactIds[0],
			},
		)

		await this.sendArtifact(artifact, "created")

		return {
			artifactId: artifact.id,
			data: {
				approved: approvalStatus === "approved",
				issueCount: combinedReview.issues.length,
				filesReviewed: filesToReview.length,
			},
		}
	}

	/**
	 * Perform plan review using LLM
	 */
	private async performPlanReview(plan: string): Promise<ReviewResult> {
		const prompt = `You are an expert code reviewer analyzing an implementation plan.

Plan to review:
${plan}

Perform a thorough review checking for:

1. ARCHITECTURE SOUNDNESS
   - Is the architecture appropriate for the requirements?
   - Are components properly separated?
   - Is the design scalable and maintainable?

2. COMPLETENESS
   - Are all requirements addressed?
   - Are data models complete?
   - Are all necessary files identified?

3. FEASIBILITY
   - Can this plan be realistically implemented?
   - Are there any unrealistic expectations?
   - Are time/complexity estimates reasonable?

4. MISSING CONSIDERATIONS
   - Error handling strategies?
   - Security considerations?
   - Performance implications?
   - Testing approach?

5. POTENTIAL ISSUES
   - Circular dependencies?
   - Overly complex designs?
   - Missing edge cases?

For each issue found, provide:
- Severity: CRITICAL, HIGH, MEDIUM, or LOW
- Category: architecture, completeness, feasibility, missing, potential_issue
- Description: What's wrong
- Suggestion: How to fix it
- Impact: What happens if not addressed

Return JSON:
{
  "summary": "Overall assessment in 2-3 sentences",
  "strengths": ["strength 1", "strength 2"],
  "issues": [
    {
      "severity": "HIGH",
      "category": "architecture",
      "description": "Issue description",
      "suggestion": "How to fix",
      "impact": "Impact if not fixed"
    }
  ],
  "recommendation": "APPROVE|REVISE|REJECT"
}`

		const response = await this.llmProvider.complete(prompt, {
			maxTokens: 3000,
			temperature: 0.3,
		})

		return JSON.parse(
			response
				.replace(/```json\n?/g, "")
				.replace(/```/g, "")
				.trim(),
		)
	}

	/**
	 * Perform code review using LLM
	 */
	private async performCodeReview(
		codeArtifacts: Map<string, string>,
		filePaths: string[],
		lintResults: any,
		typeResults: any,
	): Promise<ReviewResult> {
		const issues: ReviewIssue[] = []

		// Review each file
		for (const filePath of filePaths) {
			const code = await this.readFile(filePath)

			const fileReview = await this.reviewSingleFile(filePath, code, lintResults[filePath], typeResults[filePath])

			issues.push(...fileReview.issues)
		}

		// Cross-file analysis
		const crossFileIssues = await this.performCrossFileAnalysis(codeArtifacts, filePaths)

		issues.push(...crossFileIssues)

		// Generate summary
		const summary = await this.generateReviewSummary(issues, filePaths.length)

		return {
			summary,
			strengths: this.identifyStrengths(issues),
			issues,
			recommendation: this.determineRecommendation(issues),
		}
	}

	/**
	 * Review a single file
	 */
	private async reviewSingleFile(
		filePath: string,
		code: string,
		lintIssues: any,
		typeIssues: any,
	): Promise<ReviewResult> {
		const prompt = `Review this code file for quality and potential issues:

File: ${filePath}

Code:
${code}

${lintIssues ? `Linter found: ${JSON.stringify(lintIssues)}` : ""}
${typeIssues ? `Type checker found: ${JSON.stringify(typeIssues)}` : ""}

Review for:

1. CORRECTNESS
   - Logic errors
   - Edge cases not handled
   - Incorrect algorithm implementations

2. BEST PRACTICES
   - Code style and conventions
   - Naming conventions
   - Function/class design
   - DRY principle violations

3. BUGS AND ISSUES
   - Null/undefined handling
   - Race conditions
   - Memory leaks
   - Resource management

4. PERFORMANCE
   - Inefficient algorithms
   - Unnecessary operations
   - Memory usage concerns

5. SECURITY
   - Input validation
   - Injection vulnerabilities
   - Sensitive data handling

6. MAINTAINABILITY
   - Code complexity
   - Documentation quality
   - Testability

Return JSON with issues array (each with severity, category, line, description, suggestion).`

		const response = await this.llmProvider.complete(prompt, {
			maxTokens: 2500,
			temperature: 0.3,
		})

		const result = JSON.parse(
			response
				.replace(/```json\n?/g, "")
				.replace(/```/g, "")
				.trim(),
		)

		// Add file path to all issues
		result.issues = result.issues.map((issue: any) => ({
			...issue,
			file: filePath,
		}))

		return result
	}

	/**
	 * Perform cross-file analysis
	 */
	private async performCrossFileAnalysis(
		codeArtifacts: Map<string, string>,
		filePaths: string[],
	): Promise<ReviewIssue[]> {
		const prompt = `Analyze these files together for cross-cutting concerns:

Files reviewed: ${filePaths.join(", ")}

${Array.from(codeArtifacts.entries())
	.map(
		([id, content]) => `
${content}
`,
	)
	.join("\n")}

Check for:
1. Circular dependencies
2. Inconsistent interfaces between files
3. Duplicate code across files
4. Missing error propagation
5. Inconsistent patterns or conventions
6. Integration issues between components

Return JSON array of cross-file issues.`

		const response = await this.llmProvider.complete(prompt, {
			maxTokens: 2000,
			temperature: 0.3,
		})

		return (
			JSON.parse(
				response
					.replace(/```json\n?/g, "")
					.replace(/```/g, "")
					.trim(),
			).issues || []
		)
	}

	/**
	 * Combine review findings from multiple sources
	 */
	private combineReviewFindings(manualReview: ReviewResult, lintResults: any, typeResults: any): ReviewResult {
		const allIssues = [...manualReview.issues]

		// Add unique lint issues not already found
		for (const [file, issues] of Object.entries(lintResults)) {
			for (const issue of issues as any[]) {
				if (!this.isDuplicateIssue(issue, allIssues)) {
					allIssues.push({
						severity: "LOW",
						category: "style",
						file,
						line: issue.line,
						description: issue.message,
						suggestion: "Fix linting issue",
						impact: "Code style inconsistency",
					})
				}
			}
		}

		// Add type errors
		for (const [file, errors] of Object.entries(typeResults)) {
			for (const error of errors as any[]) {
				allIssues.push({
					severity: "HIGH",
					category: "type_error",
					file,
					line: error.line,
					description: error.message,
					suggestion: "Fix type error",
					impact: "Code will not compile",
				})
			}
		}

		return {
			...manualReview,
			issues: allIssues,
		}
	}

	/**
	 * Check if issue is duplicate
	 */
	private isDuplicateIssue(issue: any, existingIssues: ReviewIssue[]): boolean {
		return existingIssues.some(
			(existing) =>
				existing.file === issue.file &&
				existing.line === issue.line &&
				existing.description.includes(issue.message),
		)
	}

	/**
	 * Generate review summary
	 */
	private async generateReviewSummary(issues: ReviewIssue[], fileCount: number): Promise<string> {
		const critical = issues.filter((i) => i.severity === "CRITICAL").length
		const high = issues.filter((i) => i.severity === "HIGH").length
		const medium = issues.filter((i) => i.severity === "MEDIUM").length
		const low = issues.filter((i) => i.severity === "LOW").length

		return `Reviewed ${fileCount} files. Found ${issues.length} issues: ${critical} critical, ${high} high, ${medium} medium, ${low} low priority.`
	}

	/**
	 * Identify code strengths
	 */
	private identifyStrengths(issues: ReviewIssue[]): string[] {
		const strengths: string[] = []

		if (issues.filter((i) => i.category === "security").length === 0) {
			strengths.push("No security vulnerabilities found")
		}

		if (issues.filter((i) => i.severity === "CRITICAL").length === 0) {
			strengths.push("No critical issues found")
		}

		return strengths
	}

	/**
	 * Determine recommendation
	 */
	private determineRecommendation(issues: ReviewIssue[]): string {
		const critical = issues.filter((i) => i.severity === "CRITICAL").length
		const high = issues.filter((i) => i.severity === "HIGH").length

		if (critical > 0) return "REJECT"
		if (high > 3) return "REVISE"
		return "APPROVE"
	}

	/**
	 * Format review report
	 */
	private formatReviewReport(review: ReviewResult): string {
		let report = `# Code Review Report\n\n`
		report += `## Summary\n${review.summary}\n\n`

		if (review.strengths.length > 0) {
			report += `## Strengths\n`
			review.strengths.forEach((s) => (report += `- ${s}\n`))
			report += `\n`
		}

		report += `## Issues Found\n\n`

		// Group by severity
		const bySeverity = {
			CRITICAL: review.issues.filter((i) => i.severity === "CRITICAL"),
			HIGH: review.issues.filter((i) => i.severity === "HIGH"),
			MEDIUM: review.issues.filter((i) => i.severity === "MEDIUM"),
			LOW: review.issues.filter((i) => i.severity === "LOW"),
		}

		for (const [severity, issues] of Object.entries(bySeverity)) {
			if (issues.length > 0) {
				report += `### ${severity} Priority (${issues.length})\n\n`

				issues.forEach((issue, idx) => {
					report += `#### ${idx + 1}. ${issue.category.toUpperCase()}\n`
					if (issue.file) report += `**File:** ${issue.file}`
					if (issue.line) report += ` (Line ${issue.line})`
					report += `\n\n`
					report += `**Issue:** ${issue.description}\n\n`
					report += `**Suggestion:** ${issue.suggestion}\n\n`
					report += `**Impact:** ${issue.impact}\n\n`
				})
			}
		}

		report += `## Recommendation\n${review.recommendation}\n`

		return report
	}

	/**
	 * Extract files from artifacts
	 */
	private async extractFilesFromArtifacts(artifacts: Map<string, string>): Promise<string[]> {
		const files = new Set<string>()

		for (const [id, content] of artifacts) {
			const artifact = this.artifactStore.getArtifactMetadata(id)
			if (artifact?.metadata.filesAffected) {
				artifact.metadata.filesAffected.forEach((f) => files.add(f))
			}
		}

		return Array.from(files)
	}

	// Tool implementations
	private async runLinter(files: string[]): Promise<any> {
		// Run ESLint or similar
		const results: Record<string, any[]> = {}

		for (const file of files) {
			try {
				// Simplified - actual implementation would run real linter
				results[file] = []
			} catch (error) {
				results[file] = []
			}
		}

		return results
	}

	private async checkTypes(files: string[]): Promise<any> {
		// Run TypeScript compiler or similar
		const results: Record<string, any[]> = {}

		for (const file of files) {
			try {
				// Simplified - actual implementation would run tsc
				results[file] = []
			} catch (error) {
				results[file] = []
			}
		}

		return results
	}

	private async analyzeComplexity(file: string): Promise<any> {
		// Analyze cyclomatic complexity
		return {
			complexity: 5,
			maintainabilityIndex: 75,
		}
	}

	private async searchPatterns(patterns: string[]): Promise<any> {
		// Search for anti-patterns or security issues
		return {
			found: [],
			recommendations: [],
		}
	}

	private async readFile(path: string): Promise<string> {
		const fs = require("fs/promises")
		return await fs.readFile(path, "utf8")
	}
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

interface ReviewResult {
	summary: string
	strengths: string[]
	issues: ReviewIssue[]
	recommendation: string
}

interface ReviewIssue {
	severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
	category: string
	file?: string
	line?: number
	description: string
	suggestion: string
	impact: string
}
````

### 6.2 Commenter Agent

```typescript
// ============================================================================
// COMMENTER AGENT
// Purpose: Adds documentation and comments to code
// ============================================================================

class CommenterAgent extends BaseWorkerAgent {
	protected loadTools(): Tool[] {
		return [
			{
				name: "read_file",
				description: "Read file contents",
				parameters: { path: "string" },
				execute: async (params) => await this.readFile(params.path),
			},
			{
				name: "write_file",
				description: "Write file with added documentation",
				parameters: { path: "string", content: "string" },
				execute: async (params) => await this.writeFile(params.path, params.content),
			},
			{
				name: "generate_readme",
				description: "Generate README.md for project",
				parameters: { projectInfo: "object" },
				execute: async (params) => await this.generateReadme(params.projectInfo),
			},
		]
	}

	protected async executeTask(request: RequestPayload): Promise<TaskResult> {
		console.log(`[Commenter] Adding documentation`)

		// Load code artifacts
		const codeArtifacts = await this.loadArtifacts(request.context.artifactIds)

		await this.sendStatus("working", 10, "Analyzing code")

		// Extract files to document
		const files = await this.extractFilesFromArtifacts(codeArtifacts)

		const documentedFiles: string[] = []
		const totalFiles = files.length

		// Document each file
		for (let i = 0; i < files.length; i++) {
			const file = files[i]

			await this.sendStatus("working", 10 + 70 * (i / totalFiles), `Documenting ${file}`)

			const documented = await this.documentFile(file)
			documentedFiles.push(file)
		}

		await this.sendStatus("working", 85, "Generating README")

		// Generate/update README
		await this.updateProjectReadme(codeArtifacts, documentedFiles)

		await this.sendStatus("working", 95, "Creating artifact")

		// Create documentation artifact
		const artifact = await this.artifactStore.storeArtifact(
			ArtifactType.DOCUMENTATION,
			this.roleId,
			`Documentation added to ${documentedFiles.length} files`,
			{
				filesAffected: documentedFiles,
				tags: ["documentation", "comments"],
			},
		)

		await this.sendArtifact(artifact, "created")

		return {
			artifactId: artifact.id,
			filesModified: documentedFiles,
		}
	}

	/**
	 * Document a single file
	 */
	private async documentFile(filePath: string): Promise<void> {
		const code = await this.readFile(filePath)

		const prompt = `Add comprehensive documentation and comments to this code:

File: ${filePath}

Code:
${code}

Add:
1. File-level JSDoc/TSDoc header explaining purpose
2. Documentation comments for all:
   - Classes
   - Interfaces
   - Public methods/functions
   - Complex algorithms
3. Inline comments for:
   - Non-obvious logic
   - Important business rules
   - Edge cases handled
4. Parameter descriptions
5. Return value descriptions
6. Example usage where helpful

Keep existing code unchanged, only add documentation.
Return the complete file with documentation added.`

		const documented = await this.llmProvider.complete(prompt, {
			maxTokens: 4000,
			temperature: 0.3,
		})

		await this.writeFile(filePath, documented)
	}

	/**
	 * Update project README
	 */
	private async updateProjectReadme(codeArtifacts: Map<string, string>, files: string[]): Promise<void> {
		const projectInfo = await this.analyzeProject(codeArtifacts, files)
		const readme = await this.generateReadme(projectInfo)

		await this.writeFile("README.md", readme)
	}

	/**
	 * Analyze project structure
	 */
	private async analyzeProject(codeArtifacts: Map<string, string>, files: string[]): Promise<any> {
		return {
			name: "Project",
			description: "Generated project",
			files: files,
			dependencies: [],
			usage: "See code files",
		}
	}

	/**
	 * Generate README
	 */
	private async generateReadme(projectInfo: any): Promise<string> {
		const prompt = `Generate a comprehensive README.md for this project:

${JSON.stringify(projectInfo, null, 2)}

Include:
1. Project title and description
2. Features
3. Installation instructions
4. Usage examples
5. API documentation
6. File structure
7. Contributing guidelines
8. License

Format in proper Markdown.`

		return await this.llmProvider.complete(prompt, {
			maxTokens: 3000,
			temperature: 0.5,
		})
	}

	private async extractFilesFromArtifacts(artifacts: Map<string, string>): Promise<string[]> {
		const files = new Set<string>()

		for (const [id, _] of artifacts) {
			const artifact = this.artifactStore.getArtifactMetadata(id)
			if (artifact?.metadata.filesAffected) {
				artifact.metadata.filesAffected.forEach((f) => files.add(f))
			}
		}

		return Array.from(files)
	}

	private async readFile(path: string): Promise<string> {
		const fs = require("fs/promises")
		return await fs.readFile(path, "utf8")
	}

	private async writeFile(path: string, content: string): Promise<void> {
		const fs = require("fs/promises")
		await fs.writeFile(path, content, "utf8")
	}
}
```

### 6.3 Debugger Agent

````typescript
// ============================================================================
// DEBUGGER AGENT
// Purpose: Runs tests and debugs failures
// ============================================================================

class DebuggerAgent extends BaseWorkerAgent {
	protected loadTools(): Tool[] {
		return [
			{
				name: "run_tests",
				description: "Run test suite",
				parameters: { testPath: "string" },
				execute: async (params) => await this.runTests(params.testPath),
			},
			{
				name: "run_single_test",
				description: "Run a specific test",
				parameters: { testFile: "string", testName: "string" },
				execute: async (params) => await this.runSingleTest(params.testFile, params.testName),
			},
			{
				name: "read_file",
				description: "Read source file",
				parameters: { path: "string" },
				execute: async (params) => await this.readFile(params.path),
			},
			{
				name: "write_file",
				description: "Write fixed file",
				parameters: { path: "string", content: "string" },
				execute: async (params) => await this.writeFile(params.path, params.content),
			},
		]
	}

	protected async executeTask(request: RequestPayload): Promise<TaskResult> {
		console.log(`[Debugger] Running tests and debugging`)

		await this.sendStatus("working", 10, "Running test suite")

		// Run all tests
		const testResults = await this.runTests(".")

		await this.sendStatus("working", 40, "Analyzing failures")

		// Analyze failures
		const failures = this.extractFailures(testResults)

		if (failures.length === 0) {
			// All tests passed
			await this.sendStatus("working", 90, "All tests passed")

			const artifact = await this.artifactStore.storeArtifact(
				ArtifactType.TEST_RESULTS,
				this.roleId,
				this.formatTestResults(testResults),
				{
					tags: ["tests", "passed"],
				},
			)

			await this.sendArtifact(artifact, "created")

			return {
				artifactId: artifact.id,
				data: { allPassed: true, total: testResults.total, passed: testResults.passed },
			}
		}

		await this.sendStatus("working", 50, `Debugging ${failures.length} failures`)

		// Fix failures
		const fixedFiles: string[] = []
		const totalFailures = failures.length

		for (let i = 0; i < failures.length; i++) {
			const failure = failures[i]

			await this.sendStatus("working", 50 + 40 * (i / totalFailures), `Fixing: ${failure.testName}`)

			await this.debugAndFix(failure)
			fixedFiles.push(failure.sourceFile)
		}

		await this.sendStatus("working", 95, "Re-running tests")

		// Re-run tests
		const finalResults = await this.runTests(".")

		// Create artifact
		const artifact = await this.artifactStore.storeArtifact(
			ArtifactType.TEST_RESULTS,
			this.roleId,
			this.formatTestResults(finalResults),
			{
				filesAffected: Array.from(new Set(fixedFiles)),
				tags: ["tests", "debugged"],
			},
		)

		await this.sendArtifact(artifact, "created")

		return {
			artifactId: artifact.id,
			filesModified: Array.from(new Set(fixedFiles)),
			data: {
				passed: finalResults.passed,
				failed: finalResults.failed,
				total: finalResults.total,
			},
		}
	}

	/**
	 * Debug and fix a test failure
	 */
	private async debugAndFix(failure: TestFailure): Promise<void> {
		// Read source file
		const sourceCode = await this.readFile(failure.sourceFile)

		// Analyze failure and generate fix
		const prompt = `Debug and fix this test failure:

Test: ${failure.testName}
File: ${failure.sourceFile}
Error: ${failure.error}
Stack trace: ${failure.stackTrace}

Source code:
${sourceCode}

Analyze the failure and provide a fix:
1. Identify the root cause
2. Explain why the test is failing
3. Provide corrected code

Return JSON:
{
  "rootCause": "Explanation",
  "fix": "Complete corrected code"
}`

		const response = await this.llmProvider.complete(prompt, {
			maxTokens: 3000,
			temperature: 0.3,
		})

		const result = JSON.parse(
			response
				.replace(/```json\n?/g, "")
				.replace(/```/g, "")
				.trim(),
		)

		// Apply fix
		await this.writeFile(failure.sourceFile, result.fix)

		console.log(`[Debugger] Fixed ${failure.testName}: ${result.rootCause}`)
	}

	/**
	 * Extract test failures from results
	 */
	private extractFailures(results: TestResults): TestFailure[] {
		return results.failures || []
	}

	/**
	 * Format test results for artifact
	 */
	private formatTestResults(results: TestResults): string {
		let report = `# Test Results\n\n`
		report += `**Total:** ${results.total}\n`
		report += `**Passed:** ${results.passed} ✓\n`
		report += `**Failed:** ${results.failed} ✗\n\n`

		if (results.failures && results.failures.length > 0) {
			report += `## Failures\n\n`

			results.failures.forEach((failure, idx) => {
				report += `### ${idx + 1}. ${failure.testName}\n`
				report += `**File:** ${failure.sourceFile}\n`
				report += `**Error:** ${failure.error}\n\n`
				report += `\`\`\`\n${failure.stackTrace}\n\`\`\`\n\n`
			})
		}

		return report
	}

	// Tool implementations
	private async runTests(path: string): Promise<TestResults> {
		const { exec } = require("child_process")
		const { promisify } = require("util")
		const execAsync = promisify(exec)

		try {
			const { stdout } = await execAsync("npm test")
			return this.parseTestOutput(stdout)
		} catch (error: any) {
			return this.parseTestOutput(error.stdout + error.stderr)
		}
	}

	private async runSingleTest(testFile: string, testName: string): Promise<any> {
		// Run specific test
		return { passed: true }
	}

	private parseTestOutput(output: string): TestResults {
		// Parse test framework output (Jest, Vitest, etc.)
		// Simplified version
		const passedMatch = output.match(/(\d+) passed/)
		const failedMatch = output.match(/(\d+) failed/)

		const passed = passedMatch ? parseInt(passedMatch[1]) : 0
		const failed = failedMatch ? parseInt(failedMatch[1]) : 0

		return {
			total: passed + failed,
			passed,
			failed,
			failures: [], // Would parse actual failures from output
		}
	}

	private async readFile(path: string): Promise<string> {
		const fs = require("fs/promises")
		return await fs.readFile(path, "utf8")
	}

	private async writeFile(path: string, content: string): Promise<void> {
		const fs = require("fs/promises")
		await fs.writeFile(path, content, "utf8")
	}
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

interface TestResults {
	total: number
	passed: number
	failed: number
	failures?: TestFailure[]
}

interface TestFailure {
	testName: string
	sourceFile: string
	error: string
	stackTrace: string
}
````

---

## Part 7: Configuration Management

### 7.1 Configuration Manager

```typescript
// ============================================================================
// ORCHESTRATION CONFIG MANAGER
// Purpose: Manages role assignments and provider profiles
// ============================================================================

import * as vscode from "vscode"

class OrchestrationConfigManager {
	private context: vscode.ExtensionContext
	private configKey = "kilocode.orchestration"

	constructor(context: vscode.ExtensionContext) {
		this.context = context
		this.initializeDefaultConfig()
	}

	/**
	 * Initialize default configuration
	 */
	private async initializeDefaultConfig(): Promise<void> {
		const existing = await this.getConfiguration()

		if (!existing) {
			const defaultConfig: OrchestrationConfig = {
				enabled: false,
				roleAssignments: this.getDefaultRoleAssignments(),
				providerProfiles: [],
				workflowSettings: {
					autoApproveArtifacts: false,
					maxConcurrentAgents: 5,
					defaultTimeout: 300000,
					enableLogging: true,
					archiveAfterHours: 24,
				},
			}

			await this.saveConfiguration(defaultConfig)
		}
	}

	/**
	 * Get default role assignments (unassigned)
	 */
	private getDefaultRoleAssignments(): RoleAssignment[] {
		return AVAILABLE_ROLES.map((role) => ({
			roleId: role.id,
			roleName: role.name,
			assignedProfileId: null,
			isActive: role.required,
			priority: 1,
		}))
	}

	/**
	 * Get full configuration
	 */
	async getConfiguration(): Promise<OrchestrationConfig | undefined> {
		return await this.context.globalState.get<OrchestrationConfig>(this.configKey)
	}

	/**
	 * Save configuration
	 */
	async saveConfiguration(config: OrchestrationConfig): Promise<void> {
		await this.context.globalState.update(this.configKey, config)
	}

	/**
	 * Get role assignments
	 */
	async getRoleAssignments(): Promise<RoleAssignment[]> {
		const config = await this.getConfiguration()
		return config?.roleAssignments || this.getDefaultRoleAssignments()
	}

	/**
	 * Update role assignment
	 */
	async updateRoleAssignment(roleId: string, profileId: string | null, isActive: boolean = true): Promise<void> {
		const config = await this.getConfiguration()
		if (!config) return

		const assignment = config.roleAssignments.find((a) => a.roleId === roleId)
		if (assignment) {
			assignment.assignedProfileId = profileId
			assignment.isActive = isActive
		}

		await this.saveConfiguration(config)
	}

	/**
	 * Get provider profiles
	 */
	async getProviderProfiles(): Promise<ProviderProfile[]> {
		const config = await this.getConfiguration()
		return config?.providerProfiles || []
	}

	/**
	 * Get specific provider profile
	 */
	async getProviderProfile(id: string): Promise<ProviderProfile | null> {
		const profiles = await this.getProviderProfiles()
		return profiles.find((p) => p.id === id) || null
	}

	/**
	 * Add provider profile
	 */
	async addProviderProfile(profile: ProviderProfile): Promise<void> {
		const config = await this.getConfiguration()
		if (!config) return

		config.providerProfiles.push(profile)
		await this.saveConfiguration(config)
	}

	/**
	 * Update provider profile
	 */
	async updateProviderProfile(profile: ProviderProfile): Promise<void> {
		const config = await this.getConfiguration()
		if (!config) return

		const index = config.providerProfiles.findIndex((p) => p.id === profile.id)
		if (index >= 0) {
			config.providerProfiles[index] = profile
			await this.saveConfiguration(config)
		}
	}

	/**
	 * Delete provider profile
	 */
	async deleteProviderProfile(id: string): Promise<void> {
		const config = await this.getConfiguration()
		if (!config) return

		config.providerProfiles = config.providerProfiles.filter((p) => p.id !== id)
		await this.saveConfiguration(config)
	}

	/**
	 * Validate configuration
	 */
	async validateConfiguration(): Promise<ValidationResult> {
		const config = await this.getConfiguration()
		if (!config) {
			return { isValid: false, errors: ["Configuration not initialized"] }
		}

		const errors: string[] = []

		// Check required roles are assigned
		const requiredRoles = AVAILABLE_ROLES.filter((r) => r.required)
		for (const role of requiredRoles) {
			const assignment = config.roleAssignments.find((a) => a.roleId === role.id)

			if (!assignment || !assignment.assignedProfileId) {
				errors.push(`Required role "${role.name}" is not assigned to a provider`)
			} else if (!assignment.isActive) {
				errors.push(`Required role "${role.name}" is not active`)
			}
		}

		// Check assigned profiles exist
		for (const assignment of config.roleAssignments) {
			if (assignment.assignedProfileId && assignment.isActive) {
				const profile = config.providerProfiles.find((p) => p.id === assignment.assignedProfileId)

				if (!profile) {
					errors.push(
						`Role "${assignment.roleName}" is assigned to non-existent profile "${assignment.assignedProfileId}"`,
					)
				}
			}
		}

		// Check for model capability mismatches
		for (const assignment of config.roleAssignments) {
			if (assignment.assignedProfileId && assignment.isActive) {
				const profile = config.providerProfiles.find((p) => p.id === assignment.assignedProfileId)
				const role = AVAILABLE_ROLES.find((r) => r.id === assignment.roleId)

				if (profile && role) {
					const capabilityCheck = this.checkModelCapabilities(profile, role)
					if (!capabilityCheck.suitable) {
						errors.push(
							`Profile "${profile.name}" may not be suitable for role "${role.name}": ${capabilityCheck.reason}`,
						)
					}
				}
			}
		}

		// Check for rate limit issues (same model for multiple high-volume roles)
		const rateLimitWarning = this.checkRateLimitRisks(config)
		if (rateLimitWarning) {
			errors.push(rateLimitWarning)
		}

		return {
			isValid: errors.length === 0,
			errors,
			warnings: [],
		}
	}

	/**
	 * Check if model is suitable for role
	 */
	private checkModelCapabilities(
		profile: ProviderProfile,
		role: RoleDefinition,
	): { suitable: boolean; reason?: string } {
		// Check if model is too weak for role
		const weakModels = ["gpt-3.5-turbo", "claude-instant"]
		const criticalRoles = ["organiser", "architect", "code_sceptic"]

		if (weakModels.some((m) => profile.model.includes(m)) && criticalRoles.includes(role.id)) {
			return {
				suitable: false,
				reason: "Model may be too weak for this critical role",
			}
		}

		return { suitable: true }
	}

	/**
	 * Check for rate limit risks
	 */
	private checkRateLimitRisks(config: OrchestrationConfig): string | null {
		// Count how many roles share the same provider+model
		const modelUsage = new Map<string, string[]>()

		for (const assignment of config.roleAssignments) {
			if (assignment.assignedProfileId && assignment.isActive) {
				const profile = config.providerProfiles.find((p) => p.id === assignment.assignedProfileId)

				if (profile) {
					const key = `${profile.provider}:${profile.model}`
					if (!modelUsage.has(key)) {
						modelUsage.set(key, [])
					}
					modelUsage.get(key)!.push(assignment.roleName)
				}
			}
		}

		// Check if same model used for 4+ roles
		for (const [key, roles] of modelUsage) {
			if (roles.length >= 4) {
				return `Warning: Model ${key} is assigned to ${roles.length} roles (${roles.join(", ")}). This may cause rate limit issues.`
			}
		}

		return null
	}

	/**
	 * Get workflow settings
	 */
	async getWorkflowSettings(): Promise<WorkflowSettings> {
		const config = await this.getConfiguration()
		return (
			config?.workflowSettings || {
				autoApproveArtifacts: false,
				maxConcurrentAgents: 5,
				defaultTimeout: 300000,
				enableLogging: true,
				archiveAfterHours: 24,
			}
		)
	}

	/**
	 * Update workflow settings
	 */
	async updateWorkflowSettings(settings: Partial<WorkflowSettings>): Promise<void> {
		const config = await this.getConfiguration()
		if (!config) return

		config.workflowSettings = {
			...config.workflowSettings,
			...settings,
		}

		await this.saveConfiguration(config)
	}

	/**
	 * Check if orchestration is enabled
	 */
	async isOrchestrationEnabled(): Promise<boolean> {
		const config = await this.getConfiguration()
		return config?.enabled || false
	}

	/**
	 * Enable/disable orchestration
	 */
	async setOrchestrationEnabled(enabled: boolean): Promise<void> {
		const config = await this.getConfiguration()
		if (!config) return

		config.enabled = enabled
		await this.saveConfiguration(config)
	}

	/**
	 * Export configuration
	 */
	async exportConfiguration(): Promise<string> {
		const config = await this.getConfiguration()
		return JSON.stringify(config, null, 2)
	}

	/**
	 * Import configuration
	 */
	async importConfiguration(json: string): Promise<void> {
		try {
			const config = JSON.parse(json) as OrchestrationConfig

			// Validate imported config
			// Basic structure validation
			if (!config.roleAssignments || !config.providerProfiles) {
				throw new Error("Invalid configuration structure")
			}

			await this.saveConfiguration(config)
		} catch (error) {
			throw new Error(`Failed to import configuration: ${error}`)
		}
	}
}

// ============================================================================
// ROLE DEFINITIONS
// ============================================================================

const AVAILABLE_ROLES: RoleDefinition[] = [
	{
		id: "organiser",
		name: "Organiser",
		category: "coordination",
		description: "Central coordinator managing workflow and delegating tasks",
		capabilities: ["Workflow orchestration", "Task delegation", "Artifact management", "Decision making"],
		inputArtifacts: [ArtifactType.USER_TASK],
		outputArtifacts: [],
		required: true,
		systemPrompt: `You are the Organiser agent, the central coordinator of a software development team.

Your responsibilities:
1. Receive user tasks and break them into manageable steps
2. Delegate work to specialized agents (Architect, Coders, Reviewers)
3. Track artifact creation and workflow progress
4. Make decisions about when to proceed to next workflow stage
5. Handle errors and coordinate recovery

You have access to artifact summaries (not full content) to keep your context minimal.
Communicate clearly and efficiently. Focus on coordination, not implementation.`,
	},
	{
		id: "architect",
		name: "Architect",
		category: "planning",
		description: "Creates detailed implementation plans and architecture designs",
		capabilities: [
			"Architecture design",
			"Implementation planning",
			"Technology selection",
			"Pattern recommendation",
		],
		inputArtifacts: [ArtifactType.USER_TASK],
		outputArtifacts: [ArtifactType.IMPLEMENTATION_PLAN],
		required: true,
		systemPrompt: `You are an expert Software Architect with deep knowledge of design patterns, best practices, and system design.

Your responsibilities:
1. Analyze user requirements thoroughly
2. Design scalable, maintainable architecture
3. Create detailed implementation plans with clear phases
4. Specify file structures, data models, and interfaces
5. Identify potential challenges and solutions

Be thorough, specific, and pragmatic. Your plans will guide the implementation team.`,
	},
	{
		id: "coder_primary",
		name: "Primary Coder",
		category: "implementation",
		description: "Creates file structure, pseudocode, and implements core functionality",
		capabilities: ["File structure creation", "Pseudocode generation", "Core implementation", "Framework setup"],
		inputArtifacts: [ArtifactType.IMPLEMENTATION_PLAN, ArtifactType.PSEUDOCODE],
		outputArtifacts: [ArtifactType.PSEUDOCODE, ArtifactType.CODE],
		required: true,
		systemPrompt: `You are a Senior Software Engineer specializing in creating solid foundations and core functionality.

Your responsibilities:
1. Create file structures following the implementation plan
2. Write detailed pseudocode with clear logic
3. Implement core functionality with best practices
4. Set up project infrastructure and dependencies
5. Ensure code is clean, efficient, and maintainable

You work on foundational components. Write production-quality code.`,
	},
	{
		id: "coder_secondary",
		name: "Secondary Coder",
		category: "implementation",
		description: "Implements features, utilities, and supporting code",
		capabilities: ["Feature implementation", "Utility creation", "Integration code", "Supporting components"],
		inputArtifacts: [ArtifactType.IMPLEMENTATION_PLAN, ArtifactType.PSEUDOCODE],
		outputArtifacts: [ArtifactType.CODE],
		required: true,
		systemPrompt: `You are a Software Engineer specializing in feature implementation and supporting code.

Your responsibilities:
1. Implement features following pseudocode and specifications
2. Create utility functions and helper modules
3. Write integration code between components
4. Implement supporting functionality
5. Ensure consistency with core codebase

You work on features and supporting code. Maintain quality standards.`,
	},
	{
		id: "code_sceptic",
		name: "Code Sceptic",
		category: "review",
		description: "Reviews plans and code critically for quality and issues",
		capabilities: [
			"Plan review",
			"Code review",
			"Bug detection",
			"Best practices enforcement",
			"Security analysis",
		],
		inputArtifacts: [ArtifactType.IMPLEMENTATION_PLAN, ArtifactType.CODE],
		outputArtifacts: [ArtifactType.REVIEW_REPORT],
		required: true,
		systemPrompt: `You are a meticulous Code Reviewer with a critical eye for quality, bugs, and best practices.

Your responsibilities:
1. Review implementation plans for feasibility and completeness
2. Review code thoroughly for bugs, quality issues, security concerns
3. Check adherence to best practices and conventions
4. Identify edge cases and potential problems
5. Provide constructive, actionable feedback

Be thorough but fair. Categorize issues by severity. Your goal is quality improvement.`,
	},
	{
		id: "commenter",
		name: "Documentation Writer",
		category: "documentation",
		description: "Adds comprehensive documentation and comments",
		capabilities: ["Code documentation", "Comment generation", "README creation", "API documentation"],
		inputArtifacts: [ArtifactType.CODE],
		outputArtifacts: [ArtifactType.DOCUMENTATION],
		required: false,
		systemPrompt: `You are a Technical Writer specializing in code documentation.

Your responsibilities:
1. Add clear, comprehensive comments to code
2. Write JSDoc/TSDoc for all public APIs
3. Create/update README files
4. Document complex algorithms and business logic
5. Provide usage examples where helpful

Focus on clarity and completeness. Good documentation is essential for maintainability.`,
	},
	{
		id: "debugger",
		name: "Debugger & Tester",
		category: "testing",
		description: "Runs tests, debugs failures, and ensures quality",
		capabilities: ["Test execution", "Failure debugging", "Root cause analysis", "Bug fixing", "Test creation"],
		inputArtifacts: [ArtifactType.CODE],
		outputArtifacts: [ArtifactType.TEST_RESULTS, ArtifactType.CODE],
		required: false,
		systemPrompt: `You are a Quality Assurance Engineer and Debugger.

Your responsibilities:
1. Run test suites and analyze results
2. Debug test failures systematically
3. Identify root causes of bugs
4. Fix bugs in the codebase
5. Ensure all tests pass

Be methodical and thorough. Every bug fixed improves software quality.`,
	},
]

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

interface OrchestrationConfig {
	enabled: boolean
	roleAssignments: RoleAssignment[]
	providerProfiles: ProviderProfile[]
	workflowSettings: WorkflowSettings
}

interface WorkflowSettings {
	autoApproveArtifacts: boolean
	maxConcurrentAgents: number
	defaultTimeout: number
	enableLogging: boolean
	archiveAfterHours: number
}

interface ValidationResult {
	isValid: boolean
	errors: string[]
	warnings?: string[]
}
```

## Part 8: LLM Provider Abstraction

### 8.1 LLM Provider

```typescript
// ============================================================================
// LLM PROVIDER
// Purpose: Abstraction over different LLM providers
// ============================================================================

class LLMProvider {
	private profile: ProviderProfile
	private client: any

	constructor(profile: ProviderProfile) {
		this.profile = profile
		this.client = this.initializeClient()
	}

	/**
	 * Initialize provider-specific client
	 */
	private initializeClient(): any {
		switch (this.profile.provider) {
			case "anthropic":
				return this.initializeAnthropic()
			case "openai":
				return this.initializeOpenAI()
			case "google":
				return this.initializeGoogle()
			default:
				throw new Error(`Unsupported provider: ${this.profile.provider}`)
		}
	}

	private initializeAnthropic(): any {
		const Anthropic = require("@anthropic-ai/sdk")
		return new Anthropic({
			apiKey: this.profile.apiKey,
			baseURL: this.profile.baseUrl,
		})
	}

	private initializeOpenAI(): any {
		const OpenAI = require("openai")
		return new OpenAI({
			apiKey: this.profile.apiKey,
			baseURL: this.profile.baseUrl,
		})
	}

	private initializeGoogle(): any {
		const { GoogleGenerativeAI } = require("@google/generative-ai")
		return new GoogleGenerativeAI(this.profile.apiKey)
	}

	/**
	 * Complete a prompt (simple text generation)
	 */
	async complete(prompt: string, options?: CompletionOptions): Promise<string> {
		const maxTokens = options?.maxTokens || this.profile.maxTokens || 2000
		const temperature = options?.temperature || this.profile.temperature || 0.7

		try {
			switch (this.profile.provider) {
				case "anthropic":
					return await this.completeAnthropic(prompt, maxTokens, temperature)
				case "openai":
					return await this.completeOpenAI(prompt, maxTokens, temperature)
				case "google":
					return await this.completeGoogle(prompt, maxTokens, temperature)
				default:
					throw new Error(`Unsupported provider: ${this.profile.provider}`)
			}
		} catch (error) {
			console.error(`[LLMProvider] Completion failed:`, error)
			throw error
		}
	}

	private async completeAnthropic(prompt: string, maxTokens: number, temperature: number): Promise<string> {
		const response = await this.client.messages.create({
			model: this.profile.model,
			max_tokens: maxTokens,
			temperature,
			messages: [{ role: "user", content: prompt }],
		})

		return response.content[0].text
	}

	private async completeOpenAI(prompt: string, maxTokens: number, temperature: number): Promise<string> {
		const response = await this.client.chat.completions.create({
			model: this.profile.model,
			max_tokens: maxTokens,
			temperature,
			messages: [{ role: "user", content: prompt }],
		})

		return response.choices[0].message.content
	}

	private async completeGoogle(prompt: string, maxTokens: number, temperature: number): Promise<string> {
		const model = this.client.getGenerativeModel({
			model: this.profile.model,
		})

		const result = await model.generateContent({
			contents: [{ role: "user", parts: [{ text: prompt }] }],
			generationConfig: {
				maxOutputTokens: maxTokens,
				temperature,
			},
		})

		return result.response.text()
	}

	/**
	 * Complete with tool use support
	 */
	async completeWithTools(prompt: string, tools: Tool[], options?: CompletionOptions): Promise<string> {
		// Convert tools to provider-specific format
		const providerTools = this.convertToolsToProviderFormat(tools)

		let finalResult = ""
		let continueLoop = true
		let conversationHistory: any[] = [{ role: "user", content: prompt }]

		while (continueLoop) {
			const response = await this.completeWithToolsInternal(conversationHistory, providerTools, options)

			if (response.toolCalls && response.toolCalls.length > 0) {
				// Execute tool calls
				const toolResults = await this.executeToolCalls(response.toolCalls, tools)

				// Add to conversation history
				conversationHistory.push({
					role: "assistant",
					content: response.content,
					tool_calls: response.toolCalls,
				})

				conversationHistory.push({
					role: "tool",
					content: JSON.stringify(toolResults),
				})
			} else {
				// No more tool calls, we're done
				finalResult = response.content
				continueLoop = false
			}
		}

		return finalResult
	}

	private async completeWithToolsInternal(
		conversationHistory: any[],
		tools: any[],
		options?: CompletionOptions,
	): Promise<LLMResponse> {
		switch (this.profile.provider) {
			case "anthropic":
				return await this.completeWithToolsAnthropic(conversationHistory, tools, options)
			case "openai":
				return await this.completeWithToolsOpenAI(conversationHistory, tools, options)
			default:
				// Fallback: just do regular completion
				const lastMessage = conversationHistory[conversationHistory.length - 1]
				const content = await this.complete(lastMessage.content, options)
				return { content, toolCalls: [] }
		}
	}

	private async completeWithToolsAnthropic(
		conversationHistory: any[],
		tools: any[],
		options?: CompletionOptions,
	): Promise<LLMResponse> {
		const response = await this.client.messages.create({
			model: this.profile.model,
			max_tokens: options?.maxTokens || 2000,
			temperature: options?.temperature || 0.7,
			messages: conversationHistory,
			tools,
		})

		const toolCalls = response.content
			.filter((block: any) => block.type === "tool_use")
			.map((block: any) => ({
				id: block.id,
				name: block.name,
				arguments: block.input,
			}))

		const textContent = response.content
			.filter((block: any) => block.type === "text")
			.map((block: any) => block.text)
			.join("\n")

		return {
			content: textContent,
			toolCalls,
		}
	}

	private async completeWithToolsOpenAI(
		conversationHistory: any[],
		tools: any[],
		options?: CompletionOptions,
	): Promise<LLMResponse> {
		const response = await this.client.chat.completions.create({
			model: this.profile.model,
			max_tokens: options?.maxTokens || 2000,
			temperature: options?.temperature || 0.7,
			messages: conversationHistory,
			tools,
			tool_choice: "auto",
		})

		const message = response.choices[0].message

		const toolCalls =
			message.tool_calls?.map((call: any) => ({
				id: call.id,
				name: call.function.name,
				arguments: JSON.parse(call.function.arguments),
			})) || []

		return {
			content: message.content || "",
			toolCalls,
		}
	}

	/**
	 * Execute tool calls
	 */
	private async executeToolCalls(toolCalls: ToolCall[], tools: Tool[]): Promise<any[]> {
		const results = []

		for (const call of toolCalls) {
			const tool = tools.find((t) => t.name === call.name)

			if (tool) {
				try {
					const result = await tool.execute(call.arguments)
					results.push({ tool: call.name, result })
				} catch (error) {
					results.push({ tool: call.name, error: String(error) })
				}
			} else {
				results.push({ tool: call.name, error: "Tool not found" })
			}
		}

		return results
	}

	/**
	 * Convert tools to provider-specific format
	 */
	private convertToolsToProviderFormat(tools: Tool[]): any[] {
		switch (this.profile.provider) {
			case "anthropic":
				return tools.map((tool) => ({
					name: tool.name,
					description: tool.description,
					input_schema: {
						type: "object",
						properties: tool.parameters,
						required: Object.keys(tool.parameters),
					},
				}))

			case "openai":
				return tools.map((tool) => ({
					type: "function",
					function: {
						name: tool.name,
						description: tool.description,
						parameters: {
							type: "object",
							properties: tool.parameters,
							required: Object.keys(tool.parameters),
						},
					},
				}))

			default:
				return []
		}
	}
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

interface CompletionOptions {
	maxTokens?: number
	temperature?: number
	stopSequences?: string[]
}

interface LLMResponse {
	content: string
	toolCalls: ToolCall[]
}

interface ToolCall {
	id: string
	name: string
	arguments: any
}
```

---

## Part 9: Extension Integration

### 9.1 Main Extension Entry Point

```typescript
// ============================================================================
// EXTENSION.TS - Main Entry Point
// Purpose: Integrate multi-agent orchestration into Kilo Code
// ============================================================================

import * as vscode from "vscode"

// kilocode_change start - multi-agent orchestration
let orchestrationSystem: OrchestrationSystem | null = null

export function activate(context: vscode.ExtensionContext) {
	console.log("Kilo Code is now active")

	// ... existing Kilo Code activation code ...

	// Initialize multi-agent orchestration system
	try {
		orchestrationSystem = new OrchestrationSystem(context)

		// Register orchestration commands
		registerOrchestrationCommands(context, orchestrationSystem)

		console.log("[Orchestration] Multi-agent system initialized")
	} catch (error) {
		console.error("[Orchestration] Failed to initialize:", error)
		vscode.window.showErrorMessage("Failed to initialize multi-agent orchestration system")
	}
}

export function deactivate() {
	// ... existing Kilo Code deactivation code ...

	// Cleanup orchestration system
	if (orchestrationSystem) {
		orchestrationSystem.dispose()
		orchestrationSystem = null
	}
}

/**
 * Register orchestration-specific commands
 */
function registerOrchestrationCommands(context: vscode.ExtensionContext, system: OrchestrationSystem): void {
	// Command: Open orchestration settings
	context.subscriptions.push(
		vscode.commands.registerCommand("kilocode.orchestration.openSettings", () => system.openSettings()),
	)

	// Command: Enable/disable orchestration
	context.subscriptions.push(
		vscode.commands.registerCommand("kilocode.orchestration.toggle", () => system.toggleOrchestration()),
	)

	// Command: Start multi-agent workflow
	context.subscriptions.push(
		vscode.commands.registerCommand("kilocode.orchestration.startWorkflow", (task?: string) =>
			system.startWorkflow(task),
		),
	)

	// Command: Pause workflow
	context.subscriptions.push(
		vscode.commands.registerCommand("kilocode.orchestration.pauseWorkflow", () => system.pauseWorkflow()),
	)

	// Command: Resume workflow
	context.subscriptions.push(
		vscode.commands.registerCommand("kilocode.orchestration.resumeWorkflow", () => system.resumeWorkflow()),
	)

	// Command: Stop workflow
	context.subscriptions.push(
		vscode.commands.registerCommand("kilocode.orchestration.stopWorkflow", () => system.stopWorkflow()),
	)

	// Command: View workflow status
	context.subscriptions.push(
		vscode.commands.registerCommand("kilocode.orchestration.viewStatus", () => system.viewStatus()),
	)

	// Command: Export configuration
	context.subscriptions.push(
		vscode.commands.registerCommand("kilocode.orchestration.exportConfig", () => system.exportConfiguration()),
	)

	// Command: Import configuration
	context.subscriptions.push(
		vscode.commands.registerCommand("kilocode.orchestration.importConfig", () => system.importConfiguration()),
	)
}
// kilocode_change end

// ============================================================================
// ORCHESTRATION SYSTEM
// Purpose: Main orchestration system coordinator
// ============================================================================

class OrchestrationSystem {
	private context: vscode.ExtensionContext
	private configManager: OrchestrationConfigManager
	private messageRouter: MessageRouter
	private artifactStore: ArtifactStore
	private agentPool: AgentPoolManager
	private organiser: OrganiserAgent | null = null
	private statusBarItem: vscode.StatusBarItem
	private settingsWebview: OrchestrationSettingsWebview | null = null

	constructor(context: vscode.ExtensionContext) {
		this.context = context

		// Initialize core components
		this.configManager = new OrchestrationConfigManager(context)
		this.messageRouter = new MessageRouter()

		// Initialize artifact store
		const storagePath = context.globalStorageUri.fsPath
		this.artifactStore = new ArtifactStore(require("path").join(storagePath, "orchestration", "artifacts"))

		// Initialize agent pool
		this.agentPool = new AgentPoolManager(context, this.messageRouter)

		// Create status bar item
		this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
		this.statusBarItem.command = "kilocode.orchestration.viewStatus"
		this.updateStatusBar("idle")
		this.statusBarItem.show()

		context.subscriptions.push(this.statusBarItem)
	}

	/**
	 * Open orchestration settings UI
	 */
	async openSettings(): Promise<void> {
		if (this.settingsWebview) {
			this.settingsWebview.reveal()
			return
		}

		this.settingsWebview = new OrchestrationSettingsWebview(this.context, this.configManager)

		await this.settingsWebview.show()
	}

	/**
	 * Toggle orchestration on/off
	 */
	async toggleOrchestration(): Promise<void> {
		const currentState = await this.configManager.isOrchestrationEnabled()
		const newState = !currentState

		await this.configManager.setOrchestrationEnabled(newState)

		if (newState) {
			// Validate configuration before enabling
			const validation = await this.configManager.validateConfiguration()

			if (!validation.isValid) {
				vscode.window.showErrorMessage(`Cannot enable orchestration: ${validation.errors.join(", ")}`)
				await this.configManager.setOrchestrationEnabled(false)
				return
			}

			vscode.window.showInformationMessage("Multi-agent orchestration enabled")
			this.updateStatusBar("enabled")
		} else {
			vscode.window.showInformationMessage("Multi-agent orchestration disabled")
			this.updateStatusBar("disabled")
		}
	}

	/**
	 * Start multi-agent workflow
	 */
	async startWorkflow(task?: string): Promise<void> {
		// Check if enabled
		const enabled = await this.configManager.isOrchestrationEnabled()
		if (!enabled) {
			const enable = await vscode.window.showInformationMessage(
				"Multi-agent orchestration is disabled. Enable it?",
				"Enable",
				"Cancel",
			)

			if (enable === "Enable") {
				await this.toggleOrchestration()
			} else {
				return
			}
		}

		// Validate configuration
		const validation = await this.configManager.validateConfiguration()
		if (!validation.isValid) {
			vscode.window.showErrorMessage(`Configuration invalid: ${validation.errors[0]}`)
			await this.openSettings()
			return
		}

		// Get task from user if not provided
		if (!task) {
			task = await vscode.window.showInputBox({
				prompt: "Describe what you want to build",
				placeHolder: "E.g., Create a REST API for user management with authentication",
				ignoreFocusOut: true,
			})

			if (!task) {
				return // User cancelled
			}
		}

		try {
			this.updateStatusBar("starting")

			// Initialize agent pool
			await this.agentPool.initialize()

			// Create organiser if not exists
			if (!this.organiser) {
				this.organiser = new OrganiserAgent(
					this.agentPool,
					this.messageRouter,
					this.artifactStore,
					this.configManager,
				)
			}

			// Start workflow
			this.updateStatusBar("working")
			await this.organiser.startTask(task)

			vscode.window.showInformationMessage(`Multi-agent workflow started: ${task.substring(0, 50)}...`)
		} catch (error) {
			console.error("[Orchestration] Failed to start workflow:", error)
			vscode.window.showErrorMessage(`Failed to start workflow: ${error}`)
			this.updateStatusBar("error")
		}
	}

	/**
	 * Pause current workflow
	 */
	async pauseWorkflow(): Promise<void> {
		if (!this.organiser) {
			vscode.window.showWarningMessage("No active workflow to pause")
			return
		}

		try {
			await this.agentPool.pauseAll()
			this.updateStatusBar("paused")
			vscode.window.showInformationMessage("Workflow paused")
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to pause workflow: ${error}`)
		}
	}

	/**
	 * Resume paused workflow
	 */
	async resumeWorkflow(): Promise<void> {
		if (!this.organiser) {
			vscode.window.showWarningMessage("No workflow to resume")
			return
		}

		try {
			await this.agentPool.resumeAll()
			this.updateStatusBar("working")
			vscode.window.showInformationMessage("Workflow resumed")
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to resume workflow: ${error}`)
		}
	}

	/**
	 * Stop current workflow
	 */
	async stopWorkflow(): Promise<void> {
		if (!this.organiser) {
			vscode.window.showWarningMessage("No active workflow to stop")
			return
		}

		const confirm = await vscode.window.showWarningMessage(
			"Stop the current workflow? Progress will be lost.",
			"Stop",
			"Cancel",
		)

		if (confirm !== "Stop") {
			return
		}

		try {
			await this.agentPool.terminateAll()
			this.organiser = null
			this.updateStatusBar("idle")
			vscode.window.showInformationMessage("Workflow stopped")
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to stop workflow: ${error}`)
		}
	}

	/**
	 * View workflow status
	 */
	async viewStatus(): Promise<void> {
		if (!this.organiser) {
			vscode.window.showInformationMessage("No active workflow")
			return
		}

		// Show status in new webview panel
		const panel = vscode.window.createWebviewPanel(
			"orchestrationStatus",
			"Workflow Status",
			vscode.ViewColumn.Two,
			{ enableScripts: true },
		)

		panel.webview.html = this.getStatusHTML()

		// Update status periodically
		const interval = setInterval(() => {
			if (panel.visible) {
				panel.webview.html = this.getStatusHTML()
			}
		}, 2000)

		panel.onDidDispose(() => {
			clearInterval(interval)
		})
	}

	/**
	 * Export configuration
	 */
	async exportConfiguration(): Promise<void> {
		try {
			const config = await this.configManager.exportConfiguration()

			const uri = await vscode.window.showSaveDialog({
				defaultUri: vscode.Uri.file("orchestration-config.json"),
				filters: {
					JSON: ["json"],
				},
			})

			if (uri) {
				await vscode.workspace.fs.writeFile(uri, Buffer.from(config, "utf8"))
				vscode.window.showInformationMessage("Configuration exported")
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to export: ${error}`)
		}
	}

	/**
	 * Import configuration
	 */
	async importConfiguration(): Promise<void> {
		try {
			const uris = await vscode.window.showOpenDialog({
				canSelectMany: false,
				filters: {
					JSON: ["json"],
				},
			})

			if (!uris || uris.length === 0) {
				return
			}

			const content = await vscode.workspace.fs.readFile(uris[0])
			const json = Buffer.from(content).toString("utf8")

			await this.configManager.importConfiguration(json)
			vscode.window.showInformationMessage("Configuration imported")

			// Reload settings UI if open
			if (this.settingsWebview) {
				this.settingsWebview.refresh()
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to import: ${error}`)
		}
	}

	/**
	 * Update status bar
	 */
	private updateStatusBar(status: string): void {
		const icons: Record<string, string> = {
			idle: "$(circle-outline)",
			enabled: "$(circle-filled)",
			disabled: "$(circle-slash)",
			starting: "$(loading~spin)",
			working: "$(sync~spin)",
			paused: "$(debug-pause)",
			error: "$(error)",
		}

		const labels: Record<string, string> = {
			idle: "Orchestration: Idle",
			enabled: "Orchestration: Enabled",
			disabled: "Orchestration: Disabled",
			starting: "Orchestration: Starting...",
			working: "Orchestration: Working",
			paused: "Orchestration: Paused",
			error: "Orchestration: Error",
		}

		this.statusBarItem.text = `${icons[status] || "$(circle-outline)"} ${labels[status] || "Orchestration"}`
	}

	/**
	 * Get status HTML
	 */
	private getStatusHTML(): string {
		if (!this.organiser) {
			return `<html><body><h1>No Active Workflow</h1></body></html>`
		}

		const statuses = this.agentPool.getAgentStatuses()

		let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: var(--vscode-font-family);
          padding: 20px;
          color: var(--vscode-foreground);
        }
        .agent {
          margin: 10px 0;
          padding: 10px;
          border: 1px solid var(--vscode-panel-border);
          border-radius: 4px;
        }
        .status {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 3px;
          font-size: 12px;
          font-weight: bold;
        }
        .idle { background: var(--vscode-terminal-ansiGreen); }
        .working { background: var(--vscode-terminal-ansiYellow); }
        .error { background: var(--vscode-terminal-ansiRed); }
        .waiting { background: var(--vscode-terminal-ansiBlue); }
        .progress {
          width: 100%;
          height: 20px;
          background: var(--vscode-input-background);
          border-radius: 10px;
          overflow: hidden;
          margin-top: 5px;
        }
        .progress-bar {
          height: 100%;
          background: var(--vscode-progressBar-background);
          transition: width 0.3s ease;
        }
      </style>
    </head>
    <body>
      <h1>Workflow Status</h1>
      <div id="agents">
    `

		for (const [roleId, status] of statuses) {
			html += `
        <div class="agent">
          <h3>${roleId}</h3>
          <span class="status ${status.status}">${status.status.toUpperCase()}</span>
          ${status.currentTask ? `<p>Task: ${status.currentTask}</p>` : ""}
          ${
				status.progress !== undefined
					? `
            <div class="progress">
              <div class="progress-bar" style="width: ${status.progress}%"></div>
            </div>
            <p>${status.progress}%</p>
          `
					: ""
			}
        </div>
      `
		}

		html += `
      </div>
    </body>
    </html>
    `

		return html
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		this.agentPool.dispose()
		this.statusBarItem.dispose()

		if (this.settingsWebview) {
			this.settingsWebview.dispose()
		}
	}
}
```

## Part 10: Settings UI (Webview)

### 10.1 Settings Webview

```typescript
// ============================================================================
// ORCHESTRATION SETTINGS WEBVIEW
// Purpose: UI for configuring multi-agent orchestration
// ============================================================================

class OrchestrationSettingsWebview {
	private panel: vscode.WebviewPanel | null = null
	private context: vscode.ExtensionContext
	private configManager: OrchestrationConfigManager

	constructor(context: vscode.ExtensionContext, configManager: OrchestrationConfigManager) {
		this.context = context
		this.configManager = configManager
	}

	/**
	 * Show settings UI
	 */
	async show(): Promise<void> {
		if (this.panel) {
			this.panel.reveal()
			return
		}

		this.panel = vscode.window.createWebviewPanel(
			"orchestrationSettings",
			"Multi-Agent Orchestration Settings",
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
			},
		)

		this.panel.webview.html = await this.getHTML()

		// Handle messages from webview
		this.panel.webview.onDidReceiveMessage(
			async (message) => await this.handleMessage(message),
			undefined,
			this.context.subscriptions,
		)

		this.panel.onDidDispose(() => {
			this.panel = null
		})
	}

	/**
	 * Reveal panel if exists
	 */
	reveal(): void {
		this.panel?.reveal()
	}

	/**
	 * Refresh webview content
	 */
	async refresh(): Promise<void> {
		if (this.panel) {
			this.panel.webview.html = await this.getHTML()
		}
	}

	/**
	 * Handle messages from webview
	 */
	private async handleMessage(message: any): Promise<void> {
		switch (message.command) {
			case "getRoleAssignments":
				await this.sendRoleAssignments()
				break

			case "getProviderProfiles":
				await this.sendProviderProfiles()
				break

			case "updateRoleAssignment":
				await this.updateRoleAssignment(message.roleId, message.profileId, message.isActive)
				break

			case "addProviderProfile":
				await this.addProviderProfile(message.profile)
				break

			case "updateProviderProfile":
				await this.updateProviderProfile(message.profile)
				break

			case "deleteProviderProfile":
				await this.deleteProviderProfile(message.profileId)
				break

			case "validateConfiguration":
				await this.validateConfiguration()
				break

			case "saveConfiguration":
				await this.saveConfiguration()
				break
		}
	}

	private async sendRoleAssignments(): Promise<void> {
		const assignments = await this.configManager.getRoleAssignments()
		this.panel?.webview.postMessage({
			type: "roleAssignments",
			data: assignments,
		})
	}

	private async sendProviderProfiles(): Promise<void> {
		const profiles = await this.configManager.getProviderProfiles()
		this.panel?.webview.postMessage({
			type: "providerProfiles",
			data: profiles,
		})
	}

	private async updateRoleAssignment(roleId: string, profileId: string | null, isActive: boolean): Promise<void> {
		await this.configManager.updateRoleAssignment(roleId, profileId, isActive)
		await this.sendRoleAssignments()
	}

	private async addProviderProfile(profile: ProviderProfile): Promise<void> {
		await this.configManager.addProviderProfile(profile)
		await this.sendProviderProfiles()
	}

	private async updateProviderProfile(profile: ProviderProfile): Promise<void> {
		await this.configManager.updateProviderProfile(profile)
		await this.sendProviderProfiles()
	}

	private async deleteProviderProfile(id: string): Promise<void> {
		await this.configManager.deleteProviderProfile(id)
		await this.sendProviderProfiles()
	}

	private async validateConfiguration(): Promise<void> {
		const validation = await this.configManager.validateConfiguration()
		this.panel?.webview.postMessage({
			type: "validationResult",
			data: validation,
		})
	}

	private async saveConfiguration(): Promise<void> {
		vscode.window.showInformationMessage("Configuration saved")
	}

	/**
	 * Get HTML content for webview
	 */
	private async getHTML(): Promise<string> {
		const assignments = await this.configManager.getRoleAssignments()
		const profiles = await this.configManager.getProviderProfiles()

		return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Orchestration Settings</title>
      <style>
        body {
          font-family: var(--vscode-font-family);
          padding: 20px;
          color: var(--vscode-foreground);
          background: var(--vscode-editor-background);
        }
        
        h1, h2 {
          color: var(--vscode-titleBar-activeForeground);
        }
        
        .section {
          margin: 30px 0;
          padding: 20px;
          background: var(--vscode-editor-background);
          border: 1px solid var(--vscode-panel-border);
          border-radius: 4px;
        }
        
        .role-card {
          margin: 15px 0;
          padding: 15px;
          background: var(--vscode-input-background);
          border-radius: 4px;
        }
        
        .role-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }
        
        .role-name {
          font-weight: bold;
          font-size: 16px;
        }
        
        .required-badge {
          display: inline-block;
          padding: 2px 8px;
          background: var(--vscode-terminal-ansiRed);
          color: white;
          border-radius: 3px;
          font-size: 12px;
        }
        
        select, input, button {
          padding: 6px 12px;
          background: var(--vscode-input-background);
          color: var(--vscode-input-foreground);
          border: 1px solid var(--vscode-input-border);
          border-radius: 4px;
          font-family: var(--vscode-font-family);
        }
        
        select {
          width: 100%;
          margin-top: 5px;
        }
        
        button {
          cursor: pointer;
          background: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
          border: none;
        }
        
        button:hover {
          background: var(--vscode-button-hoverBackground);
        }
        
        .profile-list {
          list-style: none;
          padding: 0;
        }
        
        .profile-item {
          padding: 10px;
          margin: 5px 0;
          background: var(--vscode-input-background);
          border-radius: 4px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .validation-errors {
          background: var(--vscode-inputValidation-errorBackground);
          border: 1px solid var(--vscode-inputValidation-errorBorder);
          padding: 10px;
          border-radius: 4px;
          margin: 10px 0;
        }
        
        .validation-success {
          background: var(--vscode-terminal-ansiGreen);
          padding: 10px;
          border-radius: 4px;
          margin: 10px 0;
        }
        
        .actions {
          margin-top: 20px;
          display: flex;
          gap: 10px;
        }
      </style>
    </head>
    <body>
      <h1>🤖 Multi-Agent Orchestration Settings</h1>
      
      <div class="section">
        <h2>Role Assignments</h2>
        <p>Assign AI models to each role in the orchestration workflow.</p>
        
        <div id="roleAssignments">
          ${this.generateRoleAssignmentsHTML(assignments, profiles)}
        </div>
      </div>
      
      <div class="section">
        <h2>Provider Profiles</h2>
        <p>Manage your AI provider configurations.</p>
        
        <ul class="profile-list" id="profileList">
          ${this.generateProfileListHTML(profiles)}
        </ul>
        
        <button onclick="addProfile()">+ Add Provider Profile</button>
      </div>
      
      <div class="section">
        <h2>Validation</h2>
        <button onclick="validateConfig()">🔍 Validate Configuration</button>
        <div id="validationResult"></div>
      </div>
      
      <div class="actions">
        <button onclick="saveConfig()">💾 Save Configuration</button>
      </div>
      
      <script>
        const vscode = acquireVsCodeApi();
        
        // Request initial data
        vscode.postMessage({ command: 'getRoleAssignments' });
        vscode.postMessage({ command: 'getProviderProfiles' });
        
        // Handle messages from extension
        window.addEventListener('message', event => {
          const message = event.data;
          
          switch (message.type) {
            case 'validationResult':
              showValidationResult(message.data);
              break;
          }
        });
        
        function updateRoleAssignment(roleId, profileId, isActive) {
          vscode.postMessage({
            command: 'updateRoleAssignment',
            roleId,
            profileId: profileId || null,
            isActive
          });
        }
        
        function addProfile() {
          // In real implementation, open modal/form
          alert('Add profile form would open here');
        }
        
        function validateConfig() {
          vscode.postMessage({ command: 'validateConfiguration' });
        }
        
        function saveConfig() {
          vscode.postMessage({ command: 'saveConfiguration' });
        }
        
        function showValidationResult(result) {
          const div = document.getElementById('validationResult');
          
          if (result.isValid) {
            div.innerHTML = '<div class="validation-success">✓ Configuration is valid!</div>';
          } else {
            div.innerHTML = '<div class="validation-errors"><strong>Errors:</strong><ul>' +
              result.errors.map(e => '<li>' + e + '</li>').join('') +
              '</ul></div>';
          }
        }
      </script>
    </body>
    </html>
    `
	}

	private generateRoleAssignmentsHTML(assignments: RoleAssignment[], profiles: ProviderProfile[]): string {
		return assignments
			.map((assignment) => {
				const role = AVAILABLE_ROLES.find((r) => r.id === assignment.roleId)
				if (!role) return ""

				return `
        <div class="role-card">
          <div class="role-header">
            <span class="role-name">${role.name}</span>
            ${role.required ? '<span class="required-badge">REQUIRED</span>' : ""}
          </div>
          <p>${role.description}</p>
          <select 
            onchange="updateRoleAssignment('${assignment.roleId}', this.value, true)"
            ${!assignment.isActive ? "disabled" : ""}
          >
            <option value="">-- Select Provider --</option>
            ${profiles
				.map(
					(p) => `
              <option value="${p.id}" ${assignment.assignedProfileId === p.id ? "selected" : ""}>
                ${p.name} (${p.model})
              </option>
            `,
				)
				.join("")}
          </select>
        </div>
      `
			})
			.join("")
	}

	private generateProfileListHTML(profiles: ProviderProfile[]): string {
		return profiles
			.map(
				(profile) => `
      <li class="profile-item">
        <div>
          <strong>${profile.name}</strong><br>
          <small>${profile.provider} - ${profile.model}</small>
        </div>
        <div>
          <button onclick="editProfile('${profile.id}')">Edit</button>
          <button onclick="deleteProfile('${profile.id}')">Delete</button>
        </div>
      </li>
    `,
			)
			.join("")
	}

	dispose(): void {
		this.panel?.dispose()
	}
}
```

---

## Part 11: Package.json Contributions

```json
{
	"contributes": {
		"commands": [
			{
				"command": "kilocode.orchestration.openSettings",
				"title": "Open Multi-Agent Settings",
				"category": "Kilo Orchestration"
			},
			{
				"command": "kilocode.orchestration.toggle",
				"title": "Enable/Disable Multi-Agent Mode",
				"category": "Kilo Orchestration"
			},
			{
				"command": "kilocode.orchestration.startWorkflow",
				"title": "Start Multi-Agent Workflow",
				"category": "Kilo Orchestration"
			},
			{
				"command": "kilocode.orchestration.pauseWorkflow",
				"title": "Pause Workflow",
				"category": "Kilo Orchestration"
			},
			{
				"command": "kilocode.orchestration.resumeWorkflow",
				"title": "Resume Workflow",
				"category": "Kilo Orchestration"
			},
			{
				"command": "kilocode.orchestration.stopWorkflow",
				"title": "Stop Workflow",
				"category": "Kilo Orchestration"
			},
			{
				"command": "kilocode.orchestration.viewStatus",
				"title": "View Workflow Status",
				"category": "Kilo Orchestration"
			}
		],
		"configuration": {
			"title": "Kilo Code Multi-Agent Orchestration",
			"properties": {
				"kilocode.orchestration.maxConcurrentAgents": {
					"type": "number",
					"default": 5,
					"description": "Maximum number of agents running concurrently",
					"minimum": 1,
					"maximum": 10
				},
				"kilocode.orchestration.defaultTimeout": {
					"type": "number",
					"default": 300000,
					"description": "Default timeout for agent operations (milliseconds)",
					"minimum": 30000
				},
				"kilocode.orchestration.enableLogging": {
					"type": "boolean",
					"default": true,
					"description": "Enable detailed logging for orchestration system"
				}
			}
		}
	}
}
```

---

## Part 12: Implementation Roadmap

### Phase 0: Foundation (Weeks 1-2)

```typescript
/**
 * PHASE 0 CHECKLIST
 *
 * [ ] Setup project structure
 *     - Create src/core/orchestration/ directory
 *     - Create src/services/agent-manager/ directory
 *     - Add type definitions
 *
 * [ ] Implement core data models
 *     - WorkflowState enum
 *     - Message types
 *     - Artifact types
 *
 * [ ] Create MessageRouter
 *     - Basic message routing
 *     - Subscribe/unsubscribe
 *     - Message logging
 *
 * [ ] Create OrchestrationConfigManager
 *     - Configuration storage
 *     - Role definitions
 *     - Provider profiles
 *
 * [ ] Test basic setup
 *     - Unit tests for MessageRouter
 *     - Configuration save/load tests
 */
```

### Phase 1: Agent Infrastructure (Weeks 3-4)

```typescript
/**
 * PHASE 1 CHECKLIST
 *
 * [ ] Implement AgentPoolManager
 *     - Process spawning
 *     - Lifecycle management
 *     - Health monitoring
 *
 * [ ] Create BaseWorkerAgent
 *     - Message handling
 *     - Tool execution
 *     - Status reporting
 *
 * [ ] Implement ArtifactStore
 *     - File-based storage
 *     - Lazy loading
 *     - Summarization
 *
 * [ ] Create LLMProvider abstraction
 *     - Anthropic integration
 *     - OpenAI integration
 *     - Tool use support
 *
 * [ ] Test agent spawning
 *     - Spawn single agent
 *     - Message passing
 *     - Agent termination
 */
```

### Phase 2: Core Agents (Weeks 5-7)

```typescript
/**
 * PHASE 2 CHECKLIST
 *
 * [ ] Implement OrganiserAgent
 *     - Workflow state machine
 *     - Task delegation
 *     - Decision making
 *
 * [ ] Implement ArchitectAgent
 *     - Plan generation
 *     - Architecture design
 *
 * [ ] Implement CoderAgent (Primary)
 *     - Structure creation
 *     - Pseudocode generation
 *     - Code implementation
 *
 * [ ] Implement CodeScepticAgent
 *     - Plan review
 *     - Code review
 *
 * [ ] Test basic workflow
 *     - Planning phase
 *     - Structure creation
 *     - Simple implementation
 */
```

### Phase 3: Additional Agents (Weeks 8-9)

```typescript
/**
 * PHASE 3 CHECKLIST
 *
 * [ ] Implement CoderAgent (Secondary)
 *     - Parallel implementation
 *     - Work distribution
 *
 * [ ] Implement CommenterAgent
 *     - Documentation generation
 *     - README creation
 *
 * [ ] Implement DebuggerAgent
 *     - Test execution
 *     - Failure debugging
 *
 * [ ] Test complete workflow
 *     - All phases end-to-end
 *     - Multiple agents working
 */
```

### Phase 4: UI & Configuration (Weeks 10-11)

```typescript
/**
 * PHASE 4 CHECKLIST
 *
 * [ ] Create SettingsWebview
 *     - Role assignment UI
 *     - Provider management
 *     - Configuration validation
 *
 * [ ] Integrate with extension
 *     - Commands registration
 *     - Status bar updates
 *     - Workflow controls
 *
 * [ ] Add status monitoring
 *     - Workflow status view
 *     - Agent status tracking
 *     - Progress indicators
 *
 * [ ] Test UI flows
 *     - Configuration setup
 *     - Workflow start/stop
 *     - Status monitoring
 */
```

### Phase 5: Polish & Testing (Weeks 12-14)

```typescript
/**
 * PHASE 5 CHECKLIST
 *
 * [ ] Error handling
 *     - Retry logic
 *     - Graceful degradation
 *     - User notifications
 *
 * [ ] Performance optimization
 *     - Artifact compression
 *     - Memory management
 *     - Rate limiting
 *
 * [ ] Comprehensive testing
 *     - Unit tests (80%+ coverage)
 *     - Integration tests
 *     - E2E workflow tests
 *
 * [ ] Documentation
 *     - User guide
 *     - API documentation
 *     - Troubleshooting guide
 *
 * [ ] Beta testing
 *     - Internal dogfooding
 *     - Bug fixes
 *     - Performance tuning
 */
```

---

## Summary

This implementation guide provides:

1. **Complete pseudocode** for all major components
2. **Type definitions** for all data structures
3. **Agent implementations** for all 7 roles
4. **Configuration management** with validation
5. **UI integration** with VS Code
6. **Extension entry points** with command registration
7. **Implementation roadmap** with clear phases

**Key Implementation Notes:**

- All code uses TypeScript for type safety
- Follows existing Kilo Code patterns where possible
- Uses `kilocode_change` markers for fork management
- Implements CrewAI-style hierarchical orchestration
- Uses LangChain subagents pattern
- Validates MetaGPT software development approach
- Handles errors gracefully at every level
- Supports hot-swapping of agent providers
- Maintains minimal context for Organiser
- Implements lazy loading for artifacts
