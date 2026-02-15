// kilocode_change - new file
/**
 * Debugger Mode for Multi-Agent Orchestration
 *
 * This module provides debugger mode configuration and integration
 * for the multi-agent orchestration system. The debugger agent is
 * responsible for running tests, identifying bugs, and debugging failures.
 */

import type { ModeConfig } from "@roo-code/types"
import type { ArtifactType } from "@kilocode/core-schemas"

/**
 * Debugger mode configuration for multi-agent context
 */
export const DEBUGGER_MODE_CONFIG: ModeConfig = {
	slug: "debugger",
	name: "Debugger",
	iconName: "codicon-bug",
	roleDefinition:
		"You are a Debugger agent in a multi-agent orchestration system. Your primary responsibility is to run tests, identify bugs, analyze failures, and fix issues in the codebase. You are methodical, detail-oriented, and focused on ensuring code quality through testing.",
	description: "Run tests and debug failures",
	groups: ["read", "edit", "browser", "mcp"],
	customInstructions: `## Multi-Agent Orchestration Context

You are running as a specialized Debugger agent within a multi-agent orchestration system. The Organiser agent coordinates your work and expects clear, actionable test results and bug reports.

## Your Role

You are the quality assurance specialist. Your job is to ensure code works correctly by running tests, identifying bugs, and helping fix issues. Be thorough, be methodical, and never assume code works without verification.

## Your Responsibilities

### 1. Test Execution
When running tests:
- **Unit Tests**: Execute unit tests for individual components
- **Integration Tests**: Run integration tests for component interactions
- **End-to-End Tests**: Execute E2E tests for full workflows
- **Test Coverage**: Analyze test coverage and identify gaps
- **Test Performance**: Monitor test execution time and performance

### 2. Bug Identification
When identifying bugs:
- **Test Failures**: Analyze test failure output for root causes
- **Error Messages**: Parse error messages and stack traces
- **Edge Cases**: Identify edge cases that cause failures
- **Regression Detection**: Find regressions from previous changes
- **Flaky Tests**: Identify and report flaky tests

### 3. Debugging
When debugging issues:
- **Root Cause Analysis**: Trace failures to their source
- **Code Inspection**: Examine relevant code paths
- **Data Analysis**: Analyze test data and inputs
- **Environment Issues**: Identify environment-specific problems
- **Dependency Issues**: Find dependency-related bugs

### 4. Bug Fixing
When fixing bugs:
- **Minimal Changes**: Make targeted, minimal fixes
- **Test-Driven**: Write tests to verify fixes
- **No Side Effects**: Ensure fixes don't break other functionality
- **Documentation**: Document the fix and reason
- **Verification**: Run all related tests after fixing

## Test Results Format

When producing test result artifacts, use this structured format:

\`\`\`markdown
# Test Results Report

## Summary
Brief overview of test execution with pass/fail counts.

## Test Environment
- **Framework**: [Test framework used]
- **Node Version**: [Node.js version]
- **OS**: [Operating system]
- **Timestamp**: [Execution timestamp]

## Test Suites

### Suite: [Suite Name]
- **Status**: passed | failed | skipped
- **Tests**: X passed, Y failed, Z skipped
- **Duration**: [Time in ms]

#### Passed Tests
- ✅ [Test name] - [Duration]
- ✅ [Test name] - [Duration]

#### Failed Tests
- ❌ [Test name] - [Duration]
  - **Error**: [Error message]
  - **Stack**: [Relevant stack trace]
  - **Expected**: [Expected value]
  - **Received**: [Actual value]

#### Skipped Tests
- ⏭️ [Test name] - [Reason for skipping]

## Coverage Report
- **Lines**: X%
- **Statements**: X%
- **Branches**: X%
- **Functions**: X%

## Issues Found

### Issue 1: [Issue Title]
- **Severity**: critical | high | medium | low
- **Type**: bug | regression | flaky | performance
- **Location**: [File:line]
- **Description**: What is wrong
- **Steps to Reproduce**: How to reproduce
- **Suggested Fix**: How to fix it

## Recommendations
- [Recommendation 1]
- [Recommendation 2]

## Overall Status
- **Verdict**: passed | failed | partial
- **Confidence**: high | medium | low
- **Rationale**: Why this verdict was reached
\`\`\`

## Communication Protocol

### Receiving Tasks
The Organiser agent will send you tasks with the following format:
- \`taskType: "run_tests" | "debug_failure" | "fix_bug" | "analyze_coverage"\`
- \`context: Description of what to focus on\`
- \`artifactIds: Code artifacts to test\`

### Sending Results
When complete, communicate your results back to the Organiser:
- Send a test_results artifact with your findings
- Include pass/fail counts in summary
- Be clear about what failed and why
- If all tests pass, explain what gave you confidence
- If tests fail, explain what needs to be fixed

## Debugging Approach

### For Test Failures
1. **Read Error Message**: Understand what the error is saying
2. **Check Stack Trace**: Find where the error originated
3. **Examine Test Code**: Understand what the test expects
4. **Examine Implementation**: Find the discrepancy
5. **Identify Root Cause**: Determine why it fails
6. **Propose Fix**: Suggest a minimal fix

### For Flaky Tests
1. **Identify Pattern**: When does it fail?
2. **Check Timing**: Is it timing-related?
3. **Check State**: Is there shared state?
4. **Check Dependencies**: Are external dependencies involved?
5. **Isolate**: Can you reproduce it consistently?
6. **Fix or Skip**: Make it reliable or skip with reason

### For Coverage Gaps
1. **Analyze Report**: Find uncovered code
2. **Identify Critical Paths**: What must be tested?
3. **Write Missing Tests**: Add tests for uncovered code
4. **Verify Coverage**: Re-run coverage analysis

## Severity Guidelines

- **Critical**: System crashes, data loss, security vulnerabilities
- **High**: Core functionality broken, major bugs
- **Medium**: Feature partially broken, minor bugs with workarounds
- **Low**: Cosmetic issues, minor improvements

## Tool Usage

- Use \`execute_command\` to run test suites
- Use \`read_file\` tools to examine code and test files
- Use \`search_files\` to find related test patterns
- Use \`list_files\` to understand project structure
- Use \`edit_file\` or \`write_file\` to fix bugs
- Use the \`update_todo_list\` tool to track your debugging progress

## Guidelines

1. **Be Thorough**: Run all relevant tests, not just obvious ones
2. **Be Methodical**: Follow a systematic debugging approach
3. **Be Specific**: Point to exact locations and issues
4. **Be Constructive**: Explain how to fix, not just what's wrong
5. **Be Patient**: Some bugs require deep investigation
6. **Be Honest**: If you can't find the cause, say so

**IMPORTANT**: Your role is to ensure code quality through testing. Be thorough, be methodical, and never skip tests. It's better to find bugs now than in production.`,
}

/**
 * Input artifact types the debugger can work with
 */
export const DEBUGGER_INPUT_ARTIFACTS: ArtifactType[] = ["code"]

/**
 * Output artifact types the debugger produces
 */
export const DEBUGGER_OUTPUT_ARTIFACTS: ArtifactType[] = ["test_results"]

/**
 * Task types the debugger can handle
 */
export type DebuggerTaskType =
	| "run_tests"
	| "debug_failure"
	| "fix_bug"
	| "analyze_coverage"
	| "write_tests"
	| "investigate_flaky"

/**
 * Test status types
 */
export type TestStatus = "passed" | "failed" | "skipped" | "pending"

/**
 * Issue severity levels
 */
export type IssueSeverity = "critical" | "high" | "medium" | "low"

/**
 * Issue type for categorization
 */
export type IssueType = "bug" | "regression" | "flaky" | "performance" | "coverage-gap"

/**
 * Test verdict options
 */
export type TestVerdict = "passed" | "failed" | "partial"

/**
 * Debugger task request interface
 */
export interface DebuggerTaskRequest {
	taskType: DebuggerTaskType
	userTask: string
	context?: {
		artifactId?: string
		testPath?: string
		testName?: string
		failureId?: string
		coverageThreshold?: number
		focusAreas?: string[]
		excludePatterns?: string[]
	}
}

/**
 * Test case result structure
 */
export interface TestCaseResult {
	name: string
	status: TestStatus
	duration: number
	errorMessage?: string
	errorStack?: string
	expected?: string
	received?: string
}

/**
 * Test suite result structure
 */
export interface TestSuiteResult {
	name: string
	status: TestStatus
	tests: TestCaseResult[]
	passedCount: number
	failedCount: number
	skippedCount: number
	duration: number
}

/**
 * Coverage report structure
 */
export interface CoverageReport {
	lines: number
	statements: number
	branches: number
	functions: number
	uncoveredFiles?: string[]
}

/**
 * Test issue structure
 */
export interface TestIssue {
	severity: IssueSeverity
	type: IssueType
	location: string
	description: string
	stepsToReproduce?: string[]
	suggestedFix?: string
	relatedTest?: string
}

/**
 * Test results report structure
 */
export interface TestResultsReport {
	summary: string
	environment: {
		framework: string
		nodeVersion?: string
		os?: string
		timestamp: number
	}
	suites: TestSuiteResult[]
	coverage?: CoverageReport
	issues: TestIssue[]
	recommendations: string[]
	verdict: TestVerdict
	confidence: "high" | "medium" | "low"
	rationale: string
}

/**
 * Get debugger mode configuration
 */
export function getDebuggerModeConfig(): ModeConfig {
	return DEBUGGER_MODE_CONFIG
}

/**
 * Validate debugger task request
 */
export function validateDebuggerTaskRequest(request: DebuggerTaskRequest): boolean {
	if (!request.taskType || !request.userTask) {
		return false
	}

	const validTaskTypes: DebuggerTaskType[] = [
		"run_tests",
		"debug_failure",
		"fix_bug",
		"analyze_coverage",
		"write_tests",
		"investigate_flaky",
	]

	if (!validTaskTypes.includes(request.taskType)) {
		return false
	}

	// Debug and fix tasks require specific context
	if (request.taskType === "debug_failure" || request.taskType === "fix_bug") {
		return !!request.context?.failureId || !!request.context?.testName
	}

	return true
}

/**
 * Get expected output artifact type for a debugger task
 */
export function getDebuggerOutputArtifactType(taskType: DebuggerTaskType): ArtifactType {
	// All debugger tasks produce test results
	return "test_results"
}

/**
 * Get required input artifact types for a debugger task
 */
export function getDebuggerRequiredInputArtifactTypes(taskType: DebuggerTaskType): ArtifactType[] {
	switch (taskType) {
		case "run_tests":
		case "analyze_coverage":
		case "write_tests":
			return ["code"]
		case "debug_failure":
		case "fix_bug":
		case "investigate_flaky":
			return ["code"]
		default:
			return ["code"]
	}
}

/**
 * Check if a debugger task type requires deep analysis
 */
export function requiresDebuggerDeepAnalysis(taskType: DebuggerTaskType): boolean {
	const deepAnalysisTypes: DebuggerTaskType[] = ["debug_failure", "investigate_flaky", "analyze_coverage"]
	return deepAnalysisTypes.includes(taskType)
}

/**
 * Get default focus areas for a debugger task type
 */
export function getDebuggerDefaultFocusAreas(taskType: DebuggerTaskType): string[] {
	switch (taskType) {
		case "run_tests":
			return ["unit-tests", "integration-tests", "coverage"]
		case "debug_failure":
			return ["error-analysis", "stack-trace", "root-cause"]
		case "fix_bug":
			return ["minimal-fix", "test-verification", "side-effects"]
		case "analyze_coverage":
			return ["uncovered-paths", "edge-cases", "critical-paths"]
		case "write_tests":
			return ["test-cases", "edge-cases", "mocking"]
		case "investigate_flaky":
			return ["timing", "state", "dependencies", "race-conditions"]
		default:
			return []
	}
}

/**
 * Create an empty test results report
 */
export function createEmptyTestResultsReport(): TestResultsReport {
	return {
		summary: "",
		environment: {
			framework: "unknown",
			timestamp: Date.now(),
		},
		suites: [],
		issues: [],
		recommendations: [],
		verdict: "failed",
		confidence: "medium",
		rationale: "",
	}
}

/**
 * Calculate overall test status from suites
 */
export function calculateOverallStatus(suites: TestSuiteResult[]): TestStatus {
	if (suites.length === 0) {
		return "pending"
	}

	const hasFailures = suites.some((s) => s.status === "failed")
	const allPassed = suites.every((s) => s.status === "passed")

	if (allPassed) {
		return "passed"
	}
	if (hasFailures) {
		return "failed"
	}
	return "skipped"
}

/**
 * Calculate total test counts from suites
 */
export function calculateTotalCounts(suites: TestSuiteResult[]): {
	total: number
	passed: number
	failed: number
	skipped: number
} {
	return suites.reduce(
		(acc, suite) => ({
			total: acc.total + suite.tests.length,
			passed: acc.passed + suite.passedCount,
			failed: acc.failed + suite.failedCount,
			skipped: acc.skipped + suite.skippedCount,
		}),
		{ total: 0, passed: 0, failed: 0, skipped: 0 },
	)
}

/**
 * Determine verdict from test results
 */
export function determineTestVerdict(report: TestResultsReport): TestVerdict {
	const criticalIssues = report.issues.filter((i) => i.severity === "critical")
	const highIssues = report.issues.filter((i) => i.severity === "high")
	const failedSuites = report.suites.filter((s) => s.status === "failed")

	if (criticalIssues.length > 0 || failedSuites.length > 0) {
		return "failed"
	}
	if (highIssues.length > 0) {
		return "partial"
	}

	const counts = calculateTotalCounts(report.suites)
	if (counts.failed > 0) {
		return "failed"
	}
	if (counts.skipped > counts.passed) {
		return "partial"
	}

	return "passed"
}

/**
 * Calculate overall severity from test issues
 */
export function calculateTestOverallSeverity(issues: TestIssue[]): IssueSeverity {
	if (issues.some((i) => i.severity === "critical")) {
		return "critical"
	}
	if (issues.some((i) => i.severity === "high")) {
		return "high"
	}
	if (issues.some((i) => i.severity === "medium")) {
		return "medium"
	}
	return "low"
}

/**
 * Get test command for framework
 */
export function getTestCommand(
	framework: string,
	options?: {
		testPath?: string
		testName?: string
		coverage?: boolean
		watch?: boolean
	},
): string {
	const opts = options || {}

	switch (framework.toLowerCase()) {
		case "jest":
			return buildJestCommand(opts)
		case "vitest":
			return buildVitestCommand(opts)
		case "mocha":
			return buildMochaCommand(opts)
		case "pytest":
			return buildPytestCommand(opts)
		default:
			return `npm test${opts.testPath ? ` ${opts.testPath}` : ""}`
	}
}

/**
 * Build Jest command
 */
function buildJestCommand(opts: { testPath?: string; testName?: string; coverage?: boolean; watch?: boolean }): string {
	const parts = ["npx jest"]

	if (opts.testPath) {
		parts.push(opts.testPath)
	}
	if (opts.testName) {
		parts.push(`--testNamePattern="${opts.testName}"`)
	}
	if (opts.coverage) {
		parts.push("--coverage")
	}
	if (opts.watch) {
		parts.push("--watch")
	}

	return parts.join(" ")
}

/**
 * Build Vitest command
 */
function buildVitestCommand(opts: {
	testPath?: string
	testName?: string
	coverage?: boolean
	watch?: boolean
}): string {
	const parts = ["npx vitest run"]

	if (opts.testPath) {
		parts.push(opts.testPath)
	}
	if (opts.testName) {
		parts.push(`--testNamePattern="${opts.testName}"`)
	}
	if (opts.coverage) {
		parts.push("--coverage")
	}
	if (opts.watch) {
		parts.pop() // Remove 'run'
		parts.push("--watch")
	}

	return parts.join(" ")
}

/**
 * Build Mocha command
 */
function buildMochaCommand(opts: {
	testPath?: string
	testName?: string
	coverage?: boolean
	watch?: boolean
}): string {
	const parts = ["npx mocha"]

	if (opts.testPath) {
		parts.push(opts.testPath)
	} else {
		parts.push("'test/**/*.spec.js'")
	}
	if (opts.testName) {
		parts.push(`--grep "${opts.testName}"`)
	}
	if (opts.watch) {
		parts.push("--watch")
	}

	let command = parts.join(" ")
	if (opts.coverage) {
		command = `npx nyc ${command}`
	}

	return command
}

/**
 * Build Pytest command
 */
function buildPytestCommand(opts: {
	testPath?: string
	testName?: string
	coverage?: boolean
	watch?: boolean
}): string {
	const parts = ["pytest"]

	if (opts.testPath) {
		parts.push(opts.testPath)
	}
	if (opts.testName) {
		parts.push(`-k "${opts.testName}"`)
	}
	if (opts.coverage) {
		parts.unshift("coverage run -m")
	}

	return parts.join(" ")
}

/**
 * Parse test output for failures
 */
export function parseTestOutput(output: string, framework: string): TestIssue[] {
	const issues: TestIssue[] = []

	switch (framework.toLowerCase()) {
		case "jest":
		case "vitest":
			return parseJestOutput(output)
		case "mocha":
			return parseMochaOutput(output)
		case "pytest":
			return parsePytestOutput(output)
		default:
			return parseGenericOutput(output)
	}
}

/**
 * Parse Jest/Vitest output
 */
function parseJestOutput(output: string): TestIssue[] {
	const issues: TestIssue[] = []
	const failureRegex = /FAIL\s+(.+?)\n([\s\S]*?)(?=FAIL|PASS|Summary|$)/g
	let match

	while ((match = failureRegex.exec(output)) !== null) {
		const filePath = match[1].trim()
		const failureContent = match[2]

		// Extract error message
		const errorMatch = failureContent.match(/●\s+(.+?)\n/)
		const errorMessage = errorMatch ? errorMatch[1] : "Unknown error"

		issues.push({
			severity: "high",
			type: "bug",
			location: filePath,
			description: errorMessage,
			stepsToReproduce: [`Run test: ${filePath}`],
		})
	}

	return issues
}

/**
 * Parse Mocha output
 */
function parseMochaOutput(output: string): TestIssue[] {
	const issues: TestIssue[] = []
	const failureRegex = /\d+\)\s+(.+?)\n([\s\S]*?)(?=\n\s*\d+\)|$)/g
	let match

	while ((match = failureRegex.exec(output)) !== null) {
		const testName = match[1].trim()
		const failureContent = match[2]

		// Extract error message
		const errorMatch = failureContent.match(/Error:\s+(.+?)\n/)
		const errorMessage = errorMatch ? errorMatch[1] : "Unknown error"

		issues.push({
			severity: "high",
			type: "bug",
			location: testName,
			description: errorMessage,
		})
	}

	return issues
}

/**
 * Parse Pytest output
 */
function parsePytestOutput(output: string): TestIssue[] {
	const issues: TestIssue[] = []
	const failureRegex = /FAILED\s+(.+?)\s+-\s+(.+?)\n([\s\S]*?)(?=FAILED|PASSED|ERROR|=|$)/g
	let match

	while ((match = failureRegex.exec(output)) !== null) {
		const filePath = match[1].trim()
		const testName = match[2].trim()
		const failureContent = match[3]

		// Extract error message
		const errorMatch = failureContent.match(/Error:\s+(.+?)\n/)
		const errorMessage = errorMatch ? errorMatch[1] : "Unknown error"

		issues.push({
			severity: "high",
			type: "bug",
			location: `${filePath}::${testName}`,
			description: errorMessage,
		})
	}

	return issues
}

/**
 * Parse generic test output
 */
function parseGenericOutput(output: string): TestIssue[] {
	const issues: TestIssue[] = []
	const errorRegex = /(?:error|fail|exception):\s*(.+?)(?:\n|$)/gi
	let match

	while ((match = errorRegex.exec(output)) !== null) {
		issues.push({
			severity: "high",
			type: "bug",
			location: "unknown",
			description: match[1],
		})
	}

	return issues
}
