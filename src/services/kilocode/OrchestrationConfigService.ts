// kilocode_change - new file
/**
 * OrchestrationConfigService
 *
 * Centralized configuration management for multi-agent orchestration.
 * Handles role-to-provider configuration, validation, and persistence.
 * Integrates with ContextProxy for storage and ProviderSettingsManager for provider access.
 */

import { EventEmitter } from "events"
import type { ExtensionContext } from "vscode"
import type { ProviderSettingsWithId } from "@roo-code/types"
import {
	RoleRegistry,
	RoleConfiguration,
	ProviderProfile,
	OrchestrationConfiguration,
	DEFAULT_ORCHESTRATION_CONFIG,
} from "../../core/kilocode/agent-manager/orchestration/roles/RoleRegistry"
import {
	getOrchestratorRoleDefinition,
	getDefaultModeForRole,
} from "../../core/kilocode/agent-manager/orchestration/roles/RoleDefinitions"
import type { OrchestratorRoleDefinition } from "../../core/kilocode/agent-manager/orchestration/roles/RoleDefinitions"

/**
 * Storage keys for orchestration configuration
 */
const STORAGE_KEYS = {
	ORCHESTRATION_CONFIG: "kilocode_orchestration_config",
	ROLE_CONFIGURATIONS: "kilocode_role_configurations",
	PROVIDER_PROFILES: "kilocode_provider_profiles",
} as const

/**
 * Validation result interface
 */
export interface ConfigurationValidationResult {
	valid: boolean
	errors: string[]
	warnings: string[]
}

/**
 * Provider settings extracted for agent spawning
 */
export interface AgentProviderSettings {
	profileId: string
	profileName: string
	providerType: string
	model: string
	apiKey?: string
	settings: Record<string, unknown>
}

/**
 * Role-to-provider mapping entry
 */
export interface RoleProviderMapping {
	roleId: string
	providerProfileId: string | null
	mode: string
	priority: number
}

/**
 * OrchestrationConfigService events
 */
export interface OrchestrationConfigServiceEvents {
	configChanged: [OrchestrationConfiguration]
	roleConfigChanged: [RoleConfiguration]
	providerProfileChanged: [ProviderProfile]
	validationResult: [ConfigurationValidationResult]
}

/**
 * Extended provider profile with all possible settings
 */
interface ExtendedProviderSettings {
	id?: string
	apiKey?: string
	apiProvider?: string
	apiModelId?: string
	apiBaseUrl?: string
	apiVersion?: string
	temperature?: number
	maxTokens?: number
	maxCompletionTokens?: number
	thinking?: boolean
	thinkingBudgetTokens?: number
	enableEcho?: boolean
	frequencyPenalty?: number
	presencePenalty?: number
	topP?: number
	topK?: number
	seed?: number
	diffEnabled?: boolean
	fuzzyMatchThreshold?: number
	rateLimitSeconds?: number
	consecutiveMistakeLimit?: number
	todoListEnabled?: boolean
	openAiHeaders?: Record<string, string>
	[key: string]: unknown
}

/**
 * OrchestrationConfigService - Centralized configuration management
 *
 * Key Responsibilities:
 * - Load and persist orchestration configuration via ContextProxy
 * - Validate role-to-provider mappings
 * - Provide provider settings for agent spawning
 * - Integrate with RoleRegistry for role configuration
 * - Emit events on configuration changes
 */
export class OrchestrationConfigService extends EventEmitter {
	private readonly context: ExtensionContext
	private readonly roleRegistry: RoleRegistry
	private readonly configKey: string
	private initialized = false
	private initializationPromise: Promise<void> | null = null

	constructor(
		context: ExtensionContext,
		roleRegistry?: RoleRegistry,
		configKey: string = STORAGE_KEYS.ORCHESTRATION_CONFIG,
	) {
		super()
		this.context = context
		this.roleRegistry = roleRegistry ?? new RoleRegistry()
		this.configKey = configKey
	}

	/**
	 * Initialize the service by loading configuration from storage
	 */
	async initialize(): Promise<void> {
		if (this.initialized) {
			return
		}

		if (this.initializationPromise) {
			return this.initializationPromise
		}

		this.initializationPromise = this.doInitialize()
		await this.initializationPromise
		this.initialized = true
	}

	private async doInitialize(): Promise<void> {
		try {
			// Load stored configuration
			const storedConfig = await this.context.globalState.get<string>(this.configKey)

			if (storedConfig) {
				try {
					const parsedConfig = JSON.parse(storedConfig) as Partial<OrchestrationConfiguration>
					this.roleRegistry.loadConfiguration(parsedConfig)
				} catch (parseError) {
					console.error("[OrchestrationConfigService] Failed to parse stored configuration:", parseError)
					// Use default configuration
				}
			}

			// Set up listener for configuration changes
			this.roleRegistry.onConfigChange((config) => {
				this.persistConfiguration(config)
				this.emit("configChanged", config)
			})

			console.log("[OrchestrationConfigService] Initialized successfully")
		} catch (error) {
			console.error("[OrchestrationConfigService] Initialization failed:", error)
			throw error
		}
	}

	/**
	 * Persist configuration to storage
	 */
	private async persistConfiguration(config: OrchestrationConfiguration): Promise<void> {
		try {
			const configJson = JSON.stringify(config)
			await this.context.globalState.update(this.configKey, configJson)
		} catch (error) {
			console.error("[OrchestrationConfigService] Failed to persist configuration:", error)
		}
	}

	// ============================================================================
	// Configuration Access Methods
	// ============================================================================

	/**
	 * Get full orchestration configuration
	 */
	getConfiguration(): OrchestrationConfiguration {
		return this.roleRegistry.getConfiguration()
	}

	/**
	 * Check if orchestration is enabled
	 */
	isEnabled(): boolean {
		return this.roleRegistry.isEnabled()
	}

	/**
	 * Enable or disable orchestration
	 */
	setEnabled(enabled: boolean): void {
		this.roleRegistry.setEnabled(enabled)
	}

	/**
	 * Get maximum concurrent agents setting
	 */
	getMaxConcurrentAgents(): number {
		return this.roleRegistry.getMaxConcurrentAgents()
	}

	/**
	 * Set maximum concurrent agents
	 */
	setMaxConcurrentAgents(count: number): void {
		this.roleRegistry.setMaxConcurrentAgents(count)
	}

	// ============================================================================
	// Role Configuration Methods
	// ============================================================================

	/**
	 * Get all role configurations
	 */
	getRoleConfigurations(): RoleConfiguration[] {
		return this.roleRegistry.getRoleConfigurations()
	}

	/**
	 * Get role configuration by role ID
	 */
	getRoleConfiguration(roleId: string): RoleConfiguration | undefined {
		return this.roleRegistry.getRoleConfiguration(roleId)
	}

	/**
	 * Update role configuration
	 */
	updateRoleConfiguration(roleId: string, updates: Partial<RoleConfiguration>): boolean {
		return this.roleRegistry.updateRoleConfiguration(roleId, updates)
	}

	/**
	 * Enable or disable a role
	 */
	setRoleEnabled(roleId: string, enabled: boolean): boolean {
		return this.roleRegistry.setRoleEnabled(roleId, enabled)
	}

	/**
	 * Set provider profile for a role
	 */
	setRoleProviderProfile(roleId: string, providerProfileId: string | null): boolean {
		return this.roleRegistry.setRoleProviderProfile(roleId, providerProfileId)
	}

	/**
	 * Set mode for a role
	 */
	setRoleMode(roleId: string, mode: string): boolean {
		return this.roleRegistry.setRoleMode(roleId, mode)
	}

	/**
	 * Get all enabled roles
	 */
	getEnabledRoles(): RoleConfiguration[] {
		return this.roleRegistry.getEnabledRoles()
	}

	/**
	 * Get mode for a role (from config or default)
	 */
	getModeForRole(roleId: string): string {
		return this.roleRegistry.getModeForRole(roleId)
	}

	/**
	 * Get priority for a role
	 */
	getPriorityForRole(roleId: string): number {
		return this.roleRegistry.getPriorityForRole(roleId)
	}

	/**
	 * Get role definition by ID
	 */
	getRoleDefinition(roleId: string) {
		return this.roleRegistry.getRoleDefinition(roleId)
	}

	/**
	 * Get all role definitions
	 */
	getAllRoleDefinitions() {
		return this.roleRegistry.getAllRoleDefinitions()
	}

	// ============================================================================
	// Provider Profile Methods
	// ============================================================================

	/**
	 * Get all provider profiles
	 */
	getProviderProfiles(): ProviderProfile[] {
		return this.roleRegistry.getProviderProfiles()
	}

	/**
	 * Get provider profile by ID
	 */
	getProviderProfile(id: string): ProviderProfile | undefined {
		return this.roleRegistry.getProviderProfile(id)
	}

	/**
	 * Add a provider profile
	 */
	addProviderProfile(profile: Omit<ProviderProfile, "id">): ProviderProfile {
		return this.roleRegistry.addProviderProfile(profile)
	}

	/**
	 * Update a provider profile
	 */
	updateProviderProfile(id: string, updates: Partial<ProviderProfile>): boolean {
		return this.roleRegistry.updateProviderProfile(id, updates)
	}

	/**
	 * Delete a provider profile
	 */
	deleteProviderProfile(id: string): boolean {
		return this.roleRegistry.deleteProviderProfile(id)
	}

	/**
	 * Get provider profile for a specific role
	 */
	getProviderProfileForRole(roleId: string): ProviderProfile | null {
		return this.roleRegistry.getProviderProfileForRole(roleId)
	}

	/**
	 * Set default provider profile
	 */
	setDefaultProviderProfile(profileId: string | null): boolean {
		return this.roleRegistry.setDefaultProviderProfile(profileId)
	}

	/**
	 * Get default provider profile
	 */
	getDefaultProviderProfile(): ProviderProfile | undefined {
		const config = this.getConfiguration()
		if (config.defaultProviderProfileId) {
			return this.getProviderProfile(config.defaultProviderProfileId)
		}
		return undefined
	}

	// ============================================================================
	// Provider Settings Integration (for AgentPoolManager)
	// ============================================================================

	/**
	 * Get provider settings for agent spawning
	 * Returns settings compatible with AgentRuntime
	 */
	async getProviderSettingsForRole(
		roleId: string,
		providerSettingsManager: {
			getProfile: (params: { id: string }) => Promise<ProviderSettingsWithId & { name: string }>
		},
	): Promise<AgentProviderSettings | null> {
		const roleConfig = this.getRoleConfiguration(roleId)
		if (!roleConfig) {
			return null
		}

		let profileId = roleConfig.providerProfileId
		if (!profileId) {
			// Fall back to default provider profile
			const defaultProfile = this.getDefaultProviderProfile()
			if (defaultProfile) {
				profileId = defaultProfile.id
			}
		}

		if (!profileId) {
			return null
		}

		try {
			const profile = await providerSettingsManager.getProfile({ id: profileId })

			// Handle potentially undefined values with fallbacks
			const providerType = profile.apiProvider ?? ""
			const modelId = profile.apiModelId ?? ""

			return {
				profileId: profile.id ?? "",
				profileName: profile.name,
				providerType,
				model: modelId,
				apiKey: profile.apiKey,
				settings: this.extractProviderSettings(profile),
			}
		} catch (error) {
			console.error(`[OrchestrationConfigService] Failed to get provider settings for role ${roleId}:`, error)
			return null
		}
	}

	/**
	 * Extract relevant settings from provider profile
	 * Casts profile to ExtendedProviderSettings to access all possible properties
	 */
	private extractProviderSettings(profile: ProviderSettingsWithId & { name: string }): Record<string, unknown> {
		// Cast to ExtendedProviderSettings to access all possible properties
		const extProfile = profile as unknown as ExtendedProviderSettings

		// Define the keys we want to extract
		const keysToExtract: (keyof ExtendedProviderSettings)[] = [
			"apiProvider",
			"apiModelId",
			"apiBaseUrl",
			"apiVersion",
			"temperature",
			"maxTokens",
			"maxCompletionTokens",
			"thinking",
			"thinkingBudgetTokens",
			"enableEcho",
			"frequencyPenalty",
			"presencePenalty",
			"topP",
			"topK",
			"seed",
			"diffEnabled",
			"fuzzyMatchThreshold",
			"rateLimitSeconds",
			"consecutiveMistakeLimit",
			"todoListEnabled",
			"openAiHeaders",
		]

		const settings: Record<string, unknown> = {}

		for (const key of keysToExtract) {
			if (extProfile[key] !== undefined) {
				settings[key] = extProfile[key]
			}
		}

		return settings
	}

	// ============================================================================
	// Validation Methods
	// ============================================================================

	/**
	 * Validate current configuration
	 */
	validateConfiguration(): ConfigurationValidationResult {
		const roleRegistryValidation = this.roleRegistry.validateConfiguration()
		const warnings: string[] = []

		// Additional validation checks
		const enabledRoles = this.getEnabledRoles()

		// Check for required roles
		const requiredRoles = this.getRequiredRoles()
		const missingRequiredRoles = requiredRoles.filter(
			(required) => !enabledRoles.some((enabled) => enabled.roleId === required.roleId),
		)

		if (missingRequiredRoles.length > 0) {
			roleRegistryValidation.errors.push(
				`Missing required roles: ${missingRequiredRoles.map((r) => r.roleId).join(", ")}`,
			)
		}

		// Check for roles without provider profiles
		for (const role of enabledRoles) {
			if (!role.providerProfileId) {
				const roleDef = this.getRoleDefinition(role.roleId)
				const roleName = roleDef?.name || role.roleId
				warnings.push(`Role "${roleName}" has no provider profile assigned`)
			}
		}

		// Check provider profile validity
		const profiles = this.getProviderProfiles()
		const profileIds = new Set(profiles.map((p) => p.id))

		for (const role of enabledRoles) {
			if (role.providerProfileId && !profileIds.has(role.providerProfileId)) {
				roleRegistryValidation.errors.push(
					`Role "${role.roleId}" has invalid provider profile: ${role.providerProfileId}`,
				)
			}
		}

		const result: ConfigurationValidationResult = {
			valid: roleRegistryValidation.errors.length === 0,
			errors: roleRegistryValidation.errors,
			warnings,
		}

		this.emit("validationResult", result)
		return result
	}

	/**
	 * Get required roles
	 */
	private getRequiredRoles(): RoleConfiguration[] {
		return this.roleRegistry.getRequiredRoles()
	}

	// ============================================================================
	// Role-to-Provider Mapping Methods
	// ============================================================================

	/**
	 * Get all role-to-provider mappings
	 */
	getRoleProviderMappings(): RoleProviderMapping[] {
		const roles = this.getRoleConfigurations()
		return roles.map((role) => ({
			roleId: role.roleId,
			providerProfileId: role.providerProfileId,
			mode: role.mode,
			priority: role.priority,
		}))
	}

	/**
	 * Apply role-to-provider mappings
	 */
	applyRoleProviderMappings(mappings: RoleProviderMapping[]): void {
		for (const mapping of mappings) {
			const updates: Partial<RoleConfiguration> = {}

			if (mapping.providerProfileId !== undefined) {
				updates.providerProfileId = mapping.providerProfileId
			}
			if (mapping.mode !== undefined) {
				updates.mode = mapping.mode
			}
			if (mapping.priority !== undefined) {
				updates.priority = mapping.priority
			}

			this.updateRoleConfiguration(mapping.roleId, updates)
		}
	}

	/**
	 * Get the best provider profile for a role based on priority
	 */
	getBestProviderForRole(roleId: string): ProviderProfile | null {
		const roleConfig = this.getRoleConfiguration(roleId)
		if (!roleConfig || !roleConfig.enabled) {
			return null
		}

		// If role has explicit provider, return it
		if (roleConfig.providerProfileId) {
			return this.getProviderProfile(roleConfig.providerProfileId) ?? null
		}

		// Otherwise, get default provider
		return this.getDefaultProviderProfile() ?? null
	}

	// ============================================================================
	// Custom Role Methods
	// ============================================================================

	/**
	 * Add a custom role definition
	 */
	addCustomRole(role: OrchestratorRoleDefinition): boolean {
		return this.roleRegistry.addCustomRole(role)
	}

	/**
	 * Delete a custom role
	 */
	deleteCustomRole(roleId: string): boolean {
		return this.roleRegistry.deleteCustomRole(roleId)
	}

	/**
	 * Get custom role IDs
	 */
	getCustomRoleIds(): string[] {
		return this.roleRegistry.getCustomRoleIds()
	}

	// ============================================================================
	// Export/Import Methods
	// ============================================================================

	/**
	 * Export configuration as JSON string
	 */
	exportConfiguration(): string {
		return this.roleRegistry.exportConfiguration()
	}

	/**
	 * Import configuration from JSON string
	 */
	importConfiguration(json: string): void {
		try {
			const config = JSON.parse(json) as Partial<OrchestrationConfiguration>
			this.roleRegistry.loadConfiguration(config)
		} catch (error) {
			console.error("[OrchestrationConfigService] Failed to import configuration:", error)
			throw new Error("Invalid configuration format")
		}
	}

	// ============================================================================
	// Event Subscription Methods
	// ============================================================================

	/**
	 * Subscribe to configuration changes
	 */
	onConfigChange(listener: (config: OrchestrationConfiguration) => void): () => void {
		this.on("configChanged", listener)
		return () => {
			this.off("configChanged", listener)
		}
	}

	/**
	 * Subscribe to role configuration changes
	 */
	onRoleConfigChange(listener: (config: RoleConfiguration) => void): () => void {
		this.roleRegistry.on("roleConfigChanged", (event: { roleId: string; config: RoleConfiguration }) => {
			listener(event.config)
		})
		return () => {
			this.roleRegistry.off("roleConfigChanged", () => {})
		}
	}

	/**
	 * Subscribe to validation result changes
	 */
	onValidationResult(listener: (result: ConfigurationValidationResult) => void): () => void {
		this.on("validationResult", listener)
		return () => {
			this.off("validationResult", listener)
		}
	}

	// ============================================================================
	// Cleanup
	// ============================================================================

	/**
	 * Dispose the service
	 */
	dispose(): void {
		this.roleRegistry.dispose()
		this.removeAllListeners()
	}
}
