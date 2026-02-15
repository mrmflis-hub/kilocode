# Multi-Agent Orchestration System for Kilo Code - Complete Summary

## Project Vision

Extend the Kilo Code VS Code extension to support multiple AI agents working concurrently, coordinated by an "Organiser" agent that maintains minimal context to enable management of complex, long-running development tasks without hitting context window limits.

## Core Requirements

### 1. Multiple Concurrent Agents

- Run multiple AI agents simultaneously, each with different provider/model configurations
- Each agent operates in a specific mode (Architect, Coder, Reviewer, etc.)
- Agents can communicate with each other through structured artifact exchange
- All agents maintain their own isolated context windows

### 2. Dynamic Provider-to-Role Assignment

- **NOT hardcoded**: Users configure provider profiles through UI
- Users assign any configured provider profile to any role
- Examples:
    - DeepSeek v3.2 → Primary Coder
    - Qwen3 Coder → Secondary Coder
    - Claude Sonnet 4.5 → Organiser
    - Claude Opus 4 → Code Sceptic
    - Gemini 3 Pro → Documentation Writer
    - GPT-5 → Debugger

### 3. Organiser as Primary Controller

- **Minimal context strategy**: Organiser only holds:
    - User's original task
    - To-do lists and workflow state
    - Artifact summaries (NOT full content)
    - Agent status updates
    - Mode descriptions
    - Available skills/capabilities
- Organiser coordinates all other agents
- User chats primarily with Organiser unless explicitly switching to another agent
- Organiser delegates work and receives structured summaries back

### 4. Mode Change Flexibility

- Current limitation: Only Architect can request mode changes
- **New requirement**: Any agent can request mode changes
- Organiser can spawn agents in different modes as needed
- Modes are not restricted to a single instance

### 5. Inter-Agent Communication

- Agents share documentation and outputs with each other
- Communication is mediated through artifact exchange
- Organiser routes information between agents
- Agents don't read full outputs from others, only relevant artifacts

## Detailed Workflow Example

### User Initiates Task

1. User types task description to Organiser
2. Organiser receives task and begins coordination

### Planning Phase

1. **Organiser** requests Architect to analyze repository and create plan
2. **Architect** spawns as new agent instance:
    - Reads repository structure
    - Generates implementation plan
    - Sends plan artifact to Organiser (with summary)
3. **Organiser** requests Code Sceptic to review plan
4. **Code Sceptic** reviews plan:
    - Analyzes for issues, inefficiencies
    - Sends review artifact to Organiser
5. **Organiser** routes review back to Architect
6. **Architect** revises plan based on feedback
7. Process repeats until plan is approved

### Implementation Phase

1. **Organiser** assigns structure creation to Primary Coder (Coder 1)
2. **Coder 1** creates file structure and pseudocode:
    - Writes scaffolding for all files
    - Includes signals, data movements, interfaces
    - Completes each file with pseudocode
    - Sends artifact to Organiser when each file done
3. **Organiser** assigns actual implementation to Secondary Coder (Coder 2)
4. **Coder 2** implements code file by file:
    - Takes pseudocode from Coder 1
    - Fills in actual implementation
    - Updates progress after each file
    - Sends completed code artifacts to Organiser

### Review and Correction Loop

1. **Organiser** sends each completed file to Code Sceptic
2. **Code Sceptic** reviews implementation:
    - Checks for bugs, security issues, best practices
    - Sends review findings to Organiser
3. **If issues found**:
    - Organiser stops Coder 2
    - Sends code and review back to Coder 2 for fixes
    - Coder 2 corrects issues
    - Re-review cycle repeats until approved
4. **If approved**: Organiser moves to next file

### Documentation Phase

1. When files are approved, **Organiser** assigns to Documentation Writer (Commenter)
2. **Commenter** reads completed files:
    - Writes detailed inline documentation
    - Creates comprehensive comments
    - Generates external documentation
    - Returns documented code

### Testing Phase

1. After major milestones, **Organiser** triggers Debugger
2. **Debugger** runs tests:
    - Executes test suites
    - Identifies failures or issues
    - Reports findings to Organiser
3. If tests fail, Organiser routes errors back to appropriate Coder
4. Process continues iteratively

### Pause/Cancel Behavior

- **When user pauses Organiser**: All subordinate agents also pause
- **When user cancels**: All agents terminate
- Organiser maintains state for potential resume

## Technical Architecture

### 1. Agent Pool Manager

- Spawns and manages multiple agent instances
- Maintains agent registry with active agents
- Handles agent lifecycle (create, pause, resume, terminate)
- Routes messages between agents

### 2. Message Router

- Implements inter-agent communication protocol
- Structured message format:
    ```typescript
    {
      from: "agent_id",
      to: "target_agent_id",
      messageType: "artifact" | "request" | "status" | "review",
      payload: { content, metadata }
    }
    ```
- Queue management for sequential tasks
- Pub/sub pattern for agent coordination

### 3. Artifact Management System

- Separates artifact storage from Organiser context
- Structure:
    ```typescript
    {
      id: string,
      type: "plan" | "pseudocode" | "code" | "review" | "documentation",
      producer: "agent_id",
      status: "in-progress" | "completed" | "needs-revision",
      summary: "brief description for Organiser",
      fullContent: "stored separately, not in Organiser",
      metadata: { fileAffected, reviewedBy, approvalStatus }
    }
    ```
- Lazy loading of full content when needed
- Only summaries go to Organiser

### 4. Role Definition System

Available roles (not hardcoded, user-assignable):

- **Organiser** (required): Coordinates all agents, manages workflow
- **Architect** (required): Analyzes repository, creates plans
- **Primary Coder** (required): Creates file structure and pseudocode
- **Secondary Coder** (required): Implements actual code
- **Code Sceptic** (optional): Reviews plans and code for issues
- **Documentation Writer** (optional): Writes documentation and comments
- **Debugger** (optional): Runs tests and identifies bugs
- **Custom Roles**: User can define additional roles

Each role has:

- Capabilities list
- Input artifact types
- Output artifact types
- Description and category

### 5. Configuration UI

**New "Agent Roles" Tab in Settings**:

- Lists all available roles
- Shows configured provider profiles in dropdowns
- Each role card displays:
    - Role name and description
    - Active/Inactive toggle
    - Provider profile selector (dropdown)
    - Assigned profile details (provider, model)
    - Expandable capabilities and input/output artifacts
- Validation warnings if required roles not assigned

**Configuration Storage**:

- Stored in VS Code workspace/global state
- NOT hardcoded in JSON files
- Dynamically loaded from user's provider configurations
- Changes take effect on next task start

### 6. Context Window Strategy

**Organiser Context** (minimal):

```typescript
{
  userTask: string,
  workflowState: "PLANNING" | "IMPLEMENTATION" | "REVIEW" | etc.,
  artifacts: ArtifactSummary[],  // Summaries only
  agentStatuses: Map<agentId, status>,
  currentStep: WorkflowStep,
  modeDescriptions: Map<modeId, description>,
  toDoList: Task[]
}
```

**Working Agent Context** (full):

- Complete task details
- Full artifact content when needed
- Repository files relevant to task
- Previous feedback/reviews

### 7. Workflow State Machine

States:

- IDLE
- PLANNING
- PLAN_REVIEW
- PLAN_REVISION
- STRUCTURE_CREATION
- CODE_IMPLEMENTATION
- CODE_REVIEW
- CODE_FIXING
- DOCUMENTATION
- TESTING
- COMPLETED
- PAUSED

Organiser manages transitions between states based on agent outputs and approval statuses.

## Implementation Roadmap

### Phase 1: Foundation (Core Infrastructure)

1. Create `AgentPoolManager` class

    - Spawn multiple agent instances
    - Maintain agent registry
    - Agent lifecycle management

2. Implement `MessageRouter`

    - Inter-agent communication protocol
    - Message queuing and routing
    - Event bus for agent coordination

3. Build `ArtifactStore`
    - Store full artifact content separately
    - Generate summaries for Organiser
    - Lazy loading mechanism

### Phase 2: Organiser Implementation

1. Create Organiser mode definition

    - Minimal context builder
    - Workflow state machine
    - Task delegation logic

2. Implement artifact summarization

    - Extract key information from artifacts
    - Keep summaries concise for Organiser

3. Build coordination logic
    - Request/response handling
    - Agent spawning on demand
    - Progress tracking

### Phase 3: New Modes and Roles

1. Add Code Sceptic mode

    - Plan review capabilities
    - Code review capabilities
    - Issue reporting format

2. Add Documentation Writer mode

    - Code documentation generation
    - Comment insertion
    - Documentation file creation

3. Update existing modes (Architect, Coder, Debugger)
    - Make compatible with multi-agent context
    - Add artifact production
    - Enable communication protocols

### Phase 4: Configuration UI

1. Create Role Assignment Tab component

    - Role card UI components
    - Provider profile dropdowns
    - Active/inactive toggles

2. Build `OrchestrationConfigManager`

    - Load/save role assignments
    - Integrate with existing provider management
    - Configuration validation

3. Add settings panel integration
    - New tab in Kilo settings
    - Message handlers for webview communication
    - Real-time configuration updates

### Phase 5: Integration and Polish

1. Wire up agent pool with configuration

    - Load agents based on user assignments
    - Handle configuration changes
    - Graceful agent reload

2. Implement pause/resume functionality

    - Cascade pause to all agents
    - Save workflow state
    - Resume from saved state

3. Add UI enhancements

    - Multi-agent status dashboard
    - Agent selection interface
    - Workflow visualization
    - Individual agent chat windows

4. Error handling and recovery
    - Agent failure detection
    - Task reassignment
    - User notifications

## Key Design Principles

### 1. No Hardcoding

- All provider-to-role assignments configured through UI
- Users have full flexibility to experiment with different models
- Configuration stored in VS Code settings, not code

### 2. Context Window Efficiency

- Organiser never loads full artifact content
- Each agent has isolated, task-specific context
- Artifact summaries are brief and structured
- Enables coordination of very long, complex tasks

### 3. Modularity

- Each agent is independent
- Roles are pluggable and extensible
- Users can add custom roles
- Easy to enable/disable optional agents

### 4. User Control

- Primary interaction with Organiser
- Can manually switch to any active agent
- Can pause/resume/cancel at any time
- Transparent workflow state visibility

### 5. Flexibility

- Any number of agents in same role (Coder 1, 2, 3...)
- Mix and match providers and models
- Enable/disable optional workflow steps
- Customizable workflow sequences

## Benefits of This Architecture

1. **Extended Task Management**: Organiser can coordinate very long development tasks without context overflow
2. **Cost Optimization**: Assign expensive models to critical roles, cheaper models elsewhere
3. **Specialization**: Different models excel at different tasks (planning vs coding vs review)
4. **Parallel Processing**: Multiple coders can work simultaneously on different files
5. **Quality Assurance**: Dedicated review agents catch issues before they compound
6. **Flexibility**: Easy experimentation with different model combinations
7. **Scalability**: Add more agents as needed for larger projects

## Technical Considerations

- **Performance**: Implement agent pooling and lazy loading for efficiency
- **Error Handling**: Robust retry logic and task reassignment on agent failures
- **State Management**: Persistent workflow state for pause/resume functionality
- **Security**: Validate all inter-agent messages and artifact content
- **Testing**: Unit tests for each agent type, integration tests for workflows
- **Documentation**: Clear documentation for custom role creation

This system transforms Kilo Code from a single-agent tool into a coordinated multi-agent development platform, enabling much more complex and longer-running development tasks while maintaining user control and flexibility.

# Multi-Agent Orchestration - Potential Pitfalls, Restrictions & Guidance Sources

## Critical Pitfalls to Consider

### 1. **Kilo Code Fork Architecture Conflict**

**Risk Level**: HIGH

Kilo Code is a fork of Roo Code and periodically merges upstream changes. Your multi-agent architecture will create extensive modifications to core extension code.

**Specific Issues**:

- Core agent loop modifications will conflict with upstream merges
- State management changes affect shared code paths
- Message handling refactoring touches files that receive updates from Roo Code
- You'll need `kilocode_change` markers extensively, increasing merge complexity

**Mitigation Strategies**:

- Keep multi-agent orchestration in separate directories (mark as Kilo-specific):
    - Create `src/core/orchestration/` for all orchestration logic
    - Create `src/services/agent-manager/` for agent pool management
    - Minimize changes to existing `src/core/` files
- Use decorator/wrapper patterns around existing agent code rather than modifying core files
- Create configuration layers that sit on top of existing provider system
- Consider forking less frequently or maintaining a longer divergence window

**Required Markers**:

```typescript
// kilocode_change start - multi-agent orchestration
// All multi-agent code here
// kilocode_change end
```

### 2. **Agent Runtime Process Isolation Issues**

**Risk Level**: HIGH

Kilo already has `@kilocode/agent-runtime` that spawns agents as isolated Node.js processes. Your multi-agent system must work within this constraint.

**Specific Conflicts**:

- Agent processes are currently designed for single-agent operation
- `AGENT_CONFIG` environment variable expects single agent configuration
- The ExtensionHost mock may not support multiple concurrent instances per workspace
- IPC message protocol is designed for parent-single child communication

**Issues to Address**:

- **Workspace Isolation**: Multiple agents accessing same workspace files simultaneously
    - File write conflicts when two coders modify same file
    - Git state synchronization between agents
    - File watching and change detection across processes
- **State Synchronization**: Agents have isolated state but need shared context about artifacts
- **Process Overhead**: Spawning 5-7 agent processes simultaneously may consume significant resources
- **IPC Bottlenecks**: All inter-agent communication through parent process creates single point of failure

**Mitigation Strategies**:

- Extend agent runtime to support agent pools rather than single instances
- Implement workspace-level file locking mechanism
- Use shared memory or Redis for artifact metadata (not full content)
- Implement rate limiting and request queuing for file operations
- Consider thread workers instead of full process forks for lighter agents

### 3. **Context Window Arithmetic Failure**

**Risk Level**: MEDIUM-HIGH

Your organiser's "minimal context" strategy might still overflow with complex projects.

**Hidden Context Costs**:

- Artifact summaries accumulate (even 100-word summaries × 50 artifacts = 5,000 words)
- Mode descriptions, to-do lists, workflow states add up
- Agent status updates with detailed metadata
- Error messages and retry history
- File paths and names for large projects

**Real-World Scenario**:
Project with 200 files → Primary Coder creates 200 pseudocode artifacts → Each summary is 150 tokens → 30,000 tokens just in summaries before any actual coordination logic.

**Mitigation Strategies**:

- Implement aggressive summary compression (max 50 tokens per artifact)
- Archive old artifacts to cold storage after workflow step completes
- Use artifact IDs with lookup rather than embedding metadata
- Implement summary hierarchies (weekly summary of daily summaries pattern)
- Set hard limits: max 100 active artifacts in Organiser context

### 4. **Race Conditions in Artifact Management**

**Risk Level**: HIGH

Multiple agents writing artifacts simultaneously creates classic concurrency problems.

**Critical Scenarios**:

- Coder 2 requests artifact while Coder 1 is still writing it
- Code Sceptic marks artifact as "needs revision" while Commenter is documenting it
- Organiser routes artifact to next agent before previous agent's status update completes
- Two agents modify same artifact metadata concurrently

**File-Level Issues**:

- Agent 1 reads `main.ts` → Agent 2 modifies `main.ts` → Agent 1 writes based on stale version
- Diff application fails because underlying file changed
- Git conflicts when multiple agents commit

**Mitigation Strategies**:

- Implement optimistic locking with version numbers on artifacts
- File-level mutex/semaphore system enforced by Organiser
- Artifact state machine with atomic transitions
- Queue all file modifications through single coordinating process
- Implement retry logic with exponential backoff
- Use workspace snapshots/checkpoints before each major workflow step

### 5. **Provider API Rate Limiting**

**Risk Level**: HIGH

Running 5-7 agents simultaneously will hammer provider APIs.

**Rate Limit Reality**:

- Anthropic: Tiered limits, can be as low as 5 requests/minute on free tier
- OpenAI: Varies by model, GPT-4 often limited to 3 RPM on some tiers
- Google: Gemini has request limits per minute
- Multiple agents hitting same API key simultaneously = rapid limit hits

**Cost Explosion**:

- 7 agents × 1000 tokens/request × 10 requests/minute = 70,000 tokens/minute
- At peak workflow (all agents active), could hit $10-50/hour depending on models

**Mitigation Strategies**:

- Implement centralized rate limiting manager
- Queue agent requests with priority levels (Organiser > Critical Review > Coding)
- Distribute agents across different provider accounts
- Implement exponential backoff and retry queues
- Show user real-time cost estimates
- Add circuit breakers that pause agents when approaching budget limits
- Cache frequently used artifacts and responses

### 6. **Error Propagation Cascades**

**Risk Level**: MEDIUM-HIGH

One agent's failure can cascade through the entire workflow.

**Failure Scenarios**:

- Architect creates invalid plan → Coder 1 starts work → discovers plan is invalid → all downstream work invalidated
- Coder 2 implements buggy code → Commenter documents the bug → Debugger finds bug → rollback loses documentation work
- Code Sceptic misses critical issue → propagates to multiple files → complete refactoring needed

**Orphaned Agent States**:

- Organiser crashes while Coder 2 is working → Coder 2 keeps running indefinitely
- Network timeout during artifact submission → artifact created but Organiser never receives it
- Agent process killed → partial file writes left in workspace

**Mitigation Strategies**:

- Implement workflow checkpoints at each major state transition
- Health check pings between Organiser and all agents
- Timeout mechanisms for every agent operation
- Rollback capability to last stable checkpoint
- Validate artifacts before starting downstream work
- Implement "circuit breaker" pattern: if agent fails 3 times, pause entire workflow

### 7. **UI/UX Complexity Explosion**

**Risk Level**: MEDIUM

Managing 7 concurrent agents is cognitively overwhelming for users.

**User Confusion Points**:

- Which agent is doing what right now?
- Why is progress so slow (waiting on rate limits)?
- How do I know if something is stuck vs. taking a long time?
- Which agent do I interact with when I want to make a change?
- How do I pause just one agent vs. all agents?

**Information Overload**:

- 7 parallel status updates competing for attention
- Error messages from multiple agents simultaneously
- Chat history from multiple agents intermixed
- Artifact approval queues backing up

**Mitigation Strategies**:

- Clear visual hierarchy: Organiser prominent, workers in background
- Consolidated status dashboard with traffic light indicators
- Mute non-critical agent updates by default
- Single unified timeline view showing sequential workflow
- Clear pause/resume controls with visual confirmation
- Implement "explain what's happening" button that asks Organiser for plain English summary

### 8. **Testing and Debugging Complexity**

**Risk Level**: MEDIUM-HIGH

Multi-agent systems are notoriously hard to test and debug.

**Testing Challenges**:

- Unit tests can't easily mock 7 interacting agents
- Integration tests require spinning up multiple processes
- Race conditions only appear under load
- Non-deterministic behavior from AI responses
- Tests become flaky due to timing issues

**Debugging Nightmares**:

- Log output from 7 processes intermixed
- Difficult to trace which agent made which decision
- Artifact state history hard to reconstruct
- IPC message ordering issues hard to reproduce
- Deadlocks between agents waiting on each other

**Mitigation Strategies**:

- Implement comprehensive structured logging with agent IDs, timestamps, request IDs
- Build replay capability: record all messages and replay deterministically
- Create visual debugging tools showing agent communication graph
- Mock agent responses for faster testing
- Implement "dry run" mode that simulates workflow without actual AI calls
- Create test harness that can inject failures at any point in workflow

### 9. **Configuration Complexity and Validation**

**Risk Level**: MEDIUM

Dynamic role assignment creates many invalid configuration possibilities.

**Invalid Configurations**:

- User assigns same model to all 7 roles (rate limit disaster)
- User assigns incompatible models (e.g., code-specialized model to Organiser)
- User leaves required roles unassigned
- User assigns weak model to Code Sceptic (misses all bugs)
- User accidentally assigns expensive model (GPT-4) to high-volume roles

**Configuration Drift**:

- User modifies provider profile that's assigned to active agents
- Provider API key expires mid-workflow
- Model availability changes (provider removes model)

**Mitigation Strategies**:

- Real-time configuration validation with clear error messages
- "Recommended configurations" templates for different use cases
- Cost estimation preview before starting workflow
- Capability checking: validate model supports required operations
- Configuration versioning and rollback
- Graceful degradation: if provider fails, suggest alternative from user's profiles

### 10. **Performance Degradation**

**Risk Level**: MEDIUM

Multiple agents competing for resources will slow down VS Code.

**Resource Contention**:

- Memory: 7 Node.js processes × ~100-200MB each = 700MB-1.4GB
- CPU: Multiple agents processing simultaneously
- Disk I/O: Constant file reads/writes from all agents
- Network: Continuous API calls to providers

**VS Code Extension Impact**:

- Extension host process has memory limits
- Too many webview panels (one per agent?) causes performance issues
- File watcher system overwhelmed by constant changes
- TypeScript/IntelliSense slowed by background agent activity

**Mitigation Strategies**:

- Implement agent pooling with max concurrent limit (e.g., 3 active agents max)
- Use worker threads instead of full processes where possible
- Lazy-load agent instances (spawn only when needed)
- Implement memory monitoring and automatic agent recycling
- Batch file operations where possible
- Add user setting for "performance mode" that limits concurrent agents

## Technical Restrictions to Overcome

### 1. **VS Code Extension API Limitations**

**Single Webview Panel**:
Current Kilo UI is single webview. Supporting multiple agent chat windows requires:

- Webview panel management for multiple agents
- Message routing to correct webview instance
- State synchronization across webview panels

**Workspace State Persistence**:

- `globalState` and `workspaceState` have size limits
- Complex artifact store might exceed limits
- May need external database (SQLite)

**Extension Activation Time**:

- VS Code expects extensions to activate quickly
- Spawning 7 agent processes at activation = slow startup
- Need lazy initialization strategy

### 2. **IPC Message Size Limits**

Node.js IPC has practical limits (~10MB per message). Large artifacts might hit limits.

**Solutions**:

- Stream large artifacts instead of single message
- Use shared filesystem for artifact content, IPC only for metadata
- Compress artifact content before transmission

### 3. **Provider API Constraints**

Different providers have different capabilities:

**Streaming Support**:

- Some models stream responses, others don't
- Affects progress indication for users
- Complicates unified agent interface

**Context Window Variations**:

- GPT-4: 128k tokens
- Claude Opus: 200k tokens
- Gemini: Varies by version
- Need to track per-agent, reject tasks that exceed capacity

**Tool/Function Calling**:

- Not all models support function calling equally well
- Critical for agents using Kilo's tool system
- May need model-specific adapters

### 4. **Git Integration Challenges**

Multiple agents modifying files creates Git chaos:

**Commit Authorship**:

- Who authored changes made by agents?
- How to attribute commits meaningfully?

**Branch Management**:

- Should each agent work on separate branch?
- How to merge branches at workflow completion?
- Conflicts between agent branches?

**Solutions**:

- Single coordinated commit at end of workflow step
- Agent IDs in commit metadata
- Organiser manages merge strategy
- Checkpoint system with Git tags

### 5. **TypeScript/Language Server Integration**

Agents making code changes need to respect language semantics:

**Type Checking**:

- Changes must maintain type correctness
- Need access to TypeScript language server
- Validate changes before committing

**Import Management**:

- Auto-import suggestions needed for agents
- Import organization across files
- Detect missing dependencies

**Solutions**:

- Integrate with VS Code language server protocol
- Validate all changes through language server before accepting
- Implement repair loop: agent → language server validation → fix → retry

## Sources for Guidance

### 1. **Existing Multi-Agent Frameworks**

**AutoGPT Architecture**:

- Search for "AutoGPT agent coordination patterns"
- Study their task decomposition and agent spawning
- Learn from their error handling strategies
- [GitHub: Significant-Gravitas/AutoGPT](https://github.com/Significant-Gravitas/AutoGPT)

**LangChain Multi-Agent**:

- LangChain has multi-agent coordination primitives
- Agent executor patterns
- Memory management across agents
- [LangChain Multi-Agent Documentation](https://python.langchain.com/docs/modules/agents/)

**CrewAI Framework**:

- Specialized in orchestrated agent workflows
- Role-based agent coordination
- Task routing patterns
- [GitHub: joaomdmoura/crewAI](https://github.com/joaomdmoura/crewAI)

**MetaGPT**:

- Software development specific multi-agent system
- Agent roles matching your needs (architect, coder, reviewer)
- Artifact management patterns
- [GitHub: geekan/MetaGPT](https://github.com/geekan/MetaGPT)

### 2. **Kilo Code Specific Resources**

**Essential Files to Study**:

- `AGENTS.md` - Current agent architecture and runtime
- `src/extension.ts` - Extension entry point and activation
- `src/core/` - Core agent loop and state management
- `src/api/providers/` - Provider implementations (50+ providers)
- `src/services/` - Existing services architecture
- `packages/agent-runtime/` - Agent runtime for isolated processes
- `DEVELOPMENT.md` - Development setup and contribution guidelines

**Kilo Community**:

- [Kilo Discord](https://discord.gg/kilocode) - Active community, ask architecture questions
- [Kilo Reddit r/kilocode](https://www.reddit.com/r/kilocode/) - User discussions and use cases
- GitHub Issues - Review existing issues for similar feature requests

**Related VS Code Extensions**:

- Study Continue.dev (multi-model orchestration)
- Cursor IDE architecture (multiple AI features)
- Aider.chat (git-integrated AI coding)

### 3. **Distributed Systems Patterns**

**Orchestration Patterns**:

- Saga Pattern for long-running transactions (maps well to your workflow)
- Process Manager Pattern for coordinating multiple services
- Event Sourcing for audit trail of all agent actions

**Books**:

- "Designing Data-Intensive Applications" by Martin Kleppmann
    - Chapter on distributed coordination
    - Consensus and coordination patterns
- "Building Microservices" by Sam Newman
    - Service orchestration vs. choreography
    - Inter-service communication patterns

**Papers**:

- "Communicating Sequential Processes" (CSP) by Tony Hoare
    - Formal model for concurrent agent communication
- Google's "Large-scale cluster management at Google with Borg"
    - Task orchestration patterns at scale

### 4. **VS Code Extension Development**

**Official Resources**:

- [VS Code Extension API](https://code.visualstudio.com/api) - Complete API reference
- [Extension Guides](https://code.visualstudio.com/api/extension-guides/overview) - Best practices
- [Webview API](https://code.visualstudio.com/api/extension-guides/webview) - Multi-panel guidance
- [Extension Host Process](https://code.visualstudio.com/api/advanced-topics/extension-host) - Architecture

**Example Extensions**:

- GitHub Copilot - Multiple AI features in VS Code
- Live Share - Multi-user coordination (similar to multi-agent)
- Remote Development - Process isolation patterns

### 5. **AI Agent Research**

**Recent Papers**:

- "AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation" (Microsoft Research)
- "Communicative Agents for Software Development" (ChatDev paper)
- "Chain-of-Thought Prompting Elicits Reasoning in Large Language Models"

**Research Groups**:

- Microsoft Research - AutoGen project
- Stanford HAI - Agent research
- OpenAI - Multi-agent papers

### 6. **Performance and Monitoring**

**Node.js Performance**:

- Node.js documentation on worker threads vs. child processes
- Memory profiling tools (Chrome DevTools, clinic.js)
- IPC optimization patterns

**Monitoring Tools**:

- OpenTelemetry for distributed tracing (trace requests across agents)
- Prometheus for metrics (agent health, request rates)
- Grafana for visualization

### 7. **Testing Multi-Agent Systems**

**Testing Frameworks**:

- Vitest (already used by Kilo) - extend for multi-agent tests
- Playwright for E2E tests with multiple agents
- Jest for mocking complex agent interactions

**Testing Patterns**:

- Test container pattern for isolated agent testing
- Property-based testing for non-deterministic agent behavior
- Chaos engineering for resilience testing

### 8. **Configuration Management**

**VS Code Configuration**:

- [Configuration contribution point](https://code.visualstudio.com/api/references/contribution-points#contributes.configuration)
- JSON Schema for validation
- Settings UI contribution

**Validation Libraries**:

- Zod for runtime schema validation
- Ajv for JSON schema validation
- Custom validation middleware

## Implementation Strategy Checklist

### Phase 0: Research & Prototype (2-3 weeks)

- [ ] Study existing Kilo agent runtime thoroughly
- [ ] Build proof-of-concept: 2 agents communicating
- [ ] Test process isolation with file modifications
- [ ] Prototype artifact management system
- [ ] Measure memory and performance baseline

### Phase 1: Foundation (4-6 weeks)

- [ ] Implement agent pool manager with process management
- [ ] Build message router with IPC handling
- [ ] Create artifact store with file-based persistence
- [ ] Implement file locking mechanism
- [ ] Add comprehensive logging and monitoring

### Phase 2: Organiser & Core Roles (4-6 weeks)

- [ ] Implement Organiser mode with minimal context
- [ ] Create workflow state machine
- [ ] Build artifact summarization system
- [ ] Add required roles: Architect, Primary Coder, Secondary Coder
- [ ] Implement basic coordination logic

### Phase 3: Additional Roles (3-4 weeks)

- [ ] Add Code Sceptic role
- [ ] Add Documentation Writer role
- [ ] Add Debugger role
- [ ] Implement review loops and feedback cycles

### Phase 4: Configuration UI (3-4 weeks)

- [ ] Build Role Assignment Tab
- [ ] Integrate with existing provider management
- [ ] Add configuration validation
- [ ] Implement configuration persistence

### Phase 5: Error Handling & Resilience (2-3 weeks)

- [ ] Add comprehensive error handling
- [ ] Implement retry logic and circuit breakers
- [ ] Add checkpoint and rollback capability
- [ ] Build health monitoring

### Phase 6: Testing & Documentation (3-4 weeks)

- [ ] Write unit tests (aim for >80% coverage)
- [ ] Write integration tests for workflows
- [ ] Create E2E tests with real providers
- [ ] Document architecture and usage
- [ ] Create user guide and troubleshooting docs

### Total Estimated Time: 5-7 months

This is a substantial undertaking requiring careful planning and incremental development.

## Risk Mitigation Priorities

**Highest Priority** (address first):

1. Fork merge conflict management
2. Race conditions in file access
3. Provider rate limiting
4. Process isolation architecture

**Medium Priority** (address during development): 5. Context window management 6. Error cascade prevention 7. Performance optimization 8. Configuration validation

**Lower Priority** (address in polish phase): 9. UI/UX refinement 10. Advanced testing scenarios 11. Documentation completeness 12. Edge case handling

Multi-agent orchestration system is ambitious and technically sound, but requires careful attention to these pitfalls and restrictions to succeed.
