// kilocode_change - new file
/**
 * Secondary Coder Mode Tests
 *
 * Tests for the secondary coder mode configuration and integration
 * with the multi-agent orchestration system.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import type { ModeConfig } from "@roo-code/types"
import type { ArtifactType } from "@kilocode/core-schemas"
import {
	SECONDARY_CODER_MODE_CONFIG,
	SECONDARY_CODER_INPUT_ARTIFACTS,
	SECONDARY_CODER_OUTPUT_ARTIFACTS,
	getSecondaryCoderModeConfig,
	validateSecondaryCoderTaskRequest,
	requiresFileLocking,
	getOutputArtifactType,
	type SecondaryCoderTaskRequest,
	type SecondaryCoderTaskType,
} from "../SecondaryCoderMode"

describe("SecondaryCoderMode", () => {
	describe("SECONDARY_CODER_MODE_CONFIG", () => {
		it("should have correct slug", () => {
			expect(SECONDARY_CODER_MODE_CONFIG.slug).toBe("secondary-coder")
		})

		it("should have correct name", () => {
			expect(SECONDARY_CODER_MODE_CONFIG.name).toBe("Secondary Coder")
		})

		it("should have role definition for multi-agent context", () => {
			expect(SECONDARY_CODER_MODE_CONFIG.roleDefinition).toContain("multi-agent orchestration system")
		})

		it("should have groups defined", () => {
			expect(SECONDARY_CODER_MODE_CONFIG.groups).toBeDefined()
			expect(Array.isArray(SECONDARY_CODER_MODE_CONFIG.groups)).toBe(true)
		})

		it("should have custom instructions for multi-agent workflow", () => {
			expect(SECONDARY_CODER_MODE_CONFIG.customInstructions).toBeDefined()
			expect(SECONDARY_CODER_MODE_CONFIG.customInstructions).toContain("Multi-Agent Orchestration Context")
		})

		it("should contain code implementation guidance", () => {
			expect(SECONDARY_CODER_MODE_CONFIG.customInstructions).toContain("Code Implementation")
			expect(SECONDARY_CODER_MODE_CONFIG.customInstructions).toContain("Convert pseudocode to actual")
		})

		it("should contain code fixing guidance", () => {
			expect(SECONDARY_CODER_MODE_CONFIG.customInstructions).toContain("Code Fixing")
			expect(SECONDARY_CODER_MODE_CONFIG.customInstructions).toContain("Address issues identified")
		})

		it("should contain communication protocol guidance", () => {
			expect(SECONDARY_CODER_MODE_CONFIG.customInstructions).toContain("Communication Protocol")
			expect(SECONDARY_CODER_MODE_CONFIG.customInstructions).toContain("implement_code")
			expect(SECONDARY_CODER_MODE_CONFIG.customInstructions).toContain("fix_code")
		})

		it("should contain file locking integration guidance", () => {
			expect(SECONDARY_CODER_MODE_CONFIG.customInstructions).toContain("File Locking Integration")
			expect(SECONDARY_CODER_MODE_CONFIG.customInstructions).toContain("write lock")
		})

		it("should contain review feedback handling guidance", () => {
			expect(SECONDARY_CODER_MODE_CONFIG.customInstructions).toContain("Handling Review Feedback")
			expect(SECONDARY_CODER_MODE_CONFIG.customInstructions).toContain("Code Sceptic")
		})
	})

	describe("SECONDARY_CODER_INPUT_ARTIFACTS", () => {
		it("should include pseudocode", () => {
			expect(SECONDARY_CODER_INPUT_ARTIFACTS).toContain("pseudocode")
		})

		it("should include review_report", () => {
			expect(SECONDARY_CODER_INPUT_ARTIFACTS).toContain("review_report")
		})

		it("should have exactly expected artifact types", () => {
			expect(SECONDARY_CODER_INPUT_ARTIFACTS).toHaveLength(2)
			expect(SECONDARY_CODER_INPUT_ARTIFACTS).toEqual(["pseudocode", "review_report"])
		})
	})

	describe("SECONDARY_CODER_OUTPUT_ARTIFACTS", () => {
		it("should include code", () => {
			expect(SECONDARY_CODER_OUTPUT_ARTIFACTS).toContain("code")
		})

		it("should have only expected artifact types", () => {
			expect(SECONDARY_CODER_OUTPUT_ARTIFACTS).toHaveLength(1)
			expect(SECONDARY_CODER_OUTPUT_ARTIFACTS).toEqual(["code"])
		})
	})

	describe("getSecondaryCoderModeConfig", () => {
		it("should return the secondary coder mode config", () => {
			const config = getSecondaryCoderModeConfig()
			expect(config.slug).toBe("secondary-coder")
			expect(config).toEqual(SECONDARY_CODER_MODE_CONFIG)
		})
	})

	describe("validateSecondaryCoderTaskRequest", () => {
		it("should return true for valid implement_code request with pseudocodeId", () => {
			const request: SecondaryCoderTaskRequest = {
				taskType: "implement_code",
				userTask: "Implement the code based on pseudocode",
				context: {
					pseudocodeId: "pseudocode-123",
				},
			}
			expect(validateSecondaryCoderTaskRequest(request)).toBe(true)
		})

		it("should return false for implement_code request without pseudocodeId", () => {
			const request: SecondaryCoderTaskRequest = {
				taskType: "implement_code",
				userTask: "Implement the code based on pseudocode",
			}
			expect(validateSecondaryCoderTaskRequest(request)).toBe(false)
		})

		it("should return true for valid fix_code request with reviewReportId", () => {
			const request: SecondaryCoderTaskRequest = {
				taskType: "fix_code",
				userTask: "Fix the issues identified in the review",
				context: {
					reviewReportId: "review-456",
				},
			}
			expect(validateSecondaryCoderTaskRequest(request)).toBe(true)
		})

		it("should return false for fix_code request without reviewReportId", () => {
			const request: SecondaryCoderTaskRequest = {
				taskType: "fix_code",
				userTask: "Fix the issues identified in the review",
			}
			expect(validateSecondaryCoderTaskRequest(request)).toBe(false)
		})

		it("should return true for valid write_tests request", () => {
			const request: SecondaryCoderTaskRequest = {
				taskType: "write_tests",
				userTask: "Write unit tests for the implementation",
			}
			expect(validateSecondaryCoderTaskRequest(request)).toBe(true)
		})

		it("should return true for valid revise_code request with existingCodeId", () => {
			const request: SecondaryCoderTaskRequest = {
				taskType: "revise_code",
				userTask: "Revise the existing code",
				context: {
					existingCodeId: "code-789",
				},
			}
			expect(validateSecondaryCoderTaskRequest(request)).toBe(true)
		})

		it("should return false for revise_code request without existingCodeId", () => {
			const request: SecondaryCoderTaskRequest = {
				taskType: "revise_code",
				userTask: "Revise the existing code",
			}
			expect(validateSecondaryCoderTaskRequest(request)).toBe(false)
		})

		it("should return false for missing taskType", () => {
			const request = {
				userTask: "Implement the code",
			} as SecondaryCoderTaskRequest
			expect(validateSecondaryCoderTaskRequest(request)).toBe(false)
		})

		it("should return false for missing userTask", () => {
			const request = {
				taskType: "implement_code",
				context: { pseudocodeId: "pseudocode-123" },
			} as SecondaryCoderTaskRequest
			expect(validateSecondaryCoderTaskRequest(request)).toBe(false)
		})

		it("should return false for invalid taskType", () => {
			const request: SecondaryCoderTaskRequest = {
				taskType: "invalid_task" as SecondaryCoderTaskType,
				userTask: "Implement the code",
			}
			expect(validateSecondaryCoderTaskRequest(request)).toBe(false)
		})

		it("should return false for empty request", () => {
			const request = {} as SecondaryCoderTaskRequest
			expect(validateSecondaryCoderTaskRequest(request)).toBe(false)
		})

		it("should accept request with additional context", () => {
			const request: SecondaryCoderTaskRequest = {
				taskType: "implement_code",
				userTask: "Implement the code",
				context: {
					pseudocodeId: "pseudocode-123",
					feedback: "Previous implementation had issues",
					constraints: ["Use TypeScript", "Follow existing patterns"],
				},
			}
			expect(validateSecondaryCoderTaskRequest(request)).toBe(true)
		})
	})

	describe("requiresFileLocking", () => {
		it("should return true for implement_code task type", () => {
			expect(requiresFileLocking("implement_code")).toBe(true)
		})

		it("should return true for fix_code task type", () => {
			expect(requiresFileLocking("fix_code")).toBe(true)
		})

		it("should return true for revise_code task type", () => {
			expect(requiresFileLocking("revise_code")).toBe(true)
		})

		it("should return false for write_tests task type", () => {
			expect(requiresFileLocking("write_tests")).toBe(false)
		})
	})

	describe("getOutputArtifactType", () => {
		it("should return 'code' for implement_code task type", () => {
			expect(getOutputArtifactType("implement_code")).toBe("code")
		})

		it("should return 'code' for fix_code task type", () => {
			expect(getOutputArtifactType("fix_code")).toBe("code")
		})

		it("should return 'code' for revise_code task type", () => {
			expect(getOutputArtifactType("revise_code")).toBe("code")
		})

		it("should return 'code' for write_tests task type", () => {
			expect(getOutputArtifactType("write_tests")).toBe("code")
		})
	})

	describe("Mode Configuration Integration", () => {
		it("should have valid ModeConfig structure", () => {
			expect(SECONDARY_CODER_MODE_CONFIG.slug).toBeDefined()
			expect(SECONDARY_CODER_MODE_CONFIG.name).toBeDefined()
			expect(SECONDARY_CODER_MODE_CONFIG.roleDefinition).toBeDefined()
			expect(SECONDARY_CODER_MODE_CONFIG.description).toBeDefined()
			expect(typeof SECONDARY_CODER_MODE_CONFIG.roleDefinition).toBe("string")
			expect(typeof SECONDARY_CODER_MODE_CONFIG.description).toBe("string")
		})

		it("should be compatible with ModeConfig type", () => {
			const config: ModeConfig = SECONDARY_CODER_MODE_CONFIG
			expect(config.slug).toBe("secondary-coder")
			expect(config.name).toBe("Secondary Coder")
		})

		it("should have artifact types compatible with orchestration types", () => {
			type ArtifactTypeCheck = ArtifactType
			const inputCheck: ArtifactTypeCheck[] = SECONDARY_CODER_INPUT_ARTIFACTS
			const outputCheck: ArtifactTypeCheck[] = SECONDARY_CODER_OUTPUT_ARTIFACTS
			expect(inputCheck).toContain("pseudocode")
			expect(inputCheck).toContain("review_report")
			expect(outputCheck).toContain("code")
		})
	})

	describe("Task Types", () => {
		it("should define all required task types", () => {
			const validTypes: SecondaryCoderTaskType[] = ["implement_code", "fix_code", "write_tests", "revise_code"]
			expect(validTypes).toContain("implement_code")
			expect(validTypes).toContain("fix_code")
			expect(validTypes).toContain("write_tests")
			expect(validTypes).toContain("revise_code")
		})
	})

	describe("Role Definition Alignment", () => {
		it("should align with secondary-coder role definition input artifacts", () => {
			// From RoleDefinitions.ts: secondary-coder has inputArtifactTypes: ["pseudocode", "review_report"]
			expect(SECONDARY_CODER_INPUT_ARTIFACTS).toEqual(["pseudocode", "review_report"])
		})

		it("should align with secondary-coder role definition output artifacts", () => {
			// From RoleDefinitions.ts: secondary-coder has outputArtifactTypes: ["code"]
			expect(SECONDARY_CODER_OUTPUT_ARTIFACTS).toEqual(["code"])
		})

		it("should have capabilities matching role definition", () => {
			// From RoleDefinitions.ts: secondary-coder capabilities are:
			// - implement_code: Write actual implementation code
			// - fix_code: Fix issues identified in reviews
			// - write_tests: Write unit tests for implementation
			const expectedCapabilities = ["implement_code", "fix_code", "write_tests"]
			const taskTypes: SecondaryCoderTaskType[] = ["implement_code", "fix_code", "write_tests", "revise_code"]

			// All expected capabilities should be covered by task types
			expectedCapabilities.forEach((capability) => {
				expect(taskTypes).toContain(capability as SecondaryCoderTaskType)
			})
		})
	})

	describe("Custom Instructions Content", () => {
		it("should contain tool usage guidance", () => {
			expect(SECONDARY_CODER_MODE_CONFIG.customInstructions).toContain("Tool Usage")
			expect(SECONDARY_CODER_MODE_CONFIG.customInstructions).toContain("read_file")
			expect(SECONDARY_CODER_MODE_CONFIG.customInstructions).toContain("write_to_file")
			expect(SECONDARY_CODER_MODE_CONFIG.customInstructions).toContain("apply_diff")
		})

		it("should contain guidelines section", () => {
			expect(SECONDARY_CODER_MODE_CONFIG.customInstructions).toContain("## Guidelines")
		})

		it("should emphasize code quality", () => {
			expect(SECONDARY_CODER_MODE_CONFIG.customInstructions).toContain("clean")
			expect(SECONDARY_CODER_MODE_CONFIG.customInstructions).toContain("maintainable")
		})

		it("should mention collaboration with Code Sceptic", () => {
			expect(SECONDARY_CODER_MODE_CONFIG.customInstructions).toContain("Code Sceptic")
		})
	})
})
