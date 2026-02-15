/**
 * OrchestrationConfigService Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock the dependencies
vi.mock("vscode", () => ({
	workspace: {
		getConfiguration: vi.fn(),
	},
}))

// Create mock ExtensionContext
const createMockContext = () => {
	return {
		extensionUri: { fsPath: "/mock/path" },
		storageUri: { fsPath: "/mock/storage" },
		globalStorageUri: { fsPath: "/mock/global" },
		logUri: { fsPath: "/mock/log" },
		secrets: {
			get: vi.fn().mockResolvedValue(undefined),
			store: vi.fn().mockResolvedValue(undefined),
			delete: vi.fn().mockResolvedValue(undefined),
			onDidChange: vi.fn(),
		},
		globalState: {
			get: vi.fn().mockResolvedValue(undefined),
			update: vi.fn().mockResolvedValue(undefined),
			setKeysForSync: vi.fn(),
		},
		subscriptions: [],
		workspaceState: {
			get: vi.fn().mockResolvedValue(undefined),
			update: vi.fn().mockResolvedValue(undefined),
		},
	}
}

describe("OrchestrationConfigService", () => {
	let mockContext: ReturnType<typeof createMockContext>
	let OrchestrationConfigService: any
	let RoleRegistry: any

	beforeEach(async () => {
		vi.resetModules()
		mockContext = createMockContext()

		// Import after mocks are set up
		const module = await import("../OrchestrationConfigService")
		OrchestrationConfigService = module.OrchestrationConfigService

		const rolesModule = await import("../../../core/kilocode/agent-manager/orchestration/roles/RoleRegistry")
		RoleRegistry = rolesModule.RoleRegistry
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe("constructor", () => {
		it("should create instance with default config key", () => {
			const service = new OrchestrationConfigService(mockContext)
			expect(service).toBeDefined()
		})

		it("should create instance with custom RoleRegistry", () => {
			const customRegistry = new RoleRegistry()
			const service = new OrchestrationConfigService(mockContext, customRegistry, "customKey")
			expect(service).toBeDefined()
		})

		it("should create instance with custom config key", () => {
			const service = new OrchestrationConfigService(mockContext, undefined, "customKey")
			expect(service).toBeDefined()
		})
	})

	describe("initialization", () => {
		it("should initialize without errors when no stored config", async () => {
			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()
			expect(service.isEnabled()).toBe(true)
		})

		it("should load stored configuration on init", async () => {
			const storedConfig = JSON.stringify({
				enabled: false,
				maxConcurrentAgents: 3,
			})
			mockContext.globalState.get = vi.fn().mockResolvedValue(storedConfig)

			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()

			expect(service.isEnabled()).toBe(false)
			expect(service.getMaxConcurrentAgents()).toBe(3)
		})

		it("should handle invalid stored configuration gracefully", async () => {
			mockContext.globalState.get = vi.fn().mockResolvedValue("invalid json{{{")
			mockContext.globalState.update = vi.fn().mockResolvedValue(undefined)

			const service = new OrchestrationConfigService(mockContext)
			// Should not throw
			await service.initialize()
		})
	})

	describe("configuration access methods", () => {
		it("should return full configuration", async () => {
			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()

			const config = service.getConfiguration()
			expect(config).toBeDefined()
			expect(config.enabled).toBe(true)
		})

		it("should toggle orchestration enabled state", async () => {
			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()

			expect(service.isEnabled()).toBe(true)
			service.setEnabled(false)
			expect(service.isEnabled()).toBe(false)
		})

		it("should set and get max concurrent agents", async () => {
			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()

			expect(service.getMaxConcurrentAgents()).toBe(5) // default
			service.setMaxConcurrentAgents(3)
			expect(service.getMaxConcurrentAgents()).toBe(3)
		})
	})

	describe("role configuration methods", () => {
		it("should return all role configurations", async () => {
			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()

			const roles = service.getRoleConfigurations()
			expect(Array.isArray(roles)).toBe(true)
		})

		it("should get role configuration by ID", async () => {
			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()

			const architectConfig = service.getRoleConfiguration("architect")
			expect(architectConfig).toBeDefined()
			expect(architectConfig?.roleId).toBe("architect")
		})

		it("should return undefined for non-existent role", async () => {
			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()

			const config = service.getRoleConfiguration("non-existent-role")
			expect(config).toBeUndefined()
		})

		it("should update role configuration", async () => {
			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()

			const result = service.updateRoleConfiguration("architect", {
				enabled: false,
			})
			expect(result).toBe(true)

			const config = service.getRoleConfiguration("architect")
			expect(config?.enabled).toBe(false)
		})

		it("should enable/disable roles", async () => {
			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()

			service.setRoleEnabled("architect", false)
			let config = service.getRoleConfiguration("architect")
			expect(config?.enabled).toBe(false)

			service.setRoleEnabled("architect", true)
			config = service.getRoleConfiguration("architect")
			expect(config?.enabled).toBe(true)
		})

		it("should set role provider profile", async () => {
			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()

			const result = service.setRoleProviderProfile("architect", "provider-123")
			expect(result).toBe(true)

			const config = service.getRoleConfiguration("architect")
			expect(config?.providerProfileId).toBe("provider-123")
		})

		it("should set role mode", async () => {
			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()

			const result = service.setRoleMode("architect", "custom-mode")
			expect(result).toBe(true)

			const config = service.getRoleConfiguration("architect")
			expect(config?.mode).toBe("custom-mode")
		})

		it("should return enabled roles only", async () => {
			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()

			// Disable some roles
			service.setRoleEnabled("primary-coder", false)
			service.setRoleEnabled("secondary-coder", false)

			const enabledRoles = service.getEnabledRoles()
			const roleIds = enabledRoles.map((r: { roleId: string }) => r.roleId)
			expect(roleIds).not.toContain("primary-coder")
			expect(roleIds).not.toContain("secondary-coder")
		})

		it("should get mode for role", async () => {
			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()

			const mode = service.getModeForRole("architect")
			expect(mode).toBeDefined()
			expect(typeof mode).toBe("string")
		})

		it("should get role definition", async () => {
			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()

			const roleDef = service.getRoleDefinition("architect")
			expect(roleDef).toBeDefined()
			expect(roleDef?.id).toBe("architect")
		})

		it("should get all role definitions", async () => {
			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()

			const roleDefs = service.getAllRoleDefinitions()
			expect(Array.isArray(roleDefs)).toBe(true)
			expect(roleDefs.length).toBeGreaterThan(0)
		})
	})

	describe("provider profile methods", () => {
		it("should return all provider profiles", async () => {
			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()

			const profiles = service.getProviderProfiles()
			expect(Array.isArray(profiles)).toBe(true)
		})

		it("should add provider profile", async () => {
			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()

			const newProfile = service.addProviderProfile({
				name: "Test Provider",
				providerType: "anthropic",
				model: "claude-3-5-sonnet",
			})

			expect(newProfile.id).toBeDefined()
			expect(newProfile.name).toBe("Test Provider")
		})

		it("should get provider profile by ID", async () => {
			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()

			const added = service.addProviderProfile({
				name: "Test Provider",
				providerType: "anthropic",
				model: "claude-3-5-sonnet",
			})

			const retrieved = service.getProviderProfile(added.id)
			expect(retrieved).toBeDefined()
			expect(retrieved?.name).toBe("Test Provider")
		})

		it("should update provider profile", async () => {
			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()

			const added = service.addProviderProfile({
				name: "Test Provider",
				providerType: "anthropic",
				model: "claude-3-5-sonnet",
			})

			const result = service.updateProviderProfile(added.id, {
				name: "Updated Provider",
			})
			expect(result).toBe(true)

			const retrieved = service.getProviderProfile(added.id)
			expect(retrieved?.name).toBe("Updated Provider")
		})

		it("should delete provider profile", async () => {
			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()

			const added = service.addProviderProfile({
				name: "Test Provider",
				providerType: "anthropic",
				model: "claude-3-5-sonnet",
			})

			const result = service.deleteProviderProfile(added.id)
			expect(result).toBe(true)

			const retrieved = service.getProviderProfile(added.id)
			expect(retrieved).toBeUndefined()
		})

		it("should get default provider profile", async () => {
			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()

			const added = service.addProviderProfile({
				name: "Default Provider",
				providerType: "anthropic",
				model: "claude-3-5-sonnet",
			})

			service.setDefaultProviderProfile(added.id)
			const defaultProfile = service.getDefaultProviderProfile()
			expect(defaultProfile).toBeDefined()
			expect(defaultProfile?.name).toBe("Default Provider")
		})
	})

	describe("validation methods", () => {
		it("should validate configuration", async () => {
			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()

			const result = service.validateConfiguration()
			expect(result.valid).toBe(true)
			expect(result.errors).toHaveLength(0)
		})

		it("should report validation errors for missing required roles", async () => {
			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()

			// Disable required roles
			service.setRoleEnabled("architect", false)
			service.setRoleEnabled("organiser", false)

			const result = service.validateConfiguration()
			expect(result.valid).toBe(false)
			expect(result.errors.length).toBeGreaterThan(0)
		})
	})

	describe("role-to-provider mapping methods", () => {
		it("should get all role-provider mappings", async () => {
			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()

			const mappings = service.getRoleProviderMappings()
			expect(Array.isArray(mappings)).toBe(true)
			expect(mappings.length).toBeGreaterThan(0)
		})

		it("should apply role-provider mappings", async () => {
			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()

			// Add a provider first
			const profile = service.addProviderProfile({
				name: "Test Provider",
				providerType: "anthropic",
				model: "claude-3-5-sonnet",
			})

			service.applyRoleProviderMappings([
				{
					roleId: "architect",
					providerProfileId: profile.id,
					mode: "custom-mode",
					priority: 10,
				},
			])

			const config = service.getRoleConfiguration("architect")
			expect(config?.providerProfileId).toBe(profile.id)
			expect(config?.mode).toBe("custom-mode")
			expect(config?.priority).toBe(10)
		})

		it("should get best provider for role", async () => {
			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()

			const profile = service.addProviderProfile({
				name: "Best Provider",
				providerType: "anthropic",
				model: "claude-3-5-sonnet",
			})
			service.setRoleProviderProfile("architect", profile.id)

			const best = service.getBestProviderForRole("architect")
			expect(best).toBeDefined()
			expect(best?.name).toBe("Best Provider")
		})

		it("should return null for disabled role in getBestProviderForRole", async () => {
			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()

			service.setRoleEnabled("architect", false)
			const best = service.getBestProviderForRole("architect")
			expect(best).toBeNull()
		})
	})

	describe("custom role methods", () => {
		it("should add custom role", async () => {
			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()

			const result = service.addCustomRole({
				id: "custom-role",
				name: "Custom Role",
				description: "A custom role for testing",
				category: "implementation",
				required: false,
				capabilities: [
					{
						name: "custom-capability",
						description: "A custom capability",
						required: true,
					},
				],
				inputArtifactTypes: ["user_task"],
				outputArtifactTypes: ["code"],
				defaultMode: "code",
				priority: 5,
			})

			expect(result).toBe(true)

			const roleDef = service.getRoleDefinition("custom-role")
			expect(roleDef).toBeDefined()
			expect(roleDef?.name).toBe("Custom Role")
		})

		it("should delete custom role", async () => {
			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()

			service.addCustomRole({
				id: "custom-role",
				name: "Custom Role",
				description: "A custom role for testing",
				category: "implementation",
				required: false,
				capabilities: [],
				inputArtifactTypes: [],
				outputArtifactTypes: [],
				defaultMode: "code",
				priority: 5,
			})

			const result = service.deleteCustomRole("custom-role")
			expect(result).toBe(true)

			const roleDef = service.getRoleDefinition("custom-role")
			expect(roleDef).toBeUndefined()
		})

		it("should get custom role IDs", async () => {
			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()

			service.addCustomRole({
				id: "custom-role-1",
				name: "Custom Role 1",
				description: "A custom role",
				category: "implementation",
				required: false,
				capabilities: [],
				inputArtifactTypes: [],
				outputArtifactTypes: [],
				defaultMode: "code",
				priority: 5,
			})

			const ids = service.getCustomRoleIds()
			expect(ids).toContain("custom-role-1")
		})
	})

	describe("export/import methods", () => {
		it("should export configuration as JSON", async () => {
			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()

			const json = service.exportConfiguration()
			expect(typeof json).toBe("string")

			const parsed = JSON.parse(json)
			expect(parsed.enabled).toBe(true)
		})

		it("should import configuration from JSON", async () => {
			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()

			service.importConfiguration('{"enabled": false, "maxConcurrentAgents": 2}')

			expect(service.isEnabled()).toBe(false)
			expect(service.getMaxConcurrentAgents()).toBe(2)
		})

		it("should throw on invalid import", async () => {
			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()

			expect(() => {
				service.importConfiguration("invalid json{{{")
			}).toThrow()
		})
	})

	describe("event subscription methods", () => {
		it("should subscribe to config changes", async () => {
			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()

			const listener = vi.fn()
			const unsubscribe = service.onConfigChange(listener)

			service.setEnabled(false)
			expect(listener).toHaveBeenCalled()

			unsubscribe()
			listener.mockClear()
			service.setEnabled(true)
			expect(listener).not.toHaveBeenCalled()
		})

		it("should subscribe to role config changes", async () => {
			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()

			const listener = vi.fn()
			const unsubscribe = service.onRoleConfigChange(listener)

			service.setRoleEnabled("architect", false)
			expect(listener).toHaveBeenCalled()

			unsubscribe()
		})

		it("should subscribe to validation results", async () => {
			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()

			const listener = vi.fn()
			const unsubscribe = service.onValidationResult(listener)

			const result = service.validateConfiguration()
			expect(listener).toHaveBeenCalledWith(result)

			unsubscribe()
		})
	})

	describe("cleanup", () => {
		it("should dispose without errors", async () => {
			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()

			// Should not throw
			service.dispose()
		})
	})

	describe("getProviderSettingsForRole", () => {
		it("should return null for non-existent role", async () => {
			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()

			const mockProviderManager = {
				getProfile: vi.fn(),
			}

			const result = await service.getProviderSettingsForRole("non-existent-role", mockProviderManager as any)
			expect(result).toBeNull()
		})

		it("should return null when no provider profile is assigned", async () => {
			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()

			const mockProviderManager = {
				getProfile: vi.fn(),
			}

			// Architect has no provider profile by default
			const result = await service.getProviderSettingsForRole("architect", mockProviderManager as any)
			expect(result).toBeNull()
		})

		it("should get provider settings when profile is assigned", async () => {
			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()

			// Add and assign a provider profile
			const profile = service.addProviderProfile({
				name: "Test Provider",
				providerType: "anthropic",
				model: "claude-3-5-sonnet",
			})
			service.setRoleProviderProfile("architect", profile.id)

			const mockProviderManager = {
				getProfile: vi.fn().mockResolvedValue({
					id: profile.id,
					name: "Test Provider",
					apiProvider: "anthropic",
					apiModelId: "claude-3-5-sonnet",
					apiKey: "test-key",
					temperature: 0.7,
				}),
			}

			const result = await service.getProviderSettingsForRole("architect", mockProviderManager as any)

			expect(result).toBeDefined()
			expect(result?.profileId).toBe(profile.id)
			expect(result?.profileName).toBe("Test Provider")
			expect(result?.providerType).toBe("anthropic")
			expect(result?.model).toBe("claude-3-5-sonnet")
			expect(result?.apiKey).toBe("test-key")
			expect(result?.settings.temperature).toBe(0.7)
		})

		it("should fallback to default provider when role has no explicit profile", async () => {
			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()

			// Add default provider but don't assign to architect
			const defaultProfile = service.addProviderProfile({
				name: "Default Provider",
				providerType: "anthropic",
				model: "claude-3-5-sonnet",
			})
			service.setDefaultProviderProfile(defaultProfile.id)

			const mockProviderManager = {
				getProfile: vi.fn().mockResolvedValue({
					id: defaultProfile.id,
					name: "Default Provider",
					apiProvider: "anthropic",
					apiModelId: "claude-3-5-sonnet",
				}),
			}

			const result = await service.getProviderSettingsForRole("architect", mockProviderManager as any)

			expect(result).toBeDefined()
			expect(result?.profileId).toBe(defaultProfile.id)
			expect(result?.profileName).toBe("Default Provider")
		})

		it("should handle provider manager errors gracefully", async () => {
			const service = new OrchestrationConfigService(mockContext)
			await service.initialize()

			const profile = service.addProviderProfile({
				name: "Test Provider",
				providerType: "anthropic",
				model: "claude-3-5-sonnet",
			})
			service.setRoleProviderProfile("architect", profile.id)

			const mockProviderManager = {
				getProfile: vi.fn().mockRejectedValue(new Error("Provider error")),
			}

			const result = await service.getProviderSettingsForRole("architect", mockProviderManager as any)
			expect(result).toBeNull()
		})
	})
})
