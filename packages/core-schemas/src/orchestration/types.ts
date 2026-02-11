import { z } from "zod"

export const WorkflowStateSchema = z.enum([
	"IDLE",
	"PLANNING",
	"PLAN_REVIEW",
	"PLAN_REVISION",
	"STRUCTURE_CREATION",
	"CODE_IMPLEMENTATION",
	"CODE_REVIEW",
	"CODE_FIXING",
	"DOCUMENTATION",
	"TESTING",
	"COMPLETED",
	"PAUSED",
	"ERROR",
])
export type WorkflowState = z.infer<typeof WorkflowStateSchema>

export const ArtifactTypeSchema = z.enum([
	"user_task",
	"implementation_plan",
	"pseudocode",
	"code",
	"review_report",
	"documentation",
	"test_results",
	"error_report",
])
export type ArtifactType = z.infer<typeof ArtifactTypeSchema>

export const RoleDefinitionSchema = z.object({
	id: z.string(),
	name: z.string(),
	category: z.enum(["coordination", "planning", "implementation", "review", "documentation", "testing"]),
	description: z.string(),
	capabilities: z.array(z.string()),
	inputArtifacts: z.array(ArtifactTypeSchema),
	outputArtifacts: z.array(ArtifactTypeSchema),
	required: z.boolean(),
	systemPrompt: z.string(),
})
export type RoleDefinition = z.infer<typeof RoleDefinitionSchema>

export const RoleAssignmentSchema = z.object({
	roleId: z.string(),
	roleName: z.string(),
	assignedProfileId: z.string().nullable(),
	isActive: z.boolean(),
	priority: z.number(),
})
export type RoleAssignment = z.infer<typeof RoleAssignmentSchema>
