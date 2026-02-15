// kilocode_change - new file
import { Artifact, ArtifactStatus, ArtifactSummary, ArtifactMetadata, ArtifactType } from "@kilocode/core-schemas"

// Re-export types from core-schemas
export type { Artifact, ArtifactStatus, ArtifactSummary, ArtifactMetadata, ArtifactType }

/**
 * Options for storing a new artifact
 */
export interface StoreArtifactOptions {
	/** Artifact type */
	type: ArtifactType
	/** Agent role ID that produced this artifact */
	producer: string
	/** Full content of the artifact */
	content: string
	/** Optional metadata */
	metadata?: Partial<ArtifactMetadata>
}

/**
 * Options for updating an existing artifact
 */
export interface UpdateArtifactOptions {
	/** New content (optional) */
	content?: string
	/** New status (optional) */
	status?: ArtifactStatus
	/** Additional metadata to merge (optional) */
	metadata?: Partial<ArtifactMetadata>
}

/**
 * Query options for finding artifacts
 */
export interface ArtifactQueryOptions {
	/** Filter by artifact type */
	type?: ArtifactType
	/** Filter by producer agent ID */
	producer?: string
	/** Filter by status */
	status?: ArtifactStatus
	/** Filter by parent artifact ID */
	parentArtifactId?: string
	/** Maximum number of results */
	limit?: number
	/** Offset for pagination */
	offset?: number
}

/**
 * Options for archiving old artifacts
 */
export interface ArchiveOptions {
	/** Archive artifacts older than this many hours */
	olderThanHours: number
	/** Only archive artifacts with these statuses (default: completed, approved) */
	statuses?: ArtifactStatus[]
}

/**
 * Result of archive operation
 */
export interface ArchiveResult {
	/** Number of artifacts archived */
	archivedCount: number
	/** IDs of archived artifacts */
	archivedIds: string[]
}

/**
 * Summarization strategy for different artifact types
 */
export type SummarizationStrategy = (content: string) => ArtifactSummary

/**
 * Internal artifact content storage
 */
export interface ArtifactContent {
	/** Artifact ID this content belongs to */
	artifactId: string
	/** Content reference (filename) for loading content */
	contentRef: string
	/** Full content */
	content: string
	/** Content hash for integrity checking */
	hash: string
	/** Size in bytes */
	size: number
}

/**
 * Index entry for fast artifact lookup
 */
export interface ArtifactIndexEntry {
	/** Artifact ID */
	id: string
	/** Artifact type */
	type: ArtifactType
	/** Producer agent ID */
	producer: string
	/** Status */
	status: ArtifactStatus
	/** Creation timestamp */
	createdAt: number
	/** Update timestamp */
	updatedAt: number
	/** Content reference */
	contentRef: string
}

/**
 * Configuration for ArtifactStore
 */
export interface ArtifactStoreConfig {
	/** Base path for storing artifacts */
	storagePath: string
	/** Maximum summary length in characters */
	maxSummaryLength?: number
	/** Enable content compression */
	enableCompression?: boolean
	/** Maximum artifacts to keep in memory cache */
	maxCacheSize?: number
}
