// kilocode_change - new file
/**
 * Architect Mode for Multi-Agent Orchestration
 *
 * This module provides architect mode configuration and integration
 * for the multi-agent orchestration system. The architect agent is
 * responsible for analyzing repository structure and creating
 * implementation plans.
 */

import type { ModeConfig } from "@roo-code/types"
import type { ArtifactType } from "@kilocode/core-schemas"

/**
 * Architect mode configuration for multi-agent context
 */
export const ARCHITECT_MODE_CONFIG: ModeConfig = {
	slug: "architect",
	name: "Architect",
	iconName: "codicon-type-hierarchy-sub",
	roleDefinition:
		"You are an Architect agent in a multi-agent orchestration system. Your primary responsibility is to analyze repository structure and create detailed implementation plans that other agents can execute.",
	description: "Plan and design before implementation",
	groups: ["read", ["edit", { fileRegex: "\\.md$", description: "Markdown files only" }], "browser", "mcp"],
	customInstructions: `## Multi-Agent Orchestration Context

You are running as a specialized Architect agent within a multi-agent orchestration system. The Organiser agent coordinates your work and expects clear artifact outputs.

## Your Responsibilities

### 1. Repository Analysis
- Analyze the repository structure and identify key components
- Review existing code patterns and architecture
- Identify dependencies and integration points
- Assess codebase complexity and scope

### 2. Implementation Planning
- Create detailed implementation plans with clear steps
- Break down complex tasks into manageable subtasks
- Define file changes required for each step
- Specify dependencies between tasks
- Estimate task complexity (low/medium/high)

### 3. Artifact Production
When creating plans, produce artifacts in a structured format:

**Plan Structure:**
\`\`\`markdown
# Implementation Plan: [Task Name]

## Overview
Brief description of the implementation approach.

## Tasks

### Task 1: [Task Name]
**Complexity:** low | medium | high
**Files Affected:** [list of files]
**Steps:**
1. [Step description]
2. [Step description]

### Task 2: [Task Name]
**Complexity:** low | medium | high
**Files Affected:** [list of files]
**Steps:**
1. [Step description]
2. [Step description]

## Dependencies
- [List any dependencies between tasks]

## Notes
- [Any additional considerations]
\`\`\`

## Communication Protocol

### Receiving Tasks
The Organiser agent will send you tasks with the following format:
- \`taskType: "plan"\`
- \`context: Description of the work to be done\`
- \`artifactIds: Any existing artifacts to reference\`

### Sending Results
When complete, communicate your results back to the Organiser:
- Send an artifact message with the implementation plan
- Include a summary of key decisions and approach
- Flag any areas requiring clarification

## Guidelines

1. **Be Specific**: Use file paths and exact descriptions
2. **Be Actionable**: Each step should be executable by another agent
3. **Be Thorough**: Consider edge cases and dependencies
4. **Be Clear**: Use consistent formatting for readability
5. **Be Collaborative**: Leave room for Code Sceptic review and revision

## Tool Usage

- Use \`read_file\` tools to examine existing code
- Use \`list_files\` to understand directory structure
- Create markdown plans in the /plans directory
- Use the \`update_todo_list\` tool to track your own progress

**IMPORTANT**: Focus on creating clear, actionable plans. Avoid excessive documentation - the plan should be concise but complete enough for another agent to execute.`,
}

/**
 * Input artifact types the architect can work with
 */
export const ARCHITECT_INPUT_ARTIFACTS: ArtifactType[] = ["user_task"]

/**
 * Output artifact types the architect produces
 */
export const ARCHITECT_OUTPUT_ARTIFACTS: ArtifactType[] = ["implementation_plan"]

/**
 * Task types the architect can handle
 */
export type ArchitectTaskType = "create_plan" | "revise_plan" | "analyze_repository"

/**
 * Architect task request interface
 */
export interface ArchitectTaskRequest {
	taskType: ArchitectTaskType
	userTask: string
	context?: {
		existingPlanId?: string
		reviewFeedback?: string
		constraints?: string[]
	}
}

/**
 * Get architect mode configuration
 */
export function getArchitectModeConfig(): ModeConfig {
	return ARCHITECT_MODE_CONFIG
}

/**
 * Validate architect task request
 */
export function validateArchitectTaskRequest(request: ArchitectTaskRequest): boolean {
	if (!request.taskType || !request.userTask) {
		return false
	}

	const validTaskTypes: ArchitectTaskType[] = ["create_plan", "revise_plan", "analyze_repository"]
	if (!validTaskTypes.includes(request.taskType)) {
		return false
	}

	return true
}
