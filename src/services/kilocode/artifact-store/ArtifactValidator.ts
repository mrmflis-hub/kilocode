// kilocode_change - new file
import { createHash } from "node:crypto"
import { EventEmitter } from "node:events"
import { ArtifactSchema, Artifact, ArtifactType, ArtifactStatus } from "@kilocode/core-schemas"
import {
	ValidationResult,
	ValidationIssue,
	ValidationSeverity,
	ArtifactValidationOptions,
	ContentValidationOptions,
	SchemaValidationOptions,
	IntegrityValidationOptions,
	ValidationStatistics,
	ValidationEvent,
	ValidationEventType,
	TypedContentValidation,
	ArtifactValidationContext,
	ValidationRule,
} from "./ArtifactValidationTypes"

/**
 * Default validation options
 */
const DEFAULT_CONTENT_OPTIONS: Required<ContentValidationOptions> = {
	maxContentSizeBytes: 10 * 1024 * 1024, // 10MB
	minContentLength: 1,
	validateStructure: true,
	customRules: [],
}

const DEFAULT_SCHEMA_OPTIONS: Required<SchemaValidationOptions> = {
	allowUnknown: false,
	strict: true,
}

const DEFAULT_INTEGRITY_OPTIONS: Required<IntegrityValidationOptions> = {
	expectedHash: "",
	hashAlgorithm: "sha256",
}

/**
 * ArtifactValidator - Validates artifact content, schema, and integrity
 *
 * This class provides:
 * - Content validation for different artifact types
 * - Schema validation using Zod schemas
 * - Integrity checks with hash verification
 * - Validation before downstream work
 * - Event emission for validation lifecycle
 */
export class ArtifactValidator extends EventEmitter {
	private statistics: ValidationStatistics = {
		totalValidations: 0,
		successfulValidations: 0,
		failedValidations: 0,
		errorsByCode: {},
		errorsByType: {} as Record<ArtifactType, number>,
		averageValidationTimeMs: 0,
	}

	private customRules: ValidationRule[] = []
	private totalValidationTime = 0

	constructor() {
		super()
	}

	/**
	 * Validate an artifact with all validation types
	 */
	async validateArtifact(
		artifact: Artifact,
		content: string,
		options: ArtifactValidationOptions = {},
	): Promise<ValidationResult> {
		const startTime = Date.now()
		const issues: ValidationIssue[] = []
		const failFast = options.failFast ?? false

		this.emitEvent("validation:started", artifact.id)

		// Content validation
		const contentIssues = await this.validateContent(content, artifact.type, options.content)
		issues.push(...contentIssues)
		if (failFast && issues.some((i) => i.severity === "error")) {
			return this.createResult(artifact.id, issues, startTime)
		}

		// Schema validation
		const schemaIssues = await this.validateSchema(artifact, options.schema)
		issues.push(...schemaIssues)
		if (failFast && issues.some((i) => i.severity === "error")) {
			return this.createResult(artifact.id, issues, startTime)
		}

		// Integrity validation
		const integrityIssues = await this.validateIntegrity(content, options.integrity)
		issues.push(...integrityIssues)

		// Custom rules validation
		const customIssues = await this.validateCustomRules(artifact, content, options)
		issues.push(...customIssues)

		return this.createResult(artifact.id, issues, startTime)
	}

	/**
	 * Validate artifact content
	 */
	async validateContent(
		content: string,
		type: ArtifactType,
		options: ContentValidationOptions = {},
	): Promise<ValidationIssue[]> {
		const opts = { ...DEFAULT_CONTENT_OPTIONS, ...options }
		const issues: ValidationIssue[] = []

		// Check content size
		const contentSize = Buffer.byteLength(content, "utf-8")
		if (contentSize > opts.maxContentSizeBytes) {
			issues.push({
				code: "CONTENT_TOO_LARGE",
				message: `Content size (${contentSize} bytes) exceeds maximum (${opts.maxContentSizeBytes} bytes)`,
				severity: "error",
				context: { contentSize, maxSize: opts.maxContentSizeBytes },
			})
		}

		// Check minimum content length
		if (content.length < opts.minContentLength) {
			issues.push({
				code: "CONTENT_TOO_SHORT",
				message: `Content length (${content.length}) is below minimum (${opts.minContentLength})`,
				severity: "error",
				context: { contentLength: content.length, minLength: opts.minContentLength },
			})
		}

		// Check for empty content
		if (!content.trim()) {
			issues.push({
				code: "CONTENT_EMPTY",
				message: "Content is empty or contains only whitespace",
				severity: "error",
			})
		}

		// Type-specific validation
		if (opts.validateStructure) {
			const typeIssues = this.validateContentForType(content, type)
			issues.push(...typeIssues)
		}

		// Custom content rules
		for (const rule of opts.customRules) {
			if (rule.appliesTo.includes(type)) {
				const issue = rule.validate(content, type)
				if (issue) {
					issues.push(issue)
				}
			}
		}

		return issues
	}

	/**
	 * Validate artifact schema using Zod
	 */
	async validateSchema(artifact: Artifact, options: SchemaValidationOptions = {}): Promise<ValidationIssue[]> {
		const opts = { ...DEFAULT_SCHEMA_OPTIONS, ...options }
		const issues: ValidationIssue[] = []

		try {
			// Use Zod schema for validation
			const result = ArtifactSchema.safeParse(artifact)

			if (!result.success) {
				for (const error of result.error.errors) {
					issues.push({
						code: "SCHEMA_VIOLATION",
						message: error.message,
						severity: "error",
						path: error.path.join("."),
						context: {
							code: error.code,
						},
					})
				}
			}
		} catch (error) {
			issues.push({
				code: "SCHEMA_VALIDATION_ERROR",
				message: `Schema validation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
				severity: "error",
			})
		}

		// Validate required fields
		if (opts.strict) {
			if (!artifact.id || artifact.id.trim() === "") {
				issues.push({
					code: "MISSING_REQUIRED_FIELD",
					message: "Artifact ID is required",
					severity: "error",
					path: "id",
				})
			}

			if (!artifact.producer || artifact.producer.trim() === "") {
				issues.push({
					code: "MISSING_REQUIRED_FIELD",
					message: "Artifact producer is required",
					severity: "error",
					path: "producer",
				})
			}

			if (artifact.version < 1) {
				issues.push({
					code: "INVALID_VERSION",
					message: "Artifact version must be at least 1",
					severity: "error",
					path: "version",
					context: { version: artifact.version },
				})
			}
		}

		return issues
	}

	/**
	 * Validate artifact integrity with hash verification
	 */
	async validateIntegrity(content: string, options: IntegrityValidationOptions = {}): Promise<ValidationIssue[]> {
		const opts = { ...DEFAULT_INTEGRITY_OPTIONS, ...options }
		const issues: ValidationIssue[] = []

		// Compute content hash
		const hash = this.computeHash(content, opts.hashAlgorithm)

		// If expected hash is provided, verify it
		if (opts.expectedHash && opts.expectedHash !== "") {
			if (hash !== opts.expectedHash) {
				issues.push({
					code: "INTEGRITY_MISMATCH",
					message: "Content hash does not match expected hash",
					severity: "error",
					context: {
						expectedHash: opts.expectedHash,
						actualHash: hash,
						algorithm: opts.hashAlgorithm,
					},
				})
			}
		}

		// Check for content corruption indicators
		const corruptionIndicators = [
			{ pattern: /\uFFFD/g, name: "replacement_character" },
			// eslint-disable-next-line no-control-regex
			{ pattern: /\x00/g, name: "null_byte" },
		]

		for (const indicator of corruptionIndicators) {
			if (indicator.pattern.test(content)) {
				issues.push({
					code: "CONTENT_CORRUPTION",
					message: `Content contains ${indicator.name} which may indicate corruption`,
					severity: "warning",
					context: { indicator: indicator.name },
				})
			}
		}

		return issues
	}

	/**
	 * Validate content for specific artifact type
	 */
	validateContentForType(content: string, type: ArtifactType): ValidationIssue[] {
		const issues: ValidationIssue[] = []

		switch (type) {
			case "implementation_plan":
				issues.push(...this.validatePlanContent(content))
				break
			case "pseudocode":
				issues.push(...this.validatePseudocodeContent(content))
				break
			case "code":
				issues.push(...this.validateCodeContent(content))
				break
			case "review_report":
				issues.push(...this.validateReviewContent(content))
				break
			case "documentation":
				issues.push(...this.validateDocumentationContent(content))
				break
			case "test_results":
				issues.push(...this.validateTestResultsContent(content))
				break
			case "user_task":
				issues.push(...this.validateUserTaskContent(content))
				break
			case "error_report":
				issues.push(...this.validateErrorReportContent(content))
				break
		}

		return issues
	}

	/**
	 * Get typed content validation result
	 */
	getTypedValidation(content: string, type: ArtifactType): TypedContentValidation {
		const issues = this.validateContentForType(content, type)
		return {
			type,
			isValid: !issues.some((i) => i.severity === "error"),
			issues,
			extractedMetadata: this.extractMetadata(content, type),
		}
	}

	/**
	 * Add custom validation rule
	 */
	addValidationRule(rule: ValidationRule): void {
		this.customRules.push(rule)
		// Sort by priority (higher first)
		this.customRules.sort((a, b) => b.priority - a.priority)
	}

	/**
	 * Remove custom validation rule
	 */
	removeValidationRule(ruleId: string): boolean {
		const index = this.customRules.findIndex((r) => r.id === ruleId)
		if (index !== -1) {
			this.customRules.splice(index, 1)
			return true
		}
		return false
	}

	/**
	 * Get validation statistics
	 */
	getStatistics(): ValidationStatistics {
		return { ...this.statistics }
	}

	/**
	 * Reset validation statistics
	 */
	resetStatistics(): void {
		this.statistics = {
			totalValidations: 0,
			successfulValidations: 0,
			failedValidations: 0,
			errorsByCode: {},
			errorsByType: {} as Record<ArtifactType, number>,
			averageValidationTimeMs: 0,
		}
		this.totalValidationTime = 0
	}

	/**
	 * Compute hash for content
	 */
	computeHash(content: string, algorithm: "sha256" | "md5" = "sha256"): string {
		return createHash(algorithm).update(content, "utf-8").digest("hex")
	}

	/**
	 * Quick validation check (returns boolean only)
	 */
	async isValid(artifact: Artifact, content: string): Promise<boolean> {
		const result = await this.validateArtifact(artifact, content)
		return result.valid
	}

	/**
	 * Validate before downstream work
	 * Throws if validation fails
	 */
	async validateBeforeDownstream(artifact: Artifact, content: string): Promise<void> {
		const result = await this.validateArtifact(artifact, content)

		if (!result.valid) {
			const errorMessages = result.issues
				.filter((i) => i.severity === "error")
				.map((i) => i.message)
				.join("; ")

			throw new Error(`Artifact validation failed: ${errorMessages}`)
		}
	}

	// Private methods

	private validatePlanContent(content: string): ValidationIssue[] {
		const issues: ValidationIssue[] = []

		// Check for basic plan structure
		if (!content.includes("#") && !content.includes("##")) {
			issues.push({
				code: "PLAN_NO_HEADINGS",
				message: "Implementation plan should contain markdown headings",
				severity: "warning",
			})
		}

		// Check for common plan sections
		const recommendedSections = ["overview", "implementation", "steps", "approach"]
		const hasRecommendedSection = recommendedSections.some((section) => content.toLowerCase().includes(section))

		if (!hasRecommendedSection) {
			issues.push({
				code: "PLAN_NO_STRUCTURE",
				message:
					"Implementation plan should contain structured sections (overview, implementation, steps, or approach)",
				severity: "info",
			})
		}

		return issues
	}

	private validatePseudocodeContent(content: string): ValidationIssue[] {
		const issues: ValidationIssue[] = []

		// Check for file references
		if (!content.includes("file:") && !content.includes("File:")) {
			issues.push({
				code: "PSEUDOCODE_NO_FILES",
				message: "Pseudocode should reference files to be created/modified",
				severity: "warning",
			})
		}

		// Check for code-like structure
		const hasCodeStructure =
			content.includes("{") ||
			content.includes("}") ||
			content.includes("function") ||
			content.includes("class") ||
			content.includes("interface")

		if (!hasCodeStructure) {
			issues.push({
				code: "PSEUDOCODE_NO_STRUCTURE",
				message: "Pseudocode should contain code-like structure",
				severity: "info",
			})
		}

		return issues
	}

	private validateCodeContent(content: string): ValidationIssue[] {
		const issues: ValidationIssue[] = []

		// Check for syntax error indicators
		const syntaxErrorIndicators = [
			{ pattern: /{\s*{/g, name: "double_brace" },
			{ pattern: /}\s*}/g, name: "double_close_brace" },
			{ pattern: /;\s*;/g, name: "double_semicolon" },
		]

		for (const indicator of syntaxErrorIndicators) {
			if (indicator.pattern.test(content)) {
				issues.push({
					code: "CODE_SYNTAX_INDICATOR",
					message: `Code contains potential syntax issue: ${indicator.name}`,
					severity: "warning",
					context: { indicator: indicator.name },
				})
			}
		}

		// Check for TODO/FIXME comments
		if (content.includes("TODO") || content.includes("FIXME")) {
			issues.push({
				code: "CODE_HAS_TODOS",
				message: "Code contains TODO/FIXME comments that should be addressed",
				severity: "info",
			})
		}

		return issues
	}

	private validateReviewContent(content: string): ValidationIssue[] {
		const issues: ValidationIssue[] = []

		// Check for severity indicators
		const hasSeverity =
			content.toLowerCase().includes("critical") ||
			content.toLowerCase().includes("high") ||
			content.toLowerCase().includes("medium") ||
			content.toLowerCase().includes("low") ||
			content.toLowerCase().includes("info")

		if (!hasSeverity) {
			issues.push({
				code: "REVIEW_NO_SEVERITY",
				message: "Review report should indicate issue severity levels",
				severity: "info",
			})
		}

		// Check for verdict
		const hasVerdict =
			content.toLowerCase().includes("approved") ||
			content.toLowerCase().includes("rejected") ||
			content.toLowerCase().includes("needs revision") ||
			content.toLowerCase().includes("needs-revision")

		if (!hasVerdict) {
			issues.push({
				code: "REVIEW_NO_VERDICT",
				message: "Review report should contain a verdict (approved, rejected, or needs revision)",
				severity: "warning",
			})
		}

		return issues
	}

	private validateDocumentationContent(content: string): ValidationIssue[] {
		const issues: ValidationIssue[] = []

		// Check for markdown structure
		if (!content.includes("#") && !content.includes("##")) {
			issues.push({
				code: "DOC_NO_HEADINGS",
				message: "Documentation should contain markdown headings for structure",
				severity: "info",
			})
		}

		// Check for code blocks
		if (content.includes("```")) {
			const codeBlockMatches = content.match(/```/g)
			if (codeBlockMatches && codeBlockMatches.length % 2 !== 0) {
				issues.push({
					code: "DOC_UNCLOSED_CODE_BLOCK",
					message: "Documentation has unclosed code block",
					severity: "warning",
				})
			}
		}

		return issues
	}

	private validateTestResultsContent(content: string): ValidationIssue[] {
		const issues: ValidationIssue[] = []

		// Check for test result indicators
		const hasTestIndicators =
			content.includes("passed") ||
			content.includes("failed") ||
			content.includes("PASS") ||
			content.includes("FAIL") ||
			content.includes("✓") ||
			content.includes("✗")

		if (!hasTestIndicators) {
			issues.push({
				code: "TEST_NO_RESULTS",
				message: "Test results should indicate passed/failed status",
				severity: "warning",
			})
		}

		return issues
	}

	private validateUserTaskContent(content: string): ValidationIssue[] {
		const issues: ValidationIssue[] = []

		// Check for minimum task description
		if (content.length < 10) {
			issues.push({
				code: "TASK_TOO_SHORT",
				message: "User task description is too short to be meaningful",
				severity: "warning",
			})
		}

		return issues
	}

	private validateErrorReportContent(content: string): ValidationIssue[] {
		const issues: ValidationIssue[] = []

		// Check for error indicators
		const hasErrorIndicators =
			content.includes("Error:") ||
			content.includes("error:") ||
			content.includes("Exception") ||
			content.includes("failed") ||
			content.includes("stack")

		if (!hasErrorIndicators) {
			issues.push({
				code: "ERROR_NO_INDICATORS",
				message: "Error report should contain error indicators (Error:, Exception, stack trace)",
				severity: "info",
			})
		}

		return issues
	}

	private extractMetadata(content: string, type: ArtifactType): Record<string, unknown> {
		const metadata: Record<string, unknown> = {}

		switch (type) {
			case "code": {
				// Extract file paths
				const fileMatches = content.match(/(?:\/\/|\/\*|#)\s*File:\s*(.+)/g)
				if (fileMatches) {
					metadata.files = fileMatches.map((m) => m.replace(/(?:\/\/|\/\*|#)\s*File:\s*/, "").trim())
				}
				break
			}
			case "test_results": {
				// Extract pass/fail counts
				const passMatch = content.match(/(\d+)\s+passed/i)
				const failMatch = content.match(/(\d+)\s+failed/i)
				if (passMatch) metadata.passed = parseInt(passMatch[1], 10)
				if (failMatch) metadata.failed = parseInt(failMatch[1], 10)
				break
			}
			case "review_report": {
				// Extract issue count
				const issueMatches = content.match(/issue:/gi)
				metadata.issueCount = issueMatches ? issueMatches.length : 0
				break
			}
		}

		return metadata
	}

	private async validateCustomRules(
		artifact: Artifact,
		content: string,
		options: ArtifactValidationOptions,
	): Promise<ValidationIssue[]> {
		const issues: ValidationIssue[] = []
		const context: ArtifactValidationContext = {
			artifact,
			content,
			options,
			isRevalidation: false,
		}

		for (const rule of this.customRules) {
			if (!rule.enabled) continue

			const appliesToType = rule.appliesTo === "all" || rule.appliesTo.includes(artifact.type)

			if (!appliesToType) continue

			try {
				const issue = await rule.validate(context)
				if (issue) {
					issues.push(issue)
				}
			} catch (error) {
				issues.push({
					code: "RULE_EXECUTION_ERROR",
					message: `Validation rule '${rule.name}' failed: ${error instanceof Error ? error.message : "Unknown error"}`,
					severity: "warning",
					context: { ruleId: rule.id, ruleName: rule.name },
				})
			}
		}

		return issues
	}

	private createResult(artifactId: string, issues: ValidationIssue[], startTime: number): ValidationResult {
		const endTime = Date.now()
		const duration = endTime - startTime

		// Update statistics
		this.statistics.totalValidations++
		this.totalValidationTime += duration
		this.statistics.averageValidationTimeMs = this.totalValidationTime / this.statistics.totalValidations

		const hasErrors = issues.some((i) => i.severity === "error")
		if (hasErrors) {
			this.statistics.failedValidations++
		} else {
			this.statistics.successfulValidations++
		}

		// Update error counts by code
		for (const issue of issues) {
			if (issue.severity === "error") {
				this.statistics.errorsByCode[issue.code] = (this.statistics.errorsByCode[issue.code] || 0) + 1
			}
		}

		const result: ValidationResult = {
			valid: !hasErrors,
			issues,
			validatedAt: endTime,
			artifactId,
		}

		// Emit event
		this.emitEvent(hasErrors ? "validation:failed" : "validation:completed", artifactId, result)

		return result
	}

	private emitEvent(type: ValidationEventType, artifactId: string, result?: ValidationResult): void {
		const event: ValidationEvent = {
			type,
			artifactId,
			result,
			timestamp: Date.now(),
		}
		this.emit(type, event)
	}
}
