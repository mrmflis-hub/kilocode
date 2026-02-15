import { AgentSession, AgentStatus, AgentManagerState, PendingSession, ParallelModeInfo } from "./types"
import { DEFAULT_MODE_SLUG } from "@roo-code/types"

export interface CreateSessionOptions {
	parallelMode?: boolean
	model?: string
	mode?: string
	yoloMode?: boolean
}

/**
 * Multi-agent session creation options
 */
export interface CreateMultiAgentSessionOptions {
	sessionId?: string
	workspace: string
	userTask: string
	metadata?: Record<string, unknown>
}

const MAX_SESSIONS = 10
const MAX_LOGS = 100
const MAX_MULTI_AGENT_SESSIONS = 50

/**
 * Agent reference for multi-agent session tracking
 */
interface AgentReference {
	agentId: string
	role: string
	status: "spawning" | "ready" | "busy" | "paused" | "stopped" | "error"
	sessionId?: string
	spawnedAt: number
	lastActivityAt: number
}

/**
 * Artifact summary reference for multi-agent session context
 */
interface ArtifactSummaryReference {
	artifactId: string
	artifactType: string
	summary: string
	status: string
	producerRole: string
}

/**
 * Multi-agent session - represents an orchestration session with multiple agents
 */
interface MultiAgentSession {
	sessionId: string
	userTask: string
	workflowState: string
	status: "initializing" | "running" | "paused" | "completed" | "error" | "cancelled"
	agents: AgentReference[]
	artifactSummaries: ArtifactSummaryReference[]
	createdAt: number
	updatedAt: number
	completedAt?: number
	error?: string
	workspace: string
	workflowHistory: string[]
	currentStepDescription?: string
	metadata?: Record<string, unknown>
}

export class AgentRegistry {
	private sessions: Map<string, AgentSession> = new Map()
	private _selectedId: string | null = null
	private _pendingSession: PendingSession | null = null

	// Multi-agent session tracking
	private multiAgentSessions: Map<string, MultiAgentSession> = new Map()
	private agentToSessionMap: Map<string, string> = new Map() // agentId -> sessionId
	private _selectedMultiAgentSessionId: string | null = null

	public get selectedId(): string | null {
		return this._selectedId
	}

	public set selectedId(sessionId: string | null) {
		this._selectedId = sessionId && this.sessions.has(sessionId) ? sessionId : null
	}

	public get selectedMultiAgentSessionId(): string | null {
		return this._selectedMultiAgentSessionId
	}

	public set selectedMultiAgentSessionId(sessionId: string | null) {
		this._selectedMultiAgentSessionId = sessionId && this.multiAgentSessions.has(sessionId) ? sessionId : null
	}

	public get pendingSession(): PendingSession | null {
		return this._pendingSession
	}

	/**
	 * Set a pending session while waiting for CLI's session_created event
	 */
	public setPendingSession(prompt: string, options?: CreateSessionOptions & { gitUrl?: string }): PendingSession {
		const label = this.truncatePrompt(prompt)
		this._pendingSession = {
			prompt,
			label,
			startTime: Date.now(),
			parallelMode: options?.parallelMode,
			gitUrl: options?.gitUrl,
			yoloMode: options?.yoloMode,
		}
		return this._pendingSession
	}

	/**
	 * Clear the pending session (called after session is created or on error)
	 */
	public clearPendingSession(): void {
		this._pendingSession = null
	}

	/**
	 * Create a session with the CLI-provided sessionId
	 */
	public createSession(
		sessionId: string,
		prompt: string,
		startTime?: number,
		options?: CreateSessionOptions & { labelOverride?: string; gitUrl?: string },
	): AgentSession {
		const label = options?.labelOverride ?? this.truncatePrompt(prompt)

		const session: AgentSession = {
			sessionId,
			label,
			prompt,
			status: "running",
			startTime: startTime ?? Date.now(),
			logs: ["Starting agent..."],
			source: "local",
			...(options?.parallelMode && { parallelMode: { enabled: true } }),
			gitUrl: options?.gitUrl,
			model: options?.model,
			mode: options?.mode ?? DEFAULT_MODE_SLUG,
			yoloMode: options?.yoloMode,
		}

		this.sessions.set(sessionId, session)
		this.selectedId = sessionId
		this.pruneOldSessions()

		return session
	}

	public hasActiveProcess(sessionId: string): boolean {
		const session = this.sessions.get(sessionId)
		return session?.status === "running" && session?.pid !== undefined
	}

	public updateSessionStatus(
		sessionId: string,
		status: AgentStatus,
		exitCode?: number,
		error?: string,
	): AgentSession | undefined {
		const session = this.sessions.get(sessionId)
		if (!session) return undefined

		session.status = status
		if (status === "done" || status === "error" || status === "stopped") {
			session.endTime = Date.now()
		} else if (status === "running") {
			// Clear end state when resuming
			session.endTime = undefined
			session.exitCode = undefined
			session.error = undefined
		}
		if (exitCode !== undefined) {
			session.exitCode = exitCode
		}
		if (error) {
			session.error = error
		}

		return session
	}

	public getSession(sessionId: string): AgentSession | undefined {
		return this.sessions.get(sessionId)
	}

	public getSessions(): AgentSession[] {
		return Array.from(this.sessions.values()).sort((a, b) => b.startTime - a.startTime)
	}

	public getSessionsForGitUrl(gitUrl: string | undefined): AgentSession[] {
		const allSessions = this.getSessions()

		if (!gitUrl) {
			return allSessions.filter((session) => !session.gitUrl)
		}

		return allSessions.filter((session) => session.gitUrl === gitUrl)
	}

	public appendLog(sessionId: string, line: string): void {
		const session = this.sessions.get(sessionId)
		if (!session) return

		session.logs.push(line)
		if (session.logs.length > MAX_LOGS) {
			session.logs = session.logs.slice(-MAX_LOGS)
		}
	}

	public setSessionPid(sessionId: string, pid: number): void {
		const session = this.sessions.get(sessionId)
		if (session) {
			session.pid = pid
		}
	}

	/**
	 * Update the mode for a session.
	 */
	public updateSessionMode(sessionId: string, mode: string): AgentSession | undefined {
		const session = this.sessions.get(sessionId)
		if (!session) {
			return undefined
		}
		session.mode = mode
		return session
	}

	/**
	 * Update the label for a session (inline rename).
	 */
	public updateSessionLabel(sessionId: string, label: string): AgentSession | undefined {
		const session = this.sessions.get(sessionId)
		if (!session) {
			return undefined
		}
		session.label = label
		return session
	}

	/**
	 * Update parallel mode info on a session.
	 */
	public updateParallelModeInfo(
		id: string,
		info: Partial<Omit<ParallelModeInfo, "enabled">>,
	): AgentSession | undefined {
		const session = this.sessions.get(id)
		if (!session) {
			return undefined
		}

		const currentParallelMode = session.parallelMode ?? { enabled: true }

		session.parallelMode = {
			...currentParallelMode,
			...info,
			enabled: true,
		}

		return session
	}

	public getState(): AgentManagerState {
		return {
			sessions: this.getSessions(),
			selectedId: this.selectedId,
		}
	}

	public getStateForGitUrl(gitUrl: string | undefined): AgentManagerState {
		const sessions = this.getSessionsForGitUrl(gitUrl)
		const sessionIds = new Set(sessions.map((s) => s.sessionId))

		return {
			sessions,
			selectedId: this.selectedId && sessionIds.has(this.selectedId) ? this.selectedId : null,
		}
	}

	public hasPendingOrRunningSessions(): boolean {
		return this._pendingSession !== null || this.getRunningSessionCount() > 0
	}

	public hasRunningSessions(): boolean {
		return this.getRunningSessionCount() > 0
	}

	public getRunningSessionCount(): number {
		let count = 0
		for (const session of this.sessions.values()) {
			if (session.status === "running") {
				count++
			}
		}
		return count
	}

	/**
	 * Remove a session from the registry
	 */
	public removeSession(sessionId: string): boolean {
		if (this._selectedId === sessionId) {
			this._selectedId = null
		}
		return this.sessions.delete(sessionId)
	}

	/**
	 * Rename a session from one ID to another.
	 * Used when upgrading a provisional session to a real session ID.
	 */
	public renameSession(oldId: string, newId: string): boolean {
		if (oldId === newId) {
			return this.sessions.has(oldId)
		}

		const oldSession = this.sessions.get(oldId)
		if (!oldSession) {
			return false
		}

		const targetSession = this.sessions.get(newId)
		if (targetSession) {
			// Prefer keeping the target session object (e.g. resuming an existing session),
			// but merge in any provisional logs so early streaming isn't lost.
			targetSession.logs = [...oldSession.logs, ...targetSession.logs]
			this.sessions.delete(oldId)
		} else {
			this.sessions.delete(oldId)
			oldSession.sessionId = newId
			this.sessions.set(newId, oldSession)
		}
		if (this._selectedId === oldId) {
			this._selectedId = newId
		}

		return true
	}

	private pruneOldSessions(): void {
		const sessions = this.getSessions()
		const overflow = sessions.length - MAX_SESSIONS
		if (overflow <= 0) return

		const nonRunning = sessions.filter((s) => s.status !== "running")
		if (nonRunning.length === 0) return

		const toRemove = nonRunning.slice(-Math.min(overflow, nonRunning.length))

		for (const session of toRemove) {
			this.sessions.delete(session.sessionId)
		}
	}

	private truncatePrompt(prompt: string, maxLength = 40): string {
		const cleaned = prompt.replace(/\s+/g, " ").trim()
		if (cleaned.length <= maxLength) {
			return cleaned
		}
		return cleaned.substring(0, maxLength - 3) + "..."
	}

	// =========================================================================
	// Multi-Agent Session Methods
	// =========================================================================

	/**
	 * Create a new multi-agent session
	 */
	public createMultiAgentSession(options: CreateMultiAgentSessionOptions): MultiAgentSession {
		const sessionId = options.sessionId ?? `multi-agent-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

		const session: MultiAgentSession = {
			sessionId,
			userTask: options.userTask,
			workflowState: "IDLE",
			status: "initializing",
			agents: [],
			artifactSummaries: [],
			createdAt: Date.now(),
			updatedAt: Date.now(),
			workspace: options.workspace,
			workflowHistory: ["IDLE"],
			metadata: options.metadata,
		}

		this.multiAgentSessions.set(sessionId, session)
		this.selectedMultiAgentSessionId = sessionId
		this.pruneOldMultiAgentSessions()

		return session
	}

	/**
	 * Get a multi-agent session by ID
	 */
	public getMultiAgentSession(sessionId: string): MultiAgentSession | undefined {
		return this.multiAgentSessions.get(sessionId)
	}

	/**
	 * Get all multi-agent sessions
	 */
	public getMultiAgentSessions(): MultiAgentSession[] {
		return Array.from(this.multiAgentSessions.values()).sort((a, b) => b.createdAt - a.createdAt)
	}

	/**
	 * Get the session ID for a specific agent
	 */
	public getSessionForAgent(agentId: string): string | undefined {
		return this.agentToSessionMap.get(agentId)
	}

	/**
	 * Get all agents for a specific multi-agent session
	 */
	public getAgentsForSession(sessionId: string): AgentReference[] {
		const session = this.multiAgentSessions.get(sessionId)
		return session?.agents ?? []
	}

	/**
	 * Add an agent to a multi-agent session
	 */
	public addAgentToSession(sessionId: string, agentId: string, role: string): AgentReference | undefined {
		const session = this.multiAgentSessions.get(sessionId)
		if (!session) return undefined

		const agentRef: AgentReference = {
			agentId,
			role,
			status: "spawning",
			spawnedAt: Date.now(),
			lastActivityAt: Date.now(),
		}

		session.agents.push(agentRef)
		session.updatedAt = Date.now()

		// Track agent-to-session mapping
		this.agentToSessionMap.set(agentId, sessionId)

		return agentRef
	}

	/**
	 * Update an agent's status in a multi-agent session
	 */
	public updateAgentStatus(agentId: string, status: AgentReference["status"]): AgentReference | undefined {
		const sessionId = this.agentToSessionMap.get(agentId)
		if (!sessionId) return undefined

		const session = this.multiAgentSessions.get(sessionId)
		if (!session) return undefined

		const agent = session.agents.find((a) => a.agentId === agentId)
		if (!agent) return undefined

		agent.status = status
		agent.lastActivityAt = Date.now()
		session.updatedAt = Date.now()

		return agent
	}

	/**
	 * Update an agent's session ID (called when agent creates its own session)
	 */
	public updateAgentSessionId(agentId: string, agentSessionId: string): AgentReference | undefined {
		const sessionId = this.agentToSessionMap.get(agentId)
		if (!sessionId) return undefined

		const session = this.multiAgentSessions.get(sessionId)
		if (!session) return undefined

		const agent = session.agents.find((a) => a.agentId === agentId)
		if (!agent) return undefined

		agent.sessionId = agentSessionId
		agent.lastActivityAt = Date.now()
		session.updatedAt = Date.now()

		return agent
	}

	/**
	 * Remove an agent from a multi-agent session
	 */
	public removeAgentFromSession(agentId: string): boolean {
		const sessionId = this.agentToSessionMap.get(agentId)
		if (!sessionId) return false

		const session = this.multiAgentSessions.get(sessionId)
		if (!session) return false

		const index = session.agents.findIndex((a) => a.agentId === agentId)
		if (index === -1) return false

		session.agents.splice(index, 1)
		session.updatedAt = Date.now()
		this.agentToSessionMap.delete(agentId)

		return true
	}

	/**
	 * Update multi-agent session workflow state
	 */
	public updateMultiAgentSessionWorkflowState(
		sessionId: string,
		workflowState: string,
		stepDescription?: string,
	): MultiAgentSession | undefined {
		const session = this.multiAgentSessions.get(sessionId)
		if (!session) return undefined

		session.workflowState = workflowState
		session.workflowHistory.push(workflowState)
		session.updatedAt = Date.now()
		if (stepDescription) {
			session.currentStepDescription = stepDescription
		}

		return session
	}

	/**
	 * Update multi-agent session status
	 */
	public updateMultiAgentSessionStatus(
		sessionId: string,
		status: MultiAgentSession["status"],
		error?: string,
	): MultiAgentSession | undefined {
		const session = this.multiAgentSessions.get(sessionId)
		if (!session) return undefined

		session.status = status
		session.updatedAt = Date.now()
		if (status === "completed" || status === "cancelled" || status === "error") {
			session.completedAt = Date.now()
		}
		if (error) {
			session.error = error
		}

		return session
	}

	/**
	 * Add an artifact summary to a multi-agent session
	 */
	public addArtifactToSession(
		sessionId: string,
		artifact: Omit<
			ArtifactSummaryReference,
			"artifactId" | "artifactType" | "summary" | "status" | "producerRole"
		> & { artifactId: string; artifactType: string; summary: string; status: string; producerRole: string },
	): ArtifactSummaryReference | undefined {
		const session = this.multiAgentSessions.get(sessionId)
		if (!session) return undefined

		const artifactRef: ArtifactSummaryReference = {
			artifactId: artifact.artifactId,
			artifactType: artifact.artifactType,
			summary: artifact.summary,
			status: artifact.status,
			producerRole: artifact.producerRole,
		}

		session.artifactSummaries.push(artifactRef)
		session.updatedAt = Date.now()

		return artifactRef
	}

	/**
	 * Get artifact summaries for a multi-agent session
	 */
	public getArtifactSummariesForSession(sessionId: string): ArtifactSummaryReference[] {
		const session = this.multiAgentSessions.get(sessionId)
		return session?.artifactSummaries ?? []
	}

	/**
	 * Remove a multi-agent session
	 */
	public removeMultiAgentSession(sessionId: string): boolean {
		const session = this.multiAgentSessions.get(sessionId)
		if (!session) return false

		// Remove all agent-to-session mappings for this session
		for (const agent of session.agents) {
			this.agentToSessionMap.delete(agent.agentId)
		}

		if (this._selectedMultiAgentSessionId === sessionId) {
			this._selectedMultiAgentSessionId = null
		}

		return this.multiAgentSessions.delete(sessionId)
	}

	/**
	 * Get state for multi-agent sessions (for persistence)
	 */
	public getMultiAgentSessionState(): { sessions: MultiAgentSession[]; selectedSessionId: string | null } {
		return {
			sessions: this.getMultiAgentSessions(),
			selectedSessionId: this._selectedMultiAgentSessionId,
		}
	}

	/**
	 * Restore multi-agent sessions from state (for persistence)
	 */
	public restoreMultiAgentSessionState(state: {
		sessions: MultiAgentSession[]
		selectedSessionId: string | null
	}): void {
		this.multiAgentSessions.clear()
		this.agentToSessionMap.clear()

		for (const session of state.sessions) {
			this.multiAgentSessions.set(session.sessionId, session)

			// Rebuild agent-to-session mapping
			for (const agent of session.agents) {
				this.agentToSessionMap.set(agent.agentId, session.sessionId)
			}
		}

		this._selectedMultiAgentSessionId = state.selectedSessionId
	}

	/**
	 * Check if any multi-agent sessions are running
	 */
	public hasRunningMultiAgentSessions(): boolean {
		for (const session of this.multiAgentSessions.values()) {
			if (session.status === "running" || session.status === "initializing") {
				return true
			}
		}
		return false
	}

	/**
	 * Get count of active multi-agent sessions
	 */
	public getActiveMultiAgentSessionCount(): number {
		let count = 0
		for (const session of this.multiAgentSessions.values()) {
			if (session.status === "running" || session.status === "initializing") {
				count++
			}
		}
		return count
	}

	private pruneOldMultiAgentSessions(): void {
		const sessions = this.getMultiAgentSessions()
		const overflow = sessions.length - MAX_MULTI_AGENT_SESSIONS
		if (overflow <= 0) return

		const nonActive = sessions.filter((s) => s.status !== "running" && s.status !== "initializing")
		if (nonActive.length === 0) return

		const toRemove = nonActive.slice(-Math.min(overflow, nonActive.length))

		for (const session of toRemove) {
			// Remove agent mappings first
			for (const agent of session.agents) {
				this.agentToSessionMap.delete(agent.agentId)
			}
			this.multiAgentSessions.delete(session.sessionId)
		}
	}
}
