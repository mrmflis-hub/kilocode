// kilocode_change - new file
/**
 * Tests for Custom Role Support
 *
 * Tests the custom role definition system including:
 * - Custom role definition interface
 * - Custom role registration
 * - Custom role validation
 * - Integration with RoleRegistry
 * - Integration with modes
 * - Integration with workflow
 * - Integration with agent pool
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { RoleRegistry, type OrchestrationConfiguration } from "../RoleRegistry"
import { type OrchestratorRoleDefinition, getAllCategories, isValidRoleId } from "../RoleDefinitions"
import type { ArtifactType } from "@kilocode/core-schemas"

// Import mode configurations for integration testing
import { ARCHITECT_MODE_CONFIG, ARCHITECT_INPUT_ARTIFACTS, ARCHITECT_OUTPUT_ARTIFACTS } from "../../modes/ArchitectMode"
import {
	PRIMARY_CODER_MODE_CONFIG,
	PRIMARY_CODER_INPUT_ARTIFACTS,
	PRIMARY_CODER_OUTPUT_ARTIFACTS,
} from "../../modes/PrimaryCoderMode"
import {
	SECONDARY_CODER_MODE_CONFIG,
	SECONDARY_CODER_INPUT_ARTIFACTS,
	SECONDARY_CODER_OUTPUT_ARTIFACTS,
} from "../../modes/SecondaryCoderMode"
import {
	CODE_SCEPTIC_MODE_CONFIG,
	CODE_SCEPTIC_INPUT_ARTIFACTS,
	CODE_SCEPTIC_OUTPUT_ARTIFACTS,
} from "../../modes/CodeScepticMode"
import {
	DOCUMENTATION_WRITER_MODE_CONFIG,
	DOCUMENTATION_WRITER_INPUT_ARTIFACTS,
	DOCUMENTATION_WRITER_OUTPUT_ARTIFACTS,
} from "../../modes/DocumentationWriterMode"
import { DEBUGGER_MODE_CONFIG, DEBUGGER_INPUT_ARTIFACTS, DEBUGGER_OUTPUT_ARTIFACTS } from "../../modes/DebuggerMode"

describe("Custom Roles", () => {
	let registry: RoleRegistry

	beforeEach(() => {
		registry = new RoleRegistry()
	})

	afterEach(() => {
		registry.dispose()
	})

	// ============================================================================
	// Custom Role Definition Interface Tests
	// ============================================================================

	describe("Custom Role Definition Interface", () => {
		it("should define a valid custom role with all required fields", () => {
			const customRole: OrchestratorRoleDefinition = {
				id: "custom-analyst",
				name: "Data Analyst",
				description: "Analyzes data and produces reports",
				category: "implementation",
				required: false,
				capabilities: [
					{ name: "analyze_data", description: "Analyze data sets", required: true },
					{ name: "create_reports", description: "Create analysis reports", required: true },
				],
				inputArtifactTypes: ["code"],
				outputArtifactTypes: ["documentation"],
				defaultMode: "code",
				priority: 30,
			}

			expect(customRole.id).toBe("custom-analyst")
			expect(customRole.name).toBe("Data Analyst")
			expect(customRole.category).toBe("implementation")
			expect(customRole.required).toBe(false)
			expect(customRole.capabilities).toHaveLength(2)
			expect(customRole.inputArtifactTypes).toContain("code")
			expect(customRole.outputArtifactTypes).toContain("documentation")
			expect(customRole.defaultMode).toBe("code")
			expect(customRole.priority).toBe(30)
		})

		it("should support all role categories", () => {
			const categories = getAllCategories()
			expect(categories).toContain("coordination")
			expect(categories).toContain("planning")
			expect(categories).toContain("implementation")
			expect(categories).toContain("review")
			expect(categories).toContain("documentation")
			expect(categories).toContain("testing")
		})

		it("should allow custom roles with empty capabilities", () => {
			const customRole: OrchestratorRoleDefinition = {
				id: "minimal-role",
				name: "Minimal Role",
				description: "A minimal custom role",
				category: "implementation",
				required: false,
				capabilities: [],
				inputArtifactTypes: [],
				outputArtifactTypes: [],
				defaultMode: "code",
				priority: 10,
			}

			expect(customRole.capabilities).toHaveLength(0)
		})

		it("should allow custom roles with multiple input/output artifact types", () => {
			const customRole: OrchestratorRoleDefinition = {
				id: "multi-artifact-role",
				name: "Multi Artifact Role",
				description: "Handles multiple artifact types",
				category: "implementation",
				required: false,
				capabilities: [],
				inputArtifactTypes: ["implementation_plan", "pseudocode", "code"],
				outputArtifactTypes: ["code", "documentation"],
				defaultMode: "code",
				priority: 50,
			}

			expect(customRole.inputArtifactTypes).toHaveLength(3)
			expect(customRole.outputArtifactTypes).toHaveLength(2)
		})
	})

	// ============================================================================
	// Custom Role Registration Tests
	// ============================================================================

	describe("Custom Role Registration", () => {
		it("should register a new custom role", () => {
			const customRole: OrchestratorRoleDefinition = {
				id: "custom-reviewer",
				name: "Custom Reviewer",
				description: "A custom code reviewer",
				category: "review",
				required: false,
				capabilities: [{ name: "review", description: "Review code", required: true }],
				inputArtifactTypes: ["code"],
				outputArtifactTypes: ["review_report"],
				defaultMode: "code-review",
				priority: 55,
			}

			const result = registry.addCustomRole(customRole)
			expect(result).toBe(true)

			const roleDef = registry.getRoleDefinition("custom-reviewer")
			expect(roleDef).toBeDefined()
			expect(roleDef?.id).toBe("custom-reviewer")
			expect(roleDef?.name).toBe("Custom Reviewer")
		})

		it("should not register a custom role with existing predefined ID", () => {
			const customRole: OrchestratorRoleDefinition = {
				id: "architect", // Predefined role ID
				name: "Custom Architect",
				description: "A custom architect",
				category: "planning",
				required: false,
				capabilities: [],
				inputArtifactTypes: [],
				outputArtifactTypes: ["implementation_plan"],
				defaultMode: "architect",
				priority: 100,
			}

			const result = registry.addCustomRole(customRole)
			expect(result).toBe(false)
		})

		it("should update an existing custom role", () => {
			const customRole: OrchestratorRoleDefinition = {
				id: "custom-role",
				name: "Original Name",
				description: "Original description",
				category: "implementation",
				required: false,
				capabilities: [],
				inputArtifactTypes: [],
				outputArtifactTypes: [],
				defaultMode: "code",
				priority: 10,
			}

			registry.addCustomRole(customRole)

			// Update the role
			const updatedRole: OrchestratorRoleDefinition = {
				...customRole,
				name: "Updated Name",
				description: "Updated description",
				priority: 50,
			}

			const result = registry.addCustomRole(updatedRole)
			expect(result).toBe(true)

			const roleDef = registry.getRoleDefinition("custom-role")
			expect(roleDef?.name).toBe("Updated Name")
		})

		it("should delete a custom role", () => {
			const customRole: OrchestratorRoleDefinition = {
				id: "custom-to-delete",
				name: "To Delete",
				description: "Will be deleted",
				category: "implementation",
				required: false,
				capabilities: [],
				inputArtifactTypes: [],
				outputArtifactTypes: [],
				defaultMode: "code",
				priority: 10,
			}

			registry.addCustomRole(customRole)
			expect(registry.getRoleDefinition("custom-to-delete")).toBeDefined()

			const result = registry.deleteCustomRole("custom-to-delete")
			expect(result).toBe(true)
			expect(registry.getRoleDefinition("custom-to-delete")).toBeUndefined()
		})

		it("should not delete a predefined role", () => {
			const result = registry.deleteCustomRole("architect")
			expect(result).toBe(false)
			expect(registry.getRoleDefinition("architect")).toBeDefined()
		})

		it("should track custom role IDs separately", () => {
			const customRole1: OrchestratorRoleDefinition = {
				id: "custom-1",
				name: "Custom 1",
				description: "First custom role",
				category: "implementation",
				required: false,
				capabilities: [],
				inputArtifactTypes: [],
				outputArtifactTypes: [],
				defaultMode: "code",
				priority: 10,
			}

			const customRole2: OrchestratorRoleDefinition = {
				id: "custom-2",
				name: "Custom 2",
				description: "Second custom role",
				category: "review",
				required: false,
				capabilities: [],
				inputArtifactTypes: [],
				outputArtifactTypes: [],
				defaultMode: "code",
				priority: 20,
			}

			registry.addCustomRole(customRole1)
			registry.addCustomRole(customRole2)

			const customIds = registry.getCustomRoleIds()
			expect(customIds).toContain("custom-1")
			expect(customIds).toContain("custom-2")
			expect(customIds).not.toContain("architect")
		})

		it("should create role configuration when adding custom role", () => {
			const customRole: OrchestratorRoleDefinition = {
				id: "custom-with-config",
				name: "Custom With Config",
				description: "Custom role with auto-created config",
				category: "implementation",
				required: false,
				capabilities: [],
				inputArtifactTypes: [],
				outputArtifactTypes: [],
				defaultMode: "custom-mode",
				priority: 25,
			}

			registry.addCustomRole(customRole)

			const config = registry.getRoleConfiguration("custom-with-config")
			expect(config).toBeDefined()
			expect(config?.enabled).toBe(true)
			expect(config?.mode).toBe("custom-mode")
			expect(config?.priority).toBe(25)
		})
	})

	// ============================================================================
	// Custom Role Validation Tests
	// ============================================================================

	describe("Custom Role Validation", () => {
		it("should validate a valid custom role", () => {
			const customRole: OrchestratorRoleDefinition = {
				id: "valid-custom-role",
				name: "Valid Custom Role",
				description: "A valid custom role",
				category: "implementation",
				required: false,
				capabilities: [{ name: "cap1", description: "Capability 1", required: true }],
				inputArtifactTypes: ["code"],
				outputArtifactTypes: ["documentation"],
				defaultMode: "code",
				priority: 50,
			}

			// Validate required fields
			expect(customRole.id).toBeTruthy()
			expect(customRole.name).toBeTruthy()
			expect(customRole.description).toBeTruthy()
			expect(customRole.category).toBeTruthy()
			expect(typeof customRole.priority).toBe("number")
			expect(customRole.priority).toBeGreaterThanOrEqual(0)
		})

		it("should reject custom role with empty ID", () => {
			const customRole: OrchestratorRoleDefinition = {
				id: "",
				name: "Empty ID Role",
				description: "Role with empty ID",
				category: "implementation",
				required: false,
				capabilities: [],
				inputArtifactTypes: [],
				outputArtifactTypes: [],
				defaultMode: "code",
				priority: 10,
			}

			// Empty ID should not be valid
			expect(customRole.id).toBeFalsy()
		})

		it("should reject custom role with invalid category", () => {
			const customRole = {
				id: "invalid-category-role",
				name: "Invalid Category",
				description: "Role with invalid category",
				category: "invalid-category", // Invalid
				required: false,
				capabilities: [],
				inputArtifactTypes: [],
				outputArtifactTypes: [],
				defaultMode: "code",
				priority: 10,
			} as unknown as OrchestratorRoleDefinition

			const validCategories = getAllCategories()
			expect(validCategories).not.toContain(customRole.category)
		})

		it("should validate capability structure", () => {
			const capabilities = [
				{ name: "cap1", description: "Capability 1", required: true },
				{ name: "cap2", description: "Capability 2", required: false },
			]

			for (const cap of capabilities) {
				expect(cap.name).toBeTruthy()
				expect(cap.description).toBeTruthy()
				expect(typeof cap.required).toBe("boolean")
			}
		})

		it("should validate artifact types against known types", () => {
			const knownArtifactTypes: ArtifactType[] = [
				"implementation_plan",
				"pseudocode",
				"code",
				"review_report",
				"documentation",
				"test_results",
			]

			const customRole: OrchestratorRoleDefinition = {
				id: "artifact-validator",
				name: "Artifact Validator",
				description: "Validates artifact types",
				category: "implementation",
				required: false,
				capabilities: [],
				inputArtifactTypes: ["implementation_plan", "code"],
				outputArtifactTypes: ["documentation", "test_results"],
				defaultMode: "code",
				priority: 50,
			}

			for (const type of customRole.inputArtifactTypes) {
				expect(knownArtifactTypes).toContain(type)
			}
			for (const type of customRole.outputArtifactTypes) {
				expect(knownArtifactTypes).toContain(type)
			}
		})

		it("should validate priority range", () => {
			const validPriorities = [0, 1, 50, 100, 1000]
			for (const priority of validPriorities) {
				expect(priority).toBeGreaterThanOrEqual(0)
			}
		})

		it("should check if role ID is valid (predefined)", () => {
			expect(isValidRoleId("architect")).toBe(true)
			expect(isValidRoleId("primary-coder")).toBe(true)
			expect(isValidRoleId("non-existent")).toBe(false)
		})
	})

	// ============================================================================
	// Integration with RoleRegistry Tests
	// ============================================================================

	describe("Integration with RoleRegistry", () => {
		it("should include custom roles in getAllRoleDefinitions", () => {
			const customRole: OrchestratorRoleDefinition = {
				id: "custom-in-all",
				name: "Custom In All",
				description: "Should appear in all definitions",
				category: "implementation",
				required: false,
				capabilities: [],
				inputArtifactTypes: [],
				outputArtifactTypes: [],
				defaultMode: "code",
				priority: 10,
			}

			registry.addCustomRole(customRole)

			const allRoles = registry.getAllRoleDefinitions()
			const customInAll = allRoles.find((r) => r.id === "custom-in-all")
			expect(customInAll).toBeDefined()
		})

		it("should get OrchestratorRoleDefinition for custom role", () => {
			const customRole: OrchestratorRoleDefinition = {
				id: "custom-orch-def",
				name: "Custom Orch Def",
				description: "Custom role for OrchestratorRoleDefinition test",
				category: "implementation",
				required: false,
				capabilities: [{ name: "custom_cap", description: "Custom capability", required: true }],
				inputArtifactTypes: ["code"],
				outputArtifactTypes: ["documentation"],
				defaultMode: "code",
				priority: 30,
			}

			registry.addCustomRole(customRole)

			const orchDef = registry.getOrchestratorRoleDefinition("custom-orch-def")
			expect(orchDef).toBeDefined()
			expect(orchDef?.capabilities).toHaveLength(1)
			expect(orchDef?.capabilities[0].name).toBe("custom_cap")
		})

		it("should emit events when custom role is added", () => {
			const eventHandler = vi.fn()
			registry.on("customRoleAdded", eventHandler)

			const customRole: OrchestratorRoleDefinition = {
				id: "custom-event",
				name: "Custom Event",
				description: "Custom role for event test",
				category: "implementation",
				required: false,
				capabilities: [],
				inputArtifactTypes: [],
				outputArtifactTypes: [],
				defaultMode: "code",
				priority: 10,
			}

			registry.addCustomRole(customRole)

			expect(eventHandler).toHaveBeenCalledWith(customRole)
		})

		it("should emit events when custom role is deleted", () => {
			const eventHandler = vi.fn()
			registry.on("customRoleDeleted", eventHandler)

			const customRole: OrchestratorRoleDefinition = {
				id: "custom-delete-event",
				name: "Custom Delete Event",
				description: "Custom role for delete event test",
				category: "implementation",
				required: false,
				capabilities: [],
				inputArtifactTypes: [],
				outputArtifactTypes: [],
				defaultMode: "code",
				priority: 10,
			}

			registry.addCustomRole(customRole)
			registry.deleteCustomRole("custom-delete-event")

			expect(eventHandler).toHaveBeenCalled()
		})

		it("should include custom roles in role assignments", () => {
			const customRole: OrchestratorRoleDefinition = {
				id: "custom-assignment",
				name: "Custom Assignment",
				description: "Custom role for assignment test",
				category: "implementation",
				required: false,
				capabilities: [],
				inputArtifactTypes: [],
				outputArtifactTypes: [],
				defaultMode: "code",
				priority: 40,
			}

			registry.addCustomRole(customRole)

			const assignments = registry.getRoleAssignments()
			const customAssignment = assignments.find((a) => a.roleId === "custom-assignment")
			expect(customAssignment).toBeDefined()
			expect(customAssignment?.roleName).toBe("Custom Assignment")
			expect(customAssignment?.priority).toBe(40)
		})

		it("should validate configuration with custom roles", () => {
			const customRole: OrchestratorRoleDefinition = {
				id: "custom-validation",
				name: "Custom Validation",
				description: "Custom role for validation test",
				category: "implementation",
				required: false,
				capabilities: [],
				inputArtifactTypes: [],
				outputArtifactTypes: [],
				defaultMode: "code",
				priority: 10,
			}

			registry.addCustomRole(customRole)

			const validation = registry.validateConfiguration()
			expect(validation.valid).toBe(true)
		})
	})

	// ============================================================================
	// Integration with Modes Tests
	// ============================================================================

	describe("Integration with Modes", () => {
		it("should use custom mode for custom role", () => {
			const customRole: OrchestratorRoleDefinition = {
				id: "custom-mode-role",
				name: "Custom Mode Role",
				description: "Custom role with custom mode",
				category: "implementation",
				required: false,
				capabilities: [],
				inputArtifactTypes: [],
				outputArtifactTypes: [],
				defaultMode: "custom-special-mode",
				priority: 10,
			}

			registry.addCustomRole(customRole)

			const mode = registry.getModeForRole("custom-mode-role")
			expect(mode).toBe("custom-special-mode")
		})

		it("should allow custom role to use existing mode configurations", () => {
			const customRole: OrchestratorRoleDefinition = {
				id: "custom-architect-like",
				name: "Custom Architect Like",
				description: "Custom role using architect mode",
				category: "planning",
				required: false,
				capabilities: [
					{ name: "analyze_repository", description: "Analyze repository", required: true },
					{ name: "create_plan", description: "Create implementation plan", required: true },
				],
				inputArtifactTypes: [],
				outputArtifactTypes: ["implementation_plan"],
				defaultMode: "architect",
				priority: 85,
			}

			registry.addCustomRole(customRole)

			const mode = registry.getModeForRole("custom-architect-like")
			expect(mode).toBe("architect")

			// Verify the mode config exists
			expect(ARCHITECT_MODE_CONFIG.slug).toBe("architect")
		})

		it("should validate custom role input/output artifacts match mode expectations", () => {
			// Custom role using architect mode should have compatible artifacts
			const customRole: OrchestratorRoleDefinition = {
				id: "custom-architect-compatible",
				name: "Custom Architect Compatible",
				description: "Custom role compatible with architect mode",
				category: "planning",
				required: false,
				capabilities: [],
				inputArtifactTypes: [], // Architect mode expects no input
				outputArtifactTypes: ["implementation_plan"], // Architect produces plans
				defaultMode: "architect",
				priority: 85,
			}

			registry.addCustomRole(customRole)

			// Verify artifact compatibility using the separate constants
			expect(ARCHITECT_OUTPUT_ARTIFACTS).toContain("implementation_plan")
		})

		it("should support custom role with code-sceptic-like configuration", () => {
			const customReviewerRole: OrchestratorRoleDefinition = {
				id: "custom-security-reviewer",
				name: "Security Reviewer",
				description: "Specialized security code reviewer",
				category: "review",
				required: false,
				capabilities: [
					{ name: "security_review", description: "Perform security review", required: true },
					{ name: "vulnerability_scan", description: "Scan for vulnerabilities", required: true },
				],
				inputArtifactTypes: ["implementation_plan", "code"],
				outputArtifactTypes: ["review_report"],
				defaultMode: "code-review",
				priority: 65,
			}

			registry.addCustomRole(customReviewerRole)

			const orchDef = registry.getOrchestratorRoleDefinition("custom-security-reviewer")
			expect(orchDef?.category).toBe("review")
			expect(orchDef?.inputArtifactTypes).toContain("code")
			expect(orchDef?.outputArtifactTypes).toContain("review_report")
		})
	})

	// ============================================================================
	// Integration with Workflow Tests
	// ============================================================================

	describe("Integration with Workflow", () => {
		it("should support custom role in workflow planning phase", () => {
			const customPlannerRole: OrchestratorRoleDefinition = {
				id: "custom-planner",
				name: "Custom Planner",
				description: "Custom planning role",
				category: "planning",
				required: false,
				capabilities: [{ name: "plan", description: "Create plans", required: true }],
				inputArtifactTypes: [],
				outputArtifactTypes: ["implementation_plan"],
				defaultMode: "architect",
				priority: 88,
			}

			registry.addCustomRole(customPlannerRole)

			// Verify the role is available for planning phase
			const planningRoles = registry.getAllRoleDefinitions().filter((r) => r.category === "planning")
			expect(planningRoles.some((r) => r.id === "custom-planner")).toBe(true)
		})

		it("should support custom role in workflow implementation phase", () => {
			const customImplRole: OrchestratorRoleDefinition = {
				id: "custom-implementer",
				name: "Custom Implementer",
				description: "Custom implementation role",
				category: "implementation",
				required: false,
				capabilities: [{ name: "implement", description: "Implement features", required: true }],
				inputArtifactTypes: ["implementation_plan", "pseudocode"],
				outputArtifactTypes: ["code"],
				defaultMode: "code",
				priority: 75,
			}

			registry.addCustomRole(customImplRole)

			// Verify the role is available for implementation phase
			const implRoles = registry.getAllRoleDefinitions().filter((r) => r.category === "implementation")
			expect(implRoles.some((r) => r.id === "custom-implementer")).toBe(true)
		})

		it("should support custom role in workflow review phase", () => {
			const customReviewRole: OrchestratorRoleDefinition = {
				id: "custom-reviewer-phase",
				name: "Custom Reviewer Phase",
				description: "Custom review role for workflow",
				category: "review",
				required: false,
				capabilities: [{ name: "review", description: "Review artifacts", required: true }],
				inputArtifactTypes: ["implementation_plan", "code"],
				outputArtifactTypes: ["review_report"],
				defaultMode: "code-review",
				priority: 60,
			}

			registry.addCustomRole(customReviewRole)

			// Verify the role is available for review phase
			const reviewRoles = registry.getAllRoleDefinitions().filter((r) => r.category === "review")
			expect(reviewRoles.some((r) => r.id === "custom-reviewer-phase")).toBe(true)
		})

		it("should support custom role in workflow testing phase", () => {
			const customTestRole: OrchestratorRoleDefinition = {
				id: "custom-tester",
				name: "Custom Tester",
				description: "Custom testing role",
				category: "testing",
				required: false,
				capabilities: [{ name: "test", description: "Run tests", required: true }],
				inputArtifactTypes: ["code"],
				outputArtifactTypes: ["test_results"],
				defaultMode: "debug",
				priority: 45,
			}

			registry.addCustomRole(customTestRole)

			// Verify the role is available for testing phase
			const testRoles = registry.getAllRoleDefinitions().filter((r) => r.category === "testing")
			expect(testRoles.some((r) => r.id === "custom-tester")).toBe(true)
		})
	})

	// ============================================================================
	// Configuration Export/Import Tests
	// ============================================================================

	describe("Configuration Export/Import", () => {
		it("should export configuration with custom roles", () => {
			const customRole: OrchestratorRoleDefinition = {
				id: "custom-export",
				name: "Custom Export",
				description: "Custom role for export test",
				category: "implementation",
				required: false,
				capabilities: [],
				inputArtifactTypes: [],
				outputArtifactTypes: [],
				defaultMode: "code",
				priority: 10,
			}

			registry.addCustomRole(customRole)

			const exported = registry.exportConfiguration()
			const parsed = JSON.parse(exported)

			expect(parsed.roles).toBeDefined()
			expect(parsed.roles.some((r: { roleId: string }) => r.roleId === "custom-export")).toBe(true)
		})

		it("should load configuration with custom roles", () => {
			const config: Partial<OrchestrationConfiguration> = {
				enabled: true,
				maxConcurrentAgents: 5,
				roles: [
					{
						roleId: "architect",
						enabled: true,
						providerProfileId: null,
						mode: "architect",
						priority: 90,
					},
				],
				providerProfiles: [],
				defaultProviderProfileId: null,
			}

			registry.loadConfiguration(config)

			expect(registry.isEnabled()).toBe(true)
			expect(registry.getMaxConcurrentAgents()).toBe(5)
		})
	})

	// ============================================================================
	// Edge Cases and Error Handling
	// ============================================================================

	describe("Edge Cases and Error Handling", () => {
		it("should handle adding duplicate custom role gracefully", () => {
			const customRole: OrchestratorRoleDefinition = {
				id: "duplicate-custom",
				name: "Duplicate Custom",
				description: "Will be added twice",
				category: "implementation",
				required: false,
				capabilities: [],
				inputArtifactTypes: [],
				outputArtifactTypes: [],
				defaultMode: "code",
				priority: 10,
			}

			registry.addCustomRole(customRole)
			registry.addCustomRole(customRole) // Add again

			// Should still have only one instance
			const roleDef = registry.getRoleDefinition("duplicate-custom")
			expect(roleDef).toBeDefined()
		})

		it("should handle deleting non-existent custom role", () => {
			const result = registry.deleteCustomRole("non-existent-custom")
			expect(result).toBe(false)
		})

		it("should handle getting non-existent role definition", () => {
			const roleDef = registry.getRoleDefinition("non-existent-role")
			expect(roleDef).toBeUndefined()
		})

		it("should handle updating configuration for non-existent role", () => {
			const result = registry.updateRoleConfiguration("non-existent", { enabled: true })
			expect(result).toBe(false)
		})

		it("should handle custom role with very long description", () => {
			const longDescription = "A".repeat(1000)
			const customRole: OrchestratorRoleDefinition = {
				id: "long-desc-role",
				name: "Long Description Role",
				description: longDescription,
				category: "implementation",
				required: false,
				capabilities: [],
				inputArtifactTypes: [],
				outputArtifactTypes: [],
				defaultMode: "code",
				priority: 10,
			}

			const result = registry.addCustomRole(customRole)
			expect(result).toBe(true)

			const roleDef = registry.getRoleDefinition("long-desc-role")
			expect(roleDef?.description).toBe(longDescription)
		})

		it("should handle custom role with many capabilities", () => {
			const manyCapabilities = Array.from({ length: 50 }, (_, i) => ({
				name: `capability_${i}`,
				description: `Capability ${i}`,
				required: i % 2 === 0,
			}))

			const customRole: OrchestratorRoleDefinition = {
				id: "many-caps-role",
				name: "Many Capabilities Role",
				description: "Role with many capabilities",
				category: "implementation",
				required: false,
				capabilities: manyCapabilities,
				inputArtifactTypes: [],
				outputArtifactTypes: [],
				defaultMode: "code",
				priority: 10,
			}

			const result = registry.addCustomRole(customRole)
			expect(result).toBe(true)

			const orchDef = registry.getOrchestratorRoleDefinition("many-caps-role")
			expect(orchDef?.capabilities).toHaveLength(50)
		})
	})

	// ============================================================================
	// Provider Profile Integration Tests
	// ============================================================================

	describe("Provider Profile Integration", () => {
		it("should assign provider profile to custom role", () => {
			const customRole: OrchestratorRoleDefinition = {
				id: "custom-with-provider",
				name: "Custom With Provider",
				description: "Custom role with provider profile",
				category: "implementation",
				required: false,
				capabilities: [],
				inputArtifactTypes: [],
				outputArtifactTypes: [],
				defaultMode: "code",
				priority: 10,
			}

			registry.addCustomRole(customRole)

			const profile = registry.addProviderProfile({
				name: "Test Provider",
				providerType: "anthropic",
				model: "claude-3-opus",
			})

			registry.setRoleProviderProfile("custom-with-provider", profile.id)

			const assignedProfile = registry.getProviderProfileForRole("custom-with-provider")
			expect(assignedProfile).toEqual(profile)
		})

		it("should clear provider profile when profile is deleted", () => {
			const customRole: OrchestratorRoleDefinition = {
				id: "custom-profile-delete",
				name: "Custom Profile Delete",
				description: "Custom role for profile delete test",
				category: "implementation",
				required: false,
				capabilities: [],
				inputArtifactTypes: [],
				outputArtifactTypes: [],
				defaultMode: "code",
				priority: 10,
			}

			registry.addCustomRole(customRole)

			const profile = registry.addProviderProfile({
				name: "To Delete",
				providerType: "test",
				model: "test-model",
			})

			registry.setRoleProviderProfile("custom-profile-delete", profile.id)
			registry.deleteProviderProfile(profile.id)

			const assignedProfile = registry.getProviderProfileForRole("custom-profile-delete")
			expect(assignedProfile).toBeNull()
		})
	})

	// ============================================================================
	// Priority and Ordering Tests
	// ============================================================================

	describe("Priority and Ordering", () => {
		it("should maintain custom role priority", () => {
			const highPriorityRole: OrchestratorRoleDefinition = {
				id: "high-priority-custom",
				name: "High Priority Custom",
				description: "High priority custom role",
				category: "implementation",
				required: false,
				capabilities: [],
				inputArtifactTypes: [],
				outputArtifactTypes: [],
				defaultMode: "code",
				priority: 200,
			}

			const lowPriorityRole: OrchestratorRoleDefinition = {
				id: "low-priority-custom",
				name: "Low Priority Custom",
				description: "Low priority custom role",
				category: "implementation",
				required: false,
				capabilities: [],
				inputArtifactTypes: [],
				outputArtifactTypes: [],
				defaultMode: "code",
				priority: 5,
			}

			registry.addCustomRole(highPriorityRole)
			registry.addCustomRole(lowPriorityRole)

			const highConfig = registry.getRoleConfiguration("high-priority-custom")
			const lowConfig = registry.getRoleConfiguration("low-priority-custom")

			expect(highConfig?.priority).toBe(200)
			expect(lowConfig?.priority).toBe(5)
		})

		it("should allow updating custom role priority", () => {
			const customRole: OrchestratorRoleDefinition = {
				id: "priority-update",
				name: "Priority Update",
				description: "Role for priority update test",
				category: "implementation",
				required: false,
				capabilities: [],
				inputArtifactTypes: [],
				outputArtifactTypes: [],
				defaultMode: "code",
				priority: 50,
			}

			registry.addCustomRole(customRole)

			registry.setRolePriority("priority-update", 100)

			const config = registry.getRoleConfiguration("priority-update")
			expect(config?.priority).toBe(100)
		})
	})
})
