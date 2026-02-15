/**
 * WorkflowStatusView Component Tests
 *
 * Tests for the WorkflowStatusView component that displays workflow status,
 * agent statuses, artifact progress, and workflow control buttons.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"

// Mock the i18n context
vi.mock("@/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string) => key,
	}),
}))

// Mock UI components
vi.mock("@/components/ui/button", () => ({
	Button: ({
		children,
		onClick,
		disabled,
		variant,
		...props
	}: {
		children?: React.ReactNode
		onClick?: () => void
		disabled?: boolean
		variant?: string
	}) => (
		<button onClick={onClick} disabled={disabled} data-variant={variant} {...props}>
			{children}
		</button>
	),
}))

vi.mock("@/components/ui/progress", () => ({
	Progress: ({ value, className, ...props }: { value?: number; className?: string }) => (
		<div className={className} data-value={value} {...props}>
			<div style={{ width: `${value}%` }} />
		</div>
	),
}))

vi.mock("@/components/ui/collapsible", () => ({
	Collapsible: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	CollapsibleContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	CollapsibleTrigger: ({
		children,
		className,
		onClick,
	}: {
		children?: React.ReactNode
		className?: string
		onClick?: () => void
	}) => (
		<button className={className} onClick={onClick}>
			{children}
		</button>
	),
}))

// Import the component to test
import { WorkflowStatusView } from "../WorkflowStatusView"
import type { WorkflowStatusUI, AgentStatusUI, ArtifactProgressUI } from "../types"

// Test data factories
function createMockAgentStatus(overrides: Partial<AgentStatusUI> = {}): AgentStatusUI {
	return {
		agentId: "agent-1",
		roleName: "Primary Coder",
		status: "working",
		currentTask: "Implementing feature X",
		progress: 50,
		lastUpdate: Date.now(),
		...overrides,
	}
}

function createMockArtifactProgress(overrides: Partial<ArtifactProgressUI> = {}): ArtifactProgressUI {
	return {
		id: "artifact-1",
		type: "code",
		name: "feature.ts",
		status: "in_progress",
		progress: 75,
		...overrides,
	}
}

function createMockWorkflowStatus(overrides: Partial<WorkflowStatusUI> = {}): WorkflowStatusUI {
	return {
		workflowState: "PLANNING",
		currentStep: 1,
		totalSteps: 9,
		currentStepDescription: "Creating implementation plan",
		progress: 11,
		agents: [],
		artifacts: [],
		isPaused: false,
		isRunning: true,
		startedAt: Date.now() - 60000,
		lastUpdated: Date.now(),
		...overrides,
	}
}

describe("WorkflowStatusView", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("Rendering", () => {
		it("should render with default state when no status provided", () => {
			render(<WorkflowStatusView status={undefined} />)

			// Should show idle state
			expect(screen.getByText(/idle/i)).toBeInTheDocument()
			expect(screen.getByText(/no workflow active/i)).toBeInTheDocument()
		})

		it("should render with provided status", () => {
			const status = createMockWorkflowStatus({
				workflowState: "CODE_IMPLEMENTATION",
				currentStep: 4,
				progress: 44,
				currentStepDescription: "Implementing code",
			})

			render(<WorkflowStatusView status={status} />)

			expect(screen.getByText(/code implementation/i)).toBeInTheDocument()
			expect(screen.getByText(/implementing code/i)).toBeInTheDocument()
		})

		it("should display workflow progress percentage", () => {
			const status = createMockWorkflowStatus({
				progress: 50,
			})

			render(<WorkflowStatusView status={status} />)

			expect(screen.getByText(/50%/)).toBeInTheDocument()
		})

		it("should display step progress", () => {
			const status = createMockWorkflowStatus({
				currentStep: 3,
				totalSteps: 9,
			})

			render(<WorkflowStatusView status={status} />)

			expect(screen.getByText(/step 4 \/ 9/)).toBeInTheDocument()
		})

		it("should display workflow state label", () => {
			const status = createMockWorkflowStatus({
				workflowState: "COMPLETED",
			})

			render(<WorkflowStatusView status={status} />)

			expect(screen.getByText(/completed/i)).toBeInTheDocument()
		})

		it("should display error state correctly", () => {
			const status = createMockWorkflowStatus({
				workflowState: "ERROR",
				error: "Failed to compile code",
				isRunning: false,
			})

			render(<WorkflowStatusView status={status} />)

			expect(screen.getAllByText(/error/i).length).toBeGreaterThan(0)
			expect(screen.getByText(/failed to compile code/i)).toBeInTheDocument()
		})

		it("should display paused state correctly", () => {
			const status = createMockWorkflowStatus({
				workflowState: "PAUSED",
				isPaused: true,
				isRunning: false,
			})

			render(<WorkflowStatusView status={status} />)

			// Should show paused heading (not the button text)
			const pausedHeadings = screen.getAllByText(/paused/i)
			expect(pausedHeadings.length).toBeGreaterThan(0)
		})
	})

	describe("Agent Status Display", () => {
		it("should display agents section when agents present", () => {
			const status = createMockWorkflowStatus({
				agents: [
					createMockAgentStatus({ roleName: "Architect", status: "completed" }),
					createMockAgentStatus({ roleName: "Primary Coder", status: "working" }),
				],
			})

			render(<WorkflowStatusView status={status} />)

			expect(screen.getByText(/agents \(2\)/i)).toBeInTheDocument()
			expect(screen.getByText(/architect/i)).toBeInTheDocument()
			expect(screen.getByText(/primary coder/i)).toBeInTheDocument()
		})

		it("should not display agents section when no agents", () => {
			const status = createMockWorkflowStatus({
				agents: [],
			})

			render(<WorkflowStatusView status={status} />)

			expect(screen.queryByText(/agents/i)).not.toBeInTheDocument()
		})

		it("should display agent status correctly", () => {
			const status = createMockWorkflowStatus({
				agents: [createMockAgentStatus({ status: "working", currentTask: "Writing tests" })],
			})

			render(<WorkflowStatusView status={status} />)

			expect(screen.getByText(/writing tests/i)).toBeInTheDocument()
		})

		it("should display agent progress bar", () => {
			const status = createMockWorkflowStatus({
				agents: [createMockAgentStatus({ progress: 75 })],
			})

			render(<WorkflowStatusView status={status} />)

			// Progress bar is in the agent card
			expect(screen.getByText(/75%/)).toBeInTheDocument()
		})
	})

	describe("Artifact Progress Display", () => {
		it("should display artifacts section when artifacts present", () => {
			const status = createMockWorkflowStatus({
				artifacts: [
					createMockArtifactProgress({ name: "main.ts", type: "code" }),
					createMockArtifactProgress({ name: "plan.json", type: "implementation_plan" }),
				],
			})

			render(<WorkflowStatusView status={status} />)

			expect(screen.getByText(/artifacts \(2\)/i)).toBeInTheDocument()
		})

		it("should not display artifacts section when no artifacts", () => {
			const status = createMockWorkflowStatus({
				artifacts: [],
			})

			render(<WorkflowStatusView status={status} />)

			expect(screen.queryByText(/artifacts/i)).not.toBeInTheDocument()
		})

		it("should display artifact name and type", () => {
			const status = createMockWorkflowStatus({
				artifacts: [createMockArtifactProgress({ name: "utils.ts", type: "code" })],
			})

			render(<WorkflowStatusView status={status} />)

			expect(screen.getByText(/utils\.ts/i)).toBeInTheDocument()
			expect(screen.getByText(/code/i)).toBeInTheDocument()
		})

		it("should display artifact progress", () => {
			const status = createMockWorkflowStatus({
				artifacts: [createMockArtifactProgress({ progress: 60 })],
			})

			render(<WorkflowStatusView status={status} />)

			expect(screen.getByText(/60%/)).toBeInTheDocument()
		})

		it("should display completed artifact status", () => {
			const status = createMockWorkflowStatus({
				artifacts: [createMockArtifactProgress({ status: "completed", progress: 100 })],
			})

			render(<WorkflowStatusView status={status} />)

			expect(screen.getByText(/100%/)).toBeInTheDocument()
		})
	})

	describe("Control Buttons", () => {
		it("should display pause button when running", () => {
			const status = createMockWorkflowStatus({
				isRunning: true,
				isPaused: false,
			})

			render(<WorkflowStatusView status={status} />)

			expect(screen.getByRole("button", { name: /pause/i })).toBeInTheDocument()
		})

		it("should display resume button when paused", () => {
			const status = createMockWorkflowStatus({
				isRunning: false,
				isPaused: true,
			})

			render(<WorkflowStatusView status={status} />)

			expect(screen.getByRole("button", { name: /resume/i })).toBeInTheDocument()
		})

		it("should display cancel button when running or paused", () => {
			const runningStatus = createMockWorkflowStatus({
				isRunning: true,
				isPaused: false,
			})

			render(<WorkflowStatusView status={runningStatus} />)
			expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument()
		})

		it("should display retry button when in error state", () => {
			const status = createMockWorkflowStatus({
				workflowState: "ERROR",
				isRunning: false,
			})

			render(<WorkflowStatusView status={status} />)

			expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument()
		})

		it("should not display control buttons in read-only mode", () => {
			const status = createMockWorkflowStatus({
				isRunning: true,
			})

			render(<WorkflowStatusView status={status} readOnly />)

			expect(screen.queryByRole("button", { name: /pause/i })).not.toBeInTheDocument()
			expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument()
		})

		it("should call onPause callback when pause button clicked", () => {
			const onPause = vi.fn()
			const status = createMockWorkflowStatus({
				isRunning: true,
				isPaused: false,
			})

			render(<WorkflowStatusView status={status} onPause={onPause} />)

			fireEvent.click(screen.getByRole("button", { name: /pause/i }))

			expect(onPause).toHaveBeenCalledTimes(1)
		})

		it("should call onResume callback when resume button clicked", () => {
			const onResume = vi.fn()
			const status = createMockWorkflowStatus({
				isRunning: false,
				isPaused: true,
			})

			render(<WorkflowStatusView status={status} onResume={onResume} />)

			fireEvent.click(screen.getByRole("button", { name: /resume/i }))

			expect(onResume).toHaveBeenCalledTimes(1)
		})

		it("should call onCancel callback when cancel button clicked", () => {
			const onCancel = vi.fn()
			const status = createMockWorkflowStatus({
				isRunning: true,
			})

			render(<WorkflowStatusView status={status} onCancel={onCancel} />)

			fireEvent.click(screen.getByRole("button", { name: /cancel/i }))

			expect(onCancel).toHaveBeenCalledTimes(1)
		})

		it("should call onRetry callback when retry button clicked", () => {
			const onRetry = vi.fn()
			const status = createMockWorkflowStatus({
				workflowState: "ERROR",
			})

			render(<WorkflowStatusView status={status} onRetry={onRetry} />)

			fireEvent.click(screen.getByRole("button", { name: /retry/i }))

			expect(onRetry).toHaveBeenCalledTimes(1)
		})
	})

	describe("Duration Display", () => {
		it("should display duration when workflow is running", () => {
			const status = createMockWorkflowStatus({
				isRunning: true,
				startedAt: Date.now() - 120000, // 2 minutes ago
			})

			render(<WorkflowStatusView status={status} />)

			expect(screen.getByText(/duration/i)).toBeInTheDocument()
		})

		it("should not display duration when workflow is not running", () => {
			const status = createMockWorkflowStatus({
				isRunning: false,
				startedAt: undefined,
			})

			render(<WorkflowStatusView status={status} />)

			expect(screen.queryByText(/duration/i)).not.toBeInTheDocument()
		})
	})

	describe("Empty State", () => {
		it("should show empty state message when workflow is idle", () => {
			const status = createMockWorkflowStatus({
				workflowState: "IDLE",
				isRunning: false,
			})

			render(<WorkflowStatusView status={status} />)

			// Should show idle heading
			expect(screen.getByText(/idle/i)).toBeInTheDocument()
			// Should show the hint text
			expect(screen.getAllByText(/no workflow active/i).length).toBeGreaterThan(0)
		})
	})
})
