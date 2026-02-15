// kilocode_change - new file
/**
 * Primary Coder Mode Tests
 *
 * Tests for the primary coder mode configuration and integration
 * with the multi-agent orchestration system.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import type { ModeConfig } from "@roo-code/types"
import type { ArtifactType } from "@kilocode/core-schemas"
import {
	PRIMARY_CODER_MODE_CONFIG,
	PRIMARY_CODER_INPUT_ARTIFACTS,
	PRIMARY_CODER_OUTPUT_ARTIFACTS,
	getPrimaryCoderModeConfig,
	validatePrimaryCoderTaskRequest,
	type PrimaryCoderTaskRequest,
	type PrimaryCoderTaskType,
} from "../PrimaryCoderMode"

describe("PrimaryCoderMode", () => {
	describe("PRIMARY_CODER_MODE_CONFIG", () => {
		it("should have correct slug", () => {
			expect(PRIMARY_CODER_MODE_CONFIG.slug).toBe("primary-coder")
		})

		it("should have correct name", () => {
			expect(PRIMARY_CODER_MODE_CONFIG.name).toBe("Primary Coder")
		})

		it("should have role definition for multi-agent context", () => {
			expect(PRIMARY_CODER_MODE_CONFIG.roleDefinition).toContain("multi-agent orchestration system")
		})

		it("should have groups defined", () => {
			expect(PRIMARY_CODER_MODE_CONFIG.groups).toBeDefined()
			expect(Array.isArray(PRIMARY_CODER_MODE_CONFIG.groups)).toBe(true)
		})

		it("should have custom instructions for multi-agent workflow", () => {
			expect(PRIMARY_CODER_MODE_CONFIG.customInstructions).toBeDefined()
			expect(PRIMARY_CODER_MODE_CONFIG.customInstructions).toContain("Multi-Agent Orchestration Context")
		})

		it("should contain pseudocode structure guidance", () => {
			expect(PRIMARY_CODER_MODE_CONFIG.customInstructions).toContain("## Data Structures")
			expect(PRIMARY_CODER_MODE_CONFIG.customInstructions).toContain("## Functions/Methods")
		})

		it("should contain file structure creation guidance", () => {
			expect(PRIMARY_CODER_MODE_CONFIG.customInstructions).toContain("File Structure Creation")
			expect(PRIMARY_CODER_MODE_CONFIG.customInstructions).toContain("write_to_file")
		})

		it("should contain communication protocol guidance", () => {
			expect(PRIMARY_CODER_MODE_CONFIG.customInstructions).toContain("Communication Protocol")
			expect(PRIMARY_CODER_MODE_CONFIG.customInstructions).toContain("create_structure")
			expect(PRIMARY_CODER_MODE_CONFIG.customInstructions).toContain("write_pseudocode")
		})
	})

	describe("PRIMARY_CODER_INPUT_ARTIFACTS", () => {
		it("should include implementation_plan", () => {
			expect(PRIMARY_CODER_INPUT_ARTIFACTS).toContain("implementation_plan")
		})

		it("should have only expected artifact types", () => {
			expect(PRIMARY_CODER_INPUT_ARTIFACTS).toHaveLength(1)
			expect(PRIMARY_CODER_INPUT_ARTIFACTS).toEqual(["implementation_plan"])
		})
	})

	describe("PRIMARY_CODER_OUTPUT_ARTIFACTS", () => {
		it("should include pseudocode", () => {
			expect(PRIMARY_CODER_OUTPUT_ARTIFACTS).toContain("pseudocode")
		})

		it("should have only expected artifact types", () => {
			expect(PRIMARY_CODER_OUTPUT_ARTIFACTS).toHaveLength(1)
			expect(PRIMARY_CODER_OUTPUT_ARTIFACTS).toEqual(["pseudocode"])
		})
	})

	describe("getPrimaryCoderModeConfig", () => {
		it("should return the primary coder mode config", () => {
			const config = getPrimaryCoderModeConfig()
			expect(config.slug).toBe("primary-coder")
			expect(config).toEqual(PRIMARY_CODER_MODE_CONFIG)
		})
	})

	describe("validatePrimaryCoderTaskRequest", () => {
		it("should return true for valid create_structure request", () => {
			const request: PrimaryCoderTaskRequest = {
				taskType: "create_structure",
				userTask: "Create the file structure for the feature",
			}
			expect(validatePrimaryCoderTaskRequest(request)).toBe(true)
		})

		it("should return true for valid write_pseudocode request", () => {
			const request: PrimaryCoderTaskRequest = {
				taskType: "write_pseudocode",
				userTask: "Write pseudocode for the feature implementation",
			}
			expect(validatePrimaryCoderTaskRequest(request)).toBe(true)
		})

		it("should return true for valid revise_pseudocode request", () => {
			const request: PrimaryCoderTaskRequest = {
				taskType: "revise_pseudocode",
				userTask: "Revise the existing pseudocode based on feedback",
				context: {
					existingPseudocodeId: "pseudocode-123",
					reviewFeedback: "Make the data structures more type-safe",
				},
			}
			expect(validatePrimaryCoderTaskRequest(request)).toBe(true)
		})

		it("should return false for missing taskType", () => {
			const request = {
				userTask: "Create the file structure",
			} as PrimaryCoderTaskRequest
			expect(validatePrimaryCoderTaskRequest(request)).toBe(false)
		})

		it("should return false for missing userTask", () => {
			const request = {
				taskType: "create_structure",
			} as PrimaryCoderTaskRequest
			expect(validatePrimaryCoderTaskRequest(request)).toBe(false)
		})

		it("should return false for invalid taskType", () => {
			const request: PrimaryCoderTaskRequest = {
				taskType: "invalid_task" as PrimaryCoderTaskType,
				userTask: "Create the file structure",
			}
			expect(validatePrimaryCoderTaskRequest(request)).toBe(false)
		})

		it("should return false for empty request", () => {
			const request = {} as PrimaryCoderTaskRequest
			expect(validatePrimaryCoderTaskRequest(request)).toBe(false)
		})

		it("should accept request with context", () => {
			const request: PrimaryCoderTaskRequest = {
				taskType: "write_pseudocode",
				userTask: "Write pseudocode",
				context: {
					constraints: ["Use TypeScript interfaces"],
				},
			}
			expect(validatePrimaryCoderTaskRequest(request)).toBe(true)
		})
	})

	describe("Mode Configuration Integration", () => {
		it("should have valid ModeConfig structure", () => {
			expect(PRIMARY_CODER_MODE_CONFIG.slug).toBeDefined()
			expect(PRIMARY_CODER_MODE_CONFIG.name).toBeDefined()
			expect(PRIMARY_CODER_MODE_CONFIG.roleDefinition).toBeDefined()
			expect(PRIMARY_CODER_MODE_CONFIG.description).toBeDefined()
			expect(typeof PRIMARY_CODER_MODE_CONFIG.roleDefinition).toBe("string")
			expect(typeof PRIMARY_CODER_MODE_CONFIG.description).toBe("string")
		})

		it("should be compatible with ModeConfig type", () => {
			const config: ModeConfig = PRIMARY_CODER_MODE_CONFIG
			expect(config.slug).toBe("primary-coder")
			expect(config.name).toBe("Primary Coder")
		})

		it("should have artifact types compatible with orchestration types", () => {
			type ArtifactTypeCheck = ArtifactType
			const inputCheck: ArtifactTypeCheck[] = PRIMARY_CODER_INPUT_ARTIFACTS
			const outputCheck: ArtifactTypeCheck[] = PRIMARY_CODER_OUTPUT_ARTIFACTS
			expect(inputCheck).toContain("implementation_plan")
			expect(outputCheck).toContain("pseudocode")
		})
	})

	describe("Task Types", () => {
		it("should define all required task types", () => {
			const validTypes: PrimaryCoderTaskType[] = ["create_structure", "write_pseudocode", "revise_pseudocode"]
			expect(validTypes).toContain("create_structure")
			expect(validTypes).toContain("write_pseudocode")
			expect(validTypes).toContain("revise_pseudocode")
		})
	})
})
