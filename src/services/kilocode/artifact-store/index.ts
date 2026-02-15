// kilocode_change - new file
/**
 * Artifact Store Module
 *
 * Provides artifact storage and management for multi-agent orchestration.
 */

// Export main class
export { ArtifactStore } from "./ArtifactStore"

// Export supporting classes
export { ArtifactSummarizer } from "./ArtifactSummarizer"
export { ArtifactIndex } from "./ArtifactIndex"
export { ArtifactPersistence } from "./ArtifactPersistence"

// Export validation
export { ArtifactValidator } from "./ArtifactValidator"

// Export types
export type {
	// Re-exports from core-schemas
	Artifact,
	ArtifactStatus,
	ArtifactSummary,
	ArtifactMetadata,
	ArtifactType,
	// Local types
	StoreArtifactOptions,
	UpdateArtifactOptions,
	ArtifactQueryOptions,
	ArchiveOptions,
	ArchiveResult,
	SummarizationStrategy,
	ArtifactContent,
	ArtifactIndexEntry,
	ArtifactStoreConfig,
} from "./types"

// Export validation types
export type {
	ValidationSeverity,
	ValidationIssue,
	ValidationResult,
	ContentValidationOptions,
	SchemaValidationOptions,
	IntegrityValidationOptions,
	ArtifactValidationOptions,
	ValidationStatistics,
	ValidationEvent,
	ValidationEventType,
	TypedContentValidation,
	ArtifactValidationContext,
	ValidationRule,
	ContentValidationRule,
} from "./ArtifactValidationTypes"
