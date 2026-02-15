// kilocode_change - new file
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import * as os from "node:os"
import { ArtifactStore } from "../ArtifactStore"
import { ArtifactType } from "@kilocode/core-schemas"

describe("ArtifactStore", () => {
	let store: ArtifactStore
	let tempDir: string

	beforeEach(async () => {
		// Create temporary directory for tests
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "artifact-store-test-"))
		store = new ArtifactStore({
			storagePath: tempDir,
			maxSummaryLength: 500,
			maxCacheSize: 10,
		})
		await store.initialize()
	})

	afterEach(async () => {
		// Clean up temporary directory
		await fs.rm(tempDir, { recursive: true, force: true })
	})

	describe("storeArtifact", () => {
		it("should store a new artifact", async () => {
			const artifact = await store.storeArtifact({
				type: "implementation_plan" as ArtifactType,
				producer: "architect_1",
				content: "# Implementation Plan\n\nThis is a test plan.",
				metadata: {
					tags: ["test", "plan"],
				},
			})

			expect(artifact.id).toBeDefined()
			expect(artifact.type).toBe("implementation_plan")
			expect(artifact.status).toBe("in_progress")
			expect(artifact.producer).toBe("architect_1")
			expect(artifact.version).toBe(1)
			expect(artifact.summary.brief).toBeDefined()
		})

		it("should store artifact with parent reference", async () => {
			const parent = await store.storeArtifact({
				type: "user_task" as ArtifactType,
				producer: "user",
				content: "Create a REST API",
			})

			const child = await store.storeArtifact({
				type: "implementation_plan" as ArtifactType,
				producer: "architect_1",
				content: "# Plan",
				metadata: {
					parentArtifactId: parent.id,
				},
			})

			expect(child.metadata.parentArtifactId).toBe(parent.id)
		})
	})

	describe("getArtifact", () => {
		it("should retrieve an artifact by ID", async () => {
			const stored = await store.storeArtifact({
				type: "code" as ArtifactType,
				producer: "coder_1",
				content: "export function test() { return true; }",
			})

			const retrieved = store.getArtifact(stored.id)
			expect(retrieved).toBeDefined()
			expect(retrieved?.id).toBe(stored.id)
			expect(retrieved?.type).toBe("code")
		})

		it("should return undefined for non-existent artifact", () => {
			const result = store.getArtifact("non_existent_id")
			expect(result).toBeUndefined()
		})
	})

	describe("loadArtifactContent", () => {
		it("should load artifact content", async () => {
			const content = "export function hello() { return 'Hello, World!'; }"
			const artifact = await store.storeArtifact({
				type: "code" as ArtifactType,
				producer: "coder_1",
				content,
			})

			const loaded = await store.loadArtifactContent(artifact.id)
			expect(loaded).toBe(content)
		})

		it("should return null for non-existent artifact", async () => {
			const result = await store.loadArtifactContent("non_existent_id")
			expect(result).toBeNull()
		})

		it("should cache content", async () => {
			const content = "cached content"
			const artifact = await store.storeArtifact({
				type: "code" as ArtifactType,
				producer: "coder_1",
				content,
			})

			// Load once
			await store.loadArtifactContent(artifact.id)
			// Load again - should come from cache
			const loaded = await store.loadArtifactContent(artifact.id)
			expect(loaded).toBe(content)
		})
	})

	describe("updateArtifact", () => {
		it("should update artifact content", async () => {
			const original = await store.storeArtifact({
				type: "code" as ArtifactType,
				producer: "coder_1",
				content: "original content",
			})

			const updated = await store.updateArtifact(original.id, {
				content: "updated content",
			})

			expect(updated.version).toBe(2)
			expect(updated.summary.brief).toBeDefined()

			const loaded = await store.loadArtifactContent(original.id)
			expect(loaded).toBe("updated content")
		})

		it("should update artifact status", async () => {
			const artifact = await store.storeArtifact({
				type: "code" as ArtifactType,
				producer: "coder_1",
				content: "test",
			})

			const updated = await store.updateArtifact(artifact.id, {
				status: "completed",
			})

			expect(updated.status).toBe("completed")
		})

		it("should throw error for non-existent artifact", async () => {
			await expect(store.updateArtifact("non_existent", { status: "completed" })).rejects.toThrow("not found")
		})
	})

	describe("updateStatus", () => {
		it("should update artifact status", async () => {
			const artifact = await store.storeArtifact({
				type: "code" as ArtifactType,
				producer: "coder_1",
				content: "test",
			})

			await store.updateStatus(artifact.id, "approved")

			const retrieved = store.getArtifact(artifact.id)
			expect(retrieved?.status).toBe("approved")
		})
	})

	describe("queryArtifacts", () => {
		beforeEach(async () => {
			// Create test artifacts
			await store.storeArtifact({
				type: "implementation_plan" as ArtifactType,
				producer: "architect_1",
				content: "Plan 1",
			})
			await store.storeArtifact({
				type: "implementation_plan" as ArtifactType,
				producer: "architect_2",
				content: "Plan 2",
			})
			await store.storeArtifact({
				type: "code" as ArtifactType,
				producer: "coder_1",
				content: "Code 1",
			})
		})

		it("should query by type", () => {
			const results = store.queryArtifacts({ type: "implementation_plan" as ArtifactType })
			expect(results.length).toBe(2)
		})

		it("should query by producer", () => {
			const results = store.queryArtifacts({ producer: "architect_1" })
			expect(results.length).toBe(1)
		})

		it("should query with limit", () => {
			const results = store.queryArtifacts({ limit: 2 })
			expect(results.length).toBe(2)
		})

		it("should query with offset", () => {
			const allResults = store.queryArtifacts({})
			const offsetResults = store.queryArtifacts({ offset: 1 })
			expect(offsetResults.length).toBe(allResults.length - 1)
		})
	})

	describe("getArtifactsByType", () => {
		it("should return artifacts of specific type", async () => {
			await store.storeArtifact({
				type: "code" as ArtifactType,
				producer: "coder_1",
				content: "code 1",
			})
			await store.storeArtifact({
				type: "code" as ArtifactType,
				producer: "coder_2",
				content: "code 2",
			})
			await store.storeArtifact({
				type: "documentation" as ArtifactType,
				producer: "doc_writer",
				content: "docs",
			})

			const codeArtifacts = store.getArtifactsByType("code" as ArtifactType)
			expect(codeArtifacts.length).toBe(2)
		})
	})

	describe("getArtifactsByProducer", () => {
		it("should return artifacts by producer", async () => {
			await store.storeArtifact({
				type: "code" as ArtifactType,
				producer: "coder_1",
				content: "code 1",
			})
			await store.storeArtifact({
				type: "code" as ArtifactType,
				producer: "coder_1",
				content: "code 2",
			})
			await store.storeArtifact({
				type: "code" as ArtifactType,
				producer: "coder_2",
				content: "code 3",
			})

			const results = store.getArtifactsByProducer("coder_1")
			expect(results.length).toBe(2)
		})
	})

	describe("deleteArtifact", () => {
		it("should delete an artifact", async () => {
			const artifact = await store.storeArtifact({
				type: "code" as ArtifactType,
				producer: "coder_1",
				content: "test",
			})

			await store.deleteArtifact(artifact.id)

			expect(store.hasArtifact(artifact.id)).toBe(false)
		})

		it("should throw error for non-existent artifact", async () => {
			await expect(store.deleteArtifact("non_existent")).rejects.toThrow("not found")
		})
	})

	describe("getArtifactCount", () => {
		it("should return correct count", async () => {
			expect(store.getArtifactCount()).toBe(0)

			await store.storeArtifact({
				type: "code" as ArtifactType,
				producer: "coder_1",
				content: "test",
			})

			expect(store.getArtifactCount()).toBe(1)
		})
	})

	describe("hasArtifact", () => {
		it("should return true for existing artifact", async () => {
			const artifact = await store.storeArtifact({
				type: "code" as ArtifactType,
				producer: "coder_1",
				content: "test",
			})

			expect(store.hasArtifact(artifact.id)).toBe(true)
		})

		it("should return false for non-existent artifact", () => {
			expect(store.hasArtifact("non_existent")).toBe(false)
		})
	})

	describe("clear", () => {
		it("should clear all artifacts", async () => {
			await store.storeArtifact({
				type: "code" as ArtifactType,
				producer: "coder_1",
				content: "test",
			})
			await store.storeArtifact({
				type: "code" as ArtifactType,
				producer: "coder_2",
				content: "test",
			})

			await store.clear()

			expect(store.getArtifactCount()).toBe(0)
		})
	})

	describe("persistence", () => {
		it("should persist artifacts across store instances", async () => {
			// Store an artifact
			const artifact = await store.storeArtifact({
				type: "code" as ArtifactType,
				producer: "coder_1",
				content: "persistent content",
			})

			// Create a new store instance
			const newStore = new ArtifactStore({ storagePath: tempDir })
			await newStore.initialize()

			// Verify artifact is loaded
			expect(newStore.hasArtifact(artifact.id)).toBe(true)

			const content = await newStore.loadArtifactContent(artifact.id)
			expect(content).toBe("persistent content")
		})
	})

	describe("archiveOldArtifacts", () => {
		it("should archive old completed artifacts", async () => {
			// Create an artifact and mark it completed
			const artifact = await store.storeArtifact({
				type: "code" as ArtifactType,
				producer: "coder_1",
				content: "test",
			})
			await store.updateStatus(artifact.id, "completed")

			// Archive artifacts older than 0 hours (all completed)
			const result = await store.archiveOldArtifacts({
				olderThanHours: 0,
				statuses: ["completed"],
			})

			expect(result.archivedCount).toBe(1)
			expect(result.archivedIds).toContain(artifact.id)
			expect(store.hasArtifact(artifact.id)).toBe(false)
		})

		it("should not archive artifacts with wrong status", async () => {
			const artifact = await store.storeArtifact({
				type: "code" as ArtifactType,
				producer: "coder_1",
				content: "test",
			})
			// Status is "in_progress" by default

			const result = await store.archiveOldArtifacts({
				olderThanHours: 0,
				statuses: ["completed", "approved"],
			})

			expect(result.archivedCount).toBe(0)
			expect(store.hasArtifact(artifact.id)).toBe(true)
		})
	})

	describe("getStorageStats", () => {
		it("should return storage statistics", async () => {
			await store.storeArtifact({
				type: "code" as ArtifactType,
				producer: "coder_1",
				content: "test content",
			})

			const stats = await store.getStorageStats()

			expect(stats.totalArtifacts).toBe(1)
			expect(stats.totalSizeBytes).toBeGreaterThan(0)
			expect(stats.oldestArtifact).toBeDefined()
			expect(stats.newestArtifact).toBeDefined()
		})
	})
})
