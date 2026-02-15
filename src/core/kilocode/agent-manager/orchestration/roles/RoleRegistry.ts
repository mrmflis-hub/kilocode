// kilocode_change - new file
/**
 * Role Registry Module
 *
 * Manages role assignments, provider profiles, and role configurations.
 * Provides a centralized way to access and modify role-related settings.
 */

import { EventEmitter } from "events"
import type { RoleAssignment } from "@kilocode/core-schemas"
import {
	getRoleDefinition,
	getAllRoleDefinitions,
	getOrchestratorRoleDefinition,
	getDefaultModeForRole,
	isValidRoleId,
	getRoleCategory,
	type OrchestratorRoleDefinition,
} from "./RoleDefinitions"

/**
 * Role configuration stored in VS Code globalState
 */
export interface RoleConfiguration {
	/** Role ID */
	roleId: string

	/** Whether this role is enabled */
	enabled: boolean

	/** Provider profile ID assigned to this role */
	providerProfileId: string | null

	/** Mode to use for this role */
	mode: string

	/** Priority for role selection (higher = more likely to be used) */
	priority: number
}

/**
 * Provider profile for role assignment
 */
export interface ProviderProfile {
	/** Unique profile identifier */
	id: string

	/** Profile name for display */
	name: string

	/** Provider type (anthropic, openai, etc.) */
	providerType: string

	/** Model to use */
	model: string

	/** API configuration */
	apiKey?: string

	/** Additional settings */
	settings?: Record<string, unknown>
}

/**
 * Complete orchestration configuration
 */
export interface OrchestrationConfiguration {
	/** Whether orchestration is enabled */
	enabled: boolean

	/** Maximum concurrent agents */
	maxConcurrentAgents: number

	/** Role configurations */
	roles: RoleConfiguration[]

	/** Provider profiles */
	providerProfiles: ProviderProfile[]

	/** Default provider profile ID */
	defaultProviderProfileId: string | null
}

/**
 * Default orchestration configuration
 */
export const DEFAULT_ORCHESTRATION_CONFIG: OrchestrationConfiguration = {
	enabled: true,
	maxConcurrentAgents: 5,
	roles: [],
	providerProfiles: [],
	defaultProviderProfileId: null,
}

/**
 * RoleRegistry - Manages role assignments and configurations
 *
 * Key Responsibilities:
 * - Store and load role configurations
 * - Manage provider profiles for role assignments
 * - Validate role configurations
 * - Emit events on configuration changes
 */
export class RoleRegistry extends EventEmitter {
	/** Current orchestration configuration */
	private config: OrchestrationConfiguration

	/** Custom role definitions (user-defined) */
	private customRoles: Map<string, OrchestratorRoleDefinition> = new Map()

	/** Configuration change listeners */
	private configListeners: Set<(config: OrchestrationConfiguration) => void> = new Set()

	constructor(initialConfig?: Partial<OrchestrationConfiguration>) {
		super()
		this.config = { ...DEFAULT_ORCHESTRATION_CONFIG, ...initialConfig }

		// Initialize default role configurations
		this.initializeDefaultRoles()
	}

	/**
	 * Initialize default role configurations
	 */
	private initializeDefaultRoles(): void {
		const roleDefinitions = getAllRoleDefinitions()

		for (const roleDef of roleDefinitions) {
			const orchestratorRole = getOrchestratorRoleDefinition(roleDef.id)
			const existingConfig = this.config.roles.find((r) => r.roleId === roleDef.id)
			if (!existingConfig && orchestratorRole) {
				this.config.roles.push({
					roleId: roleDef.id,
					enabled: roleDef.required,
					providerProfileId: null,
					mode: orchestratorRole.defaultMode,
					priority: orchestratorRole.priority,
				})
			}
		}
	}

	// ============================================================================
	// Role Configuration Methods
	// ============================================================================

	/**
	 * Get all role configurations
	 */
	getRoleConfigurations(): RoleConfiguration[] {
		return [...this.config.roles]
	}

	/**
	 * Get role configuration by role ID
	 */
	getRoleConfiguration(roleId: string): RoleConfiguration | undefined {
		return this.config.roles.find((r) => r.roleId === roleId)
	}

	/**
	 * Update role configuration
	 */
	updateRoleConfiguration(roleId: string, updates: Partial<RoleConfiguration>): boolean {
		const index = this.config.roles.findIndex((r) => r.roleId === roleId)
		if (index === -1) {
			return false
		}

		this.config.roles[index] = { ...this.config.roles[index], ...updates }
		this.emitConfigurationChange()
		this.emit("roleConfigChanged", { roleId, config: this.config.roles[index] })

		return true
	}

	/**
	 * Enable or disable a role
	 */
	setRoleEnabled(roleId: string, enabled: boolean): boolean {
		return this.updateRoleConfiguration(roleId, { enabled })
	}

	/**
	 * Set provider profile for a role
	 */
	setRoleProviderProfile(roleId: string, providerProfileId: string | null): boolean {
		return this.updateRoleConfiguration(roleId, { providerProfileId })
	}

	/**
	 * Set mode for a role
	 */
	setRoleMode(roleId: string, mode: string): boolean {
		return this.updateRoleConfiguration(roleId, { mode })
	}

	/**
	 * Set priority for a role
	 */
	setRolePriority(roleId: string, priority: number): boolean {
		return this.updateRoleConfiguration(roleId, { priority })
	}

	/**
	 * Get all enabled roles
	 */
	getEnabledRoles(): RoleConfiguration[] {
		return this.config.roles.filter((r) => r.enabled)
	}

	/**
	 * Get required role configurations
	 */
	getRequiredRoles(): RoleConfiguration[] {
		const requiredIds = getAllRoleDefinitions()
			.filter((r) => r.required)
			.map((r) => r.id)

		return this.config.roles.filter((r) => requiredIds.includes(r.roleId))
	}

	// ============================================================================
	// Provider Profile Methods
	// ============================================================================

	/**
	 * Get all provider profiles
	 */
	getProviderProfiles(): ProviderProfile[] {
		return [...this.config.providerProfiles]
	}

	/**
	 * Get provider profile by ID
	 */
	getProviderProfile(id: string): ProviderProfile | undefined {
		return this.config.providerProfiles.find((p) => p.id === id)
	}

	/**
	 * Add a provider profile
	 */
	addProviderProfile(profile: Omit<ProviderProfile, "id">): ProviderProfile {
		const id = `profile_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
		const newProfile: ProviderProfile = { ...profile, id }
		this.config.providerProfiles.push(newProfile)
		this.emitConfigurationChange()
		this.emit("providerProfileAdded", newProfile)
		return newProfile
	}

	/**
	 * Update a provider profile
	 */
	updateProviderProfile(id: string, updates: Partial<ProviderProfile>): boolean {
		const index = this.config.providerProfiles.findIndex((p) => p.id === id)
		if (index === -1) {
			return false
		}

		this.config.providerProfiles[index] = { ...this.config.providerProfiles[index], ...updates }
		this.emitConfigurationChange()
		this.emit("providerProfileUpdated", this.config.providerProfiles[index])

		return true
	}

	/**
	 * Delete a provider profile
	 */
	deleteProviderProfile(id: string): boolean {
		const index = this.config.providerProfiles.findIndex((p) => p.id === id)
		if (index === -1) {
			return false
		}

		const deleted = this.config.providerProfiles.splice(index, 1)[0]
		this.emitConfigurationChange()
		this.emit("providerProfileDeleted", deleted)

		// Clear this profile from any role assignments
		for (const role of this.config.roles) {
			if (role.providerProfileId === id) {
				this.setRoleProviderProfile(role.roleId, null)
			}
		}

		return true
	}

	/**
	 * Get provider profile for a specific role
	 */
	getProviderProfileForRole(roleId: string): ProviderProfile | null {
		const roleConfig = this.getRoleConfiguration(roleId)
		if (!roleConfig) {
			return null
		}

		if (roleConfig.providerProfileId) {
			return this.getProviderProfile(roleConfig.providerProfileId) || null
		}

		// Return default provider profile
		if (this.config.defaultProviderProfileId) {
			return this.getProviderProfile(this.config.defaultProviderProfileId) || null
		}

		return null
	}

	/**
	 * Set default provider profile
	 */
	setDefaultProviderProfile(profileId: string | null): boolean {
		if (profileId !== null && !this.getProviderProfile(profileId)) {
			return false
		}

		this.config.defaultProviderProfileId = profileId
		this.emitConfigurationChange()
		this.emit("defaultProviderChanged", profileId)

		return true
	}

	// ============================================================================
	// Role Definition Methods
	// ============================================================================

	/**
	 * Get role definition by ID (includes custom roles)
	 */
	getRoleDefinition(roleId: string) {
		// Check custom roles first
		if (this.customRoles.has(roleId)) {
			return this.customRoles.get(roleId)
		}

		// Return from predefined definitions
		return getRoleDefinition(roleId)
	}

	/**
	 * Get all role definitions (predefined + custom)
	 */
	getAllRoleDefinitions() {
		const predefined = getAllRoleDefinitions()
		const custom = Array.from(this.customRoles.values()).map((r) => ({
			id: r.id,
			name: r.name,
			category: r.category,
			description: r.description,
			capabilities: r.capabilities.map((c) => c.name),
			inputArtifacts: r.inputArtifactTypes,
			outputArtifacts: r.outputArtifactTypes,
			required: r.required,
			systemPrompt: `You are a ${r.name} agent.\n\n${r.description}`,
		}))
		return [...predefined, ...custom]
	}

	/**
	 * Get role definition in OrchestratorRoleDefinition format
	 */
	getOrchestratorRoleDefinition(roleId: string): OrchestratorRoleDefinition | undefined {
		if (this.customRoles.has(roleId)) {
			return this.customRoles.get(roleId)
		}
		return getOrchestratorRoleDefinition(roleId)
	}

	/**
	 * Add a custom role definition
	 */
	addCustomRole(role: OrchestratorRoleDefinition): boolean {
		if (isValidRoleId(role.id)) {
			console.warn(`Cannot add custom role "${role.id}": role ID already exists in predefined roles`)
			return false
		}

		if (this.customRoles.has(role.id)) {
			// Update existing custom role
			this.customRoles.set(role.id, role)
			this.emit("customRoleUpdated", role)
		} else {
			// Add new custom role
			this.customRoles.set(role.id, role)
			this.emit("customRoleAdded", role)
		}

		// Add to configuration if not exists
		const existingConfig = this.config.roles.find((r) => r.roleId === role.id)
		if (!existingConfig) {
			this.config.roles.push({
				roleId: role.id,
				enabled: true,
				providerProfileId: null,
				mode: role.defaultMode,
				priority: role.priority,
			})
			this.emitConfigurationChange()
		}

		return true
	}

	/**
	 * Delete a custom role
	 */
	deleteCustomRole(roleId: string): boolean {
		if (!this.customRoles.has(roleId)) {
			return false
		}

		const deleted = this.customRoles.get(roleId)
		this.customRoles.delete(roleId)
		this.emit("customRoleDeleted", deleted)

		// Remove from configuration
		const index = this.config.roles.findIndex((r) => r.roleId === roleId)
		if (index !== -1) {
			this.config.roles.splice(index, 1)
			this.emitConfigurationChange()
		}

		return true
	}

	/**
	 * Get custom role IDs
	 */
	getCustomRoleIds(): string[] {
		return Array.from(this.customRoles.keys())
	}

	// ============================================================================
	// Configuration Methods
	// ============================================================================

	/**
	 * Get full orchestration configuration
	 */
	getConfiguration(): OrchestrationConfiguration {
		return { ...this.config }
	}

	/**
	 * Load configuration from external source
	 */
	loadConfiguration(config: Partial<OrchestrationConfiguration>): void {
		this.config = { ...DEFAULT_ORCHESTRATION_CONFIG, ...config }
		this.initializeDefaultRoles()
		this.emitConfigurationChange()
		this.emit("configLoaded", this.config)
	}

	/**
	 * Export configuration as JSON
	 */
	exportConfiguration(): string {
		return JSON.stringify(this.config, null, 2)
	}

	/**
	 * Check if orchestration is enabled
	 */
	isEnabled(): boolean {
		return this.config.enabled
	}

	/**
	 * Enable or disable orchestration
	 */
	setEnabled(enabled: boolean): void {
		this.config.enabled = enabled
		this.emitConfigurationChange()
		this.emit("enabledChanged", enabled)
	}

	/**
	 * Set maximum concurrent agents
	 */
	setMaxConcurrentAgents(count: number): void {
		this.config.maxConcurrentAgents = Math.max(1, Math.min(10, count))
		this.emitConfigurationChange()
	}

	/**
	 * Get maximum concurrent agents
	 */
	getMaxConcurrentAgents(): number {
		return this.config.maxConcurrentAgents
	}

	/**
	 * Validate current configuration
	 */
	validateConfiguration(): { valid: boolean; errors: string[] } {
		const errors: string[] = []

		// Check required roles are enabled
		const requiredRoles = getAllRoleDefinitions().filter((r) => r.required)
		for (const role of requiredRoles) {
			const config = this.getRoleConfiguration(role.id)
			if (!config || !config.enabled) {
				errors.push(`Required role "${role.name}" is not enabled`)
			}
		}

		// Check provider profiles exist for enabled roles
		for (const roleConfig of this.config.roles) {
			if (roleConfig.enabled && roleConfig.providerProfileId) {
				const profile = this.getProviderProfile(roleConfig.providerProfileId)
				if (!profile) {
					errors.push(
						`Role "${roleConfig.roleId}" has invalid provider profile: ${roleConfig.providerProfileId}`,
					)
				}
			}
		}

		return {
			valid: errors.length === 0,
			errors,
		}
	}

	/**
	 * Get configuration as RoleAssignment array for AgentPoolManager
	 */
	getRoleAssignments(): RoleAssignment[] {
		return this.config.roles.map((role) => {
			const roleDef = this.getRoleDefinition(role.roleId)
			return {
				roleId: role.roleId,
				roleName: roleDef?.name || role.roleId,
				assignedProfileId: role.providerProfileId,
				isActive: role.enabled,
				priority: role.priority,
			}
		})
	}

	/**
	 * Get mode for a role (from config or default)
	 */
	getModeForRole(roleId: string): string {
		const config = this.getRoleConfiguration(roleId)
		if (config) {
			return config.mode
		}
		return getDefaultModeForRole(roleId)
	}

	/**
	 * Get priority for a role (from config or default)
	 */
	getPriorityForRole(roleId: string): number {
		const config = this.getRoleConfiguration(roleId)
		if (config) {
			return config.priority
		}
		return getDefaultModeForRole(roleId).length // Fallback
	}

	// ============================================================================
	// Event Handling
	// ============================================================================

	/**
	 * Subscribe to configuration changes
	 */
	onConfigChange(listener: (config: OrchestrationConfiguration) => void): () => void {
		this.configListeners.add(listener)
		return () => {
			this.configListeners.delete(listener)
		}
	}

	/**
	 * Emit configuration change event
	 */
	private emitConfigurationChange(): void {
		for (const listener of this.configListeners) {
			try {
				listener(this.config)
			} catch (error) {
				console.error("Error in config change listener:", error)
			}
		}
	}

	/**
	 * Dispose the registry
	 */
	dispose(): void {
		this.configListeners.clear()
		this.customRoles.clear()
		this.removeAllListeners()
	}
}
