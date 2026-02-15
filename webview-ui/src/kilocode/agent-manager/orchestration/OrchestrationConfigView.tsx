/**
 * OrchestrationConfigView Component
 *
 * Main configuration UI component for multi-agent orchestration.
 * Allows users to configure role assignments, provider profiles, and orchestration settings.
 */

import { useState, useEffect, useCallback, HTMLAttributes } from "react"
import { AlertCircle, Check, X, Save, RotateCcw, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { vscode } from "@/utils/vscode"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ToggleSwitch } from "@/components/ui/toggle-switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

import type {
	OrchestrationConfigurationUI,
	RoleDefinitionUI,
	RoleConfigUI,
	ProviderProfileUI,
	ConfigurationValidationResult,
} from "./types"

// kilocode_change - new file
// Import message types as any to bypass strict typing
type _OrchestrationWebviewMessage = {
	type: string
	payload?: unknown
}

type OrchestrationExtensionMessage = {
	type: string
	config?: OrchestrationConfigurationUI
	roles?: RoleDefinitionUI[]
	success?: boolean
	result?: ConfigurationValidationResult
	profiles?: ProviderProfileUI[]
	profile?: ProviderProfileUI
	id?: string
	error?: string
}

/**
 * Default orchestration configuration
 */
const DEFAULT_CONFIG: OrchestrationConfigurationUI = {
	enabled: false,
	maxConcurrentAgents: 5,
	roles: [],
	providerProfiles: [],
	defaultProviderProfileId: null,
}

/**
 * Category display names
 */
const CATEGORY_LABELS: Record<string, string> = {
	coordination: "Coordination",
	planning: "Planning",
	implementation: "Implementation",
	review: "Review",
	documentation: "Documentation",
	testing: "Testing",
}

/**
 * OrchestrationConfigView Component
 */
export const OrchestrationConfigView = ({
	initialConfig,
	roleDefinitions = [],
	providerProfiles = [],
	readOnly = false,
	onSave,
	onCancel,
	onValidate,
	...props
}: {
	initialConfig?: OrchestrationConfigurationUI
	roleDefinitions?: RoleDefinitionUI[]
	providerProfiles?: ProviderProfileUI[]
	readOnly?: boolean
	onSave?: (config: OrchestrationConfigurationUI) => void
	onCancel?: () => void
	onValidate?: (config: OrchestrationConfigurationUI) => void
} & HTMLAttributes<HTMLDivElement>) => {
	const { t: _t } = useAppTranslation()

	// State
	const [config, setConfig] = useState<OrchestrationConfigurationUI>(initialConfig ?? DEFAULT_CONFIG)
	const [loadedRoleDefinitions, setLoadedRoleDefinitions] = useState<RoleDefinitionUI[]>(roleDefinitions)
	const [loadedProviderProfiles, setLoadedProviderProfiles] = useState<ProviderProfileUI[]>(providerProfiles)
	const [validationResult, setValidationResult] = useState<ConfigurationValidationResult | null>(null)
	const [isSaving, setIsSaving] = useState(false)
	const [_isLoading, setIsLoading] = useState(false)
	const [hasChanges, setHasChanges] = useState(false)
	const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set())
	const [showAddProfile, setShowAddProfile] = useState(false)
	const [newProfileName, setNewProfileName] = useState("")

	// Load configuration on mount
	useEffect(() => {
		if (!initialConfig) {
			loadConfiguration()
		}
		if (roleDefinitions.length === 0) {
			loadRoleDefinitions()
		}
		if (providerProfiles.length === 0) {
			loadProviderProfiles()
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Listen for messages from extension
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data as OrchestrationExtensionMessage

			switch (message.type) {
				case "orchestrationConfig":
					if (message.config) {
						setConfig(message.config)
						setHasChanges(false)
					}
					break
				case "roleDefinitions":
					if (message.roles) {
						setLoadedRoleDefinitions(message.roles)
					}
					break
				case "orchestrationConfigSaved":
					setIsSaving(false)
					if (message.success) {
						setHasChanges(false)
						onSave?.(config)
					}
					break
				case "orchestrationConfigValidation":
					if (message.result) {
						setValidationResult(message.result)
					}
					break
				case "providerProfiles":
					if (message.profiles) {
						setLoadedProviderProfiles(message.profiles)
					}
					break
				case "providerProfileSaved":
					if (message.success && message.profile) {
						setLoadedProviderProfiles((prev) => {
							const existing = prev.find((p) => p.id === message.profile!.id)
							if (existing) {
								return prev.map((p) => (p.id === message.profile!.id ? message.profile! : p))
							}
							return [...prev, message.profile!]
						})
					}
					setShowAddProfile(false)
					setNewProfileName("")
					break
				case "providerProfileDeleted":
					if (message.success && message.id) {
						setLoadedProviderProfiles((prev) => prev.filter((p) => p.id !== message.id))
					}
					break
				case "orchestrationError":
					console.error("[OrchestrationConfigView] Error:", message.error)
					break
			}
		}

		window.addEventListener("message", handleMessage)
		return () => window.removeEventListener("message", handleMessage)
	}, [config, onSave])

	// Load configuration from extension
	const loadConfiguration = useCallback(() => {
		setIsLoading(true)
		;(vscode as any).postMessage({ type: "getOrchestrationConfig" })
		setTimeout(() => setIsLoading(false), 500)
	}, [])

	// Load role definitions from extension
	const loadRoleDefinitions = useCallback(() => {
		;(vscode as any).postMessage({ type: "getRoleDefinitions" })
	}, [])

	// Load provider profiles from extension
	const loadProviderProfiles = useCallback(() => {
		;(vscode as any).postMessage({ type: "getProviderProfiles" })
	}, [])

	// Handle config changes
	const updateConfig = useCallback((updates: Partial<OrchestrationConfigurationUI>) => {
		setConfig((prev) => ({ ...prev, ...updates }))
		setHasChanges(true)
		setValidationResult(null)
	}, [])

	// Handle role config changes
	const updateRoleConfig = useCallback((roleId: string, updates: Partial<RoleConfigUI>) => {
		setConfig((prev) => ({
			...prev,
			roles: prev.roles.map((role) => (role.roleId === roleId ? { ...role, ...updates } : role)),
		}))
		setHasChanges(true)
		setValidationResult(null)
	}, [])

	// Initialize role configs from role definitions
	const initializeRoleConfigs = useCallback(() => {
		const roleConfigs: RoleConfigUI[] = loadedRoleDefinitions.map((role) => {
			const existing = config.roles.find((r) => r.roleId === role.id)
			return (
				existing ?? {
					roleId: role.id,
					enabled: role.required,
					providerProfileId: config.defaultProviderProfileId,
					mode: role.defaultMode,
					priority: role.priority,
				}
			)
		})
		updateConfig({ roles: roleConfigs })
	}, [loadedRoleDefinitions, config.defaultProviderProfileId, config.roles, updateConfig])

	// Handle save
	const handleSave = useCallback(() => {
		if (readOnly) return
		setIsSaving(true)
		;(vscode as any).postMessage({
			type: "saveOrchestrationConfig",
			payload: config,
		})
	}, [config, readOnly])

	// Handle cancel
	const handleCancel = useCallback(() => {
		loadConfiguration()
		setHasChanges(false)
		onCancel?.()
	}, [loadConfiguration, onCancel])

	// Handle validate
	const handleValidate = useCallback(() => {
		;(vscode as any).postMessage({
			type: "validateOrchestrationConfig",
			payload: config,
		})
		onValidate?.(config)
	}, [config, onValidate])

	// Handle reset
	const handleReset = useCallback(() => {
		setConfig(DEFAULT_CONFIG)
		setHasChanges(true)
		setValidationResult(null)
	}, [])

	// Toggle role expansion
	const toggleRoleExpanded = useCallback((roleId: string) => {
		setExpandedRoles((prev) => {
			const next = new Set(prev)
			if (next.has(roleId)) {
				next.delete(roleId)
			} else {
				next.add(roleId)
			}
			return next
		})
	}, [])

	// Add new provider profile
	const handleAddProfile = useCallback(() => {
		if (!newProfileName.trim()) return
		const newProfile: ProviderProfileUI = {
			id: `profile-${Date.now()}`,
			name: newProfileName.trim(),
			providerType: "anthropic",
			model: "claude-3-5-sonnet-20241022",
		}
		;(vscode as any).postMessage({
			type: "addProviderProfile",
			payload: newProfile,
		})
	}, [newProfileName])

	// Delete provider profile
	const handleDeleteProfile = useCallback((profileId: string) => {
		;(vscode as any).postMessage({
			type: "deleteProviderProfile",
			payload: { id: profileId },
		})
	}, [])

	// Group roles by category
	const rolesByCategory = loadedRoleDefinitions.reduce(
		(acc, role) => {
			const category = role.category
			if (!acc[category]) {
				acc[category] = []
			}
			acc[category].push(role)
			return acc
		},
		{} as Record<string, RoleDefinitionUI[]>,
	)

	return (
		<div className="orchestration-config-view p-4 space-y-6" {...props}>
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-xl font-semibold">Multi-Agent Orchestration</h2>
					<p className="text-sm text-vscode-descriptionForeground">
						Configure agent roles and provider settings for multi-agent workflows
					</p>
				</div>
			</div>

			{/* Main Toggle */}
			<div className="border border-vscode-input-border rounded-md p-4">
				<div className="flex items-center justify-between">
					<div>
						<h3 className="font-medium">Enable Orchestration</h3>
						<p className="text-sm text-vscode-descriptionForeground">
							Enable multi-agent orchestration to coordinate multiple agents for complex tasks
						</p>
					</div>
					<ToggleSwitch
						checked={config.enabled}
						onChange={() => updateConfig({ enabled: !config.enabled })}
						disabled={readOnly}
						aria-label="Enable orchestration"
					/>
				</div>
			</div>

			{/* Max Concurrent Agents */}
			<div className="border border-vscode-input-border rounded-md p-4">
				<div className="flex items-center justify-between">
					<div>
						<h3 className="font-medium">Max Concurrent Agents</h3>
						<p className="text-sm text-vscode-descriptionForeground">
							Maximum number of agents that can run simultaneously
						</p>
					</div>
					<Input
						type="number"
						min={1}
						max={10}
						value={config.maxConcurrentAgents}
						onChange={(e) => updateConfig({ maxConcurrentAgents: parseInt(e.target.value) || 5 })}
						disabled={readOnly}
						className="w-24"
					/>
				</div>
			</div>

			{/* Provider Profiles */}
			<div className="border border-vscode-input-border rounded-md p-4">
				<div className="flex items-center justify-between mb-4">
					<div>
						<h3 className="font-medium">Provider Profiles</h3>
						<p className="text-sm text-vscode-descriptionForeground">
							Configure AI provider settings for different agents
						</p>
					</div>
					{!readOnly && (
						<Button variant="outline" size="sm" onClick={() => setShowAddProfile(!showAddProfile)}>
							<Plus className="w-4 h-4 mr-1" />
							Add Profile
						</Button>
					)}
				</div>

				{showAddProfile && (
					<div className="flex gap-2 mb-4">
						<Input
							placeholder="Profile name"
							value={newProfileName}
							onChange={(e) => setNewProfileName(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && handleAddProfile()}
							className="flex-1"
						/>
						<Button size="sm" onClick={handleAddProfile}>
							Add
						</Button>
						<Button size="sm" variant="ghost" onClick={() => setShowAddProfile(false)}>
							<X className="w-4 h-4" />
						</Button>
					</div>
				)}

				{loadedProviderProfiles.length === 0 ? (
					<p className="text-vscode-descriptionForeground text-sm">
						No provider profiles configured. Add a profile to assign to roles.
					</p>
				) : (
					<div className="space-y-2">
						{loadedProviderProfiles.map((profile) => (
							<div
								key={profile.id}
								className="flex items-center justify-between p-3 bg-vscode-editor-background rounded-md">
								<div>
									<p className="font-medium">{profile.name}</p>
									<p className="text-xs text-vscode-descriptionForeground">
										{profile.providerType} / {profile.model}
									</p>
								</div>
								{!readOnly && (
									<Button variant="ghost" size="sm" onClick={() => handleDeleteProfile(profile.id)}>
										<Trash2 className="w-4 h-4 text-vscode-errorForeground" />
									</Button>
								)}
							</div>
						))}
					</div>
				)}
			</div>

			{/* Role Configurations */}
			<div className="border border-vscode-input-border rounded-md p-4">
				<div className="flex items-center justify-between mb-4">
					<div>
						<h3 className="font-medium">Role Configurations</h3>
						<p className="text-sm text-vscode-descriptionForeground">
							Configure which roles are enabled and their provider assignments
						</p>
					</div>
					{!readOnly && config.roles.length === 0 && loadedRoleDefinitions.length > 0 && (
						<Button variant="outline" size="sm" onClick={initializeRoleConfigs}>
							Initialize Roles
						</Button>
					)}
				</div>

				{loadedRoleDefinitions.length === 0 ? (
					<p className="text-vscode-descriptionForeground text-sm">Loading role definitions...</p>
				) : (
					<div className="space-y-6">
						{Object.entries(rolesByCategory).map(([category, roles]) => (
							<div key={category}>
								<h4 className="text-sm font-semibold text-vscode-descriptionForeground mb-3">
									{CATEGORY_LABELS[category] || category}
								</h4>
								<div className="space-y-3">
									{roles.map((role) => {
										const roleConfig = config.roles.find((r) => r.roleId === role.id)
										const isExpanded = expandedRoles.has(role.id)
										const isEnabled = roleConfig?.enabled ?? role.required

										return (
											<Collapsible
												key={role.id}
												open={isExpanded}
												onOpenChange={() => toggleRoleExpanded(role.id)}>
												<div className="border rounded-md bg-vscode-editor-background">
													<div className="flex items-center justify-between p-3">
														<div className="flex items-center gap-3">
															<ToggleSwitch
																checked={isEnabled}
																onChange={() =>
																	updateRoleConfig(role.id, { enabled: !isEnabled })
																}
																disabled={readOnly || role.required}
																aria-label={`Enable ${role.name}`}
															/>
															<div>
																<p className="font-medium">
																	{role.name}
																	{role.required && (
																		<span className="text-xs text-vscode-descriptionForeground ml-1">
																			(required)
																		</span>
																	)}
																</p>
																<p className="text-xs text-vscode-descriptionForeground">
																	{role.description}
																</p>
															</div>
														</div>
														<div className="flex items-center gap-2">
															<Select
																value={roleConfig?.providerProfileId ?? ""}
																onValueChange={(value) =>
																	updateRoleConfig(role.id, {
																		providerProfileId: value || null,
																	})
																}
																disabled={readOnly}>
																<SelectTrigger className="w-48">
																	<SelectValue placeholder="Select provider" />
																</SelectTrigger>
																<SelectContent>
																	<SelectItem value="">None</SelectItem>
																	{loadedProviderProfiles.map((profile) => (
																		<SelectItem key={profile.id} value={profile.id}>
																			{profile.name}
																		</SelectItem>
																	))}
																</SelectContent>
															</Select>
															<CollapsibleTrigger asChild>
																<Button variant="ghost" size="sm">
																	{isExpanded ? (
																		<ChevronUp className="w-4 h-4" />
																	) : (
																		<ChevronDown className="w-4 h-4" />
																	)}
																</Button>
															</CollapsibleTrigger>
														</div>
													</div>
													<CollapsibleContent>
														<div className="px-3 pb-3 border-t pt-3 space-y-3">
															{/* Capabilities */}
															<div>
																<h5 className="text-xs font-semibold text-vscode-descriptionForeground mb-2">
																	Capabilities
																</h5>
																<ul className="text-sm space-y-1">
																	{role.capabilities.map((cap) => (
																		<li
																			key={cap.name}
																			className="flex items-start gap-2">
																			<span className="text-vscode-descriptionForeground">
																				•
																			</span>
																			<span>
																				{cap.name}
																				{cap.required && (
																					<span className="text-xs text-vscode-errorForeground ml-1">
																						(required)
																					</span>
																				)}
																			</span>
																			<span className="text-vscode-descriptionForeground text-xs">
																				- {cap.description}
																			</span>
																		</li>
																	))}
																</ul>
															</div>

															{/* Input/Output Artifacts */}
															<div className="grid grid-cols-2 gap-4">
																<div>
																	<h5 className="text-xs font-semibold text-vscode-descriptionForeground mb-1">
																		Input Artifacts
																	</h5>
																	<p className="text-xs text-vscode-descriptionForeground">
																		{role.inputArtifactTypes.join(", ") || "None"}
																	</p>
																</div>
																<div>
																	<h5 className="text-xs font-semibold text-vscode-descriptionForeground mb-1">
																		Output Artifacts
																	</h5>
																	<p className="text-xs text-vscode-descriptionForeground">
																		{role.outputArtifactTypes.join(", ") || "None"}
																	</p>
																</div>
															</div>
														</div>
													</CollapsibleContent>
												</div>
											</Collapsible>
										)
									})}
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			{/* Validation Warnings */}
			{validationResult && !validationResult.valid && (
				<div className="border border-vscode-errorForeground rounded-md p-4">
					<h3 className="font-medium flex items-center gap-2 text-vscode-errorForeground mb-2">
						<AlertCircle className="w-5 h-5" />
						Validation Errors
					</h3>
					<ul className="space-y-1">
						{validationResult.errors.map((error, index) => (
							<li key={index} className="flex items-start gap-2 text-sm text-vscode-errorForeground">
								<X className="w-4 h-4 mt-0.5 flex-shrink-0" />
								{error}
							</li>
						))}
						{validationResult.warnings.map((warning, index) => (
							<li
								key={`warning-${index}`}
								className="flex items-start gap-2 text-sm text-vscode-warningForeground">
								<AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
								{warning}
							</li>
						))}
					</ul>
				</div>
			)}

			{/* Success Message */}
			{validationResult && validationResult.valid && (
				<div className="border border-vscode-symbolsKeywordForeground rounded-md p-4 flex items-center gap-2 text-vscode-symbolsKeywordForeground">
					<Check className="w-5 h-5" />
					Configuration is valid
				</div>
			)}

			{/* Action Buttons */}
			{!readOnly && (
				<div className="flex items-center justify-end gap-3 pt-4 border-t">
					<Button variant="outline" onClick={handleReset}>
						<RotateCcw className="w-4 h-4 mr-2" />
						Reset
					</Button>
					<Button variant="outline" onClick={handleCancel} disabled={!hasChanges}>
						<X className="w-4 h-4 mr-2" />
						Cancel
					</Button>
					<Button variant="outline" onClick={handleValidate} disabled={!hasChanges}>
						<AlertCircle className="w-4 h-4 mr-2" />
						Validate
					</Button>
					<Button onClick={handleSave} disabled={!hasChanges || isSaving}>
						<Save className="w-4 h-4 mr-2" />
						{isSaving ? "Saving..." : "Save"}
					</Button>
				</div>
			)}
		</div>
	)
}

export default OrchestrationConfigView
