/**
 * AgentStatusDashboard Component
 *
 * Agent status dashboard component for multi-agent orchestration.
 * Displays all active agents with their health, status, and activity.
 * Provides controls for individual agent management (pause/resume/terminate).
 */

import { useState, useEffect, useCallback, useMemo } from "react"
import {
	Play,
	Pause,
	X,
	RefreshCw,
	Eye,
	Activity,
	AlertCircle,
	CheckCircle2,
	Clock,
	Server,
	Users,
	MoreVertical,
	Heart,
	XCircle,
	HelpCircle,
} from "lucide-react"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { vscode } from "@/utils/vscode"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

import type { AgentDashboardStatus, DashboardSummary, AgentStatusDashboardProps } from "./types"

// =============================================================================
// Constants
// =============================================================================

/**
 * Agent status display configuration
 */
const DASHBOARD_STATUS_CONFIG: Record<
	AgentDashboardStatus["status"],
	{
		label: string
		color: string
		bgColor: string
		icon: React.ReactNode
	}
> = {
	idle: {
		label: "Idle",
		color: "text-vscode-descriptionForeground",
		bgColor: "bg-vscode-descriptionForeground/20",
		icon: <Clock className="w-4 h-4" />,
	},
	starting: {
		label: "Starting",
		color: "text-blue-400",
		bgColor: "bg-blue-500/20",
		icon: <RefreshCw className="w-4 h-4 animate-spin" />,
	},
	ready: {
		label: "Ready",
		color: "text-green-400",
		bgColor: "bg-green-500/20",
		icon: <CheckCircle2 className="w-4 h-4" />,
	},
	busy: {
		label: "Busy",
		color: "text-green-500",
		bgColor: "bg-green-600/20",
		icon: <Activity className="w-4 h-4" />,
	},
	waiting: {
		label: "Waiting",
		color: "text-yellow-400",
		bgColor: "bg-yellow-500/20",
		icon: <Clock className="w-4 h-4" />,
	},
	paused: {
		label: "Paused",
		color: "text-orange-400",
		bgColor: "bg-orange-500/20",
		icon: <Pause className="w-4 h-4" />,
	},
	completed: {
		label: "Completed",
		color: "text-green-600",
		bgColor: "bg-green-700/20",
		icon: <CheckCircle2 className="w-4 h-4" />,
	},
	error: {
		label: "Error",
		color: "text-red-400",
		bgColor: "bg-red-500/20",
		icon: <AlertCircle className="w-4 h-4" />,
	},
	terminated: {
		label: "Terminated",
		color: "text-gray-400",
		bgColor: "bg-gray-500/20",
		icon: <XCircle className="w-4 h-4" />,
	},
}

/**
 * Health status display configuration
 */
const HEALTH_STATUS_CONFIG: Record<
	AgentDashboardStatus["healthStatus"],
	{
		label: string
		color: string
		icon: React.ReactNode
	}
> = {
	healthy: {
		label: "Healthy",
		color: "text-green-400",
		icon: <Heart className="w-3 h-3 fill-current" />,
	},
	unhealthy: {
		label: "Unhealthy",
		color: "text-red-400",
		icon: <AlertCircle className="w-3 h-3" />,
	},
	unknown: {
		label: "Unknown",
		color: "text-gray-400",
		icon: <HelpCircle className="w-3 h-3" />,
	},
}

/**
 * Role display names
 */
const ROLE_DISPLAY_NAMES: Record<string, string> = {
	organiser: "Organiser",
	architect: "Architect",
	"primary-coder": "Primary Coder",
	"secondary-coder": "Secondary Coder",
	"code-sceptic": "Code Sceptic",
	"documentation-writer": "Documentation Writer",
	debugger: "Debugger",
}

/**
 * Default dashboard summary
 */
const DEFAULT_DASHBOARD_SUMMARY: DashboardSummary = {
	totalAgents: 0,
	activeAgents: 0,
	idleAgents: 0,
	errorAgents: 0,
	completedAgents: 0,
	healthyAgents: 0,
	unhealthyAgents: 0,
}

// =============================================================================
// Helper Functions
// =============================================================================

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

/**
 * Calculate dashboard summary from agent list
 */
function calculateSummary(agents: AgentDashboardStatus[]): DashboardSummary {
	return agents.reduce(
		(summary, agent) => {
			summary.totalAgents++

			// Count by status
			if (agent.status === "busy" || agent.status === "ready" || agent.status === "starting") {
				summary.activeAgents++
			} else if (agent.status === "idle" || agent.status === "waiting") {
				summary.idleAgents++
			} else if (agent.status === "error") {
				summary.errorAgents++
			} else if (agent.status === "completed") {
				summary.completedAgents++
			}

			// Count by health
			if (agent.healthStatus === "healthy") {
				summary.healthyAgents++
			} else if (agent.healthStatus === "unhealthy") {
				summary.unhealthyAgents++
			}

			return summary
		},
		{ ...DEFAULT_DASHBOARD_SUMMARY },
	)
}

// =============================================================================
// Component
// =============================================================================

/**
 * AgentStatusDashboard Component
 *
 * Displays:
 * - Dashboard summary (total, active, idle, error counts)
 * - Agent list with detailed status
 * - Health indicators for each agent
 * - Individual agent controls (pause/resume/terminate/view)
 */
export const AgentStatusDashboard = ({
	agents = [],
	summary: providedSummary,
	maxConcurrentAgents = 5,
	readOnly = false,
	onPauseAgent,
	onResumeAgent,
	onTerminateAgent,
	onRestartAgent,
	onViewAgentDetails,
	...props
}: AgentStatusDashboardProps) => {
	const { t } = useAppTranslation()

	// Calculate summary from agents if not provided
	const summary = useMemo(() => {
		if (providedSummary) return providedSummary
		return calculateSummary(agents)
	}, [providedSummary, agents])

	// Internal state for expanded sections
	const [agentsExpanded, setAgentsExpanded] = useState(true)
	const [_selectedAgent, _setSelectedAgent] = useState<string | null>(null)

	// Derived values
	const hasAgents = agents.length > 0
	const capacityUsed = summary.activeAgents
	const capacityPercentage = Math.round((capacityUsed / maxConcurrentAgents) * 100)

	// Handle pause agent
	const handlePauseAgent = useCallback(
		(agentId: string) => {
			if (readOnly) return
			onPauseAgent?.(agentId)
			// Send message to extension
			;(vscode.postMessage as (message: { type: string; payload?: { agentId: string } }) => void)?.({
				type: "pauseAgent",
				payload: { agentId },
			})
		},
		[readOnly, onPauseAgent],
	)

	// Handle resume agent
	const handleResumeAgent = useCallback(
		(agentId: string) => {
			if (readOnly) return
			onResumeAgent?.(agentId)
			// Send message to extension
			;(vscode.postMessage as (message: { type: string; payload?: { agentId: string } }) => void)?.({
				type: "resumeAgent",
				payload: { agentId },
			})
		},
		[readOnly, onResumeAgent],
	)

	// Handle terminate agent
	const handleTerminateAgent = useCallback(
		(agentId: string) => {
			if (readOnly) return
			onTerminateAgent?.(agentId)
			// Send message to extension
			;(vscode.postMessage as (message: { type: string; payload?: { agentId: string } }) => void)?.({
				type: "terminateAgent",
				payload: { agentId },
			})
		},
		[readOnly, onTerminateAgent],
	)

	// Handle restart agent
	const handleRestartAgent = useCallback(
		(agentId: string) => {
			if (readOnly) return
			onRestartAgent?.(agentId)
			// Send message to extension
			;(vscode.postMessage as (message: { type: string; payload?: { agentId: string } }) => void)?.({
				type: "restartAgent",
				payload: { agentId },
			})
		},
		[readOnly, onRestartAgent],
	)

	// Handle view agent details
	const handleViewAgentDetails = useCallback(
		(agentId: string) => {
			onViewAgentDetails?.(agentId)
			// Send message to extension
			;(vscode.postMessage as (message: { type: string; payload?: { agentId: string } }) => void)?.({
				type: "viewAgentDetails",
				payload: { agentId },
			})
		},
		[onViewAgentDetails],
	)

	// Listen for agent status updates from extension
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data
			if (message?.type === "agentStatusUpdate") {
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
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-500/20">
						<Server className="w-6 h-6 text-blue-400" />
					</div>
					<div>
						<h3 className="text-lg font-semibold text-vscode-foreground">
							{t("agentDashboard") || "Agent Dashboard"}
						</h3>
						<p className="text-sm text-vscode-descriptionForeground">
							{t("agentDashboardDescription") || "Manage and monitor active agents"}
						</p>
					</div>
				</div>
			</div>

			{/* Summary Cards */}
			<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
				<SummaryCard
					icon={<Users className="w-5 h-5" />}
					label={t("totalAgents") || "Total Agents"}
					value={summary.totalAgents}
					color="text-vscode-foreground"
				/>
				<SummaryCard
					icon={<Activity className="w-5 h-5" />}
					label={t("active") || "Active"}
					value={summary.activeAgents}
					color="text-green-400"
				/>
				<SummaryCard
					icon={<AlertCircle className="w-5 h-5" />}
					label={t("errors") || "Errors"}
					value={summary.errorAgents}
					color="text-red-400"
				/>
				<SummaryCard
					icon={<Heart className="w-5 h-5" />}
					label={t("healthy") || "Healthy"}
					value={summary.healthyAgents}
					color="text-green-400"
				/>
			</div>

			{/* Capacity Bar */}
			<div className="space-y-2">
				<div className="flex items-center justify-between text-sm">
					<span className="text-vscode-descriptionForeground">{t("agentCapacity") || "Agent Capacity"}</span>
					<span className="text-vscode-descriptionForeground">
						{capacityUsed} / {maxConcurrentAgents} ({capacityPercentage}%)
					</span>
				</div>
				<Progress value={capacityPercentage} className="h-2" />
			</div>

			{/* Agents List */}
			{hasAgents ? (
				<div className="space-y-2">
					<button
						onClick={() => setAgentsExpanded(!agentsExpanded)}
						className="flex items-center gap-2 w-full px-2 py-1.5 text-sm font-medium text-vscode-foreground hover:bg-vscode-editor-hoverBackground rounded">
						{agentsExpanded ? (
							<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
							</svg>
						) : (
							<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
							</svg>
						)}
						<Users className="w-4 h-4" />
						{t("activeAgents") || "Active Agents"} ({agents.length})
					</button>

					{agentsExpanded && (
						<div className="space-y-2 mt-2">
							{agents.map((agent) => (
								<AgentDashboardCard
									key={agent.agentId}
									agent={agent}
									readOnly={readOnly}
									onPause={() => handlePauseAgent(agent.agentId)}
									onResume={() => handleResumeAgent(agent.agentId)}
									onTerminate={() => handleTerminateAgent(agent.agentId)}
									onRestart={() => handleRestartAgent(agent.agentId)}
									onViewDetails={() => handleViewAgentDetails(agent.agentId)}
								/>
							))}
						</div>
					)}
				</div>
			) : (
				/* Empty State */
				<div className="flex flex-col items-center justify-center py-8 text-center">
					<Server className="w-12 h-12 text-vscode-descriptionForeground/40 mb-3" />
					<p className="text-vscode-descriptionForeground">{t("noActiveAgents") || "No active agents"}</p>
					<p className="text-sm text-vscode-descriptionForeground/60">
						{t("startWorkflowToSeeAgents") || "Start a workflow to see agents here"}
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
 * Summary card component
 */
function SummaryCard({
	icon,
	label,
	value,
	color,
}: {
	icon: React.ReactNode
	label: string
	value: number
	color: string
}) {
	return (
		<div className="flex items-center gap-3 p-3 bg-vscode-editor-background border border-vscode-focusBorder rounded-md">
			<div className={`${color}`}>{icon}</div>
			<div>
				<p className="text-lg font-semibold text-vscode-foreground">{value}</p>
				<p className="text-xs text-vscode-descriptionForeground">{label}</p>
			</div>
		</div>
	)
}

/**
 * Agent dashboard card component
 */
function AgentDashboardCard({
	agent,
	readOnly,
	onPause,
	onResume,
	onTerminate,
	onRestart,
	onViewDetails,
}: {
	agent: AgentDashboardStatus
	readOnly: boolean
	onPause: () => void
	onResume: () => void
	onTerminate: () => void
	onRestart: () => void
	onViewDetails: () => void
}) {
	const { t } = useAppTranslation()
	const statusConfig = DASHBOARD_STATUS_CONFIG[agent.status]
	const healthConfig = HEALTH_STATUS_CONFIG[agent.healthStatus]
	const roleName = ROLE_DISPLAY_NAMES[agent.roleId] || agent.roleName

	// Determine if agent can be paused/resumed
	const canPause = agent.status === "busy" || agent.status === "ready"
	const canResume = agent.status === "paused"
	const canTerminate = agent.status !== "terminated" && agent.status !== "completed"
	const canRestart = agent.status === "error" || agent.status === "terminated" || agent.status === "completed"

	return (
		<div className="p-3 bg-vscode-editor-background border border-vscode-focusBorder rounded-md">
			<div className="flex items-center justify-between">
				{/* Left: Agent Info */}
				<div className="flex items-center gap-3">
					{/* Status Indicator */}
					<div className={`flex items-center justify-center w-8 h-8 rounded-full ${statusConfig.bgColor}`}>
						{statusConfig.icon}
					</div>

					{/* Agent Details */}
					<div>
						<div className="flex items-center gap-2">
							<p className="font-medium text-vscode-foreground">{roleName}</p>
							<span
								className={`text-xs px-1.5 py-0.5 rounded ${statusConfig.bgColor} ${statusConfig.color}`}>
								{statusConfig.label}
							</span>
						</div>
						<div className="flex items-center gap-2 text-xs text-vscode-descriptionForeground">
							<span>{agent.mode}</span>
							<span>•</span>
							<span>{agent.providerProfile || "Default"}</span>
							{agent.spawnedAt && (
								<>
									<span>•</span>
									<span>{formatDuration(agent.spawnedAt)}</span>
								</>
							)}
						</div>
					</div>
				</div>

				{/* Right: Controls */}
				<div className="flex items-center gap-3">
					{/* Health Status */}
					<div className={`flex items-center gap-1 text-xs ${healthConfig.color}`}>
						{healthConfig.icon}
						<span>{healthConfig.label}</span>
					</div>

					{/* Progress Bar */}
					{agent.progress !== undefined && agent.progress > 0 && (
						<div className="w-20">
							<Progress value={agent.progress} className="h-1.5" />
						</div>
					)}

					{/* Last Activity */}
					{agent.lastActivityAt && (
						<span className="text-xs text-vscode-descriptionForeground">
							{formatRelativeTime(agent.lastActivityAt)}
						</span>
					)}

					{/* Action Buttons */}
					{!readOnly && (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="ghost" size="sm" className="h-8 w-8 p-0">
									<MoreVertical className="w-4 h-4" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent
								align="end"
								className="bg-vscode-editor-background border-vscode-focusBorder">
								<DropdownMenuItem
									onClick={onViewDetails}
									className="flex items-center gap-2 cursor-pointer focus:bg-vscode-editor-hoverBackground">
									<Eye className="w-4 h-4" />
									{t("viewDetails") || "View Details"}
								</DropdownMenuItem>
								{canPause && (
									<DropdownMenuItem
										onClick={onPause}
										className="flex items-center gap-2 cursor-pointer focus:bg-vscode-editor-hoverBackground">
										<Pause className="w-4 h-4" />
										{t("pause") || "Pause"}
									</DropdownMenuItem>
								)}
								{canResume && (
									<DropdownMenuItem
										onClick={onResume}
										className="flex items-center gap-2 cursor-pointer focus:bg-vscode-editor-hoverBackground">
										<Play className="w-4 h-4" />
										{t("resume") || "Resume"}
									</DropdownMenuItem>
								)}
								{canRestart && (
									<DropdownMenuItem
										onClick={onRestart}
										className="flex items-center gap-2 cursor-pointer focus:bg-vscode-editor-hoverBackground">
										<RefreshCw className="w-4 h-4" />
										{t("restart") || "Restart"}
									</DropdownMenuItem>
								)}
								{canTerminate && (
									<DropdownMenuItem
										onClick={onTerminate}
										className="flex items-center gap-2 cursor-pointer focus:bg-vscode-editor-hoverBackground text-red-400">
										<X className="w-4 h-4" />
										{t("terminate") || "Terminate"}
									</DropdownMenuItem>
								)}
							</DropdownMenuContent>
						</DropdownMenu>
					)}
				</div>
			</div>

			{/* Current Task */}
			{agent.currentTask && (
				<div className="mt-2 pl-11">
					<p className="text-sm text-vscode-descriptionForeground">
						{t("currentTask") || "Current Task"}: {agent.currentTask}
					</p>
				</div>
			)}

			{/* Error Message */}
			{agent.error && (
				<div className="mt-2 pl-11 flex items-start gap-2 text-sm text-red-400">
					<AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
					<span>{agent.error}</span>
				</div>
			)}
		</div>
	)
}

export default AgentStatusDashboard
