// kilocode_change - new file
/**
 * Role Definitions Module
 *
 * Defines all agent roles for the multi-agent orchestration system.
 * Each role has specific capabilities, input/output artifact types, and default modes.
 */

import type { RoleDefinition, ArtifactType } from "@kilocode/core-schemas"

/**
 * Role category for UI grouping
 */
export type RoleCategory = "coordination" | "planning" | "implementation" | "review" | "documentation" | "testing"

/**
 * Extended role definition with additional orchestration-specific properties
 */
export interface OrchestratorRoleDefinition {
	/** Role identifier (matches AgentRole type) */
	id: string

	/** Display name for UI */
	name: string

	/** Role description */
	description: string

	/** Role category for UI grouping */
	category: RoleCategory

	/** Whether this role is required for orchestration */
	required: boolean

	/** Capabilities as objects for detailed info */
	capabilities: Array<{
		name: string
		description: string
		required: boolean
	}>

	/** Input artifact types this role can work with */
	inputArtifactTypes: ArtifactType[]

	/** Output artifact types this role produces */
	outputArtifactTypes: ArtifactType[]

	/** Default mode for this role */
	defaultMode: string

	/** Priority for agent selection (higher = more likely to be used) */
	priority: number
}

/**
 * Convert OrchestratorRoleDefinition to core-schemas RoleDefinition
 */
function toRoleDefinition(orchestratorRole: OrchestratorRoleDefinition): RoleDefinition {
	return {
		id: orchestratorRole.id,
		name: orchestratorRole.name,
		category: orchestratorRole.category as
			| "coordination"
			| "planning"
			| "implementation"
			| "review"
			| "documentation"
			| "testing",
		description: orchestratorRole.description,
		capabilities: orchestratorRole.capabilities.map((c) => c.name),
		inputArtifacts: orchestratorRole.inputArtifactTypes,
		outputArtifacts: orchestratorRole.outputArtifactTypes,
		required: orchestratorRole.required,
		systemPrompt: generateSystemPrompt(orchestratorRole),
	}
}

/**
 * Generate system prompt for a role
 */
function generateSystemPrompt(role: OrchestratorRoleDefinition): string {
	const capabilityList = role.capabilities.map((c) => `- ${c.name}: ${c.description}`).join("\n")

	return `You are a ${role.name} agent in a multi-agent orchestration system.

## Role Description
${role.description}

## Category
${role.category}

## Capabilities
${capabilityList}

## Input Types
${role.inputArtifactTypes.join(", ") || "None"}

## Output Types
${role.outputArtifactTypes.join(", ") || "None"}

## Guidelines
- Work within your defined capabilities
- Communicate clearly with the Organiser agent
- Store artifacts when work is complete
- Report status updates regularly
- If you encounter issues, report them promptly`
}

/**
 * Predefined role definitions for the orchestration system
 */
const ROLE_DEFINITIONS: OrchestratorRoleDefinition[] = [
	{
		id: "organiser",
		name: "Organiser",
		description: "Coordinates all agents, manages workflow state, and delegates tasks",
		category: "coordination",
		required: true,
		capabilities: [
			{ name: "coordinate_agents", description: "Spawn and manage other agents", required: true },
			{ name: "manage_workflow", description: "Control workflow state transitions", required: true },
			{ name: "route_messages", description: "Route messages between agents", required: true },
			{ name: "maintain_context", description: "Maintain minimal context to avoid overflow", required: true },
		],
		inputArtifactTypes: [],
		outputArtifactTypes: [],
		defaultMode: "architect",
		priority: 100,
	},

	{
		id: "architect",
		name: "Architect",
		description: "Analyzes repository structure and creates implementation plans",
		category: "planning",
		required: true,
		capabilities: [
			{ name: "analyze_repository", description: "Read and understand codebase structure", required: true },
			{ name: "create_plan", description: "Generate detailed implementation plans", required: true },
			{ name: "revise_plan", description: "Update plans based on feedback", required: true },
			{ name: "estimate_effort", description: "Estimate development effort and complexity", required: false },
		],
		inputArtifactTypes: [],
		outputArtifactTypes: ["implementation_plan"],
		defaultMode: "architect",
		priority: 90,
	},

	{
		id: "primary-coder",
		name: "Primary Coder",
		description: "Creates file structure and writes pseudocode for implementation",
		category: "implementation",
		required: true,
		capabilities: [
			{ name: "create_structure", description: "Create file and directory structure", required: true },
			{ name: "write_pseudocode", description: "Write pseudocode for implementation", required: true },
			{ name: "design_data_models", description: "Design data structures and interfaces", required: false },
		],
		inputArtifactTypes: ["implementation_plan"],
		outputArtifactTypes: ["pseudocode"],
		defaultMode: "code",
		priority: 80,
	},

	{
		id: "secondary-coder",
		name: "Secondary Coder",
		description: "Implements actual code based on pseudocode",
		category: "implementation",
		required: true,
		capabilities: [
			{ name: "implement_code", description: "Write actual implementation code", required: true },
			{ name: "fix_code", description: "Fix issues identified in reviews", required: true },
			{ name: "write_tests", description: "Write unit tests for implementation", required: false },
		],
		inputArtifactTypes: ["pseudocode", "review_report"],
		outputArtifactTypes: ["code"],
		defaultMode: "code",
		priority: 70,
	},

	{
		id: "code-sceptic",
		name: "Code Sceptic",
		description: "Reviews plans and code for bugs, security issues, and best practices",
		category: "review",
		required: false,
		capabilities: [
			{ name: "review_plan", description: "Review implementation plans for issues", required: true },
			{ name: "review_code", description: "Review code for bugs and issues", required: true },
			{ name: "identify_security_issues", description: "Find security vulnerabilities", required: false },
			{ name: "check_code_quality", description: "Assess code quality and readability", required: false },
		],
		inputArtifactTypes: ["implementation_plan", "code"],
		outputArtifactTypes: ["review_report"],
		defaultMode: "code-review",
		priority: 60,
	},

	{
		id: "documentation-writer",
		name: "Documentation Writer",
		description: "Writes inline documentation and creates external documentation files",
		category: "documentation",
		required: false,
		capabilities: [
			{ name: "write_inline_docs", description: "Add inline comments to code", required: true },
			{ name: "create_docs", description: "Create external documentation files", required: true },
			{ name: "generate_readme", description: "Generate project README files", required: false },
		],
		inputArtifactTypes: ["code"],
		outputArtifactTypes: ["documentation"],
		defaultMode: "docs-specialist",
		priority: 50,
	},

	{
		id: "debugger",
		name: "Debugger",
		description: "Runs tests and identifies bugs in the implementation",
		category: "testing",
		required: false,
		capabilities: [
			{ name: "run_tests", description: "Execute test suites", required: true },
			{ name: "identify_bugs", description: "Find and report bugs", required: true },
			{ name: "debug_issues", description: "Debug and fix test failures", required: false },
		],
		inputArtifactTypes: ["code"],
		outputArtifactTypes: ["test_results"],
		defaultMode: "debug",
		priority: 40,
	},
]

/**
 * Get all role definitions as RoleDefinition (core-schemas format)
 */
export function getAllRoleDefinitions(): RoleDefinition[] {
	return ROLE_DEFINITIONS.map(toRoleDefinition)
}

/**
 * Get a role definition by ID as RoleDefinition (core-schemas format)
 */
export function getRoleDefinition(roleId: string): RoleDefinition | undefined {
	const role = ROLE_DEFINITIONS.find((r) => r.id === roleId)
	return role ? toRoleDefinition(role) : undefined
}

/**
 * Get a role definition in OrchestratorRoleDefinition format
 */
export function getOrchestratorRoleDefinition(roleId: string): OrchestratorRoleDefinition | undefined {
	return ROLE_DEFINITIONS.find((r) => r.id === roleId)
}

/**
 * Get required role IDs
 */
export function getRequiredRoleIds(): string[] {
	return ROLE_DEFINITIONS.filter((role) => role.required).map((role) => role.id)
}

/**
 * Get role IDs by category
 */
export function getRoleIdsByCategory(category: RoleCategory): string[] {
	return ROLE_DEFINITIONS.filter((role) => role.category === category).map((role) => role.id)
}

/**
 * Check if a role ID is valid
 */
export function isValidRoleId(roleId: string): boolean {
	return ROLE_DEFINITIONS.some((r) => r.id === roleId)
}

/**
 * Get role category for a role ID
 */
export function getRoleCategory(roleId: string): RoleCategory | undefined {
	const role = ROLE_DEFINITIONS.find((r) => r.id === roleId)
	return role?.category
}

/**
 * Get default mode for a role
 */
export function getDefaultModeForRole(roleId: string): string {
	const role = ROLE_DEFINITIONS.find((r) => r.id === roleId)
	return role?.defaultMode || "code"
}

/**
 * Get priority for a role
 */
export function getRolePriority(roleId: string): number {
	const role = ROLE_DEFINITIONS.find((r) => r.id === roleId)
	return role?.priority || 0
}

/**
 * Check if a role can handle a specific artifact type as input
 */
export function canRoleHandleInput(roleId: string, artifactType: ArtifactType): boolean {
	const role = ROLE_DEFINITIONS.find((r) => r.id === roleId)
	return role?.inputArtifactTypes.includes(artifactType) || false
}

/**
 * Check if a role can produce a specific artifact type as output
 */
export function canRoleProduceOutput(roleId: string, artifactType: ArtifactType): boolean {
	const role = ROLE_DEFINITIONS.find((r) => r.id === roleId)
	return role?.outputArtifactTypes.includes(artifactType) || false
}

/**
 * Get all categories
 */
export function getAllCategories(): RoleCategory[] {
	return ["coordination", "planning", "implementation", "review", "documentation", "testing"]
}

// Export for internal use - already exported via interface declaration above
