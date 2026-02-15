// kilocode_change - new file
/**
 * Tests for orchestrationMessageHandler
 *
 * Tests the webview message handling for multi-agent orchestration configuration.
 */

import { vi, describe, test, expect, beforeEach, afterEach } from "vitest"

// Mock vscode module
vi.mock("vscode", () => ({
	ExtensionContext: vi.fn(),
	window: {
		showInformationMessage: vi.fn(),
		showErrorMessage: vi.fn(),
	},
}))

// Mock RoleDefinitions with controlled data - note the correct relative path
vi.mock("../../../core/kilocode/agent-manager/orchestration/roles/RoleDefinitions", () => ({
	getAllRoleDefinitions: vi.fn().mockReturnValue([
		{
			id: "architect",
			name: "Architect",
			description: "Plans and designs implementation",
			category: "planning",
			required: true,
			capabilities: ["planning", "analysis"],
			inputArtifacts: ["user_task"],
			outputArtifacts: ["implementation_plan"],
		},
		{
			id: "coder",
			name: "Coder",
			description: "Implements code",
			category: "implementation",
			required: true,
			capabilities: ["coding", "testing"],
			inputArtifacts: ["implementation_plan"],
			outputArtifacts: ["code"],
		},
	]),
	getDefaultModeForRole: vi.fn().mockReturnValue("code"),
}))

// Import after mocks
import {
	handleOrchestrationMessage,
	resetOrchestrationConfigService,
	setOrchestrationConfigService,
} from "../orchestrationMessageHandler"

// Define a mock service type
interface MockOrchestrationConfigService {
	initialize: ReturnType<typeof vi.fn>
	getConfiguration: ReturnType<typeof vi.fn>
	setEnabled: ReturnType<typeof vi.fn>
	setMaxConcurrentAgents: ReturnType<typeof vi.fn>
	updateRoleConfiguration: ReturnType<typeof vi.fn>
	getProviderProfiles: ReturnType<typeof vi.fn>
	addProviderProfile: ReturnType<typeof vi.fn>
	updateProviderProfile: ReturnType<typeof vi.fn>
	deleteProviderProfile: ReturnType<typeof vi.fn>
	setDefaultProviderProfile: ReturnType<typeof vi.fn>
	validateConfiguration: ReturnType<typeof vi.fn>
	getProviderProfile: ReturnType<typeof vi.fn>
}

describe("handleOrchestrationMessage", () => {
	let mockProvider: any
	let postedMessages: any[]
	let mockServiceInstance: MockOrchestrationConfigService

	beforeEach(() => {
		postedMessages = []
		mockProvider = {
			postMessageToWebview: vi.fn((msg) => {
				postedMessages.push(msg)
			}),
			context: {
				globalState: {
					get: vi.fn().mockResolvedValue(null),
					update: vi.fn().mockResolvedValue(undefined),
				},
			},
		}

		// Create a fresh mock service instance for each test
		mockServiceInstance = {
			initialize: vi.fn().mockResolvedValue(undefined),
			getConfiguration: vi.fn().mockReturnValue({
				enabled: true,
				maxConcurrentAgents: 5,
				roles: [],
				providerProfiles: [],
				defaultProviderProfileId: null,
			}),
			setEnabled: vi.fn(),
			setMaxConcurrentAgents: vi.fn(),
			updateRoleConfiguration: vi.fn(),
			getProviderProfiles: vi.fn().mockReturnValue([]),
			addProviderProfile: vi.fn().mockImplementation((profile) => ({
				id: "test-profile-id",
				...profile,
			})),
			updateProviderProfile: vi.fn().mockReturnValue(true),
			deleteProviderProfile: vi.fn().mockReturnValue(true),
			setDefaultProviderProfile: vi.fn(),
			validateConfiguration: vi.fn().mockReturnValue({
				valid: true,
				errors: [],
				warnings: [],
			}),
			getProviderProfile: vi.fn().mockReturnValue(null),
		}

		// Reset singleton and inject mock service
		resetOrchestrationConfigService()
		setOrchestrationConfigService(mockServiceInstance as any)

		// Reset all mocks
		vi.clearAllMocks()
	})

	afterEach(() => {
		resetOrchestrationConfigService()
		vi.clearAllMocks()
	})

	describe("getOrchestrationConfig", () => {
		test("returns configuration from service", async () => {
			const result = await handleOrchestrationMessage(mockProvider, {
				type: "getOrchestrationConfig",
			})

			expect(result).toBe(true)
			expect(mockProvider.postMessageToWebview).toHaveBeenCalled()
			const postedMessage = postedMessages[0]
			expect(postedMessage.type).toBe("orchestrationConfig")
			expect(postedMessage.config).toBeDefined()
			expect(postedMessage.config.enabled).toBe(true)
			expect(postedMessage.config.maxConcurrentAgents).toBe(5)
		})

		test("handles errors gracefully", async () => {
			// Mock getConfiguration to throw
			mockServiceInstance.getConfiguration.mockImplementationOnce(() => {
				throw new Error("Test error")
			})

			const result = await handleOrchestrationMessage(mockProvider, {
				type: "getOrchestrationConfig",
			})

			expect(result).toBe(true)
			const postedMessage = postedMessages[0]
			expect(postedMessage.type).toBe("orchestrationError")
			expect(postedMessage.error).toContain("Test error")
		})
	})

	describe("saveOrchestrationConfig", () => {
		test("saves configuration successfully", async () => {
			const config = {
				enabled: true,
				maxConcurrentAgents: 3,
				roles: [
					{
						roleId: "architect",
						enabled: true,
						providerProfileId: "profile-1",
						mode: "architect",
						priority: 1,
					},
				],
				providerProfiles: [
					{
						id: "profile-1",
						name: "Test Profile",
						providerType: "anthropic",
						model: "claude-3-opus",
					},
				],
				defaultProviderProfileId: "profile-1",
			}

			const result = await handleOrchestrationMessage(mockProvider, {
				type: "saveOrchestrationConfig",
				payload: config,
			})

			expect(result).toBe(true)
			expect(mockServiceInstance.setEnabled).toHaveBeenCalledWith(true)
			expect(mockServiceInstance.setMaxConcurrentAgents).toHaveBeenCalledWith(3)
			expect(mockServiceInstance.updateRoleConfiguration).toHaveBeenCalled()
			expect(mockServiceInstance.addProviderProfile).toHaveBeenCalled()
			expect(mockServiceInstance.setDefaultProviderProfile).toHaveBeenCalledWith("profile-1")

			const postedMessage = postedMessages[0]
			expect(postedMessage.type).toBe("orchestrationConfigSaved")
			expect(postedMessage.success).toBe(true)
		})

		test("handles save errors gracefully", async () => {
			// Mock setEnabled to throw
			mockServiceInstance.setEnabled.mockImplementationOnce(() => {
				throw new Error("Save error")
			})

			const result = await handleOrchestrationMessage(mockProvider, {
				type: "saveOrchestrationConfig",
				payload: {
					enabled: true,
					maxConcurrentAgents: 5,
					roles: [],
					providerProfiles: [],
					defaultProviderProfileId: null,
				},
			})

			expect(result).toBe(true)
			const postedMessage = postedMessages[0]
			expect(postedMessage.type).toBe("orchestrationConfigSaved")
			expect(postedMessage.success).toBe(false)
		})
	})

	describe("getRoleDefinitions", () => {
		test("returns role definitions", async () => {
			const result = await handleOrchestrationMessage(mockProvider, {
				type: "getRoleDefinitions",
			})

			expect(result).toBe(true)
			const postedMessage = postedMessages[0]
			expect(postedMessage.type).toBe("roleDefinitions")
			expect(postedMessage.roles).toBeDefined()
			// The mock returns 2 roles
			expect(postedMessage.roles.length).toBe(2)
			expect(postedMessage.roles[0].id).toBe("architect")
			expect(postedMessage.roles[0].name).toBe("Architect")
		})
	})

	describe("validateOrchestrationConfig", () => {
		test("returns validation result", async () => {
			const result = await handleOrchestrationMessage(mockProvider, {
				type: "validateOrchestrationConfig",
				payload: {
					enabled: true,
					maxConcurrentAgents: 5,
					roles: [],
					providerProfiles: [],
					defaultProviderProfileId: null,
				},
			})

			expect(result).toBe(true)
			const postedMessage = postedMessages[0]
			expect(postedMessage.type).toBe("orchestrationConfigValidation")
			expect(postedMessage.result.valid).toBe(true)
		})

		test("returns validation errors", async () => {
			// Mock validation to return errors
			mockServiceInstance.validateConfiguration.mockReturnValueOnce({
				valid: false,
				errors: ["Missing required role: architect"],
				warnings: ["No provider profile assigned"],
			})

			const result = await handleOrchestrationMessage(mockProvider, {
				type: "validateOrchestrationConfig",
				payload: {
					enabled: true,
					maxConcurrentAgents: 5,
					roles: [],
					providerProfiles: [],
					defaultProviderProfileId: null,
				},
			})

			expect(result).toBe(true)
			const postedMessage = postedMessages[0]
			expect(postedMessage.type).toBe("orchestrationConfigValidation")
			expect(postedMessage.result.valid).toBe(false)
			expect(postedMessage.result.errors).toContain("Missing required role: architect")
		})
	})

	describe("getProviderProfiles", () => {
		test("returns provider profiles", async () => {
			mockServiceInstance.getProviderProfiles.mockReturnValueOnce([
				{
					id: "profile-1",
					name: "Test Profile",
					providerType: "anthropic",
					model: "claude-3-opus",
				},
			])

			const result = await handleOrchestrationMessage(mockProvider, {
				type: "getProviderProfiles",
			})

			expect(result).toBe(true)
			const postedMessage = postedMessages[0]
			expect(postedMessage.type).toBe("providerProfiles")
			expect(postedMessage.profiles.length).toBe(1)
			expect(postedMessage.profiles[0].id).toBe("profile-1")
		})
	})

	describe("addProviderProfile", () => {
		test("adds provider profile", async () => {
			const result = await handleOrchestrationMessage(mockProvider, {
				type: "addProviderProfile",
				payload: {
					name: "New Profile",
					providerType: "openai",
					model: "gpt-4",
				},
			})

			expect(result).toBe(true)
			expect(mockServiceInstance.addProviderProfile).toHaveBeenCalled()
			const postedMessage = postedMessages[0]
			expect(postedMessage.type).toBe("providerProfileSaved")
			expect(postedMessage.success).toBe(true)
			expect(postedMessage.profile).toBeDefined()
		})
	})

	describe("updateProviderProfile", () => {
		test("updates provider profile", async () => {
			const result = await handleOrchestrationMessage(mockProvider, {
				type: "updateProviderProfile",
				payload: {
					id: "profile-1",
					name: "Updated Profile",
					providerType: "anthropic",
					model: "claude-3-opus",
				},
			})

			expect(result).toBe(true)
			expect(mockServiceInstance.updateProviderProfile).toHaveBeenCalledWith(
				"profile-1",
				expect.objectContaining({
					name: "Updated Profile",
				}),
			)
			const postedMessage = postedMessages[0]
			expect(postedMessage.type).toBe("providerProfileSaved")
			expect(postedMessage.success).toBe(true)
		})
	})

	describe("deleteProviderProfile", () => {
		test("deletes provider profile", async () => {
			const result = await handleOrchestrationMessage(mockProvider, {
				type: "deleteProviderProfile",
				payload: { id: "profile-1" },
			})

			expect(result).toBe(true)
			expect(mockServiceInstance.deleteProviderProfile).toHaveBeenCalledWith("profile-1")
			const postedMessage = postedMessages[0]
			expect(postedMessage.type).toBe("providerProfileDeleted")
			expect(postedMessage.success).toBe(true)
		})
	})

	describe("getWorkflowStatus", () => {
		test("returns null status when no workflow running", async () => {
			const result = await handleOrchestrationMessage(mockProvider, {
				type: "getWorkflowStatus",
			})

			expect(result).toBe(true)
			const postedMessage = postedMessages[0]
			expect(postedMessage.type).toBe("workflowStatus")
			expect(postedMessage.status).toBeNull()
		})
	})

	describe("getAgentStatuses", () => {
		test("returns empty agent list", async () => {
			const result = await handleOrchestrationMessage(mockProvider, {
				type: "getAgentStatuses",
			})

			expect(result).toBe(true)
			const postedMessage = postedMessages[0]
			expect(postedMessage.type).toBe("agentStatuses")
			expect(postedMessage.agents).toEqual([])
			expect(postedMessage.summary).toBeDefined()
			expect(postedMessage.summary.totalAgents).toBe(0)
		})
	})

	describe("workflow control messages", () => {
		test("handles pauseWorkflow", async () => {
			const result = await handleOrchestrationMessage(mockProvider, {
				type: "pauseWorkflow",
			})
			expect(result).toBe(true)
		})

		test("handles resumeWorkflow", async () => {
			const result = await handleOrchestrationMessage(mockProvider, {
				type: "resumeWorkflow",
			})
			expect(result).toBe(true)
		})

		test("handles cancelWorkflow", async () => {
			const result = await handleOrchestrationMessage(mockProvider, {
				type: "cancelWorkflow",
			})
			expect(result).toBe(true)
		})

		test("handles retryWorkflow", async () => {
			const result = await handleOrchestrationMessage(mockProvider, {
				type: "retryWorkflow",
			})
			expect(result).toBe(true)
		})
	})

	describe("agent control messages", () => {
		test("handles pauseAgent", async () => {
			const result = await handleOrchestrationMessage(mockProvider, {
				type: "pauseAgent",
				payload: { agentId: "agent-1" },
			})

			expect(result).toBe(true)
			const postedMessage = postedMessages[0]
			expect(postedMessage.type).toBe("agentStatusUpdated")
			expect(postedMessage.agentId).toBe("agent-1")
		})

		test("handles resumeAgent", async () => {
			const result = await handleOrchestrationMessage(mockProvider, {
				type: "resumeAgent",
				payload: { agentId: "agent-1" },
			})

			expect(result).toBe(true)
			const postedMessage = postedMessages[0]
			expect(postedMessage.type).toBe("agentStatusUpdated")
			expect(postedMessage.agentId).toBe("agent-1")
		})

		test("handles terminateAgent", async () => {
			const result = await handleOrchestrationMessage(mockProvider, {
				type: "terminateAgent",
				payload: { agentId: "agent-1" },
			})

			expect(result).toBe(true)
			const postedMessage = postedMessages[0]
			expect(postedMessage.type).toBe("agentStatusUpdated")
			expect(postedMessage.agentId).toBe("agent-1")
		})

		test("handles restartAgent", async () => {
			const result = await handleOrchestrationMessage(mockProvider, {
				type: "restartAgent",
				payload: { agentId: "agent-1" },
			})

			expect(result).toBe(true)
			const postedMessage = postedMessages[0]
			expect(postedMessage.type).toBe("agentStatusUpdated")
			expect(postedMessage.agentId).toBe("agent-1")
		})

		test("handles viewAgentDetails", async () => {
			const result = await handleOrchestrationMessage(mockProvider, {
				type: "viewAgentDetails",
				payload: { agentId: "agent-1" },
			})

			expect(result).toBe(true)
		})
	})

	describe("unknown message type", () => {
		test("returns false for unknown message types", async () => {
			const result = await handleOrchestrationMessage(mockProvider, {
				type: "unknownMessageType",
			})

			expect(result).toBe(false)
		})
	})
})
