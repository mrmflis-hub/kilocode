// kilocode_change - new file
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { ArtifactValidator } from "../ArtifactValidator"
import { Artifact, ArtifactType } from "@kilocode/core-schemas"
import { ValidationRule, ValidationIssue } from "../ArtifactValidationTypes"

describe("ArtifactValidator", () => {
	let validator: ArtifactValidator

	// Sample artifact for testing
	const createTestArtifact = (overrides: Partial<Artifact> = {}): Artifact => ({
		id: "test_artifact_1",
		type: "implementation_plan",
		status: "in_progress",
		producer: "architect_1",
		createdAt: Date.now(),
		updatedAt: Date.now(),
		version: 1,
		summary: {
			brief: "Test artifact summary",
			keyPoints: ["Point 1", "Point 2"],
			filesAffected: ["file1.ts", "file2.ts"],
		},
		metadata: {},
		contentRef: "content_ref_1",
		...overrides,
	})

	const validContent = "# Implementation Plan\n\n## Overview\nThis is a test plan.\n\n## Steps\n1. Step 1\n2. Step 2"

	beforeEach(() => {
		validator = new ArtifactValidator()
	})

	afterEach(() => {
		validator.resetStatistics()
	})

	describe("validateArtifact", () => {
		it("should validate a valid artifact successfully", async () => {
			const artifact = createTestArtifact()
			const result = await validator.validateArtifact(artifact, validContent)

			expect(result.valid).toBe(true)
			expect(result.issues).toHaveLength(0)
			expect(result.artifactId).toBe(artifact.id)
			expect(result.validatedAt).toBeGreaterThan(0)
		})

		it("should return invalid for empty content", async () => {
			const artifact = createTestArtifact()
			const result = await validator.validateArtifact(artifact, "")

			expect(result.valid).toBe(false)
			expect(result.issues.some((i) => i.code === "CONTENT_EMPTY")).toBe(true)
		})

		it("should return invalid for content exceeding max size", async () => {
			const artifact = createTestArtifact()
			const largeContent = "x".repeat(11 * 1024 * 1024) // 11MB

			const result = await validator.validateArtifact(artifact, largeContent, {
				content: { maxContentSizeBytes: 10 * 1024 * 1024 },
			})

			expect(result.valid).toBe(false)
			expect(result.issues.some((i) => i.code === "CONTENT_TOO_LARGE")).toBe(true)
		})

		it("should stop on first error with failFast option", async () => {
			const artifact = createTestArtifact({ id: "" }) // Missing ID
			const result = await validator.validateArtifact(artifact, "", { failFast: true })

			expect(result.valid).toBe(false)
			// Should have at least one error, but may not have all
			expect(result.issues.length).toBeGreaterThanOrEqual(1)
		})

		it("should emit validation events", async () => {
			const artifact = createTestArtifact()
			const startedListener = vi.fn()
			const completedListener = vi.fn()

			validator.on("validation:started", startedListener)
			validator.on("validation:completed", completedListener)

			await validator.validateArtifact(artifact, validContent)

			expect(startedListener).toHaveBeenCalledTimes(1)
			expect(completedListener).toHaveBeenCalledTimes(1)
		})

		it("should emit validation:failed event for invalid artifact", async () => {
			const artifact = createTestArtifact()
			const failedListener = vi.fn()

			validator.on("validation:failed", failedListener)

			await validator.validateArtifact(artifact, "")

			expect(failedListener).toHaveBeenCalledTimes(1)
		})
	})

	describe("validateContent", () => {
		it("should validate content size", async () => {
			const issues = await validator.validateContent("test content", "implementation_plan")

			expect(issues.some((i) => i.severity === "error")).toBe(false)
		})

		it("should detect empty content", async () => {
			const issues = await validator.validateContent("", "implementation_plan")

			expect(issues.some((i) => i.code === "CONTENT_EMPTY")).toBe(true)
		})

		it("should detect whitespace-only content", async () => {
			const issues = await validator.validateContent("   \n\t  ", "implementation_plan")

			expect(issues.some((i) => i.code === "CONTENT_EMPTY")).toBe(true)
		})

		it("should detect content below minimum length", async () => {
			const issues = await validator.validateContent("ab", "implementation_plan", {
				minContentLength: 5,
			})

			expect(issues.some((i) => i.code === "CONTENT_TOO_SHORT")).toBe(true)
		})

		it("should apply custom content rules", async () => {
			const customRule = {
				name: "test",
				appliesTo: ["implementation_plan"] as ArtifactType[],
				validate: (content: string): ValidationIssue | null => {
					if (!content.includes("REQUIRED")) {
						return {
							code: "MISSING_REQUIRED",
							message: "Content must contain REQUIRED",
							severity: "error" as const,
						}
					}
					return null
				},
			}

			const issues = await validator.validateContent("test content", "implementation_plan", {
				customRules: [customRule],
			})

			expect(issues.some((i) => i.code === "MISSING_REQUIRED")).toBe(true)
		})
	})

	describe("validateContentForType", () => {
		describe("implementation_plan", () => {
			it("should warn about missing headings", () => {
				const issues = validator.validateContentForType("No headings here", "implementation_plan")

				expect(issues.some((i) => i.code === "PLAN_NO_HEADINGS")).toBe(true)
			})

			it("should suggest structure sections", () => {
				const issues = validator.validateContentForType("# Some Title\n\nContent", "implementation_plan")

				expect(issues.some((i) => i.code === "PLAN_NO_STRUCTURE")).toBe(true)
			})

			it("should pass for well-structured plan", () => {
				const content = "# Implementation Plan\n\n## Overview\nThis is the overview.\n\n## Steps\n1. Step 1"
				const issues = validator.validateContentForType(content, "implementation_plan")

				expect(issues.every((i) => i.severity !== "error")).toBe(true)
			})
		})

		describe("pseudocode", () => {
			it("should warn about missing file references", () => {
				const issues = validator.validateContentForType("function test() {}", "pseudocode")

				expect(issues.some((i) => i.code === "PSEUDOCODE_NO_FILES")).toBe(true)
			})

			it("should pass for pseudocode with file references", () => {
				const content = "File: src/test.ts\nfunction test() {}"
				const issues = validator.validateContentForType(content, "pseudocode")

				expect(issues.some((i) => i.code === "PSEUDOCODE_NO_FILES")).toBe(false)
			})
		})

		describe("code", () => {
			it("should detect potential syntax issues", () => {
				const issues = validator.validateContentForType("function test() { { }", "code")

				expect(issues.some((i) => i.code === "CODE_SYNTAX_INDICATOR")).toBe(true)
			})

			it("should detect TODO comments", () => {
				const issues = validator.validateContentForType("function test() { /* TODO: fix this */ }", "code")

				expect(issues.some((i) => i.code === "CODE_HAS_TODOS")).toBe(true)
			})
		})

		describe("review_report", () => {
			it("should warn about missing severity", () => {
				const issues = validator.validateContentForType("This code looks good.", "review_report")

				expect(issues.some((i) => i.code === "REVIEW_NO_SEVERITY")).toBe(true)
			})

			it("should warn about missing verdict", () => {
				const issues = validator.validateContentForType("Found some issues.", "review_report")

				expect(issues.some((i) => i.code === "REVIEW_NO_VERDICT")).toBe(true)
			})

			it("should pass for complete review", () => {
				const content = "Review Report\n\nSeverity: High\n\nVerdict: Approved"
				const issues = validator.validateContentForType(content, "review_report")

				expect(issues.every((i) => i.severity !== "error")).toBe(true)
			})
		})

		describe("documentation", () => {
			it("should suggest headings", () => {
				const issues = validator.validateContentForType("Just plain text documentation.", "documentation")

				expect(issues.some((i) => i.code === "DOC_NO_HEADINGS")).toBe(true)
			})

			it("should detect unclosed code blocks", () => {
				const issues = validator.validateContentForType("# Docs\n```js\nconst x = 1", "documentation")

				expect(issues.some((i) => i.code === "DOC_UNCLOSED_CODE_BLOCK")).toBe(true)
			})
		})

		describe("test_results", () => {
			it("should warn about missing test indicators", () => {
				const issues = validator.validateContentForType("Ran some tests.", "test_results")

				expect(issues.some((i) => i.code === "TEST_NO_RESULTS")).toBe(true)
			})

			it("should pass for proper test results", () => {
				const content = "Test Results:\n5 passed\n0 failed"
				const issues = validator.validateContentForType(content, "test_results")

				expect(issues.every((i) => i.severity !== "error")).toBe(true)
			})
		})

		describe("user_task", () => {
			it("should warn about short task description", () => {
				const issues = validator.validateContentForType("Fix bug", "user_task")

				expect(issues.some((i) => i.code === "TASK_TOO_SHORT")).toBe(true)
			})
		})

		describe("error_report", () => {
			it("should suggest error indicators", () => {
				const issues = validator.validateContentForType("Something went wrong.", "error_report")

				expect(issues.some((i) => i.code === "ERROR_NO_INDICATORS")).toBe(true)
			})

			it("should pass for proper error report", () => {
				const content = "Error: TypeError at line 5\nStack trace: ..."
				const issues = validator.validateContentForType(content, "error_report")

				expect(issues.every((i) => i.severity !== "error")).toBe(true)
			})
		})
	})

	describe("validateSchema", () => {
		it("should validate a valid artifact schema", async () => {
			const artifact = createTestArtifact()
			const issues = await validator.validateSchema(artifact)

			expect(issues.every((i) => i.severity !== "error")).toBe(true)
		})

		it("should detect missing required fields in strict mode", async () => {
			const artifact = createTestArtifact({ id: "" })
			const issues = await validator.validateSchema(artifact, { strict: true })

			expect(issues.some((i) => i.code === "MISSING_REQUIRED_FIELD")).toBe(true)
		})

		it("should detect invalid version", async () => {
			const artifact = createTestArtifact({ version: 0 })
			const issues = await validator.validateSchema(artifact, { strict: true })

			expect(issues.some((i) => i.code === "INVALID_VERSION")).toBe(true)
		})

		it("should detect missing producer", async () => {
			const artifact = createTestArtifact({ producer: "" })
			const issues = await validator.validateSchema(artifact, { strict: true })

			expect(issues.some((i) => i.path === "producer")).toBe(true)
		})
	})

	describe("validateIntegrity", () => {
		it("should compute content hash", async () => {
			const content = "test content"
			const issues = await validator.validateIntegrity(content)

			// No expected hash, so should only check for corruption
			expect(issues.every((i) => i.code !== "INTEGRITY_MISMATCH")).toBe(true)
		})

		it("should detect hash mismatch", async () => {
			const content = "test content"
			const expectedHash = "wrong_hash"

			const issues = await validator.validateIntegrity(content, {
				expectedHash,
				hashAlgorithm: "sha256",
			})

			expect(issues.some((i) => i.code === "INTEGRITY_MISMATCH")).toBe(true)
		})

		it("should pass hash verification with correct hash", async () => {
			const content = "test content"
			const correctHash = validator.computeHash(content, "sha256")

			const issues = await validator.validateIntegrity(content, {
				expectedHash: correctHash,
				hashAlgorithm: "sha256",
			})

			expect(issues.every((i) => i.code !== "INTEGRITY_MISMATCH")).toBe(true)
		})

		it("should detect corruption indicators", async () => {
			const contentWithReplacement = "test\uFFFDcontent" // Replacement character
			const issues = await validator.validateIntegrity(contentWithReplacement)

			expect(issues.some((i) => i.code === "CONTENT_CORRUPTION")).toBe(true)
		})

		it("should detect null bytes", async () => {
			const contentWithNull = "test\x00content"
			const issues = await validator.validateIntegrity(contentWithNull)

			expect(issues.some((i) => i.code === "CONTENT_CORRUPTION")).toBe(true)
		})
	})

	describe("computeHash", () => {
		it("should compute consistent SHA-256 hash", () => {
			const content = "test content"
			const hash1 = validator.computeHash(content, "sha256")
			const hash2 = validator.computeHash(content, "sha256")

			expect(hash1).toBe(hash2)
			expect(hash1).toHaveLength(64) // SHA-256 produces 64 hex characters
		})

		it("should compute consistent MD5 hash", () => {
			const content = "test content"
			const hash1 = validator.computeHash(content, "md5")
			const hash2 = validator.computeHash(content, "md5")

			expect(hash1).toBe(hash2)
			expect(hash1).toHaveLength(32) // MD5 produces 32 hex characters
		})

		it("should produce different hashes for different content", () => {
			const hash1 = validator.computeHash("content 1", "sha256")
			const hash2 = validator.computeHash("content 2", "sha256")

			expect(hash1).not.toBe(hash2)
		})
	})

	describe("getTypedValidation", () => {
		it("should return typed validation result", () => {
			const result = validator.getTypedValidation("# Plan\n\n## Overview", "implementation_plan")

			expect(result.type).toBe("implementation_plan")
			expect(result.isValid).toBe(true)
			expect(result.issues).toBeDefined()
		})

		it("should extract metadata from code", () => {
			const result = validator.getTypedValidation("// File: src/test.ts\nconst x = 1", "code")

			expect(result.extractedMetadata?.files).toBeDefined()
		})

		it("should extract metadata from test results", () => {
			const result = validator.getTypedValidation("5 passed, 2 failed", "test_results")

			expect(result.extractedMetadata?.passed).toBe(5)
			expect(result.extractedMetadata?.failed).toBe(2)
		})

		it("should extract metadata from review report", () => {
			const result = validator.getTypedValidation("Issue: Bug found\nIssue: Another bug", "review_report")

			expect(result.extractedMetadata?.issueCount).toBe(2)
		})
	})

	describe("custom validation rules", () => {
		it("should add custom validation rule", () => {
			const rule: ValidationRule = {
				id: "custom_rule_1",
				name: "Custom Rule",
				description: "A custom validation rule",
				appliesTo: "all",
				priority: 10,
				enabled: true,
				validate: async () => null,
			}

			validator.addValidationRule(rule)
			// No error means success
		})

		it("should remove custom validation rule", () => {
			const rule: ValidationRule = {
				id: "custom_rule_1",
				name: "Custom Rule",
				description: "A custom validation rule",
				appliesTo: "all",
				priority: 10,
				enabled: true,
				validate: async () => null,
			}

			validator.addValidationRule(rule)
			const removed = validator.removeValidationRule("custom_rule_1")

			expect(removed).toBe(true)
		})

		it("should return false when removing non-existent rule", () => {
			const removed = validator.removeValidationRule("non_existent")
			expect(removed).toBe(false)
		})

		it("should apply custom rules during validation", async () => {
			const rule: ValidationRule = {
				id: "custom_rule_1",
				name: "Require Keyword",
				description: "Content must contain 'REQUIRED'",
				appliesTo: "all",
				priority: 10,
				enabled: true,
				validate: async (context) => {
					if (!context.content?.includes("REQUIRED")) {
						return {
							code: "MISSING_KEYWORD",
							message: "Content must contain REQUIRED keyword",
							severity: "error" as const,
						}
					}
					return null
				},
			}

			validator.addValidationRule(rule)

			const artifact = createTestArtifact()
			const result = await validator.validateArtifact(artifact, "test content")

			expect(result.issues.some((i) => i.code === "MISSING_KEYWORD")).toBe(true)
		})

		it("should sort rules by priority", () => {
			const rule1: ValidationRule = {
				id: "rule_1",
				name: "Low Priority",
				description: "Low priority rule",
				appliesTo: "all",
				priority: 1,
				enabled: true,
				validate: async () => null,
			}

			const rule2: ValidationRule = {
				id: "rule_2",
				name: "High Priority",
				description: "High priority rule",
				appliesTo: "all",
				priority: 100,
				enabled: true,
				validate: async () => null,
			}

			validator.addValidationRule(rule1)
			validator.addValidationRule(rule2)

			// Rules should be sorted internally by priority (high first)
			// We can't directly check the order, but we can verify both are added
			expect(validator.removeValidationRule("rule_1")).toBe(true)
			expect(validator.removeValidationRule("rule_2")).toBe(true)
		})

		it("should skip disabled rules", async () => {
			const rule: ValidationRule = {
				id: "disabled_rule",
				name: "Disabled Rule",
				description: "A disabled rule",
				appliesTo: "all",
				priority: 10,
				enabled: false,
				validate: async () => ({
					code: "DISABLED_RULE_ERROR",
					message: "This should not appear",
					severity: "error" as const,
				}),
			}

			validator.addValidationRule(rule)

			const artifact = createTestArtifact()
			const result = await validator.validateArtifact(artifact, validContent)

			expect(result.issues.some((i) => i.code === "DISABLED_RULE_ERROR")).toBe(false)
		})

		it("should handle rule execution errors gracefully", async () => {
			const rule: ValidationRule = {
				id: "error_rule",
				name: "Error Rule",
				description: "A rule that throws",
				appliesTo: "all",
				priority: 10,
				enabled: true,
				validate: async () => {
					throw new Error("Rule execution failed")
				},
			}

			validator.addValidationRule(rule)

			const artifact = createTestArtifact()
			const result = await validator.validateArtifact(artifact, validContent)

			expect(result.issues.some((i) => i.code === "RULE_EXECUTION_ERROR")).toBe(true)
		})
	})

	describe("statistics", () => {
		it("should track validation statistics", async () => {
			const artifact = createTestArtifact()

			await validator.validateArtifact(artifact, validContent)
			await validator.validateArtifact(artifact, "")

			const stats = validator.getStatistics()

			expect(stats.totalValidations).toBe(2)
			expect(stats.successfulValidations).toBe(1)
			expect(stats.failedValidations).toBe(1)
			expect(stats.averageValidationTimeMs).toBeGreaterThanOrEqual(0)
		})

		it("should track errors by code", async () => {
			const artifact = createTestArtifact()

			await validator.validateArtifact(artifact, "")

			const stats = validator.getStatistics()
			expect(stats.errorsByCode["CONTENT_EMPTY"]).toBe(1)
		})

		it("should reset statistics", async () => {
			const artifact = createTestArtifact()

			await validator.validateArtifact(artifact, validContent)
			validator.resetStatistics()

			const stats = validator.getStatistics()
			expect(stats.totalValidations).toBe(0)
		})
	})

	describe("isValid", () => {
		it("should return true for valid artifact", async () => {
			const artifact = createTestArtifact()
			const valid = await validator.isValid(artifact, validContent)

			expect(valid).toBe(true)
		})

		it("should return false for invalid artifact", async () => {
			const artifact = createTestArtifact()
			const valid = await validator.isValid(artifact, "")

			expect(valid).toBe(false)
		})
	})

	describe("validateBeforeDownstream", () => {
		it("should not throw for valid artifact", async () => {
			const artifact = createTestArtifact()

			await expect(validator.validateBeforeDownstream(artifact, validContent)).resolves.not.toThrow()
		})

		it("should throw for invalid artifact", async () => {
			const artifact = createTestArtifact()

			await expect(validator.validateBeforeDownstream(artifact, "")).rejects.toThrow("Artifact validation failed")
		})
	})
})
