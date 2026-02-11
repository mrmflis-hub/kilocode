import { z } from "zod"
import { ArtifactTypeSchema, WorkflowStateSchema } from "./types.js"

export const WorkflowStepSchema = z.object({
	stepNumber: z.number(),
	description: z.string(),
	involvedAgents: z.array(z.string()),
	expectedArtifacts: z.array(ArtifactTypeSchema),
	completionCriteria: z.array(z.string()),
})
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>

export const WorkflowTransitionSchema = z.object({
	from: WorkflowStateSchema,
	to: WorkflowStateSchema,
	trigger: z.string(),
	conditions: z.array(z.string()).optional(),
})
export type WorkflowTransition = z.infer<typeof WorkflowTransitionSchema>
