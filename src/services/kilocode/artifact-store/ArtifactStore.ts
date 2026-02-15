// kilocode_change - new file
import { Artifact, ArtifactType, ArtifactStatus, ArtifactSummary } from "@kilocode/core-schemas"
import { ArtifactSummarizer } from "./ArtifactSummarizer"
import { ArtifactIndex } from "./ArtifactIndex"
import { ArtifactPersistence } from "./ArtifactPersistence"
import { ArtifactValidator } from "./ArtifactValidator"
import {
	StoreArtifactOptions,
	UpdateArtifactOptions,
	ArtifactQueryOptions,
	ArchiveOptions,
	ArchiveResult,
	ArtifactStoreConfig,
} from "./types"
import { ValidationResult, ArtifactValidationOptions, ValidationRule } from "./ArtifactValidationTypes"

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Partial<ArtifactStoreConfig> = {
	maxSummaryLength: 500,
	enableCompression: false,
	maxCacheSize: 100,
}

/**
 * ArtifactStore - Manages artifact storage, retrieval, and lifecycle
 *
 * This class provides:
 * - Artifact creation with automatic summarization
 * - Lazy loading of full content
 * - Versioning support
 * - Artifact indexing for fast lookup
 * - Persistence to disk
 * - Archival of old artifacts
 * - Artifact validation before storage and downstream work
 */
export class ArtifactStore {
	private readonly config: ArtifactStoreConfig
	private readonly summarizer: ArtifactSummarizer
	private readonly index: ArtifactIndex
	private readonly persistence: ArtifactPersistence
	private readonly validator: ArtifactValidator
	private contentCache: Map<string, string> = new Map()
	private initialized = false

	constructor(config: ArtifactStoreConfig) {
		this.config = { ...DEFAULT_CONFIG, ...config }
		this.summarizer = new ArtifactSummarizer(this.config.maxSummaryLength)
		this.index = new ArtifactIndex()
		this.persistence = new ArtifactPersistence(config.storagePath)
		this.validator = new ArtifactValidator()
	}

	/**
	 * Initialize the artifact store
	 */
	async initialize(): Promise<void> {
		if (this.initialized) return

		await this.persistence.initialize()

		// Load existing artifacts into index
		const artifacts = await this.persistence.loadAllMetadata()
		for (const artifact of artifacts) {
			this.index.add(artifact)
		}

		this.initialized = true
	}

	/**
	 * Store a new artifact
	 */
	async storeArtifact(options: StoreArtifactOptions): Promise<Artifact> {
		await this.ensureInitialized()

		const id = this.generateId(options.type)
		const now = Date.now()

		// Generate summary
		const summary = this.summarizer.generateSummary(options.type, options.content)

		// Save content to disk
		const contentData = await this.persistence.saveContent(id, options.content)

		// Create artifact
		const artifact: Artifact = {
			id,
			type: options.type,
			status: "in_progress",
			producer: options.producer,
			createdAt: now,
			updatedAt: now,
			version: 1,
			summary,
			metadata: {
				filesAffected: options.metadata?.filesAffected,
				reviewedBy: options.metadata?.reviewedBy,
				approvalStatus: options.metadata?.approvalStatus,
				parentArtifactId: options.metadata?.parentArtifactId,
				relatedArtifactIds: options.metadata?.relatedArtifactIds,
				tags: options.metadata?.tags,
				priority: options.metadata?.priority,
			},
			contentRef: contentData.contentRef,
		}

		// Save metadata
		await this.persistence.saveMetadata(artifact)

		// Add to index
		this.index.add(artifact)

		// Cache content
		this.cacheContent(id, options.content)

		return artifact
	}

	/**
	 * Get artifact metadata by ID
	 */
	getArtifact(artifactId: string): Artifact | undefined {
		const entry = this.index.get(artifactId)
		if (!entry) return undefined

		// Return a partial artifact from index (without full content)
		return {
			id: entry.id,
			type: entry.type,
			status: entry.status,
			producer: entry.producer,
			createdAt: entry.createdAt,
			updatedAt: entry.updatedAt,
			version: 1, // Version not tracked in index
			summary: { brief: "", keyPoints: [], filesAffected: [] }, // Summary not in index
			metadata: {},
			contentRef: entry.contentRef,
		}
	}

	/**
	 * Get artifact summary by ID
	 */
	getArtifactSummary(artifactId: string): ArtifactSummary | undefined {
		const entry = this.index.get(artifactId)
		if (!entry) return undefined

		// Load full metadata to get summary
		return this.persistence.loadMetadata(artifactId).then((artifact) => {
			if (!artifact) return undefined
			return artifact.summary
		}) as unknown as ArtifactSummary
	}

	/**
	 * Load full artifact content (lazy loading)
	 */
	async loadArtifactContent(artifactId: string): Promise<string | null> {
		await this.ensureInitialized()

		// Check cache first
		const cached = this.contentCache.get(artifactId)
		if (cached) return cached

		// Get artifact to find content reference
		const artifact = await this.persistence.loadMetadata(artifactId)
		if (!artifact) return null

		// Load content from disk
		const content = await this.persistence.loadContent(artifact.contentRef)
		if (content) {
			this.cacheContent(artifactId, content)
		}

		return content
	}

	/**
	 * Update an existing artifact
	 */
	async updateArtifact(artifactId: string, options: UpdateArtifactOptions): Promise<Artifact> {
		await this.ensureInitialized()

		const artifact = await this.persistence.loadMetadata(artifactId)
		if (!artifact) {
			throw new Error(`Artifact ${artifactId} not found`)
		}

		const now = Date.now()
		artifact.updatedAt = now

		// Update status if provided
		if (options.status) {
			artifact.status = options.status
		}

		// Update content if provided
		if (options.content !== undefined) {
			artifact.version += 1

			// Generate new summary
			artifact.summary = this.summarizer.generateSummary(artifact.type, options.content)

			// Save new content
			const contentData = await this.persistence.saveContent(artifactId, options.content)
			artifact.contentRef = contentData.contentRef

			// Update cache
			this.cacheContent(artifactId, options.content)
		}

		// Update metadata if provided
		if (options.metadata) {
			artifact.metadata = {
				...artifact.metadata,
				...options.metadata,
			}
		}

		// Save updated metadata
		await this.persistence.saveMetadata(artifact)

		// Update index
		this.index.update(artifact)

		return artifact
	}

	/**
	 * Update artifact status
	 */
	async updateStatus(artifactId: string, status: ArtifactStatus): Promise<void> {
		await this.ensureInitialized()

		const artifact = await this.persistence.loadMetadata(artifactId)
		if (!artifact) {
			throw new Error(`Artifact ${artifactId} not found`)
		}

		artifact.status = status
		artifact.updatedAt = Date.now()

		await this.persistence.saveMetadata(artifact)
		this.index.update(artifact)
	}

	/**
	 * Query artifacts by various criteria
	 */
	queryArtifacts(options: ArtifactQueryOptions): Artifact[] {
		const entries = this.index.query(options)
		return entries.map((entry) => ({
			id: entry.id,
			type: entry.type,
			status: entry.status,
			producer: entry.producer,
			createdAt: entry.createdAt,
			updatedAt: entry.updatedAt,
			version: 1,
			summary: { brief: "", keyPoints: [], filesAffected: [] },
			metadata: {},
			contentRef: entry.contentRef,
		}))
	}

	/**
	 * Get artifacts by type
	 */
	getArtifactsByType(type: ArtifactType): Artifact[] {
		return this.queryArtifacts({ type })
	}

	/**
	 * Get artifacts by producer
	 */
	getArtifactsByProducer(producer: string): Artifact[] {
		return this.queryArtifacts({ producer })
	}

	/**
	 * Get artifacts by status
	 */
	getArtifactsByStatus(status: ArtifactStatus): Artifact[] {
		return this.queryArtifacts({ status })
	}

	/**
	 * Get all artifact summaries for Organiser context
	 */
	async getAllSummaries(): Promise<ArtifactSummary[]> {
		await this.ensureInitialized()

		const artifacts = await this.persistence.loadAllMetadata()
		return artifacts.map((a) => a.summary)
	}

	/**
	 * Archive old artifacts
	 */
	async archiveOldArtifacts(options: ArchiveOptions): Promise<ArchiveResult> {
		await this.ensureInitialized()

		const artifacts = await this.persistence.loadAllMetadata()
		const result = await this.persistence.archiveOldArtifacts(artifacts, options)

		// Remove archived artifacts from index
		for (const id of result.archivedIds) {
			this.index.remove(id)
			this.contentCache.delete(id)
		}

		return result
	}

	/**
	 * Delete an artifact
	 */
	async deleteArtifact(artifactId: string): Promise<void> {
		await this.ensureInitialized()

		const artifact = await this.persistence.loadMetadata(artifactId)
		if (!artifact) {
			throw new Error(`Artifact ${artifactId} not found`)
		}

		await this.persistence.delete(artifact)
		this.index.remove(artifactId)
		this.contentCache.delete(artifactId)
	}

	/**
	 * Get artifact count
	 */
	getArtifactCount(): number {
		return this.index.getCount()
	}

	/**
	 * Get artifact count by type
	 */
	getArtifactCountByType(type: ArtifactType): number {
		return this.index.getCountByType(type)
	}

	/**
	 * Check if artifact exists
	 */
	hasArtifact(artifactId: string): boolean {
		return this.index.has(artifactId)
	}

	/**
	 * Clear all artifacts
	 */
	async clear(): Promise<void> {
		await this.ensureInitialized()

		await this.persistence.clear()
		this.index.clear()
		this.contentCache.clear()
	}

	/**
	 * Get storage statistics
	 */
	async getStorageStats(): Promise<{
		totalArtifacts: number
		totalSizeBytes: number
		oldestArtifact: number | null
		newestArtifact: number | null
	}> {
		await this.ensureInitialized()
		return this.persistence.getStorageStats()
	}

	// Validation methods

	/**
	 * Validate an artifact before storage
	 */
	async validateArtifact(
		artifact: Artifact,
		content: string,
		options?: ArtifactValidationOptions,
	): Promise<ValidationResult> {
		return this.validator.validateArtifact(artifact, content, options)
	}

	/**
	 * Validate content before creating an artifact
	 */
	async validateContent(
		content: string,
		type: ArtifactType,
		options?: ArtifactValidationOptions["content"],
	): Promise<ValidationResult> {
		await this.ensureInitialized()

		const issues = await this.validator.validateContent(content, type, options)
		return {
			valid: !issues.some((i) => i.severity === "error"),
			issues,
			validatedAt: Date.now(),
			artifactId: "pending",
		}
	}

	/**
	 * Store artifact with validation
	 * @throws Error if validation fails
	 */
	async storeValidatedArtifact(
		options: StoreArtifactOptions,
		validationOptions?: ArtifactValidationOptions,
	): Promise<Artifact> {
		await this.ensureInitialized()

		// Create a temporary artifact for validation
		const tempArtifact: Artifact = {
			id: "temp",
			type: options.type,
			status: "in_progress",
			producer: options.producer,
			createdAt: Date.now(),
			updatedAt: Date.now(),
			version: 1,
			summary: { brief: "", keyPoints: [], filesAffected: [] },
			metadata: options.metadata || {},
			contentRef: "",
		}

		// Validate before storing
		const validationResult = await this.validator.validateArtifact(tempArtifact, options.content, validationOptions)

		if (!validationResult.valid) {
			const errorMessages = validationResult.issues
				.filter((i) => i.severity === "error")
				.map((i) => i.message)
				.join("; ")
			throw new Error(`Artifact validation failed: ${errorMessages}`)
		}

		// Store the artifact
		return this.storeArtifact(options)
	}

	/**
	 * Validate artifact before downstream work
	 * @throws Error if validation fails
	 */
	async validateBeforeDownstream(artifactId: string): Promise<void> {
		await this.ensureInitialized()

		const artifact = await this.persistence.loadMetadata(artifactId)
		if (!artifact) {
			throw new Error(`Artifact ${artifactId} not found`)
		}

		const content = await this.loadArtifactContent(artifactId)
		if (!content) {
			throw new Error(`Artifact ${artifactId} content not found`)
		}

		await this.validator.validateBeforeDownstream(artifact, content)
	}

	/**
	 * Add a custom validation rule
	 */
	addValidationRule(rule: ValidationRule): void {
		this.validator.addValidationRule(rule)
	}

	/**
	 * Remove a custom validation rule
	 */
	removeValidationRule(ruleId: string): boolean {
		return this.validator.removeValidationRule(ruleId)
	}

	/**
	 * Get validation statistics
	 */
	getValidationStatistics() {
		return this.validator.getStatistics()
	}

	/**
	 * Compute content hash for integrity checking
	 */
	computeContentHash(content: string): string {
		return this.validator.computeHash(content)
	}

	// Private helper methods

	private async ensureInitialized(): Promise<void> {
		if (!this.initialized) {
			await this.initialize()
		}
	}

	private generateId(type: ArtifactType): string {
		const timestamp = Date.now()
		const random = Math.random().toString(36).substring(2, 9)
		return `${type}_${timestamp}_${random}`
	}

	private cacheContent(artifactId: string, content: string): void {
		// Enforce cache size limit
		if (this.contentCache.size >= (this.config.maxCacheSize || 100)) {
			// Remove oldest entry
			const firstKey = this.contentCache.keys().next().value
			if (firstKey) {
				this.contentCache.delete(firstKey)
			}
		}

		this.contentCache.set(artifactId, content)
	}
}
