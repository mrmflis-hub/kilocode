// kilocode_change - new file
/**
 * Tests for RoleRegistry Module
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
	RoleRegistry,
	type RoleConfiguration,
	type ProviderProfile,
	type OrchestrationConfiguration,
} from "../RoleRegistry"

describe("RoleRegistry", () => {
	let registry: RoleRegistry

	beforeEach(() => {
		registry = new RoleRegistry()
	})

	describe("Constructor", () => {
		it("should initialize with default configuration", () => {
			expect(registry.isEnabled()).toBe(true)
			expect(registry.getMaxConcurrentAgents()).toBe(5)
		})

		it("should initialize with custom configuration", () => {
			const customRegistry = new RoleRegistry({
				enabled: false,
				maxConcurrentAgents: 3,
			})
			expect(customRegistry.isEnabled()).toBe(false)
			expect(customRegistry.getMaxConcurrentAgents()).toBe(3)
		})

		it("should initialize default role configurations", () => {
			const configs = registry.getRoleConfigurations()
			expect(configs.length).toBeGreaterThan(0)

			// Check that required roles are configured
			const requiredConfigs = registry.getRequiredRoles()
			expect(requiredConfigs.length).toBeGreaterThan(0)
		})
	})

	describe("Role Configuration Methods", () => {
		it("should get all role configurations", () => {
			const configs = registry.getRoleConfigurations()
			expect(configs).toBeInstanceOf(Array)
		})

		it("should get role configuration by ID", () => {
			const config = registry.getRoleConfiguration("architect")
			expect(config).toBeDefined()
			expect(config?.roleId).toBe("architect")
		})

		it("should return undefined for non-existent role", () => {
			const config = registry.getRoleConfiguration("non-existent")
			expect(config).toBeUndefined()
		})

		it("should update role configuration", () => {
			const result = registry.setRoleEnabled("code-sceptic", true)
			expect(result).toBe(true)

			const config = registry.getRoleConfiguration("code-sceptic")
			expect(config?.enabled).toBe(true)
		})

		it("should return false when updating non-existent role", () => {
			const result = registry.setRoleEnabled("non-existent", true)
			expect(result).toBe(false)
		})

		it("should set role provider profile", () => {
			registry.setRoleProviderProfile("architect", "anthropic-pro")
			const config = registry.getRoleConfiguration("architect")
			expect(config?.providerProfileId).toBe("anthropic-pro")
		})

		it("should set role mode", () => {
			registry.setRoleMode("architect", "custom-mode")
			const config = registry.getRoleConfiguration("architect")
			expect(config?.mode).toBe("custom-mode")
		})

		it("should set role priority", () => {
			registry.setRolePriority("architect", 50)
			const config = registry.getRoleConfiguration("architect")
			expect(config?.priority).toBe(50)
		})

		it("should get enabled roles", () => {
			// First disable all optional roles
			registry.setRoleEnabled("code-sceptic", false)
			registry.setRoleEnabled("documentation-writer", false)
			registry.setRoleEnabled("debugger", false)

			const enabledRoles = registry.getEnabledRoles()
			const enabledIds = enabledRoles.map((r) => r.roleId)

			expect(enabledIds).toContain("organiser")
			expect(enabledIds).toContain("architect")
			expect(enabledIds).toContain("primary-coder")
			expect(enabledIds).toContain("secondary-coder")
			expect(enabledIds).not.toContain("code-sceptic")
		})
	})

	describe("Provider Profile Methods", () => {
		it("should return empty array initially", () => {
			const profiles = registry.getProviderProfiles()
			expect(profiles).toEqual([])
		})

		it("should add provider profile", () => {
			const profile = registry.addProviderProfile({
				name: "Anthropic Pro",
				providerType: "anthropic",
				model: "claude-3-opus-20240307",
			})

			expect(profile.id).toBeDefined()
			expect(profile.name).toBe("Anthropic Pro")
			expect(profile.providerType).toBe("anthropic")
		})

		it("should get provider profile by ID", () => {
			const added = registry.addProviderProfile({
				name: "OpenAI",
				providerType: "openai",
				model: "gpt-4",
			})

			const retrieved = registry.getProviderProfile(added.id)
			expect(retrieved).toEqual(added)
		})

		it("should update provider profile", () => {
			const added = registry.addProviderProfile({
				name: "Original",
				providerType: "test",
				model: "test-model",
			})

			const result = registry.updateProviderProfile(added.id, {
				name: "Updated",
				model: "updated-model",
			})

			expect(result).toBe(true)

			const retrieved = registry.getProviderProfile(added.id)
			expect(retrieved?.name).toBe("Updated")
			expect(retrieved?.model).toBe("updated-model")
		})

		it("should delete provider profile", () => {
			const added = registry.addProviderProfile({
				name: "To Delete",
				providerType: "test",
				model: "test",
			})

			const result = registry.deleteProviderProfile(added.id)
			expect(result).toBe(true)

			const retrieved = registry.getProviderProfile(added.id)
			expect(retrieved).toBeUndefined()
		})

		it("should get provider profile for role", () => {
			const profile = registry.addProviderProfile({
				name: "Architect Profile",
				providerType: "anthropic",
				model: "claude-3-opus",
			})

			registry.setRoleProviderProfile("architect", profile.id)

			const roleProfile = registry.getProviderProfileForRole("architect")
			expect(roleProfile).toEqual(profile)
		})

		it("should set default provider profile", () => {
			const profile = registry.addProviderProfile({
				name: "Default",
				providerType: "test",
				model: "test",
			})

			const result = registry.setDefaultProviderProfile(profile.id)
			expect(result).toBe(true)
		})
	})

	describe("Role Definition Methods", () => {
		it("should get role definition by ID", () => {
			const roleDef = registry.getRoleDefinition("architect")
			expect(roleDef).toBeDefined()
			expect(roleDef?.id).toBe("architect")
		})

		it("should get all role definitions", () => {
			const definitions = registry.getAllRoleDefinitions()
			expect(definitions.length).toBeGreaterThan(0)
		})

		it("should add custom role", () => {
			const customRole = {
				id: "custom-role",
				name: "Custom Role",
				description: "A custom role",
				category: "implementation" as const,
				required: false,
				capabilities: [{ name: "custom_cap", description: "Custom capability", required: true }],
				inputArtifactTypes: [],
				outputArtifactTypes: [],
				defaultMode: "code",
				priority: 10,
			}

			const result = registry.addCustomRole(customRole)
			expect(result).toBe(true)

			const roleDef = registry.getRoleDefinition("custom-role")
			expect(roleDef).toBeDefined()
		})

		it("should not add custom role with existing ID", () => {
			const customRole = {
				id: "architect", // Already exists
				name: "Custom Architect",
				description: "A custom role",
				category: "planning" as const,
				required: false,
				capabilities: [],
				inputArtifactTypes: [],
				outputArtifactTypes: [],
				defaultMode: "code",
				priority: 10,
			}

			const result = registry.addCustomRole(customRole)
			expect(result).toBe(false)
		})

		it("should delete custom role", () => {
			const customRole = {
				id: "custom-to-delete",
				name: "Custom To Delete",
				description: "A custom role",
				category: "implementation" as const,
				required: false,
				capabilities: [],
				inputArtifactTypes: [],
				outputArtifactTypes: [],
				defaultMode: "code",
				priority: 10,
			}

			registry.addCustomRole(customRole)
			const result = registry.deleteCustomRole("custom-to-delete")
			expect(result).toBe(true)

			const roleDef = registry.getRoleDefinition("custom-to-delete")
			expect(roleDef).toBeUndefined()
		})

		it("should get custom role IDs", () => {
			const customRole1 = {
				id: "custom-1",
				name: "Custom 1",
				description: "A custom role",
				category: "implementation" as const,
				required: false,
				capabilities: [],
				inputArtifactTypes: [],
				outputArtifactTypes: [],
				defaultMode: "code",
				priority: 10,
			}

			const customRole2 = {
				id: "custom-2",
				name: "Custom 2",
				description: "A custom role",
				category: "review" as const,
				required: false,
				capabilities: [],
				inputArtifactTypes: [],
				outputArtifactTypes: [],
				defaultMode: "code",
				priority: 10,
			}

			registry.addCustomRole(customRole1)
			registry.addCustomRole(customRole2)

			const customIds = registry.getCustomRoleIds()
			expect(customIds).toContain("custom-1")
			expect(customIds).toContain("custom-2")
		})
	})

	describe("Configuration Methods", () => {
		it("should get full configuration", () => {
			const config = registry.getConfiguration()
			expect(config.enabled).toBe(true)
			expect(config.maxConcurrentAgents).toBe(5)
			expect(config.roles).toBeInstanceOf(Array)
			expect(config.providerProfiles).toBeInstanceOf(Array)
		})

		it("should load configuration", () => {
			registry.loadConfiguration({
				enabled: false,
				maxConcurrentAgents: 10,
			})

			expect(registry.isEnabled()).toBe(false)
			expect(registry.getMaxConcurrentAgents()).toBe(10)
		})

		it("should export configuration as JSON", () => {
			const json = registry.exportConfiguration()
			expect(typeof json).toBe("string")
			expect(() => JSON.parse(json)).not.toThrow()
		})

		it("should enable/disable orchestration", () => {
			registry.setEnabled(false)
			expect(registry.isEnabled()).toBe(false)

			registry.setEnabled(true)
			expect(registry.isEnabled()).toBe(true)
		})

		it("should set max concurrent agents with clamping", () => {
			registry.setMaxConcurrentAgents(100)
			expect(registry.getMaxConcurrentAgents()).toBe(10) // Max is 10

			registry.setMaxConcurrentAgents(0)
			expect(registry.getMaxConcurrentAgents()).toBe(1) // Min is 1
		})

		it("should validate configuration", () => {
			// Required roles should be enabled by default
			const validation = registry.validateConfiguration()
			expect(validation.valid).toBe(true)
			expect(validation.errors).toHaveLength(0)
		})

		it("should detect missing required roles in validation", () => {
			// Disable a required role
			registry.setRoleEnabled("architect", false)

			const validation = registry.validateConfiguration()
			expect(validation.valid).toBe(false)
			expect(validation.errors.length).toBeGreaterThan(0)
			expect(validation.errors[0]).toContain("Architect")
		})

		it("should detect invalid provider profiles in validation", () => {
			registry.setRoleProviderProfile("architect", "non-existent-profile")

			const validation = registry.validateConfiguration()
			expect(validation.valid).toBe(false)
			expect(validation.errors.some((e) => e.includes("invalid provider profile"))).toBe(true)
		})

		it("should get role assignments", () => {
			const assignments = registry.getRoleAssignments()
			expect(assignments).toBeInstanceOf(Array)
			expect(assignments.length).toBeGreaterThan(0)

			const architect = assignments.find((a) => a.roleId === "architect")
			expect(architect).toBeDefined()
			expect(architect?.roleName).toBe("Architect")
		})

		it("should get mode for role", () => {
			registry.setRoleMode("architect", "custom-mode")
			const mode = registry.getModeForRole("architect")
			expect(mode).toBe("custom-mode")
		})
	})

	describe("Event Handling", () => {
		it("should subscribe to config changes", () => {
			let callCount = 0
			registry.onConfigChange(() => {
				callCount++
			})

			registry.setRoleEnabled("code-sceptic", true)
			expect(callCount).toBe(1)

			registry.setEnabled(false)
			expect(callCount).toBe(2)
		})

		it("should return unsubscribe function", () => {
			let callCount = 0
			const unsubscribe = registry.onConfigChange(() => {
				callCount++
			})

			// Unsubscribe
			unsubscribe()

			registry.setRoleEnabled("code-sceptic", true)
			expect(callCount).toBe(0)
		})

		it("should emit events", () => {
			const events: string[] = []

			registry.on("roleConfigChanged", () => {
				events.push("roleConfigChanged")
			})

			registry.on("providerProfileAdded", () => {
				events.push("providerProfileAdded")
			})

			registry.on("enabledChanged", () => {
				events.push("enabledChanged")
			})

			registry.setRoleEnabled("code-sceptic", true)
			registry.addProviderProfile({
				name: "Test",
				providerType: "test",
				model: "test",
			})
			registry.setEnabled(false)

			expect(events).toContain("roleConfigChanged")
			expect(events).toContain("providerProfileAdded")
			expect(events).toContain("enabledChanged")
		})
	})

	describe("Dispose", () => {
		it("should dispose without errors", () => {
			// Add some data
			registry.addProviderProfile({
				name: "Test",
				providerType: "test",
				model: "test",
			})

			// Subscribe
			const unsubscribe = registry.onConfigChange(() => {})
			unsubscribe()

			// Dispose
			expect(() => registry.dispose()).not.toThrow()
		})
	})
})
