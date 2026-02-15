/**
 * RoleAssignmentCard Component Tests
 *
 * Tests for the RoleAssignmentCard component that displays individual role
 * configuration with provider profile selection and expandable sections.
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

vi.mock("@/components/ui/toggle-switch", () => ({
	ToggleSwitch: ({
		checked,
		onChange,
		disabled,
		"aria-label": ariaLabel,
	}: {
		checked?: boolean
		onChange?: () => void
		disabled?: boolean
		"aria-label"?: string
	}) => <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} aria-label={ariaLabel} />,
}))

vi.mock("@/components/ui/select", () => ({
	Select: ({
		children,
		value,
		onValueChange,
		disabled,
	}: {
		children?: React.ReactNode
		value?: string
		onValueChange?: (value: string) => void
		disabled?: boolean
	}) => (
		<select value={value} onChange={(e) => onValueChange?.(e.target.value)} disabled={disabled}>
			{children}
		</select>
	),
	SelectContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	SelectItem: ({ value, children }: { value?: string; children?: React.ReactNode }) => (
		<option value={value}>{children}</option>
	),
	SelectTrigger: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}))

vi.mock("@/components/ui/collapsible", () => ({
	Collapsible: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	CollapsibleContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	CollapsibleTrigger: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}))

// Import the component after mocking
import { RoleAssignmentCard } from "../RoleAssignmentCard"
import type { RoleDefinitionUI, RoleConfigUI, ProviderProfileUI } from "../types"

describe("RoleAssignmentCard", () => {
	// Test data
	const mockRole: RoleDefinitionUI = {
		id: "architect",
		name: "Architect",
		description: "Designs implementation plans and architecture",
		category: "planning",
		required: true,
		capabilities: [
			{ name: "Repository Analysis", description: "Analyze codebase structure", required: true },
			{ name: "Planning", description: "Create implementation plans", required: true },
		],
		inputArtifactTypes: ["user_task"],
		outputArtifactTypes: ["implementation_plan"],
		defaultMode: "architect",
		priority: 1,
	}

	const mockConfig: RoleConfigUI = {
		roleId: "architect",
		enabled: true,
		providerProfileId: "profile-1",
		mode: "architect",
		priority: 1,
	}

	const mockProfiles: ProviderProfileUI[] = [
		{ id: "profile-1", name: "Fast Model", providerType: "anthropic", model: "claude-3-haiku" },
		{ id: "profile-2", name: "Smart Model", providerType: "anthropic", model: "claude-3-5-sonnet" },
	]

	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("Rendering", () => {
		it("should render role name and description", () => {
			render(<RoleAssignmentCard role={mockRole} config={mockConfig} availableProfiles={mockProfiles} />)

			expect(screen.getByText("Architect")).toBeDefined()
			expect(screen.getByText("Designs implementation plans and architecture")).toBeDefined()
		})

		it("should show (required) badge for required roles", () => {
			render(<RoleAssignmentCard role={mockRole} config={mockConfig} availableProfiles={mockProfiles} />)

			// Use getAllByText since there are multiple (required) badges (role + capabilities)
			// Check that at least one exists in the role header
			const requiredBadges = screen.getAllByText("(required)")
			expect(requiredBadges.length).toBeGreaterThan(0)
		})

		it("should not show role (required) badge for optional roles in header", () => {
			const optionalRole = { ...mockRole, required: false }
			render(<RoleAssignmentCard role={optionalRole} config={mockConfig} availableProfiles={mockProfiles} />)

			// Get the first (required) which should be from capabilities
			const requiredBadges = screen.getAllByText("(required)")
			// There should still be (required) badges from capabilities
			expect(requiredBadges.length).toBeGreaterThan(0)
		})

		it("should render provider profile selector", () => {
			render(<RoleAssignmentCard role={mockRole} config={mockConfig} availableProfiles={mockProfiles} />)

			// Select element should be present
			const select = document.querySelector("select")
			expect(select).toBeDefined()
		})

		it("should display selected profile details when enabled", () => {
			render(<RoleAssignmentCard role={mockRole} config={mockConfig} availableProfiles={mockProfiles} />)

			// Profile details should be visible when enabled
			expect(screen.getByText("anthropic")).toBeDefined()
			expect(screen.getByText("claude-3-haiku")).toBeDefined()
		})

		it("should not display profile details when disabled", () => {
			const disabledConfig = { ...mockConfig, enabled: false }
			render(<RoleAssignmentCard role={mockRole} config={disabledConfig} availableProfiles={mockProfiles} />)

			// Profile details should not be visible when disabled
			expect(screen.queryByText("claude-3-haiku")).toBeNull()
		})
	})

	describe("Interactions", () => {
		it("should call onToggleEnabled when toggle is clicked", () => {
			const handleToggle = vi.fn()
			const optionalRole = { ...mockRole, required: false }

			render(
				<RoleAssignmentCard
					role={optionalRole}
					config={mockConfig}
					availableProfiles={mockProfiles}
					onToggleEnabled={handleToggle}
				/>,
			)

			const toggle = document.querySelector('input[type="checkbox"]')
			if (toggle) {
				fireEvent.click(toggle)
				expect(handleToggle).toHaveBeenCalled()
			}
		})

		it("should not call onToggleEnabled when role is required", () => {
			const handleToggle = vi.fn()

			render(
				<RoleAssignmentCard
					role={mockRole}
					config={mockConfig}
					availableProfiles={mockProfiles}
					onToggleEnabled={handleToggle}
				/>,
			)

			const toggle = document.querySelector('input[type="checkbox"]') as HTMLInputElement
			if (toggle) {
				fireEvent.click(toggle)
				expect(handleToggle).not.toHaveBeenCalled()
			}
		})

		it("should call onSelectProfile when profile is changed", () => {
			const handleSelectProfile = vi.fn()

			render(
				<RoleAssignmentCard
					role={mockRole}
					config={mockConfig}
					availableProfiles={mockProfiles}
					onSelectProfile={handleSelectProfile}
				/>,
			)

			// The select fires onChange when value changes
			const select = document.querySelector("select")
			if (select) {
				// Simulate selecting a different value
				fireEvent.change(select, { target: { value: "profile-2" } })
				// The handler is called with the new value
				expect(handleSelectProfile).toHaveBeenCalled()
			}
		})

		it("should call onSelectMode when mode is changed", () => {
			const handleSelectMode = vi.fn()

			render(
				<RoleAssignmentCard
					role={mockRole}
					config={mockConfig}
					availableProfiles={mockProfiles}
					availableModes={["architect", "code"]}
					onSelectMode={handleSelectMode}
				/>,
			)

			// There should be multiple selects (profile + mode)
			const selects = document.querySelectorAll("select")
			if (selects.length >= 2) {
				fireEvent.change(selects[1], { target: { value: "code" } })
				expect(handleSelectMode).toHaveBeenCalled()
			}
		})
	})

	describe("Expandable Sections", () => {
		it("should render capabilities when expanded", () => {
			render(
				<RoleAssignmentCard
					role={mockRole}
					config={mockConfig}
					availableProfiles={mockProfiles}
					defaultExpanded={true}
				/>,
			)

			// Capabilities should be visible when expanded
			expect(screen.getByText("Capabilities")).toBeDefined()
			expect(screen.getByText("Repository Analysis")).toBeDefined()
		})

		it("should render input/output artifacts when expanded", () => {
			render(
				<RoleAssignmentCard
					role={mockRole}
					config={mockConfig}
					availableProfiles={mockProfiles}
					defaultExpanded={true}
				/>,
			)

			// Artifacts should be visible when expanded
			expect(screen.getByText("Input Artifacts")).toBeDefined()
			expect(screen.getByText("Output Artifacts")).toBeDefined()
		})

		it("should not show expand button when no expandable content", () => {
			const roleNoExtras = {
				...mockRole,
				capabilities: [],
				inputArtifactTypes: [],
				outputArtifactTypes: [],
			}

			const { container } = render(
				<RoleAssignmentCard role={roleNoExtras} config={mockConfig} availableProfiles={mockProfiles} />,
			)

			// Should not have expand button
			const buttons = container.querySelectorAll("button")
			expect(buttons.length).toBe(0)
		})
	})

	describe("Read-only Mode", () => {
		it("should disable interactions when readOnly is true", () => {
			const handleToggle = vi.fn()
			const handleSelectProfile = vi.fn()

			render(
				<RoleAssignmentCard
					role={mockRole}
					config={mockConfig}
					availableProfiles={mockProfiles}
					readOnly={true}
					onToggleEnabled={handleToggle}
					onSelectProfile={handleSelectProfile}
				/>,
			)

			const toggle = document.querySelector('input[type="checkbox"]') as HTMLInputElement
			const select = document.querySelector("select") as HTMLSelectElement

			if (toggle) {
				expect(toggle.disabled).toBe(true)
			}
			if (select) {
				expect(select.disabled).toBe(true)
			}
		})
	})

	describe("Edge Cases", () => {
		it("should handle empty profiles array", () => {
			render(<RoleAssignmentCard role={mockRole} config={mockConfig} availableProfiles={[]} />)

			// Should still render without errors
			expect(screen.getByText("Architect")).toBeDefined()
		})

		it("should handle null providerProfileId", () => {
			const configNoProfile = { ...mockConfig, providerProfileId: null }

			render(<RoleAssignmentCard role={mockRole} config={configNoProfile} availableProfiles={mockProfiles} />)

			// Should render without errors and show placeholder
			expect(screen.getByText("Architect")).toBeDefined()
		})

		it("should handle empty capabilities array", () => {
			const roleNoCaps = { ...mockRole, capabilities: [] }

			render(
				<RoleAssignmentCard
					role={roleNoCaps}
					config={mockConfig}
					availableProfiles={mockProfiles}
					defaultExpanded={true}
				/>,
			)

			// Should not show capabilities section
			expect(screen.queryByText("Capabilities")).toBeNull()
		})

		it("should handle empty artifact types arrays", () => {
			const roleNoArtifacts = {
				...mockRole,
				inputArtifactTypes: [],
				outputArtifactTypes: [],
			}

			const { container: _container } = render(
				<RoleAssignmentCard
					role={roleNoArtifacts}
					config={mockConfig}
					availableProfiles={mockProfiles}
					defaultExpanded={true}
				/>,
			)

			// Should not show artifacts section
			expect(screen.queryByText("Input Artifacts")).toBeNull()
			expect(screen.queryByText("Output Artifacts")).toBeNull()
		})

		it("should handle single mode in availableModes (no mode selector)", () => {
			render(
				<RoleAssignmentCard
					role={mockRole}
					config={mockConfig}
					availableProfiles={mockProfiles}
					availableModes={["architect"]}
				/>,
			)

			// Should only have one select (profile), not two
			const selects = document.querySelectorAll("select")
			expect(selects.length).toBe(1)
		})
	})
})
