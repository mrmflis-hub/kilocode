/**
 * WorkflowStatusView Component
 *
 * Workflow status visualization component for multi-agent orchestration.
 * Displays current workflow state, step progress, agent statuses, and artifact progress.
 * Provides controls for pause/resume/cancel operations.
 */

import { useState, useEffect, useCallback } from "react"
import {
	Play,
	Pause,
	X,
	RefreshCw,
	CheckCircle2,
	AlertCircle,
	Clock,
	Users,
	FileText,
	ChevronDown,
	ChevronUp,
	Loader2,
} from "lucide-react"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { vscode } from "@/utils/vscode"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

import type {
	WorkflowStatusUI,
	WorkflowStateUI,
	AgentStatusUI,
	ArtifactProgressUI,
	WorkflowStatusViewProps,
} from "./types"

// =============================================================================
// Constants
// =============================================================================

/**
 * Workflow state display names and descriptions
 */
const WORKFLOW_STATE_INFO: Record<WorkflowStateUI, { label: string; description: string; color: string }> = {
	IDLE: { label: "Idle", description: "No workflow active", color: "text-vscode-descriptionForeground" },
	PLANNING: {
		label: "Planning",
		description: "Creating implementation plan",
		color: "text-vscode-progressBar.progressForeground",
	},
	PLAN_REVIEW: { label: "Plan Review", description: "Reviewing implementation plan", color: "text-blue-400" },
	PLAN_REVISION: { label: "Plan Revision", description: "Revising implementation plan", color: "text-yellow-400" },
	STRUCTURE_CREATION: {
		label: "Structure Creation",
		description: "Creating file structure",
		color: "text-purple-400",
	},
	CODE_IMPLEMENTATION: { label: "Code Implementation", description: "Implementing code", color: "text-green-400" },
	CODE_REVIEW: { label: "Code Review", description: "Reviewing code", color: "text-orange-400" },
	CODE_FIXING: { label: "Code Fixing", description: "Fixing code issues", color: "text-red-400" },
	DOCUMENTATION: { label: "Documentation", description: "Writing documentation", color: "text-cyan-400" },
	TESTING: { label: "Testing", description: "Running tests", color: "text-pink-400" },
	COMPLETED: { label: "Completed", description: "Workflow completed successfully", color: "text-green-500" },
	PAUSED: { label: "Paused", description: "Workflow paused", color: "text-yellow-500" },
	ERROR: { label: "Error", description: "Workflow encountered an error", color: "text-red-500" },
}

/**
 * Step labels for workflow progress
 */
const WORKFLOW_STEPS: string[] = [
	"Planning",
	"Plan Review",
	"Structure Creation",
	"Code Implementation",
	"Code Review",
	"Code Fixing",
	"Documentation",
	"Testing",
	"Completed",
]

/**
 * Agent status display configuration
 */
const AGENT_STATUS_CONFIG: Record<AgentStatusUI["status"], { label: string; color: string; icon: string }> = {
	idle: { label: "Idle", color: "bg-vscode-descriptionForeground/20", icon: "○" },
	starting: { label: "Starting", color: "bg-blue-500/20", icon: "◐" },
	working: { label: "Working", color: "bg-green-500/20", icon: "●" },
	waiting: { label: "Waiting", color: "bg-yellow-500/20", icon: "◑" },
	completed: { label: "Completed", color: "bg-green-600/20", icon: "✓" },
	error: { label: "Error", color: "bg-red-500/20", icon: "✕" },
	terminated: { label: "Terminated", color: "bg-gray-500/20", icon: "○" },
}

/**
 * Artifact type display names
 */
const ARTIFACT_TYPE_NAMES: Record<string, string> = {
	user_task: "User Task",
	implementation_plan: "Implementation Plan",
	pseudocode: "Pseudocode",
	code: "Code",
	review_report: "Review Report",
	documentation: "Documentation",
	test_results: "Test Results",
	error_report: "Error Report",
}

/**
 * Default workflow status
 */
const DEFAULT_WORKFLOW_STATUS: WorkflowStatusUI = {
	workflowState: "IDLE",
	currentStep: 0,
	totalSteps: WORKFLOW_STEPS.length,
	currentStepDescription: "No workflow active",
	progress: 0,
	agents: [],
	artifacts: [],
	isPaused: false,
	isRunning: false,
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get step number from workflow state
 */
function getStepFromState(state: WorkflowStateUI): number {
	const stateToStep: Partial<Record<WorkflowStateUI, number>> = {
		IDLE: 0,
		PLANNING: 1,
		PLAN_REVIEW: 2,
		PLAN_REVISION: 2,
		STRUCTURE_CREATION: 3,
		CODE_IMPLEMENTATION: 4,
		CODE_REVIEW: 5,
		CODE_FIXING: 6,
		DOCUMENTATION: 7,
		TESTING: 8,
		COMPLETED: 9,
		PAUSED: -1,
		ERROR: -1,
	}
	return stateToStep[state] ?? 0
}

/**
 * Format timestamp to relative time
 */
function formatRelativeTime(timestamp: number | undefined): string {
	if (!timestamp) return "Never"
	const now = Date.now()
	const diff = now - timestamp

	if (diff < 60000) return "Just now"
	if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
	if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
	return new Date(timestamp).toLocaleDateString()
}

/**
 * Format duration from start timestamp
 */
function formatDuration(startedAt: number | undefined): string {
	if (!startedAt) return "--:--"
	const now = Date.now()
	const diff = now - startedAt

	const minutes = Math.floor(diff / 60000)
	const seconds = Math.floor((diff % 60000) / 1000)

	return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
}

// =============================================================================
// Component
// =============================================================================

/**
 * WorkflowStatusView Component
 *
 * Displays:
 * - Current workflow state with visual indicator
 * - Step progress bar with current step
 * - Agent status cards
 * - Artifact progress list
 * - Control buttons (pause/resume/cancel/retry)
 */
export const WorkflowStatusView = ({
	status,
	readOnly = false,
	onPause,
	onResume,
	onCancel,
	onRetry,
	...props
}: WorkflowStatusViewProps) => {
	const { t } = useAppTranslation()

	// Use provided status or default
	const workflowStatus = status ?? DEFAULT_WORKFLOW_STATUS

	// Internal state for expanded sections
	const [agentsExpanded, setAgentsExpanded] = useState(true)
	const [artifactsExpanded, setArtifactsExpanded] = useState(true)

	// Derived values
	const stateInfo = WORKFLOW_STATE_INFO[workflowStatus.workflowState]
	const stepNumber = getStepFromState(workflowStatus.workflowState)
	const hasAgents = workflowStatus.agents.length > 0
	const hasArtifacts = workflowStatus.artifacts.length > 0
	const canPause = workflowStatus.isRunning && !workflowStatus.isPaused
	const canResume = workflowStatus.isPaused
	const canCancel = workflowStatus.isRunning || workflowStatus.isPaused
	const canRetry = workflowStatus.workflowState === "ERROR"

	// Handle pause
	const handlePause = useCallback(() => {
		if (readOnly) return
		onPause?.()
		// Send message to extension
		;(vscode.postMessage as (message: { type: string }) => void)?.({ type: "pauseWorkflow" })
	}, [readOnly, onPause])

	// Handle resume
	const handleResume = useCallback(() => {
		if (readOnly) return
		onResume?.()
		// Send message to extension
		;(vscode.postMessage as (message: { type: string }) => void)?.({ type: "resumeWorkflow" })
	}, [readOnly, onResume])

	// Handle cancel
	const handleCancel = useCallback(() => {
		if (readOnly) return
		onCancel?.()
		// Send message to extension
		;(vscode.postMessage as (message: { type: string }) => void)?.({ type: "cancelWorkflow" })
	}, [readOnly, onCancel])

	// Handle retry
	const handleRetry = useCallback(() => {
		if (readOnly) return
		onRetry?.()
		// Send message to extension
		;(vscode.postMessage as (message: { type: string }) => void)?.({ type: "retryWorkflow" })
	}, [readOnly, onRetry])

	// Listen for workflow status updates from extension
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data
			if (message?.type === "workflowStatusUpdate") {
				// Status update received from extension - handled by parent
			}
		}

		window.addEventListener("message", handleMessage)
		return () => window.removeEventListener("message", handleMessage)
	}, [])

	return (
		<div
			className="flex flex-col gap-4 p-4 bg-vscode-editor-background border border-vscode-focusBorder rounded-md"
			{...props}>
			{/* Header: State and Controls */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					{/* State Icon */}
					<div
						className={`flex items-center justify-center w-10 h-10 rounded-full ${stateInfo.color.replace("text-", "bg-")}/20`}>
						{workflowStatus.workflowState === "COMPLETED" ? (
							<CheckCircle2 className={`w-6 h-6 ${stateInfo.color}`} />
						) : workflowStatus.workflowState === "ERROR" ? (
							<AlertCircle className={`w-6 h-6 ${stateInfo.color}`} />
						) : workflowStatus.workflowState === "PAUSED" ? (
							<Pause className={`w-6 h-6 ${stateInfo.color}`} />
						) : workflowStatus.isRunning ? (
							<Loader2 className={`w-6 h-6 ${stateInfo.color} animate-spin`} />
						) : (
							<Clock className={`w-6 h-6 ${stateInfo.color}`} />
						)}
					</div>

					{/* State Info */}
					<div>
						<h3 className={`text-lg font-semibold ${stateInfo.color}`}>
							{t(stateInfo.label) || stateInfo.label}
						</h3>
						<p className="text-sm text-vscode-descriptionForeground">
							{t(stateInfo.description) || stateInfo.description}
						</p>
					</div>
				</div>

				{/* Control Buttons */}
				{!readOnly && (
					<div className="flex items-center gap-2">
						{canPause && (
							<Button variant="outline" size="sm" onClick={handlePause} title="Pause Workflow">
								<Pause className="w-4 h-4 mr-1" />
								{t("pause") || "Pause"}
							</Button>
						)}
						{canResume && (
							<Button variant="outline" size="sm" onClick={handleResume} title="Resume Workflow">
								<Play className="w-4 h-4 mr-1" />
								{t("resume") || "Resume"}
							</Button>
						)}
						{canRetry && (
							<Button variant="outline" size="sm" onClick={handleRetry} title="Retry Workflow">
								<RefreshCw className="w-4 h-4 mr-1" />
								{t("retry") || "Retry"}
							</Button>
						)}
						{canCancel && (
							<Button
								variant="outline"
								size="sm"
								onClick={handleCancel}
								title="Cancel Workflow"
								className="text-vscode-errorForeground hover:text-vscode-errorForeground">
								<X className="w-4 h-4 mr-1" />
								{t("cancel") || "Cancel"}
							</Button>
						)}
					</div>
				)}
			</div>

			{/* Progress Bar */}
			<div className="space-y-2">
				<div className="flex items-center justify-between text-sm">
					<span className="text-vscode-descriptionForeground">
						{t("step") || "Step"} {stepNumber >= 0 ? stepNumber + 1 : "-"} / {workflowStatus.totalSteps}
					</span>
					<span className="text-vscode-descriptionForeground">{workflowStatus.progress}%</span>
				</div>
				<Progress value={workflowStatus.progress} className="h-2" />
				<p className="text-sm text-vscode-foreground">{workflowStatus.currentStepDescription}</p>
			</div>

			{/* Duration */}
			{workflowStatus.isRunning && (
				<div className="flex items-center gap-2 text-sm text-vscode-descriptionForeground">
					<Clock className="w-4 h-4" />
					<span>
						{t("duration") || "Duration"}: {formatDuration(workflowStatus.startedAt)}
					</span>
					{workflowStatus.lastUpdated && (
						<span className="text-vscode-descriptionForeground/60">
							({t("lastUpdate") || "Last update"}: {formatRelativeTime(workflowStatus.lastUpdated)})
						</span>
					)}
				</div>
			)}

			{/* Error Message */}
			{workflowStatus.error && (
				<div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-md">
					<AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
					<div>
						<p className="text-sm font-medium text-red-400">{t("workflowError") || "Workflow Error"}</p>
						<p className="text-sm text-vscode-descriptionForeground">{workflowStatus.error}</p>
					</div>
				</div>
			)}

			{/* Agents Section */}
			{hasAgents && (
				<Collapsible open={agentsExpanded} onOpenChange={setAgentsExpanded}>
					<CollapsibleTrigger className="flex items-center gap-2 w-full px-2 py-1.5 text-sm font-medium text-vscode-foreground hover:bg-vscode-editor-hoverBackground rounded">
						{agentsExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
						<Users className="w-4 h-4" />
						{t("agents") || "Agents"} ({workflowStatus.agents.length})
					</CollapsibleTrigger>
					<CollapsibleContent className="space-y-2 mt-2">
						{workflowStatus.agents.map((agent) => (
							<AgentStatusCard key={agent.agentId} agent={agent} />
						))}
					</CollapsibleContent>
				</Collapsible>
			)}

			{/* Artifacts Section */}
			{hasArtifacts && (
				<Collapsible open={artifactsExpanded} onOpenChange={setArtifactsExpanded}>
					<CollapsibleTrigger className="flex items-center gap-2 w-full px-2 py-1.5 text-sm font-medium text-vscode-foreground hover:bg-vscode-editor-hoverBackground rounded">
						{artifactsExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
						<FileText className="w-4 h-4" />
						{t("artifacts") || "Artifacts"} ({workflowStatus.artifacts.length})
					</CollapsibleTrigger>
					<CollapsibleContent className="space-y-2 mt-2">
						{workflowStatus.artifacts.map((artifact) => (
							<ArtifactProgressCard key={artifact.id} artifact={artifact} />
						))}
					</CollapsibleContent>
				</Collapsible>
			)}

			{/* Empty State */}
			{!workflowStatus.isRunning && workflowStatus.workflowState === "IDLE" && (
				<div className="flex flex-col items-center justify-center py-8 text-center">
					<Clock className="w-12 h-12 text-vscode-descriptionForeground/40 mb-3" />
					<p className="text-vscode-descriptionForeground">{t("noActiveWorkflow") || "No active workflow"}</p>
					<p className="text-sm text-vscode-descriptionForeground/60">
						{t("startWorkflowHint") || "Start a workflow to see status here"}
					</p>
				</div>
			)}
		</div>
	)
}

// =============================================================================
// Sub-components
// =============================================================================

/**
 * Agent status card component
 */
function AgentStatusCard({ agent }: { agent: AgentStatusUI }) {
	const statusConfig = AGENT_STATUS_CONFIG[agent.status]

	return (
		<div className="flex items-center justify-between p-3 bg-vscode-editor-background border border-vscode-focusBorder rounded-md">
			<div className="flex items-center gap-3">
				{/* Status Indicator */}
				<div className={`w-3 h-3 rounded-full ${statusConfig.color}`} />

				{/* Agent Info */}
				<div>
					<p className="font-medium text-vscode-foreground">{agent.roleName}</p>
					{agent.currentTask && (
						<p className="text-sm text-vscode-descriptionForeground">{agent.currentTask}</p>
					)}
				</div>
			</div>

			<div className="flex items-center gap-4">
				{/* Status Label */}
				<span className={`text-sm ${statusConfig.color.replace("bg-", "text-").replace("/20", "")}`}>
					{statusConfig.label}
				</span>

				{/* Progress Bar */}
				{agent.progress !== undefined && agent.progress > 0 && (
					<div className="w-24">
						<Progress value={agent.progress} className="h-1.5" />
					</div>
				)}

				{/* Last Update */}
				{agent.lastUpdate && (
					<span className="text-xs text-vscode-descriptionForeground">
						{formatRelativeTime(agent.lastUpdate)}
					</span>
				)}
			</div>
		</div>
	)
}

/**
 * Artifact progress card component
 */
function ArtifactProgressCard({ artifact }: { artifact: ArtifactProgressUI }) {
	const statusColors: Record<ArtifactProgressUI["status"], string> = {
		pending: "text-vscode-descriptionForeground",
		in_progress: "text-blue-400",
		completed: "text-green-400",
		failed: "text-red-400",
	}

	const statusIcons: Record<ArtifactProgressUI["status"], React.ReactNode> = {
		pending: "○",
		in_progress: "◐",
		completed: "✓",
		failed: "✕",
	}

	return (
		<div className="flex items-center justify-between p-3 bg-vscode-editor-background border border-vscode-focusBorder rounded-md">
			<div className="flex items-center gap-3">
				{/* Status Icon */}
				<span className={statusColors[artifact.status]}>{statusIcons[artifact.status]}</span>

				{/* Artifact Info */}
				<div>
					<p className="font-medium text-vscode-foreground">
						{ARTIFACT_TYPE_NAMES[artifact.type] || artifact.type}
					</p>
					<p className="text-sm text-vscode-descriptionForeground">{artifact.name}</p>
				</div>
			</div>

			<div className="flex items-center gap-4">
				{/* Progress Bar */}
				{artifact.progress > 0 && artifact.status !== "completed" && (
					<div className="w-24">
						<Progress value={artifact.progress} className="h-1.5" />
					</div>
				)}

				{/* Progress Percentage */}
				<span className="text-sm text-vscode-descriptionForeground w-12 text-right">{artifact.progress}%</span>
			</div>
		</div>
	)
}

export default WorkflowStatusView
