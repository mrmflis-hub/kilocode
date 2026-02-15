/**
 * Orchestration Configuration UI Module
 *
 * Exports all orchestration configuration UI components and types.
 */

// Component exports
export { OrchestrationConfigView, default } from "./OrchestrationConfigView"
export { RoleAssignmentCard, default as RoleAssignmentCardDefault } from "./RoleAssignmentCard"
export { WorkflowStatusView, default as WorkflowStatusViewDefault } from "./WorkflowStatusView"
export { AgentStatusDashboard, default as AgentStatusDashboardDefault } from "./AgentStatusDashboard"

// Type exports
export type {
	RoleConfigUI,
	ProviderProfileUI,
	OrchestrationConfigurationUI,
	RoleDefinitionUI,
	RoleCategory,
	ConfigurationValidationResult,
	OrchestrationWebviewMessage,
	OrchestrationExtensionMessage,
	OrchestrationConfigViewProps,
	RoleAssignmentCardProps,
	// Workflow Status Types
	WorkflowStateUI,
	AgentStatusUI,
	ArtifactProgressUI,
	WorkflowStatusUI,
	WorkflowStatusViewProps,
	// Agent Dashboard Types
	AgentDashboardStatus,
	DashboardSummary,
	AgentStatusDashboardProps,
} from "./types"
