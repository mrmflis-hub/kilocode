// kilocode_change - new file
/**
 * Integration tests for Core Roles
 *
 * Tests the integration between:
 * - OrchestratorAgent
 * - WorkflowStateMachine
 * - AgentPoolManager
 * - MessageRouter
 * - RoleRegistry
 * - Mode configurations (Architect, Primary Coder, Secondary Coder)
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

// Import mode configurations
import {
	ARCHITECT_MODE_CONFIG,
	ARCHITECT_INPUT_ARTIFACTS,
	ARCHITECT_OUTPUT_ARTIFACTS,
	validateArchitectTaskRequest,
	type ArchitectTaskRequest,
} from "../../modes/ArchitectMode"
import {
	PRIMARY_CODER_MODE_CONFIG,
	PRIMARY_CODER_INPUT_ARTIFACTS,
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
	type CodeScepticTaskRequest,
} from "../../modes/CodeScepticMode"
import {
	DOCUMENTATION_WRITER_MODE_CONFIG,
	DOCUMENTATION_WRITER_INPUT_ARTIFACTS,
	DOCUMENTATION_WRITER_OUTPUT_ARTIFACTS,
	validateDocumentationWriterTaskRequest,
	type DocumentationWriterTaskRequest,
} from "../../modes/DocumentationWriterMode"
import {
	DEBUGGER_MODE_CONFIG,
	DEBUGGER_INPUT_ARTIFACTS,
	DEBUGGER_OUTPUT_ARTIFACTS,
	validateDebuggerTaskRequest,
	type DebuggerTaskRequest,
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

describe("Core Roles Integration Tests", () => {
	describe("1. Mode Configuration Validation", () => {
		it("should have valid architect mode configuration", () => {
			expect(ARCHITECT_MODE_CONFIG.slug).toBe("architect")
			expect(ARCHITECT_MODE_CONFIG.name).toBe("Architect")
			expect(ARCHITECT_MODE_CONFIG.roleDefinition).toContain("Architect agent")
			expect(ARCHITECT_MODE_CONFIG.groups).toContain("read")
			expect(ARCHITECT_MODE_CONFIG.customInstructions).toContain("Multi-Agent Orchestration Context")
		})

		it("should have correct architect input/output artifact types", () => {
			expect(ARCHITECT_INPUT_ARTIFACTS).toContain("user_task")
			expect(ARCHITECT_OUTPUT_ARTIFACTS).toContain("implementation_plan")
		})

		it("should validate architect task requests correctly", () => {
			const validRequest: ArchitectTaskRequest = {
				taskType: "create_plan",
				userTask: "Implement feature X",
			}
			expect(validateArchitectTaskRequest(validRequest)).toBe(true)

			const invalidRequest = {
				taskType: "invalid_type",
				userTask: "Implement feature X",
			} as unknown as ArchitectTaskRequest
			expect(validateArchitectTaskRequest(invalidRequest)).toBe(false)

			const missingTask = {
				taskType: "create_plan",
			} as ArchitectTaskRequest
			expect(validateArchitectTaskRequest(missingTask)).toBe(false)
		})

		it("should have valid primary coder mode configuration", () => {
			expect(PRIMARY_CODER_MODE_CONFIG.slug).toBe("primary-coder")
			expect(PRIMARY_CODER_MODE_CONFIG.name).toBe("Primary Coder")
			expect(PRIMARY_CODER_MODE_CONFIG.roleDefinition).toContain("Primary Coder agent")
			expect(PRIMARY_CODER_MODE_CONFIG.groups).toContain("read")
			expect(PRIMARY_CODER_MODE_CONFIG.groups).toContain("edit")
		})

		it("should have correct primary coder input/output artifact types", () => {
			expect(PRIMARY_CODER_INPUT_ARTIFACTS).toContain("implementation_plan")
			expect(PRIMARY_CODER_OUTPUT_ARTIFACTS).toContain("pseudocode")
		})

		it("should validate primary coder task requests correctly", () => {
			const validRequest: PrimaryCoderTaskRequest = {
				taskType: "create_structure",
				userTask: "Create file structure",
			}
			expect(validatePrimaryCoderTaskRequest(validRequest)).toBe(true)

			const invalidRequest = {
				taskType: "invalid_type",
				userTask: "Create file structure",
			} as unknown as PrimaryCoderTaskRequest
			expect(validatePrimaryCoderTaskRequest(invalidRequest)).toBe(false)
		})

		it("should have valid secondary coder mode configuration", () => {
			expect(SECONDARY_CODER_MODE_CONFIG.slug).toBe("secondary-coder")
			expect(SECONDARY_CODER_MODE_CONFIG.name).toBe("Secondary Coder")
			expect(SECONDARY_CODER_MODE_CONFIG.roleDefinition).toContain("Secondary Coder agent")
			expect(SECONDARY_CODER_MODE_CONFIG.groups).toContain("read")
			expect(SECONDARY_CODER_MODE_CONFIG.groups).toContain("edit")
		})

		it("should have correct secondary coder input/output artifact types", () => {
			expect(SECONDARY_CODER_INPUT_ARTIFACTS).toContain("pseudocode")
			expect(SECONDARY_CODER_INPUT_ARTIFACTS).toContain("review_report")
			expect(SECONDARY_CODER_OUTPUT_ARTIFACTS).toContain("code")
		})

		it("should validate secondary coder task requests correctly", () => {
			// implement_code requires pseudocodeId in context
			const validRequestWithContext: SecondaryCoderTaskRequest = {
				taskType: "implement_code",
				userTask: "Implement the code",
				context: {
					pseudocodeId: "pseudo-1",
				},
			}
			expect(validateSecondaryCoderTaskRequest(validRequestWithContext)).toBe(true)

			// write_tests doesn't require context
			const validRequestWriteTests: SecondaryCoderTaskRequest = {
				taskType: "write_tests",
				userTask: "Write tests",
			}
			expect(validateSecondaryCoderTaskRequest(validRequestWriteTests)).toBe(true)

			// implement_code without pseudocodeId should fail
			const invalidRequestMissingContext: SecondaryCoderTaskRequest = {
				taskType: "implement_code",
				userTask: "Implement the code",
			}
			expect(validateSecondaryCoderTaskRequest(invalidRequestMissingContext)).toBe(false)

			const invalidRequest = {
				taskType: "invalid_type",
				userTask: "Implement the code",
			} as unknown as SecondaryCoderTaskRequest
			expect(validateSecondaryCoderTaskRequest(invalidRequest)).toBe(false)
		})

		it("should have valid code sceptic mode configuration", () => {
			expect(CODE_SCEPTIC_MODE_CONFIG.slug).toBe("code-sceptic")
			expect(CODE_SCEPTIC_MODE_CONFIG.name).toBe("Code Sceptic")
			expect(CODE_SCEPTIC_MODE_CONFIG.roleDefinition).toContain("Code Sceptic agent")
			expect(CODE_SCEPTIC_MODE_CONFIG.groups).toContain("read")
			expect(CODE_SCEPTIC_MODE_CONFIG.groups).toContain("browser")
		})

		it("should have correct code sceptic input/output artifact types", () => {
			expect(CODE_SCEPTIC_INPUT_ARTIFACTS).toContain("implementation_plan")
			expect(CODE_SCEPTIC_INPUT_ARTIFACTS).toContain("code")
			expect(CODE_SCEPTIC_OUTPUT_ARTIFACTS).toContain("review_report")
		})

		it("should validate code sceptic task requests correctly", () => {
			// review_plan with artifactId in context
			const validPlanReview: CodeScepticTaskRequest = {
				taskType: "review_plan",
				userTask: "Review the implementation plan",
				context: {
					artifactId: "plan-1",
				},
			}
			expect(validateCodeScepticTaskRequest(validPlanReview)).toBe(true)

			// review_code with artifactId in context
			const validCodeReview: CodeScepticTaskRequest = {
				taskType: "review_code",
				userTask: "Review the code",
				context: {
					artifactId: "code-1",
				},
			}
			expect(validateCodeScepticTaskRequest(validCodeReview)).toBe(true)

			// review_security with artifactId in context
			const validSecurityReview: CodeScepticTaskRequest = {
				taskType: "review_security",
				userTask: "Review security",
				context: {
					artifactId: "code-1",
				},
			}
			expect(validateCodeScepticTaskRequest(validSecurityReview)).toBe(true)

			// review_performance with artifactId in context
			const validPerformanceReview: CodeScepticTaskRequest = {
				taskType: "review_performance",
				userTask: "Review performance",
				context: {
					artifactId: "code-1",
				},
			}
			expect(validateCodeScepticTaskRequest(validPerformanceReview)).toBe(true)

			// Invalid task type
			const invalidRequest = {
				taskType: "invalid_type",
				userTask: "Review something",
			} as unknown as CodeScepticTaskRequest
			expect(validateCodeScepticTaskRequest(invalidRequest)).toBe(false)

			// Missing userTask
			const missingTask = {
				taskType: "review_code",
			} as CodeScepticTaskRequest
			expect(validateCodeScepticTaskRequest(missingTask)).toBe(false)
		})

		it("should have valid documentation writer mode configuration", () => {
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.slug).toBe("documentation-writer")
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.name).toBe("Documentation Writer")
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.roleDefinition).toContain("Documentation Writer agent")
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.groups).toContain("read")
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.groups).toContain("edit")
		})

		it("should have correct documentation writer input/output artifact types", () => {
			expect(DOCUMENTATION_WRITER_INPUT_ARTIFACTS).toContain("code")
			expect(DOCUMENTATION_WRITER_INPUT_ARTIFACTS).toContain("implementation_plan")
			expect(DOCUMENTATION_WRITER_OUTPUT_ARTIFACTS).toContain("documentation")
		})

		it("should validate documentation writer task requests correctly", () => {
			// document with artifactId in context
			const validDocument: DocumentationWriterTaskRequest = {
				taskType: "document",
				userTask: "Document the code",
				context: {
					artifactId: "code-1",
				},
			}
			expect(validateDocumentationWriterTaskRequest(validDocument)).toBe(true)

			// document_api with artifactId in context
			const validApiDoc: DocumentationWriterTaskRequest = {
				taskType: "document_api",
				userTask: "Document the API",
				context: {
					artifactId: "code-1",
				},
			}
			expect(validateDocumentationWriterTaskRequest(validApiDoc)).toBe(true)

			// create_readme without artifactId (allowed)
			const validReadme: DocumentationWriterTaskRequest = {
				taskType: "create_readme",
				userTask: "Create README",
			}
			expect(validateDocumentationWriterTaskRequest(validReadme)).toBe(true)

			// create_user_guide without artifactId (allowed)
			const validUserGuide: DocumentationWriterTaskRequest = {
				taskType: "create_user_guide",
				userTask: "Create user guide",
			}
			expect(validateDocumentationWriterTaskRequest(validUserGuide)).toBe(true)

			// create_contributing_guide without artifactId (allowed)
			const validContributing: DocumentationWriterTaskRequest = {
				taskType: "create_contributing_guide",
				userTask: "Create contributing guide",
			}
			expect(validateDocumentationWriterTaskRequest(validContributing)).toBe(true)

			// Invalid task type
			const invalidRequest = {
				taskType: "invalid_type",
				userTask: "Document something",
			} as unknown as DocumentationWriterTaskRequest
			expect(validateDocumentationWriterTaskRequest(invalidRequest)).toBe(false)

			// Missing userTask
			const missingTask = {
				taskType: "document",
			} as DocumentationWriterTaskRequest
			expect(validateDocumentationWriterTaskRequest(missingTask)).toBe(false)

			// document without artifactId should fail
			const missingArtifact: DocumentationWriterTaskRequest = {
				taskType: "document",
				userTask: "Document the code",
			}
			expect(validateDocumentationWriterTaskRequest(missingArtifact)).toBe(false)
		})

		it("should have valid debugger mode configuration", () => {
			expect(DEBUGGER_MODE_CONFIG.slug).toBe("debugger")
			expect(DEBUGGER_MODE_CONFIG.name).toBe("Debugger")
			expect(DEBUGGER_MODE_CONFIG.roleDefinition).toContain("Debugger agent")
			expect(DEBUGGER_MODE_CONFIG.groups).toContain("read")
			expect(DEBUGGER_MODE_CONFIG.groups).toContain("edit")
			expect(DEBUGGER_MODE_CONFIG.groups).toContain("browser")
			expect(DEBUGGER_MODE_CONFIG.groups).toContain("mcp")
		})

		it("should have correct debugger input/output artifact types", () => {
			expect(DEBUGGER_INPUT_ARTIFACTS).toContain("code")
			expect(DEBUGGER_OUTPUT_ARTIFACTS).toContain("test_results")
		})

		it("should validate debugger task requests correctly", () => {
			// run_tests without context (allowed)
			const validRunTests: DebuggerTaskRequest = {
				taskType: "run_tests",
				userTask: "Run all tests",
			}
			expect(validateDebuggerTaskRequest(validRunTests)).toBe(true)

			// debug_failure with failureId in context
			const validDebugFailure: DebuggerTaskRequest = {
				taskType: "debug_failure",
				userTask: "Debug the failing test",
				context: {
					failureId: "failure-1",
				},
			}
			expect(validateDebuggerTaskRequest(validDebugFailure)).toBe(true)

			// debug_failure with testName in context
			const validDebugFailure2: DebuggerTaskRequest = {
				taskType: "debug_failure",
				userTask: "Debug the failing test",
				context: {
					testName: "should return correct value",
				},
			}
			expect(validateDebuggerTaskRequest(validDebugFailure2)).toBe(true)

			// fix_bug with failureId in context
			const validFixBug: DebuggerTaskRequest = {
				taskType: "fix_bug",
				userTask: "Fix the bug",
				context: {
					failureId: "bug-1",
				},
			}
			expect(validateDebuggerTaskRequest(validFixBug)).toBe(true)

			// analyze_coverage without context (allowed)
			const validAnalyzeCoverage: DebuggerTaskRequest = {
				taskType: "analyze_coverage",
				userTask: "Analyze test coverage",
			}
			expect(validateDebuggerTaskRequest(validAnalyzeCoverage)).toBe(true)

			// write_tests without context (allowed)
			const validWriteTests: DebuggerTaskRequest = {
				taskType: "write_tests",
				userTask: "Write tests for the feature",
			}
			expect(validateDebuggerTaskRequest(validWriteTests)).toBe(true)

			// investigate_flaky with testName in context
			const validInvestigateFlaky: DebuggerTaskRequest = {
				taskType: "investigate_flaky",
				userTask: "Investigate flaky test",
				context: {
					testName: "flaky-test-name",
				},
			}
			expect(validateDebuggerTaskRequest(validInvestigateFlaky)).toBe(true)

			// Invalid task type
			const invalidRequest = {
				taskType: "invalid_type",
				userTask: "Do something",
			} as unknown as DebuggerTaskRequest
			expect(validateDebuggerTaskRequest(invalidRequest)).toBe(false)

			// Missing userTask
			const missingTask = {
				taskType: "run_tests",
			} as DebuggerTaskRequest
			expect(validateDebuggerTaskRequest(missingTask)).toBe(false)

			// debug_failure without failureId or testName should fail
			const missingContext: DebuggerTaskRequest = {
				taskType: "debug_failure",
				userTask: "Debug the failing test",
			}
			expect(validateDebuggerTaskRequest(missingContext)).toBe(false)

			// fix_bug without failureId or testName should fail
			const missingFixContext: DebuggerTaskRequest = {
				taskType: "fix_bug",
				userTask: "Fix the bug",
			}
			expect(validateDebuggerTaskRequest(missingFixContext)).toBe(false)
		})
	})

	describe("2. Role Registry Integration", () => {
		let roleRegistry: RoleRegistry

		beforeEach(() => {
			roleRegistry = new RoleRegistry()
		})

		it("should initialize with default role configurations", () => {
			const configs = roleRegistry.getRoleConfigurations()
			expect(configs.length).toBeGreaterThan(0)

			// Check that required roles are present
			const roleIds = configs.map((c) => c.roleId)
			expect(roleIds).toContain("architect")
			expect(roleIds).toContain("primary-coder")
			expect(roleIds).toContain("secondary-coder")
			expect(roleIds).toContain("code-sceptic")
			expect(roleIds).toContain("documentation-writer")
			expect(roleIds).toContain("debugger")
		})

		it("should get role configuration by ID", () => {
			const architectConfig = roleRegistry.getRoleConfiguration("architect")
			expect(architectConfig).toBeDefined()
			expect(architectConfig?.roleId).toBe("architect")
		})

		it("should update role configuration", () => {
			roleRegistry.updateRoleConfiguration("architect", {
				providerProfileId: "profile-1",
				enabled: true,
			})

			const config = roleRegistry.getRoleConfiguration("architect")
			expect(config?.providerProfileId).toBe("profile-1")
			expect(config?.enabled).toBe(true)
		})

		it("should manage provider profiles", () => {
			const profile = {
				name: "Test Profile",
				providerType: "anthropic",
				model: "claude-3-opus",
			}

			const addedProfile = roleRegistry.addProviderProfile(profile)
			expect(addedProfile.id).toBeDefined()
			expect(addedProfile.name).toBe("Test Profile")

			const profiles = roleRegistry.getProviderProfiles()
			expect(profiles.find((p) => p.name === "Test Profile")).toBeDefined()

			roleRegistry.deleteProviderProfile(addedProfile.id)
			const updatedProfiles = roleRegistry.getProviderProfiles()
			expect(updatedProfiles.find((p) => p.name === "Test Profile")).toBeUndefined()
		})

		it("should get provider profile for role", () => {
			const addedProfile = roleRegistry.addProviderProfile({
				name: "Architect Profile",
				providerType: "anthropic",
				model: "claude-3-opus",
			})

			roleRegistry.updateRoleConfiguration("architect", {
				providerProfileId: addedProfile.id,
			})

			const retrievedProfile = roleRegistry.getProviderProfileForRole("architect")
			expect(retrievedProfile).toBeDefined()
			expect(retrievedProfile?.id).toBe(addedProfile.id)
		})

		it("should get mode for role", () => {
			const mode = roleRegistry.getModeForRole("architect")
			expect(mode).toBe("architect")

			// Primary coder mode falls back to code mode
			const coderMode = roleRegistry.getModeForRole("primary-coder")
			expect(coderMode).toBeDefined()
		})

		it("should emit configuration change events", () => {
			const changeListener = vi.fn()
			roleRegistry.on("roleConfigChanged", changeListener)

			roleRegistry.updateRoleConfiguration("architect", {
				providerProfileId: "new-profile",
			})

			expect(changeListener).toHaveBeenCalled()
		})
	})

	describe("3. Workflow State Machine Integration", () => {
		let stateMachine: WorkflowStateMachine

		beforeEach(() => {
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
		})

		afterEach(() => {
			stateMachine.dispose()
		})

		it("should transition through planning workflow states", () => {
			// Start task
			stateMachine.startTask("Test task")
			expect(stateMachine.getState()).toBe("PLANNING")

			// Plan created
			stateMachine.handleArtifactCreated("implementation_plan")
			expect(stateMachine.getState()).toBe("PLAN_REVIEW")

			// Plan approved
			stateMachine.handlePlanReview(true)
			expect(stateMachine.getState()).toBe("STRUCTURE_CREATION")
		})

		it("should transition through code implementation workflow states", () => {
			// Setup: Start from STRUCTURE_CREATION
			stateMachine.startTask("Test task")
			stateMachine.handleArtifactCreated("implementation_plan")
			stateMachine.handlePlanReview(true)

			// Structure created
			stateMachine.handleArtifactCreated("pseudocode")
			expect(stateMachine.getState()).toBe("CODE_IMPLEMENTATION")

			// Code implemented
			stateMachine.handleArtifactCreated("code")
			expect(stateMachine.getState()).toBe("CODE_REVIEW")

			// Code approved
			stateMachine.handleCodeReview(true)
			expect(stateMachine.getState()).toBe("DOCUMENTATION")
		})

		it("should handle plan revision workflow", () => {
			// Setup: Start from PLAN_REVIEW
			stateMachine.startTask("Test task")
			stateMachine.handleArtifactCreated("implementation_plan")

			// Plan needs revision
			stateMachine.handlePlanReview(false)
			expect(stateMachine.getState()).toBe("PLAN_REVISION")

			// Plan revised - transition back to PLAN_REVIEW via plan_revised trigger
			// Note: handleArtifactCreated doesn't handle PLAN_REVISION state for implementation_plan
			// The transition must be done explicitly with the plan_revised trigger
			stateMachine.transition("PLAN_REVIEW", "plan_revised")
			expect(stateMachine.getState()).toBe("PLAN_REVIEW")
		})

		it("should handle code fixing workflow", () => {
			// Setup: Start from CODE_REVIEW
			stateMachine.startTask("Test task")
			stateMachine.handleArtifactCreated("implementation_plan")
			stateMachine.handlePlanReview(true)
			stateMachine.handleArtifactCreated("pseudocode")
			stateMachine.handleArtifactCreated("code")

			// Code needs fixes
			stateMachine.handleCodeReview(false)
			expect(stateMachine.getState()).toBe("CODE_FIXING")

			// Code fixed - transition back to CODE_REVIEW via artifact creation
			stateMachine.handleArtifactCreated("code")
			expect(stateMachine.getState()).toBe("CODE_REVIEW")
		})

		it("should handle pause and resume", () => {
			stateMachine.startTask("Test task")
			expect(stateMachine.getState()).toBe("PLANNING")

			stateMachine.pause()
			expect(stateMachine.getState()).toBe("PAUSED")

			stateMachine.resume()
			expect(stateMachine.getState()).toBe("PLANNING")
		})

		it("should track artifacts in context", () => {
			stateMachine.startTask("Test task")
			stateMachine.addArtifact("artifact-1")
			stateMachine.addArtifact("artifact-2")

			const context = stateMachine.getContext()
			expect(context.artifacts).toContain("artifact-1")
			expect(context.artifacts).toContain("artifact-2")
		})

		it("should track agents in context", () => {
			stateMachine.startTask("Test task")
			stateMachine.addAgent("agent-1")
			stateMachine.addAgent("agent-2")

			const context = stateMachine.getContext()
			expect(context.agents).toContain("agent-1")
			expect(context.agents).toContain("agent-2")
		})

		it("should emit state change events", () => {
			const stateChangeListener = vi.fn()
			stateMachine.on("stateChange", stateChangeListener)

			stateMachine.startTask("Test task")

			expect(stateChangeListener).toHaveBeenCalled()
			const event = stateChangeListener.mock.calls[0][0]
			expect(event.previousState).toBe("IDLE")
			expect(event.newState).toBe("PLANNING")
		})
	})

	describe("4. Agent Pool Manager Integration", () => {
		let mockProcessHandler: MockProcessHandler
		let registry: AgentRegistry
		let messageRouter: MessageRouter
		let fileLockingService: any
		let agentPoolManager: AgentPoolManager
		let tempDir: string

		beforeEach(async () => {
			// Create temporary directory
			tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "core-roles-test-"))

			// Create mock process handler
			mockProcessHandler = createMockProcessHandler()

			// Create registry
			registry = new AgentRegistry()

			// Create file locking service mock
			fileLockingService = createMockFileLockingService()

			// Create message router
			messageRouter = new MessageRouter({} as AgentPoolManager, mockProcessHandler as unknown as any)

			// Create agent pool manager with options object
			agentPoolManager = new AgentPoolManager(
				mockProcessHandler as unknown as any,
				registry,
				messageRouter,
				fileLockingService,
				{ maxConcurrentAgents: 5 },
			)

			// Set the pool manager reference in message router
			// @ts-expect-error - accessing private property for testing
			messageRouter.agentPoolManager = agentPoolManager
		})

		afterEach(async () => {
			agentPoolManager.dispose()
			messageRouter.dispose()
			fileLockingService.dispose()

			// Clean up temp directory
			await fs.rm(tempDir, { recursive: true, force: true })
		})

		it("should spawn agent and track it", async () => {
			const config: AgentSpawnConfig = {
				agentId: "test-agent-1",
				role: "architect",
				providerProfile: "anthropic",
				mode: "architect",
				workspace: tempDir,
			}

			// Spawn agent
			const agentId = await agentPoolManager.spawnAgent(config)
			expect(agentId).toBe("test-agent-1")

			// Verify agent is tracked
			const agent = agentPoolManager.getAgent(agentId)
			expect(agent).toBeDefined()
			expect(agent?.status).toBe("spawning")
		})

		it("should handle concurrent agents - spawn and activate to count toward limit", async () => {
			const agents: string[] = []

			// Spawn 3 agents
			for (let i = 0; i < 3; i++) {
				const agentId = await agentPoolManager.spawnAgent({
					agentId: `agent-${i}`,
					role: "coder",
					providerProfile: "anthropic",
					mode: "code",
					workspace: tempDir,
				})
				agents.push(agentId)
			}

			expect(agents).toHaveLength(3)

			// Activate all agents - now they should count toward the limit
			for (let i = 0; i < 3; i++) {
				simulateAgentEvent(agentPoolManager, agents[i], `session-${i}`, {
					type: "session_created",
				})
			}

			// Now active count should be 3
			expect(agentPoolManager.getActiveAgentCount()).toBe(3)
		})

		it("should get all agents including stopped/error states", async () => {
			const agentId = await agentPoolManager.spawnAgent({
				agentId: "lifecycle-agent",
				role: "coder",
				providerProfile: "anthropic",
				mode: "code",
				workspace: tempDir,
			})

			expect(agentId).toBe("lifecycle-agent")

			// Get all agents should include spawning agent
			const allAgents = agentPoolManager.getAllAgents()
			expect(allAgents).toHaveLength(1)
			expect(allAgents[0]?.agentId).toBe("lifecycle-agent")
		})

		it("should throw error when agent ID already exists", async () => {
			const config: AgentSpawnConfig = {
				agentId: "duplicate-test",
				role: "architect",
				providerProfile: "anthropic",
				mode: "architect",
				workspace: tempDir,
			}

			await agentPoolManager.spawnAgent(config)

			await expect(agentPoolManager.spawnAgent(config)).rejects.toThrow(
				"Agent with ID duplicate-test already exists",
			)
		})

		it("should get agent by ID", async () => {
			const agentId = await agentPoolManager.spawnAgent({
				agentId: "get-test-agent",
				role: "coder",
				providerProfile: "anthropic",
				mode: "code",
				workspace: tempDir,
			})

			const agent = agentPoolManager.getAgent(agentId)
			expect(agent).toBeDefined()
			expect(agent?.agentId).toBe("get-test-agent")
		})
	})

	describe("5. Message Router Request/Response Integration", () => {
		let mockProcessHandler: MockProcessHandler
		let mockAgentPoolManager: any
		let messageRouter: MessageRouter

		beforeEach(() => {
			mockProcessHandler = createMockProcessHandler()
			mockAgentPoolManager = {
				getAgent: vi.fn(),
				getActiveAgents: vi.fn(() => []),
			}

			messageRouter = new MessageRouter(
				mockAgentPoolManager as unknown as AgentPoolManager,
				mockProcessHandler as unknown as any,
			)
		})

		afterEach(() => {
			messageRouter.dispose()
		})

		it("should route direct messages to specific ready agents via IPC", async () => {
			// Create a ready agent for direct messaging
			const mockAgent: AgentInstance = {
				agentId: "test-agent",
				role: "coder",
				mode: "code",
				providerProfile: "anthropic",
				status: "ready",
				sessionId: "session-1",
				spawnedAt: Date.now(),
				lastActivityAt: Date.now(),
			}
			mockAgentPoolManager.getAgent.mockReturnValue(mockAgent)

			const directMessage: AgentMessage = {
				id: "direct-1",
				type: "request",
				from: "organiser",
				to: "test-agent",
				timestamp: Date.now(),
				payload: {
					task: "Execute task",
					taskType: "execute",
					context: {
						artifactIds: [],
						instructions: "Do the thing",
					},
				},
			}

			await messageRouter.routeMessage(directMessage)

			// Message should be sent via IPC to the agent's session
			expect(mockProcessHandler.sendMessage).toHaveBeenCalledWith(
				"session-1",
				expect.objectContaining({
					type: "agentMessage",
					message: directMessage,
				}),
			)
		})

		it("should broadcast messages to all active agents via IPC", async () => {
			// Create agents with ready status (required for getActiveAgents)
			const agent1: AgentInstance = {
				agentId: "listener-1",
				role: "coder",
				mode: "code",
				providerProfile: "anthropic",
				status: "ready",
				sessionId: "session-1",
				spawnedAt: Date.now(),
				lastActivityAt: Date.now(),
			}
			const agent2: AgentInstance = {
				agentId: "listener-2",
				role: "coder",
				mode: "code",
				providerProfile: "anthropic",
				status: "ready",
				sessionId: "session-2",
				spawnedAt: Date.now(),
				lastActivityAt: Date.now(),
			}

			mockAgentPoolManager.getActiveAgents.mockReturnValue([agent1, agent2])
			mockAgentPoolManager.getAgent.mockImplementation((id: string) => {
				if (id === "listener-1") return agent1
				if (id === "listener-2") return agent2
				return undefined
			})

			// Subscribe both agents (subscriptions don't affect IPC delivery)
			messageRouter.subscribe("listener-1", async () => {})
			messageRouter.subscribe("listener-2", async () => {})

			// Send broadcast message
			const broadcastMessage: AgentMessage = {
				id: "broadcast-1",
				type: "notification",
				from: "organiser",
				to: "broadcast",
				timestamp: Date.now(),
				payload: {
					notificationType: "shutdown",
					reason: "Maintenance",
				},
			}

			await messageRouter.routeMessage(broadcastMessage)

			// Both agents should receive the message via IPC
			expect(mockProcessHandler.sendMessage).toHaveBeenCalledTimes(2)
			expect(mockProcessHandler.sendMessage).toHaveBeenCalledWith(
				"session-1",
				expect.objectContaining({
					type: "agentMessage",
					message: broadcastMessage,
				}),
			)
			expect(mockProcessHandler.sendMessage).toHaveBeenCalledWith(
				"session-2",
				expect.objectContaining({
					type: "agentMessage",
					message: broadcastMessage,
				}),
			)
		})

		it("should queue messages for agents that are not ready", async () => {
			// Create a spawning agent (not ready)
			const spawningAgent: AgentInstance = {
				agentId: "spawning-agent",
				role: "coder",
				mode: "code",
				providerProfile: "anthropic",
				status: "spawning",
				spawnedAt: Date.now(),
				lastActivityAt: Date.now(),
			}

			mockAgentPoolManager.getAgent.mockReturnValue(spawningAgent)

			const message: AgentMessage = {
				id: "queued-1",
				type: "request",
				from: "organiser",
				to: "spawning-agent",
				timestamp: Date.now(),
				payload: {
					task: "Wait for agent",
					taskType: "analyze",
					context: {
						artifactIds: [],
						instructions: "Wait for agent to be ready",
					},
				},
			}

			await messageRouter.routeMessage(message)

			// Message should NOT be sent via IPC since agent is not ready
			expect(mockProcessHandler.sendMessage).not.toHaveBeenCalled()
		})

		it("should throw error for unknown target agent", async () => {
			mockAgentPoolManager.getAgent.mockReturnValue(undefined)

			const message: AgentMessage = {
				id: "unknown-1",
				type: "request",
				from: "organiser",
				to: "unknown-agent",
				timestamp: Date.now(),
				payload: {
					task: "Find agent",
					taskType: "plan",
					context: {
						artifactIds: [],
						instructions: "Find the unknown agent",
					},
				},
			}

			await expect(messageRouter.routeMessage(message)).rejects.toThrow("Target agent unknown-agent not found")
		})
	})

	describe("6. Agent Registry Multi-Agent Session Integration", () => {
		let registry: AgentRegistry
		let roleRegistry: RoleRegistry

		beforeEach(() => {
			registry = new AgentRegistry()
			roleRegistry = new RoleRegistry()
		})

		it("should create multi-agent session with role configuration", () => {
			const session = registry.createMultiAgentSession({
				workspace: "/test/workspace",
				userTask: "Implement feature X",
			})

			expect(session.sessionId).toBeDefined()
			expect(session.userTask).toBe("Implement feature X")
			expect(session.status).toBe("initializing")
		})

		it("should add agents with roles to session", () => {
			const session = registry.createMultiAgentSession({
				workspace: "/test/workspace",
				userTask: "Test task",
			})

			registry.addAgentToSession(session.sessionId, "architect-1", "architect")
			registry.addAgentToSession(session.sessionId, "coder-1", "primary-coder")

			const sessionData = registry.getMultiAgentSession(session.sessionId)
			expect(sessionData?.agents).toHaveLength(2)

			// Verify role assignments
			const architect = sessionData?.agents.find((a: { agentId: string }) => a.agentId === "architect-1")
			expect(architect?.role).toBe("architect")
		})

		it("should track artifact summaries in session", () => {
			const session = registry.createMultiAgentSession({
				workspace: "/test/workspace",
				userTask: "Test task",
			})

			registry.addArtifactToSession(session.sessionId, {
				artifactId: "plan-1",
				artifactType: "implementation_plan",
				summary: "Implementation plan",
				status: "completed",
				producerRole: "architect",
			})

			registry.addArtifactToSession(session.sessionId, {
				artifactId: "code-1",
				artifactType: "code",
				summary: "Code implementation",
				status: "completed",
				producerRole: "secondary-coder",
			})

			const artifacts = registry.getArtifactSummariesForSession(session.sessionId)
			expect(artifacts).toHaveLength(2)
		})

		it("should update workflow state in session", () => {
			const session = registry.createMultiAgentSession({
				workspace: "/test/workspace",
				userTask: "Test task",
			})

			registry.updateMultiAgentSessionWorkflowState(session.sessionId, "PLANNING", "Creating implementation plan")

			const sessionData = registry.getMultiAgentSession(session.sessionId)
			expect(sessionData?.workflowState).toBe("PLANNING")
			expect(sessionData?.currentStepDescription).toBe("Creating implementation plan")
		})

		it("should integrate with role registry for configuration", () => {
			// Configure roles
			const addedProfile = roleRegistry.addProviderProfile({
				name: "Test Profile",
				providerType: "anthropic",
				model: "claude-3-opus",
			})

			roleRegistry.updateRoleConfiguration("architect", {
				providerProfileId: addedProfile.id,
				enabled: true,
			})

			// Create session
			const session = registry.createMultiAgentSession({
				workspace: "/test/workspace",
				userTask: "Test task",
			})

			registry.addAgentToSession(session.sessionId, "architect-1", "architect")

			// Verify role configuration is accessible
			const config = roleRegistry.getRoleConfiguration("architect")
			expect(config?.providerProfileId).toBe(addedProfile.id)
		})
	})

	describe("7. Mode Configuration Integration", () => {
		it("should have consistent artifact types across modes", () => {
			// Architect outputs should be compatible with Primary Coder inputs
			expect(ARCHITECT_OUTPUT_ARTIFACTS).toContain("implementation_plan")
			expect(PRIMARY_CODER_INPUT_ARTIFACTS).toContain("implementation_plan")

			// Primary Coder outputs should be compatible with Secondary Coder inputs
			expect(PRIMARY_CODER_OUTPUT_ARTIFACTS).toContain("pseudocode")
			expect(SECONDARY_CODER_INPUT_ARTIFACTS).toContain("pseudocode")

			// Code Sceptic can review both plans and code
			expect(CODE_SCEPTIC_INPUT_ARTIFACTS).toContain("implementation_plan")
			expect(CODE_SCEPTIC_INPUT_ARTIFACTS).toContain("code")
			expect(CODE_SCEPTIC_OUTPUT_ARTIFACTS).toContain("review_report")

			// Secondary Coder can consume review reports
			expect(SECONDARY_CODER_INPUT_ARTIFACTS).toContain("review_report")

			// Documentation Writer can document code
			expect(DOCUMENTATION_WRITER_INPUT_ARTIFACTS).toContain("code")
			expect(DOCUMENTATION_WRITER_INPUT_ARTIFACTS).toContain("implementation_plan")
			expect(DOCUMENTATION_WRITER_OUTPUT_ARTIFACTS).toContain("documentation")

			// Debugger can test code
			expect(DEBUGGER_INPUT_ARTIFACTS).toContain("code")
			expect(DEBUGGER_OUTPUT_ARTIFACTS).toContain("test_results")
		})

		it("should have valid mode slugs matching role IDs", () => {
			const roleRegistry = new RoleRegistry()
			const configs = roleRegistry.getRoleConfigurations()

			// Check that mode slugs are valid
			expect(ARCHITECT_MODE_CONFIG.slug).toBe("architect")
			expect(PRIMARY_CODER_MODE_CONFIG.slug).toBe("primary-coder")
			expect(SECONDARY_CODER_MODE_CONFIG.slug).toBe("secondary-coder")
			expect(CODE_SCEPTIC_MODE_CONFIG.slug).toBe("code-sceptic")
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.slug).toBe("documentation-writer")
			expect(DEBUGGER_MODE_CONFIG.slug).toBe("debugger")

			// Verify roles exist in registry
			const roleIds = configs.map((c) => c.roleId)
			expect(roleIds).toContain("architect")
			expect(roleIds).toContain("primary-coder")
			expect(roleIds).toContain("secondary-coder")
			expect(roleIds).toContain("code-sceptic")
			expect(roleIds).toContain("documentation-writer")
			expect(roleIds).toContain("debugger")
		})
	})

	describe("8. Custom Role Integration", () => {
		it("should add custom role to role registry", () => {
			const roleRegistry = new RoleRegistry()
			const customRole = {
				id: "custom-integration-role",
				name: "Custom Integration Role",
				description: "A custom role for integration testing",
				category: "implementation" as const,
				required: false,
				capabilities: [{ name: "custom_task", description: "Perform custom task", required: true }],
				inputArtifactTypes: ["implementation_plan"] as ArtifactType[],
				outputArtifactTypes: ["code"] as ArtifactType[],
				defaultMode: "code",
				priority: 35,
			}

			const result = roleRegistry.addCustomRole(customRole)
			expect(result).toBe(true)

			const roleDef = roleRegistry.getOrchestratorRoleDefinition("custom-integration-role")
			expect(roleDef).toBeDefined()
			expect(roleDef?.name).toBe("Custom Integration Role")
		})

		it("should include custom role in role assignments", () => {
			const roleRegistry = new RoleRegistry()
			const customRole = {
				id: "custom-assignment-test",
				name: "Custom Assignment Test",
				description: "Custom role for assignment testing",
				category: "review" as const,
				required: false,
				capabilities: [],
				inputArtifactTypes: ["code"] as ArtifactType[],
				outputArtifactTypes: ["review_report"] as ArtifactType[],
				defaultMode: "code-review",
				priority: 55,
			}

			roleRegistry.addCustomRole(customRole)

			const assignments = roleRegistry.getRoleAssignments()
			const customAssignment = assignments.find((a: { roleId: string }) => a.roleId === "custom-assignment-test")
			expect(customAssignment).toBeDefined()
			expect(customAssignment?.roleName).toBe("Custom Assignment Test")
		})

		it("should assign provider profile to custom role", () => {
			const roleRegistry = new RoleRegistry()
			const customRole = {
				id: "custom-with-profile",
				name: "Custom With Profile",
				description: "Custom role with provider profile",
				category: "implementation" as const,
				required: false,
				capabilities: [],
				inputArtifactTypes: [] as ArtifactType[],
				outputArtifactTypes: ["code"] as ArtifactType[],
				defaultMode: "code",
				priority: 40,
			}

			roleRegistry.addCustomRole(customRole)

			const profile = roleRegistry.addProviderProfile({
				name: "Custom Role Provider",
				providerType: "anthropic",
				model: "claude-3-opus",
			})

			roleRegistry.setRoleProviderProfile("custom-with-profile", profile.id)

			const assignedProfile = roleRegistry.getProviderProfileForRole("custom-with-profile")
			expect(assignedProfile).toEqual(profile)
		})

		it("should create agent with custom role in multi-agent session", () => {
			const roleRegistry = new RoleRegistry()
			const registry = new AgentRegistry()
			const customRole = {
				id: "custom-session-role",
				name: "Custom Session Role",
				description: "Custom role for session testing",
				category: "testing" as const,
				required: false,
				capabilities: [],
				inputArtifactTypes: ["code"] as ArtifactType[],
				outputArtifactTypes: ["test_results"] as ArtifactType[],
				defaultMode: "debug",
				priority: 45,
			}

			roleRegistry.addCustomRole(customRole)

			const session = registry.createMultiAgentSession({
				workspace: "/test/workspace",
				userTask: "Test custom role in session",
			})

			registry.addAgentToSession(session.sessionId, "custom-agent-1", "custom-session-role")

			const sessionData = registry.getMultiAgentSession(session.sessionId)
			const customAgent = sessionData?.agents.find((a: { agentId: string }) => a.agentId === "custom-agent-1")
			expect(customAgent?.role).toBe("custom-session-role")
		})

		it("should delete custom role and remove from configuration", () => {
			const roleRegistry = new RoleRegistry()
			const customRole = {
				id: "custom-to-delete",
				name: "Custom To Delete",
				description: "Custom role to be deleted",
				category: "implementation" as const,
				required: false,
				capabilities: [],
				inputArtifactTypes: [] as ArtifactType[],
				outputArtifactTypes: [] as ArtifactType[],
				defaultMode: "code",
				priority: 10,
			}

			roleRegistry.addCustomRole(customRole)
			expect(roleRegistry.getOrchestratorRoleDefinition("custom-to-delete")).toBeDefined()

			const result = roleRegistry.deleteCustomRole("custom-to-delete")
			expect(result).toBe(true)
			expect(roleRegistry.getOrchestratorRoleDefinition("custom-to-delete")).toBeUndefined()

			// Verify it's removed from role assignments
			const assignments = roleRegistry.getRoleAssignments()
			expect(assignments.find((a: { roleId: string }) => a.roleId === "custom-to-delete")).toBeUndefined()
		})

		it("should validate custom role artifact compatibility with modes", () => {
			const roleRegistry = new RoleRegistry()
			// Custom role using architect mode should have compatible artifacts
			const customArchitectRole = {
				id: "custom-architect-compatible",
				name: "Custom Architect Compatible",
				description: "Custom role compatible with architect mode",
				category: "planning" as const,
				required: false,
				capabilities: [],
				inputArtifactTypes: [] as ArtifactType[],
				outputArtifactTypes: ["implementation_plan"] as ArtifactType[],
				defaultMode: "architect",
				priority: 85,
			}

			roleRegistry.addCustomRole(customArchitectRole)

			// Verify artifact compatibility
			expect(ARCHITECT_OUTPUT_ARTIFACTS).toContain("implementation_plan")

			// Custom role's output should match architect mode output
			const roleDef = roleRegistry.getOrchestratorRoleDefinition("custom-architect-compatible")
			expect(roleDef?.outputArtifactTypes).toContain("implementation_plan")
		})

		it("should emit events when custom role is added or deleted", () => {
			const roleRegistry = new RoleRegistry()
			const addedHandler = vi.fn()
			const deletedHandler = vi.fn()

			roleRegistry.on("customRoleAdded", addedHandler)
			roleRegistry.on("customRoleDeleted", deletedHandler)

			const customRole = {
				id: "custom-event-test",
				name: "Custom Event Test",
				description: "Custom role for event testing",
				category: "implementation" as const,
				required: false,
				capabilities: [],
				inputArtifactTypes: [] as ArtifactType[],
				outputArtifactTypes: [] as ArtifactType[],
				defaultMode: "code",
				priority: 15,
			}

			roleRegistry.addCustomRole(customRole)
			expect(addedHandler).toHaveBeenCalled()

			roleRegistry.deleteCustomRole("custom-event-test")
			expect(deletedHandler).toHaveBeenCalled()
		})

		it("should support custom role in workflow phases", () => {
			const roleRegistry = new RoleRegistry()
			// Add custom role for planning phase
			const customPlannerRole = {
				id: "custom-planner",
				name: "Custom Planner",
				description: "Custom planning role",
				category: "planning" as const,
				required: false,
				capabilities: [],
				inputArtifactTypes: [] as ArtifactType[],
				outputArtifactTypes: ["implementation_plan"] as ArtifactType[],
				defaultMode: "architect",
				priority: 88,
			}

			roleRegistry.addCustomRole(customPlannerRole)

			// Verify the role is available for planning phase
			const planningRoles = roleRegistry
				.getAllRoleDefinitions()
				.filter((r: { category: string }) => r.category === "planning")
			expect(planningRoles.some((r: { id: string }) => r.id === "custom-planner")).toBe(true)
		})
	})
})
