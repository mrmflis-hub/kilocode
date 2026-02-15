// kilocode_change - new file
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { ContextIntegration } from "../ContextIntegration"
import { CONTEXT_PRIORITY } from "../../../../../services/kilocode/context-monitoring"
import type { OrganiserContext, OrchestratorArtifactSummaryReference } from "../OrchestratorAgent"

describe("ContextIntegration", () => {
	let integration: ContextIntegration

	beforeEach(() => {
		integration = new ContextIntegration({
			maxTokens: 1000,
			autoCompress: false,
			autoArchive: false,
		})
	})

	afterEach(() => {
		integration.dispose()
	})

	describe("constructor", () => {
		it("should create integration with default config", () => {
			const defaultIntegration = new ContextIntegration()
			expect(defaultIntegration).toBeDefined()
			defaultIntegration.dispose()
		})

		it("should create integration with custom config", () => {
			const customIntegration = new ContextIntegration({
				maxTokens: 50000,
				warningThreshold: 50,
			})
			expect(customIntegration).toBeDefined()
			customIntegration.dispose()
		})
	})

	describe("initializeFromContext", () => {
		it("should initialize from an existing context", () => {
			const context: OrganiserContext = {
				userTask: "Test task",
				workflowState: "PLANNING",
				artifacts: [],
				agentStatuses: new Map([["agent_1", "busy"]]),
				currentStep: "step_1",
				modeDescriptions: new Map(),
				todoList: ["todo 1"],
				workflowHistory: ["IDLE", "PLANNING"],
			}

			integration.initializeFromContext(context)

			const stats = integration.getStatistics()
			expect(stats.totalTokens).toBeGreaterThan(0)
			expect(stats.itemsByType.user_task).toBe(1)
			expect(stats.itemsByType.workflow_state).toBe(1)
			expect(stats.itemsByType.agent_status).toBe(1)
			expect(stats.itemsByType.todo_item).toBe(1)
			expect(stats.itemsByType.workflow_history).toBe(2)
		})

		it("should clear existing items when reinitializing", () => {
			const context1: OrganiserContext = {
				userTask: "First task",
				workflowState: "PLANNING",
				artifacts: [],
				agentStatuses: new Map(),
				currentStep: null,
				modeDescriptions: new Map(),
				todoList: [],
				workflowHistory: [],
			}

			integration.initializeFromContext(context1)
			const stats1 = integration.getStatistics()

			const context2: OrganiserContext = {
				userTask: "Second task - much longer task description",
				workflowState: "CODE_IMPLEMENTATION",
				artifacts: [],
				agentStatuses: new Map(),
				currentStep: null,
				modeDescriptions: new Map(),
				todoList: [],
				workflowHistory: [],
			}

			integration.initializeFromContext(context2)
			const stats2 = integration.getStatistics()

			// Should have different token counts
			expect(stats2.totalTokens).not.toBe(stats1.totalTokens)
		})
	})

	describe("addArtifactSummary", () => {
		it("should add artifact summary to tracking", () => {
			const artifact: OrchestratorArtifactSummaryReference = {
				artifactId: "artifact_1",
				artifactType: "implementation_plan",
				summary: "Test artifact summary",
				status: "completed",
				producerRole: "architect",
			}

			const id = integration.addArtifactSummary(artifact)

			expect(id).toBeDefined()
			const stats = integration.getStatistics()
			expect(stats.itemsByType.artifact_summary).toBe(1)
		})
	})

	describe("removeArtifactSummary", () => {
		it("should remove artifact summary from tracking", () => {
			const artifact: OrchestratorArtifactSummaryReference = {
				artifactId: "artifact_1",
				artifactType: "implementation_plan",
				summary: "Test artifact summary",
				status: "completed",
				producerRole: "architect",
			}

			integration.addArtifactSummary(artifact)
			integration.removeArtifactSummary("artifact_1")

			const stats = integration.getStatistics()
			expect(stats.itemsByType.artifact_summary).toBe(0)
		})
	})

	describe("addAgentStatus", () => {
		it("should add agent status to tracking", () => {
			const id = integration.addAgentStatus("agent_1", "busy")

			expect(id).toBeDefined()
			const stats = integration.getStatistics()
			expect(stats.itemsByType.agent_status).toBe(1)
		})
	})

	describe("updateAgentStatus", () => {
		it("should update existing agent status", () => {
			integration.addAgentStatus("agent_1", "busy")
			integration.updateAgentStatus("agent_1", "idle")

			const stats = integration.getStatistics()
			expect(stats.itemsByType.agent_status).toBe(1)
		})

		it("should add new agent status if not exists", () => {
			integration.updateAgentStatus("agent_2", "working")

			const stats = integration.getStatistics()
			expect(stats.itemsByType.agent_status).toBe(1)
		})
	})

	describe("removeAgentStatus", () => {
		it("should remove agent status from tracking", () => {
			integration.addAgentStatus("agent_1", "busy")
			integration.removeAgentStatus("agent_1")

			const stats = integration.getStatistics()
			expect(stats.itemsByType.agent_status).toBe(0)
		})
	})

	describe("addWorkflowHistoryEntry", () => {
		it("should add workflow history entry", () => {
			const id = integration.addWorkflowHistoryEntry("PLANNING")

			expect(id).toBeDefined()
			const stats = integration.getStatistics()
			expect(stats.itemsByType.workflow_history).toBe(1)
		})
	})

	describe("addTodoItem", () => {
		it("should add todo item with default priority", () => {
			const id = integration.addTodoItem("Complete task")

			expect(id).toBeDefined()
			const stats = integration.getStatistics()
			expect(stats.itemsByType.todo_item).toBe(1)
		})

		it("should add todo item with custom priority", () => {
			const id = integration.addTodoItem("Critical task", CONTEXT_PRIORITY.HIGH)

			expect(id).toBeDefined()
		})
	})

	describe("updateUserTask", () => {
		it("should update user task tokens", () => {
			const context: OrganiserContext = {
				userTask: "Initial task",
				workflowState: "IDLE",
				artifacts: [],
				agentStatuses: new Map(),
				currentStep: null,
				modeDescriptions: new Map(),
				todoList: [],
				workflowHistory: [],
			}

			integration.initializeFromContext(context)
			const stats1 = integration.getStatistics()

			integration.updateUserTask("This is a much longer task description that should use more tokens")
			const stats2 = integration.getStatistics()

			expect(stats2.totalTokens).toBeGreaterThan(stats1.totalTokens)
		})
	})

	describe("updateWorkflowState", () => {
		it("should update workflow state tokens", () => {
			const context: OrganiserContext = {
				userTask: "Test task",
				workflowState: "IDLE",
				artifacts: [],
				agentStatuses: new Map(),
				currentStep: null,
				modeDescriptions: new Map(),
				todoList: [],
				workflowHistory: [],
			}

			integration.initializeFromContext(context)
			integration.updateWorkflowState("CODE_IMPLEMENTATION")

			const stats = integration.getStatistics()
			expect(stats.itemsByType.workflow_state).toBe(1)
		})
	})

	describe("getStatistics", () => {
		it("should return current context statistics", () => {
			const context: OrganiserContext = {
				userTask: "Test task",
				workflowState: "PLANNING",
				artifacts: [
					{
						artifactId: "artifact_1",
						artifactType: "implementation_plan",
						summary: "Test plan",
						status: "completed",
						producerRole: "architect",
					},
				],
				agentStatuses: new Map([["agent_1", "busy"]]),
				currentStep: "step_1",
				modeDescriptions: new Map(),
				todoList: ["todo 1"],
				workflowHistory: ["IDLE", "PLANNING"],
			}

			integration.initializeFromContext(context)

			const stats = integration.getStatistics()

			expect(stats.totalTokens).toBeGreaterThan(0)
			expect(stats.maxTokens).toBe(1000)
			expect(stats.usagePercentage).toBeGreaterThan(0)
			expect(stats.usageLevel).toBeDefined()
		})
	})

	describe("getRecommendedAction", () => {
		it("should return none for normal usage", () => {
			const context: OrganiserContext = {
				userTask: "Test",
				workflowState: "IDLE",
				artifacts: [],
				agentStatuses: new Map(),
				currentStep: null,
				modeDescriptions: new Map(),
				todoList: [],
				workflowHistory: [],
			}

			integration.initializeFromContext(context)

			const action = integration.getRecommendedAction()
			expect(action.type).toBe("none")
		})

		it("should return compress for elevated usage", () => {
			// Create integration with thresholds to trigger elevated usage
			// We need to add enough tokens to be between warning (50%) and high (80%)
			const smallIntegration = new ContextIntegration({
				maxTokens: 2000,
				warningThreshold: 50,
				highThreshold: 80,
				criticalThreshold: 95,
				autoCompress: false,
				autoArchive: false,
			})

			// Add items to increase usage to elevated level (50-80%)
			// Each artifact summary is about 20-30 tokens
			for (let i = 0; i < 30; i++) {
				smallIntegration.addArtifactSummary({
					artifactId: `artifact_${i}`,
					artifactType: "code",
					summary: `Test artifact summary ${i}`,
					status: "completed",
					producerRole: "coder",
				})
			}

			const stats = smallIntegration.getStatistics()
			// Verify we're at elevated or high level (compress should be recommended)
			expect(["elevated", "high"]).toContain(stats.usageLevel)

			const action = smallIntegration.getRecommendedAction()
			expect(action.type).toBe("compress")

			smallIntegration.dispose()
		})
	})

	describe("compress", () => {
		it("should compress context items", async () => {
			// Add compressible items
			for (let i = 0; i < 10; i++) {
				integration.addArtifactSummary({
					artifactId: `artifact_${i}`,
					artifactType: "code",
					summary: `Test artifact summary ${i}`,
					status: "completed",
					producerRole: "coder",
				})
			}

			const statsBefore = integration.getStatistics()
			await integration.compress("moderate")
			const statsAfter = integration.getStatistics()

			expect(statsAfter.totalTokens).toBeLessThan(statsBefore.totalTokens)
		})

		it("should emit context_compressed event", async () => {
			const handler = vi.fn()
			integration.on("context_compressed", handler)

			integration.addArtifactSummary({
				artifactId: "artifact_1",
				artifactType: "code",
				summary: "Test artifact summary",
				status: "completed",
				producerRole: "coder",
			})

			await integration.compress("light")

			expect(handler).toHaveBeenCalled()
		})
	})

	describe("archive", () => {
		it("should archive context items", async () => {
			// Add archivable items with enough tokens to see a difference
			for (let i = 0; i < 10; i++) {
				integration.addArtifactSummary({
					artifactId: `artifact_${i}`,
					artifactType: "code",
					summary: `Test artifact summary ${i} with some additional content to increase token count`,
					status: "completed",
					producerRole: "coder",
				})
			}

			const statsBefore = integration.getStatistics()
			expect(statsBefore.itemsByType["artifact_summary"]).toBe(10)

			// Archive with maxItems to remove some items
			// Note: We need to pass belowPriority > 50 (NORMAL) since artifact summaries have NORMAL priority
			await integration.archive({ maxItems: 5, keepMinPerType: 0, belowPriority: 100 } as any)

			// Verify items were archived
			const statsAfter = integration.getStatistics()
			expect(statsAfter.itemsByType["artifact_summary"]).toBeLessThanOrEqual(5)
		})

		it("should emit context_archived event", async () => {
			const handler = vi.fn()
			integration.on("context_archived", handler)

			integration.addArtifactSummary({
				artifactId: "artifact_1",
				artifactType: "code",
				summary: "Test artifact summary",
				status: "completed",
				producerRole: "coder",
			})

			await integration.archive()

			expect(handler).toHaveBeenCalled()
		})
	})

	describe("getArchivableArtifactIds", () => {
		it("should return artifact IDs that can be archived", () => {
			// Add some artifacts
			for (let i = 0; i < 5; i++) {
				integration.addArtifactSummary({
					artifactId: `artifact_${i}`,
					artifactType: "code",
					summary: `Test artifact summary ${i}`,
					status: "completed",
					producerRole: "coder",
				})
			}

			const archivableIds = integration.getArchivableArtifactIds()

			expect(archivableIds.length).toBeGreaterThan(0)
			expect(archivableIds).toContain("artifact_0")
		})
	})

	describe("isWarning", () => {
		it("should return false for normal usage", () => {
			const context: OrganiserContext = {
				userTask: "Test",
				workflowState: "IDLE",
				artifacts: [],
				agentStatuses: new Map(),
				currentStep: null,
				modeDescriptions: new Map(),
				todoList: [],
				workflowHistory: [],
			}

			integration.initializeFromContext(context)

			expect(integration.isWarning()).toBe(false)
		})

		it("should return true for elevated usage", () => {
			// Create integration with thresholds to trigger elevated usage
			// We need to add enough tokens to be between warning (50%) and high (80%)
			const smallIntegration = new ContextIntegration({
				maxTokens: 2000,
				warningThreshold: 50,
				highThreshold: 80,
				criticalThreshold: 95,
				autoCompress: false,
				autoArchive: false,
			})

			// Add items to increase usage to elevated level (50-80%)
			// Each artifact summary is about 20-30 tokens
			for (let i = 0; i < 30; i++) {
				smallIntegration.addArtifactSummary({
					artifactId: `artifact_${i}`,
					artifactType: "code",
					summary: `Test artifact summary ${i}`,
					status: "completed",
					producerRole: "coder",
				})
			}

			const stats = smallIntegration.getStatistics()
			// Verify we're at elevated or high level
			expect(["elevated", "high"]).toContain(stats.usageLevel)
			expect(smallIntegration.isWarning()).toBe(true)
			smallIntegration.dispose()
		})
	})

	describe("isCritical", () => {
		it("should return false for normal usage", () => {
			const context: OrganiserContext = {
				userTask: "Test",
				workflowState: "IDLE",
				artifacts: [],
				agentStatuses: new Map(),
				currentStep: null,
				modeDescriptions: new Map(),
				todoList: [],
				workflowHistory: [],
			}

			integration.initializeFromContext(context)

			expect(integration.isCritical()).toBe(false)
		})

		it("should return true for critical usage", () => {
			// Create integration with very small max tokens and lower thresholds to trigger critical usage
			const smallIntegration = new ContextIntegration({
				maxTokens: 100,
				warningThreshold: 50,
				highThreshold: 70,
				criticalThreshold: 85,
				autoCompress: false,
				autoArchive: false,
			})

			// Add many items to increase usage to critical (85% of 100 = 85 tokens)
			for (let i = 0; i < 20; i++) {
				smallIntegration.addArtifactSummary({
					artifactId: `artifact_${i}`,
					artifactType: "code",
					summary: `Test artifact summary ${i} with some longer content to use more tokens`,
					status: "completed",
					producerRole: "coder",
				})
			}

			const stats = smallIntegration.getStatistics()
			expect(stats.usageLevel).toBe("critical")
			expect(smallIntegration.isCritical()).toBe(true)
			smallIntegration.dispose()
		})
	})

	describe("getUsagePercentage", () => {
		it("should return usage percentage", () => {
			const context: OrganiserContext = {
				userTask: "Test task",
				workflowState: "PLANNING",
				artifacts: [],
				agentStatuses: new Map(),
				currentStep: null,
				modeDescriptions: new Map(),
				todoList: [],
				workflowHistory: [],
			}

			integration.initializeFromContext(context)

			const percentage = integration.getUsagePercentage()
			expect(percentage).toBeGreaterThanOrEqual(0)
			expect(percentage).toBeLessThan(100)
		})
	})

	describe("events", () => {
		it("should forward warning events from monitor", () => {
			// Create integration with very small max tokens and lower thresholds to trigger warning
			const smallIntegration = new ContextIntegration({
				maxTokens: 100,
				warningThreshold: 50,
				highThreshold: 70,
				criticalThreshold: 85,
				autoCompress: false,
				autoArchive: false,
			})

			const handler = vi.fn()
			smallIntegration.on("context_warning", handler)

			// Add items to trigger warning (50% of 100 = 50 tokens)
			for (let i = 0; i < 10; i++) {
				smallIntegration.addArtifactSummary({
					artifactId: `artifact_${i}`,
					artifactType: "code",
					summary: `Test artifact summary ${i} with some content that makes it longer`,
					status: "completed",
					producerRole: "coder",
				})
			}

			expect(handler).toHaveBeenCalled()
			smallIntegration.dispose()
		})

		it("should forward critical events from monitor", () => {
			// Create integration with very small max tokens and lower thresholds to trigger critical
			const smallIntegration = new ContextIntegration({
				maxTokens: 100,
				warningThreshold: 50,
				highThreshold: 70,
				criticalThreshold: 85,
				autoCompress: false,
				autoArchive: false,
			})

			const handler = vi.fn()
			smallIntegration.on("context_critical", handler)

			// Add many items to trigger critical (85% of 100 = 85 tokens)
			for (let i = 0; i < 20; i++) {
				smallIntegration.addArtifactSummary({
					artifactId: `artifact_${i}`,
					artifactType: "code",
					summary: `Test artifact summary ${i} with some longer content to use more tokens`,
					status: "completed",
					producerRole: "coder",
				})
			}

			expect(handler).toHaveBeenCalled()
			smallIntegration.dispose()
		})
	})

	describe("dispose", () => {
		it("should clean up resources", () => {
			integration.addArtifactSummary({
				artifactId: "artifact_1",
				artifactType: "code",
				summary: "Test artifact summary",
				status: "completed",
				producerRole: "coder",
			})

			integration.dispose()

			// Should not throw after dispose
			expect(() => integration.getStatistics()).not.toThrow()
		})
	})
})
