// kilocode_change - new file
/**
 * Documentation Writer Mode for Multi-Agent Orchestration
 *
 * This module provides documentation writer mode configuration and integration
 * for the multi-agent orchestration system. The documentation writer agent is
 * responsible for writing inline documentation, creating external documentation
 * files, and ensuring code is well-documented.
 */

import type { ModeConfig } from "@roo-code/types"
import type { ArtifactType } from "@kilocode/core-schemas"

/**
 * Documentation writer mode configuration for multi-agent context
 */
export const DOCUMENTATION_WRITER_MODE_CONFIG: ModeConfig = {
	slug: "documentation-writer",
	name: "Documentation Writer",
	iconName: "codicon-book",
	roleDefinition:
		"You are a Documentation Writer agent in a multi-agent orchestration system. Your primary responsibility is to write clear, comprehensive documentation for code, APIs, and systems. You excel at explaining complex concepts in simple terms.",
	description: "Write inline documentation and create external documentation files",
	groups: ["read", "edit", "browser", "mcp"],
	customInstructions: `## Multi-Agent Orchestration Context

You are running as a specialized Documentation Writer agent within a multi-agent orchestration system. The Organiser agent coordinates your work and expects clear, well-structured documentation artifacts.

## Your Role

You are the documentation specialist. Your job is to ensure all code is well-documented, APIs are clearly explained, and users can understand how to use the system. Good documentation is as important as good code.

## Your Responsibilities

### 1. Inline Documentation
When adding inline comments to code:
- **JSDoc/TSDoc**: Write comprehensive JSDoc comments for public APIs
- **Function Documentation**: Document parameters, return values, and exceptions
- **Class Documentation**: Document class purpose, properties, and usage
- **Complex Logic**: Explain non-obvious code sections with inline comments
- **Type Documentation**: Document complex types and interfaces

### 2. External Documentation
When creating external documentation files:
- **README Files**: Create comprehensive README.md files
- **API Documentation**: Document all public APIs with examples
- **Architecture Docs**: Document system architecture and design decisions
- **User Guides**: Write user-facing documentation
- **Contributing Guides**: Document how to contribute to the project

### 3. Documentation Quality
- **Clarity**: Write in clear, simple language
- **Completeness**: Cover all necessary topics
- **Accuracy**: Ensure documentation matches the code
- **Examples**: Provide practical code examples
- **Consistency**: Maintain consistent style and terminology

## Documentation Artifact Format

When producing documentation artifacts, use this structured format:

\`\`\`markdown
# Documentation: [Component/Module Name]

## Overview
Brief description of what is being documented and its purpose.

## API Reference

### [Function/Class/Method Name]
\`\`\`typescript
// Signature with types
\`\`\`

**Description**: What this does.

**Parameters**:
- \`paramName\` (type): Description of parameter

**Returns**: Description of return value

**Throws**: Description of exceptions

**Example**:
\`\`\`typescript
// Usage example
\`\`\`

## Usage Guide

### Getting Started
Step-by-step guide for basic usage.

### Common Patterns
Common usage patterns with examples.

### Best Practices
Recommended approaches and patterns.

## See Also
Links to related documentation.
\`\`\`

## Communication Protocol

### Receiving Tasks
The Organiser agent will send you tasks with the following format:
- \`taskType: "document" | "document_api" | "create_readme"\`
- \`context: Description of what to document\`
- \`artifactIds: Code artifacts to document\`

### Sending Results
When complete, communicate your results back to the Organiser:
- Send a documentation artifact with your work
- Include summary of what was documented
- Note any areas that need clarification from developers
- Highlight any documentation gaps discovered

## Documentation Types

### 1. Inline Documentation
Comments within code files:
- File-level comments explaining module purpose
- Class-level comments with usage examples
- Function/method comments with JSDoc format
- Inline comments for complex logic

### 2. API Documentation
External documentation for APIs:
- Endpoint descriptions
- Request/response formats
- Authentication requirements
- Error codes and handling
- Rate limiting information

### 3. User Documentation
End-user facing documentation:
- Getting started guides
- Tutorials
- How-to guides
- Troubleshooting guides
- FAQ documents

### 4. Developer Documentation
Documentation for other developers:
- Architecture overviews
- Contributing guidelines
- Development setup
- Testing guidelines
- Deployment procedures

## JSDoc Format

Use this format for inline code documentation:

\`\`\`typescript
/**
 * Brief description of the function.
 * 
 * Detailed description if needed, explaining the function's
 * purpose, behavior, and any important notes.
 * 
 * @param paramName - Description of the parameter
 * @param anotherParam - Description of another parameter
 * @returns Description of what is returned
 * @throws {ErrorType} Description of when this error is thrown
 * 
 * @example
 * \`\`\`typescript
 * const result = functionName('value', 123)
 * console.log(result) // Expected output
 * \`\`\`
 * 
 * @see relatedFunction
 * @since 1.0.0
 */
\`\`\`

## Documentation Approach

### For Code Documentation
1. **Read the Code**: Understand what the code does
2. **Identify Audience**: Who will read this documentation?
3. **Document Public API First**: Focus on public interfaces
4. **Add Examples**: Show how to use the code
5. **Explain Why**: Document reasons, not just what
6. **Keep Updated**: Ensure docs match code changes

### For README Files
1. **Project Overview**: What is this project?
2. **Quick Start**: How to get started quickly
3. **Installation**: Step-by-step installation
4. **Usage**: Basic usage examples
5. **Configuration**: Available options
6. **Contributing**: How to contribute
7. **License**: License information

## Quality Guidelines

1. **Be Clear**: Use simple, direct language
2. **Be Complete**: Cover all necessary information
3. **Be Concise**: Don't over-document obvious things
4. **Be Current**: Keep documentation up-to-date
5. **Be Consistent**: Use consistent terminology and style
6. **Be Helpful**: Anticipate reader questions

## Tool Usage

- Use \`read_file\` tools to understand code before documenting
- Use \`write_file\` to create/update documentation files
- Use \`edit_file\` to add inline comments to code
- Use \`list_files\` to understand project structure
- Use \`search_files\` to find related code patterns
- Use the \`update_todo_list\` tool to track your documentation progress

**IMPORTANT**: Good documentation enables others to understand and use the code effectively. Write documentation that you would want to read when learning something new. Avoid jargon, explain concepts clearly, and always provide examples.`,
}

/**
 * Input artifact types the documentation writer can work with
 */
export const DOCUMENTATION_WRITER_INPUT_ARTIFACTS: ArtifactType[] = ["code", "implementation_plan"]

/**
 * Output artifact types the documentation writer produces
 */
export const DOCUMENTATION_WRITER_OUTPUT_ARTIFACTS: ArtifactType[] = ["documentation"]

/**
 * Task types the documentation writer can handle
 */
export type DocumentationWriterTaskType =
	| "document"
	| "document_api"
	| "document_inline"
	| "create_readme"
	| "update_readme"
	| "create_user_guide"
	| "create_contributing_guide"

/**
 * Documentation format options
 */
export type DocumentationFormat = "inline" | "external" | "both"

/**
 * Documentation section types
 */
export type DocumentationSection =
	| "overview"
	| "api-reference"
	| "usage-guide"
	| "examples"
	| "best-practices"
	| "troubleshooting"
	| "changelog"

/**
 * Documentation writer task request interface
 */
export interface DocumentationWriterTaskRequest {
	taskType: DocumentationWriterTaskType
	userTask: string
	context?: {
		artifactId?: string
		targetAudience?: "developers" | "users" | "both"
		format?: DocumentationFormat
		sections?: DocumentationSection[]
		excludePatterns?: string[]
		includePrivate?: boolean
		existingDocPath?: string
	}
}

/**
 * Documentation item structure
 */
export interface DocumentationItem {
	name: string
	type: "function" | "class" | "interface" | "type" | "variable" | "module"
	description: string
	signature?: string
	parameters?: Array<{
		name: string
		type: string
		description: string
		optional?: boolean
		defaultValue?: string
	}>
	returns?: {
		type: string
		description: string
	}
	throws?: Array<{
		type: string
		description: string
	}>
	examples?: string[]
	seeAlso?: string[]
	since?: string
	deprecated?: {
		version: string
		reason: string
		alternative?: string
	}
}

/**
 * Documentation artifact structure
 */
export interface DocumentationArtifact {
	artifactId: string
	title: string
	description: string
	items: DocumentationItem[]
	sections: Array<{
		title: string
		content: string
	}>
	summary: {
		filesDocumented: number
		itemsDocumented: number
		examplesAdded: number
		gapsIdentified: string[]
	}
}

/**
 * Get documentation writer mode configuration
 */
export function getDocumentationWriterModeConfig(): ModeConfig {
	return DOCUMENTATION_WRITER_MODE_CONFIG
}

/**
 * Validate documentation writer task request
 */
export function validateDocumentationWriterTaskRequest(request: DocumentationWriterTaskRequest): boolean {
	if (!request.taskType || !request.userTask) {
		return false
	}

	const validTaskTypes: DocumentationWriterTaskType[] = [
		"document",
		"document_api",
		"document_inline",
		"create_readme",
		"update_readme",
		"create_user_guide",
		"create_contributing_guide",
	]
	if (!validTaskTypes.includes(request.taskType)) {
		return false
	}

	// Most documentation tasks require an artifact to document (except create_* tasks)
	const createTasks: DocumentationWriterTaskType[] = [
		"create_readme",
		"create_user_guide",
		"create_contributing_guide",
	]
	if (!createTasks.includes(request.taskType)) {
		return !!request.context?.artifactId
	}

	return true
}

/**
 * Get expected output artifact type for a documentation writer task
 */
export function getDocumentationWriterOutputArtifactType(taskType: DocumentationWriterTaskType): ArtifactType {
	// All documentation writer tasks produce documentation artifacts
	return "documentation"
}

/**
 * Get required input artifact types for a task
 */
export function getRequiredInputArtifactTypesForDocs(taskType: DocumentationWriterTaskType): ArtifactType[] {
	switch (taskType) {
		case "document":
		case "document_api":
		case "document_inline":
			return ["code"]
		case "update_readme":
			return ["code"]
		case "create_readme":
		case "create_user_guide":
		case "create_contributing_guide":
			return [] // These can work without input artifacts
		default:
			return []
	}
}

/**
 * Check if a task type requires code analysis
 */
export function requiresCodeAnalysis(taskType: DocumentationWriterTaskType): boolean {
	const analysisRequired: DocumentationWriterTaskType[] = [
		"document",
		"document_api",
		"document_inline",
		"update_readme",
	]
	return analysisRequired.includes(taskType)
}

/**
 * Get default sections for a task type
 */
export function getDefaultSections(taskType: DocumentationWriterTaskType): DocumentationSection[] {
	switch (taskType) {
		case "document":
		case "document_api":
			return ["overview", "api-reference", "examples", "best-practices"]
		case "create_readme":
		case "update_readme":
			return ["overview", "usage-guide", "examples", "troubleshooting"]
		case "create_user_guide":
			return ["overview", "usage-guide", "examples", "troubleshooting"]
		case "create_contributing_guide":
			return ["overview", "best-practices"]
		case "document_inline":
			return [] // Inline docs don't have sections
		default:
			return ["overview"]
	}
}

/**
 * Get default target audience for a task type
 */
export function getDefaultTargetAudience(taskType: DocumentationWriterTaskType): "developers" | "users" | "both" {
	switch (taskType) {
		case "document":
		case "document_api":
		case "document_inline":
		case "create_contributing_guide":
			return "developers"
		case "create_user_guide":
			return "users"
		case "create_readme":
		case "update_readme":
			return "both"
		default:
			return "both"
	}
}

/**
 * Create an empty documentation artifact
 */
export function createEmptyDocumentationArtifact(artifactId: string): DocumentationArtifact {
	return {
		artifactId,
		title: "",
		description: "",
		items: [],
		sections: [],
		summary: {
			filesDocumented: 0,
			itemsDocumented: 0,
			examplesAdded: 0,
			gapsIdentified: [],
		},
	}
}

/**
 * Calculate documentation completeness score
 */
export function calculateDocumentationCompleteness(artifact: DocumentationArtifact): number {
	if (artifact.items.length === 0) {
		return 0
	}

	let score = 0
	for (const item of artifact.items) {
		// Base score for having the item
		score += 10

		// Points for description
		if (item.description && item.description.length > 0) {
			score += 20
		}

		// Points for examples
		if (item.examples && item.examples.length > 0) {
			score += 15
		}

		// Points for parameters (if applicable)
		if (item.parameters && item.parameters.length > 0) {
			const documentedParams = item.parameters.filter((p) => p.description && p.description.length > 0)
			score += (documentedParams.length / item.parameters.length) * 15
		}

		// Points for return documentation (if applicable)
		if (item.returns && item.returns.description) {
			score += 10
		}
	}

	// Normalize to 0-100
	return Math.min(100, Math.round((score / (artifact.items.length * 70)) * 100))
}

/**
 * Determine if documentation needs updating
 */
export function needsDocumentationUpdate(artifact: DocumentationArtifact): boolean {
	const completeness = calculateDocumentationCompleteness(artifact)
	return completeness < 80 || artifact.summary.gapsIdentified.length > 0
}

/**
 * Get file extension for documentation type
 */
export function getDocumentationFileExtension(taskType: DocumentationWriterTaskType): string {
	switch (taskType) {
		case "create_readme":
		case "update_readme":
			return "md"
		case "create_user_guide":
			return "md"
		case "create_contributing_guide":
			return "md"
		default:
			return "md"
	}
}

/**
 * Get default filename for documentation type
 */
export function getDefaultDocumentationFilename(taskType: DocumentationWriterTaskType): string {
	switch (taskType) {
		case "create_readme":
		case "update_readme":
			return "README.md"
		case "create_user_guide":
			return "USER_GUIDE.md"
		case "create_contributing_guide":
			return "CONTRIBUTING.md"
		default:
			return "DOCUMENTATION.md"
	}
}
