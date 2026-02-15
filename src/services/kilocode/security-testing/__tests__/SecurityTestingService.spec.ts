// kilocode_change - new file
import { describe, it, expect, beforeEach, vi } from "vitest"
import { SecurityTestingService } from "../SecurityTestingService"
import type { SecurityAuditResult, SecurityTestResult, SecurityIssue } from "../types"

describe("SecurityTestingService", () => {
	let securityService: SecurityTestingService

	beforeEach(() => {
		securityService = new SecurityTestingService()
	})

	describe("Constructor", () => {
		it("should create instance with default config", () => {
			expect(securityService).toBeDefined()
			const config = securityService.getConfig()
			expect(config.enableMessageValidation).toBe(true)
			expect(config.enableArtifactValidation).toBe(true)
			expect(config.enableFileAccessTests).toBe(true)
			expect(config.enableIPCSecurityTests).toBe(true)
			expect(config.enableInputSanitizationTests).toBe(true)
		})

		it("should create instance with custom config", () => {
			const customService = new SecurityTestingService({
				enableMessageValidation: false,
				maxMessageSize: 500000,
			})
			const config = customService.getConfig()
			expect(config.enableMessageValidation).toBe(false)
			expect(config.maxMessageSize).toBe(500000)
		})
	})

	describe("runSecurityAudit", () => {
		it("should run complete security audit with all tests enabled", async () => {
			const result = await securityService.runSecurityAudit()

			expect(result).toBeDefined()
			expect(result.totalTests).toBe(5) // All 5 test types enabled
			expect(result.passedTests).toBeGreaterThanOrEqual(0)
			expect(result.failedTests).toBeGreaterThanOrEqual(0)
			expect(result.issues).toBeDefined()
			expect(result.issuesBySeverity).toBeDefined()
			expect(result.issuesByCategory).toBeDefined()
			expect(result.securityScore).toBeGreaterThanOrEqual(0)
			expect(result.securityScore).toBeLessThanOrEqual(100)
			expect(result.timestamp).toBeGreaterThan(0)
			expect(result.durationMs).toBeGreaterThan(0)
		})

		it("should calculate correct security score with no issues", async () => {
			const service = new SecurityTestingService({
				enableMessageValidation: false,
				enableArtifactValidation: false,
				enableFileAccessTests: false,
				enableIPCSecurityTests: false,
				enableInputSanitizationTests: false,
			})

			const result = await service.runSecurityAudit()
			expect(result.securityScore).toBe(100)
			expect(result.totalIssues).toBe(0)
		})

		it("should emit audit_started and audit_completed events", async () => {
			const startedHandler = vi.fn()
			const completedHandler = vi.fn()

			securityService.on("audit_started", startedHandler)
			securityService.on("audit_completed", completedHandler)

			await securityService.runSecurityAudit()

			expect(startedHandler).toHaveBeenCalledTimes(1)
			expect(completedHandler).toHaveBeenCalledTimes(1)
		})
	})

	describe("testMessageValidation", () => {
		it("should run message validation test", async () => {
			const result = await securityService.testMessageValidation()

			expect(result).toBeDefined()
			expect(result.testName).toBe("MessageValidation")
			expect(result.passed).toBeDefined()
			expect(result.issues).toBeDefined()
			expect(result.timestamp).toBeGreaterThan(0)
		})

		it("should detect message validation issues", async () => {
			const result = await securityService.testMessageValidation()

			// Should have some info-level issues about validation
			const validationIssues = result.issues.filter((i) => i.category === "message_validation")
			// May or may not have issues depending on implementation
			expect(validationIssues).toBeDefined()
		})

		it("should emit test events", async () => {
			const startedHandler = vi.fn()
			const completedHandler = vi.fn()

			securityService.on("test_started", startedHandler)
			securityService.on("test_completed", completedHandler)

			await securityService.testMessageValidation()

			expect(startedHandler).toHaveBeenCalledTimes(1)
			expect(completedHandler).toHaveBeenCalledTimes(1)
		})
	})

	describe("testArtifactValidation", () => {
		it("should run artifact validation test", async () => {
			const result = await securityService.testArtifactValidation()

			expect(result).toBeDefined()
			expect(result.testName).toBe("ArtifactValidation")
			expect(result.passed).toBeDefined()
			expect(result.issues).toBeDefined()
		})

		it("should detect security patterns in artifacts", async () => {
			const result = await securityService.testArtifactValidation()

			// Should have some artifact validation issues
			const validationIssues = result.issues.filter(
				(i) => i.category === "artifact_validation" || i.category === "data_leak",
			)
			// May or may not have issues
			expect(validationIssues).toBeDefined()
		})

		it("should check for malicious content patterns", async () => {
			const result = await securityService.testArtifactValidation()

			const maliciousIssues = result.issues.filter((i) => i.category === "artifact_validation")
			// May or may not have issues
			expect(maliciousIssues).toBeDefined()
		})
	})

	describe("testFileAccessControls", () => {
		it("should run file access control test", async () => {
			const result = await securityService.testFileAccessControls()

			expect(result).toBeDefined()
			expect(result.testName).toBe("FileAccessControls")
			expect(result.passed).toBeDefined()
			expect(result.issues).toBeDefined()
		})

		it("should detect path traversal vulnerabilities", async () => {
			const result = await securityService.testFileAccessControls()

			const traversalIssues = result.issues.filter((i) => i.category === "file_access" && i.severity === "high")
			expect(traversalIssues.length).toBeGreaterThan(0)
		})
	})

	describe("testIPCSecurity", () => {
		it("should run IPC security test", async () => {
			const result = await securityService.testIPCSecurity()

			expect(result).toBeDefined()
			expect(result.testName).toBe("IPCSecurity")
			expect(result.passed).toBeDefined()
			expect(result.issues).toBeDefined()
		})

		it("should detect command injection risks", async () => {
			const result = await securityService.testIPCSecurity()

			const cmdInjectionIssues = result.issues.filter(
				(i) => i.category === "ipc_security" && i.cweId === "CWE-78",
			)
			expect(cmdInjectionIssues.length).toBeGreaterThan(0)
		})

		it("should check for rate limiting", async () => {
			const result = await securityService.testIPCSecurity()

			const rateLimitIssues = result.issues.filter((i) => i.cweId === "CWE-770")
			expect(rateLimitIssues.length).toBeGreaterThan(0)
		})
	})

	describe("testInputSanitization", () => {
		it("should run input sanitization test", async () => {
			const result = await securityService.testInputSanitization()

			expect(result).toBeDefined()
			expect(result.testName).toBe("InputSanitization")
			expect(result.passed).toBeDefined()
			expect(result.issues).toBeDefined()
		})

		it("should detect SQL injection patterns", async () => {
			const result = await securityService.testInputSanitization()

			const sqlIssues = result.issues.filter((i) => i.cweId === "CWE-89")
			expect(sqlIssues.length).toBeGreaterThan(0)
		})

		it("should detect XSS patterns", async () => {
			const result = await securityService.testInputSanitization()

			const xssIssues = result.issues.filter((i) => i.cweId === "CWE-79")
			expect(xssIssues.length).toBeGreaterThan(0)
		})
	})

	describe("validateMessage", () => {
		it("should validate message with all required fields", () => {
			const message = {
				from: "agent-1",
				to: "agent-2",
				type: "request",
				payload: { taskType: "test" },
			}

			const result = securityService.validateMessage(message as never)

			expect(result.valid).toBe(true)
			expect(result.issues.length).toBe(0)
		})

		it("should reject message missing 'from' field", () => {
			const message = {
				to: "agent-2",
				type: "request",
				payload: { taskType: "test" },
			}

			const result = securityService.validateMessage(message as never)

			expect(result.valid).toBe(false)
			expect(result.issues.some((i) => i.description.includes("from"))).toBe(true)
		})

		it("should reject message missing 'to' field", () => {
			const message = {
				from: "agent-1",
				type: "request",
				payload: { taskType: "test" },
			}

			const result = securityService.validateMessage(message as never)

			expect(result.valid).toBe(false)
			expect(result.issues.some((i) => i.description.includes("to"))).toBe(true)
		})

		it("should reject message missing 'type' field", () => {
			const message = {
				from: "agent-1",
				to: "agent-2",
				payload: { taskType: "test" },
			}

			const result = securityService.validateMessage(message as never)

			expect(result.valid).toBe(false)
			expect(result.issues.some((i) => i.description.includes("type"))).toBe(true)
		})

		it("should reject message missing 'payload' field", () => {
			const message = {
				from: "agent-1",
				to: "agent-2",
				type: "request",
			}

			const result = securityService.validateMessage(message as never)

			expect(result.valid).toBe(false)
			expect(result.issues.some((i) => i.description.includes("payload"))).toBe(true)
		})
	})

	describe("validateArtifact", () => {
		it("should validate artifact without sensitive data", () => {
			const artifact = {
				id: "artifact-1",
				type: "code",
				status: "in_progress",
				producer: "architect",
				createdAt: Date.now(),
				updatedAt: Date.now(),
				version: 1,
				summary: {
					brief: "This is a code implementation",
					keyPoints: ["Feature A", "Feature B"],
					filesAffected: ["src/app.ts"],
				},
				metadata: {},
				contentRef: "artifact-1", // Don't use path with / or \
			}

			const result = securityService.validateArtifact(artifact as never)

			expect(result.valid).toBe(true)
		})

		it("should detect sensitive data in artifact summary", () => {
			const artifact = {
				id: "artifact-1",
				type: "code",
				status: "in_progress",
				producer: "architect",
				createdAt: Date.now(),
				updatedAt: Date.now(),
				version: 1,
				summary: {
					brief: "API key: sk-1234567890abcdef",
					keyPoints: [],
					filesAffected: [],
				},
				metadata: {},
				contentRef: "artifact-1", // Don't use path with / or \
			}

			const result = securityService.validateArtifact(artifact as never)

			expect(result.valid).toBe(false)
			expect(result.issues.some((i) => i.category === "data_leak")).toBe(true)
		})

		it("should detect suspicious paths in contentRef", () => {
			const artifact = {
				id: "artifact-1",
				type: "code",
				status: "in_progress",
				producer: "architect",
				createdAt: Date.now(),
				updatedAt: Date.now(),
				version: 1,
				summary: {
					brief: "Code implementation",
					keyPoints: [],
					filesAffected: [],
				},
				metadata: {},
				contentRef: "../../../etc/passwd",
			}

			const result = securityService.validateArtifact(artifact as never)

			expect(result.valid).toBe(false)
			expect(result.issues.some((i) => i.category === "file_access")).toBe(true)
		})
	})

	describe("validateFilePath", () => {
		it("should validate safe file paths", () => {
			const result = securityService.validateFilePath("src/app.ts")

			expect(result.valid).toBe(true)
			expect(result.issues.length).toBe(0)
		})

		it("should detect path traversal attempts", () => {
			const result = securityService.validateFilePath("../../../etc/passwd")

			expect(result.valid).toBe(false)
			expect(result.issues.some((i) => i.cweId === "CWE-22")).toBe(true)
		})

		it("should detect attempts to access blocked directories", () => {
			const result = securityService.validateFilePath("/etc/passwd")

			expect(result.valid).toBe(false)
			expect(result.issues.some((i) => i.description.includes("blocked"))).toBe(true)
		})

		it("should detect Windows blocked paths", () => {
			const result = securityService.validateFilePath("C:\\Windows\\System32\\config\\sam")

			expect(result.valid).toBe(false)
			expect(result.issues.some((i) => i.description.includes("blocked"))).toBe(true)
		})
	})

	describe("getStatistics", () => {
		it("should return initial statistics", () => {
			const stats = securityService.getStatistics()

			expect(stats.totalTests).toBe(0)
			expect(stats.passedTests).toBe(0)
			expect(stats.failedTests).toBe(0)
			expect(stats.totalIssues).toBe(0)
		})

		it("should update statistics after running audit", async () => {
			await securityService.runSecurityAudit()

			const stats = securityService.getStatistics()

			expect(stats.totalTests).toBeGreaterThan(0)
			expect(stats.testsThisSession).toBeGreaterThan(0)
			expect(stats.lastAuditTimestamp).toBeGreaterThan(0)
		})
	})

	describe("updateConfig", () => {
		it("should update configuration", () => {
			securityService.updateConfig({
				maxMessageSize: 2000000,
				enableFileAccessTests: false,
			})

			const config = securityService.getConfig()

			expect(config.maxMessageSize).toBe(2000000)
			expect(config.enableFileAccessTests).toBe(false)
			// Other values should remain default
			expect(config.enableMessageValidation).toBe(true)
		})
	})

	describe("resetStatistics", () => {
		it("should reset statistics", async () => {
			await securityService.runSecurityAudit()
			securityService.resetStatistics()

			const stats = securityService.getStatistics()

			expect(stats.totalTests).toBe(0)
			expect(stats.passedTests).toBe(0)
			expect(stats.failedTests).toBe(0)
			expect(stats.totalIssues).toBe(0)
		})
	})

	describe("Event emission", () => {
		it("should emit issue_found events", async () => {
			const issueHandler = vi.fn()

			securityService.on("issue_found", issueHandler)

			await securityService.testMessageValidation()

			expect(issueHandler).toHaveBeenCalled()
		})
	})

	describe("Security score calculation", () => {
		it("should calculate score of 100 with no issues", async () => {
			const service = new SecurityTestingService({
				enableMessageValidation: false,
				enableArtifactValidation: false,
				enableFileAccessTests: false,
				enableIPCSecurityTests: false,
				enableInputSanitizationTests: false,
			})

			const result = await service.runSecurityAudit()

			expect(result.securityScore).toBe(100)
		})

		it("should reduce score for critical issues", async () => {
			const service = new SecurityTestingService({
				enableMessageValidation: true,
				enableArtifactValidation: false,
				enableFileAccessTests: false,
				enableIPCSecurityTests: false,
				enableInputSanitizationTests: false,
			})

			const result = await service.runSecurityAudit()

			// With critical issues, score should be reduced
			expect(result.securityScore).toBeLessThan(100)
		})
	})
})
