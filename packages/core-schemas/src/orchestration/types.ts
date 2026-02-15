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

// File Locking Types

/**
 * Lock mode for file operations
 */
export const LockModeSchema = z.enum(["read", "write"])
export type LockMode = z.infer<typeof LockModeSchema>

/**
 * Lock event types for notifications
 */
export const LockEventTypeSchema = z.enum(["acquired", "released", "timeout", "conflict", "waiting"])
export type LockEventType = z.infer<typeof LockEventTypeSchema>

/**
 * File lock information
 */
export const FileLockSchema = z.object({
	lockId: z.string(),
	filePath: z.string(),
	agentId: z.string(),
	mode: LockModeSchema,
	acquiredAt: z.number(),
	timeoutMs: z.number(),
	description: z.string().optional(),
})
export type FileLock = z.infer<typeof FileLockSchema>

/**
 * Lock conflict information
 */
export const LockConflictSchema = z.object({
	filePath: z.string(),
	conflictingAgentId: z.string(),
	conflictingMode: LockModeSchema,
	requestedMode: LockModeSchema,
	detectedAt: z.number(),
})
export type LockConflict = z.infer<typeof LockConflictSchema>

/**
 * Lock event for notifications
 */
export const LockEventSchema = z.object({
	type: LockEventTypeSchema,
	filePath: z.string(),
	agentId: z.string(),
	lockId: z.string().optional(),
	timestamp: z.number(),
	data: z.record(z.unknown()).optional(),
})
export type LockEvent = z.infer<typeof LockEventSchema>

/**
 * Result of lock acquisition
 */
export const AcquireLockResultSchema = z.object({
	success: z.boolean(),
	lockId: z.string().optional(),
	error: z.string().optional(),
	waitedMs: z.number(),
	retries: z.number(),
	conflict: LockConflictSchema.optional(),
})
export type AcquireLockResult = z.infer<typeof AcquireLockResultSchema>

/**
 * Lock status information
 */
export const LockStatusInfoSchema = z.object({
	filePath: z.string(),
	isLocked: z.boolean(),
	lockHolder: z.string().optional(),
	lockMode: LockModeSchema.optional(),
	waitingCount: z.number(),
	waitingAgents: z.array(z.string()),
})
export type LockStatusInfo = z.infer<typeof LockStatusInfoSchema>

// Rate Limiting Types

/**
 * Priority levels for rate-limited requests
 */
export const RequestPrioritySchema = z.enum(["critical", "high", "normal", "low"])
export type RequestPriority = z.infer<typeof RequestPrioritySchema>

/**
 * Circuit breaker states
 */
export const CircuitStateSchema = z.enum(["closed", "open", "half-open"])
export type CircuitState = z.infer<typeof CircuitStateSchema>

/**
 * Rate limit information for a provider
 */
export const RateLimitInfoSchema = z.object({
	providerId: z.string(),
	requestsPerMinute: z.number(),
	tokensPerMinute: z.number(),
	requestsUsed: z.number(),
	tokensUsed: z.number(),
	windowStartMs: z.number(),
	windowDurationMs: z.number(),
})
export type RateLimitInfo = z.infer<typeof RateLimitInfoSchema>

/**
 * Queued request for rate limiting
 */
export const QueuedRequestSchema = z.object({
	requestId: z.string(),
	agentId: z.string(),
	providerId: z.string(),
	priority: RequestPrioritySchema,
	estimatedTokens: z.number(),
	queuedAt: z.number(),
	expiresAt: z.number().optional(),
	metadata: z.record(z.unknown()).optional(),
})
export type QueuedRequest = z.infer<typeof QueuedRequestSchema>

/**
 * Result of a rate limit check
 */
export const RateLimitResultSchema = z.object({
	allowed: z.boolean(),
	waitTimeMs: z.number().optional(),
	reason: z.string().optional(),
	remainingRequests: z.number().optional(),
	remainingTokens: z.number().optional(),
})
export type RateLimitResult = z.infer<typeof RateLimitResultSchema>

/**
 * Circuit breaker status
 */
export const CircuitBreakerStatusSchema = z.object({
	providerId: z.string(),
	state: CircuitStateSchema,
	failureCount: z.number(),
	successCount: z.number(),
	lastFailureTime: z.number().optional(),
	lastStateChange: z.number(),
	nextRetryTime: z.number().optional(),
})
export type CircuitBreakerStatus = z.infer<typeof CircuitBreakerStatusSchema>

/**
 * Rate limiting event types
 */
export const RateLimitEventTypeSchema = z.enum([
	"request_queued",
	"request_processed",
	"request_rejected",
	"rate_limit_hit",
	"circuit_opened",
	"circuit_closed",
	"circuit_half_open",
	"budget_exceeded",
])
export type RateLimitEventType = z.infer<typeof RateLimitEventTypeSchema>

/**
 * Rate limiting event
 */
export const RateLimitEventSchema = z.object({
	type: RateLimitEventTypeSchema,
	providerId: z.string().optional(),
	agentId: z.string().optional(),
	requestId: z.string().optional(),
	timestamp: z.number(),
	data: z.record(z.unknown()).optional(),
})
export type RateLimitEvent = z.infer<typeof RateLimitEventSchema>

/**
 * Cost estimation for a request
 */
export const CostEstimateSchema = z.object({
	providerId: z.string(),
	inputTokens: z.number(),
	outputTokens: z.number(),
	estimatedCostUsd: z.number(),
	modelId: z.string().optional(),
})
export type CostEstimate = z.infer<typeof CostEstimateSchema>

/**
 * Budget status
 */
export const BudgetStatusSchema = z.object({
	totalBudgetUsd: z.number(),
	usedBudgetUsd: z.number(),
	remainingBudgetUsd: z.number(),
	periodStartMs: z.number(),
	periodDurationMs: z.number(),
	projectedCostUsd: z.number().optional(),
})
export type BudgetStatus = z.infer<typeof BudgetStatusSchema>
