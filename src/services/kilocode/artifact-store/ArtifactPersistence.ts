// kilocode_change - new file
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { createHash } from "node:crypto"
import { Artifact, ArtifactSummary } from "@kilocode/core-schemas"
import { ArtifactContent, ArchiveOptions, ArchiveResult } from "./types"

/**
 * Handles persistence of artifacts to disk.
 * Stores artifact metadata and content separately for efficient access.
 */
export class ArtifactPersistence {
	private readonly storagePath: string
	private readonly contentDir: string
	private readonly metadataDir: string
	private readonly archiveDir: string
	private initialized = false

	constructor(storagePath: string) {
		this.storagePath = storagePath
		this.contentDir = path.join(storagePath, "content")
		this.metadataDir = path.join(storagePath, "metadata")
		this.archiveDir = path.join(storagePath, "archive")
	}

	/**
	 * Initialize storage directories
	 */
	async initialize(): Promise<void> {
		if (this.initialized) return

		await fs.mkdir(this.storagePath, { recursive: true })
		await fs.mkdir(this.contentDir, { recursive: true })
		await fs.mkdir(this.metadataDir, { recursive: true })
		await fs.mkdir(this.archiveDir, { recursive: true })

		this.initialized = true
	}

	/**
	 * Save artifact metadata to disk
	 */
	async saveMetadata(artifact: Artifact): Promise<void> {
		await this.ensureInitialized()

		const metadataPath = this.getMetadataPath(artifact.id)
		const data = JSON.stringify(artifact, null, 2)
		await fs.writeFile(metadataPath, data, "utf-8")
	}

	/**
	 * Save artifact content to disk
	 */
	async saveContent(artifactId: string, content: string): Promise<ArtifactContent> {
		await this.ensureInitialized()

		const hash = this.computeHash(content)
		const size = Buffer.byteLength(content, "utf-8")
		const contentRef = this.getContentRef(artifactId)

		const contentPath = this.getContentPath(contentRef)
		await fs.writeFile(contentPath, content, "utf-8")

		return {
			artifactId,
			contentRef,
			content,
			hash,
			size,
		}
	}

	/**
	 * Load artifact metadata from disk
	 */
	async loadMetadata(artifactId: string): Promise<Artifact | null> {
		await this.ensureInitialized()

		const metadataPath = this.getMetadataPath(artifactId)
		try {
			const data = await fs.readFile(metadataPath, "utf-8")
			return JSON.parse(data) as Artifact
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				return null
			}
			throw error
		}
	}

	/**
	 * Load artifact content from disk
	 */
	async loadContent(contentRef: string): Promise<string | null> {
		await this.ensureInitialized()

		const contentPath = this.getContentPath(contentRef)
		try {
			return await fs.readFile(contentPath, "utf-8")
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				return null
			}
			throw error
		}
	}

	/**
	 * Delete artifact metadata and content
	 */
	async delete(artifact: Artifact): Promise<void> {
		await this.ensureInitialized()

		// Delete metadata
		const metadataPath = this.getMetadataPath(artifact.id)
		try {
			await fs.unlink(metadataPath)
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
				throw error
			}
		}

		// Delete content
		const contentPath = this.getContentPath(artifact.contentRef)
		try {
			await fs.unlink(contentPath)
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
				throw error
			}
		}
	}

	/**
	 * Archive old artifacts
	 */
	async archiveOldArtifacts(artifacts: Artifact[], options: ArchiveOptions): Promise<ArchiveResult> {
		await this.ensureInitialized()

		const cutoffTime = Date.now() - options.olderThanHours * 60 * 60 * 1000
		const statusesToArchive = options.statuses || ["completed", "approved"]

		const toArchive = artifacts.filter((a) => a.updatedAt < cutoffTime && statusesToArchive.includes(a.status))

		const archivedIds: string[] = []

		for (const artifact of toArchive) {
			try {
				// Move metadata to archive
				const metadataPath = this.getMetadataPath(artifact.id)
				const archiveMetadataPath = path.join(this.archiveDir, `${artifact.id}.json`)
				await fs.rename(metadataPath, archiveMetadataPath)

				// Move content to archive
				const contentPath = this.getContentPath(artifact.contentRef)
				const archiveContentPath = path.join(this.archiveDir, artifact.contentRef)
				try {
					await fs.rename(contentPath, archiveContentPath)
				} catch (error) {
					// Content might not exist, continue
				}

				archivedIds.push(artifact.id)
			} catch (error) {
				// Log error but continue with other artifacts
				console.error(`Failed to archive artifact ${artifact.id}:`, error)
			}
		}

		return {
			archivedCount: archivedIds.length,
			archivedIds,
		}
	}

	/**
	 * Load all artifact metadata from disk
	 */
	async loadAllMetadata(): Promise<Artifact[]> {
		await this.ensureInitialized()

		const files = await fs.readdir(this.metadataDir)
		const artifacts: Artifact[] = []

		for (const file of files) {
			if (!file.endsWith(".json")) continue

			const artifactId = file.replace(".json", "")
			const artifact = await this.loadMetadata(artifactId)
			if (artifact) {
				artifacts.push(artifact)
			}
		}

		return artifacts
	}

	/**
	 * Check if artifact metadata exists
	 */
	async metadataExists(artifactId: string): Promise<boolean> {
		await this.ensureInitialized()

		const metadataPath = this.getMetadataPath(artifactId)
		try {
			await fs.access(metadataPath)
			return true
		} catch {
			return false
		}
	}

	/**
	 * Check if content exists
	 */
	async contentExists(contentRef: string): Promise<boolean> {
		await this.ensureInitialized()

		const contentPath = this.getContentPath(contentRef)
		try {
			await fs.access(contentPath)
			return true
		} catch {
			return false
		}
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

		const artifacts = await this.loadAllMetadata()

		let totalSize = 0
		let oldest: number | null = null
		let newest: number | null = null

		for (const artifact of artifacts) {
			// Try to get content size
			const contentPath = this.getContentPath(artifact.contentRef)
			try {
				const stats = await fs.stat(contentPath)
				totalSize += stats.size
			} catch {
				// Content might not exist
			}

			if (oldest === null || artifact.createdAt < oldest) {
				oldest = artifact.createdAt
			}
			if (newest === null || artifact.createdAt > newest) {
				newest = artifact.createdAt
			}
		}

		return {
			totalArtifacts: artifacts.length,
			totalSizeBytes: totalSize,
			oldestArtifact: oldest,
			newestArtifact: newest,
		}
	}

	/**
	 * Clear all stored data
	 */
	async clear(): Promise<void> {
		await this.ensureInitialized()

		await fs.rm(this.contentDir, { recursive: true, force: true })
		await fs.rm(this.metadataDir, { recursive: true, force: true })

		// Recreate directories
		await fs.mkdir(this.contentDir, { recursive: true })
		await fs.mkdir(this.metadataDir, { recursive: true })
	}

	// Private helper methods

	private async ensureInitialized(): Promise<void> {
		if (!this.initialized) {
			await this.initialize()
		}
	}

	private getMetadataPath(artifactId: string): string {
		return path.join(this.metadataDir, `${artifactId}.json`)
	}

	private getContentPath(contentRef: string): string {
		return path.join(this.contentDir, contentRef)
	}

	private getContentRef(artifactId: string): string {
		return `${artifactId}.content`
	}

	private computeHash(content: string): string {
		return createHash("sha256").update(content, "utf-8").digest("hex")
	}
}
