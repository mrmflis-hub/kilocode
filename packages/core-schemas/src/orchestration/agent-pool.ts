import { z } from "zod"
import { WorkflowStateSchema } from "./types.js"

// Placeholder schemas until we import the actual ones
const _ProviderSettingsSchema = z.record(z.unknown())
const ModeConfigSchema = z.object({
	slug: z.string(),
	name: z.string(),
	roleDefinition: z.string(),
	whenToUse: z.string().optional(),
	description: z.string().optional(),
	customInstructions: z.string().optional(),
	groups: z.array(
		z.union([z.string(), z.tuple([z.string(), z.object({ fileRegex: z.string(), description: z.string() })])]),
	),
	source: z.enum(["global", "project", "organization"]).optional(),
	iconName: z.string().optional(),
})

export const AgentSpawnConfigSchema = z.object({
	agentId: z.string(),
	role: z.string(), // Role ID
	providerProfile: z.string(),
	mode: z.string(),
	workspace: z.string(),
	task: z.string().optional(),
	autoApprove: z.boolean().optional(),
	customModes: z.array(ModeConfigSchema).optional(),
	sessionId: z.string().optional(),
})
export type AgentSpawnConfig = z.infer<typeof AgentSpawnConfigSchema>

/**
 * Health status of an agent
 */
export const HealthStatusSchema = z.enum(["healthy", "unhealthy", "unknown", "recovering"])
export type HealthStatus = z.infer<typeof HealthStatusSchema>

export const AgentInstanceSchema = z.object({
	agentId: z.string(),
	role: z.string(), // Role ID
	mode: z.string(),
	providerProfile: z.string(),
	status: z.enum(["spawning", "ready", "busy", "paused", "stopped", "error"]),
	sessionId: z.string().optional(),
	spawnedAt: z.number(),
	lastActivityAt: z.number(),
	error: z.string().optional(),
	// Health monitoring fields
	healthStatus: HealthStatusSchema.optional(),
	lastHealthCheck: z.number().optional(),
	consecutiveFailures: z.number().optional(),
	restartAttempts: z.number().optional(),
})
export type AgentInstance = z.infer<typeof AgentInstanceSchema>

/**
 * Multi-agent session status
 */
export const MultiAgentSessionStatusSchema = z.enum([
	"initializing", // Session is being set up
	"running", // Agents are actively working
	"paused", // Session is paused (all agents paused)
	"completed", // All work is done successfully
	"error", // Session encountered an error
	"cancelled", // User cancelled the session
])
export type MultiAgentSessionStatus = z.infer<typeof MultiAgentSessionStatusSchema>

/**
 * Agent reference within a multi-agent session
 */
export const AgentReferenceSchema = z.object({
	agentId: z.string(),
	role: z.string(),
	status: z.enum(["spawning", "ready", "busy", "paused", "stopped", "error"]),
	sessionId: z.string().optional(), // The agent's own session ID
	spawnedAt: z.number(),
	lastActivityAt: z.number(),
})
export type AgentReference = z.infer<typeof AgentReferenceSchema>

/**
 * Artifact summary reference for multi-agent session context
 */
export const ArtifactSummaryReferenceSchema = z.object({
	artifactId: z.string(),
	artifactType: z.string(),
	summary: z.string(),
	status: z.string(),
	producerRole: z.string(),
})
export type ArtifactSummaryReference = z.infer<typeof ArtifactSummaryReferenceSchema>

/**
 * Multi-agent session - represents an orchestration session with multiple agents
 */
export const MultiAgentSessionSchema = z.object({
	// Unique session identifier
	sessionId: z.string(),

	// User's original task/prompt
	userTask: z.string(),

	// Current workflow state
	workflowState: WorkflowStateSchema,

	// Session status
	status: MultiAgentSessionStatusSchema,

	// Agents participating in this session
	agents: z.array(AgentReferenceSchema),

	// Artifact summaries (not full content - for context efficiency)
	artifactSummaries: z.array(ArtifactSummaryReferenceSchema),

	// Timestamps
	createdAt: z.number(),
	updatedAt: z.number(),
	completedAt: z.number().optional(),

	// Error information if status is "error"
	error: z.string().optional(),

	// Workspace path for this session
	workspace: z.string(),

	// Workflow history for debugging
	workflowHistory: z.array(WorkflowStateSchema),

	// Current workflow step description
	currentStepDescription: z.string().optional(),

	// Metadata
	metadata: z.record(z.unknown()).optional(),
})
export type MultiAgentSession = z.infer<typeof MultiAgentSessionSchema>

/**
 * Options for creating a multi-agent session
 */
export const CreateMultiAgentSessionOptionsSchema = z.object({
	sessionId: z.string().optional(),
	workspace: z.string(),
	metadata: z.record(z.unknown()).optional(),
})
export type CreateMultiAgentSessionOptions = z.infer<typeof CreateMultiAgentSessionOptionsSchema>

/**
 * Multi-agent session state for persistence
 */
export const MultiAgentSessionStateSchema = z.object({
	sessions: z.array(MultiAgentSessionSchema),
	selectedSessionId: z.string().nullable(),
})
export type MultiAgentSessionState = z.infer<typeof MultiAgentSessionStateSchema>
