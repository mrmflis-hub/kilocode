// kilocode_change - new file for Agent Roles settings tab
import { useState, useEffect, useCallback } from "react"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import { vscode } from "@src/utils/vscode"
import { SectionHeader } from "./SectionHeader"
import { Section } from "./Section"
import {
	OrchestrationConfigView,
	WorkflowStatusView,
	AgentStatusDashboard,
} from "@src/kilocode/agent-manager/orchestration"
import type {
	OrchestrationConfigurationUI,
	RoleDefinitionUI,
	ProviderProfileUI,
	ConfigurationValidationResult,
	WorkflowStatusUI,
	AgentDashboardStatus,
	DashboardSummary,
} from "@src/kilocode/agent-manager/orchestration/types"

type AgentRolesTab = "configuration" | "workflow" | "dashboard"

// Helper to post messages with orchestration types
const postOrchestrationMessage = (message: unknown) => {
	vscode.postMessage(message as never)
}

export const AgentRolesSettings = () => {
	const { t } = useAppTranslation()
	const [activeTab, setActiveTab] = useState<AgentRolesTab>("configuration")

	// Configuration state
	const [config, setConfig] = useState<OrchestrationConfigurationUI | null>(null)
	const [roleDefinitions, setRoleDefinitions] = useState<RoleDefinitionUI[]>([])
	const [providerProfiles, setProviderProfiles] = useState<ProviderProfileUI[]>([])
	const [_validationResult, setValidationResult] = useState<ConfigurationValidationResult | null>(null)
	const [isLoading, setIsLoading] = useState(true)
	const [_isSaving, setIsSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)

	// Workflow status state
	const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatusUI | null>(null)

	// Agent dashboard state
	const [agents, setAgents] = useState<AgentDashboardStatus[]>([])
	const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary>({
		totalAgents: 0,
		activeAgents: 0,
		idleAgents: 0,
		errorAgents: 0,
		completedAgents: 0,
		healthyAgents: 0,
		unhealthyAgents: 0,
	})

	// Load initial configuration
	useEffect(() => {
		// Request orchestration config from extension
		postOrchestrationMessage({ type: "getOrchestrationConfig" })
		postOrchestrationMessage({ type: "getRoleDefinitions" })
		postOrchestrationMessage({ type: "getProviderProfiles" })

		// Request workflow and agent status
		postOrchestrationMessage({ type: "getWorkflowStatus" })
		postOrchestrationMessage({ type: "getAgentStatuses" })
	}, [])

	// Handle messages from extension
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data

			switch (message.type) {
				case "orchestrationConfig":
					setConfig(message.config)
					setIsLoading(false)
					break
				case "roleDefinitions":
					setRoleDefinitions(message.roles)
					break
				case "providerProfiles":
					setProviderProfiles(message.profiles)
					break
				case "orchestrationConfigSaved":
					setIsSaving(false)
					if (message.success) {
						// Refresh config after save
						postOrchestrationMessage({ type: "getOrchestrationConfig" })
					} else {
						setError("Failed to save configuration")
					}
					break
				case "orchestrationConfigValidation":
					setValidationResult(message.result)
					break
				case "orchestrationError":
					setError(message.error)
					setIsLoading(false)
					setIsSaving(false)
					break
				case "workflowStatus":
					setWorkflowStatus(message.status)
					break
				case "agentStatuses":
					setAgents(message.agents)
					setDashboardSummary(message.summary)
					break
				case "agentStatusUpdated":
					// Handle individual agent status updates
					postOrchestrationMessage({ type: "getAgentStatuses" })
					break
			}
		}

		window.addEventListener("message", handleMessage)
		return () => window.removeEventListener("message", handleMessage)
	}, [])

	// Handle config save
	const handleSave = useCallback((newConfig: OrchestrationConfigurationUI) => {
		setIsSaving(true)
		setError(null)
		postOrchestrationMessage({
			type: "saveOrchestrationConfig",
			payload: newConfig,
		})
	}, [])

	// Handle config cancel
	const handleCancel = useCallback(() => {
		// Refresh config to discard changes
		postOrchestrationMessage({ type: "getOrchestrationConfig" })
		setValidationResult(null)
	}, [])

	// Handle validation
	const handleValidate = useCallback((newConfig: OrchestrationConfigurationUI) => {
		postOrchestrationMessage({
			type: "validateOrchestrationConfig",
			payload: newConfig,
		})
	}, [])

	// Handle workflow controls
	const handlePauseWorkflow = useCallback(() => {
		postOrchestrationMessage({ type: "pauseWorkflow" })
	}, [])

	const handleResumeWorkflow = useCallback(() => {
		postOrchestrationMessage({ type: "resumeWorkflow" })
	}, [])

	const handleCancelWorkflow = useCallback(() => {
		postOrchestrationMessage({ type: "cancelWorkflow" })
	}, [])

	const handleRetryWorkflow = useCallback(() => {
		postOrchestrationMessage({ type: "retryWorkflow" })
	}, [])

	// Handle agent controls
	const handlePauseAgent = useCallback((agentId: string) => {
		postOrchestrationMessage({ type: "pauseAgent", payload: { agentId } })
	}, [])

	const handleResumeAgent = useCallback((agentId: string) => {
		postOrchestrationMessage({ type: "resumeAgent", payload: { agentId } })
	}, [])

	const handleTerminateAgent = useCallback((agentId: string) => {
		postOrchestrationMessage({ type: "terminateAgent", payload: { agentId } })
	}, [])

	const handleRestartAgent = useCallback((agentId: string) => {
		postOrchestrationMessage({ type: "restartAgent", payload: { agentId } })
	}, [])

	const handleViewAgentDetails = useCallback((agentId: string) => {
		postOrchestrationMessage({ type: "viewAgentDetails", payload: { agentId } })
	}, [])

	// Error display
	if (error) {
		return (
			<div className="p-4">
				<div className="text-vscode-errorForeground">{error}</div>
				<button
					className="mt-2 px-4 py-2 bg-vscode-button-background text-vscode-button-foreground"
					onClick={() => {
						setError(null)
						postOrchestrationMessage({ type: "getOrchestrationConfig" })
					}}>
					{t("common:retry")}
				</button>
			</div>
		)
	}

	return (
		<div>
			<SectionHeader>
				<div className="flex items-center gap-2">
					<span>{t("kilocode:settings.sections.agentRoles")}</span>
				</div>
			</SectionHeader>

			<Section>
				{/* Tab buttons */}
				<div className="flex flex-wrap gap-[1px] px-5 border-b border-vscode-panel-border">
					<button
						className={`px-4 py-2 text-sm border-b-2 cursor-pointer ${
							activeTab === "configuration"
								? "border-vscode-foreground text-vscode-foreground"
								: "border-transparent text-vscode-descriptionForeground hover:text-vscode-foreground"
						}`}
						onClick={() => setActiveTab("configuration")}>
						{t("kilocode:agentManager.tabs.configuration")}
					</button>
					<button
						className={`px-4 py-2 text-sm border-b-2 cursor-pointer ${
							activeTab === "workflow"
								? "border-vscode-foreground text-vscode-foreground"
								: "border-transparent text-vscode-descriptionForeground hover:text-vscode-foreground"
						}`}
						onClick={() => setActiveTab("workflow")}>
						{t("kilocode:agentManager.tabs.workflow")}
					</button>
					<button
						className={`px-4 py-2 text-sm border-b-2 cursor-pointer ${
							activeTab === "dashboard"
								? "border-vscode-foreground text-vscode-foreground"
								: "border-transparent text-vscode-descriptionForeground hover:text-vscode-foreground"
						}`}
						onClick={() => setActiveTab("dashboard")}>
						{t("kilocode:agentManager.tabs.dashboard")}
					</button>
				</div>

				{/* Content */}
				<div className="w-full">
					{isLoading ? (
						<div className="p-4 text-vscode-descriptionForeground">{t("common:loading")}</div>
					) : (
						<>
							{activeTab === "configuration" && (
								<OrchestrationConfigView
									initialConfig={config ?? undefined}
									roleDefinitions={roleDefinitions}
									providerProfiles={providerProfiles}
									onSave={handleSave}
									onCancel={handleCancel}
									onValidate={handleValidate}
								/>
							)}

							{activeTab === "workflow" && (
								<WorkflowStatusView
									status={workflowStatus ?? undefined}
									onPause={handlePauseWorkflow}
									onResume={handleResumeWorkflow}
									onCancel={handleCancelWorkflow}
									onRetry={handleRetryWorkflow}
								/>
							)}

							{activeTab === "dashboard" && (
								<AgentStatusDashboard
									agents={agents}
									summary={dashboardSummary}
									maxConcurrentAgents={config?.maxConcurrentAgents ?? 5}
									onPauseAgent={handlePauseAgent}
									onResumeAgent={handleResumeAgent}
									onTerminateAgent={handleTerminateAgent}
									onRestartAgent={handleRestartAgent}
									onViewAgentDetails={handleViewAgentDetails}
								/>
							)}
						</>
					)}
				</div>
			</Section>
		</div>
	)
}
