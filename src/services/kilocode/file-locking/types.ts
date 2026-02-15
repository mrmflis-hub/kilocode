// kilocode_change - new file
/**
 * File Locking Types
 *
 * Types for the file locking service that prevents race conditions
 * when multiple agents access the same files.
 */

/**
 * Lock status
 */
export type LockStatus = "locked" | "waiting" | "released" | "timeout" | "error"

/**
 * Lock mode
 */
export type LockMode = "read" | "write"

/**
 * File lock information
 */
export interface FileLock {
	/** Unique lock identifier */
	lockId: string

	/** File path being locked */
	filePath: string

	/** Agent ID that holds the lock */
	agentId: string

	/** Lock mode (read or write) */
	mode: LockMode

	/** Timestamp when lock was acquired */
	acquiredAt: number

	/** Lock timeout in milliseconds */
	timeoutMs: number

	/** Optional description of what the lock is for */
	description?: string
}

/**
 * Lock request options
 */
export interface AcquireLockOptions {
	/** File path to lock */
	filePath: string

	/** Agent ID requesting the lock */
	agentId: string

	/** Lock mode (read or write) */
	mode?: LockMode

	/** Lock timeout in milliseconds (default: 30000) */
	timeoutMs?: number

	/** Maximum time to wait for lock acquisition (default: 60000) */
	maxWaitMs?: number

	/** Initial retry delay in milliseconds (default: 100) */
	retryDelayMs?: number

	/** Maximum retry delay in milliseconds (default: 5000) */
	maxRetryDelayMs?: number

	/** Backoff multiplier (default: 2) */
	backoffMultiplier?: number

	/** Optional description of what the lock is for */
	description?: string
}

/**
 * Lock conflict information
 */
export interface LockConflict {
	/** File path with conflict */
	filePath: string

	/** Agent ID that holds the conflicting lock */
	conflictingAgentId: string

	/** Lock mode of the conflict */
	conflictingMode: LockMode

	/** Requested lock mode */
	requestedMode: LockMode

	/** Timestamp when conflict was detected */
	detectedAt: number
}

/**
 * Lock status information
 */
export interface LockStatusInfo {
	/** File path */
	filePath: string

	/** Whether the file is locked */
	isLocked: boolean

	/** Current lock holder (if locked) */
	lockHolder?: string

	/** Lock mode (if locked) */
	lockMode?: LockMode

	/** Number of agents waiting for this lock */
	waitingCount: number

	/** List of waiting agent IDs */
	waitingAgents: string[]
}

/**
 * Result of lock acquisition
 */
export interface AcquireLockResult {
	/** Whether the lock was acquired */
	success: boolean

	/** Lock ID if successful */
	lockId?: string

	/** Error message if failed */
	error?: string

	/** Time waited in milliseconds */
	waitedMs: number

	/** Number of retries attempted */
	retries: number

	/** Conflict information if applicable */
	conflict?: LockConflict
}

/**
 * Configuration for FileLockingService
 */
export interface FileLockingServiceConfig {
	/** Default lock timeout in milliseconds */
	defaultTimeoutMs?: number

	/** Default max wait time for lock acquisition */
	defaultMaxWaitMs?: number

	/** Enable lock monitoring */
	enableMonitoring?: boolean

	/** Interval for checking expired locks in milliseconds */
	expirationCheckIntervalMs?: number
}

/**
 * Lock event types
 */
export type LockEventType = "acquired" | "released" | "timeout" | "conflict" | "waiting"

/**
 * Lock event
 */
export interface LockEvent {
	/** Event type */
	type: LockEventType

	/** File path */
	filePath: string

	/** Agent ID involved */
	agentId: string

	/** Lock ID (if applicable) */
	lockId?: string

	/** Timestamp */
	timestamp: number

	/** Additional data */
	data?: Record<string, unknown>
}

/**
 * Lock event handler
 */
export type LockEventHandler = (event: LockEvent) => void
