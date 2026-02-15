// kilocode_change - new file
// Orchestration module exports

// Re-export types from core-schemas
export type {
	AgentSpawnConfig,
	AgentInstance,
	RoleDefinition,
	RoleAssignment,
	WorkflowState,
	ArtifactType,
	ArtifactSummary,
	ArtifactStatus,
	MessageType,
	AgentMessage,
	AgentMessagePayload,
	LockMode,
	LockEventType,
	FileLock,
	LockConflict,
	LockEvent,
	AcquireLockResult,
	LockStatusInfo,
	RequestPriority,
	CircuitState,
	RateLimitInfo,
	QueuedRequest,
	RateLimitResult,
	CircuitBreakerStatus,
	RateLimitEventType,
	RateLimitEvent,
	CostEstimate,
	BudgetStatus,
	MultiAgentSession,
	MultiAgentSessionStatus,
	AgentReference,
	ArtifactSummaryReference,
	CreateMultiAgentSessionOptions,
	MultiAgentSessionState,
} from "@kilocode/core-schemas"

// Re-export WorkflowStateMachine
export { WorkflowStateMachine } from "./WorkflowStateMachine"

// Re-export AgentPoolManager
export { AgentPoolManager } from "./AgentPoolManager"

// Re-export MessageRouter
export { MessageRouter } from "./MessageRouter"

// Re-export OrchestratorAgent and its types
export { OrchestratorAgent } from "./OrchestratorAgent"
export type {
	OrchestratorWorkflowState,
	OrchestratorArtifactType,
	OrchestratorArtifactSummaryReference,
	OrganiserContext,
} from "./OrchestratorAgent"

// Re-export CheckpointIntegration
export { CheckpointIntegration, createCheckpointIntegration } from "./CheckpointIntegration"
export type { CheckpointIntegrationOptions, RollbackResult } from "./CheckpointIntegration"

// Re-export ErrorRecoveryManager
export { ErrorRecoveryManager, createErrorRecoveryManager } from "./ErrorRecoveryManager"
export type {
	OrchestrationErrorType,
	ErrorSeverity,
	RecoveryStrategyType,
	ErrorContext,
	RecoveryStrategy,
	RecoveryCondition,
	RecoveryResult,
	ErrorEvent,
	ErrorEventType,
	CircuitBreakerState,
	CircuitBreakerConfig,
	CircuitBreakerStatus as ErrorCircuitBreakerStatus,
	ErrorRecoveryConfig,
	TaskReassignmentOptions,
	GracefulDegradationOptions,
	UserNotificationOptions,
	UserNotificationAction,
	ErrorStatistics,
	ErrorRecoveryHandler,
	ErrorListener,
	RecoveryActionRecord,
} from "./ErrorRecoveryTypes"

// Re-export ContextIntegration
export { ContextIntegration } from "./ContextIntegration"
export type {
	ContextIntegrationConfig,
	ContextIntegrationEventType,
	ContextIntegrationEvent,
} from "./ContextIntegration"

// Re-export roles module
export * from "./roles"

// Re-export modes module
export * from "./modes"
