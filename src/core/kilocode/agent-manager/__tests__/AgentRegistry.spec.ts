import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { AgentRegistry } from "../AgentRegistry"
import type { ParallelModeInfo } from "../types"

describe("AgentRegistry", () => {
	let registry: AgentRegistry

	beforeEach(() => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date("2020-01-01T00:00:00.000Z"))
		registry = new AgentRegistry()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("uses the selectedId accessor and validates unknown ids", () => {
		const first = registry.createSession("session-1", "first prompt")
		expect(registry.selectedId).toBe(first.sessionId)

		registry.selectedId = "missing"
		expect(registry.selectedId).toBeNull()

		const second = registry.createSession("session-2", "second prompt")
		registry.selectedId = first.sessionId
		expect(registry.selectedId).toBe(first.sessionId)

		// Setting a known id should stick; unknown should clear
		registry.selectedId = second.sessionId
		expect(registry.selectedId).toBe(second.sessionId)
	})

	it("sorts sessions by most recent start time", () => {
		const first = registry.createSession("session-1", "first")
		vi.advanceTimersByTime(1)
		const second = registry.createSession("session-2", "second")
		const sessions = registry.getSessions()

		expect(sessions.map((s) => s.sessionId)).toEqual([second.sessionId, first.sessionId])
	})

	it("caps logs to the max log count", () => {
		const { sessionId } = registry.createSession("session-1", "loggy")
		for (let i = 0; i < 105; i++) {
			registry.appendLog(sessionId, `log-${i}`)
		}

		const session = registry.getSession(sessionId)
		expect(session?.logs.length).toBe(100)
		expect(session?.logs[0]).toBe("log-5") // first five should be trimmed
		expect(session?.logs.at(-1)).toBe("log-104")
	})

	it("prunes oldest non-running sessions when over capacity", () => {
		// Fill up to the limit
		const created: string[] = []
		for (let i = 0; i < 10; i++) {
			vi.advanceTimersByTime(1)
			const session = registry.createSession(`session-${i}`, `session-${i}`)
			created.push(session.sessionId)
		}

		// Mark the earliest three as non-running so they are eligible for pruning
		registry.updateSessionStatus(created[0], "done")
		registry.updateSessionStatus(created[1], "done")
		registry.updateSessionStatus(created[2], "done")

		// Create one more to trigger pruning; should drop the oldest done session (created[0])
		const extra = registry.createSession("session-overflow", "overflow")

		const ids = registry.getSessions().map((s) => s.sessionId)
		expect(ids).toHaveLength(10)
		expect(ids).not.toContain(created[0])
		expect(ids).toContain(created[1])
		expect(ids).toContain(extra.sessionId)
	})

	it("getState returns the current sessions and selection", () => {
		const session = registry.createSession("session-1", "stateful")
		const state = registry.getState()

		expect(state.selectedId).toBe(session.sessionId)
		expect(state.sessions[0].sessionId).toBe(session.sessionId)
	})

	describe("pending session", () => {
		it("setPendingSession creates a pending session", () => {
			expect(registry.pendingSession).toBeNull()

			const pending = registry.setPendingSession("test prompt")

			expect(pending.prompt).toBe("test prompt")
			expect(pending.label).toBe("test prompt")
			expect(pending.startTime).toBeDefined()
			expect(registry.pendingSession).toBe(pending)
		})

		it("clearPendingSession clears the pending session", () => {
			registry.setPendingSession("test prompt")
			expect(registry.pendingSession).not.toBeNull()

			registry.clearPendingSession()

			expect(registry.pendingSession).toBeNull()
		})

		it("truncates long prompts in pending session label", () => {
			const longPrompt = "a".repeat(100)
			const pending = registry.setPendingSession(longPrompt)

			expect(pending.label.length).toBeLessThanOrEqual(40)
			expect(pending.label.endsWith("...")).toBe(true)
		})
	})

	describe("hasActiveProcess", () => {
		it("returns false for non-existent session", () => {
			expect(registry.hasActiveProcess("non-existent")).toBe(false)
		})

		it("returns false for running session without pid", () => {
			const session = registry.createSession("session-1", "test")
			expect(session.status).toBe("running")
			expect(session.pid).toBeUndefined()

			expect(registry.hasActiveProcess(session.sessionId)).toBe(false)
		})

		it("returns true for running session with pid", () => {
			const session = registry.createSession("session-1", "test")
			registry.setSessionPid(session.sessionId, 12345)

			expect(registry.hasActiveProcess(session.sessionId)).toBe(true)
		})

		it("returns false for completed session with pid", () => {
			const session = registry.createSession("session-1", "test")
			registry.setSessionPid(session.sessionId, 12345)
			registry.updateSessionStatus(session.sessionId, "done")

			expect(registry.hasActiveProcess(session.sessionId)).toBe(false)
		})

		it("returns false for error session with pid", () => {
			const session = registry.createSession("session-1", "test")
			registry.setSessionPid(session.sessionId, 12345)
			registry.updateSessionStatus(session.sessionId, "error")

			expect(registry.hasActiveProcess(session.sessionId)).toBe(false)
		})
	})

	describe("hasRunningSessions", () => {
		it("returns false when no sessions exist", () => {
			expect(registry.hasRunningSessions()).toBe(false)
		})

		it("returns true when a session is running", () => {
			registry.createSession("session-1", "running session")
			expect(registry.hasRunningSessions()).toBe(true)
		})

		it("returns false when all sessions are completed", () => {
			const session = registry.createSession("session-1", "done session")
			registry.updateSessionStatus(session.sessionId, "done")
			expect(registry.hasRunningSessions()).toBe(false)
		})

		it("returns false when all sessions have errors", () => {
			const session = registry.createSession("session-1", "error session")
			registry.updateSessionStatus(session.sessionId, "error")
			expect(registry.hasRunningSessions()).toBe(false)
		})

		it("returns false when all sessions are stopped", () => {
			const session = registry.createSession("session-1", "stopped session")
			registry.updateSessionStatus(session.sessionId, "stopped")
			expect(registry.hasRunningSessions()).toBe(false)
		})

		it("returns true when at least one session is running among others", () => {
			const s1 = registry.createSession("session-1", "done")
			registry.createSession("session-2", "running")
			const s3 = registry.createSession("session-3", "error")

			registry.updateSessionStatus(s1.sessionId, "done")
			registry.updateSessionStatus(s3.sessionId, "error")

			expect(registry.hasRunningSessions()).toBe(true)
		})

		it("returns the count of running sessions", () => {
			registry.createSession("session-1", "running 1")
			registry.createSession("session-2", "running 2")
			const s3 = registry.createSession("session-3", "done")

			registry.updateSessionStatus(s3.sessionId, "done")

			expect(registry.getRunningSessionCount()).toBe(2)
		})
	})

	describe("hasPendingOrRunningSessions", () => {
		it("returns false when no sessions or pending", () => {
			expect(registry.hasPendingOrRunningSessions()).toBe(false)
		})

		it("returns true when pending session exists", () => {
			registry.setPendingSession("test")
			expect(registry.hasPendingOrRunningSessions()).toBe(true)
		})

		it("returns true when running session exists", () => {
			registry.createSession("session-1", "test")
			expect(registry.hasPendingOrRunningSessions()).toBe(true)
		})

		it("returns false when only completed sessions exist", () => {
			const session = registry.createSession("session-1", "test")
			registry.updateSessionStatus(session.sessionId, "done")
			expect(registry.hasPendingOrRunningSessions()).toBe(false)
		})
	})

	describe("parallelMode", () => {
		it("creates session without parallelMode by default", () => {
			const session = registry.createSession("session-1", "no parallel")
			expect(session.parallelMode).toBeUndefined()
		})

		it("creates session with parallelMode enabled when option is provided", () => {
			const session = registry.createSession("session-1", "with parallel", undefined, { parallelMode: true })
			expect(session.parallelMode).toEqual({ enabled: true })
		})

		it("creates session with parallelMode disabled when option is false", () => {
			const session = registry.createSession("session-1", "without parallel", undefined, { parallelMode: false })
			expect(session.parallelMode).toBeUndefined()
		})

		it("updates parallelMode info with branch name", () => {
			const session = registry.createSession("session-1", "parallel session", undefined, { parallelMode: true })
			const updated = registry.updateParallelModeInfo(session.sessionId, {
				branch: "add-feature-1702734891234",
			})

			expect(updated?.parallelMode?.branch).toBe("add-feature-1702734891234")
			expect(updated?.parallelMode?.enabled).toBe(true)
		})

		it("updates parallelMode info with worktree path", () => {
			const session = registry.createSession("session-1", "parallel session", undefined, { parallelMode: true })
			const updated = registry.updateParallelModeInfo(session.sessionId, {
				worktreePath: "/tmp/kilocode-worktree-add-feature",
			})

			expect(updated?.parallelMode?.worktreePath).toBe("/tmp/kilocode-worktree-add-feature")
		})

		it("updates parallelMode info with completion message", () => {
			const session = registry.createSession("session-1", "parallel session", undefined, { parallelMode: true })
			const updated = registry.updateParallelModeInfo(session.sessionId, {
				completionMessage: "Changes committed to: add-feature\ngit merge add-feature",
			})

			expect(updated?.parallelMode?.completionMessage).toBe(
				"Changes committed to: add-feature\ngit merge add-feature",
			)
		})

		it("accumulates multiple parallelMode updates", () => {
			const session = registry.createSession("session-1", "parallel session", undefined, { parallelMode: true })

			registry.updateParallelModeInfo(session.sessionId, { branch: "my-branch" })
			registry.updateParallelModeInfo(session.sessionId, { worktreePath: "/tmp/worktree" })
			const final = registry.updateParallelModeInfo(session.sessionId, { completionMessage: "done" })

			expect(final?.parallelMode).toEqual({
				enabled: true,
				branch: "my-branch",
				worktreePath: "/tmp/worktree",
				completionMessage: "done",
			})
		})

		it("returns undefined when updating non-existent session", () => {
			const result = registry.updateParallelModeInfo("non-existent", { branch: "test" })
			expect(result).toBeUndefined()
		})

		it("enables parallelMode when updating a session without parallelMode", () => {
			const session = registry.createSession("session-1", "no parallel mode")
			const result = registry.updateParallelModeInfo(session.sessionId, { branch: "test" })
			expect(result?.parallelMode).toEqual({
				enabled: true,
				branch: "test",
			})
		})

		it("preserves parallelMode info in getState", () => {
			const session = registry.createSession("session-1", "parallel", undefined, { parallelMode: true })
			registry.updateParallelModeInfo(session.sessionId, { branch: "feature-branch" })

			const state = registry.getState()
			expect(state.sessions[0].parallelMode).toEqual({
				enabled: true,
				branch: "feature-branch",
			})
		})
	})

	describe("gitUrl support", () => {
		describe("createSession with gitUrl", () => {
			it("stores gitUrl when provided in options", () => {
				const session = registry.createSession("session-1", "test prompt", undefined, {
					gitUrl: "https://github.com/org/repo.git",
				})

				expect(session.gitUrl).toBe("https://github.com/org/repo.git")
			})

			it("creates session without gitUrl when not provided", () => {
				const session = registry.createSession("session-1", "test prompt")

				expect(session.gitUrl).toBeUndefined()
			})

			it("creates session without gitUrl when options is empty", () => {
				const session = registry.createSession("session-1", "test prompt", undefined, {})

				expect(session.gitUrl).toBeUndefined()
			})
		})

		describe("setPendingSession with gitUrl", () => {
			it("stores gitUrl in pending session when provided", () => {
				const pending = registry.setPendingSession("test prompt", {
					gitUrl: "https://github.com/org/repo.git",
				})

				expect(pending.gitUrl).toBe("https://github.com/org/repo.git")
				expect(registry.pendingSession?.gitUrl).toBe("https://github.com/org/repo.git")
			})

			it("creates pending session without gitUrl when not provided", () => {
				const pending = registry.setPendingSession("test prompt")

				expect(pending.gitUrl).toBeUndefined()
			})
		})

		describe("getState includes gitUrl", () => {
			it("includes gitUrl in session state", () => {
				registry.createSession("session-1", "test prompt", undefined, {
					gitUrl: "https://github.com/org/repo.git",
				})

				const state = registry.getState()

				expect(state.sessions[0].gitUrl).toBe("https://github.com/org/repo.git")
			})
		})

		describe("getSessionsForGitUrl", () => {
			it("returns only sessions without gitUrl when filter is undefined", () => {
				registry.createSession("session-1", "prompt 1", undefined, {
					gitUrl: "https://github.com/org/repo1.git",
				})
				registry.createSession("session-2", "prompt 2", undefined, {
					gitUrl: "https://github.com/org/repo2.git",
				})
				registry.createSession("session-3", "prompt 3") // no gitUrl

				const sessions = registry.getSessionsForGitUrl(undefined)

				expect(sessions).toHaveLength(1)
				expect(sessions[0].sessionId).toBe("session-3")
			})

			it("returns only sessions matching the gitUrl exactly", () => {
				registry.createSession("session-1", "prompt 1", undefined, {
					gitUrl: "https://github.com/org/repo1.git",
				})
				vi.advanceTimersByTime(1)
				registry.createSession("session-2", "prompt 2", undefined, {
					gitUrl: "https://github.com/org/repo2.git",
				})
				vi.advanceTimersByTime(1)
				registry.createSession("session-3", "prompt 3", undefined, {
					gitUrl: "https://github.com/org/repo1.git",
				})

				const sessions = registry.getSessionsForGitUrl("https://github.com/org/repo1.git")

				expect(sessions).toHaveLength(2)
				expect(sessions.map((s) => s.sessionId)).toEqual(["session-3", "session-1"])
			})

			it("excludes sessions without gitUrl when filtering by gitUrl", () => {
				registry.createSession("session-1", "prompt 1", undefined, {
					gitUrl: "https://github.com/org/repo1.git",
				})
				vi.advanceTimersByTime(1)
				registry.createSession("session-2", "prompt 2") // no gitUrl
				vi.advanceTimersByTime(1)
				registry.createSession("session-3", "prompt 3", undefined, {
					gitUrl: "https://github.com/org/repo2.git",
				})

				const sessions = registry.getSessionsForGitUrl("https://github.com/org/repo1.git")

				expect(sessions).toHaveLength(1)
				expect(sessions[0].sessionId).toBe("session-1")
			})

			it("returns sessions sorted by most recent start time", () => {
				registry.createSession("session-1", "prompt 1", undefined, {
					gitUrl: "https://github.com/org/repo.git",
				})
				vi.advanceTimersByTime(1)
				registry.createSession("session-2", "prompt 2", undefined, {
					gitUrl: "https://github.com/org/repo.git",
				})
				vi.advanceTimersByTime(1)
				registry.createSession("session-3", "prompt 3", undefined, {
					gitUrl: "https://github.com/org/repo.git",
				})

				const sessions = registry.getSessionsForGitUrl("https://github.com/org/repo.git")

				expect(sessions.map((s) => s.sessionId)).toEqual(["session-3", "session-2", "session-1"])
			})

			it("returns empty array when no sessions match gitUrl", () => {
				registry.createSession("session-1", "prompt 1", undefined, {
					gitUrl: "https://github.com/org/repo1.git",
				})

				const sessions = registry.getSessionsForGitUrl("https://github.com/org/other-repo.git")

				expect(sessions).toHaveLength(0)
			})
		})

		describe("getStateForGitUrl", () => {
			it("returns state filtered by gitUrl", () => {
				registry.createSession("session-1", "prompt 1", undefined, {
					gitUrl: "https://github.com/org/repo1.git",
				})
				vi.advanceTimersByTime(1)
				registry.createSession("session-2", "prompt 2", undefined, {
					gitUrl: "https://github.com/org/repo2.git",
				})

				const state = registry.getStateForGitUrl("https://github.com/org/repo1.git")

				expect(state.sessions).toHaveLength(1)
				expect(state.sessions[0].sessionId).toBe("session-1")
			})

			it("preserves selectedId if session is in filtered results", () => {
				const session1 = registry.createSession("session-1", "prompt 1", undefined, {
					gitUrl: "https://github.com/org/repo1.git",
				})
				registry.selectedId = session1.sessionId

				const state = registry.getStateForGitUrl("https://github.com/org/repo1.git")

				expect(state.selectedId).toBe("session-1")
			})

			it("clears selectedId if session is not in filtered results", () => {
				registry.createSession("session-1", "prompt 1", undefined, {
					gitUrl: "https://github.com/org/repo1.git",
				})
				vi.advanceTimersByTime(1)
				const session2 = registry.createSession("session-2", "prompt 2", undefined, {
					gitUrl: "https://github.com/org/repo2.git",
				})
				registry.selectedId = session2.sessionId

				const state = registry.getStateForGitUrl("https://github.com/org/repo1.git")

				expect(state.selectedId).toBeNull()
			})
		})
	})
})

describe("AgentRegistry - Multi-Agent Sessions", () => {
	let registry: AgentRegistry

	beforeEach(() => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date("2020-01-01T00:00:00.000Z"))
		registry = new AgentRegistry()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	describe("createMultiAgentSession", () => {
		it("creates a new multi-agent session", () => {
			const session = registry.createMultiAgentSession({
				workspace: "/test/workspace",
				userTask: "Build a new feature",
			})

			expect(session.sessionId).toBeDefined()
			expect(session.userTask).toBe("Build a new feature")
			expect(session.workspace).toBe("/test/workspace")
			expect(session.status).toBe("initializing")
			expect(session.workflowState).toBe("IDLE")
			expect(session.agents).toHaveLength(0)
			expect(session.artifactSummaries).toHaveLength(0)
			expect(session.workflowHistory).toEqual(["IDLE"])
		})

		it("creates a session with custom ID when provided", () => {
			const session = registry.createMultiAgentSession({
				sessionId: "custom-session-id",
				workspace: "/test/workspace",
				userTask: "Test task",
			})

			expect(session.sessionId).toBe("custom-session-id")
		})

		it("creates a session with metadata", () => {
			const session = registry.createMultiAgentSession({
				workspace: "/test/workspace",
				userTask: "Test task",
				metadata: { priority: "high", tags: ["feature", "ui"] },
			})

			expect(session.metadata).toEqual({ priority: "high", tags: ["feature", "ui"] })
		})

		it("sets the created session as selected", () => {
			registry.createMultiAgentSession({
				workspace: "/test/workspace",
				userTask: "First session",
			})

			expect(registry.selectedMultiAgentSessionId).toBeDefined()
		})
	})

	describe("getMultiAgentSession", () => {
		it("returns undefined for non-existent session", () => {
			const session = registry.getMultiAgentSession("non-existent")
			expect(session).toBeUndefined()
		})

		it("returns the session when it exists", () => {
			const created = registry.createMultiAgentSession({
				workspace: "/test/workspace",
				userTask: "Test task",
			})

			const retrieved = registry.getMultiAgentSession(created.sessionId)
			expect(retrieved).toBeDefined()
			expect(retrieved?.sessionId).toBe(created.sessionId)
			expect(retrieved?.userTask).toBe("Test task")
		})
	})

	describe("getMultiAgentSessions", () => {
		it("returns empty array when no sessions exist", () => {
			const sessions = registry.getMultiAgentSessions()
			expect(sessions).toHaveLength(0)
		})

		it("returns all sessions sorted by creation time (most recent first)", () => {
			registry.createMultiAgentSession({
				workspace: "/workspace1",
				userTask: "First task",
			})
			vi.advanceTimersByTime(1)
			registry.createMultiAgentSession({
				workspace: "/workspace2",
				userTask: "Second task",
			})

			const sessions = registry.getMultiAgentSessions()
			expect(sessions).toHaveLength(2)
			expect(sessions[0].userTask).toBe("Second task")
			expect(sessions[1].userTask).toBe("First task")
		})
	})

	describe("addAgentToSession", () => {
		it("adds an agent to a session", () => {
			const session = registry.createMultiAgentSession({
				workspace: "/test/workspace",
				userTask: "Test task",
			})

			const agent = registry.addAgentToSession(session.sessionId, "agent-1", "architect")

			expect(agent).toBeDefined()
			expect(agent?.agentId).toBe("agent-1")
			expect(agent?.role).toBe("architect")
			expect(agent?.status).toBe("spawning")
			expect(agent?.spawnedAt).toBeDefined()
		})

		it("returns undefined for non-existent session", () => {
			const agent = registry.addAgentToSession("non-existent", "agent-1", "architect")
			expect(agent).toBeUndefined()
		})

		it("tracks agent-to-session mapping", () => {
			const session = registry.createMultiAgentSession({
				workspace: "/test/workspace",
				userTask: "Test task",
			})

			registry.addAgentToSession(session.sessionId, "agent-1", "architect")

			expect(registry.getSessionForAgent("agent-1")).toBe(session.sessionId)
		})

		it("adds multiple agents to the same session", () => {
			const session = registry.createMultiAgentSession({
				workspace: "/test/workspace",
				userTask: "Test task",
			})

			registry.addAgentToSession(session.sessionId, "agent-1", "architect")
			registry.addAgentToSession(session.sessionId, "agent-2", "coder")
			registry.addAgentToSession(session.sessionId, "agent-3", "sceptic")

			const agents = registry.getAgentsForSession(session.sessionId)
			expect(agents).toHaveLength(3)
			expect(agents.map((a) => a.role)).toEqual(["architect", "coder", "sceptic"])
		})
	})

	describe("updateAgentStatus", () => {
		it("updates an agent's status", () => {
			const session = registry.createMultiAgentSession({
				workspace: "/test/workspace",
				userTask: "Test task",
			})
			registry.addAgentToSession(session.sessionId, "agent-1", "architect")

			const agent = registry.updateAgentStatus("agent-1", "ready")

			expect(agent?.status).toBe("ready")
			expect(agent?.lastActivityAt).toBeDefined()
		})

		it("returns undefined for non-existent agent", () => {
			const agent = registry.updateAgentStatus("non-existent", "ready")
			expect(agent).toBeUndefined()
		})
	})

	describe("updateAgentSessionId", () => {
		it("updates an agent's session ID", () => {
			const session = registry.createMultiAgentSession({
				workspace: "/test/workspace",
				userTask: "Test task",
			})
			registry.addAgentToSession(session.sessionId, "agent-1", "architect")

			const agent = registry.updateAgentSessionId("agent-1", "cli-session-123")

			expect(agent?.sessionId).toBe("cli-session-123")
		})
	})

	describe("removeAgentFromSession", () => {
		it("removes an agent from a session", () => {
			const session = registry.createMultiAgentSession({
				workspace: "/test/workspace",
				userTask: "Test task",
			})
			registry.addAgentToSession(session.sessionId, "agent-1", "architect")

			const result = registry.removeAgentFromSession("agent-1")

			expect(result).toBe(true)
			const agents = registry.getAgentsForSession(session.sessionId)
			expect(agents).toHaveLength(0)
			expect(registry.getSessionForAgent("agent-1")).toBeUndefined()
		})

		it("returns false for non-existent agent", () => {
			const result = registry.removeAgentFromSession("non-existent")
			expect(result).toBe(false)
		})
	})

	describe("updateMultiAgentSessionWorkflowState", () => {
		it("updates workflow state", () => {
			const session = registry.createMultiAgentSession({
				workspace: "/test/workspace",
				userTask: "Test task",
			})

			const updated = registry.updateMultiAgentSessionWorkflowState(session.sessionId, "PLANNING")

			expect(updated?.workflowState).toBe("PLANNING")
			expect(updated?.workflowHistory).toEqual(["IDLE", "PLANNING"])
		})

		it("updates step description when provided", () => {
			const session = registry.createMultiAgentSession({
				workspace: "/test/workspace",
				userTask: "Test task",
			})

			const updated = registry.updateMultiAgentSessionWorkflowState(
				session.sessionId,
				"PLANNING",
				"Analyzing requirements...",
			)

			expect(updated?.currentStepDescription).toBe("Analyzing requirements...")
		})

		it("returns undefined for non-existent session", () => {
			const updated = registry.updateMultiAgentSessionWorkflowState("non-existent", "PLANNING")
			expect(updated).toBeUndefined()
		})
	})

	describe("updateMultiAgentSessionStatus", () => {
		it("updates session status", () => {
			const session = registry.createMultiAgentSession({
				workspace: "/test/workspace",
				userTask: "Test task",
			})

			const updated = registry.updateMultiAgentSessionStatus(session.sessionId, "running")

			expect(updated?.status).toBe("running")
		})

		it("sets completedAt when status is completed", () => {
			const session = registry.createMultiAgentSession({
				workspace: "/test/workspace",
				userTask: "Test task",
			})

			const updated = registry.updateMultiAgentSessionStatus(session.sessionId, "completed")

			expect(updated?.completedAt).toBeDefined()
		})

		it("sets error when status is error", () => {
			const session = registry.createMultiAgentSession({
				workspace: "/test/workspace",
				userTask: "Test task",
			})

			const updated = registry.updateMultiAgentSessionStatus(session.sessionId, "error", "Something went wrong")

			expect(updated?.error).toBe("Something went wrong")
			expect(updated?.completedAt).toBeDefined()
		})
	})

	describe("addArtifactToSession", () => {
		it("adds an artifact summary to a session", () => {
			const session = registry.createMultiAgentSession({
				workspace: "/test/workspace",
				userTask: "Test task",
			})

			const artifact = registry.addArtifactToSession(session.sessionId, {
				artifactId: "artifact-1",
				artifactType: "plan",
				summary: "Implementation plan for feature X",
				status: "completed",
				producerRole: "architect",
			})

			expect(artifact).toBeDefined()
			expect(artifact?.artifactId).toBe("artifact-1")
			expect(artifact?.artifactType).toBe("plan")
			expect(artifact?.summary).toBe("Implementation plan for feature X")
		})

		it("returns undefined for non-existent session", () => {
			const artifact = registry.addArtifactToSession("non-existent", {
				artifactId: "artifact-1",
				artifactType: "plan",
				summary: "Test",
				status: "completed",
				producerRole: "architect",
			})
			expect(artifact).toBeUndefined()
		})

		it("allows adding multiple artifacts", () => {
			const session = registry.createMultiAgentSession({
				workspace: "/test/workspace",
				userTask: "Test task",
			})

			registry.addArtifactToSession(session.sessionId, {
				artifactId: "artifact-1",
				artifactType: "plan",
				summary: "Plan",
				status: "completed",
				producerRole: "architect",
			})
			registry.addArtifactToSession(session.sessionId, {
				artifactId: "artifact-2",
				artifactType: "code",
				summary: "Code implementation",
				status: "in-progress",
				producerRole: "coder",
			})

			const summaries = registry.getArtifactSummariesForSession(session.sessionId)
			expect(summaries).toHaveLength(2)
		})
	})

	describe("removeMultiAgentSession", () => {
		it("removes a session and cleans up agent mappings", () => {
			const session = registry.createMultiAgentSession({
				workspace: "/test/workspace",
				userTask: "Test task",
			})
			registry.addAgentToSession(session.sessionId, "agent-1", "architect")
			registry.addAgentToSession(session.sessionId, "agent-2", "coder")

			const result = registry.removeMultiAgentSession(session.sessionId)

			expect(result).toBe(true)
			expect(registry.getMultiAgentSession(session.sessionId)).toBeUndefined()
			expect(registry.getSessionForAgent("agent-1")).toBeUndefined()
			expect(registry.getSessionForAgent("agent-2")).toBeUndefined()
		})

		it("returns false for non-existent session", () => {
			const result = registry.removeMultiAgentSession("non-existent")
			expect(result).toBe(false)
		})

		it("clears selected session when removed", () => {
			const session = registry.createMultiAgentSession({
				workspace: "/test/workspace",
				userTask: "Test task",
			})

			registry.removeMultiAgentSession(session.sessionId)

			expect(registry.selectedMultiAgentSessionId).toBeNull()
		})
	})

	describe("getMultiAgentSessionState and restoreMultiAgentSessionState", () => {
		it("exports session state for persistence", () => {
			const session = registry.createMultiAgentSession({
				workspace: "/test/workspace",
				userTask: "Test task",
			})
			registry.addAgentToSession(session.sessionId, "agent-1", "architect")

			const state = registry.getMultiAgentSessionState()

			expect(state.sessions).toHaveLength(1)
			expect(state.sessions[0].agents).toHaveLength(1)
		})

		it("restores session state from persistence", () => {
			// Create some sessions
			const session1 = registry.createMultiAgentSession({
				workspace: "/workspace1",
				userTask: "Task 1",
			})
			registry.addAgentToSession(session1.sessionId, "agent-1", "architect")

			// Get state
			const state = registry.getMultiAgentSessionState()

			// Create a new registry and restore
			const newRegistry = new AgentRegistry()
			newRegistry.restoreMultiAgentSessionState(state)

			expect(newRegistry.getMultiAgentSessions()).toHaveLength(1)
			// The agent mapping should be restored
			const agentSessionId = newRegistry.getSessionForAgent("agent-1")
			expect(agentSessionId).toBeDefined()
			expect(newRegistry.getMultiAgentSession(agentSessionId!)).toBeDefined()
		})
	})

	describe("hasRunningMultiAgentSessions", () => {
		it("returns false when no sessions are running", () => {
			expect(registry.hasRunningMultiAgentSessions()).toBe(false)
		})

		it("returns true when a session is initializing", () => {
			registry.createMultiAgentSession({
				workspace: "/test/workspace",
				userTask: "Test task",
			})

			expect(registry.hasRunningMultiAgentSessions()).toBe(true)
		})

		it("returns true when a session is running", () => {
			const session = registry.createMultiAgentSession({
				workspace: "/test/workspace",
				userTask: "Test task",
			})
			registry.updateMultiAgentSessionStatus(session.sessionId, "running")

			expect(registry.hasRunningMultiAgentSessions()).toBe(true)
		})

		it("returns false when all sessions are completed", () => {
			const session = registry.createMultiAgentSession({
				workspace: "/test/workspace",
				userTask: "Test task",
			})
			registry.updateMultiAgentSessionStatus(session.sessionId, "completed")

			expect(registry.hasRunningMultiAgentSessions()).toBe(false)
		})
	})

	describe("pruning", () => {
		it("prunes oldest completed multi-agent sessions when over capacity", () => {
			// Create 50 sessions first (at the limit)
			const created: string[] = []
			for (let i = 0; i < 50; i++) {
				vi.advanceTimersByTime(1)
				const session = registry.createMultiAgentSession({
					workspace: `/workspace${i}`,
					userTask: `Task ${i}`,
				})
				created.push(session.sessionId)
			}

			// Mark all as completed except the last one
			for (let i = 0; i < 49; i++) {
				registry.updateMultiAgentSessionStatus(created[i], "completed")
			}

			// Create one more session to trigger pruning
			vi.advanceTimersByTime(1)
			registry.createMultiAgentSession({
				workspace: `/workspace-new`,
				userTask: `New Task`,
			})

			// The oldest completed session should be pruned (session 0)
			const sessions = registry.getMultiAgentSessions()
			expect(sessions).toHaveLength(50)
			expect(sessions.map((s) => s.userTask)).not.toContain("Task 0")
		})
	})
})
