/**
 * Orchestration Configuration UI Types
 *
 * Type definitions for the OrchestrationConfigView component and related UI elements.
 * These types mirror the backend types from OrchestrationConfigService and RoleRegistry.
 */

// =============================================================================
// Role Types
// =============================================================================

/**
 * Role configuration stored in UI state
 */
export interface RoleConfigUI {
	roleId: string
	enabled: boolean
	providerProfileId: string | null
	mode: string
	priority: number
}

/**
 * Provider profile for role assignment in UI
 */
export interface ProviderProfileUI {
	id: string
	name: string
	providerType: string
	model: string
	apiKey?: string
	settings?: Record<string, unknown>
}

/**
 * Complete orchestration configuration for UI
 */
export interface OrchestrationConfigurationUI {
	enabled: boolean
	maxConcurrentAgents: number
	roles: RoleConfigUI[]
	providerProfiles: ProviderProfileUI[]
	defaultProviderProfileId: string | null
}

/**
 * Role definition from backend
 */
export interface RoleDefinitionUI {
	id: string
	name: string
	description: string
	category: RoleCategory
	required: boolean
	capabilities: Array<{
		name: string
		description: string
		required: boolean
	}>
	inputArtifactTypes: string[]
	outputArtifactTypes: string[]
	defaultMode: string
	priority: number
}

/**
 * Role category for UI grouping
 */
export type RoleCategory = "coordination" | "planning" | "implementation" | "review" | "documentation" | "testing"

// =============================================================================
// Validation Types
// =============================================================================

/**
 * Validation result for configuration
 */
export interface ConfigurationValidationResult {
	valid: boolean
	errors: string[]
	warnings: string[]
}

// =============================================================================
// Message Types for Webview Communication
// =============================================================================

/**
 * Messages sent from webview to extension
 */
export type OrchestrationWebviewMessage =
	| { type: "getOrchestrationConfig" }
	| { type: "saveOrchestrationConfig"; payload: OrchestrationConfigurationUI }
	| { type: "getRoleDefinitions" }
	| { type: "validateOrchestrationConfig"; payload: OrchestrationConfigurationUI }
	| { type: "getProviderProfiles" }
	| { type: "addProviderProfile"; payload: ProviderProfileUI }
	| { type: "updateProviderProfile"; payload: ProviderProfileUI }
	| { type: "deleteProviderProfile"; payload: { id: string } }

/**
 * Messages received from extension to webview
 */
export type OrchestrationExtensionMessage =
	| { type: "orchestrationConfig"; config: OrchestrationConfigurationUI }
	| { type: "roleDefinitions"; roles: RoleDefinitionUI[] }
	| { type: "orchestrationConfigSaved"; success: boolean }
	| { type: "orchestrationConfigValidation"; result: ConfigurationValidationResult }
	| { type: "providerProfiles"; profiles: ProviderProfileUI[] }
	| { type: "providerProfileSaved"; success: boolean; profile?: ProviderProfileUI }
	| { type: "providerProfileDeleted"; success: boolean }
	| { type: "orchestrationError"; error: string }

// =============================================================================
// Component Props Types
// =============================================================================

/**
 * Props for OrchestrationConfigView component
 */
export interface OrchestrationConfigViewProps {
	/** Initial configuration (passed from parent) */
	initialConfig?: OrchestrationConfigurationUI
	/** Role definitions */
	roleDefinitions?: RoleDefinitionUI[]
	/** Available provider profiles */
	providerProfiles?: ProviderProfileUI[]
	/** Whether the component is in read-only mode */
	readOnly?: boolean
	/** Callback when config is saved */
	onSave?: (config: OrchestrationConfigurationUI) => void
	/** Callback when save is cancelled */
	onCancel?: () => void
	/** Callback when validation is requested */
	onValidate?: (config: OrchestrationConfigurationUI) => void
}

/**
 * Props for RoleAssignmentCard component
 */
export interface RoleAssignmentCardProps {
	role: RoleDefinitionUI
	config: RoleConfigUI
	availableProfiles: ProviderProfileUI[]
	availableModes: string[]
	onToggleEnabled?: (enabled: boolean) => void
	onSelectProfile?: (profileId: string | null) => void
	onSelectMode?: (mode: string) => void
	onChangePriority?: (priority: number) => void
	readOnly?: boolean
}

// =============================================================================
// Workflow Status Types
// =============================================================================

/**
 * Workflow state for UI display
 */
export type WorkflowStateUI =
	| "IDLE"
	| "PLANNING"
	| "PLAN_REVIEW"
	| "PLAN_REVISION"
	| "STRUCTURE_CREATION"
	| "CODE_IMPLEMENTATION"
	| "CODE_REVIEW"
	| "CODE_FIXING"
	| "DOCUMENTATION"
	| "TESTING"
	| "COMPLETED"
	| "PAUSED"
	| "ERROR"

/**
 * Agent status for UI display
 */
export interface AgentStatusUI {
	agentId: string
	roleName: string
	status: "idle" | "starting" | "working" | "waiting" | "completed" | "error" | "terminated"
	currentTask?: string
	progress?: number
	lastUpdate?: number
}

/**
 * Artifact progress for UI display
 */
export interface ArtifactProgressUI {
	id: string
	type: string
	name: string
	status: "pending" | "in_progress" | "completed" | "failed"
	progress: number
}

/**
 * Complete workflow status for UI
 */
export interface WorkflowStatusUI {
	workflowState: WorkflowStateUI
	currentStep: number
	totalSteps: number
	currentStepDescription: string
	progress: number
	agents: AgentStatusUI[]
	artifacts: ArtifactProgressUI[]
	isPaused: boolean
	isRunning: boolean
	startedAt?: number
	lastUpdated?: number
	error?: string
}

/**
 * Props for WorkflowStatusView component
 */
export interface WorkflowStatusViewProps {
	/** Current workflow status */
	status?: WorkflowStatusUI
	/** Whether the component is in read-only mode */
	readOnly?: boolean
	/** Callback when pause is requested */
	onPause?: () => void
	/** Callback when resume is requested */
	onResume?: () => void
	/** Callback when cancel is requested */
	onCancel?: () => void
	/** Callback when retry is requested */
	onRetry?: () => void
}

// =============================================================================
// Agent Status Dashboard Types
// =============================================================================

/**
 * Extended agent status for dashboard display with more details
 */
export interface AgentDashboardStatus {
	agentId: string
	roleId: string
	roleName: string
	providerProfile: string
	mode: string
	status: "idle" | "starting" | "ready" | "busy" | "waiting" | "paused" | "completed" | "error" | "terminated"
	currentTask?: string
	progress?: number
	spawnedAt?: number
	lastActivityAt?: number
	lastHealthCheck?: number
	healthStatus: "healthy" | "unhealthy" | "unknown"
	error?: string
}

/**
 * Dashboard summary statistics
 */
export interface DashboardSummary {
	totalAgents: number
	activeAgents: number
	idleAgents: number
	errorAgents: number
	completedAgents: number
	healthyAgents: number
	unhealthyAgents: number
}

/**
 * Props for AgentStatusDashboard component
 */
export interface AgentStatusDashboardProps {
	/** List of agent statuses */
	agents?: AgentDashboardStatus[]
	/** Dashboard summary statistics */
	summary?: DashboardSummary
	/** Maximum concurrent agents allowed */
	maxConcurrentAgents?: number
	/** Whether the component is in read-only mode */
	readOnly?: boolean
	/** Callback when pause single agent is requested */
	onPauseAgent?: (agentId: string) => void
	/** Callback when resume single agent is requested */
	onResumeAgent?: (agentId: string) => void
	/** Callback when terminate single agent is requested */
	onTerminateAgent?: (agentId: string) => void
	/** Callback when restart single agent is requested */
	onRestartAgent?: (agentId: string) => void
	/** Callback when view agent details is requested */
	onViewAgentDetails?: (agentId: string) => void
}
