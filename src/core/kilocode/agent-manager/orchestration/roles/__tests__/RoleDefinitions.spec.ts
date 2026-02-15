// kilocode_change - new file
/**
 * Tests for Role Definitions Module
 */

import { describe, it, expect } from "vitest"
import {
	getAllRoleDefinitions,
	getRoleDefinition,
	getOrchestratorRoleDefinition,
	getRequiredRoleIds,
	getRoleIdsByCategory,
	isValidRoleId,
	getRoleCategory,
	getDefaultModeForRole,
	getRolePriority,
	canRoleHandleInput,
	canRoleProduceOutput,
	getAllCategories,
	type OrchestratorRoleDefinition,
	type RoleCategory,
} from "../RoleDefinitions"

describe("RoleDefinitions", () => {
	describe("getAllRoleDefinitions", () => {
		it("should return all predefined role definitions", () => {
			const definitions = getAllRoleDefinitions()
			expect(definitions).toBeInstanceOf(Array)
			expect(definitions.length).toBeGreaterThan(0)
		})

		it("should return roles with required properties", () => {
			const definitions = getAllRoleDefinitions()
			for (const def of definitions) {
				expect(def.id).toBeDefined()
				expect(def.name).toBeDefined()
				expect(def.description).toBeDefined()
				expect(def.category).toBeDefined()
				expect(def.capabilities).toBeInstanceOf(Array)
				expect(def.inputArtifacts).toBeInstanceOf(Array)
				expect(def.outputArtifacts).toBeInstanceOf(Array)
				expect(typeof def.required).toBe("boolean")
				expect(def.systemPrompt).toBeDefined()
			}
		})
	})

	describe("getRoleDefinition", () => {
		it("should return role definition for valid role ID", () => {
			const architect = getRoleDefinition("architect")
			expect(architect).toBeDefined()
			expect(architect?.id).toBe("architect")
			expect(architect?.name).toBe("Architect")
		})

		it("should return undefined for invalid role ID", () => {
			const invalid = getRoleDefinition("invalid-role")
			expect(invalid).toBeUndefined()
		})
	})

	describe("getOrchestratorRoleDefinition", () => {
		it("should return orchestrator role definition for valid role ID", () => {
			const architect = getOrchestratorRoleDefinition("architect")
			expect(architect).toBeDefined()
			expect(architect?.id).toBe("architect")
			expect(architect?.defaultMode).toBe("architect")
			expect(architect?.priority).toBe(90)
		})

		it("should return undefined for invalid role ID", () => {
			const invalid = getOrchestratorRoleDefinition("invalid-role")
			expect(invalid).toBeUndefined()
		})
	})

	describe("getRequiredRoleIds", () => {
		it("should return required role IDs", () => {
			const requiredIds = getRequiredRoleIds()
			expect(requiredIds).toBeInstanceOf(Array)
			expect(requiredIds).toContain("organiser")
			expect(requiredIds).toContain("architect")
			expect(requiredIds).toContain("primary-coder")
			expect(requiredIds).toContain("secondary-coder")
		})

		it("should not include optional roles in required", () => {
			const requiredIds = getRequiredRoleIds()
			expect(requiredIds).not.toContain("code-sceptic")
			expect(requiredIds).not.toContain("documentation-writer")
			expect(requiredIds).not.toContain("debugger")
		})
	})

	describe("getRoleIdsByCategory", () => {
		it("should return role IDs for planning category", () => {
			const planningRoles = getRoleIdsByCategory("planning")
			expect(planningRoles).toContain("architect")
			expect(planningRoles.length).toBe(1)
		})

		it("should return role IDs for implementation category", () => {
			const implRoles = getRoleIdsByCategory("implementation")
			expect(implRoles).toContain("primary-coder")
			expect(implRoles).toContain("secondary-coder")
			expect(implRoles.length).toBe(2)
		})

		it("should return role IDs for review category", () => {
			const reviewRoles = getRoleIdsByCategory("review")
			expect(reviewRoles).toContain("code-sceptic")
			expect(reviewRoles.length).toBe(1)
		})

		it("should return role IDs for documentation category", () => {
			const docRoles = getRoleIdsByCategory("documentation")
			expect(docRoles).toContain("documentation-writer")
			expect(docRoles.length).toBe(1)
		})

		it("should return role IDs for testing category", () => {
			const testRoles = getRoleIdsByCategory("testing")
			expect(testRoles).toContain("debugger")
			expect(testRoles.length).toBe(1)
		})
	})

	describe("isValidRoleId", () => {
		it("should return true for valid role IDs", () => {
			expect(isValidRoleId("architect")).toBe(true)
			expect(isValidRoleId("primary-coder")).toBe(true)
			expect(isValidRoleId("code-sceptic")).toBe(true)
			expect(isValidRoleId("organiser")).toBe(true)
		})

		it("should return false for invalid role IDs", () => {
			expect(isValidRoleId("invalid-role")).toBe(false)
			expect(isValidRoleId("")).toBe(false)
		})
	})

	describe("getRoleCategory", () => {
		it("should return correct category for architect", () => {
			const category = getRoleCategory("architect")
			expect(category).toBe("planning")
		})

		it("should return correct category for primary-coder", () => {
			const category = getRoleCategory("primary-coder")
			expect(category).toBe("implementation")
		})

		it("should return undefined for invalid role", () => {
			const category = getRoleCategory("invalid-role")
			expect(category).toBeUndefined()
		})
	})

	describe("getDefaultModeForRole", () => {
		it("should return correct default mode for architect", () => {
			const mode = getDefaultModeForRole("architect")
			expect(mode).toBe("architect")
		})

		it("should return correct default mode for coder roles", () => {
			expect(getDefaultModeForRole("primary-coder")).toBe("code")
			expect(getDefaultModeForRole("secondary-coder")).toBe("code")
		})

		it("should return fallback mode for invalid role", () => {
			const mode = getDefaultModeForRole("invalid-role")
			expect(mode).toBe("code")
		})
	})

	describe("getRolePriority", () => {
		it("should return highest priority for organiser", () => {
			const priority = getRolePriority("organiser")
			expect(priority).toBe(100)
		})

		it("should return decreasing priorities for other roles", () => {
			const architectPriority = getRolePriority("architect")
			const primaryCoderPriority = getRolePriority("primary-coder")
			const secondaryCoderPriority = getRolePriority("secondary-coder")
			const scepticPriority = getRolePriority("code-sceptic")

			expect(architectPriority).toBeGreaterThan(primaryCoderPriority)
			expect(primaryCoderPriority).toBeGreaterThan(secondaryCoderPriority)
			expect(secondaryCoderPriority).toBeGreaterThan(scepticPriority)
		})
	})

	describe("canRoleHandleInput", () => {
		it("should return true when role can handle input type", () => {
			expect(canRoleHandleInput("architect", "user_task")).toBe(true)
			expect(canRoleHandleInput("primary-coder", "implementation_plan")).toBe(true)
			expect(canRoleHandleInput("secondary-coder", "pseudocode")).toBe(true)
		})

		it("should return false when role cannot handle input type", () => {
			expect(canRoleHandleInput("architect", "code")).toBe(false)
			expect(canRoleHandleInput("debugger", "implementation_plan")).toBe(false)
		})
	})

	describe("canRoleProduceOutput", () => {
		it("should return true when role can produce output type", () => {
			expect(canRoleProduceOutput("architect", "implementation_plan")).toBe(true)
			expect(canRoleProduceOutput("primary-coder", "pseudocode")).toBe(true)
			expect(canRoleProduceOutput("secondary-coder", "code")).toBe(true)
		})

		it("should return false when role cannot produce output type", () => {
			expect(canRoleProduceOutput("architect", "code")).toBe(false)
			expect(canRoleProduceOutput("debugger", "documentation")).toBe(false)
		})
	})

	describe("getAllCategories", () => {
		it("should return all role categories", () => {
			const categories = getAllCategories()
			expect(categories).toContain("coordination")
			expect(categories).toContain("planning")
			expect(categories).toContain("implementation")
			expect(categories).toContain("review")
			expect(categories).toContain("documentation")
			expect(categories).toContain("testing")
			expect(categories.length).toBe(6)
		})
	})

	describe("Role Definitions Structure", () => {
		it("should have correct capabilities for architect role", () => {
			const architect = getOrchestratorRoleDefinition("architect")
			expect(architect).toBeDefined()

			const capabilityNames = architect!.capabilities.map((c) => c.name)
			expect(capabilityNames).toContain("analyze_repository")
			expect(capabilityNames).toContain("create_plan")
			expect(capabilityNames).toContain("revise_plan")
		})

		it("should have correct capabilities for code-sceptic role", () => {
			const sceptic = getOrchestratorRoleDefinition("code-sceptic")
			expect(sceptic).toBeDefined()

			const capabilityNames = sceptic!.capabilities.map((c) => c.name)
			expect(capabilityNames).toContain("review_plan")
			expect(capabilityNames).toContain("review_code")
		})

		it("should have required flag set correctly", () => {
			const organiser = getOrchestratorRoleDefinition("organiser")
			const architect = getOrchestratorRoleDefinition("architect")
			const codeSceptic = getOrchestratorRoleDefinition("code-sceptic")

			expect(organiser?.required).toBe(true)
			expect(architect?.required).toBe(true)
			expect(codeSceptic?.required).toBe(false)
		})
	})
})
