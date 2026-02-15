// kilocode_change - new file
/**
 * Security Testing Types
 *
 * Defines types for security validation and testing of the multi-agent orchestration system.
 */

import type { AgentMessage, AgentMessagePayload } from "@kilocode/core-schemas"

/**
 * Security issue severity levels
 */
export type SecurityIssueSeverity = "critical" | "high" | "medium" | "low" | "info"

/**
 * Security issue categories
 */
export type SecurityIssueCategory =
	| "message_validation"
	| "artifact_validation"
	| "file_access"
	| "ipc_security"
	| "input_sanitization"
	| "authentication"
	| "authorization"
	| "data_leak"

/**
 * Individual security issue found during testing
 */
export interface SecurityIssue {
	/** Unique identifier for the issue */
	id: string
	/** Category of the security issue */
	category: SecurityIssueCategory
	/** Severity level */
	severity: SecurityIssueSeverity
	/** Human-readable description */
	description: string
	/** Detailed technical information */
	technicalDetails?: string
	/** Component where issue was found */
	component: string
	/** File path if applicable */
	filePath?: string
	/** Line number if applicable */
	lineNumber?: number
	/** Recommended fix */
	recommendation?: string
	/** CWE (Common Weakness Enumeration) identifier */
	cweId?: string
	/** CVSS score if applicable */
	cvssScore?: number
}

/**
 * Result of a security test
 */
export interface SecurityTestResult {
	/** Test name */
	testName: string
	/** Whether the test passed */
	passed: boolean
	/** Security issues found during test */
	issues: SecurityIssue[]
	/** Timestamp when test was run */
	timestamp: number
	/** Duration of test execution in milliseconds */
	durationMs: number
	/** Additional test metadata */
	metadata?: Record<string, unknown>
}

/**
 * Result of a complete security audit
 */
export interface SecurityAuditResult {
	/** Total number of tests run */
	totalTests: number
	/** Number of tests passed */
	passedTests: number
	/** Number of tests failed */
	failedTests: number
	/** Total issues found */
	totalIssues: number
	/** All security issues found */
	issues: SecurityIssue[]
	/** Issues grouped by severity */
	issuesBySeverity: Record<SecurityIssueSeverity, SecurityIssue[]>
	/** Issues grouped by category */
	issuesByCategory: Record<SecurityIssueCategory, SecurityIssue[]>
	/** Critical issues count */
	criticalCount: number
	/** High issues count */
	highCount: number
	/** Medium issues count */
	mediumCount: number
	/** Low issues count */
	lowCount: number
	/** Overall security score (0-100) */
	securityScore: number
	/** Timestamp when audit was run */
	timestamp: number
	/** Duration of audit in milliseconds */
	durationMs: number
}

/**
 * Configuration for security testing
 */
export interface SecurityTestConfig {
	/** Enable message validation tests */
	enableMessageValidation: boolean
	/** Enable artifact content tests */
	enableArtifactValidation: boolean
	/** Enable file access control tests */
	enableFileAccessTests: boolean
	/** Enable IPC security tests */
	enableIPCSecurityTests: boolean
	/** Enable input sanitization tests */
	enableInputSanitizationTests: boolean
	/** Custom allowed file paths for file access tests */
	allowedFilePaths?: string[]
	/** Custom blocked file paths */
	blockedFilePaths?: string[]
	/** Maximum message size to test */
	maxMessageSize?: number
	/** Test timeout in milliseconds */
	testTimeoutMs?: number
}

/**
 * Message validation test options
 */
export interface MessageValidationOptions {
	/** Maximum message size in bytes */
	maxMessageSize: number
	/** Allowed message types */
	allowedMessageTypes?: string[]
	/** Required fields for each message type */
	requiredFields?: Record<string, string[]>
	/** Validate sender authorization */
	validateSenderAuth: boolean
	/** Check for injection patterns */
	checkInjectionPatterns: boolean
}

/**
 * Artifact content validation options
 */
export interface ArtifactValidationOptions {
	/** Maximum artifact size in bytes */
	maxArtifactSize: number
	/** Allowed artifact types */
	allowedArtifactTypes?: string[]
	/** Enable malware scanning */
	enableMalwareScan: boolean
	/** Check for sensitive data patterns */
	checkSensitiveData: boolean
	/** Allowed file extensions */
	allowedExtensions?: string[]
}

/**
 * File access control test options
 */
export interface FileAccessTestOptions {
	/** Base workspace path */
	workspacePath: string
	/** Allowed directories for agent access */
	allowedDirectories: string[]
	/** Blocked directories */
	blockedDirectories: string[]
	/** Test path traversal attempts */
	testPathTraversal: boolean
	/** Test symlink handling */
	testSymlinkHandling: boolean
}

/**
 * IPC security test options
 */
export interface IPSecurityTestOptions {
	/** Maximum IPC message size */
	maxIPCMessageSize: number
	/** Validate message schema */
	validateSchema: boolean
	/** Check for command injection */
	checkCommandInjection: boolean
	/** Test rate limiting */
	testRateLimiting: boolean
	/** Test message replay protection */
	testReplayProtection: boolean
}

/**
 * Input sanitization test options
 */
export interface InputSanitizationOptions {
	/** Check for SQL injection patterns */
	checkSQLInjection: boolean
	/** Check for XSS patterns */
	checkXSS: boolean
	/** Check for command injection */
	checkCommandInjection: boolean
	/** Check for path traversal */
	checkPathTraversal: boolean
	/** Check for template injection */
	checkTemplateInjection: boolean
	/** Custom sanitization rules */
	customRules?: SanitizationRule[]
}

/**
 * Custom sanitization rule
 */
export interface SanitizationRule {
	/** Rule name */
	name: string
	/** Pattern to detect (regex) */
	pattern: string
	/** Description of what the pattern detects */
	description: string
	/** Severity if pattern is found */
	severity: SecurityIssueSeverity
}

/**
 * Security test event types
 */
export type SecurityTestEventType =
	| "test_started"
	| "test_completed"
	| "test_failed"
	| "issue_found"
	| "audit_started"
	| "audit_completed"

/**
 * Security test event
 */
export interface SecurityTestEvent {
	/** Event type */
	type: SecurityTestEventType
	/** Test name (if applicable) */
	testName?: string
	/** Issue found (if applicable) */
	issue?: SecurityIssue
	/** Timestamp */
	timestamp: number
	/** Additional data */
	data?: Record<string, unknown>
}

/**
 * Security statistics
 */
export interface SecurityStatistics {
	/** Total tests run */
	totalTests: number
	/** Tests passed */
	passedTests: number
	/** Tests failed */
	failedTests: number
	/** Total issues found */
	totalIssues: number
	/** Issues by severity */
	issuesBySeverity: Record<SecurityIssueSeverity, number>
	/** Issues by category */
	issuesByCategory: Record<SecurityIssueCategory, number>
	/** Last audit timestamp */
	lastAuditTimestamp: number
	/** Tests run this session */
	testsThisSession: number
}
