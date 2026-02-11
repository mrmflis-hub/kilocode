import { z } from "zod"
import { ArtifactTypeSchema } from "./types.js"

export const MessageTypeSchema = z.enum([
	"request",
	"response",
	"artifact",
	"status",
	"error",
	"control",
])
export type MessageType = z.infer<typeof MessageTypeSchema>

export const RequestPayloadSchema = z.object({
	task: z.string(),
	taskType: z.enum(["analyze", "plan", "implement", "review", "document", "test"]),
	context: z.object({
		artifactIds: z.array(z.string()),
		instructions: z.string(),
		constraints: z.array(z.string()).optional(),
	}),
})

export const ResponsePayloadSchema = z.object({
	success: z.boolean(),
	result: z.unknown().optional(),
	error: z.string().optional(),
	artifactId: z.string().optional(),
})

export const ArtifactPayloadSchema = z.object({
	artifactId: z.string(),
	artifactType: ArtifactTypeSchema,
	summary: z.string(),
	metadata: z.record(z.unknown()),
})

export const StatusPayloadSchema = z.object({
	agentId: z.string(),
	status: z.enum(["idle", "working", "waiting", "error"]),
	progress: z.number().optional(),
	currentTask: z.string().optional(),
})

export const ErrorPayloadSchema = z.object({
	errorType: z.enum(["agent_error", "validation_error", "timeout", "rate_limit"]),
	message: z.string(),
	details: z.unknown().optional(),
	recoverable: z.boolean(),
})

export const ControlPayloadSchema = z.object({
	action: z.enum(["pause", "resume", "terminate", "retry"]),
	reason: z.string().optional(),
})

export const AgentMessagePayloadSchema = z.union([
	RequestPayloadSchema,
	ResponsePayloadSchema,
	ArtifactPayloadSchema,
	StatusPayloadSchema,
	ErrorPayloadSchema,
	ControlPayloadSchema,
])
export type AgentMessagePayload = z.infer<typeof AgentMessagePayloadSchema>

export const AgentMessageSchema = z.object({
	id: z.string(),
	type: MessageTypeSchema,
	from: z.string(),
	to: z.string(),
	timestamp: z.number(),
	payload: AgentMessagePayloadSchema,
	correlationId: z.string().optional(),
})
export type AgentMessage = z.infer<typeof AgentMessageSchema>
