// kilocode_change - new file
/**
 * Roles Module Exports
 *
 * Provides role definitions, registry, and configuration management
 * for the multi-agent orchestration system.
 */

// Role Definitions
export {
	getAllRoleDefinitions,
	getRoleDefinition,
	getOrchestratorRoleDefinition,
	getRequiredRoleIds,
	getRoleIdsByCategory,
	isValidRoleId,
	getRoleCategory,
	getDefaultModeForRole,
	getRolePriority,
	canRoleHandleInput,
	canRoleProduceOutput,
	getAllCategories,
	type OrchestratorRoleDefinition,
	type RoleCategory,
} from "./RoleDefinitions"

// Role Registry
export { RoleRegistry } from "./RoleRegistry"
export type { RoleConfiguration, ProviderProfile, OrchestrationConfiguration } from "./RoleRegistry"
