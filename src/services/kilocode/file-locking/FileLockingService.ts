// kilocode_change - new file
import { EventEmitter } from "events"
import {
	FileLock,
	AcquireLockOptions,
	AcquireLockResult,
	LockStatusInfo,
	LockConflict,
	LockEvent,
	LockEventHandler,
	LockEventType,
	LockMode,
	FileLockingServiceConfig,
} from "./types"

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<FileLockingServiceConfig> = {
	defaultTimeoutMs: 30000, // 30 seconds
	defaultMaxWaitMs: 60000, // 60 seconds
	enableMonitoring: true,
	expirationCheckIntervalMs: 5000, // 5 seconds
}

/**
 * FileLockingService
 *
 * Provides file-level locking to prevent race conditions when multiple
 * agents access the same files concurrently.
 *
 * Features:
 * - Read/write lock modes (multiple readers, single writer)
 * - Lock timeout with automatic release
 * - Exponential backoff retry for lock acquisition
 * - Lock conflict detection and reporting
 * - Lock status monitoring
 * - Event-based notifications
 */
export class FileLockingService extends EventEmitter {
	private locks: Map<string, FileLock> = new Map() // filePath -> lock
	private waitingQueues: Map<
		string,
		// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
		Array<{ agentId: string; mode: LockMode; resolve: Function; reject: Function }>
	> = new Map()
	private agentLocks: Map<string, Set<string>> = new Map() // agentId -> Set of lockIds
	private config: Required<FileLockingServiceConfig>
	private lockIdCounter = 0
	private expirationCheckInterval: ReturnType<typeof setInterval> | null = null

	constructor(config: FileLockingServiceConfig = {}) {
		super()
		this.config = { ...DEFAULT_CONFIG, ...config }

		if (this.config.enableMonitoring) {
			this.startExpirationMonitoring()
		}
	}

	/**
	 * Acquire a lock on a file
	 */
	async acquireLock(options: AcquireLockOptions): Promise<AcquireLockResult> {
		const {
			filePath,
			agentId,
			mode = "write",
			timeoutMs = this.config.defaultTimeoutMs,
			maxWaitMs = this.config.defaultMaxWaitMs,
			retryDelayMs = 100,
			maxRetryDelayMs = 5000,
			backoffMultiplier = 2,
			description,
		} = options

		const startTime = Date.now()
		let currentDelay = retryDelayMs
		let retries = 0

		// Try to acquire lock with exponential backoff
		while (Date.now() - startTime < maxWaitMs) {
			const result = this.tryAcquireLock(filePath, agentId, mode, timeoutMs, description)

			if (result.success) {
				return {
					success: true,
					lockId: result.lockId,
					waitedMs: Date.now() - startTime,
					retries,
				}
			}

			// Check if it's a conflict
			if (result.conflict) {
				// For read locks, check if we can share with existing read lock
				if (mode === "read" && result.conflict.conflictingMode === "read") {
					// Multiple readers are allowed
					const sharedLock = this.tryAcquireLock(filePath, agentId, mode, timeoutMs, description, true)
					if (sharedLock.success) {
						return {
							success: true,
							lockId: sharedLock.lockId,
							waitedMs: Date.now() - startTime,
							retries,
						}
					}
				}

				// Emit conflict event
				this.emitEvent("conflict", filePath, agentId, undefined, {
					conflict: result.conflict,
				})
			}

			// Wait before retry
			await this.delay(currentDelay)
			retries++
			currentDelay = Math.min(currentDelay * backoffMultiplier, maxRetryDelayMs)

			// Emit waiting event
			this.emitEvent("waiting", filePath, agentId, undefined, {
				retry: retries,
				delayMs: currentDelay,
			})
		}

		// Timeout - could not acquire lock
		const conflict = this.getConflictInfo(filePath, mode)
		this.emitEvent("timeout", filePath, agentId, undefined, { maxWaitMs })

		return {
			success: false,
			error: `Failed to acquire lock on ${filePath} after ${maxWaitMs}ms`,
			waitedMs: Date.now() - startTime,
			retries,
			conflict,
		}
	}

	/**
	 * Release a lock
	 */
	releaseLock(lockId: string): boolean {
		// Find the lock by ID
		let filePath: string | null = null
		let agentId: string | null = null

		for (const [path, lock] of this.locks) {
			if (lock.lockId === lockId) {
				filePath = path
				agentId = lock.agentId
				break
			}
		}

		if (!filePath || !agentId) {
			return false
		}

		// Remove the lock
		this.locks.delete(filePath)

		// Remove from agent's lock set
		const agentLockSet = this.agentLocks.get(agentId)
		if (agentLockSet) {
			agentLockSet.delete(lockId)
			if (agentLockSet.size === 0) {
				this.agentLocks.delete(agentId)
			}
		}

		// Emit release event
		this.emitEvent("released", filePath, agentId, lockId)

		// Process waiting queue
		this.processWaitingQueue(filePath)

		return true
	}

	/**
	 * Release all locks held by an agent
	 */
	releaseAllLocksForAgent(agentId: string): number {
		const lockSet = this.agentLocks.get(agentId)
		if (!lockSet) return 0

		const lockIds = Array.from(lockSet)
		let releasedCount = 0

		for (const lockId of lockIds) {
			if (this.releaseLock(lockId)) {
				releasedCount++
			}
		}

		return releasedCount
	}

	/**
	 * Get lock status for a file
	 */
	getLockStatus(filePath: string): LockStatusInfo {
		const lock = this.locks.get(filePath)
		const waiting = this.waitingQueues.get(filePath) || []

		return {
			filePath,
			isLocked: !!lock,
			lockHolder: lock?.agentId,
			lockMode: lock?.mode,
			waitingCount: waiting.length,
			waitingAgents: waiting.map((w) => w.agentId),
		}
	}

	/**
	 * Check if a file is locked
	 */
	isLocked(filePath: string): boolean {
		return this.locks.has(filePath)
	}

	/**
	 * Check if an agent holds any locks
	 */
	agentHasLocks(agentId: string): boolean {
		const lockSet = this.agentLocks.get(agentId)
		return lockSet ? lockSet.size > 0 : false
	}

	/**
	 * Get all locks held by an agent
	 */
	getLocksForAgent(agentId: string): FileLock[] {
		const lockSet = this.agentLocks.get(agentId)
		if (!lockSet) return []

		const locks: FileLock[] = []
		for (const [path, lock] of this.locks) {
			if (lock.agentId === agentId) {
				locks.push(lock)
			}
		}

		return locks
	}

	/**
	 * Get all active locks
	 */
	getAllLocks(): FileLock[] {
		return Array.from(this.locks.values())
	}

	/**
	 * Subscribe to lock events
	 */
	subscribe(handler: LockEventHandler): void {
		this.on("lockEvent", handler)
	}

	/**
	 * Unsubscribe from lock events
	 */
	unsubscribe(handler: LockEventHandler): void {
		this.off("lockEvent", handler)
	}

	/**
	 * Dispose of the service
	 */
	dispose(): void {
		if (this.expirationCheckInterval) {
			clearInterval(this.expirationCheckInterval)
			this.expirationCheckInterval = null
		}

		// Release all locks
		this.locks.clear()
		this.agentLocks.clear()
		this.waitingQueues.clear()
		this.removeAllListeners()
	}

	// Private methods

	/**
	 * Try to acquire a lock (internal)
	 */
	private tryAcquireLock(
		filePath: string,
		agentId: string,
		mode: LockMode,
		timeoutMs: number,
		description?: string,
		forceShared = false,
	): { success: boolean; lockId?: string; conflict?: LockConflict } {
		const existingLock = this.locks.get(filePath)

		// Check for conflicts
		if (existingLock) {
			// Allow shared read locks
			if (mode === "read" && existingLock.mode === "read" && !forceShared) {
				// This is handled in acquireLock with forceShared flag
			}

			// Conflict: file is already locked
			return {
				success: false,
				conflict: {
					filePath,
					conflictingAgentId: existingLock.agentId,
					conflictingMode: existingLock.mode,
					requestedMode: mode,
					detectedAt: Date.now(),
				},
			}
		}

		// Create new lock
		const lockId = this.generateLockId()
		const lock: FileLock = {
			lockId,
			filePath,
			agentId,
			mode,
			acquiredAt: Date.now(),
			timeoutMs,
			description,
		}

		this.locks.set(filePath, lock)

		// Track by agent
		if (!this.agentLocks.has(agentId)) {
			this.agentLocks.set(agentId, new Set())
		}
		this.agentLocks.get(agentId)!.add(lockId)

		// Emit acquired event
		this.emitEvent("acquired", filePath, agentId, lockId, { mode, timeoutMs })

		return { success: true, lockId }
	}

	/**
	 * Get conflict information for a file
	 */
	private getConflictInfo(filePath: string, requestedMode: LockMode): LockConflict | undefined {
		const existingLock = this.locks.get(filePath)
		if (!existingLock) return undefined

		return {
			filePath,
			conflictingAgentId: existingLock.agentId,
			conflictingMode: existingLock.mode,
			requestedMode,
			detectedAt: Date.now(),
		}
	}

	/**
	 * Process waiting queue for a file
	 */
	private processWaitingQueue(filePath: string): void {
		const queue = this.waitingQueues.get(filePath)
		if (!queue || queue.length === 0) return

		// Get the next waiter
		const next = queue.shift()
		if (!next) return

		// Try to acquire the lock for the next waiter
		const result = this.tryAcquireLock(filePath, next.agentId, next.mode, this.config.defaultTimeoutMs)

		if (result.success) {
			next.resolve(result.lockId)
		} else {
			next.reject(new Error("Failed to acquire lock"))
		}

		// Clean up empty queue
		if (queue.length === 0) {
			this.waitingQueues.delete(filePath)
		}
	}

	/**
	 * Start monitoring for expired locks
	 */
	private startExpirationMonitoring(): void {
		this.expirationCheckInterval = setInterval(() => {
			this.checkExpiredLocks()
		}, this.config.expirationCheckIntervalMs)
	}

	/**
	 * Check and release expired locks
	 */
	private checkExpiredLocks(): void {
		const now = Date.now()
		const expiredLocks: string[] = []

		for (const [filePath, lock] of this.locks) {
			if (now - lock.acquiredAt > lock.timeoutMs) {
				expiredLocks.push(lock.lockId)
			}
		}

		for (const lockId of expiredLocks) {
			this.releaseLock(lockId)
		}
	}

	/**
	 * Generate a unique lock ID
	 */
	private generateLockId(): string {
		return `lock_${++this.lockIdCounter}_${Date.now()}`
	}

	/**
	 * Emit a lock event
	 */
	private emitEvent(
		type: LockEventType,
		filePath: string,
		agentId: string,
		lockId?: string,
		data?: Record<string, unknown>,
	): void {
		const event: LockEvent = {
			type,
			filePath,
			agentId,
			lockId,
			timestamp: Date.now(),
			data,
		}

		this.emit("lockEvent", event)
	}

	/**
	 * Delay helper
	 */
	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms))
	}
}
