/**
 * RoleAssignmentCard Component
 *
 * Individual role card component for multi-agent orchestration configuration.
 * Displays role name, description, provider profile selector, and expandable sections
 * for capabilities and input/output artifacts.
 */

import { useState, useCallback } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { Button } from "@/components/ui/button"
import { ToggleSwitch } from "@/components/ui/toggle-switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

import type { RoleDefinitionUI, RoleConfigUI, ProviderProfileUI } from "./types"

export interface RoleAssignmentCardProps {
	/** Role definition from backend */
	role: RoleDefinitionUI
	/** Current role configuration */
	config: RoleConfigUI
	/** Available provider profiles */
	availableProfiles: ProviderProfileUI[]
	/** Available modes for this role */
	availableModes?: string[]
	/** Callback when enabled toggle changes */
	onToggleEnabled?: (enabled: boolean) => void
	/** Callback when provider profile is selected */
	onSelectProfile?: (profileId: string | null) => void
	/** Callback when mode is selected */
	onSelectMode?: (mode: string) => void
	/** Callback when priority changes */
	onChangePriority?: (priority: number) => void
	/** Whether the component is in read-only mode */
	readOnly?: boolean
	/** Whether the card is initially expanded */
	defaultExpanded?: boolean
	/** Additional CSS classes */
	className?: string
}

/**
 * RoleAssignmentCard Component
 *
 * Displays a single role configuration with:
 * - Enable/disable toggle
 * - Role name and description
 * - Provider profile selector
 * - Expandable capabilities section
 * - Expandable input/output artifacts section
 */
export const RoleAssignmentCard = ({
	role,
	config,
	availableProfiles,
	availableModes = [],
	onToggleEnabled,
	onSelectProfile,
	onSelectMode,
	onChangePriority: _onChangePriority,
	readOnly = false,
	defaultExpanded = false,
	className = "",
}: RoleAssignmentCardProps) => {
	const { t: _t } = useAppTranslation()

	// Internal state for expansion (doesn't trigger parent updates)
	const [isExpanded, setIsExpanded] = useState(defaultExpanded)

	// Handle toggle enabled
	const handleToggleEnabled = useCallback(() => {
		if (readOnly || role.required) return
		onToggleEnabled?.(!config.enabled)
	}, [readOnly, role.required, config.enabled, onToggleEnabled])

	// Handle profile selection
	const handleProfileChange = useCallback(
		(value: string) => {
			if (readOnly) return
			onSelectProfile?.(value || null)
		},
		[readOnly, onSelectProfile],
	)

	// Handle mode selection
	const handleModeChange = useCallback(
		(value: string) => {
			if (readOnly) return
			onSelectMode?.(value)
		},
		[readOnly, onSelectMode],
	)

	// Get the selected profile details
	const selectedProfile = availableProfiles.find((p) => p.id === config.providerProfileId)

	// Check if capabilities should be shown
	const hasCapabilities = role.capabilities && role.capabilities.length > 0

	// Check if artifacts should be shown
	const hasInputArtifacts = role.inputArtifactTypes && role.inputArtifactTypes.length > 0
	const hasOutputArtifacts = role.outputArtifactTypes && role.outputArtifactTypes.length > 0
	const hasArtifacts = hasInputArtifacts || hasOutputArtifacts

	// Determine if we should show expand button (if there's anything to expand)
	const showExpandButton = hasCapabilities || hasArtifacts

	// Handle expand/collapse toggle
	const handleToggleExpand = useCallback(() => {
		setIsExpanded((prev) => !prev)
	}, [])

	// Get mode options - use provided modes or fall back to role default
	const modeOptions = availableModes.length > 0 ? availableModes : [role.defaultMode].filter(Boolean)

	return (
		<div className={`role-assignment-card ${className}`}>
			<Collapsible open={isExpanded} onOpenChange={handleToggleExpand}>
				<div className="border rounded-md bg-vscode-editor-background">
					{/* Header */}
					<div className="flex items-center justify-between p-3">
						<div className="flex items-center gap-3">
							<ToggleSwitch
								checked={config.enabled}
								onChange={handleToggleEnabled}
								disabled={readOnly || role.required}
								aria-label={`Enable ${role.name}`}
							/>
							<div>
								<p className="font-medium">
									{role.name}
									{role.required && (
										<span className="text-xs text-vscode-descriptionForeground ml-1">
											(required)
										</span>
									)}
								</p>
								<p className="text-xs text-vscode-descriptionForeground">{role.description}</p>
							</div>
						</div>
						<div className="flex items-center gap-2">
							{/* Provider Profile Selector */}
							<Select
								value={config.providerProfileId ?? ""}
								onValueChange={handleProfileChange}
								disabled={readOnly}>
								<SelectTrigger className="w-48">
									<SelectValue placeholder="Select provider" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="">None</SelectItem>
									{availableProfiles.map((profile) => (
										<SelectItem key={profile.id} value={profile.id}>
											{profile.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>

							{/* Mode Selector (if multiple modes available) */}
							{modeOptions.length > 1 && (
								<Select
									value={config.mode || role.defaultMode}
									onValueChange={handleModeChange}
									disabled={readOnly}>
									<SelectTrigger className="w-36">
										<SelectValue placeholder="Select mode" />
									</SelectTrigger>
									<SelectContent>
										{modeOptions.map((mode) => (
											<SelectItem key={mode} value={mode}>
												{mode}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							)}

							{/* Expand/Collapse Button */}
							{showExpandButton && (
								<CollapsibleTrigger asChild>
									<Button variant="ghost" size="sm" aria-label={isExpanded ? "Collapse" : "Expand"}>
										{isExpanded ? (
											<ChevronUp className="w-4 h-4" />
										) : (
											<ChevronDown className="w-4 h-4" />
										)}
									</Button>
								</CollapsibleTrigger>
							)}
						</div>
					</div>

					{/* Selected Profile Details */}
					{selectedProfile && config.enabled && (
						<div className="px-3 pb-2">
							<div className="flex items-center gap-2 text-xs text-vscode-descriptionForeground bg-vscode-sideBar-background rounded px-2 py-1 inline-flex">
								<span className="font-medium">{selectedProfile.providerType}</span>
								<span>/</span>
								<span>{selectedProfile.model}</span>
							</div>
						</div>
					)}

					{/* Expandable Content */}
					{showExpandButton && (
						<CollapsibleContent>
							<div className="px-3 pb-3 border-t pt-3 space-y-3">
								{/* Capabilities */}
								{hasCapabilities && (
									<div>
										<h5 className="text-xs font-semibold text-vscode-descriptionForeground mb-2">
											Capabilities
										</h5>
										<ul className="text-sm space-y-1">
											{role.capabilities.map((cap) => (
												<li key={cap.name} className="flex items-start gap-2">
													<span className="text-vscode-descriptionForeground">•</span>
													<span>
														{cap.name}
														{cap.required && (
															<span className="text-xs text-vscode-errorForeground ml-1">
																(required)
															</span>
														)}
													</span>
													<span className="text-vscode-descriptionForeground text-xs">
														- {cap.description}
													</span>
												</li>
											))}
										</ul>
									</div>
								)}

								{/* Input/Output Artifacts */}
								{hasArtifacts && (
									<div className="grid grid-cols-2 gap-4">
										{hasInputArtifacts && (
											<div>
												<h5 className="text-xs font-semibold text-vscode-descriptionForeground mb-1">
													Input Artifacts
												</h5>
												<p className="text-xs text-vscode-descriptionForeground">
													{role.inputArtifactTypes.join(", ")}
												</p>
											</div>
										)}
										{hasOutputArtifacts && (
											<div>
												<h5 className="text-xs font-semibold text-vscode-descriptionForeground mb-1">
													Output Artifacts
												</h5>
												<p className="text-xs text-vscode-descriptionForeground">
													{role.outputArtifactTypes.join(", ")}
												</p>
											</div>
										)}
									</div>
								)}
							</div>
						</CollapsibleContent>
					)}
				</div>
			</Collapsible>
		</div>
	)
}

export default RoleAssignmentCard
