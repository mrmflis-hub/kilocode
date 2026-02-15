// kilocode_change - new file
import { Artifact, ArtifactType, ArtifactStatus } from "@kilocode/core-schemas"
import { ArtifactIndexEntry, ArtifactQueryOptions } from "./types"

/**
 * In-memory index for fast artifact lookup.
 * Supports querying by type, producer, status, and other metadata.
 */
export class ArtifactIndex {
	private index: Map<string, ArtifactIndexEntry> = new Map()
	private typeIndex: Map<ArtifactType, Set<string>> = new Map()
	private producerIndex: Map<string, Set<string>> = new Map()
	private statusIndex: Map<ArtifactStatus, Set<string>> = new Map()
	private parentIndex: Map<string, Set<string>> = new Map()

	/**
	 * Add an artifact to the index
	 */
	add(artifact: Artifact): void {
		const entry: ArtifactIndexEntry = {
			id: artifact.id,
			type: artifact.type,
			producer: artifact.producer,
			status: artifact.status,
			createdAt: artifact.createdAt,
			updatedAt: artifact.updatedAt,
			contentRef: artifact.contentRef,
		}

		// Add to main index
		this.index.set(artifact.id, entry)

		// Add to type index
		this.addToIndex(this.typeIndex, artifact.type, artifact.id)

		// Add to producer index
		this.addToIndex(this.producerIndex, artifact.producer, artifact.id)

		// Add to status index
		this.addToIndex(this.statusIndex, artifact.status, artifact.id)

		// Add to parent index if has parent
		if (artifact.metadata.parentArtifactId) {
			this.addToIndex(this.parentIndex, artifact.metadata.parentArtifactId, artifact.id)
		}
	}

	/**
	 * Update an artifact in the index
	 */
	update(artifact: Artifact): void {
		const existing = this.index.get(artifact.id)
		if (!existing) {
			this.add(artifact)
			return
		}

		// Check if status changed
		if (existing.status !== artifact.status) {
			this.removeFromIndex(this.statusIndex, existing.status, artifact.id)
			this.addToIndex(this.statusIndex, artifact.status, artifact.id)
		}

		// Update entry
		existing.status = artifact.status
		existing.updatedAt = artifact.updatedAt
		existing.contentRef = artifact.contentRef
	}

	/**
	 * Remove an artifact from the index
	 */
	remove(artifactId: string): void {
		const entry = this.index.get(artifactId)
		if (!entry) return

		// Remove from main index
		this.index.delete(artifactId)

		// Remove from type index
		this.removeFromIndex(this.typeIndex, entry.type, artifactId)

		// Remove from producer index
		this.removeFromIndex(this.producerIndex, entry.producer, artifactId)

		// Remove from status index
		this.removeFromIndex(this.statusIndex, entry.status, artifactId)
	}

	/**
	 * Get an artifact entry by ID
	 */
	get(artifactId: string): ArtifactIndexEntry | undefined {
		return this.index.get(artifactId)
	}

	/**
	 * Check if an artifact exists
	 */
	has(artifactId: string): boolean {
		return this.index.has(artifactId)
	}

	/**
	 * Query artifacts by various criteria
	 */
	query(options: ArtifactQueryOptions): ArtifactIndexEntry[] {
		let candidateIds: Set<string> | undefined

		// Filter by type
		if (options.type) {
			const typeIds = this.typeIndex.get(options.type)
			if (!typeIds) return []
			candidateIds = new Set(typeIds)
		}

		// Filter by producer
		if (options.producer) {
			const producerIds = this.producerIndex.get(options.producer)
			if (!producerIds) return []
			if (candidateIds) {
				candidateIds = this.intersection(candidateIds, producerIds)
			} else {
				candidateIds = new Set(producerIds)
			}
		}

		// Filter by status
		if (options.status) {
			const statusIds = this.statusIndex.get(options.status)
			if (!statusIds) return []
			if (candidateIds) {
				candidateIds = this.intersection(candidateIds, statusIds)
			} else {
				candidateIds = new Set(statusIds)
			}
		}

		// Filter by parent artifact
		if (options.parentArtifactId) {
			const parentIds = this.parentIndex.get(options.parentArtifactId)
			if (!parentIds) return []
			if (candidateIds) {
				candidateIds = this.intersection(candidateIds, parentIds)
			} else {
				candidateIds = new Set(parentIds)
			}
		}

		// If no filters, get all
		if (!candidateIds) {
			candidateIds = new Set(this.index.keys())
		}

		// Convert to entries and sort by creation date (newest first)
		let results = Array.from(candidateIds)
			.map((id) => this.index.get(id)!)
			.filter(Boolean)
			.sort((a, b) => b.createdAt - a.createdAt)

		// Apply pagination
		if (options.offset !== undefined && options.offset > 0) {
			results = results.slice(options.offset)
		}

		if (options.limit !== undefined && options.limit > 0) {
			results = results.slice(0, options.limit)
		}

		return results
	}

	/**
	 * Get all artifact IDs
	 */
	getAllIds(): string[] {
		return Array.from(this.index.keys())
	}

	/**
	 * Get all entries
	 */
	getAll(): ArtifactIndexEntry[] {
		return Array.from(this.index.values())
	}

	/**
	 * Get count of artifacts
	 */
	getCount(): number {
		return this.index.size
	}

	/**
	 * Get count by type
	 */
	getCountByType(type: ArtifactType): number {
		return this.typeIndex.get(type)?.size || 0
	}

	/**
	 * Get count by status
	 */
	getCountByStatus(status: ArtifactStatus): number {
		return this.statusIndex.get(status)?.size || 0
	}

	/**
	 * Get count by producer
	 */
	getCountByProducer(producer: string): number {
		return this.producerIndex.get(producer)?.size || 0
	}

	/**
	 * Clear the index
	 */
	clear(): void {
		this.index.clear()
		this.typeIndex.clear()
		this.producerIndex.clear()
		this.statusIndex.clear()
		this.parentIndex.clear()
	}

	// Private helper methods

	private addToIndex<K>(indexMap: Map<K, Set<string>>, key: K, artifactId: string): void {
		let set = indexMap.get(key)
		if (!set) {
			set = new Set()
			indexMap.set(key, set)
		}
		set.add(artifactId)
	}

	private removeFromIndex<K>(indexMap: Map<K, Set<string>>, key: K, artifactId: string): void {
		const set = indexMap.get(key)
		if (set) {
			set.delete(artifactId)
			if (set.size === 0) {
				indexMap.delete(key)
			}
		}
	}

	private intersection(a: Set<string>, b: Set<string>): Set<string> {
		return new Set(Array.from(a).filter((x) => b.has(x)))
	}
}
