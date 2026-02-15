// kilocode_change - new file for orchestration webview message handling
import * as vscode from "vscode"
import type { ClineProvider } from "./ClineProvider"
import {
	getAllRoleDefinitions,
	getDefaultModeForRole,
} from "../../core/kilocode/agent-manager/orchestration/roles/RoleDefinitions"
import type {
	OrchestrationConfigurationUI,
	RoleDefinitionUI,
	ProviderProfileUI,
	ConfigurationValidationResult,
	WorkflowStatusUI,
	AgentDashboardStatus,
	DashboardSummary,
} from "../../../webview-ui/src/kilocode/agent-manager/orchestration/types"
import type {
	OrchestrationConfiguration,
	RoleConfiguration,
	ProviderProfile,
} from "../../core/kilocode/agent-manager/orchestration/roles/RoleRegistry"
import type { OrchestrationConfigService } from "../../services/kilocode/OrchestrationConfigService"

// Singleton instance for OrchestrationConfigService
let orchestrationConfigServiceInstance: OrchestrationConfigService | null = null

/**
 * Get or create the OrchestrationConfigService singleton
 */
async function getOrchestrationConfigService(context: vscode.ExtensionContext): Promise<OrchestrationConfigService> {
	if (!orchestrationConfigServiceInstance) {
		const { OrchestrationConfigService } = await import("../../services/kilocode/OrchestrationConfigService")
		orchestrationConfigServiceInstance = new OrchestrationConfigService(context)
		await orchestrationConfigServiceInstance.initialize()
	}
	return orchestrationConfigServiceInstance
}

/**
 * Convert backend RoleConfiguration to UI format
 */
function roleConfigToUI(config: RoleConfiguration): OrchestrationConfigurationUI["roles"][0] {
	return {
		roleId: config.roleId,
		enabled: config.enabled,
		providerProfileId: config.providerProfileId,
		mode: config.mode,
		priority: config.priority,
	}
}

/**
 * Convert backend ProviderProfile to UI format
 */
function providerProfileToUI(profile: ProviderProfile): ProviderProfileUI {
	return {
		id: profile.id,
		name: profile.name,
		providerType: profile.providerType,
		model: profile.model,
		apiKey: profile.apiKey,
		settings: profile.settings,
	}
}

/**
 * Convert backend OrchestrationConfiguration to UI format
 */
function configToUI(config: OrchestrationConfiguration): OrchestrationConfigurationUI {
	return {
		enabled: config.enabled,
		maxConcurrentAgents: config.maxConcurrentAgents,
		roles: config.roles.map(roleConfigToUI),
		providerProfiles: config.providerProfiles.map(providerProfileToUI),
		defaultProviderProfileId: config.defaultProviderProfileId,
	}
}

/**
 * Convert UI OrchestrationConfiguration to backend format
 */
function configFromUI(uiConfig: OrchestrationConfigurationUI): OrchestrationConfiguration {
	return {
		enabled: uiConfig.enabled,
		maxConcurrentAgents: uiConfig.maxConcurrentAgents,
		roles: uiConfig.roles.map((r) => ({
			roleId: r.roleId,
			enabled: r.enabled,
			providerProfileId: r.providerProfileId,
			mode: r.mode,
			priority: r.priority,
		})),
		providerProfiles: uiConfig.providerProfiles.map((p) => ({
			id: p.id,
			name: p.name,
			providerType: p.providerType,
			model: p.model,
			apiKey: p.apiKey,
			settings: p.settings,
		})),
		defaultProviderProfileId: uiConfig.defaultProviderProfileId,
	}
}

/**
 * Handles orchestration-related webview messages
 * This provides the bridge between the Agent Roles settings UI and the backend services
 */
export const handleOrchestrationMessage = async (
	provider: ClineProvider,
	message: { type: string; payload?: unknown },
): Promise<boolean> => {
	// Helper to post message back to webview
	const postMessage = (msg: unknown) => {
		provider.postMessageToWebview(msg as any)
	}

	// Get the extension context from the provider
	const context = (provider as any).context as vscode.ExtensionContext

	switch (message.type) {
		case "getOrchestrationConfig": {
			try {
				const configService = await getOrchestrationConfigService(context)
				const config = configService.getConfiguration()
				const uiConfig = configToUI(config)
				postMessage({ type: "orchestrationConfig", config: uiConfig })
			} catch (error) {
				console.error("[handleOrchestrationMessage] getOrchestrationConfig error:", error)
				postMessage({ type: "orchestrationError", error: String(error) })
			}
			return true
		}

		case "saveOrchestrationConfig": {
			try {
				const configService = await getOrchestrationConfigService(context)
				const uiConfig = message.payload as OrchestrationConfigurationUI
				const backendConfig = configFromUI(uiConfig)

				// Update configuration via RoleRegistry
				configService.setEnabled(backendConfig.enabled)
				configService.setMaxConcurrentAgents(backendConfig.maxConcurrentAgents)

				// Update role configurations
				for (const roleConfig of backendConfig.roles) {
					configService.updateRoleConfiguration(roleConfig.roleId, roleConfig)
				}

				// Update provider profiles
				for (const profile of backendConfig.providerProfiles) {
					const existingProfile = configService.getProviderProfile(profile.id)
					if (existingProfile) {
						configService.updateProviderProfile(profile.id, profile)
					} else {
						configService.addProviderProfile(profile)
					}
				}

				// Set default provider profile
				configService.setDefaultProviderProfile(backendConfig.defaultProviderProfileId)

				postMessage({ type: "orchestrationConfigSaved", success: true })
			} catch (error) {
				console.error("[handleOrchestrationMessage] saveOrchestrationConfig error:", error)
				postMessage({ type: "orchestrationConfigSaved", success: false })
			}
			return true
		}

		case "getRoleDefinitions": {
			try {
				const roles = getAllRoleDefinitions()
				const uiRoles: RoleDefinitionUI[] = roles.map((role) => ({
					id: role.id,
					name: role.name,
					description: role.description,
					category: role.category,
					required: role.required,
					capabilities: role.capabilities.map((cap: string) => ({
						name: cap,
						description: "",
						required: false,
					})),
					inputArtifactTypes: role.inputArtifacts,
					outputArtifactTypes: role.outputArtifacts,
					defaultMode: getDefaultModeForRole(role.id),
					priority: 0,
				}))
				postMessage({ type: "roleDefinitions", roles: uiRoles })
			} catch (error) {
				console.error("[handleOrchestrationMessage] getRoleDefinitions error:", error)
				postMessage({ type: "orchestrationError", error: String(error) })
			}
			return true
		}

		case "validateOrchestrationConfig": {
			try {
				const configService = await getOrchestrationConfigService(context)
				const result = configService.validateConfiguration()
				postMessage({
					type: "orchestrationConfigValidation",
					result: result as ConfigurationValidationResult,
				})
			} catch (error) {
				console.error("[handleOrchestrationMessage] validateOrchestrationConfig error:", error)
				postMessage({
					type: "orchestrationConfigValidation",
					result: { valid: false, errors: [String(error)], warnings: [] },
				})
			}
			return true
		}

		case "getProviderProfiles": {
			try {
				const configService = await getOrchestrationConfigService(context)
				const profiles = configService.getProviderProfiles()
				const uiProfiles = profiles.map(providerProfileToUI)
				postMessage({ type: "providerProfiles", profiles: uiProfiles })
			} catch (error) {
				console.error("[handleOrchestrationMessage] getProviderProfiles error:", error)
				postMessage({ type: "orchestrationError", error: String(error) })
			}
			return true
		}

		case "addProviderProfile": {
			try {
				const configService = await getOrchestrationConfigService(context)
				const profile = message.payload as ProviderProfileUI
				const newProfile = configService.addProviderProfile({
					name: profile.name,
					providerType: profile.providerType,
					model: profile.model,
					apiKey: profile.apiKey,
					settings: profile.settings,
				})
				postMessage({ type: "providerProfileSaved", success: true, profile: providerProfileToUI(newProfile) })
			} catch (error) {
				console.error("[handleOrchestrationMessage] addProviderProfile error:", error)
				postMessage({ type: "providerProfileSaved", success: false })
			}
			return true
		}

		case "updateProviderProfile": {
			try {
				const configService = await getOrchestrationConfigService(context)
				const profile = message.payload as ProviderProfileUI
				const success = configService.updateProviderProfile(profile.id, {
					name: profile.name,
					providerType: profile.providerType,
					model: profile.model,
					apiKey: profile.apiKey,
					settings: profile.settings,
				})
				postMessage({ type: "providerProfileSaved", success })
			} catch (error) {
				console.error("[handleOrchestrationMessage] updateProviderProfile error:", error)
				postMessage({ type: "providerProfileSaved", success: false })
			}
			return true
		}

		case "deleteProviderProfile": {
			try {
				const configService = await getOrchestrationConfigService(context)
				const payload = message.payload as { id: string }
				const success = configService.deleteProviderProfile(payload.id)
				postMessage({ type: "providerProfileDeleted", success })
			} catch (error) {
				console.error("[handleOrchestrationMessage] deleteProviderProfile error:", error)
				postMessage({ type: "providerProfileDeleted", success: false })
			}
			return true
		}

		case "getWorkflowStatus": {
			try {
				// Get workflow status from the orchestrator if available
				// For now, return a default status indicating no active workflow
				const status: WorkflowStatusUI | null = null
				postMessage({
					type: "workflowStatus",
					status,
				})
			} catch (error) {
				console.error("[handleOrchestrationMessage] getWorkflowStatus error:", error)
				postMessage({ type: "orchestrationError", error: String(error) })
			}
			return true
		}

		case "getAgentStatuses": {
			try {
				// Get agent statuses from the AgentPoolManager if available
				// For now, return empty arrays as the orchestrator is not yet running
				const agents: AgentDashboardStatus[] = []
				const summary: DashboardSummary = {
					totalAgents: 0,
					activeAgents: 0,
					idleAgents: 0,
					errorAgents: 0,
					completedAgents: 0,
					healthyAgents: 0,
					unhealthyAgents: 0,
				}
				postMessage({
					type: "agentStatuses",
					agents,
					summary,
				})
			} catch (error) {
				console.error("[handleOrchestrationMessage] getAgentStatuses error:", error)
				postMessage({ type: "orchestrationError", error: String(error) })
			}
			return true
		}

		case "pauseWorkflow": {
			try {
				// TODO: Implement pause workflow via OrchestratorAgent
				console.log("[handleOrchestrationMessage] pauseWorkflow - not yet implemented")
			} catch (error) {
				console.error("[handleOrchestrationMessage] pauseWorkflow error:", error)
			}
			return true
		}

		case "resumeWorkflow": {
			try {
				// TODO: Implement resume workflow via OrchestratorAgent
				console.log("[handleOrchestrationMessage] resumeWorkflow - not yet implemented")
			} catch (error) {
				console.error("[handleOrchestrationMessage] resumeWorkflow error:", error)
			}
			return true
		}

		case "cancelWorkflow": {
			try {
				// TODO: Implement cancel workflow via OrchestratorAgent
				console.log("[handleOrchestrationMessage] cancelWorkflow - not yet implemented")
			} catch (error) {
				console.error("[handleOrchestrationMessage] cancelWorkflow error:", error)
			}
			return true
		}

		case "retryWorkflow": {
			try {
				// TODO: Implement retry workflow via OrchestratorAgent
				console.log("[handleOrchestrationMessage] retryWorkflow - not yet implemented")
			} catch (error) {
				console.error("[handleOrchestrationMessage] retryWorkflow error:", error)
			}
			return true
		}

		case "pauseAgent": {
			try {
				const payload = message.payload as { agentId: string } | undefined
				if (payload?.agentId) {
					// TODO: Implement pause agent via AgentPoolManager
					console.log(`[handleOrchestrationMessage] pauseAgent: ${payload.agentId} - not yet implemented`)
					postMessage({ type: "agentStatusUpdated", agentId: payload.agentId })
				}
			} catch (error) {
				console.error("[handleOrchestrationMessage] pauseAgent error:", error)
			}
			return true
		}

		case "resumeAgent": {
			try {
				const payload = message.payload as { agentId: string } | undefined
				if (payload?.agentId) {
					// TODO: Implement resume agent via AgentPoolManager
					console.log(`[handleOrchestrationMessage] resumeAgent: ${payload.agentId} - not yet implemented`)
					postMessage({ type: "agentStatusUpdated", agentId: payload.agentId })
				}
			} catch (error) {
				console.error("[handleOrchestrationMessage] resumeAgent error:", error)
			}
			return true
		}

		case "terminateAgent": {
			try {
				const payload = message.payload as { agentId: string } | undefined
				if (payload?.agentId) {
					// TODO: Implement terminate agent via AgentPoolManager
					console.log(`[handleOrchestrationMessage] terminateAgent: ${payload.agentId} - not yet implemented`)
					postMessage({ type: "agentStatusUpdated", agentId: payload.agentId })
				}
			} catch (error) {
				console.error("[handleOrchestrationMessage] terminateAgent error:", error)
			}
			return true
		}

		case "restartAgent": {
			try {
				const payload = message.payload as { agentId: string } | undefined
				if (payload?.agentId) {
					// TODO: Implement restart agent via AgentPoolManager
					console.log(`[handleOrchestrationMessage] restartAgent: ${payload.agentId} - not yet implemented`)
					postMessage({ type: "agentStatusUpdated", agentId: payload.agentId })
				}
			} catch (error) {
				console.error("[handleOrchestrationMessage] restartAgent error:", error)
			}
			return true
		}

		case "viewAgentDetails": {
			try {
				const payload = message.payload as { agentId: string } | undefined
				if (payload?.agentId) {
					// TODO: Implement view agent details - could show a dialog or panel
					console.log(
						`[handleOrchestrationMessage] viewAgentDetails: ${payload.agentId} - not yet implemented`,
					)
				}
			} catch (error) {
				console.error("[handleOrchestrationMessage] viewAgentDetails error:", error)
			}
			return true
		}

		default:
			// Not an orchestration message, return false to indicate it wasn't handled
			return false
	}
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetOrchestrationConfigService(): void {
	orchestrationConfigServiceInstance = null
}

/**
 * Set the singleton instance (for testing with dependency injection)
 */
export function setOrchestrationConfigService(service: OrchestrationConfigService | null): void {
	orchestrationConfigServiceInstance = service
}
