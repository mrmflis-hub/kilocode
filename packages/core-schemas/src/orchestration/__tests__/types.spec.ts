import { describe, it, expect } from "vitest"
import {
	WorkflowStateSchema,
	ArtifactTypeSchema,
	RoleDefinitionSchema,
	RoleAssignmentSchema,
} from "../types.js"

describe("Orchestration Types", () => {
	it("should validate WorkflowState", () => {
		expect(WorkflowStateSchema.parse("IDLE")).toBe("IDLE")
		expect(() => WorkflowStateSchema.parse("INVALID")).toThrow()
	})

	it("should validate ArtifactType", () => {
		expect(ArtifactTypeSchema.parse("code")).toBe("code")
		expect(() => ArtifactTypeSchema.parse("invalid")).toThrow()
	})

	it("should validate RoleDefinition", () => {
		const role = {
			id: "architect",
			name: "Architect",
			category: "planning",
			description: "Plans the system",
			capabilities: ["plan"],
			inputArtifacts: ["user_task"],
			outputArtifacts: ["implementation_plan"],
			required: true,
			systemPrompt: "You are an architect",
		}
		expect(RoleDefinitionSchema.parse(role)).toEqual(role)
	})

	it("should validate RoleAssignment", () => {
		const assignment = {
			roleId: "architect",
			roleName: "Architect",
			assignedProfileId: "profile1",
			isActive: true,
			priority: 1,
		}
		expect(RoleAssignmentSchema.parse(assignment)).toEqual(assignment)
	})
})
