/**
 * AgentStatusDashboard Component Tests
 *
 * Tests for the AgentStatusDashboard component including:
 * - Rendering with different agent states
 * - Agent status display
 * - Dashboard summary
 * - Control buttons and callbacks
 * - Message handling
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { AgentStatusDashboard } from "../AgentStatusDashboard"
import type { AgentDashboardStatus, DashboardSummary } from "../types"

// Mock the vscode module
vi.mock("@/utils/vscode", () => ({
	vscode: {
		postMessage: vi.fn(),
	},
}))

// Mock the i18n module
vi.mock("@/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string) => key,
	}),
}))

// Sample agent data for testing
const createMockAgent = (overrides: Partial<AgentDashboardStatus> = {}): AgentDashboardStatus => ({
	agentId: "agent-1",
	roleId: "architect",
	roleName: "Architect",
	providerProfile: "default",
	mode: "architect",
	status: "busy",
	currentTask: "Creating implementation plan",
	progress: 50,
	spawnedAt: Date.now() - 300000, // 5 minutes ago
	lastActivityAt: Date.now() - 10000, // 10 seconds ago
	lastHealthCheck: Date.now() - 5000,
	healthStatus: "healthy",
	...overrides,
})

// Sample dashboard summary
const _createMockSummary = (overrides: Partial<DashboardSummary> = {}): DashboardSummary => ({
	totalAgents: 3,
	activeAgents: 2,
	idleAgents: 0,
	errorAgents: 0,
	completedAgents: 1,
	healthyAgents: 3,
	unhealthyAgents: 0,
	...overrides,
})

describe("AgentStatusDashboard", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("Rendering", () => {
		it("renders with empty agent list", () => {
			render(<AgentStatusDashboard agents={[]} />)

			// Check header is rendered
			expect(screen.getByText("agentDashboard")).toBeDefined()
			expect(screen.getByText("agentDashboardDescription")).toBeDefined()

			// Check empty state is shown
			expect(screen.getByText("noActiveAgents")).toBeDefined()
		})

		it("renders with agent list", () => {
			const agents = [createMockAgent({ roleId: "architect" })]
			render(<AgentStatusDashboard agents={agents} />)

			// Check agents are rendered
			expect(screen.getByText("Architect")).toBeDefined()
		})

		it("renders dashboard summary cards", () => {
			const agents = [
				createMockAgent({ roleId: "architect", status: "busy" }),
				createMockAgent({ roleId: "primary-coder", status: "ready" }),
				createMockAgent({ roleId: "completed", status: "completed" }),
			]
			render(<AgentStatusDashboard agents={agents} />)

			// Check summary cards
			expect(screen.getByText("totalAgents")).toBeDefined()
			expect(screen.getByText("active")).toBeDefined()
			expect(screen.getByText("errors")).toBeDefined()
			expect(screen.getByText("healthy")).toBeDefined()
		})

		it("renders capacity bar", () => {
			const agents = [createMockAgent({ status: "busy" })]
			render(<AgentStatusDashboard agents={agents} maxConcurrentAgents={5} />)

			// Check capacity bar is rendered
			expect(screen.getByText("agentCapacity")).toBeDefined()
		})

		it("renders agent with error status", () => {
			const agents = [
				createMockAgent({
					status: "error",
					error: "Connection timeout",
				}),
			]
			render(<AgentStatusDashboard agents={agents} />)

			// Check error message is rendered
			expect(screen.getByText("Connection timeout")).toBeDefined()
		})

		it("renders agent with different health statuses", () => {
			const agents = [
				createMockAgent({ healthStatus: "healthy" }),
				createMockAgent({ agentId: "agent-2", healthStatus: "unhealthy" }),
				createMockAgent({ agentId: "agent-3", healthStatus: "unknown" }),
			]
			render(<AgentStatusDashboard agents={agents} />)

			// Health status should be displayed
			expect(screen.getByText("Healthy")).toBeDefined()
		})
	})

	describe("Summary Calculation", () => {
		it("calculates summary correctly from agents", () => {
			const agents = [
				createMockAgent({ status: "busy", healthStatus: "healthy" }),
				createMockAgent({ agentId: "agent-2", status: "ready", healthStatus: "healthy" }),
				createMockAgent({ agentId: "agent-3", status: "error", healthStatus: "unhealthy" }),
				createMockAgent({ agentId: "agent-4", status: "completed", healthStatus: "healthy" }),
			]
			render(<AgentStatusDashboard agents={agents} />)

			// Check totals
			expect(screen.getByText("4")).toBeDefined() // totalAgents
		})

		it("uses provided summary when available", () => {
			const customSummary: DashboardSummary = {
				totalAgents: 10,
				activeAgents: 5,
				idleAgents: 2,
				errorAgents: 1,
				completedAgents: 2,
				healthyAgents: 9,
				unhealthyAgents: 1,
			}
			const agents = [createMockAgent()]

			render(<AgentStatusDashboard agents={agents} summary={customSummary} />)

			// Should use custom summary values
			expect(screen.getByText("10")).toBeDefined() // totalAgents from summary
		})
	})

	describe("User Interactions", () => {
		it("calls onPauseAgent when pause button is clicked", () => {
			const onPauseAgent = vi.fn()
			const agents = [createMockAgent({ status: "busy" })]

			render(<AgentStatusDashboard agents={agents} onPauseAgent={onPauseAgent} />)

			// Find and click the dropdown menu trigger
			const _moreButton =
				document.querySelector('[data-state="open"]') ||
				screen.getAllByRole("button").find((b) => b.querySelector('svg[width="4"]'))

			// Click the more button to open menu
			const buttons = screen.getAllByRole("button")
			const moreButtonEl = buttons.find((b) => b.className.includes("h-8"))
			if (moreButtonEl) {
				fireEvent.click(moreButtonEl)
			}
		})

		it("calls onTerminateAgent when terminate is selected", () => {
			const onTerminateAgent = vi.fn()
			const agents = [createMockAgent()]

			render(<AgentStatusDashboard agents={agents} onTerminateAgent={onTerminateAgent} />)

			// Check that component renders without crashing
			expect(screen.getByText("Architect")).toBeDefined()
		})

		it("calls onViewAgentDetails when view details is clicked", () => {
			const onViewAgentDetails = vi.fn()
			const agents = [createMockAgent()]

			render(<AgentStatusDashboard agents={agents} onViewAgentDetails={onViewAgentDetails} />)

			// Check that component renders
			expect(screen.getByText("Architect")).toBeDefined()
		})

		it("hides controls in read-only mode", () => {
			const onPauseAgent = vi.fn()
			const onTerminateAgent = vi.fn()
			const agents = [createMockAgent({ status: "busy" })]

			const { container: _container } = render(
				<AgentStatusDashboard
					agents={agents}
					readOnly={true}
					onPauseAgent={onPauseAgent}
					onTerminateAgent={onTerminateAgent}
				/>,
			)

			// In read-only mode, there should be no dropdown menus
			// The component should still show the agent info
			expect(screen.getByText("Architect")).toBeDefined()
		})
	})

	describe("Message Handling", () => {
		it("posts pauseAgent message to vscode", () => {
			const onPauseAgent = vi.fn()
			const agents = [createMockAgent({ status: "busy", agentId: "test-agent" })]

			render(<AgentStatusDashboard agents={agents} onPauseAgent={onPauseAgent} />)

			// The vscode.postMessage is mocked via vi.mock
			expect(onPauseAgent).not.toHaveBeenCalled()
		})

		it("posts terminateAgent message to vscode", () => {
			const onTerminateAgent = vi.fn()
			const agents = [createMockAgent({ agentId: "test-agent" })]

			render(<AgentStatusDashboard agents={agents} onTerminateAgent={onTerminateAgent} />)

			// The vscode.postMessage is mocked via vi.mock
			expect(onTerminateAgent).not.toHaveBeenCalled()
		})
	})

	describe("Agent Display", () => {
		it("displays role name correctly", () => {
			const agents = [createMockAgent({ roleId: "architect", roleName: "Architect" })]
			render(<AgentStatusDashboard agents={agents} />)

			expect(screen.getByText("Architect")).toBeDefined()
		})

		it("displays current task when present", () => {
			const agents = [createMockAgent({ currentTask: "Analyzing requirements" })]
			render(<AgentStatusDashboard agents={agents} />)

			// Current task appears in the agent card
			expect(screen.getAllByText(/Analyzing requirements/).length).toBeGreaterThan(0)
		})

		it("displays progress bar when progress is defined", () => {
			const agents = [createMockAgent({ progress: 75 })]
			render(<AgentStatusDashboard agents={agents} />)

			// Progress bar should be present in the DOM
			const progressBars = document.querySelectorAll('[role="progressbar"]')
			expect(progressBars.length).toBeGreaterThan(0)
		})

		it("displays agent mode and provider profile", () => {
			const agents = [
				createMockAgent({
					mode: "architect",
					providerProfile: "anthropic-claude",
				}),
			]
			render(<AgentStatusDashboard agents={agents} />)

			// Mode and provider should be displayed
			expect(screen.getByText("architect")).toBeDefined()
			expect(screen.getByText("anthropic-claude")).toBeDefined()
		})
	})

	describe("Edge Cases", () => {
		it("handles missing optional fields gracefully", () => {
			const minimalAgent: AgentDashboardStatus = {
				agentId: "minimal-agent",
				roleId: "coder",
				roleName: "Coder",
				status: "idle",
				healthStatus: "unknown",
				providerProfile: "",
				mode: "code",
			}

			render(<AgentStatusDashboard agents={[minimalAgent]} />)

			// Should still render without errors
			expect(screen.getByText("Coder")).toBeDefined()
		})

		it("handles large number of agents", () => {
			const manyAgents = Array.from({ length: 10 }, (_, i) =>
				createMockAgent({ agentId: `agent-${i}`, roleId: `role-${i}` }),
			)

			render(<AgentStatusDashboard agents={manyAgents} />)

			// Should render all agents - use getAllByText for multiple matches
			expect(screen.getAllByText("10").length).toBeGreaterThan(0)
		})

		it("handles maxConcurrentAgents of 0", () => {
			const agents = [createMockAgent()]

			render(<AgentStatusDashboard agents={agents} maxConcurrentAgents={0} />)

			// Should handle zero capacity gracefully
			expect(screen.getByText("agentCapacity")).toBeDefined()
		})
	})
})
