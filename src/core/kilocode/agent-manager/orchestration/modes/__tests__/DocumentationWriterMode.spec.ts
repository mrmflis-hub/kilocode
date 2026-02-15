// kilocode_change - new file
/**
 * Documentation Writer Mode Tests
 *
 * Tests for the documentation writer mode configuration and integration
 * with the multi-agent orchestration system.
 */

import { describe, it, expect, beforeEach } from "vitest"
import type { ModeConfig } from "@roo-code/types"
import type { ArtifactType } from "@kilocode/core-schemas"
import {
	DOCUMENTATION_WRITER_MODE_CONFIG,
	DOCUMENTATION_WRITER_INPUT_ARTIFACTS,
	DOCUMENTATION_WRITER_OUTPUT_ARTIFACTS,
	getDocumentationWriterModeConfig,
	validateDocumentationWriterTaskRequest,
	getDocumentationWriterOutputArtifactType,
	getRequiredInputArtifactTypesForDocs,
	requiresCodeAnalysis,
	getDefaultSections,
	getDefaultTargetAudience,
	createEmptyDocumentationArtifact,
	calculateDocumentationCompleteness,
	needsDocumentationUpdate,
	getDocumentationFileExtension,
	getDefaultDocumentationFilename,
	type DocumentationWriterTaskRequest,
	type DocumentationWriterTaskType,
	type DocumentationArtifact,
	type DocumentationItem,
} from "../DocumentationWriterMode"

describe("DocumentationWriterMode", () => {
	describe("DOCUMENTATION_WRITER_MODE_CONFIG", () => {
		it("should have correct slug", () => {
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.slug).toBe("documentation-writer")
		})

		it("should have correct name", () => {
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.name).toBe("Documentation Writer")
		})

		it("should have role definition for multi-agent context", () => {
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.roleDefinition).toContain("multi-agent orchestration system")
		})

		it("should have groups defined", () => {
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.groups).toBeDefined()
			expect(Array.isArray(DOCUMENTATION_WRITER_MODE_CONFIG.groups)).toBe(true)
		})

		it("should have custom instructions for multi-agent workflow", () => {
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.customInstructions).toBeDefined()
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.customInstructions).toContain("Multi-Agent Orchestration Context")
		})

		it("should contain inline documentation guidance", () => {
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.customInstructions).toContain("Inline Documentation")
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.customInstructions).toContain("JSDoc")
		})

		it("should contain external documentation guidance", () => {
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.customInstructions).toContain("External Documentation")
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.customInstructions).toContain("README")
		})

		it("should contain documentation quality guidance", () => {
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.customInstructions).toContain("Documentation Quality")
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.customInstructions).toContain("Clarity")
		})

		it("should contain communication protocol guidance", () => {
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.customInstructions).toContain("Communication Protocol")
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.customInstructions).toContain("document")
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.customInstructions).toContain("document_api")
		})

		it("should contain documentation artifact format guidance", () => {
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.customInstructions).toContain("Documentation Artifact Format")
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.customInstructions).toContain("API Reference")
		})

		it("should emphasize clarity and comprehensiveness", () => {
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.roleDefinition).toContain("clear")
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.roleDefinition).toContain("comprehensive")
		})

		it("should contain JSDoc format guidance", () => {
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.customInstructions).toContain("JSDoc Format")
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.customInstructions).toContain("@param")
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.customInstructions).toContain("@returns")
		})

		it("should contain quality guidelines", () => {
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.customInstructions).toContain("Quality Guidelines")
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.customInstructions).toContain("Be Clear")
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.customInstructions).toContain("Be Complete")
		})
	})

	describe("DOCUMENTATION_WRITER_INPUT_ARTIFACTS", () => {
		it("should include code", () => {
			expect(DOCUMENTATION_WRITER_INPUT_ARTIFACTS).toContain("code")
		})

		it("should include implementation_plan", () => {
			expect(DOCUMENTATION_WRITER_INPUT_ARTIFACTS).toContain("implementation_plan")
		})

		it("should have exactly expected artifact types", () => {
			expect(DOCUMENTATION_WRITER_INPUT_ARTIFACTS).toHaveLength(2)
			expect(DOCUMENTATION_WRITER_INPUT_ARTIFACTS).toEqual(["code", "implementation_plan"])
		})
	})

	describe("DOCUMENTATION_WRITER_OUTPUT_ARTIFACTS", () => {
		it("should include documentation", () => {
			expect(DOCUMENTATION_WRITER_OUTPUT_ARTIFACTS).toContain("documentation")
		})

		it("should have only expected artifact types", () => {
			expect(DOCUMENTATION_WRITER_OUTPUT_ARTIFACTS).toHaveLength(1)
			expect(DOCUMENTATION_WRITER_OUTPUT_ARTIFACTS).toEqual(["documentation"])
		})
	})

	describe("getDocumentationWriterModeConfig", () => {
		it("should return the documentation writer mode config", () => {
			const config = getDocumentationWriterModeConfig()
			expect(config.slug).toBe("documentation-writer")
			expect(config).toEqual(DOCUMENTATION_WRITER_MODE_CONFIG)
		})
	})

	describe("validateDocumentationWriterTaskRequest", () => {
		it("should return true for valid document request with artifactId", () => {
			const request: DocumentationWriterTaskRequest = {
				taskType: "document",
				userTask: "Document the code",
				context: {
					artifactId: "code-123",
				},
			}
			expect(validateDocumentationWriterTaskRequest(request)).toBe(true)
		})

		it("should return true for valid document_api request with artifactId", () => {
			const request: DocumentationWriterTaskRequest = {
				taskType: "document_api",
				userTask: "Document the API",
				context: {
					artifactId: "code-456",
				},
			}
			expect(validateDocumentationWriterTaskRequest(request)).toBe(true)
		})

		it("should return true for valid document_inline request with artifactId", () => {
			const request: DocumentationWriterTaskRequest = {
				taskType: "document_inline",
				userTask: "Add inline documentation",
				context: {
					artifactId: "code-789",
				},
			}
			expect(validateDocumentationWriterTaskRequest(request)).toBe(true)
		})

		it("should return true for create_readme request without artifactId", () => {
			const request: DocumentationWriterTaskRequest = {
				taskType: "create_readme",
				userTask: "Create a README file",
			}
			expect(validateDocumentationWriterTaskRequest(request)).toBe(true)
		})

		it("should return true for update_readme request with artifactId", () => {
			const request: DocumentationWriterTaskRequest = {
				taskType: "update_readme",
				userTask: "Update the README file",
				context: {
					artifactId: "code-123",
				},
			}
			expect(validateDocumentationWriterTaskRequest(request)).toBe(true)
		})

		it("should return true for create_user_guide request without artifactId", () => {
			const request: DocumentationWriterTaskRequest = {
				taskType: "create_user_guide",
				userTask: "Create a user guide",
			}
			expect(validateDocumentationWriterTaskRequest(request)).toBe(true)
		})

		it("should return true for create_contributing_guide request without artifactId", () => {
			const request: DocumentationWriterTaskRequest = {
				taskType: "create_contributing_guide",
				userTask: "Create a contributing guide",
			}
			expect(validateDocumentationWriterTaskRequest(request)).toBe(true)
		})

		it("should return false for missing taskType", () => {
			const request = {
				userTask: "Document the code",
				context: { artifactId: "code-123" },
			} as DocumentationWriterTaskRequest
			expect(validateDocumentationWriterTaskRequest(request)).toBe(false)
		})

		it("should return false for missing userTask", () => {
			const request = {
				taskType: "document",
				context: { artifactId: "code-123" },
			} as DocumentationWriterTaskRequest
			expect(validateDocumentationWriterTaskRequest(request)).toBe(false)
		})

		it("should return false for invalid taskType", () => {
			const request = {
				taskType: "invalid_type",
				userTask: "Document the code",
				context: { artifactId: "code-123" },
			} as unknown as DocumentationWriterTaskRequest
			expect(validateDocumentationWriterTaskRequest(request)).toBe(false)
		})

		it("should return false for document request without artifactId", () => {
			const request: DocumentationWriterTaskRequest = {
				taskType: "document",
				userTask: "Document the code",
			}
			expect(validateDocumentationWriterTaskRequest(request)).toBe(false)
		})

		it("should return false for document_api request without artifactId", () => {
			const request: DocumentationWriterTaskRequest = {
				taskType: "document_api",
				userTask: "Document the API",
			}
			expect(validateDocumentationWriterTaskRequest(request)).toBe(false)
		})
	})

	describe("getDocumentationWriterOutputArtifactType", () => {
		it("should return documentation for document task", () => {
			expect(getDocumentationWriterOutputArtifactType("document")).toBe("documentation")
		})

		it("should return documentation for document_api task", () => {
			expect(getDocumentationWriterOutputArtifactType("document_api")).toBe("documentation")
		})

		it("should return documentation for document_inline task", () => {
			expect(getDocumentationWriterOutputArtifactType("document_inline")).toBe("documentation")
		})

		it("should return documentation for create_readme task", () => {
			expect(getDocumentationWriterOutputArtifactType("create_readme")).toBe("documentation")
		})

		it("should return documentation for update_readme task", () => {
			expect(getDocumentationWriterOutputArtifactType("update_readme")).toBe("documentation")
		})

		it("should return documentation for create_user_guide task", () => {
			expect(getDocumentationWriterOutputArtifactType("create_user_guide")).toBe("documentation")
		})

		it("should return documentation for create_contributing_guide task", () => {
			expect(getDocumentationWriterOutputArtifactType("create_contributing_guide")).toBe("documentation")
		})
	})

	describe("getRequiredInputArtifactTypesForDocs", () => {
		it("should return code for document task", () => {
			expect(getRequiredInputArtifactTypesForDocs("document")).toEqual(["code"])
		})

		it("should return code for document_api task", () => {
			expect(getRequiredInputArtifactTypesForDocs("document_api")).toEqual(["code"])
		})

		it("should return code for document_inline task", () => {
			expect(getRequiredInputArtifactTypesForDocs("document_inline")).toEqual(["code"])
		})

		it("should return code for update_readme task", () => {
			expect(getRequiredInputArtifactTypesForDocs("update_readme")).toEqual(["code"])
		})

		it("should return empty array for create_readme task", () => {
			expect(getRequiredInputArtifactTypesForDocs("create_readme")).toEqual([])
		})

		it("should return empty array for create_user_guide task", () => {
			expect(getRequiredInputArtifactTypesForDocs("create_user_guide")).toEqual([])
		})

		it("should return empty array for create_contributing_guide task", () => {
			expect(getRequiredInputArtifactTypesForDocs("create_contributing_guide")).toEqual([])
		})
	})

	describe("requiresCodeAnalysis", () => {
		it("should return true for document task", () => {
			expect(requiresCodeAnalysis("document")).toBe(true)
		})

		it("should return true for document_api task", () => {
			expect(requiresCodeAnalysis("document_api")).toBe(true)
		})

		it("should return true for document_inline task", () => {
			expect(requiresCodeAnalysis("document_inline")).toBe(true)
		})

		it("should return true for update_readme task", () => {
			expect(requiresCodeAnalysis("update_readme")).toBe(true)
		})

		it("should return false for create_readme task", () => {
			expect(requiresCodeAnalysis("create_readme")).toBe(false)
		})

		it("should return false for create_user_guide task", () => {
			expect(requiresCodeAnalysis("create_user_guide")).toBe(false)
		})

		it("should return false for create_contributing_guide task", () => {
			expect(requiresCodeAnalysis("create_contributing_guide")).toBe(false)
		})
	})

	describe("getDefaultSections", () => {
		it("should return correct sections for document task", () => {
			const sections = getDefaultSections("document")
			expect(sections).toContain("overview")
			expect(sections).toContain("api-reference")
			expect(sections).toContain("examples")
			expect(sections).toContain("best-practices")
		})

		it("should return correct sections for document_api task", () => {
			const sections = getDefaultSections("document_api")
			expect(sections).toContain("overview")
			expect(sections).toContain("api-reference")
		})

		it("should return correct sections for create_readme task", () => {
			const sections = getDefaultSections("create_readme")
			expect(sections).toContain("overview")
			expect(sections).toContain("usage-guide")
			expect(sections).toContain("examples")
		})

		it("should return correct sections for update_readme task", () => {
			const sections = getDefaultSections("update_readme")
			expect(sections).toContain("overview")
			expect(sections).toContain("usage-guide")
		})

		it("should return correct sections for create_user_guide task", () => {
			const sections = getDefaultSections("create_user_guide")
			expect(sections).toContain("overview")
			expect(sections).toContain("usage-guide")
			expect(sections).toContain("troubleshooting")
		})

		it("should return correct sections for create_contributing_guide task", () => {
			const sections = getDefaultSections("create_contributing_guide")
			expect(sections).toContain("overview")
			expect(sections).toContain("best-practices")
		})

		it("should return empty array for document_inline task", () => {
			const sections = getDefaultSections("document_inline")
			expect(sections).toEqual([])
		})
	})

	describe("getDefaultTargetAudience", () => {
		it("should return developers for document task", () => {
			expect(getDefaultTargetAudience("document")).toBe("developers")
		})

		it("should return developers for document_api task", () => {
			expect(getDefaultTargetAudience("document_api")).toBe("developers")
		})

		it("should return developers for document_inline task", () => {
			expect(getDefaultTargetAudience("document_inline")).toBe("developers")
		})

		it("should return developers for create_contributing_guide task", () => {
			expect(getDefaultTargetAudience("create_contributing_guide")).toBe("developers")
		})

		it("should return users for create_user_guide task", () => {
			expect(getDefaultTargetAudience("create_user_guide")).toBe("users")
		})

		it("should return both for create_readme task", () => {
			expect(getDefaultTargetAudience("create_readme")).toBe("both")
		})

		it("should return both for update_readme task", () => {
			expect(getDefaultTargetAudience("update_readme")).toBe("both")
		})
	})

	describe("createEmptyDocumentationArtifact", () => {
		it("should create artifact with provided artifactId", () => {
			const artifact = createEmptyDocumentationArtifact("doc-123")
			expect(artifact.artifactId).toBe("doc-123")
		})

		it("should create artifact with empty title", () => {
			const artifact = createEmptyDocumentationArtifact("doc-123")
			expect(artifact.title).toBe("")
		})

		it("should create artifact with empty description", () => {
			const artifact = createEmptyDocumentationArtifact("doc-123")
			expect(artifact.description).toBe("")
		})

		it("should create artifact with empty items array", () => {
			const artifact = createEmptyDocumentationArtifact("doc-123")
			expect(artifact.items).toEqual([])
		})

		it("should create artifact with empty sections array", () => {
			const artifact = createEmptyDocumentationArtifact("doc-123")
			expect(artifact.sections).toEqual([])
		})

		it("should create artifact with zeroed summary", () => {
			const artifact = createEmptyDocumentationArtifact("doc-123")
			expect(artifact.summary.filesDocumented).toBe(0)
			expect(artifact.summary.itemsDocumented).toBe(0)
			expect(artifact.summary.examplesAdded).toBe(0)
			expect(artifact.summary.gapsIdentified).toEqual([])
		})
	})

	describe("calculateDocumentationCompleteness", () => {
		it("should return 0 for empty artifact", () => {
			const artifact = createEmptyDocumentationArtifact("doc-123")
			expect(calculateDocumentationCompleteness(artifact)).toBe(0)
		})

		it("should return higher score for items with descriptions", () => {
			const artifactWithDescription: DocumentationArtifact = {
				...createEmptyDocumentationArtifact("doc-123"),
				items: [
					{
						name: "testFunction",
						type: "function",
						description: "A test function",
					},
				],
			}
			const artifactWithoutDescription: DocumentationArtifact = {
				...createEmptyDocumentationArtifact("doc-456"),
				items: [
					{
						name: "testFunction",
						type: "function",
						description: "",
					},
				],
			}
			const scoreWith = calculateDocumentationCompleteness(artifactWithDescription)
			const scoreWithout = calculateDocumentationCompleteness(artifactWithoutDescription)
			expect(scoreWith).toBeGreaterThan(scoreWithout)
		})

		it("should return higher score for items with examples", () => {
			const artifactWithExample: DocumentationArtifact = {
				...createEmptyDocumentationArtifact("doc-123"),
				items: [
					{
						name: "testFunction",
						type: "function",
						description: "A test function",
						examples: ["const result = testFunction()"],
					},
				],
			}
			const artifactWithoutExample: DocumentationArtifact = {
				...createEmptyDocumentationArtifact("doc-456"),
				items: [
					{
						name: "testFunction",
						type: "function",
						description: "A test function",
						examples: [],
					},
				],
			}
			const scoreWith = calculateDocumentationCompleteness(artifactWithExample)
			const scoreWithout = calculateDocumentationCompleteness(artifactWithoutExample)
			expect(scoreWith).toBeGreaterThan(scoreWithout)
		})

		it("should return higher score for items with documented parameters", () => {
			const artifactWithParams: DocumentationArtifact = {
				...createEmptyDocumentationArtifact("doc-123"),
				items: [
					{
						name: "testFunction",
						type: "function",
						description: "A test function",
						parameters: [
							{ name: "param1", type: "string", description: "First parameter" },
							{ name: "param2", type: "number", description: "Second parameter" },
						],
					},
				],
			}
			const artifactWithoutParamDocs: DocumentationArtifact = {
				...createEmptyDocumentationArtifact("doc-456"),
				items: [
					{
						name: "testFunction",
						type: "function",
						description: "A test function",
						parameters: [
							{ name: "param1", type: "string", description: "" },
							{ name: "param2", type: "number", description: "" },
						],
					},
				],
			}
			const scoreWith = calculateDocumentationCompleteness(artifactWithParams)
			const scoreWithout = calculateDocumentationCompleteness(artifactWithoutParamDocs)
			expect(scoreWith).toBeGreaterThan(scoreWithout)
		})

		it("should return higher score for items with return documentation", () => {
			const artifactWithReturns: DocumentationArtifact = {
				...createEmptyDocumentationArtifact("doc-123"),
				items: [
					{
						name: "testFunction",
						type: "function",
						description: "A test function",
						returns: { type: "string", description: "The result" },
					},
				],
			}
			const artifactWithoutReturns: DocumentationArtifact = {
				...createEmptyDocumentationArtifact("doc-456"),
				items: [
					{
						name: "testFunction",
						type: "function",
						description: "A test function",
						returns: { type: "string", description: "" },
					},
				],
			}
			const scoreWith = calculateDocumentationCompleteness(artifactWithReturns)
			const scoreWithout = calculateDocumentationCompleteness(artifactWithoutReturns)
			expect(scoreWith).toBeGreaterThan(scoreWithout)
		})

		it("should return 100 for fully documented item", () => {
			const artifact: DocumentationArtifact = {
				...createEmptyDocumentationArtifact("doc-123"),
				items: [
					{
						name: "testFunction",
						type: "function",
						description: "A test function that does something useful",
						parameters: [{ name: "param1", type: "string", description: "First parameter" }],
						returns: { type: "string", description: "The result string" },
						examples: ["const result = testFunction('test')"],
					},
				],
			}
			const score = calculateDocumentationCompleteness(artifact)
			expect(score).toBeGreaterThan(50)
		})
	})

	describe("needsDocumentationUpdate", () => {
		it("should return true for empty artifact", () => {
			const artifact = createEmptyDocumentationArtifact("doc-123")
			expect(needsDocumentationUpdate(artifact)).toBe(true)
		})

		it("should return true for artifact with gaps identified", () => {
			const artifact: DocumentationArtifact = {
				...createEmptyDocumentationArtifact("doc-123"),
				items: [
					{
						name: "testFunction",
						type: "function",
						description: "A test function",
						examples: ["const result = testFunction()"],
					},
				],
				summary: {
					filesDocumented: 1,
					itemsDocumented: 1,
					examplesAdded: 1,
					gapsIdentified: ["Missing documentation for private methods"],
				},
			}
			expect(needsDocumentationUpdate(artifact)).toBe(true)
		})

		it("should return true for artifact with low completeness", () => {
			const artifact: DocumentationArtifact = {
				...createEmptyDocumentationArtifact("doc-123"),
				items: [
					{
						name: "testFunction",
						type: "function",
						description: "",
					},
				],
			}
			expect(needsDocumentationUpdate(artifact)).toBe(true)
		})
	})

	describe("getDocumentationFileExtension", () => {
		it("should return md for create_readme task", () => {
			expect(getDocumentationFileExtension("create_readme")).toBe("md")
		})

		it("should return md for update_readme task", () => {
			expect(getDocumentationFileExtension("update_readme")).toBe("md")
		})

		it("should return md for create_user_guide task", () => {
			expect(getDocumentationFileExtension("create_user_guide")).toBe("md")
		})

		it("should return md for create_contributing_guide task", () => {
			expect(getDocumentationFileExtension("create_contributing_guide")).toBe("md")
		})

		it("should return md for document task", () => {
			expect(getDocumentationFileExtension("document")).toBe("md")
		})

		it("should return md for document_api task", () => {
			expect(getDocumentationFileExtension("document_api")).toBe("md")
		})
	})

	describe("getDefaultDocumentationFilename", () => {
		it("should return README.md for create_readme task", () => {
			expect(getDefaultDocumentationFilename("create_readme")).toBe("README.md")
		})

		it("should return README.md for update_readme task", () => {
			expect(getDefaultDocumentationFilename("update_readme")).toBe("README.md")
		})

		it("should return USER_GUIDE.md for create_user_guide task", () => {
			expect(getDefaultDocumentationFilename("create_user_guide")).toBe("USER_GUIDE.md")
		})

		it("should return CONTRIBUTING.md for create_contributing_guide task", () => {
			expect(getDefaultDocumentationFilename("create_contributing_guide")).toBe("CONTRIBUTING.md")
		})

		it("should return DOCUMENTATION.md for document task", () => {
			expect(getDefaultDocumentationFilename("document")).toBe("DOCUMENTATION.md")
		})

		it("should return DOCUMENTATION.md for document_api task", () => {
			expect(getDefaultDocumentationFilename("document_api")).toBe("DOCUMENTATION.md")
		})
	})

	describe("Type Exports", () => {
		it("should export DocumentationWriterTaskType type", () => {
			const taskType: DocumentationWriterTaskType = "document"
			expect(taskType).toBe("document")
		})

		it("should export DocumentationWriterTaskRequest interface", () => {
			const request: DocumentationWriterTaskRequest = {
				taskType: "document",
				userTask: "Test task",
			}
			expect(request.taskType).toBe("document")
		})

		it("should export DocumentationArtifact interface", () => {
			const artifact: DocumentationArtifact = createEmptyDocumentationArtifact("test")
			expect(artifact.artifactId).toBe("test")
		})

		it("should export DocumentationItem interface", () => {
			const item: DocumentationItem = {
				name: "testFunction",
				type: "function",
				description: "A test function",
			}
			expect(item.name).toBe("testFunction")
		})
	})

	describe("Mode Configuration Validation", () => {
		it("should be a valid ModeConfig", () => {
			const config = getDocumentationWriterModeConfig()
			expect(config).toHaveProperty("slug")
			expect(config).toHaveProperty("name")
			expect(config).toHaveProperty("roleDefinition")
			expect(config).toHaveProperty("groups")
		})

		it("should have read group for code analysis", () => {
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.groups).toContain("read")
		})

		it("should have edit group for writing documentation", () => {
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.groups).toContain("edit")
		})

		it("should have browser group for research", () => {
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.groups).toContain("browser")
		})

		it("should have mcp group for tool access", () => {
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.groups).toContain("mcp")
		})
	})

	describe("Role Definition Alignment", () => {
		it("should align with documentation-writer role from RoleDefinitions", () => {
			// The mode slug should match the role ID
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.slug).toBe("documentation-writer")
		})

		it("should have input artifacts matching role definition", () => {
			// From documentation.md: inputArtifactTypes: ["code"]
			expect(DOCUMENTATION_WRITER_INPUT_ARTIFACTS).toContain("code")
		})

		it("should have output artifacts matching role definition", () => {
			// From documentation.md: outputArtifactTypes: ["documentation"]
			expect(DOCUMENTATION_WRITER_OUTPUT_ARTIFACTS).toContain("documentation")
		})
	})

	describe("Custom Instructions Content", () => {
		it("should contain tool usage guidance", () => {
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.customInstructions).toContain("Tool Usage")
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.customInstructions).toContain("read_file")
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.customInstructions).toContain("write_file")
		})

		it("should contain documentation types section", () => {
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.customInstructions).toContain("Documentation Types")
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.customInstructions).toContain("Inline Documentation")
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.customInstructions).toContain("API Documentation")
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.customInstructions).toContain("User Documentation")
		})

		it("should contain documentation approach section", () => {
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.customInstructions).toContain("Documentation Approach")
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.customInstructions).toContain("For Code Documentation")
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.customInstructions).toContain("For README Files")
		})

		it("should emphasize importance of examples", () => {
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.customInstructions).toContain("Examples")
			expect(DOCUMENTATION_WRITER_MODE_CONFIG.customInstructions).toContain("examples")
		})
	})
})
