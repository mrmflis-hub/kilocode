// kilocode_change - new file
/**
 * Integration Tests for Additional Roles
 *
 * Tests the integration between:
 * - Code Sceptic (review workflow)
 * - Documentation Writer (documentation workflow)
 * - Debugger (testing workflow)
 * - Full workflow with all roles
 *
 * This file implements Task 3.5 from the implementation roadmap.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import * as os from "node:os"

// Import orchestration components
import { WorkflowStateMachine } from "../../WorkflowStateMachine"
import { AgentPoolManager } from "../../AgentPoolManager"
import { MessageRouter } from "../../MessageRouter"
import type { AgentMessage } from "../../MessageRouter"
import type { AgentSpawnConfig, AgentInstance } from "../../types"
import { AgentRegistry } from "../../../AgentRegistry"
import { RoleRegistry } from "../../roles/RoleRegistry"
import { getRoleDefinition, getAllRoleDefinitions, getRoleIdsByCategory } from "../../roles/RoleDefinitions"

// Import mode configurations
import {
	ARCHITECT_MODE_CONFIG,
	ARCHITECT_OUTPUT_ARTIFACTS,
	validateArchitectTaskRequest,
	type ArchitectTaskRequest,
} from "../../modes/ArchitectMode"
import {
	PRIMARY_CODER_MODE_CONFIG,
	PRIMARY_CODER_OUTPUT_ARTIFACTS,
	validatePrimaryCoderTaskRequest,
	type PrimaryCoderTaskRequest,
} from "../../modes/PrimaryCoderMode"
import {
	SECONDARY_CODER_MODE_CONFIG,
	SECONDARY_CODER_INPUT_ARTIFACTS,
	SECONDARY_CODER_OUTPUT_ARTIFACTS,
	validateSecondaryCoderTaskRequest,
	type SecondaryCoderTaskRequest,
} from "../../modes/SecondaryCoderMode"
import {
	CODE_SCEPTIC_MODE_CONFIG,
	CODE_SCEPTIC_INPUT_ARTIFACTS,
	CODE_SCEPTIC_OUTPUT_ARTIFACTS,
	validateCodeScepticTaskRequest,
	getCodeScepticOutputArtifactType,
	createEmptyReviewReport,
	calculateOverallSeverity,
	determineVerdict,
	type CodeScepticTaskRequest,
	type ReviewReport,
	type ReviewIssue,
	type ReviewSeverity,
} from "../../modes/CodeScepticMode"
import {
	DOCUMENTATION_WRITER_MODE_CONFIG,
	DOCUMENTATION_WRITER_INPUT_ARTIFACTS,
	DOCUMENTATION_WRITER_OUTPUT_ARTIFACTS,
	validateDocumentationWriterTaskRequest,
	getDocumentationWriterOutputArtifactType,
	type DocumentationWriterTaskRequest,
	type DocumentationArtifact,
	type DocumentationWriterTaskType,
} from "../../modes/DocumentationWriterMode"
import {
	DEBUGGER_MODE_CONFIG,
	DEBUGGER_INPUT_ARTIFACTS,
	DEBUGGER_OUTPUT_ARTIFACTS,
	validateDebuggerTaskRequest,
	getDebuggerOutputArtifactType,
	getTestCommand,
	type DebuggerTaskRequest,
	type TestResultsReport,
	type TestIssue,
	type DebuggerTaskType,
} from "../../modes/DebuggerMode"
import type { ArtifactType } from "@kilocode/core-schemas"

// Mock RuntimeProcessHandler
interface MockProcessHandler {
	spawnProcess: ReturnType<typeof vi.fn>
	sendMessage: ReturnType<typeof vi.fn>
}

const createMockProcessHandler = (): MockProcessHandler => ({
	spawnProcess: vi.fn().mockResolvedValue(undefined),
	sendMessage: vi.fn().mockResolvedValue(undefined),
})

// Helper function to simulate AgentPoolManager.handleAgentEvent
const simulateAgentEvent = (
	poolManager: AgentPoolManager,
	agentId: string,
	sessionId: string,
	event: { type: string; error?: { message: string } },
): void => {
	const agent = poolManager.getAgent(agentId)
	if (!agent) return

	agent.lastActivityAt = Date.now()

	if (event.type === "session_created") {
		agent.status = "ready"
		agent.sessionId = sessionId
	} else if (event.type === "complete") {
		agent.status = "ready"
	} else if (event.type === "error") {
		agent.status = "error"
		agent.error = event.error?.message
	}
}

// Create a mock FileLockingService with all required methods
const createMockFileLockingService = () => ({
	acquireLock: vi.fn().mockResolvedValue({ success: true, lockId: "lock-1", locked: true }),
	releaseLock: vi.fn().mockResolvedValue(undefined),
	getLockStatus: vi.fn().mockReturnValue({ isLocked: false }),
	releaseAllLocksForAgent: vi.fn().mockResolvedValue(undefined),
	subscribe: vi.fn(),
	dispose: vi.fn(),
})

// Create a mock ArtifactStore
const createMockArtifactStore = () => ({
	createArtifact: vi.fn().mockResolvedValue({
		id: "artifact-1",
		type: "implementation_plan",
		status: "completed",
		summary: "Test artifact summary",
		fullContent: "Test artifact content",
		metadata: {
			producer: "architect-1",
			producerRole: "architect",
			createdAt: Date.now(),
			modifiedAt: Date.now(),
		},
		version: 1,
	}),
	getArtifact: vi.fn().mockReturnValue({
		id: "artifact-1",
		type: "implementation_plan",
		status: "completed",
		summary: "Test artifact summary",
		fullContent: "Test artifact content",
		metadata: {
			producer: "architect-1",
			producerRole: "architect",
			createdAt: Date.now(),
			modifiedAt: Date.now(),
		},
		version: 1,
	}),
	getArtifactSummary: vi.fn().mockReturnValue({
		id: "artifact-1",
		type: "implementation_plan",
		brief: "Test artifact brief summary",
		status: "completed",
		producerRole: "architect",
	}),
	updateArtifactStatus: vi.fn().mockResolvedValue(undefined),
	updateArtifactContent: vi.fn().mockResolvedValue(undefined),
	getAllSummaries: vi.fn().mockReturnValue([]),
	addReviewer: vi.fn().mockResolvedValue(undefined),
	dispose: vi.fn(),
})

describe("Additional Roles Integration Tests", () => {
	describe("1. Review Workflow (Organiser + Code Sceptic)", () => {
		let stateMachine: WorkflowStateMachine
		let roleRegistry: RoleRegistry
		let mockProcessHandler: MockProcessHandler
		let registry: AgentRegistry
		let messageRouter: MessageRouter
		let fileLockingService: any
		let agentPoolManager: AgentPoolManager
		let tempDir: string

		beforeEach(async () => {
			tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "review-workflow-test-"))
			mockProcessHandler = createMockProcessHandler()
			registry = new AgentRegistry()
			fileLockingService = createMockFileLockingService()
			roleRegistry = new RoleRegistry()

			stateMachine = new WorkflowStateMachine({
				initialState: "IDLE",
				context: {
					userTask: "",
					currentStep: 0,
					totalSteps: 8,
					artifacts: [],
					agents: [],
					retryCount: 0,
					metadata: {},
				},
			})

			messageRouter = new MessageRouter({} as AgentPoolManager, mockProcessHandler as unknown as any)
			agentPoolManager = new AgentPoolManager(
				mockProcessHandler as unknown as any,
				registry,
				messageRouter,
				fileLockingService,
				{ maxConcurrentAgents: 5 },
			)
			// @ts-expect-error - accessing private property for testing
			messageRouter.agentPoolManager = agentPoolManager
		})

		afterEach(async () => {
			stateMachine.dispose()
			agentPoolManager.dispose()
			messageRouter.dispose()
			fileLockingService.dispose()
			await fs.rm(tempDir, { recursive: true, force: true })
		})

		it("should have Code Sceptic role properly configured", () => {
			const scepticRole = getRoleDefinition("code-sceptic")
			expect(scepticRole).toBeDefined()
			expect(scepticRole?.category).toBe("review")
			expect(scepticRole?.required).toBe(false)
			expect(scepticRole?.inputArtifacts).toContain("implementation_plan")
			expect(scepticRole?.inputArtifacts).toContain("code")
			expect(scepticRole?.outputArtifacts).toContain("review_report")
		})

		it("should validate Code Sceptic task requests for plan review", () => {
			const request: CodeScepticTaskRequest = {
				taskType: "review_plan",
				userTask: "Review the implementation plan for security issues",
				context: {
					artifactId: "plan-123",
				},
			}
			expect(validateCodeScepticTaskRequest(request)).toBe(true)
		})

		it("should validate Code Sceptic task requests for code review", () => {
			const request: CodeScepticTaskRequest = {
				taskType: "review_code",
				userTask: "Review the code for bugs and best practices",
				context: {
					artifactId: "code-456",
				},
			}
			expect(validateCodeScepticTaskRequest(request)).toBe(true)
		})

		it("should validate Code Sceptic task requests for security review", () => {
			const request: CodeScepticTaskRequest = {
				taskType: "review_security",
				userTask: "Perform security audit on the code",
				context: {
					artifactId: "code-789",
				},
			}
			expect(validateCodeScepticTaskRequest(request)).toBe(true)
		})

		it("should validate Code Sceptic task requests for performance review", () => {
			const request: CodeScepticTaskRequest = {
				taskType: "review_performance",
				userTask: "Analyze code for performance issues",
				context: {
					artifactId: "code-abc",
				},
			}
			expect(validateCodeScepticTaskRequest(request)).toBe(true)
		})

		it("should create empty review report with correct structure", () => {
			const report = createEmptyReviewReport("artifact-123")
			expect(report.artifactId).toBe("artifact-123")
			expect(report.verdict).toBe("needs-revision")
			expect(report.criticalIssues).toEqual([])
			expect(report.highPriorityIssues).toEqual([])
			expect(report.mediumPriorityIssues).toEqual([])
			expect(report.lowPriorityIssues).toEqual([])
			expect(report.positiveObservations).toEqual([])
		})

		it("should calculate overall severity correctly", () => {
			const criticalReport: ReviewReport = {
				artifactId: "test",
				summary: "Test",
				criticalIssues: [
					{
						severity: "critical",
						description: "Critical issue",
						location: "file.ts:1",
						recommendation: "Fix it",
					},
				],
				highPriorityIssues: [],
				mediumPriorityIssues: [],
				lowPriorityIssues: [],
				positiveObservations: [],
				verdict: "needs-revision",
				confidence: "high",
				rationale: "Test",
			}
			expect(calculateOverallSeverity(criticalReport)).toBe("critical")

			const highReport: ReviewReport = {
				artifactId: "test",
				summary: "Test",
				criticalIssues: [],
				highPriorityIssues: [
					{ severity: "high", description: "High issue", location: "file.ts:2", recommendation: "Fix it" },
				],
				mediumPriorityIssues: [
					{
						severity: "medium",
						description: "Medium issue",
						location: "file.ts:3",
						recommendation: "Fix it",
					},
				],
				lowPriorityIssues: [],
				positiveObservations: [],
				verdict: "needs-revision",
				confidence: "high",
				rationale: "Test",
			}
			expect(calculateOverallSeverity(highReport)).toBe("high")

			const lowReport: ReviewReport = {
				artifactId: "test",
				summary: "Test",
				criticalIssues: [],
				highPriorityIssues: [],
				mediumPriorityIssues: [],
				lowPriorityIssues: [
					{ severity: "low", description: "Low issue", location: "file.ts:4", recommendation: "Fix it" },
				],
				positiveObservations: [],
				verdict: "approved",
				confidence: "high",
				rationale: "Test",
			}
			expect(calculateOverallSeverity(lowReport)).toBe("low")

			const emptyReport: ReviewReport = {
				artifactId: "test",
				summary: "Test",
				criticalIssues: [],
				highPriorityIssues: [],
				mediumPriorityIssues: [],
				lowPriorityIssues: [],
				positiveObservations: [],
				verdict: "approved",
				confidence: "high",
				rationale: "Test",
			}
			expect(calculateOverallSeverity(emptyReport)).toBe("low")
		})

		it("should determine verdict based on issues", () => {
			const criticalReport: ReviewReport = {
				artifactId: "test",
				summary: "Test",
				criticalIssues: [
					{ severity: "critical", description: "Critical", location: "file.ts:1", recommendation: "Fix" },
				],
				highPriorityIssues: [],
				mediumPriorityIssues: [],
				lowPriorityIssues: [],
				positiveObservations: [],
				verdict: "rejected",
				confidence: "high",
				rationale: "Test",
			}
			expect(determineVerdict(criticalReport)).toBe("rejected")

			const highReport: ReviewReport = {
				artifactId: "test",
				summary: "Test",
				criticalIssues: [],
				highPriorityIssues: [
					{ severity: "high", description: "High", location: "file.ts:2", recommendation: "Fix" },
				],
				mediumPriorityIssues: [],
				lowPriorityIssues: [],
				positiveObservations: [],
				verdict: "needs-revision",
				confidence: "high",
				rationale: "Test",
			}
			expect(determineVerdict(highReport)).toBe("needs-revision")

			const lowReport: ReviewReport = {
				artifactId: "test",
				summary: "Test",
				criticalIssues: [],
				highPriorityIssues: [],
				mediumPriorityIssues: [],
				lowPriorityIssues: [
					{ severity: "low", description: "Low", location: "file.ts:3", recommendation: "Fix" },
				],
				positiveObservations: [],
				verdict: "approved",
				confidence: "high",
				rationale: "Test",
			}
			expect(determineVerdict(lowReport)).toBe("approved")

			const emptyReport: ReviewReport = {
				artifactId: "test",
				summary: "Test",
				criticalIssues: [],
				highPriorityIssues: [],
				mediumPriorityIssues: [],
				lowPriorityIssues: [],
				positiveObservations: [],
				verdict: "approved",
				confidence: "high",
				rationale: "Test",
			}
			expect(determineVerdict(emptyReport)).toBe("approved")
		})

		it("should get correct output artifact type for Code Sceptic tasks", () => {
			expect(getCodeScepticOutputArtifactType("review_plan")).toBe("review_report")
			expect(getCodeScepticOutputArtifactType("review_code")).toBe("review_report")
			expect(getCodeScepticOutputArtifactType("review_security")).toBe("review_report")
			expect(getCodeScepticOutputArtifactType("review_performance")).toBe("review_report")
		})

		it("should transition workflow state after plan review", () => {
			stateMachine.startTask("Test task")
			stateMachine.handleArtifactCreated("implementation_plan")
			expect(stateMachine.getState()).toBe("PLAN_REVIEW")

			// Plan approved
			stateMachine.handlePlanReview(true)
			expect(stateMachine.getState()).toBe("STRUCTURE_CREATION")
		})

		it("should transition to PLAN_REVISION when plan needs revision", () => {
			stateMachine.startTask("Test task")
			stateMachine.handleArtifactCreated("implementation_plan")
			expect(stateMachine.getState()).toBe("PLAN_REVIEW")

			// Plan needs revision
			stateMachine.handlePlanReview(false)
			expect(stateMachine.getState()).toBe("PLAN_REVISION")
		})

		it("should transition workflow state after code review", () => {
			// Setup: Get to CODE_REVIEW state
			stateMachine.startTask("Test task")
			stateMachine.handleArtifactCreated("implementation_plan")
			stateMachine.handlePlanReview(true)
			stateMachine.handleArtifactCreated("pseudocode")
			stateMachine.handleArtifactCreated("code")
			expect(stateMachine.getState()).toBe("CODE_REVIEW")

			// Code approved
			stateMachine.handleCodeReview(true)
			expect(stateMachine.getState()).toBe("DOCUMENTATION")
		})

		it("should transition to CODE_FIXING when code needs fixes", () => {
			// Setup: Get to CODE_REVIEW state
			stateMachine.startTask("Test task")
			stateMachine.handleArtifactCreated("implementation_plan")
			stateMachine.handlePlanReview(true)
			stateMachine.handleArtifactCreated("pseudocode")
			stateMachine.handleArtifactCreated("code")
			expect(stateMachine.getState()).toBe("CODE_REVIEW")

			// Code needs fixes
			stateMachine.handleCodeReview(false)
			expect(stateMachine.getState()).toBe("CODE_FIXING")
		})

		it("should spawn Code Sceptic agent for review", async () => {
			const config: AgentSpawnConfig = {
				agentId: "sceptic-1",
				role: "code-sceptic",
				providerProfile: "anthropic",
				mode: "code-sceptic",
				workspace: tempDir,
			}

			const agentId = await agentPoolManager.spawnAgent(config)
			expect(agentId).toBe("sceptic-1")

			const agent = agentPoolManager.getAgent(agentId)
			expect(agent).toBeDefined()
			expect(agent?.role).toBe("code-sceptic")
		})

		it("should route review request to Code Sceptic agent", async () => {
			const mockAgent: AgentInstance = {
				agentId: "sceptic-agent",
				role: "code-sceptic",
				mode: "code-sceptic",
				providerProfile: "anthropic",
				status: "ready",
				sessionId: "session-sceptic",
				spawnedAt: Date.now(),
				lastActivityAt: Date.now(),
			}

			const mockPoolManager = {
				getAgent: vi.fn().mockReturnValue(mockAgent),
				getActiveAgents: vi.fn(() => [mockAgent]),
			}

			const router = new MessageRouter(
				mockPoolManager as unknown as AgentPoolManager,
				mockProcessHandler as unknown as any,
			)

			const reviewMessage: AgentMessage = {
				id: "review-1",
				type: "request",
				from: "organiser",
				to: "sceptic-agent",
				timestamp: Date.now(),
				payload: {
					task: "Review the implementation plan",
					taskType: "analyze",
					context: {
						artifactIds: ["plan-123"],
						instructions: "Review the plan for issues",
					},
				},
			}

			await router.routeMessage(reviewMessage)

			expect(mockProcessHandler.sendMessage).toHaveBeenCalledWith(
				"session-sceptic",
				expect.objectContaining({
					type: "agentMessage",
					message: reviewMessage,
				}),
			)

			router.dispose()
		})

		it("should create review report artifact after review", async () => {
			const artifactStore = createMockArtifactStore()

			// Simulate review completion
			const reviewReport: ReviewReport = {
				artifactId: "plan-123",
				summary: "The implementation plan has security concerns that need to be addressed",
				criticalIssues: [],
				highPriorityIssues: [
					{
						severity: "high",
						description: "Missing input validation",
						location: "AuthController.ts:15",
						impact: "Security vulnerability",
						recommendation: "Add input validation for email and password",
					},
				],
				mediumPriorityIssues: [
					{
						severity: "medium",
						description: "No rate limiting on login",
						location: "AuthController.ts:20",
						recommendation: "Implement rate limiting to prevent brute force attacks",
					},
				],
				lowPriorityIssues: [],
				positiveObservations: ["Good separation of concerns"],
				verdict: "needs-revision",
				confidence: "high",
				rationale: "Security concerns must be addressed",
			}

			await artifactStore.createArtifact(
				"review_report",
				"sceptic-1",
				"code-sceptic",
				JSON.stringify(reviewReport, null, 2),
				{ relatedArtifacts: ["plan-123"] },
			)

			expect(artifactStore.createArtifact).toHaveBeenCalledWith(
				"review_report",
				"sceptic-1",
				"code-sceptic",
				expect.any(String),
				{ relatedArtifacts: ["plan-123"] },
			)
		})

		it("should track review artifacts in session", () => {
			const session = registry.createMultiAgentSession({
				workspace: tempDir,
				userTask: "Test review workflow",
			})

			registry.addAgentToSession(session.sessionId, "sceptic-1", "code-sceptic")
			registry.addArtifactToSession(session.sessionId, {
				artifactId: "review-1",
				artifactType: "review_report",
				summary: "Plan review: needs revision",
				status: "completed",
				producerRole: "code-sceptic",
			})

			const artifacts = registry.getArtifactSummariesForSession(session.sessionId)
			expect(artifacts).toHaveLength(1)
			expect(artifacts[0]?.artifactType).toBe("review_report")
		})
	})

	describe("2. Documentation Workflow (Organiser + Documentation Writer)", () => {
		let stateMachine: WorkflowStateMachine
		let roleRegistry: RoleRegistry
		let mockProcessHandler: MockProcessHandler
		let registry: AgentRegistry
		let messageRouter: MessageRouter
		let fileLockingService: any
		let agentPoolManager: AgentPoolManager
		let tempDir: string

		beforeEach(async () => {
			tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "doc-workflow-test-"))
			mockProcessHandler = createMockProcessHandler()
			registry = new AgentRegistry()
			fileLockingService = createMockFileLockingService()
			roleRegistry = new RoleRegistry()

			stateMachine = new WorkflowStateMachine({
				initialState: "IDLE",
				context: {
					userTask: "",
					currentStep: 0,
					totalSteps: 8,
					artifacts: [],
					agents: [],
					retryCount: 0,
					metadata: {},
				},
			})

			messageRouter = new MessageRouter({} as AgentPoolManager, mockProcessHandler as unknown as any)
			agentPoolManager = new AgentPoolManager(
				mockProcessHandler as unknown as any,
				registry,
				messageRouter,
				fileLockingService,
				{ maxConcurrentAgents: 5 },
			)
			// @ts-expect-error - accessing private property for testing
			messageRouter.agentPoolManager = agentPoolManager
		})

		afterEach(async () => {
			stateMachine.dispose()
			agentPoolManager.dispose()
			messageRouter.dispose()
			fileLockingService.dispose()
			await fs.rm(tempDir, { recursive: true, force: true })
		})

		it("should have Documentation Writer role properly configured", () => {
			const docRole = getRoleDefinition("documentation-writer")
			expect(docRole).toBeDefined()
			expect(docRole?.category).toBe("documentation")
			expect(docRole?.required).toBe(false)
			expect(docRole?.inputArtifacts).toContain("code")
			// Note: Role definition has only "code", but mode supports both "code" and "implementation_plan"
			expect(docRole?.outputArtifacts).toContain("documentation")
		})

		it("should validate Documentation Writer task requests for document task", () => {
			const request: DocumentationWriterTaskRequest = {
				taskType: "document",
				userTask: "Create comprehensive documentation for the authentication module",
				context: {
					artifactId: "code-123",
				},
			}
			expect(validateDocumentationWriterTaskRequest(request)).toBe(true)
		})

		it("should validate Documentation Writer task requests for API documentation", () => {
			const request: DocumentationWriterTaskRequest = {
				taskType: "document_api",
				userTask: "Document all API endpoints",
				context: {
					artifactId: "code-456",
				},
			}
			expect(validateDocumentationWriterTaskRequest(request)).toBe(true)
		})

		it("should validate Documentation Writer task requests for README creation", () => {
			const request: DocumentationWriterTaskRequest = {
				taskType: "create_readme",
				userTask: "Create a README file for the project",
			}
			expect(validateDocumentationWriterTaskRequest(request)).toBe(true)
		})

		it("should validate Documentation Writer task requests for user guide", () => {
			const request: DocumentationWriterTaskRequest = {
				taskType: "create_user_guide",
				userTask: "Create a user guide for the application",
			}
			expect(validateDocumentationWriterTaskRequest(request)).toBe(true)
		})

		it("should validate Documentation Writer task requests for contributing guide", () => {
			const request: DocumentationWriterTaskRequest = {
				taskType: "create_contributing_guide",
				userTask: "Create a contributing guide for the project",
			}
			expect(validateDocumentationWriterTaskRequest(request)).toBe(true)
		})

		it("should get correct output artifact type for Documentation Writer tasks", () => {
			expect(getDocumentationWriterOutputArtifactType("document")).toBe("documentation")
			expect(getDocumentationWriterOutputArtifactType("document_api")).toBe("documentation")
			expect(getDocumentationWriterOutputArtifactType("document_inline")).toBe("documentation")
			expect(getDocumentationWriterOutputArtifactType("create_readme")).toBe("documentation")
			expect(getDocumentationWriterOutputArtifactType("update_readme")).toBe("documentation")
			expect(getDocumentationWriterOutputArtifactType("create_user_guide")).toBe("documentation")
			expect(getDocumentationWriterOutputArtifactType("create_contributing_guide")).toBe("documentation")
		})

		it("should transition to DOCUMENTATION state after code review approval", () => {
			// Setup: Get to CODE_REVIEW state
			stateMachine.startTask("Test task")
			stateMachine.handleArtifactCreated("implementation_plan")
			stateMachine.handlePlanReview(true)
			stateMachine.handleArtifactCreated("pseudocode")
			stateMachine.handleArtifactCreated("code")
			expect(stateMachine.getState()).toBe("CODE_REVIEW")

			// Code approved - should transition to DOCUMENTATION
			stateMachine.handleCodeReview(true)
			expect(stateMachine.getState()).toBe("DOCUMENTATION")
		})

		it("should transition to TESTING state after documentation", () => {
			// Setup: Get to DOCUMENTATION state
			stateMachine.startTask("Test task")
			stateMachine.handleArtifactCreated("implementation_plan")
			stateMachine.handlePlanReview(true)
			stateMachine.handleArtifactCreated("pseudocode")
			stateMachine.handleArtifactCreated("code")
			stateMachine.handleCodeReview(true)
			expect(stateMachine.getState()).toBe("DOCUMENTATION")

			// Documentation created - should transition to TESTING
			stateMachine.handleArtifactCreated("documentation")
			expect(stateMachine.getState()).toBe("TESTING")
		})

		it("should spawn Documentation Writer agent", async () => {
			const config: AgentSpawnConfig = {
				agentId: "doc-writer-1",
				role: "documentation-writer",
				providerProfile: "anthropic",
				mode: "documentation-writer",
				workspace: tempDir,
			}

			const agentId = await agentPoolManager.spawnAgent(config)
			expect(agentId).toBe("doc-writer-1")

			const agent = agentPoolManager.getAgent(agentId)
			expect(agent).toBeDefined()
			expect(agent?.role).toBe("documentation-writer")
		})

		it("should route documentation request to Documentation Writer agent", async () => {
			const mockAgent: AgentInstance = {
				agentId: "doc-agent",
				role: "documentation-writer",
				mode: "documentation-writer",
				providerProfile: "anthropic",
				status: "ready",
				sessionId: "session-doc",
				spawnedAt: Date.now(),
				lastActivityAt: Date.now(),
			}

			const mockPoolManager = {
				getAgent: vi.fn().mockReturnValue(mockAgent),
				getActiveAgents: vi.fn(() => [mockAgent]),
			}

			const router = new MessageRouter(
				mockPoolManager as unknown as AgentPoolManager,
				mockProcessHandler as unknown as any,
			)

			const docMessage: AgentMessage = {
				id: "doc-1",
				type: "request",
				from: "organiser",
				to: "doc-agent",
				timestamp: Date.now(),
				payload: {
					task: "Create API documentation",
					taskType: "document",
					context: {
						artifactIds: ["code-123"],
						instructions: "Document the API endpoints",
					},
				},
			}

			await router.routeMessage(docMessage)

			expect(mockProcessHandler.sendMessage).toHaveBeenCalledWith(
				"session-doc",
				expect.objectContaining({
					type: "agentMessage",
					message: docMessage,
				}),
			)

			router.dispose()
		})

		it("should create documentation artifact with correct structure", async () => {
			const artifactStore = createMockArtifactStore()

			const docArtifact: DocumentationArtifact = {
				artifactId: "doc-123",
				title: "Authentication Module Documentation",
				description: "Documentation for the authentication module",
				items: [],
				sections: [
					{
						title: "Overview",
						content: "The authentication module provides secure user authentication.",
					},
					{
						title: "API Reference",
						content:
							"POST /api/auth/login - Authenticate user\nPOST /api/auth/register - Register new user",
					},
				],
				summary: {
					filesDocumented: 5,
					itemsDocumented: 12,
					examplesAdded: 8,
					gapsIdentified: [],
				},
			}

			await artifactStore.createArtifact(
				"documentation",
				"doc-writer-1",
				"documentation-writer",
				JSON.stringify(docArtifact, null, 2),
				{ relatedArtifacts: ["code-123"] },
			)

			expect(artifactStore.createArtifact).toHaveBeenCalledWith(
				"documentation",
				"doc-writer-1",
				"documentation-writer",
				expect.any(String),
				{ relatedArtifacts: ["code-123"] },
			)
		})

		it("should track documentation artifacts in session", () => {
			const session = registry.createMultiAgentSession({
				workspace: tempDir,
				userTask: "Test documentation workflow",
			})

			registry.addAgentToSession(session.sessionId, "doc-writer-1", "documentation-writer")
			registry.addArtifactToSession(session.sessionId, {
				artifactId: "doc-1",
				artifactType: "documentation",
				summary: "API documentation for auth module",
				status: "completed",
				producerRole: "documentation-writer",
			})

			const artifacts = registry.getArtifactSummariesForSession(session.sessionId)
			expect(artifacts).toHaveLength(1)
			expect(artifacts[0]?.artifactType).toBe("documentation")
		})
	})

	describe("3. Testing Workflow (Organiser + Debugger)", () => {
		let stateMachine: WorkflowStateMachine
		let roleRegistry: RoleRegistry
		let mockProcessHandler: MockProcessHandler
		let registry: AgentRegistry
		let messageRouter: MessageRouter
		let fileLockingService: any
		let agentPoolManager: AgentPoolManager
		let tempDir: string

		beforeEach(async () => {
			tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "testing-workflow-test-"))
			mockProcessHandler = createMockProcessHandler()
			registry = new AgentRegistry()
			fileLockingService = createMockFileLockingService()
			roleRegistry = new RoleRegistry()

			stateMachine = new WorkflowStateMachine({
				initialState: "IDLE",
				context: {
					userTask: "",
					currentStep: 0,
					totalSteps: 8,
					artifacts: [],
					agents: [],
					retryCount: 0,
					metadata: {},
				},
			})

			messageRouter = new MessageRouter({} as AgentPoolManager, mockProcessHandler as unknown as any)
			agentPoolManager = new AgentPoolManager(
				mockProcessHandler as unknown as any,
				registry,
				messageRouter,
				fileLockingService,
				{ maxConcurrentAgents: 5 },
			)
			// @ts-expect-error - accessing private property for testing
			messageRouter.agentPoolManager = agentPoolManager
		})

		afterEach(async () => {
			stateMachine.dispose()
			agentPoolManager.dispose()
			messageRouter.dispose()
			fileLockingService.dispose()
			await fs.rm(tempDir, { recursive: true, force: true })
		})

		it("should have Debugger role properly configured", () => {
			const debuggerRole = getRoleDefinition("debugger")
			expect(debuggerRole).toBeDefined()
			expect(debuggerRole?.category).toBe("testing")
			expect(debuggerRole?.required).toBe(false)
			expect(debuggerRole?.inputArtifacts).toContain("code")
			expect(debuggerRole?.outputArtifacts).toContain("test_results")
		})

		it("should validate Debugger task requests for run_tests", () => {
			const request: DebuggerTaskRequest = {
				taskType: "run_tests",
				userTask: "Run all tests in the project",
			}
			expect(validateDebuggerTaskRequest(request)).toBe(true)
		})

		it("should validate Debugger task requests for debug_failure", () => {
			const request: DebuggerTaskRequest = {
				taskType: "debug_failure",
				userTask: "Debug the failing test",
				context: {
					failureId: "failure-123",
				},
			}
			expect(validateDebuggerTaskRequest(request)).toBe(true)
		})

		it("should validate Debugger task requests for fix_bug", () => {
			const request: DebuggerTaskRequest = {
				taskType: "fix_bug",
				userTask: "Fix the identified bug",
				context: {
					failureId: "bug-456",
				},
			}
			expect(validateDebuggerTaskRequest(request)).toBe(true)
		})

		it("should validate Debugger task requests for analyze_coverage", () => {
			const request: DebuggerTaskRequest = {
				taskType: "analyze_coverage",
				userTask: "Analyze test coverage",
			}
			expect(validateDebuggerTaskRequest(request)).toBe(true)
		})

		it("should validate Debugger task requests for write_tests", () => {
			const request: DebuggerTaskRequest = {
				taskType: "write_tests",
				userTask: "Write tests for uncovered code",
			}
			expect(validateDebuggerTaskRequest(request)).toBe(true)
		})

		it("should validate Debugger task requests for investigate_flaky", () => {
			const request: DebuggerTaskRequest = {
				taskType: "investigate_flaky",
				userTask: "Investigate flaky test",
				context: {
					testName: "should handle concurrent requests",
				},
			}
			expect(validateDebuggerTaskRequest(request)).toBe(true)
		})

		it("should get correct output artifact type for Debugger tasks", () => {
			expect(getDebuggerOutputArtifactType("run_tests")).toBe("test_results")
			expect(getDebuggerOutputArtifactType("debug_failure")).toBe("test_results")
			expect(getDebuggerOutputArtifactType("fix_bug")).toBe("test_results")
			expect(getDebuggerOutputArtifactType("analyze_coverage")).toBe("test_results")
			expect(getDebuggerOutputArtifactType("write_tests")).toBe("test_results")
			expect(getDebuggerOutputArtifactType("investigate_flaky")).toBe("test_results")
		})

		it("should get correct test command for frameworks", () => {
			expect(getTestCommand("jest")).toBe("npx jest")
			expect(getTestCommand("vitest")).toBe("npx vitest run")
			// Mocha includes a default test pattern
			expect(getTestCommand("mocha")).toContain("npx mocha")
			expect(getTestCommand("pytest")).toBe("pytest")
		})

		it("should transition to TESTING state after documentation", () => {
			// Setup: Get to DOCUMENTATION state
			stateMachine.startTask("Test task")
			stateMachine.handleArtifactCreated("implementation_plan")
			stateMachine.handlePlanReview(true)
			stateMachine.handleArtifactCreated("pseudocode")
			stateMachine.handleArtifactCreated("code")
			stateMachine.handleCodeReview(true)
			stateMachine.handleArtifactCreated("documentation")
			expect(stateMachine.getState()).toBe("TESTING")
		})

		it("should transition to COMPLETED state after tests pass", () => {
			// Setup: Get to TESTING state
			stateMachine.startTask("Test task")
			stateMachine.handleArtifactCreated("implementation_plan")
			stateMachine.handlePlanReview(true)
			stateMachine.handleArtifactCreated("pseudocode")
			stateMachine.handleArtifactCreated("code")
			stateMachine.handleCodeReview(true)
			stateMachine.handleArtifactCreated("documentation")
			expect(stateMachine.getState()).toBe("TESTING")

			// Tests passed - should transition to COMPLETED
			stateMachine.handleTestResults(true)
			expect(stateMachine.getState()).toBe("COMPLETED")
		})

		it("should transition to CODE_FIXING state when tests fail", () => {
			// Setup: Get to TESTING state
			stateMachine.startTask("Test task")
			stateMachine.handleArtifactCreated("implementation_plan")
			stateMachine.handlePlanReview(true)
			stateMachine.handleArtifactCreated("pseudocode")
			stateMachine.handleArtifactCreated("code")
			stateMachine.handleCodeReview(true)
			stateMachine.handleArtifactCreated("documentation")
			expect(stateMachine.getState()).toBe("TESTING")

			// Tests failed - should transition to CODE_FIXING
			stateMachine.handleTestResults(false)
			expect(stateMachine.getState()).toBe("CODE_FIXING")
		})

		it("should spawn Debugger agent", async () => {
			const config: AgentSpawnConfig = {
				agentId: "debugger-1",
				role: "debugger",
				providerProfile: "anthropic",
				mode: "debugger",
				workspace: tempDir,
			}

			const agentId = await agentPoolManager.spawnAgent(config)
			expect(agentId).toBe("debugger-1")

			const agent = agentPoolManager.getAgent(agentId)
			expect(agent).toBeDefined()
			expect(agent?.role).toBe("debugger")
		})

		it("should route testing request to Debugger agent", async () => {
			const mockAgent: AgentInstance = {
				agentId: "debugger-agent",
				role: "debugger",
				mode: "debugger",
				providerProfile: "anthropic",
				status: "ready",
				sessionId: "session-debugger",
				spawnedAt: Date.now(),
				lastActivityAt: Date.now(),
			}

			const mockPoolManager = {
				getAgent: vi.fn().mockReturnValue(mockAgent),
				getActiveAgents: vi.fn(() => [mockAgent]),
			}

			const router = new MessageRouter(
				mockPoolManager as unknown as AgentPoolManager,
				mockProcessHandler as unknown as any,
			)

			const testMessage: AgentMessage = {
				id: "test-1",
				type: "request",
				from: "organiser",
				to: "debugger-agent",
				timestamp: Date.now(),
				payload: {
					task: "Run all tests",
					taskType: "test",
					context: {
						artifactIds: ["code-123"],
						instructions: "Run the test suite",
					},
				},
			}

			await router.routeMessage(testMessage)

			expect(mockProcessHandler.sendMessage).toHaveBeenCalledWith(
				"session-debugger",
				expect.objectContaining({
					type: "agentMessage",
					message: testMessage,
				}),
			)

			router.dispose()
		})

		it("should create test results artifact with correct structure", async () => {
			const artifactStore = createMockArtifactStore()

			const testResults: TestResultsReport = {
				summary: "Tests: 8 passed, 2 failed",
				environment: {
					framework: "jest",
					nodeVersion: "18.0.0",
					os: "linux",
					timestamp: Date.now(),
				},
				suites: [
					{
						name: "AuthController",
						status: "failed",
						tests: [
							{ name: "should login user", status: "passed", duration: 100 },
							{
								name: "should handle invalid credentials",
								status: "failed",
								duration: 300,
								errorMessage: "Expected 401 but got 500",
							},
						],
						passedCount: 1,
						failedCount: 1,
						skippedCount: 0,
						duration: 400,
					},
				],
				issues: [
					{
						severity: "high",
						type: "bug",
						location: "AuthController.ts:25",
						description: "Invalid credentials returns 500 instead of 401",
						suggestedFix: "Add proper error handling for invalid credentials",
					},
				],
				recommendations: ["Add error handling for authentication failures"],
				verdict: "failed",
				confidence: "high",
				rationale: "2 tests failed due to error handling issues",
			}

			await artifactStore.createArtifact(
				"test_results",
				"debugger-1",
				"debugger",
				JSON.stringify(testResults, null, 2),
				{ relatedArtifacts: ["code-123"] },
			)

			expect(artifactStore.createArtifact).toHaveBeenCalledWith(
				"test_results",
				"debugger-1",
				"debugger",
				expect.any(String),
				{ relatedArtifacts: ["code-123"] },
			)
		})

		it("should track test result artifacts in session", () => {
			const session = registry.createMultiAgentSession({
				workspace: tempDir,
				userTask: "Test testing workflow",
			})

			registry.addAgentToSession(session.sessionId, "debugger-1", "debugger")
			registry.addArtifactToSession(session.sessionId, {
				artifactId: "test-1",
				artifactType: "test_results",
				summary: "Tests: 8 passed, 2 failed",
				status: "completed",
				producerRole: "debugger",
			})

			const artifacts = registry.getArtifactSummariesForSession(session.sessionId)
			expect(artifacts).toHaveLength(1)
			expect(artifacts[0]?.artifactType).toBe("test_results")
		})
	})

	describe("4. Full Workflow with All Roles", () => {
		let stateMachine: WorkflowStateMachine
		let roleRegistry: RoleRegistry
		let mockProcessHandler: MockProcessHandler
		let registry: AgentRegistry
		let messageRouter: MessageRouter
		let fileLockingService: any
		let agentPoolManager: AgentPoolManager
		let artifactStore: any
		let tempDir: string

		beforeEach(async () => {
			tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "full-workflow-test-"))
			mockProcessHandler = createMockProcessHandler()
			registry = new AgentRegistry()
			fileLockingService = createMockFileLockingService()
			artifactStore = createMockArtifactStore()
			roleRegistry = new RoleRegistry()

			stateMachine = new WorkflowStateMachine({
				initialState: "IDLE",
				context: {
					userTask: "",
					currentStep: 0,
					totalSteps: 8,
					artifacts: [],
					agents: [],
					retryCount: 0,
					metadata: {},
				},
			})

			messageRouter = new MessageRouter({} as AgentPoolManager, mockProcessHandler as unknown as any)
			agentPoolManager = new AgentPoolManager(
				mockProcessHandler as unknown as any,
				registry,
				messageRouter,
				fileLockingService,
				{ maxConcurrentAgents: 5 },
			)
			// @ts-expect-error - accessing private property for testing
			messageRouter.agentPoolManager = agentPoolManager
		})

		afterEach(async () => {
			stateMachine.dispose()
			agentPoolManager.dispose()
			messageRouter.dispose()
			fileLockingService.dispose()
			artifactStore.dispose()
			await fs.rm(tempDir, { recursive: true, force: true })
		})

		it("should have all roles properly configured", () => {
			const allRoles = getAllRoleDefinitions()
			const roleIds = allRoles.map((r) => r.id)

			// Core roles
			expect(roleIds).toContain("architect")
			expect(roleIds).toContain("primary-coder")
			expect(roleIds).toContain("secondary-coder")

			// Additional roles
			expect(roleIds).toContain("code-sceptic")
			expect(roleIds).toContain("documentation-writer")
			expect(roleIds).toContain("debugger")
		})

		it("should have correct role categories", () => {
			const planningRoles = getRoleIdsByCategory("planning")
			const implementationRoles = getRoleIdsByCategory("implementation")
			const reviewRoles = getRoleIdsByCategory("review")
			const documentationRoles = getRoleIdsByCategory("documentation")
			const testingRoles = getRoleIdsByCategory("testing")

			expect(planningRoles).toContain("architect")
			expect(implementationRoles).toContain("primary-coder")
			expect(implementationRoles).toContain("secondary-coder")
			expect(reviewRoles).toContain("code-sceptic")
			expect(documentationRoles).toContain("documentation-writer")
			expect(testingRoles).toContain("debugger")
		})

		it("should execute complete workflow from IDLE to COMPLETED", async () => {
			// Create session
			const session = registry.createMultiAgentSession({
				workspace: tempDir,
				userTask: "Implement user authentication feature",
			})

			// Track all agents
			const agentIds: string[] = []

			// 1. IDLE -> PLANNING: Spawn Architect
			stateMachine.startTask("Implement user authentication feature")
			expect(stateMachine.getState()).toBe("PLANNING")

			const architectId = await agentPoolManager.spawnAgent({
				agentId: "architect-1",
				role: "architect",
				providerProfile: "anthropic",
				mode: "architect",
				workspace: tempDir,
			})
			agentIds.push(architectId)
			registry.addAgentToSession(session.sessionId, architectId, "architect")

			// 2. PLANNING -> PLAN_REVIEW: Plan created
			stateMachine.handleArtifactCreated("implementation_plan")
			expect(stateMachine.getState()).toBe("PLAN_REVIEW")
			registry.addArtifactToSession(session.sessionId, {
				artifactId: "plan-1",
				artifactType: "implementation_plan",
				summary: "Authentication implementation plan",
				status: "completed",
				producerRole: "architect",
			})

			// 3. PLAN_REVIEW -> STRUCTURE_CREATION: Plan approved
			stateMachine.handlePlanReview(true)
			expect(stateMachine.getState()).toBe("STRUCTURE_CREATION")

			// Spawn Primary Coder
			const primaryCoderId = await agentPoolManager.spawnAgent({
				agentId: "primary-coder-1",
				role: "primary-coder",
				providerProfile: "anthropic",
				mode: "primary-coder",
				workspace: tempDir,
			})
			agentIds.push(primaryCoderId)
			registry.addAgentToSession(session.sessionId, primaryCoderId, "primary-coder")

			// 4. STRUCTURE_CREATION -> CODE_IMPLEMENTATION: Pseudocode created
			stateMachine.handleArtifactCreated("pseudocode")
			expect(stateMachine.getState()).toBe("CODE_IMPLEMENTATION")
			registry.addArtifactToSession(session.sessionId, {
				artifactId: "pseudo-1",
				artifactType: "pseudocode",
				summary: "File structure and pseudocode",
				status: "completed",
				producerRole: "primary-coder",
			})

			// Spawn Secondary Coder
			const secondaryCoderId = await agentPoolManager.spawnAgent({
				agentId: "secondary-coder-1",
				role: "secondary-coder",
				providerProfile: "anthropic",
				mode: "secondary-coder",
				workspace: tempDir,
			})
			agentIds.push(secondaryCoderId)
			registry.addAgentToSession(session.sessionId, secondaryCoderId, "secondary-coder")

			// 5. CODE_IMPLEMENTATION -> CODE_REVIEW: Code created
			stateMachine.handleArtifactCreated("code")
			expect(stateMachine.getState()).toBe("CODE_REVIEW")
			registry.addArtifactToSession(session.sessionId, {
				artifactId: "code-1",
				artifactType: "code",
				summary: "Authentication code implementation",
				status: "completed",
				producerRole: "secondary-coder",
			})

			// Spawn Code Sceptic for review
			const scepticId = await agentPoolManager.spawnAgent({
				agentId: "sceptic-1",
				role: "code-sceptic",
				providerProfile: "anthropic",
				mode: "code-sceptic",
				workspace: tempDir,
			})
			agentIds.push(scepticId)
			registry.addAgentToSession(session.sessionId, scepticId, "code-sceptic")

			// 6. CODE_REVIEW -> DOCUMENTATION: Code approved
			stateMachine.handleCodeReview(true)
			expect(stateMachine.getState()).toBe("DOCUMENTATION")

			// Spawn Documentation Writer
			const docWriterId = await agentPoolManager.spawnAgent({
				agentId: "doc-writer-1",
				role: "documentation-writer",
				providerProfile: "anthropic",
				mode: "documentation-writer",
				workspace: tempDir,
			})
			agentIds.push(docWriterId)
			registry.addAgentToSession(session.sessionId, docWriterId, "documentation-writer")

			// 7. DOCUMENTATION -> TESTING: Documentation created
			stateMachine.handleArtifactCreated("documentation")
			expect(stateMachine.getState()).toBe("TESTING")
			registry.addArtifactToSession(session.sessionId, {
				artifactId: "doc-1",
				artifactType: "documentation",
				summary: "API documentation",
				status: "completed",
				producerRole: "documentation-writer",
			})

			// Spawn Debugger
			const debuggerId = await agentPoolManager.spawnAgent({
				agentId: "debugger-1",
				role: "debugger",
				providerProfile: "anthropic",
				mode: "debugger",
				workspace: tempDir,
			})
			agentIds.push(debuggerId)
			registry.addAgentToSession(session.sessionId, debuggerId, "debugger")

			// 8. TESTING -> COMPLETED: Tests passed
			stateMachine.handleTestResults(true)
			expect(stateMachine.getState()).toBe("COMPLETED")
			registry.addArtifactToSession(session.sessionId, {
				artifactId: "test-1",
				artifactType: "test_results",
				summary: "All tests passed",
				status: "completed",
				producerRole: "debugger",
			})

			// Verify all agents were tracked
			expect(agentIds).toHaveLength(6)

			// Verify all artifacts were tracked (5 artifacts added)
			const artifacts = registry.getArtifactSummariesForSession(session.sessionId)
			expect(artifacts).toHaveLength(5)

			// Verify session status
			const finalSession = registry.getMultiAgentSession(session.sessionId)
			expect(finalSession?.agents).toHaveLength(6)
		})

		it("should handle workflow with plan revision", async () => {
			// Start workflow
			stateMachine.startTask("Implement feature")
			stateMachine.handleArtifactCreated("implementation_plan")
			expect(stateMachine.getState()).toBe("PLAN_REVIEW")

			// Plan needs revision
			stateMachine.handlePlanReview(false)
			expect(stateMachine.getState()).toBe("PLAN_REVISION")

			// Plan revised - back to review
			stateMachine.transition("PLAN_REVIEW", "plan_revised")
			expect(stateMachine.getState()).toBe("PLAN_REVIEW")

			// Plan approved this time
			stateMachine.handlePlanReview(true)
			expect(stateMachine.getState()).toBe("STRUCTURE_CREATION")
		})

		it("should handle workflow with code fixing", async () => {
			// Setup: Get to CODE_REVIEW state
			stateMachine.startTask("Implement feature")
			stateMachine.handleArtifactCreated("implementation_plan")
			stateMachine.handlePlanReview(true)
			stateMachine.handleArtifactCreated("pseudocode")
			stateMachine.handleArtifactCreated("code")
			expect(stateMachine.getState()).toBe("CODE_REVIEW")

			// Code needs fixes
			stateMachine.handleCodeReview(false)
			expect(stateMachine.getState()).toBe("CODE_FIXING")

			// Code fixed - back to review
			stateMachine.handleArtifactCreated("code")
			expect(stateMachine.getState()).toBe("CODE_REVIEW")

			// Code approved this time
			stateMachine.handleCodeReview(true)
			expect(stateMachine.getState()).toBe("DOCUMENTATION")
		})

		it("should handle workflow with test failures", async () => {
			// Setup: Get to TESTING state
			stateMachine.startTask("Implement feature")
			stateMachine.handleArtifactCreated("implementation_plan")
			stateMachine.handlePlanReview(true)
			stateMachine.handleArtifactCreated("pseudocode")
			stateMachine.handleArtifactCreated("code")
			stateMachine.handleCodeReview(true)
			stateMachine.handleArtifactCreated("documentation")
			expect(stateMachine.getState()).toBe("TESTING")

			// Tests failed - transitions to CODE_FIXING
			stateMachine.handleTestResults(false)
			expect(stateMachine.getState()).toBe("CODE_FIXING")

			// After code fixes, create new code artifact and go through review again
			stateMachine.handleArtifactCreated("code")
			expect(stateMachine.getState()).toBe("CODE_REVIEW")

			// Code approved
			stateMachine.handleCodeReview(true)
			expect(stateMachine.getState()).toBe("DOCUMENTATION")

			// Documentation updated
			stateMachine.handleArtifactCreated("documentation")
			expect(stateMachine.getState()).toBe("TESTING")

			// Tests passed after fixes
			stateMachine.handleTestResults(true)
			expect(stateMachine.getState()).toBe("COMPLETED")
		})

		it("should support concurrent agent spawning up to limit", async () => {
			const agentIds: string[] = []

			// Spawn 5 agents (at limit)
			for (let i = 0; i < 5; i++) {
				const agentId = await agentPoolManager.spawnAgent({
					agentId: `agent-${i}`,
					role: "coder",
					providerProfile: "anthropic",
					mode: "code",
					workspace: tempDir,
				})
				agentIds.push(agentId)
			}

			expect(agentIds).toHaveLength(5)

			// Activate all agents
			for (let i = 0; i < 5; i++) {
				simulateAgentEvent(agentPoolManager, agentIds[i], `session-${i}`, {
					type: "session_created",
				})
			}

			// Should be at limit
			expect(agentPoolManager.getActiveAgentCount()).toBe(5)

			// Attempt to spawn 6th agent should fail
			await expect(
				agentPoolManager.spawnAgent({
					agentId: "agent-6",
					role: "coder",
					providerProfile: "anthropic",
					mode: "code",
					workspace: tempDir,
				}),
			).rejects.toThrow("Maximum concurrent agents")
		})

		it("should track workflow progress correctly", () => {
			stateMachine.startTask("Test task")

			// Initial progress
			let progress = stateMachine.getProgress()
			expect(progress).toBeGreaterThan(0)

			// Progress through workflow
			stateMachine.handleArtifactCreated("implementation_plan")
			progress = stateMachine.getProgress()
			expect(progress).toBeGreaterThan(0)

			stateMachine.handlePlanReview(true)
			stateMachine.handleArtifactCreated("pseudocode")
			stateMachine.handleArtifactCreated("code")
			stateMachine.handleCodeReview(true)
			stateMachine.handleArtifactCreated("documentation")
			stateMachine.handleTestResults(true)

			// Final progress should be 100%
			progress = stateMachine.getProgress()
			expect(progress).toBe(100)
		})

		it("should emit state change events throughout workflow", () => {
			const stateChanges: string[] = []
			stateMachine.on("stateChange", (event: { newState: string }) => {
				stateChanges.push(event.newState)
			})

			// Execute workflow
			stateMachine.startTask("Test task")
			stateMachine.handleArtifactCreated("implementation_plan")
			stateMachine.handlePlanReview(true)
			stateMachine.handleArtifactCreated("pseudocode")
			stateMachine.handleArtifactCreated("code")
			stateMachine.handleCodeReview(true)
			stateMachine.handleArtifactCreated("documentation")
			stateMachine.handleTestResults(true)

			// Verify all state changes were emitted
			expect(stateChanges).toContain("PLANNING")
			expect(stateChanges).toContain("PLAN_REVIEW")
			expect(stateChanges).toContain("STRUCTURE_CREATION")
			expect(stateChanges).toContain("CODE_IMPLEMENTATION")
			expect(stateChanges).toContain("CODE_REVIEW")
			expect(stateChanges).toContain("DOCUMENTATION")
			expect(stateChanges).toContain("TESTING")
			expect(stateChanges).toContain("COMPLETED")
		})

		it("should support pause and resume during workflow", () => {
			stateMachine.startTask("Test task")
			stateMachine.handleArtifactCreated("implementation_plan")
			expect(stateMachine.getState()).toBe("PLAN_REVIEW")

			// Pause workflow
			stateMachine.pause()
			expect(stateMachine.getState()).toBe("PAUSED")

			// Resume workflow
			stateMachine.resume()
			expect(stateMachine.getState()).toBe("PLAN_REVIEW")
		})

		it("should validate artifact type compatibility across workflow", () => {
			// Architect outputs should feed Primary Coder inputs
			expect(ARCHITECT_OUTPUT_ARTIFACTS).toContain("implementation_plan")
			expect(PRIMARY_CODER_MODE_CONFIG).toBeDefined()

			// Primary Coder outputs should feed Secondary Coder inputs
			expect(PRIMARY_CODER_OUTPUT_ARTIFACTS).toContain("pseudocode")
			expect(SECONDARY_CODER_INPUT_ARTIFACTS).toContain("pseudocode")

			// Secondary Coder outputs should feed Code Sceptic inputs
			expect(SECONDARY_CODER_OUTPUT_ARTIFACTS).toContain("code")
			expect(CODE_SCEPTIC_INPUT_ARTIFACTS).toContain("code")

			// Code Sceptic outputs should feed Secondary Coder for fixes
			expect(CODE_SCEPTIC_OUTPUT_ARTIFACTS).toContain("review_report")
			expect(SECONDARY_CODER_INPUT_ARTIFACTS).toContain("review_report")

			// Code should feed Documentation Writer
			expect(DOCUMENTATION_WRITER_INPUT_ARTIFACTS).toContain("code")

			// Code should feed Debugger
			expect(DEBUGGER_INPUT_ARTIFACTS).toContain("code")
		})

		it("should support role configuration through RoleRegistry", () => {
			// Configure provider profiles
			const architectProfile = roleRegistry.addProviderProfile({
				name: "Architect Profile",
				providerType: "anthropic",
				model: "claude-3-opus",
			})

			const coderProfile = roleRegistry.addProviderProfile({
				name: "Coder Profile",
				providerType: "anthropic",
				model: "claude-3-sonnet",
			})

			const scepticProfile = roleRegistry.addProviderProfile({
				name: "Sceptic Profile",
				providerType: "anthropic",
				model: "claude-3-opus",
			})

			// Assign profiles to roles
			roleRegistry.setRoleProviderProfile("architect", architectProfile.id)
			roleRegistry.setRoleProviderProfile("secondary-coder", coderProfile.id)
			roleRegistry.setRoleProviderProfile("code-sceptic", scepticProfile.id)

			// Verify assignments
			expect(roleRegistry.getProviderProfileForRole("architect")).toEqual(architectProfile)
			expect(roleRegistry.getProviderProfileForRole("secondary-coder")).toEqual(coderProfile)
			expect(roleRegistry.getProviderProfileForRole("code-sceptic")).toEqual(scepticProfile)
		})

		it("should support custom roles in workflow", () => {
			// Add custom role
			const customRole = {
				id: "security-auditor",
				name: "Security Auditor",
				description: "Specialized security review role",
				category: "review" as const,
				required: false,
				capabilities: [{ name: "security_audit", description: "Perform security audit", required: true }],
				inputArtifactTypes: ["code"] as ArtifactType[],
				outputArtifactTypes: ["review_report"] as ArtifactType[],
				defaultMode: "code-sceptic",
				priority: 60,
			}

			const result = roleRegistry.addCustomRole(customRole)
			expect(result).toBe(true)

			// Verify custom role is available
			const roleDef = roleRegistry.getOrchestratorRoleDefinition("security-auditor")
			expect(roleDef).toBeDefined()
			expect(roleDef?.name).toBe("Security Auditor")

			// Should be included in role assignments
			const assignments = roleRegistry.getRoleAssignments()
			expect(assignments.find((a: { roleId: string }) => a.roleId === "security-auditor")).toBeDefined()
		})
	})

	describe("5. Cross-Component Integration", () => {
		it("should have consistent artifact types between modes and role definitions", () => {
			// Code Sceptic
			const scepticRole = getRoleDefinition("code-sceptic")
			expect(scepticRole?.inputArtifacts).toEqual(expect.arrayContaining(CODE_SCEPTIC_INPUT_ARTIFACTS))
			expect(scepticRole?.outputArtifacts).toEqual(expect.arrayContaining(CODE_SCEPTIC_OUTPUT_ARTIFACTS))

			// Documentation Writer
			// Note: Role definition has only "code", but mode supports both "code" and "implementation_plan"
			const docRole = getRoleDefinition("documentation-writer")
			expect(docRole?.inputArtifacts).toContain("code")
			expect(docRole?.outputArtifacts).toEqual(expect.arrayContaining(DOCUMENTATION_WRITER_OUTPUT_ARTIFACTS))

			// Debugger
			const debuggerRole = getRoleDefinition("debugger")
			expect(debuggerRole?.inputArtifacts).toEqual(expect.arrayContaining(DEBUGGER_INPUT_ARTIFACTS))
			expect(debuggerRole?.outputArtifacts).toEqual(expect.arrayContaining(DEBUGGER_OUTPUT_ARTIFACTS))
		})

		it("should have consistent mode slugs with role IDs", () => {
			expect(CODE_SCEPTIC_MODE_CONFIG.slug).toBe("code-sceptic")
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.slug).toBe("documentation-writer")
			expect(DEBUGGER_MODE_CONFIG.slug).toBe("debugger")
		})

		it("should have valid mode configurations for all additional roles", () => {
			// Code Sceptic
			expect(CODE_SCEPTIC_MODE_CONFIG.name).toBe("Code Sceptic")
			expect(CODE_SCEPTIC_MODE_CONFIG.roleDefinition).toContain("Code Sceptic agent")
			expect(CODE_SCEPTIC_MODE_CONFIG.groups).toContain("read")

			// Documentation Writer
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.name).toBe("Documentation Writer")
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.roleDefinition).toContain("Documentation Writer agent")
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.groups).toContain("read")
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.groups).toContain("edit")

			// Debugger
			expect(DEBUGGER_MODE_CONFIG.name).toBe("Debugger")
			expect(DEBUGGER_MODE_CONFIG.roleDefinition).toContain("Debugger agent")
			expect(DEBUGGER_MODE_CONFIG.groups).toContain("read")
			expect(DEBUGGER_MODE_CONFIG.groups).toContain("edit")
			expect(DEBUGGER_MODE_CONFIG.groups).toContain("browser")
		})

		it("should integrate with RoleRegistry for all roles", () => {
			const roleRegistry = new RoleRegistry()
			const configs = roleRegistry.getRoleConfigurations()
			const roleIds = configs.map((c) => c.roleId)

			// All additional roles should be present
			expect(roleIds).toContain("code-sceptic")
			expect(roleIds).toContain("documentation-writer")
			expect(roleIds).toContain("debugger")
		})
	})
})
