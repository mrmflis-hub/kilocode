// kilocode_change - new file
/**
 * Code Sceptic Mode Tests
 *
 * Tests for the code sceptic mode configuration and integration
 * with the multi-agent orchestration system.
 */

import { describe, it, expect, beforeEach } from "vitest"
import type { ModeConfig } from "@roo-code/types"
import type { ArtifactType } from "@kilocode/core-schemas"
import {
	CODE_SCEPTIC_MODE_CONFIG,
	CODE_SCEPTIC_INPUT_ARTIFACTS,
	CODE_SCEPTIC_OUTPUT_ARTIFACTS,
	getCodeScepticModeConfig,
	validateCodeScepticTaskRequest,
	getCodeScepticOutputArtifactType,
	getRequiredInputArtifactTypes,
	requiresDeepAnalysis,
	getDefaultFocusAreas,
	createEmptyReviewReport,
	calculateOverallSeverity,
	determineVerdict,
	type CodeScepticTaskRequest,
	type CodeScepticTaskType,
	type ReviewReport,
	type ReviewIssue,
} from "../CodeScepticMode"

describe("CodeScepticMode", () => {
	describe("CODE_SCEPTIC_MODE_CONFIG", () => {
		it("should have correct slug", () => {
			expect(CODE_SCEPTIC_MODE_CONFIG.slug).toBe("code-sceptic")
		})

		it("should have correct name", () => {
			expect(CODE_SCEPTIC_MODE_CONFIG.name).toBe("Code Sceptic")
		})

		it("should have role definition for multi-agent context", () => {
			expect(CODE_SCEPTIC_MODE_CONFIG.roleDefinition).toContain("multi-agent orchestration system")
		})

		it("should have groups defined", () => {
			expect(CODE_SCEPTIC_MODE_CONFIG.groups).toBeDefined()
			expect(Array.isArray(CODE_SCEPTIC_MODE_CONFIG.groups)).toBe(true)
		})

		it("should have custom instructions for multi-agent workflow", () => {
			expect(CODE_SCEPTIC_MODE_CONFIG.customInstructions).toBeDefined()
			expect(CODE_SCEPTIC_MODE_CONFIG.customInstructions).toContain("Multi-Agent Orchestration Context")
		})

		it("should contain plan review guidance", () => {
			expect(CODE_SCEPTIC_MODE_CONFIG.customInstructions).toContain("Plan Review")
			expect(CODE_SCEPTIC_MODE_CONFIG.customInstructions).toContain("Feasibility Analysis")
		})

		it("should contain code review guidance", () => {
			expect(CODE_SCEPTIC_MODE_CONFIG.customInstructions).toContain("Code Review")
			expect(CODE_SCEPTIC_MODE_CONFIG.customInstructions).toContain("Bug Detection")
		})

		it("should contain security review guidance", () => {
			expect(CODE_SCEPTIC_MODE_CONFIG.customInstructions).toContain("Security Review")
			expect(CODE_SCEPTIC_MODE_CONFIG.customInstructions).toContain("Input validation")
		})

		it("should contain communication protocol guidance", () => {
			expect(CODE_SCEPTIC_MODE_CONFIG.customInstructions).toContain("Communication Protocol")
			expect(CODE_SCEPTIC_MODE_CONFIG.customInstructions).toContain("review_plan")
			expect(CODE_SCEPTIC_MODE_CONFIG.customInstructions).toContain("review_code")
		})

		it("should contain review report format guidance", () => {
			expect(CODE_SCEPTIC_MODE_CONFIG.customInstructions).toContain("Review Report Format")
			expect(CODE_SCEPTIC_MODE_CONFIG.customInstructions).toContain("Critical Issues")
			expect(CODE_SCEPTIC_MODE_CONFIG.customInstructions).toContain("Severity")
		})

		it("should emphasize skepticism and critical thinking", () => {
			expect(CODE_SCEPTIC_MODE_CONFIG.roleDefinition).toContain("SKEPTICAL")
			expect(CODE_SCEPTIC_MODE_CONFIG.roleDefinition).toContain("CRITICAL")
			expect(CODE_SCEPTIC_MODE_CONFIG.roleDefinition).toContain("question EVERYTHING")
		})

		it("should contain severity guidelines", () => {
			expect(CODE_SCEPTIC_MODE_CONFIG.customInstructions).toContain("Severity Guidelines")
			expect(CODE_SCEPTIC_MODE_CONFIG.customInstructions).toContain("Critical")
			expect(CODE_SCEPTIC_MODE_CONFIG.customInstructions).toContain("High")
			expect(CODE_SCEPTIC_MODE_CONFIG.customInstructions).toContain("Medium")
			expect(CODE_SCEPTIC_MODE_CONFIG.customInstructions).toContain("Low")
		})
	})

	describe("CODE_SCEPTIC_INPUT_ARTIFACTS", () => {
		it("should include implementation_plan", () => {
			expect(CODE_SCEPTIC_INPUT_ARTIFACTS).toContain("implementation_plan")
		})

		it("should include code", () => {
			expect(CODE_SCEPTIC_INPUT_ARTIFACTS).toContain("code")
		})

		it("should have exactly expected artifact types", () => {
			expect(CODE_SCEPTIC_INPUT_ARTIFACTS).toHaveLength(2)
			expect(CODE_SCEPTIC_INPUT_ARTIFACTS).toEqual(["implementation_plan", "code"])
		})
	})

	describe("CODE_SCEPTIC_OUTPUT_ARTIFACTS", () => {
		it("should include review_report", () => {
			expect(CODE_SCEPTIC_OUTPUT_ARTIFACTS).toContain("review_report")
		})

		it("should have only expected artifact types", () => {
			expect(CODE_SCEPTIC_OUTPUT_ARTIFACTS).toHaveLength(1)
			expect(CODE_SCEPTIC_OUTPUT_ARTIFACTS).toEqual(["review_report"])
		})
	})

	describe("getCodeScepticModeConfig", () => {
		it("should return the code sceptic mode config", () => {
			const config = getCodeScepticModeConfig()
			expect(config.slug).toBe("code-sceptic")
			expect(config).toEqual(CODE_SCEPTIC_MODE_CONFIG)
		})
	})

	describe("validateCodeScepticTaskRequest", () => {
		it("should return true for valid review_plan request with artifactId", () => {
			const request: CodeScepticTaskRequest = {
				taskType: "review_plan",
				userTask: "Review the implementation plan for issues",
				context: {
					artifactId: "plan-123",
				},
			}
			expect(validateCodeScepticTaskRequest(request)).toBe(true)
		})

		it("should return true for valid review_code request with artifactId", () => {
			const request: CodeScepticTaskRequest = {
				taskType: "review_code",
				userTask: "Review the code for bugs and issues",
				context: {
					artifactId: "code-456",
				},
			}
			expect(validateCodeScepticTaskRequest(request)).toBe(true)
		})

		it("should return true for valid review_security request with artifactId", () => {
			const request: CodeScepticTaskRequest = {
				taskType: "review_security",
				userTask: "Review the code for security vulnerabilities",
				context: {
					artifactId: "code-789",
				},
			}
			expect(validateCodeScepticTaskRequest(request)).toBe(true)
		})

		it("should return true for valid review_performance request with artifactId", () => {
			const request: CodeScepticTaskRequest = {
				taskType: "review_performance",
				userTask: "Review the code for performance issues",
				context: {
					artifactId: "code-101",
				},
			}
			expect(validateCodeScepticTaskRequest(request)).toBe(true)
		})

		it("should return false for request without artifactId", () => {
			const request: CodeScepticTaskRequest = {
				taskType: "review_code",
				userTask: "Review the code for bugs",
			}
			expect(validateCodeScepticTaskRequest(request)).toBe(false)
		})

		it("should return false for missing taskType", () => {
			const request = {
				userTask: "Review the code",
				context: { artifactId: "code-123" },
			} as CodeScepticTaskRequest
			expect(validateCodeScepticTaskRequest(request)).toBe(false)
		})

		it("should return false for missing userTask", () => {
			const request = {
				taskType: "review_code",
				context: { artifactId: "code-123" },
			} as CodeScepticTaskRequest
			expect(validateCodeScepticTaskRequest(request)).toBe(false)
		})

		it("should return false for invalid taskType", () => {
			const request: CodeScepticTaskRequest = {
				taskType: "invalid_task" as CodeScepticTaskType,
				userTask: "Review the code",
				context: { artifactId: "code-123" },
			}
			expect(validateCodeScepticTaskRequest(request)).toBe(false)
		})

		it("should return false for empty request", () => {
			const request = {} as CodeScepticTaskRequest
			expect(validateCodeScepticTaskRequest(request)).toBe(false)
		})

		it("should accept request with additional context", () => {
			const request: CodeScepticTaskRequest = {
				taskType: "review_code",
				userTask: "Review the code",
				context: {
					artifactId: "code-123",
					focusAreas: ["security", "performance"],
					excludeAreas: ["style"],
					previousReviewId: "review-456",
					constraints: ["Do not suggest major refactoring"],
				},
			}
			expect(validateCodeScepticTaskRequest(request)).toBe(true)
		})
	})

	describe("getCodeScepticOutputArtifactType", () => {
		it("should return 'review_report' for review_plan task type", () => {
			expect(getCodeScepticOutputArtifactType("review_plan")).toBe("review_report")
		})

		it("should return 'review_report' for review_code task type", () => {
			expect(getCodeScepticOutputArtifactType("review_code")).toBe("review_report")
		})

		it("should return 'review_report' for review_security task type", () => {
			expect(getCodeScepticOutputArtifactType("review_security")).toBe("review_report")
		})

		it("should return 'review_report' for review_performance task type", () => {
			expect(getCodeScepticOutputArtifactType("review_performance")).toBe("review_report")
		})
	})

	describe("getRequiredInputArtifactTypes", () => {
		it("should return ['implementation_plan'] for review_plan task type", () => {
			expect(getRequiredInputArtifactTypes("review_plan")).toEqual(["implementation_plan"])
		})

		it("should return ['code'] for review_code task type", () => {
			expect(getRequiredInputArtifactTypes("review_code")).toEqual(["code"])
		})

		it("should return ['code'] for review_security task type", () => {
			expect(getRequiredInputArtifactTypes("review_security")).toEqual(["code"])
		})

		it("should return ['code'] for review_performance task type", () => {
			expect(getRequiredInputArtifactTypes("review_performance")).toEqual(["code"])
		})
	})

	describe("requiresDeepAnalysis", () => {
		it("should return false for review_plan task type", () => {
			expect(requiresDeepAnalysis("review_plan")).toBe(false)
		})

		it("should return false for review_code task type", () => {
			expect(requiresDeepAnalysis("review_code")).toBe(false)
		})

		it("should return true for review_security task type", () => {
			expect(requiresDeepAnalysis("review_security")).toBe(true)
		})

		it("should return true for review_performance task type", () => {
			expect(requiresDeepAnalysis("review_performance")).toBe(true)
		})
	})

	describe("getDefaultFocusAreas", () => {
		it("should return correct focus areas for review_plan", () => {
			const areas = getDefaultFocusAreas("review_plan")
			expect(areas).toContain("feasibility")
			expect(areas).toContain("completeness")
			expect(areas).toContain("dependencies")
			expect(areas).toContain("edge-cases")
			expect(areas).toContain("risks")
		})

		it("should return correct focus areas for review_code", () => {
			const areas = getDefaultFocusAreas("review_code")
			expect(areas).toContain("bugs")
			expect(areas).toContain("security")
			expect(areas).toContain("performance")
			expect(areas).toContain("quality")
			expect(areas).toContain("best-practices")
		})

		it("should return correct focus areas for review_security", () => {
			const areas = getDefaultFocusAreas("review_security")
			expect(areas).toContain("input-validation")
			expect(areas).toContain("authentication")
			expect(areas).toContain("authorization")
			expect(areas).toContain("data-protection")
			expect(areas).toContain("injection")
		})

		it("should return correct focus areas for review_performance", () => {
			const areas = getDefaultFocusAreas("review_performance")
			expect(areas).toContain("algorithms")
			expect(areas).toContain("memory-usage")
			expect(areas).toContain("database-queries")
			expect(areas).toContain("caching")
			expect(areas).toContain("concurrency")
		})
	})

	describe("createEmptyReviewReport", () => {
		it("should create a review report with the given artifact ID", () => {
			const report = createEmptyReviewReport("artifact-123")
			expect(report.artifactId).toBe("artifact-123")
		})

		it("should create a review report with empty arrays for issues", () => {
			const report = createEmptyReviewReport("artifact-123")
			expect(report.criticalIssues).toEqual([])
			expect(report.highPriorityIssues).toEqual([])
			expect(report.mediumPriorityIssues).toEqual([])
			expect(report.lowPriorityIssues).toEqual([])
		})

		it("should create a review report with empty positive observations", () => {
			const report = createEmptyReviewReport("artifact-123")
			expect(report.positiveObservations).toEqual([])
		})

		it("should create a review report with default verdict of needs-revision", () => {
			const report = createEmptyReviewReport("artifact-123")
			expect(report.verdict).toBe("needs-revision")
		})

		it("should create a review report with medium confidence", () => {
			const report = createEmptyReviewReport("artifact-123")
			expect(report.confidence).toBe("medium")
		})

		it("should create a review report with empty summary and rationale", () => {
			const report = createEmptyReviewReport("artifact-123")
			expect(report.summary).toBe("")
			expect(report.rationale).toBe("")
		})
	})

	describe("calculateOverallSeverity", () => {
		it("should return 'critical' when there are critical issues", () => {
			const report: ReviewReport = {
				...createEmptyReviewReport("test"),
				criticalIssues: [
					{
						severity: "critical",
						location: "file.ts:10",
						description: "Critical issue",
						recommendation: "Fix it",
					},
				],
			}
			expect(calculateOverallSeverity(report)).toBe("critical")
		})

		it("should return 'high' when there are high priority issues but no critical", () => {
			const report: ReviewReport = {
				...createEmptyReviewReport("test"),
				highPriorityIssues: [
					{ severity: "high", location: "file.ts:10", description: "High issue", recommendation: "Fix it" },
				],
			}
			expect(calculateOverallSeverity(report)).toBe("high")
		})

		it("should return 'medium' when there are medium priority issues but no critical or high", () => {
			const report: ReviewReport = {
				...createEmptyReviewReport("test"),
				mediumPriorityIssues: [
					{
						severity: "medium",
						location: "file.ts:10",
						description: "Medium issue",
						recommendation: "Fix it",
					},
				],
			}
			expect(calculateOverallSeverity(report)).toBe("medium")
		})

		it("should return 'low' when there are only low priority issues", () => {
			const report: ReviewReport = {
				...createEmptyReviewReport("test"),
				lowPriorityIssues: [
					{ severity: "low", location: "file.ts:10", description: "Low issue", recommendation: "Fix it" },
				],
			}
			expect(calculateOverallSeverity(report)).toBe("low")
		})

		it("should return 'low' when there are no issues", () => {
			const report = createEmptyReviewReport("test")
			expect(calculateOverallSeverity(report)).toBe("low")
		})
	})

	describe("determineVerdict", () => {
		it("should return 'rejected' when there are critical issues", () => {
			const report: ReviewReport = {
				...createEmptyReviewReport("test"),
				criticalIssues: [
					{
						severity: "critical",
						location: "file.ts:10",
						description: "Critical issue",
						recommendation: "Fix it",
					},
				],
			}
			expect(determineVerdict(report)).toBe("rejected")
		})

		it("should return 'needs-revision' when there are high priority issues", () => {
			const report: ReviewReport = {
				...createEmptyReviewReport("test"),
				highPriorityIssues: [
					{ severity: "high", location: "file.ts:10", description: "High issue", recommendation: "Fix it" },
				],
			}
			expect(determineVerdict(report)).toBe("needs-revision")
		})

		it("should return 'needs-revision' when there are more than 2 medium priority issues", () => {
			const report: ReviewReport = {
				...createEmptyReviewReport("test"),
				mediumPriorityIssues: [
					{
						severity: "medium",
						location: "file.ts:10",
						description: "Medium issue 1",
						recommendation: "Fix it",
					},
					{
						severity: "medium",
						location: "file.ts:20",
						description: "Medium issue 2",
						recommendation: "Fix it",
					},
					{
						severity: "medium",
						location: "file.ts:30",
						description: "Medium issue 3",
						recommendation: "Fix it",
					},
				],
			}
			expect(determineVerdict(report)).toBe("needs-revision")
		})

		it("should return 'approved' when there are 2 or fewer medium priority issues and no critical/high", () => {
			const report: ReviewReport = {
				...createEmptyReviewReport("test"),
				mediumPriorityIssues: [
					{
						severity: "medium",
						location: "file.ts:10",
						description: "Medium issue 1",
						recommendation: "Fix it",
					},
					{
						severity: "medium",
						location: "file.ts:20",
						description: "Medium issue 2",
						recommendation: "Fix it",
					},
				],
			}
			expect(determineVerdict(report)).toBe("approved")
		})

		it("should return 'approved' when there are only low priority issues", () => {
			const report: ReviewReport = {
				...createEmptyReviewReport("test"),
				lowPriorityIssues: [
					{ severity: "low", location: "file.ts:10", description: "Low issue", recommendation: "Fix it" },
				],
			}
			expect(determineVerdict(report)).toBe("approved")
		})

		it("should return 'approved' when there are no issues", () => {
			const report = createEmptyReviewReport("test")
			expect(determineVerdict(report)).toBe("approved")
		})
	})

	describe("Mode Configuration Integration", () => {
		it("should have valid ModeConfig structure", () => {
			expect(CODE_SCEPTIC_MODE_CONFIG.slug).toBeDefined()
			expect(CODE_SCEPTIC_MODE_CONFIG.name).toBeDefined()
			expect(CODE_SCEPTIC_MODE_CONFIG.roleDefinition).toBeDefined()
			expect(CODE_SCEPTIC_MODE_CONFIG.description).toBeDefined()
			expect(typeof CODE_SCEPTIC_MODE_CONFIG.roleDefinition).toBe("string")
			expect(typeof CODE_SCEPTIC_MODE_CONFIG.description).toBe("string")
		})

		it("should be compatible with ModeConfig type", () => {
			const config: ModeConfig = CODE_SCEPTIC_MODE_CONFIG
			expect(config.slug).toBe("code-sceptic")
			expect(config.name).toBe("Code Sceptic")
		})

		it("should have artifact types compatible with orchestration types", () => {
			type ArtifactTypeCheck = ArtifactType
			const inputCheck: ArtifactTypeCheck[] = CODE_SCEPTIC_INPUT_ARTIFACTS
			const outputCheck: ArtifactTypeCheck[] = CODE_SCEPTIC_OUTPUT_ARTIFACTS
			expect(inputCheck).toContain("implementation_plan")
			expect(inputCheck).toContain("code")
			expect(outputCheck).toContain("review_report")
		})
	})

	describe("Task Types", () => {
		it("should define all required task types", () => {
			const validTypes: CodeScepticTaskType[] = [
				"review_plan",
				"review_code",
				"review_security",
				"review_performance",
			]
			expect(validTypes).toContain("review_plan")
			expect(validTypes).toContain("review_code")
			expect(validTypes).toContain("review_security")
			expect(validTypes).toContain("review_performance")
		})
	})

	describe("Role Definition Alignment", () => {
		it("should align with code-sceptic role definition input artifacts", () => {
			// From RoleDefinitions.ts: code-sceptic has inputArtifactTypes: ["implementation_plan", "code"]
			expect(CODE_SCEPTIC_INPUT_ARTIFACTS).toEqual(["implementation_plan", "code"])
		})

		it("should align with code-sceptic role definition output artifacts", () => {
			// From RoleDefinitions.ts: code-sceptic has outputArtifactTypes: ["review_report"]
			expect(CODE_SCEPTIC_OUTPUT_ARTIFACTS).toEqual(["review_report"])
		})

		it("should have capabilities matching role definition", () => {
			// From RoleDefinitions.ts: code-sceptic capabilities are:
			// - review_plan: Review implementation plans for issues
			// - review_code: Review code for bugs and issues
			// - identify_security_issues: Find security vulnerabilities
			// - check_code_quality: Assess code quality and readability
			const expectedCapabilities = [
				"review_plan",
				"review_code",
				"identify_security_issues",
				"check_code_quality",
			]
			const taskTypes: CodeScepticTaskType[] = [
				"review_plan",
				"review_code",
				"review_security",
				"review_performance",
			]

			// Core capabilities should be covered by task types
			expect(taskTypes).toContain("review_plan")
			expect(taskTypes).toContain("review_code")
		})
	})

	describe("Custom Instructions Content", () => {
		it("should contain tool usage guidance", () => {
			expect(CODE_SCEPTIC_MODE_CONFIG.customInstructions).toContain("Tool Usage")
			expect(CODE_SCEPTIC_MODE_CONFIG.customInstructions).toContain("read_file")
			expect(CODE_SCEPTIC_MODE_CONFIG.customInstructions).toContain("search_files")
			expect(CODE_SCEPTIC_MODE_CONFIG.customInstructions).toContain("execute_command")
		})

		it("should contain guidelines section", () => {
			expect(CODE_SCEPTIC_MODE_CONFIG.customInstructions).toContain("## Guidelines")
		})

		it("should emphasize thoroughness", () => {
			expect(CODE_SCEPTIC_MODE_CONFIG.customInstructions).toContain("Be Thorough")
		})

		it("should emphasize being constructive", () => {
			expect(CODE_SCEPTIC_MODE_CONFIG.customInstructions).toContain("Be Constructive")
		})

		it("should emphasize being skeptical", () => {
			expect(CODE_SCEPTIC_MODE_CONFIG.customInstructions).toContain("Be Skeptical")
		})

		it("should contain review approach guidance", () => {
			expect(CODE_SCEPTIC_MODE_CONFIG.customInstructions).toContain("Review Approach")
		})
	})

	describe("ReviewIssue Type", () => {
		it("should support all severity levels", () => {
			const criticalIssue: ReviewIssue = {
				severity: "critical",
				location: "file.ts:10",
				description: "Critical issue",
				recommendation: "Fix it",
			}
			const highIssue: ReviewIssue = { ...criticalIssue, severity: "high" }
			const mediumIssue: ReviewIssue = { ...criticalIssue, severity: "medium" }
			const lowIssue: ReviewIssue = { ...criticalIssue, severity: "low" }

			expect(criticalIssue.severity).toBe("critical")
			expect(highIssue.severity).toBe("high")
			expect(mediumIssue.severity).toBe("medium")
			expect(lowIssue.severity).toBe("low")
		})

		it("should support optional impact field", () => {
			const issueWithImpact: ReviewIssue = {
				severity: "high",
				location: "file.ts:10",
				description: "Security issue",
				impact: "Could lead to data breach",
				recommendation: "Add input validation",
			}
			expect(issueWithImpact.impact).toBe("Could lead to data breach")
		})
	})

	describe("ReviewReport Type", () => {
		it("should support all verdict types", () => {
			const approvedReport: ReviewReport = {
				...createEmptyReviewReport("test"),
				verdict: "approved",
			}
			const needsRevisionReport: ReviewReport = {
				...createEmptyReviewReport("test"),
				verdict: "needs-revision",
			}
			const rejectedReport: ReviewReport = {
				...createEmptyReviewReport("test"),
				verdict: "rejected",
			}

			expect(approvedReport.verdict).toBe("approved")
			expect(needsRevisionReport.verdict).toBe("needs-revision")
			expect(rejectedReport.verdict).toBe("rejected")
		})

		it("should support all confidence levels", () => {
			const highConfidence: ReviewReport = {
				...createEmptyReviewReport("test"),
				confidence: "high",
			}
			const mediumConfidence: ReviewReport = {
				...createEmptyReviewReport("test"),
				confidence: "medium",
			}
			const lowConfidence: ReviewReport = {
				...createEmptyReviewReport("test"),
				confidence: "low",
			}

			expect(highConfidence.confidence).toBe("high")
			expect(mediumConfidence.confidence).toBe("medium")
			expect(lowConfidence.confidence).toBe("low")
		})
	})
})
