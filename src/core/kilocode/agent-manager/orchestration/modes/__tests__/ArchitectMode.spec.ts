// kilocode_change - new file
/**
 * Architect Mode Tests
 *
 * Tests for the architect mode configuration and integration
 * with the multi-agent orchestration system.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import type { ModeConfig } from "@roo-code/types"
import type { ArtifactType } from "@kilocode/core-schemas"
import {
	ARCHITECT_MODE_CONFIG,
	ARCHITECT_INPUT_ARTIFACTS,
	ARCHITECT_OUTPUT_ARTIFACTS,
	getArchitectModeConfig,
	validateArchitectTaskRequest,
	type ArchitectTaskRequest,
} from "../ArchitectMode"

describe("ArchitectMode", () => {
	describe("ARCHITECT_MODE_CONFIG", () => {
		it("should have correct slug", () => {
			expect(ARCHITECT_MODE_CONFIG.slug).toBe("architect")
		})

		it("should have correct name", () => {
			expect(ARCHITECT_MODE_CONFIG.name).toBe("Architect")
		})

		it("should have role definition for multi-agent context", () => {
			expect(ARCHITECT_MODE_CONFIG.roleDefinition).toContain("multi-agent orchestration system")
		})

		it("should have groups defined", () => {
			expect(ARCHITECT_MODE_CONFIG.groups).toBeDefined()
			expect(Array.isArray(ARCHITECT_MODE_CONFIG.groups)).toBe(true)
		})

		it("should have custom instructions for multi-agent workflow", () => {
			expect(ARCHITECT_MODE_CONFIG.customInstructions).toBeDefined()
			expect(ARCHITECT_MODE_CONFIG.customInstructions).toContain("Multi-Agent Orchestration Context")
		})
	})

	describe("ARCHITECT_INPUT_ARTIFACTS", () => {
		it("should include user_task", () => {
			expect(ARCHITECT_INPUT_ARTIFACTS).toContain("user_task")
		})
	})

	describe("ARCHITECT_OUTPUT_ARTIFACTS", () => {
		it("should include implementation_plan", () => {
			expect(ARCHITECT_OUTPUT_ARTIFACTS).toContain("implementation_plan")
		})
	})

	describe("getArchitectModeConfig", () => {
		it("should return the architect mode config", () => {
			const config = getArchitectModeConfig()
			expect(config.slug).toBe("architect")
			expect(config).toEqual(ARCHITECT_MODE_CONFIG)
		})
	})

	describe("validateArchitectTaskRequest", () => {
		it("should return true for valid create_plan request", () => {
			const request: ArchitectTaskRequest = {
				taskType: "create_plan",
				userTask: "Create a new feature",
			}
			expect(validateArchitectTaskRequest(request)).toBe(true)
		})

		it("should return true for valid revise_plan request", () => {
			const request: ArchitectTaskRequest = {
				taskType: "revise_plan",
				userTask: "Revise the existing plan",
				context: {
					existingPlanId: "plan-123",
					reviewFeedback: "Needs more detail",
				},
			}
			expect(validateArchitectTaskRequest(request)).toBe(true)
		})

		it("should return true for valid analyze_repository request", () => {
			const request: ArchitectTaskRequest = {
				taskType: "analyze_repository",
				userTask: "Analyze the codebase structure",
			}
			expect(validateArchitectTaskRequest(request)).toBe(true)
		})

		it("should return false for missing taskType", () => {
			const request = {
				userTask: "Create a new feature",
			} as ArchitectTaskRequest
			expect(validateArchitectTaskRequest(request)).toBe(false)
		})

		it("should return false for missing userTask", () => {
			const request = {
				taskType: "create_plan",
			} as ArchitectTaskRequest
			expect(validateArchitectTaskRequest(request)).toBe(false)
		})

		it("should return false for invalid taskType", () => {
			const request: ArchitectTaskRequest = {
				taskType: "invalid_type" as ArchitectTaskRequest["taskType"],
				userTask: "Create a new feature",
			}
			expect(validateArchitectTaskRequest(request)).toBe(false)
		})

		it("should return false for empty request", () => {
			expect(validateArchitectTaskRequest({} as ArchitectTaskRequest)).toBe(false)
		})
	})

	describe("ArchitectMode integration with orchestration", () => {
		it("should have ModeConfig structure compatible with @roo-code/types", () => {
			const config: ModeConfig = ARCHITECT_MODE_CONFIG
			expect(config.slug).toBeDefined()
			expect(config.name).toBeDefined()
			expect(config.roleDefinition).toBeDefined()
			expect(config.groups).toBeDefined()
		})

		it("should have input artifacts that match orchestration types", () => {
			const inputArtifacts: ArtifactType[] = ARCHITECT_INPUT_ARTIFACTS
			expect(inputArtifacts.every((a) => typeof a === "string")).toBe(true)
		})

		it("should have output artifacts that match orchestration types", () => {
			const outputArtifacts: ArtifactType[] = ARCHITECT_OUTPUT_ARTIFACTS
			expect(outputArtifacts.every((a) => typeof a === "string")).toBe(true)
		})
	})

	describe("ArchitectMode customInstructions content", () => {
		it("should include repository analysis guidance", () => {
			expect(ARCHITECT_MODE_CONFIG.customInstructions).toContain("Repository Analysis")
		})

		it("should include implementation planning guidance", () => {
			expect(ARCHITECT_MODE_CONFIG.customInstructions).toContain("Implementation Planning")
		})

		it("should include artifact production guidance", () => {
			expect(ARCHITECT_MODE_CONFIG.customInstructions).toContain("Artifact Production")
		})

		it("should include communication protocol guidance", () => {
			expect(ARCHITECT_MODE_CONFIG.customInstructions).toContain("Communication Protocol")
		})

		it("should include plan structure template", () => {
			expect(ARCHITECT_MODE_CONFIG.customInstructions).toContain("Plan Structure")
		})
	})
})
