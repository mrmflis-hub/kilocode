// kilocode_change - new file
import { ArtifactType, ArtifactSummary } from "@kilocode/core-schemas"

/**
 * Default maximum summary length in characters
 */
const DEFAULT_MAX_SUMMARY_LENGTH = 500

/**
 * Strategies for generating summaries for different artifact types.
 * Each strategy extracts key information relevant to that artifact type.
 */
export class ArtifactSummarizer {
	private readonly maxSummaryLength: number

	constructor(maxSummaryLength: number = DEFAULT_MAX_SUMMARY_LENGTH) {
		this.maxSummaryLength = maxSummaryLength
	}

	/**
	 * Generate a summary for an artifact based on its type
	 */
	generateSummary(type: ArtifactType, content: string): ArtifactSummary {
		switch (type) {
			case "user_task":
				return this.summarizeUserTask(content)
			case "implementation_plan":
				return this.summarizeImplementationPlan(content)
			case "pseudocode":
				return this.summarizePseudocode(content)
			case "code":
				return this.summarizeCode(content)
			case "review_report":
				return this.summarizeReviewReport(content)
			case "documentation":
				return this.summarizeDocumentation(content)
			case "test_results":
				return this.summarizeTestResults(content)
			case "error_report":
				return this.summarizeErrorReport(content)
			default:
				return this.generateGenericSummary(content)
		}
	}

	/**
	 * Summarize a user task artifact
	 */
	private summarizeUserTask(content: string): ArtifactSummary {
		const lines = this.getNonEmptyLines(content)
		const brief = this.truncate(lines[0] || "User task", this.maxSummaryLength)

		return {
			brief,
			keyPoints: this.extractKeyPoints(content, 5),
			filesAffected: [],
		}
	}

	/**
	 * Summarize an implementation plan artifact
	 */
	private summarizeImplementationPlan(content: string): ArtifactSummary {
		const lines = this.getNonEmptyLines(content)
		const brief = this.truncate(lines[0] || "Implementation plan", this.maxSummaryLength)

		// Extract key points from markdown headings
		const keyPoints = this.extractMarkdownHeadings(content, 5)

		// Extract files mentioned
		const filesAffected = this.extractFilePaths(content)

		return {
			brief,
			keyPoints,
			filesAffected,
			metrics: {
				linesOfCode: this.countLines(content),
			},
		}
	}

	/**
	 * Summarize a pseudocode artifact
	 */
	private summarizePseudocode(content: string): ArtifactSummary {
		// Count files mentioned
		const fileMatches = content.match(/(?:file:|File:|\/\/\s*File:)\s*([^\n]+)/gi) || []
		const filesAffected = fileMatches
			.map((m) => m.replace(/^(?:file:|File:|\/\/\s*File:)\s*/i, "").trim())
			.filter((f) => f.length > 0)

		const brief =
			filesAffected.length > 0
				? `${filesAffected.length} file${filesAffected.length !== 1 ? "s" : ""} with pseudocode`
				: "Pseudocode structure"

		// Extract function/class names
		const keyPoints = this.extractPseudocodeStructures(content)

		return {
			brief,
			keyPoints,
			filesAffected,
			metrics: {
				linesOfCode: this.countLines(content),
			},
		}
	}

	/**
	 * Summarize a code artifact
	 */
	private summarizeCode(content: string): ArtifactSummary {
		// Extract file path if present
		const pathMatch = content.match(/(?:\/\/\s*File:|\/\*\s*File:)\s*([^\n*]+)/i)
		const filePath = pathMatch?.[1]?.trim()

		const brief = filePath ? `Code for ${filePath}` : "Code implementation"

		// Extract function/class names
		const keyPoints = this.extractCodeStructures(content)

		// Extract all file paths mentioned
		const filesAffected = filePath ? [filePath] : this.extractFilePaths(content)

		return {
			brief,
			keyPoints,
			filesAffected,
			metrics: {
				linesOfCode: this.countLines(content),
			},
		}
	}

	/**
	 * Summarize a review report artifact
	 */
	private summarizeReviewReport(content: string): ArtifactSummary {
		// Count issues found
		const issueMatches = content.match(/(?:issue:|Issue:|ISSUE:|[-*]\s*\d+\.|###\s*Issue)/gi) || []
		const issueCount = issueMatches.length

		// Determine severity
		const hasCritical = /critical|severe|urgent/i.test(content)
		const hasHigh = /high|major|important/i.test(content)
		const severity = hasCritical ? "critical" : hasHigh ? "high" : "medium"

		const brief =
			issueCount > 0 ? `${issueCount} issue${issueCount !== 1 ? "s" : ""} found in review` : "Review completed"

		// Extract issue summaries
		const keyPoints = this.extractIssues(content, 5)

		// Extract files mentioned
		const filesAffected = this.extractFilePaths(content)

		return {
			brief,
			keyPoints,
			filesAffected,
			metrics: {
				issuesFound: issueCount,
			},
		}
	}

	/**
	 * Summarize a documentation artifact
	 */
	private summarizeDocumentation(content: string): ArtifactSummary {
		const lines = this.getNonEmptyLines(content)
		const brief = this.truncate(lines[0] || "Documentation", this.maxSummaryLength)

		// Extract section headings
		const keyPoints = this.extractMarkdownHeadings(content, 5)

		// Extract files mentioned
		const filesAffected = this.extractFilePaths(content)

		return {
			brief,
			keyPoints,
			filesAffected,
		}
	}

	/**
	 * Summarize a test results artifact
	 */
	private summarizeTestResults(content: string): ArtifactSummary {
		// Extract pass/fail counts
		const passMatch = content.match(/(\d+)\s*(?:passed|passing|PASS)/i)
		const failMatch = content.match(/(\d+)\s*(?:failed|failing|FAIL)/i)
		const skipMatch = content.match(/(\d+)\s*(?:skipped|skipping|SKIP)/i)

		const passed = passMatch ? parseInt(passMatch[1], 10) : 0
		const failed = failMatch ? parseInt(failMatch[1], 10) : 0
		const skipped = skipMatch ? parseInt(skipMatch[1], 10) : 0

		const brief = `Tests: ${passed} passed, ${failed} failed${skipped > 0 ? `, ${skipped} skipped` : ""}`

		// Extract failed test names
		const keyPoints = this.extractFailedTests(content, 5)

		return {
			brief,
			keyPoints,
			filesAffected: [],
			metrics: {
				testsCount: passed + failed + skipped,
			},
		}
	}

	/**
	 * Summarize an error report artifact
	 */
	private summarizeErrorReport(content: string): ArtifactSummary {
		const lines = this.getNonEmptyLines(content)
		const brief = this.truncate(lines[0] || "Error report", this.maxSummaryLength)

		// Extract error messages
		const keyPoints = this.extractErrors(content, 5)

		// Extract files mentioned
		const filesAffected = this.extractFilePaths(content)

		return {
			brief,
			keyPoints,
			filesAffected,
		}
	}

	/**
	 * Generate a generic summary for unknown artifact types
	 */
	private generateGenericSummary(content: string): ArtifactSummary {
		const lines = this.getNonEmptyLines(content)
		const brief = this.truncate(lines[0] || "Artifact", this.maxSummaryLength)

		return {
			brief,
			keyPoints: this.extractKeyPoints(content, 5),
			filesAffected: this.extractFilePaths(content),
		}
	}

	// Helper methods

	/**
	 * Get non-empty lines from content
	 */
	private getNonEmptyLines(content: string): string[] {
		return content.split("\n").filter((line) => line.trim().length > 0)
	}

	/**
	 * Truncate text to maximum length
	 */
	private truncate(text: string, maxLength: number): string {
		if (text.length <= maxLength) return text
		return text.substring(0, maxLength - 3) + "..."
	}

	/**
	 * Count lines in content
	 */
	private countLines(content: string): number {
		return content.split("\n").length
	}

	/**
	 * Extract key points from content (first N non-empty lines)
	 */
	private extractKeyPoints(content: string, maxPoints: number): string[] {
		return this.getNonEmptyLines(content)
			.slice(0, maxPoints)
			.map((line) => this.truncate(line.trim(), 100))
	}

	/**
	 * Extract markdown headings from content
	 */
	private extractMarkdownHeadings(content: string, maxPoints: number): string[] {
		const headingMatches = content.match(/^#{1,3}\s+.+$/gm) || []
		return headingMatches
			.slice(0, maxPoints)
			.map((h) => h.replace(/^#+\s+/, "").trim())
			.map((h) => this.truncate(h, 100))
	}

	/**
	 * Extract file paths from content
	 */
	private extractFilePaths(content: string): string[] {
		// Match common file path patterns including:
		// - Relative paths: ./path, ../path, path/to/file.ext
		// - Absolute paths: /path/to/file.ext, C:\path\to\file.ext
		// - Simple filenames: file.ext
		const pathMatches =
			content.match(
				/(?:^|[^\w/])(\.?\.?\/[\w./-]+\.[\w]+|[a-zA-Z]:\\[\w.\\-]+\.[\w]+|\/[\w./-]+\.[\w]+|[\w-]+\/[\w./-]+\.[\w]+|\b[\w-]+\.[\w]{1,10})/g,
			) || []

		// Clean up and deduplicate
		const paths = pathMatches
			.map((p) => p.trim())
			.filter((p) => p.length > 0 && !p.startsWith("#"))
			.filter((p, i, arr) => arr.indexOf(p) === i) // deduplicate

		return paths.slice(0, 20) // Limit to 20 files
	}

	/**
	 * Extract pseudocode structures (function/class names)
	 */
	private extractPseudocodeStructures(content: string): string[] {
		const structures: string[] = []

		// Match function definitions
		const funcMatches = content.match(/(?:function|func|def)\s+(\w+)/gi) || []
		structures.push(...funcMatches.map((m) => m.replace(/^(?:function|func|def)\s+/i, "")))

		// Match class definitions
		const classMatches = content.match(/(?:class|interface)\s+(\w+)/gi) || []
		structures.push(...classMatches.map((m) => m.replace(/^(?:class|interface)\s+/i, "")))

		return structures.slice(0, 10).map((s) => `Structure: ${s}`)
	}

	/**
	 * Extract code structures (function/class names)
	 */
	private extractCodeStructures(content: string): string[] {
		const structures: string[] = []

		// Match TypeScript/JavaScript function definitions
		const funcMatches =
			content.match(
				/(?:export\s+)?(?:async\s+)?(?:function\s+\w+|const\s+\w+\s*=\s*(?:async\s*)?\(|class\s+\w+)/g,
			) || []
		structures.push(
			...funcMatches.map((m) =>
				m.replace(/^(?:export\s+)?(?:async\s+)?/, "").replace(/\s*=\s*(?:async\s*)?\($/, "()"),
			),
		)

		return structures.slice(0, 10).map((s) => this.truncate(s, 80))
	}

	/**
	 * Extract issues from review content
	 */
	private extractIssues(content: string, maxPoints: number): string[] {
		// Match issue patterns
		const issueMatches =
			content.match(/(?:issue:|Issue:|ISSUE:)[- ]*([^\n]+)/gi) || content.match(/[-*]\s*\d+\.\s*([^\n]+)/g) || []

		return issueMatches
			.slice(0, maxPoints)
			.map((m) =>
				m
					.replace(/^(?:issue:|Issue:|ISSUE:)[- ]*/i, "")
					.replace(/^[-*]\s*\d+\.\s*/, "")
					.trim(),
			)
			.map((m) => this.truncate(m, 100))
	}

	/**
	 * Extract failed test names from test results
	 */
	private extractFailedTests(content: string, maxPoints: number): string[] {
		// Match failed test patterns
		const failedMatches =
			content.match(/(?:FAIL|FAILED|✗|✘)\s+(?:\s*✗\s*)?([^\n]+)/gi) ||
			content.match(/✓.*\n\s+✗\s+([^\n]+)/g) ||
			[]

		return failedMatches
			.slice(0, maxPoints)
			.map((m) =>
				m
					.replace(/^(?:FAIL|FAILED|✗|✘)\s*/i, "")
					.replace(/^\s*✗\s*/, "")
					.trim(),
			)
			.map((m) => this.truncate(m, 100))
	}

	/**
	 * Extract error messages from error report
	 */
	private extractErrors(content: string, maxPoints: number): string[] {
		// Match error patterns
		const errorMatches =
			content.match(/(?:Error:|ERROR:|Exception:)[- ]*([^\n]+)/gi) ||
			content.match(/at\s+([^\n]+\([^\n]+\))/g) ||
			[]

		return errorMatches
			.slice(0, maxPoints)
			.map((m) =>
				m
					.replace(/^(?:Error:|ERROR:|Exception:)[- ]*/i, "")
					.replace(/^at\s+/, "at ")
					.trim(),
			)
			.map((m) => this.truncate(m, 100))
	}
}
