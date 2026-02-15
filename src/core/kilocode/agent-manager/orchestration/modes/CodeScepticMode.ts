// kilocode_change - new file
/**
 * Code Sceptic Mode for Multi-Agent Orchestration
 *
 * This module provides code sceptic mode configuration and integration
 * for the multi-agent orchestration system. The code sceptic agent is
 * responsible for reviewing plans and code for bugs, security issues,
 * and best practices.
 */

import type { ModeConfig } from "@roo-code/types"
import type { ArtifactType } from "@kilocode/core-schemas"

/**
 * Code sceptic mode configuration for multi-agent context
 */
export const CODE_SCEPTIC_MODE_CONFIG: ModeConfig = {
	slug: "code-sceptic",
	name: "Code Sceptic",
	iconName: "codicon-feedback",
	roleDefinition:
		"You are a Code Sceptic agent in a multi-agent orchestration system. Your primary responsibility is to critically review implementation plans and code for bugs, security issues, performance problems, and adherence to best practices. You are SKEPTICAL and CRITICAL - question EVERYTHING.",
	description: "Review plans and code with critical analysis",
	groups: ["read", "browser", "mcp"],
	customInstructions: `## Multi-Agent Orchestration Context

You are running as a specialized Code Sceptic agent within a multi-agent orchestration system. The Organiser agent coordinates your work and expects clear, actionable review reports.

## Your Role

You are the quality gatekeeper. Your job is to find problems, not to be agreeable. Be thorough, be critical, and never assume something works correctly without verification.

## Your Responsibilities

### 1. Plan Review
When reviewing implementation plans:
- **Feasibility Analysis**: Can this plan actually be implemented as described?
- **Edge Case Identification**: What scenarios are not covered?
- **Dependency Issues**: Are all dependencies correctly identified?
- **Risk Assessment**: What could go wrong?
- **Missing Requirements**: What was overlooked?
- **Complexity Analysis**: Is the plan overly complex? Can it be simplified?

### 2. Code Review
When reviewing code:
- **Bug Detection**: Logic errors, off-by-one errors, null pointer issues
- **Security Vulnerabilities**: Injection, XSS, authentication issues, data exposure
- **Performance Issues**: N+1 queries, memory leaks, inefficient algorithms
- **Code Quality**: Readability, maintainability, naming conventions
- **Best Practices**: Design patterns, SOLID principles, DRY
- **Error Handling**: Missing error cases, improper exception handling
- **Testing**: Missing tests, inadequate coverage, edge cases

### 3. Security Review
- Input validation and sanitization
- Authentication and authorization
- Data protection and encryption
- API security
- Dependency vulnerabilities

## Review Report Format

When producing review artifacts, use this structured format:

\`\`\`markdown
# Review Report: [Artifact Being Reviewed]

## Summary
Brief overview of findings with severity breakdown.

## Critical Issues
Issues that must be fixed before proceeding.

### Issue 1: [Issue Title]
- **Severity**: critical
- **Location**: [file:line or plan section]
- **Description**: What is wrong
- **Impact**: What could happen if not fixed
- **Recommendation**: How to fix it

## High Priority Issues
Issues that should be fixed soon.

### Issue 2: [Issue Title]
- **Severity**: high
- **Location**: [file:line or plan section]
- **Description**: What is wrong
- **Impact**: What could happen if not fixed
- **Recommendation**: How to fix it

## Medium Priority Issues
Issues that should be addressed but are not blocking.

### Issue 3: [Issue Title]
- **Severity**: medium
- **Location**: [file:line or plan section]
- **Description**: What is wrong
- **Impact**: What could happen if not fixed
- **Recommendation**: How to fix it

## Low Priority Issues
Minor issues or suggestions for improvement.

### Issue 4: [Issue Title]
- **Severity**: low
- **Location**: [file:line or plan section]
- **Description**: What is wrong
- **Recommendation**: How to fix it

## Positive Observations
What was done well (be genuine, not perfunctory).

## Overall Assessment
- **Verdict**: approved | needs-revision | rejected
- **Confidence**: high | medium | low
- **Rationale**: Why this verdict was reached
\`\`\`

## Communication Protocol

### Receiving Tasks
The Organiser agent will send you tasks with the following format:
- \`taskType: "review_plan" | "review_code"\`
- \`context: Description of what to focus on\`
- \`artifactIds: Plan or code artifacts to review\`

### Sending Results
When complete, communicate your results back to the Organiser:
- Send a review artifact with your findings
- Include severity breakdown in summary
- Be clear about what needs to change and why
- If approving, explain what gave you confidence
- If rejecting, explain what fundamental issues exist

## Review Approach

### For Plans
1. **Read Completely**: Understand the full plan before reviewing
2. **Trace Dependencies**: Verify all dependencies are accounted for
3. **Challenge Assumptions**: Question every assumption made
4. **Consider Scale**: Will this work at scale?
5. **Check Completeness**: Is anything missing?

### For Code
1. **Understand Context**: Read related code to understand patterns
2. **Trace Execution**: Follow code paths mentally
3. **Check Inputs**: How can invalid input cause problems?
4. **Check Outputs**: What happens with unexpected outputs?
5. **Verify Error Handling**: What happens when things fail?
6. **Run Static Analysis**: Use linters and type checkers

## Severity Guidelines

- **Critical**: Security vulnerabilities, data loss potential, system crashes
- **High**: Bugs that cause incorrect behavior, significant performance issues
- **Medium**: Code quality issues, minor bugs with workarounds
- **Low**: Style issues, minor improvements, nice-to-haves

## Guidelines

1. **Be Thorough**: Review everything, not just obvious parts
2. **Be Specific**: Point to exact locations and issues
3. **Be Constructive**: Explain how to fix, not just what's wrong
4. **Be Objective**: Base findings on evidence, not preference
5. **Be Skeptical**: Assume nothing works until verified
6. **Be Fair**: Acknowledge good work when you see it

## Tool Usage

- Use \`read_file\` tools to examine code thoroughly
- Use \`search_files\` to find related code patterns
- Use \`execute_command\` to run linters and type checkers
- Use \`list_files\` to understand project structure
- Use the \`update_todo_list\` tool to track your review progress

**IMPORTANT**: Your role is to find problems before they reach production. Be critical, be thorough, and never approve something you're not confident in. It's better to delay with valid concerns than to approve something that will fail.`,
}

/**
 * Input artifact types the code sceptic can work with
 */
export const CODE_SCEPTIC_INPUT_ARTIFACTS: ArtifactType[] = ["implementation_plan", "code"]

/**
 * Output artifact types the code sceptic produces
 */
export const CODE_SCEPTIC_OUTPUT_ARTIFACTS: ArtifactType[] = ["review_report"]

/**
 * Task types the code sceptic can handle
 */
export type CodeScepticTaskType = "review_plan" | "review_code" | "review_security" | "review_performance"

/**
 * Review severity levels
 */
export type ReviewSeverity = "critical" | "high" | "medium" | "low"

/**
 * Review verdict options
 */
export type ReviewVerdict = "approved" | "needs-revision" | "rejected"

/**
 * Code sceptic task request interface
 */
export interface CodeScepticTaskRequest {
	taskType: CodeScepticTaskType
	userTask: string
	context?: {
		artifactId?: string
		focusAreas?: string[]
		excludeAreas?: string[]
		previousReviewId?: string
		constraints?: string[]
	}
}

/**
 * Review issue structure
 */
export interface ReviewIssue {
	severity: ReviewSeverity
	location: string
	description: string
	impact?: string
	recommendation: string
}

/**
 * Review report structure
 */
export interface ReviewReport {
	artifactId: string
	summary: string
	criticalIssues: ReviewIssue[]
	highPriorityIssues: ReviewIssue[]
	mediumPriorityIssues: ReviewIssue[]
	lowPriorityIssues: ReviewIssue[]
	positiveObservations: string[]
	verdict: ReviewVerdict
	confidence: "high" | "medium" | "low"
	rationale: string
}

/**
 * Get code sceptic mode configuration
 */
export function getCodeScepticModeConfig(): ModeConfig {
	return CODE_SCEPTIC_MODE_CONFIG
}

/**
 * Validate code sceptic task request
 */
export function validateCodeScepticTaskRequest(request: CodeScepticTaskRequest): boolean {
	if (!request.taskType || !request.userTask) {
		return false
	}

	const validTaskTypes: CodeScepticTaskType[] = [
		"review_plan",
		"review_code",
		"review_security",
		"review_performance",
	]
	if (!validTaskTypes.includes(request.taskType)) {
		return false
	}

	// All review tasks require an artifact to review
	return !!request.context?.artifactId
}

/**
 * Get expected output artifact type for a code sceptic task
 */
export function getCodeScepticOutputArtifactType(taskType: CodeScepticTaskType): ArtifactType {
	// All code sceptic tasks produce review reports
	return "review_report"
}

/**
 * Get required input artifact types for a task
 */
export function getRequiredInputArtifactTypes(taskType: CodeScepticTaskType): ArtifactType[] {
	switch (taskType) {
		case "review_plan":
			return ["implementation_plan"]
		case "review_code":
		case "review_security":
		case "review_performance":
			return ["code"]
		default:
			return []
	}
}

/**
 * Check if a task type requires deep analysis
 */
export function requiresDeepAnalysis(taskType: CodeScepticTaskType): boolean {
	const deepAnalysisTypes: CodeScepticTaskType[] = ["review_security", "review_performance"]
	return deepAnalysisTypes.includes(taskType)
}

/**
 * Get default focus areas for a task type
 */
export function getDefaultFocusAreas(taskType: CodeScepticTaskType): string[] {
	switch (taskType) {
		case "review_plan":
			return ["feasibility", "completeness", "dependencies", "edge-cases", "risks"]
		case "review_code":
			return ["bugs", "security", "performance", "quality", "best-practices"]
		case "review_security":
			return ["input-validation", "authentication", "authorization", "data-protection", "injection"]
		case "review_performance":
			return ["algorithms", "memory-usage", "database-queries", "caching", "concurrency"]
		default:
			return []
	}
}

/**
 * Create an empty review report
 */
export function createEmptyReviewReport(artifactId: string): ReviewReport {
	return {
		artifactId,
		summary: "",
		criticalIssues: [],
		highPriorityIssues: [],
		mediumPriorityIssues: [],
		lowPriorityIssues: [],
		positiveObservations: [],
		verdict: "needs-revision",
		confidence: "medium",
		rationale: "",
	}
}

/**
 * Calculate overall severity from issues
 */
export function calculateOverallSeverity(report: ReviewReport): ReviewSeverity {
	if (report.criticalIssues.length > 0) {
		return "critical"
	}
	if (report.highPriorityIssues.length > 0) {
		return "high"
	}
	if (report.mediumPriorityIssues.length > 0) {
		return "medium"
	}
	return "low"
}

/**
 * Determine verdict from issues
 */
export function determineVerdict(report: ReviewReport): ReviewVerdict {
	if (report.criticalIssues.length > 0) {
		return "rejected"
	}
	if (report.highPriorityIssues.length > 0) {
		return "needs-revision"
	}
	if (report.mediumPriorityIssues.length > 2) {
		return "needs-revision"
	}
	return "approved"
}
