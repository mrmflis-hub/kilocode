// kilocode_change - new file
import { describe, it, expect, beforeEach } from "vitest"
import { ArtifactSummarizer } from "../ArtifactSummarizer"
import { ArtifactType } from "@kilocode/core-schemas"

describe("ArtifactSummarizer", () => {
	let summarizer: ArtifactSummarizer

	beforeEach(() => {
		summarizer = new ArtifactSummarizer(500)
	})

	describe("generateSummary", () => {
		describe("user_task", () => {
			it("should summarize a user task", () => {
				const content = "Create a REST API for user management\nWith authentication\nAnd validation"
				const summary = summarizer.generateSummary("user_task" as ArtifactType, content)

				expect(summary.brief).toBe("Create a REST API for user management")
				expect(summary.keyPoints.length).toBeGreaterThan(0)
				expect(summary.filesAffected).toEqual([])
			})
		})

		describe("implementation_plan", () => {
			it("should summarize an implementation plan", () => {
				const content = `# Implementation Plan

## Overview
This plan outlines the approach for building the feature.

## Architecture
- Component A
- Component B

## Files
- src/api/users.ts
- src/api/auth.ts
`
				const summary = summarizer.generateSummary("implementation_plan" as ArtifactType, content)

				expect(summary.brief).toBe("# Implementation Plan")
				expect(summary.keyPoints.length).toBeGreaterThan(0)
				expect(summary.filesAffected.length).toBeGreaterThan(0)
				expect(summary.metrics?.linesOfCode).toBeGreaterThan(0)
			})
		})

		describe("pseudocode", () => {
			it("should summarize pseudocode with file references", () => {
				const content = `File: src/api/users.ts
function getUsers() {
  return fetch('/api/users')
}

File: src/api/auth.ts
function login() {
  return fetch('/api/login')
}
`
				const summary = summarizer.generateSummary("pseudocode" as ArtifactType, content)

				expect(summary.brief).toContain("file")
				expect(summary.filesAffected.length).toBeGreaterThan(0)
			})

			it("should summarize pseudocode without file references", () => {
				const content = `function processData() {
  // Process the data
}`
				const summary = summarizer.generateSummary("pseudocode" as ArtifactType, content)

				expect(summary.brief).toBe("Pseudocode structure")
			})
		})

		describe("code", () => {
			it("should summarize code with file path", () => {
				const content = `// File: src/services/UserService.ts
export class UserService {
  async getUsers() {
    return this.db.users.findMany()
  }
}`
				const summary = summarizer.generateSummary("code" as ArtifactType, content)

				expect(summary.brief).toContain("src/services/UserService.ts")
				expect(summary.keyPoints.length).toBeGreaterThan(0)
			})

			it("should summarize code without file path", () => {
				const content = `export function hello() {
  return "Hello, World!"
}`
				const summary = summarizer.generateSummary("code" as ArtifactType, content)

				expect(summary.brief).toBe("Code implementation")
			})
		})

		describe("review_report", () => {
			it("should summarize a review report with issues", () => {
				const content = `# Code Review

Issue: Missing error handling in getUsers
Issue: SQL injection vulnerability in query
Issue: Missing input validation

The code needs improvements.`
				const summary = summarizer.generateSummary("review_report" as ArtifactType, content)

				expect(summary.brief).toContain("issue")
				expect(summary.metrics?.issuesFound).toBe(3)
			})

			it("should summarize a review report without issues", () => {
				const content = `# Code Review

The code looks good. No issues found.`
				const summary = summarizer.generateSummary("review_report" as ArtifactType, content)

				expect(summary.brief).toBe("Review completed")
			})
		})

		describe("documentation", () => {
			it("should summarize documentation", () => {
				const content = `# API Documentation

## Overview
This API provides user management.

## Endpoints
- GET /users
- POST /users
- PUT /users/:id
- DELETE /users/:id
`
				const summary = summarizer.generateSummary("documentation" as ArtifactType, content)

				expect(summary.brief).toBe("# API Documentation")
				expect(summary.keyPoints.length).toBeGreaterThan(0)
			})
		})

		describe("test_results", () => {
			it("should summarize test results with passed and failed", () => {
				const content = `Test Results:
15 passed
3 failed
2 skipped`
				const summary = summarizer.generateSummary("test_results" as ArtifactType, content)

				expect(summary.brief).toContain("15 passed")
				expect(summary.brief).toContain("3 failed")
				expect(summary.brief).toContain("2 skipped")
				expect(summary.metrics?.testsCount).toBe(20)
			})

			it("should summarize test results with only passed", () => {
				const content = `Test Results:
10 passed
0 failed`
				const summary = summarizer.generateSummary("test_results" as ArtifactType, content)

				expect(summary.brief).toContain("10 passed")
				expect(summary.brief).toContain("0 failed")
			})
		})

		describe("error_report", () => {
			it("should summarize an error report", () => {
				const content = `Error: Cannot read property 'id' of undefined
at UserService.getUsers (src/services/UserService.ts:25)
at Object.<anonymous> (src/tests/user.test.ts:15)`
				const summary = summarizer.generateSummary("error_report" as ArtifactType, content)

				expect(summary.brief).toContain("Error")
				expect(summary.keyPoints.length).toBeGreaterThan(0)
			})
		})
	})

	describe("truncation", () => {
		it("should truncate long summaries", () => {
			const longContent = "A".repeat(1000)
			const summarizer = new ArtifactSummarizer(100)
			const summary = summarizer.generateSummary("user_task" as ArtifactType, longContent)

			expect(summary.brief.length).toBeLessThanOrEqual(103) // 100 + "..."
		})
	})

	describe("file path extraction", () => {
		it("should extract various file path formats", () => {
			const content = `
Files modified:
- ./src/api/users.ts
- /home/project/src/auth.ts
- C:\\project\\src\\config.ts
- package.json
`
			const summary = summarizer.generateSummary("implementation_plan" as ArtifactType, content)

			expect(summary.filesAffected.length).toBeGreaterThan(0)
		})
	})
})
