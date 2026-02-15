// kilocode_change - new file
import { Artifact, ArtifactType, ArtifactStatus } from "@kilocode/core-schemas"

/**
 * Validation severity levels
 */
export type ValidationSeverity = "error" | "warning" | "info"

/**
 * Individual validation issue
 */
export interface ValidationIssue {
	/** Issue code for programmatic handling */
	code: string
	/** Human-readable message */
	message: string
	/** Severity level */
	severity: ValidationSeverity
	/** Field path if applicable */
	path?: string
	/** Additional context */
	context?: Record<string, unknown>
}

/**
 * Result of artifact validation
 */
export interface ValidationResult {
	/** Whether validation passed (no errors) */
	valid: boolean
	/** All validation issues found */
	issues: ValidationIssue[]
	/** Timestamp when validation was performed */
	validatedAt: number
	/** Artifact ID that was validated */
	artifactId: string
}

/**
 * Options for validating artifact content
 */
export interface ContentValidationOptions {
	/** Maximum content size in bytes */
	maxContentSizeBytes?: number
	/** Minimum content length */
	minContentLength?: number
	/** Whether to validate structure for specific types */
	validateStructure?: boolean
	/** Custom validation rules */
	customRules?: ContentValidationRule[]
}

/**
 * Custom content validation rule
 */
export interface ContentValidationRule {
	/** Rule name */
	name: string
	/** Artifact types this rule applies to */
	appliesTo: ArtifactType[]
	/** Validation function */
	validate: (content: string, type: ArtifactType) => ValidationIssue | null
}

/**
 * Options for validating artifact schema
 */
export interface SchemaValidationOptions {
	/** Whether to allow unknown properties */
	allowUnknown?: boolean
	/** Whether to validate all fields strictly */
	strict?: boolean
}

/**
 * Options for integrity validation
 */
export interface IntegrityValidationOptions {
	/** Expected content hash (if known) */
	expectedHash?: string
	/** Hash algorithm to use */
	hashAlgorithm?: "sha256" | "md5"
}

/**
 * Combined validation options
 */
export interface ArtifactValidationOptions {
	/** Content validation options */
	content?: ContentValidationOptions
	/** Schema validation options */
	schema?: SchemaValidationOptions
	/** Integrity validation options */
	integrity?: IntegrityValidationOptions
	/** Whether to stop on first error */
	failFast?: boolean
}

/**
 * Validation statistics
 */
export interface ValidationStatistics {
	/** Total validations performed */
	totalValidations: number
	/** Successful validations */
	successfulValidations: number
	/** Failed validations */
	failedValidations: number
	/** Validation errors by code */
	errorsByCode: Record<string, number>
	/** Validation errors by artifact type */
	errorsByType: Record<ArtifactType, number>
	/** Average validation time in ms */
	averageValidationTimeMs: number
}

/**
 * Validation event types
 */
export type ValidationEventType = "validation:started" | "validation:completed" | "validation:failed"

/**
 * Validation event
 */
export interface ValidationEvent {
	/** Event type */
	type: ValidationEventType
	/** Artifact ID */
	artifactId: string
	/** Validation result (for completed/failed events) */
	result?: ValidationResult
	/** Timestamp */
	timestamp: number
}

/**
 * Content validation result for specific artifact types
 */
export interface TypedContentValidation {
	/** Artifact type */
	type: ArtifactType
	/** Whether content is valid for this type */
	isValid: boolean
	/** Type-specific issues */
	issues: ValidationIssue[]
	/** Extracted metadata from content */
	extractedMetadata?: Record<string, unknown>
}

/**
 * Artifact validation context for downstream work
 */
export interface ArtifactValidationContext {
	/** Artifact being validated */
	artifact: Artifact
	/** Content (if loaded) */
	content?: string
	/** Validation options */
	options: ArtifactValidationOptions
	/** Whether this is a re-validation */
	isRevalidation: boolean
	/** Previous validation result (if re-validating) */
	previousResult?: ValidationResult
}

/**
 * Validation rule definition
 */
export interface ValidationRule {
	/** Rule identifier */
	id: string
	/** Rule name */
	name: string
	/** Rule description */
	description: string
	/** Artifact types this rule applies to */
	appliesTo: ArtifactType[] | "all"
	/** Rule priority (higher = run first) */
	priority: number
	/** Whether rule is enabled */
	enabled: boolean
	/** Validation function */
	validate: (context: ArtifactValidationContext) => Promise<ValidationIssue | null>
}
