import { z } from "zod"
import { ArtifactTypeSchema } from "./types.js"

export const ArtifactStatusSchema = z.enum([
	"in_progress",
	"completed",
	"needs_revision",
	"approved",
	"rejected",
])
export type ArtifactStatus = z.infer<typeof ArtifactStatusSchema>

export const ArtifactSummarySchema = z.object({
	brief: z.string(),
	keyPoints: z.array(z.string()),
	filesAffected: z.array(z.string()),
	metrics: z.object({
		linesOfCode: z.number().optional(),
		testsCount: z.number().optional(),
		issuesFound: z.number().optional(),
	}).optional(),
})
export type ArtifactSummary = z.infer<typeof ArtifactSummarySchema>

export const ArtifactMetadataSchema = z.object({
	filesAffected: z.array(z.string()).optional(),
	reviewedBy: z.array(z.string()).optional(),
	approvalStatus: z.enum(["pending", "approved", "rejected"]).optional(),
	parentArtifactId: z.string().optional(),
	relatedArtifactIds: z.array(z.string()).optional(),
	tags: z.array(z.string()).optional(),
	priority: z.enum(["low", "medium", "high"]).optional(),
})
export type ArtifactMetadata = z.infer<typeof ArtifactMetadataSchema>

export const ArtifactSchema = z.object({
	id: z.string(),
	type: ArtifactTypeSchema,
	status: ArtifactStatusSchema,
	producer: z.string(), // Agent role ID
	createdAt: z.number(), // Date.now()
	updatedAt: z.number(),
	version: z.number(),
	summary: ArtifactSummarySchema,
	metadata: ArtifactMetadataSchema,
	contentRef: z.string(),
})
export type Artifact = z.infer<typeof ArtifactSchema>
