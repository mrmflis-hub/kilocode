import { z } from "zod"

// Placeholder schemas until we import the actual ones
const ProviderSettingsSchema = z.record(z.unknown())
const ModeConfigSchema = z.object({
	slug: z.string(),
	name: z.string(),
	roleDefinition: z.string().optional(),
	customInstructions: z.string().optional(),
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
})
export type AgentInstance = z.infer<typeof AgentInstanceSchema>
