// kilocode_change - new file
/**
 * Tests for Debugger Mode
 */

import { describe, it, expect } from "vitest"
import {
	DEBUGGER_MODE_CONFIG,
	DEBUGGER_INPUT_ARTIFACTS,
	DEBUGGER_OUTPUT_ARTIFACTS,
	getDebuggerModeConfig,
	validateDebuggerTaskRequest,
	getDebuggerOutputArtifactType,
	getDebuggerRequiredInputArtifactTypes,
	requiresDebuggerDeepAnalysis,
	getDebuggerDefaultFocusAreas,
	createEmptyTestResultsReport,
	calculateOverallStatus,
	calculateTotalCounts,
	determineTestVerdict,
	calculateTestOverallSeverity,
	getTestCommand,
	parseTestOutput,
	type DebuggerTaskType,
	type TestStatus,
	type IssueSeverity,
	type TestVerdict,
	type DebuggerTaskRequest,
	type TestCaseResult,
	type TestSuiteResult,
	type TestIssue,
	type TestResultsReport,
} from "../DebuggerMode"
import type { ModeConfig } from "@roo-code/types"

describe("DebuggerMode", () => {
	describe("Mode Configuration", () => {
		it("should have correct slug", () => {
			expect(DEBUGGER_MODE_CONFIG.slug).toBe("debugger")
		})

		it("should have correct name", () => {
			expect(DEBUGGER_MODE_CONFIG.name).toBe("Debugger")
		})

		it("should have correct icon name", () => {
			expect(DEBUGGER_MODE_CONFIG.iconName).toBe("codicon-bug")
		})

		it("should have role definition", () => {
			expect(DEBUGGER_MODE_CONFIG.roleDefinition).toContain("Debugger agent")
			expect(DEBUGGER_MODE_CONFIG.roleDefinition).toContain("multi-agent orchestration")
		})

		it("should have description", () => {
			expect(DEBUGGER_MODE_CONFIG.description).toBe("Run tests and debug failures")
		})

		it("should have correct groups", () => {
			expect(DEBUGGER_MODE_CONFIG.groups).toContain("read")
			expect(DEBUGGER_MODE_CONFIG.groups).toContain("edit")
			expect(DEBUGGER_MODE_CONFIG.groups).toContain("browser")
			expect(DEBUGGER_MODE_CONFIG.groups).toContain("mcp")
		})

		it("should have custom instructions", () => {
			expect(DEBUGGER_MODE_CONFIG.customInstructions).toBeDefined()
			expect(typeof DEBUGGER_MODE_CONFIG.customInstructions).toBe("string")
		})

		it("should include test execution guidance in custom instructions", () => {
			expect(DEBUGGER_MODE_CONFIG.customInstructions).toContain("Test Execution")
		})

		it("should include bug identification guidance in custom instructions", () => {
			expect(DEBUGGER_MODE_CONFIG.customInstructions).toContain("Bug Identification")
		})

		it("should include debugging guidance in custom instructions", () => {
			expect(DEBUGGER_MODE_CONFIG.customInstructions).toContain("Debugging")
		})

		it("should include test results format in custom instructions", () => {
			expect(DEBUGGER_MODE_CONFIG.customInstructions).toContain("Test Results Format")
		})

		it("should include communication protocol in custom instructions", () => {
			expect(DEBUGGER_MODE_CONFIG.customInstructions).toContain("Communication Protocol")
		})

		it("should return mode config from getter", () => {
			const config = getDebuggerModeConfig()
			expect(config).toEqual(DEBUGGER_MODE_CONFIG)
		})

		it("should be a valid ModeConfig", () => {
			const config: ModeConfig = DEBUGGER_MODE_CONFIG
			expect(config.slug).toBeDefined()
			expect(config.name).toBeDefined()
			expect(config.roleDefinition).toBeDefined()
		})
	})

	describe("Input/Output Artifact Types", () => {
		it("should have correct input artifact types", () => {
			expect(DEBUGGER_INPUT_ARTIFACTS).toContain("code")
		})

		it("should have correct output artifact types", () => {
			expect(DEBUGGER_OUTPUT_ARTIFACTS).toContain("test_results")
		})

		it("should have exactly one input artifact type", () => {
			expect(DEBUGGER_INPUT_ARTIFACTS).toHaveLength(1)
		})

		it("should have exactly one output artifact type", () => {
			expect(DEBUGGER_OUTPUT_ARTIFACTS).toHaveLength(1)
		})
	})

	describe("Task Request Validation", () => {
		it("should validate valid run_tests request", () => {
			const request: DebuggerTaskRequest = {
				taskType: "run_tests",
				userTask: "Run all unit tests",
			}
			expect(validateDebuggerTaskRequest(request)).toBe(true)
		})

		it("should validate valid debug_failure request with failureId", () => {
			const request: DebuggerTaskRequest = {
				taskType: "debug_failure",
				userTask: "Debug the failing test",
				context: {
					failureId: "failure-123",
				},
			}
			expect(validateDebuggerTaskRequest(request)).toBe(true)
		})

		it("should validate valid debug_failure request with testName", () => {
			const request: DebuggerTaskRequest = {
				taskType: "debug_failure",
				userTask: "Debug the failing test",
				context: {
					testName: "should return correct value",
				},
			}
			expect(validateDebuggerTaskRequest(request)).toBe(true)
		})

		it("should validate valid fix_bug request", () => {
			const request: DebuggerTaskRequest = {
				taskType: "fix_bug",
				userTask: "Fix the bug in authentication",
				context: {
					failureId: "bug-456",
				},
			}
			expect(validateDebuggerTaskRequest(request)).toBe(true)
		})

		it("should validate valid analyze_coverage request", () => {
			const request: DebuggerTaskRequest = {
				taskType: "analyze_coverage",
				userTask: "Analyze test coverage",
			}
			expect(validateDebuggerTaskRequest(request)).toBe(true)
		})

		it("should validate valid write_tests request", () => {
			const request: DebuggerTaskRequest = {
				taskType: "write_tests",
				userTask: "Write tests for the new feature",
			}
			expect(validateDebuggerTaskRequest(request)).toBe(true)
		})

		it("should validate valid investigate_flaky request", () => {
			const request: DebuggerTaskRequest = {
				taskType: "investigate_flaky",
				userTask: "Investigate flaky test",
				context: {
					testName: "flaky-test-name",
				},
			}
			expect(validateDebuggerTaskRequest(request)).toBe(true)
		})

		it("should reject request without taskType", () => {
			const request = {
				userTask: "Run tests",
			} as DebuggerTaskRequest
			expect(validateDebuggerTaskRequest(request)).toBe(false)
		})

		it("should reject request without userTask", () => {
			const request = {
				taskType: "run_tests",
			} as DebuggerTaskRequest
			expect(validateDebuggerTaskRequest(request)).toBe(false)
		})

		it("should reject request with invalid taskType", () => {
			const request = {
				taskType: "invalid_type",
				userTask: "Do something",
			} as unknown as DebuggerTaskRequest
			expect(validateDebuggerTaskRequest(request)).toBe(false)
		})

		it("should reject debug_failure request without failureId or testName", () => {
			const request: DebuggerTaskRequest = {
				taskType: "debug_failure",
				userTask: "Debug the failing test",
			}
			expect(validateDebuggerTaskRequest(request)).toBe(false)
		})

		it("should reject fix_bug request without failureId or testName", () => {
			const request: DebuggerTaskRequest = {
				taskType: "fix_bug",
				userTask: "Fix the bug",
			}
			expect(validateDebuggerTaskRequest(request)).toBe(false)
		})
	})

	describe("Output Artifact Type", () => {
		it("should return test_results for run_tests", () => {
			expect(getDebuggerOutputArtifactType("run_tests")).toBe("test_results")
		})

		it("should return test_results for debug_failure", () => {
			expect(getDebuggerOutputArtifactType("debug_failure")).toBe("test_results")
		})

		it("should return test_results for fix_bug", () => {
			expect(getDebuggerOutputArtifactType("fix_bug")).toBe("test_results")
		})

		it("should return test_results for analyze_coverage", () => {
			expect(getDebuggerOutputArtifactType("analyze_coverage")).toBe("test_results")
		})

		it("should return test_results for write_tests", () => {
			expect(getDebuggerOutputArtifactType("write_tests")).toBe("test_results")
		})

		it("should return test_results for investigate_flaky", () => {
			expect(getDebuggerOutputArtifactType("investigate_flaky")).toBe("test_results")
		})
	})

	describe("Required Input Artifact Types", () => {
		it("should return code for run_tests", () => {
			expect(getDebuggerRequiredInputArtifactTypes("run_tests")).toContain("code")
		})

		it("should return code for debug_failure", () => {
			expect(getDebuggerRequiredInputArtifactTypes("debug_failure")).toContain("code")
		})

		it("should return code for fix_bug", () => {
			expect(getDebuggerRequiredInputArtifactTypes("fix_bug")).toContain("code")
		})

		it("should return code for analyze_coverage", () => {
			expect(getDebuggerRequiredInputArtifactTypes("analyze_coverage")).toContain("code")
		})

		it("should return code for write_tests", () => {
			expect(getDebuggerRequiredInputArtifactTypes("write_tests")).toContain("code")
		})

		it("should return code for investigate_flaky", () => {
			expect(getDebuggerRequiredInputArtifactTypes("investigate_flaky")).toContain("code")
		})
	})

	describe("Deep Analysis Check", () => {
		it("should return true for debug_failure", () => {
			expect(requiresDebuggerDeepAnalysis("debug_failure")).toBe(true)
		})

		it("should return true for investigate_flaky", () => {
			expect(requiresDebuggerDeepAnalysis("investigate_flaky")).toBe(true)
		})

		it("should return true for analyze_coverage", () => {
			expect(requiresDebuggerDeepAnalysis("analyze_coverage")).toBe(true)
		})

		it("should return false for run_tests", () => {
			expect(requiresDebuggerDeepAnalysis("run_tests")).toBe(false)
		})

		it("should return false for fix_bug", () => {
			expect(requiresDebuggerDeepAnalysis("fix_bug")).toBe(false)
		})

		it("should return false for write_tests", () => {
			expect(requiresDebuggerDeepAnalysis("write_tests")).toBe(false)
		})
	})

	describe("Default Focus Areas", () => {
		it("should return correct focus areas for run_tests", () => {
			const areas = getDebuggerDefaultFocusAreas("run_tests")
			expect(areas).toContain("unit-tests")
			expect(areas).toContain("integration-tests")
			expect(areas).toContain("coverage")
		})

		it("should return correct focus areas for debug_failure", () => {
			const areas = getDebuggerDefaultFocusAreas("debug_failure")
			expect(areas).toContain("error-analysis")
			expect(areas).toContain("stack-trace")
			expect(areas).toContain("root-cause")
		})

		it("should return correct focus areas for fix_bug", () => {
			const areas = getDebuggerDefaultFocusAreas("fix_bug")
			expect(areas).toContain("minimal-fix")
			expect(areas).toContain("test-verification")
			expect(areas).toContain("side-effects")
		})

		it("should return correct focus areas for analyze_coverage", () => {
			const areas = getDebuggerDefaultFocusAreas("analyze_coverage")
			expect(areas).toContain("uncovered-paths")
			expect(areas).toContain("edge-cases")
			expect(areas).toContain("critical-paths")
		})

		it("should return correct focus areas for write_tests", () => {
			const areas = getDebuggerDefaultFocusAreas("write_tests")
			expect(areas).toContain("test-cases")
			expect(areas).toContain("edge-cases")
			expect(areas).toContain("mocking")
		})

		it("should return correct focus areas for investigate_flaky", () => {
			const areas = getDebuggerDefaultFocusAreas("investigate_flaky")
			expect(areas).toContain("timing")
			expect(areas).toContain("state")
			expect(areas).toContain("dependencies")
			expect(areas).toContain("race-conditions")
		})
	})

	describe("Empty Test Results Report", () => {
		it("should create empty report with default values", () => {
			const report = createEmptyTestResultsReport()
			expect(report.summary).toBe("")
			expect(report.suites).toEqual([])
			expect(report.issues).toEqual([])
			expect(report.recommendations).toEqual([])
			expect(report.verdict).toBe("failed")
			expect(report.confidence).toBe("medium")
		})

		it("should have environment with timestamp", () => {
			const report = createEmptyTestResultsReport()
			expect(report.environment.framework).toBe("unknown")
			expect(report.environment.timestamp).toBeDefined()
		})
	})

	describe("Overall Status Calculation", () => {
		it("should return pending for empty suites", () => {
			const status = calculateOverallStatus([])
			expect(status).toBe("pending")
		})

		it("should return passed when all suites pass", () => {
			const suites: TestSuiteResult[] = [
				{
					name: "Suite 1",
					status: "passed",
					tests: [],
					passedCount: 5,
					failedCount: 0,
					skippedCount: 0,
					duration: 100,
				},
				{
					name: "Suite 2",
					status: "passed",
					tests: [],
					passedCount: 3,
					failedCount: 0,
					skippedCount: 0,
					duration: 50,
				},
			]
			expect(calculateOverallStatus(suites)).toBe("passed")
		})

		it("should return failed when any suite fails", () => {
			const suites: TestSuiteResult[] = [
				{
					name: "Suite 1",
					status: "passed",
					tests: [],
					passedCount: 5,
					failedCount: 0,
					skippedCount: 0,
					duration: 100,
				},
				{
					name: "Suite 2",
					status: "failed",
					tests: [],
					passedCount: 2,
					failedCount: 1,
					skippedCount: 0,
					duration: 50,
				},
			]
			expect(calculateOverallStatus(suites)).toBe("failed")
		})

		it("should return skipped when all are skipped", () => {
			const suites: TestSuiteResult[] = [
				{
					name: "Suite 1",
					status: "skipped",
					tests: [],
					passedCount: 0,
					failedCount: 0,
					skippedCount: 5,
					duration: 0,
				},
			]
			expect(calculateOverallStatus(suites)).toBe("skipped")
		})
	})

	describe("Total Counts Calculation", () => {
		it("should calculate zero counts for empty suites", () => {
			const counts = calculateTotalCounts([])
			expect(counts.total).toBe(0)
			expect(counts.passed).toBe(0)
			expect(counts.failed).toBe(0)
			expect(counts.skipped).toBe(0)
		})

		it("should calculate correct totals for multiple suites", () => {
			const suites: TestSuiteResult[] = [
				{
					name: "Suite 1",
					status: "passed",
					tests: [
						{ name: "Test 1", status: "passed", duration: 10 },
						{ name: "Test 2", status: "passed", duration: 10 },
						{ name: "Test 3", status: "failed", duration: 10 },
					],
					passedCount: 2,
					failedCount: 1,
					skippedCount: 0,
					duration: 30,
				},
				{
					name: "Suite 2",
					status: "failed",
					tests: [
						{ name: "Test 4", status: "passed", duration: 10 },
						{ name: "Test 5", status: "skipped", duration: 0 },
					],
					passedCount: 1,
					failedCount: 0,
					skippedCount: 1,
					duration: 10,
				},
			]
			const counts = calculateTotalCounts(suites)
			expect(counts.total).toBe(5)
			expect(counts.passed).toBe(3)
			expect(counts.failed).toBe(1)
			expect(counts.skipped).toBe(1)
		})
	})

	describe("Test Verdict Determination", () => {
		it("should return failed for critical issues", () => {
			const report: TestResultsReport = {
				...createEmptyTestResultsReport(),
				issues: [{ severity: "critical", type: "bug", location: "file.ts", description: "Critical bug" }],
			}
			expect(determineTestVerdict(report)).toBe("failed")
		})

		it("should return failed for failed suites", () => {
			const report: TestResultsReport = {
				...createEmptyTestResultsReport(),
				suites: [
					{
						name: "Suite 1",
						status: "failed",
						tests: [],
						passedCount: 0,
						failedCount: 1,
						skippedCount: 0,
						duration: 10,
					},
				],
			}
			expect(determineTestVerdict(report)).toBe("failed")
		})

		it("should return partial for high severity issues", () => {
			const report: TestResultsReport = {
				...createEmptyTestResultsReport(),
				issues: [{ severity: "high", type: "bug", location: "file.ts", description: "High bug" }],
			}
			expect(determineTestVerdict(report)).toBe("partial")
		})

		it("should return failed for failed test counts", () => {
			const report: TestResultsReport = {
				...createEmptyTestResultsReport(),
				suites: [
					{
						name: "Suite 1",
						status: "passed",
						tests: [
							{ name: "Test 1", status: "passed", duration: 10 },
							{ name: "Test 2", status: "failed", duration: 10 },
						],
						passedCount: 1,
						failedCount: 1,
						skippedCount: 0,
						duration: 20,
					},
				],
			}
			expect(determineTestVerdict(report)).toBe("failed")
		})

		it("should return partial when more skipped than passed", () => {
			const report: TestResultsReport = {
				...createEmptyTestResultsReport(),
				suites: [
					{
						name: "Suite 1",
						status: "passed",
						tests: [
							{ name: "Test 1", status: "passed", duration: 10 },
							{ name: "Test 2", status: "skipped", duration: 0 },
							{ name: "Test 3", status: "skipped", duration: 0 },
							{ name: "Test 4", status: "skipped", duration: 0 },
						],
						passedCount: 1,
						failedCount: 0,
						skippedCount: 3,
						duration: 10,
					},
				],
			}
			expect(determineTestVerdict(report)).toBe("partial")
		})

		it("should return passed for clean report", () => {
			const report: TestResultsReport = {
				...createEmptyTestResultsReport(),
				suites: [
					{
						name: "Suite 1",
						status: "passed",
						tests: [
							{ name: "Test 1", status: "passed", duration: 10 },
							{ name: "Test 2", status: "passed", duration: 10 },
						],
						passedCount: 2,
						failedCount: 0,
						skippedCount: 0,
						duration: 20,
					},
				],
			}
			expect(determineTestVerdict(report)).toBe("passed")
		})
	})

	describe("Test Overall Severity", () => {
		it("should return critical for critical issues", () => {
			const issues: TestIssue[] = [
				{ severity: "critical", type: "bug", location: "file.ts", description: "Critical" },
				{ severity: "high", type: "bug", location: "file.ts", description: "High" },
			]
			expect(calculateTestOverallSeverity(issues)).toBe("critical")
		})

		it("should return high for high issues", () => {
			const issues: TestIssue[] = [
				{ severity: "high", type: "bug", location: "file.ts", description: "High" },
				{ severity: "medium", type: "bug", location: "file.ts", description: "Medium" },
			]
			expect(calculateTestOverallSeverity(issues)).toBe("high")
		})

		it("should return medium for medium issues", () => {
			const issues: TestIssue[] = [
				{ severity: "medium", type: "bug", location: "file.ts", description: "Medium" },
				{ severity: "low", type: "bug", location: "file.ts", description: "Low" },
			]
			expect(calculateTestOverallSeverity(issues)).toBe("medium")
		})

		it("should return low for low issues only", () => {
			const issues: TestIssue[] = [{ severity: "low", type: "bug", location: "file.ts", description: "Low" }]
			expect(calculateTestOverallSeverity(issues)).toBe("low")
		})

		it("should return low for empty issues", () => {
			expect(calculateTestOverallSeverity([])).toBe("low")
		})
	})

	describe("Test Command Generation", () => {
		it("should generate basic Jest command", () => {
			const cmd = getTestCommand("jest")
			expect(cmd).toContain("npx jest")
		})

		it("should generate Jest command with test path", () => {
			const cmd = getTestCommand("jest", { testPath: "src/tests/example.spec.ts" })
			expect(cmd).toContain("npx jest")
			expect(cmd).toContain("src/tests/example.spec.ts")
		})

		it("should generate Jest command with test name pattern", () => {
			const cmd = getTestCommand("jest", { testName: "should return correct value" })
			expect(cmd).toContain("--testNamePattern")
			expect(cmd).toContain("should return correct value")
		})

		it("should generate Jest command with coverage", () => {
			const cmd = getTestCommand("jest", { coverage: true })
			expect(cmd).toContain("--coverage")
		})

		it("should generate Jest command with watch mode", () => {
			const cmd = getTestCommand("jest", { watch: true })
			expect(cmd).toContain("--watch")
		})

		it("should generate basic Vitest command", () => {
			const cmd = getTestCommand("vitest")
			expect(cmd).toContain("npx vitest run")
		})

		it("should generate Vitest command with coverage", () => {
			const cmd = getTestCommand("vitest", { coverage: true })
			expect(cmd).toContain("--coverage")
		})

		it("should generate Vitest command with watch mode", () => {
			const cmd = getTestCommand("vitest", { watch: true })
			expect(cmd).toContain("--watch")
			expect(cmd).not.toContain("run")
		})

		it("should generate basic Mocha command", () => {
			const cmd = getTestCommand("mocha")
			expect(cmd).toContain("npx mocha")
		})

		it("should generate Mocha command with coverage", () => {
			const cmd = getTestCommand("mocha", { coverage: true })
			expect(cmd).toContain("npx nyc")
		})

		it("should generate basic Pytest command", () => {
			const cmd = getTestCommand("pytest")
			expect(cmd).toContain("pytest")
		})

		it("should generate Pytest command with coverage", () => {
			const cmd = getTestCommand("pytest", { coverage: true })
			expect(cmd).toContain("coverage run -m")
		})

		it("should generate default npm test command for unknown framework", () => {
			const cmd = getTestCommand("unknown")
			expect(cmd).toContain("npm test")
		})
	})

	describe("Test Output Parsing", () => {
		it("should parse Jest failure output", () => {
			const output = `
				FAIL src/tests/example.spec.ts
				● Test suite failed to run
				
				PASS src/tests/other.spec.ts
			`
			const issues = parseTestOutput(output, "jest")
			expect(issues.length).toBeGreaterThan(0)
			expect(issues[0].type).toBe("bug")
		})

		it("should parse Mocha failure output", () => {
			const output = `
				1) should return correct value
				   Error: Expected 5 but got 3
				
				2) should handle errors
				   Error: Timeout exceeded
			`
			const issues = parseTestOutput(output, "mocha")
			expect(issues.length).toBeGreaterThan(0)
			expect(issues[0].type).toBe("bug")
		})

		it("should parse Pytest failure output", () => {
			const output = `
				FAILED src/tests/test_example.py::test_function - AssertionError
				PASSED src/tests/test_example.py::test_other
			`
			const issues = parseTestOutput(output, "pytest")
			expect(issues.length).toBeGreaterThan(0)
			expect(issues[0].type).toBe("bug")
		})

		it("should parse generic error output", () => {
			const output = `
				Error: Something went wrong
				Fail: Test failed
				Exception: Unexpected error
			`
			const issues = parseTestOutput(output, "unknown")
			expect(issues.length).toBeGreaterThan(0)
		})

		it("should return empty array for passing output", () => {
			const output = `
				PASS src/tests/example.spec.ts
				All tests passed!
			`
			const issues = parseTestOutput(output, "jest")
			expect(issues).toEqual([])
		})
	})

	describe("Role Definition Alignment", () => {
		it("should match debugger role from RoleDefinitions", () => {
			// The slug should match the role ID
			expect(DEBUGGER_MODE_CONFIG.slug).toBe("debugger")
		})

		it("should have testing-related capabilities in custom instructions", () => {
			expect(DEBUGGER_MODE_CONFIG.customInstructions).toContain("Test Execution")
			expect(DEBUGGER_MODE_CONFIG.customInstructions).toContain("Bug Identification")
		})

		it("should produce test_results artifact type", () => {
			// Output should match the role's output artifact types
			expect(DEBUGGER_OUTPUT_ARTIFACTS).toContain("test_results")
		})

		it("should accept code artifact type as input", () => {
			// Input should match the role's input artifact types
			expect(DEBUGGER_INPUT_ARTIFACTS).toContain("code")
		})
	})

	describe("Custom Instructions Content", () => {
		it("should include multi-agent orchestration context", () => {
			expect(DEBUGGER_MODE_CONFIG.customInstructions).toContain("Multi-Agent Orchestration Context")
		})

		it("should include role description", () => {
			expect(DEBUGGER_MODE_CONFIG.customInstructions).toContain("Your Role")
		})

		it("should include responsibilities section", () => {
			expect(DEBUGGER_MODE_CONFIG.customInstructions).toContain("Your Responsibilities")
		})

		it("should include test results format template", () => {
			expect(DEBUGGER_MODE_CONFIG.customInstructions).toContain("Test Results Format")
		})

		it("should include communication protocol", () => {
			expect(DEBUGGER_MODE_CONFIG.customInstructions).toContain("Communication Protocol")
		})

		it("should include debugging approach", () => {
			expect(DEBUGGER_MODE_CONFIG.customInstructions).toContain("Debugging Approach")
		})

		it("should include severity guidelines", () => {
			expect(DEBUGGER_MODE_CONFIG.customInstructions).toContain("Severity Guidelines")
		})

		it("should include tool usage guidance", () => {
			expect(DEBUGGER_MODE_CONFIG.customInstructions).toContain("Tool Usage")
		})

		it("should include guidelines section", () => {
			expect(DEBUGGER_MODE_CONFIG.customInstructions).toContain("## Guidelines")
		})

		it("should mention important reminder", () => {
			expect(DEBUGGER_MODE_CONFIG.customInstructions).toContain("IMPORTANT")
		})
	})

	describe("Type Exports", () => {
		it("should export DebuggerTaskType type", () => {
			const taskType: DebuggerTaskType = "run_tests"
			expect(taskType).toBe("run_tests")
		})

		it("should export TestStatus type", () => {
			const status: TestStatus = "passed"
			expect(status).toBe("passed")
		})

		it("should export IssueSeverity type", () => {
			const severity: IssueSeverity = "high"
			expect(severity).toBe("high")
		})

		it("should export TestVerdict type", () => {
			const verdict: TestVerdict = "failed"
			expect(verdict).toBe("failed")
		})

		it("should export DebuggerTaskRequest interface", () => {
			const request: DebuggerTaskRequest = {
				taskType: "run_tests",
				userTask: "Run tests",
			}
			expect(request.taskType).toBe("run_tests")
		})

		it("should export TestCaseResult interface", () => {
			const result: TestCaseResult = {
				name: "Test 1",
				status: "passed",
				duration: 100,
			}
			expect(result.name).toBe("Test 1")
		})

		it("should export TestSuiteResult interface", () => {
			const suite: TestSuiteResult = {
				name: "Suite 1",
				status: "passed",
				tests: [],
				passedCount: 0,
				failedCount: 0,
				skippedCount: 0,
				duration: 100,
			}
			expect(suite.name).toBe("Suite 1")
		})

		it("should export TestIssue interface", () => {
			const issue: TestIssue = {
				severity: "high",
				type: "bug",
				location: "file.ts:10",
				description: "Test issue",
			}
			expect(issue.severity).toBe("high")
		})

		it("should export TestResultsReport interface", () => {
			const report: TestResultsReport = createEmptyTestResultsReport()
			expect(report.verdict).toBeDefined()
		})
	})
})
