# Multi-Agent Orchestration System - User Guide

## Overview

The Kilo Code Multi-Agent Orchestration System enables collaborative AI agents to work together on complex software development tasks. This system coordinates multiple specialized agents (Organiser, Architect, Primary Coder, Secondary Coder, Code Sceptic, Documentation Writer, Debugger) to deliver comprehensive development workflows.

## Getting Started

### Prerequisites

- Kilo Code extension version 5.5.0 or higher
- Multi-agent orchestration enabled in settings
- At least one AI provider configured

### Enabling Multi-Agent Orchestration

1. Open VS Code settings (`Ctrl+,`)
2. Navigate to **Extensions** → **Kilo Code** → **Agent Roles**
3. Toggle **Enable Multi-Agent Orchestration**
4. Configure role assignments and provider profiles
5. Restart the extension if prompted

## Role Configuration

### Available Roles

| Role                 | Category       | Required | Description                                       |
| -------------------- | -------------- | -------- | ------------------------------------------------- |
| Organiser            | Coordination   | ✅ Yes   | Coordinates all agents and manages workflow state |
| Architect            | Planning       | ✅ Yes   | Creates implementation plans and system designs   |
| Primary Coder        | Implementation | ✅ Yes   | Creates file structure and pseudocode             |
| Secondary Coder      | Implementation | ✅ Yes   | Implements code from pseudocode                   |
| Code Sceptic         | Review         | ❌ No    | Reviews code for issues and vulnerabilities       |
| Documentation Writer | Documentation  | ❌ No    | Creates and maintains documentation               |
| Debugger             | Testing        | ❌ No    | Runs tests and identifies bugs                    |

### Configuring Roles

1. Open **Agent Roles** settings panel
2. Select roles to enable from the available list
3. Assign provider profiles to each role:
    - Choose from existing provider profiles
    - Create new provider profiles as needed
    - Configure model preferences per role
4. Set role-specific settings:
    - Auto-approval preferences
    - Context window limits
    - Rate limiting settings

### Provider Profiles

Provider profiles define which AI provider and model each role uses. Create profiles for different use cases:

```json
{
	"profiles": {
		"architect": {
			"provider": "anthropic",
			"model": "claude-3-5-sonnet-20241022",
			"apiKey": "sk-or-v1-..."
		},
		"coder": {
			"provider": "openai",
			"model": "gpt-4o",
			"apiKey": "sk-..."
		}
	}
}
```

## Using Workflows

### Starting a Multi-Agent Session

1. Open the command palette (`Ctrl+Shift+P`)
2. Run **Kilo Code: Start Multi-Agent Session**
3. Select a workflow template or create custom:
    - **New Feature Development**
    - **Bug Fix**
    - **Code Refactoring**
    - **Documentation Update**
    - **Performance Optimization**
4. Provide task description and requirements
5. Review and confirm role assignments
6. Click **Start Session**

### Workflow States

The system progresses through these states:

1. **IDLE** - Waiting for task
2. **PLANNING** - Organiser + Architect creating plan
3. **PLAN_REVIEW** - Code Sceptic reviewing plan (if enabled)
4. **STRUCTURE_CREATION** - Primary Coder creating structure
5. **IMPLEMENTATION** - Secondary Coder implementing code
6. **REVIEW** - Code Sceptic reviewing implementation
7. **DOCUMENTATION** - Documentation Writer creating docs
8. **TESTING** - Debugger running tests
9. **COMPLETION** - Workflow finished

### Monitoring Progress

During a session, you can:

- View real-time workflow status in the Agent Manager panel
- See which agents are active and their current tasks
- Monitor artifact creation and progress
- Pause/resume/cancel workflows at any time
- View detailed logs of agent communications

## Agent Communication

### Message Types

Agents communicate through structured messages:

- **Request**: Task assignment from Organiser
- **Status**: Progress updates from agents
- **Artifact**: Completed work products
- **Review**: Feedback and issues from Code Sceptic
- **Test Results**: Test outcomes from Debugger

### Artifact Types

| Type                | Description                           | Created By           |
| ------------------- | ------------------------------------- | -------------------- |
| IMPLEMENTATION_PLAN | System design and implementation plan | Architect            |
| PSEUDOCODE          | High-level code structure             | Primary Coder        |
| CODE                | Actual implementation code            | Secondary Coder      |
| REVIEW_REPORT       | Code review findings                  | Code Sceptic         |
| DOCUMENTATION       | User and API documentation            | Documentation Writer |
| TEST_RESULTS        | Test execution results                | Debugger             |

## Managing Sessions

### Session Controls

- **Pause**: Temporarily halt workflow (agents remain active)
- **Resume**: Continue paused workflow
- **Cancel**: Stop workflow and discard progress
- **Retry**: Restart failed workflow from last checkpoint
- **Terminate**: Forcefully stop all agents

### Session Management

- **Session History**: View completed sessions and artifacts
- **Session Export**: Export session data and artifacts
- **Session Import**: Import previous session configurations
- **Session Templates**: Save custom workflow templates

## Troubleshooting

### Common Issues

#### Agents Not Responding

1. Check agent health in Agent Status Dashboard
2. Verify provider API keys are valid
3. Check rate limiting status
4. Review error logs in VS Code output panel

#### Workflow Stuck

1. Check current workflow state
2. Review agent status messages
3. Check for rate limiting or context window issues
4. Use **Retry** to restart from last checkpoint

#### File Conflicts

1. Check file locking status
2. Review agent file access permissions
3. Use **Cancel** and restart if necessary

#### Performance Issues

1. Monitor concurrent agent limits
2. Check provider rate limits
3. Review context window usage
4. Adjust agent priorities if needed

### Error Messages

| Error                                                      | Solution                                          |
| ---------------------------------------------------------- | ------------------------------------------------- |
| `AgentHealthMonitor: Agent unresponsive`                   | Restart the unresponsive agent                    |
| `RateLimitingManager: Rate limit exceeded`                 | Wait for rate limit reset or adjust priorities    |
| `FileLockingService: Lock conflict detected`               | Cancel conflicting operations                     |
| `ContextWindowMonitor: Context limit reached`              | Enable aggressive summarization or reduce context |
| `WorkflowCheckpointService: Checkpoint restoration failed` | Retry workflow or start new session               |

### Getting Help

- **Documentation**: Refer to the comprehensive documentation
- **Community**: Join the Kilo Code Discord community
- **Support**: File issues on GitHub with detailed logs
- **Updates**: Check for extension updates regularly

## Best Practices

### Task Definition

- Be specific about requirements and constraints
- Provide clear acceptance criteria
- Include relevant context and existing code
- Specify target technologies and frameworks

### Role Configuration

- Assign appropriate models to each role
- Use specialized models for specific tasks
- Configure rate limits based on provider capabilities
- Set appropriate context window limits

### Workflow Management

- Start with simple workflows and increase complexity
- Monitor agent performance and adjust as needed
- Use checkpoints for long-running tasks
- Review artifacts before proceeding to next steps

### Security Considerations

- Use secure API keys and provider configurations
- Review code for security vulnerabilities
- Monitor agent access to sensitive files
- Use appropriate rate limiting for cost control

## Advanced Features

### Custom Roles

Create custom roles for specialized tasks:

1. Define role capabilities and artifact types
2. Configure provider profiles and settings
3. Add to role registry
4. Assign to workflows as needed

### Workflow Templates

Save custom workflow configurations:

1. Configure roles and settings
2. Define workflow steps and transitions
3. Save as template
4. Reuse for similar tasks

### Integration APIs

Programmatic control of multi-agent system:

- Start/stop sessions via VS Code API
- Monitor workflow progress
- Retrieve artifacts programmatically
- Configure roles and settings

## Performance Optimization

### Agent Configuration

- Use appropriate model sizes for tasks
- Configure concurrent agent limits
- Set rate limiting based on provider capabilities
- Optimize context window usage

### Workflow Optimization

- Parallelize independent tasks
- Use checkpoints for long-running workflows
- Monitor and adjust agent priorities
- Review and optimize artifact sizes

### Resource Management

- Monitor API usage and costs
- Use appropriate rate limiting
- Clean up old artifacts and checkpoints
- Optimize file access patterns

## Frequently Asked Questions

### Q: How many agents can I run simultaneously?

**A:** The default limit is 5 concurrent agents, but this can be configured in settings.

### Q: Can I use different AI providers for different roles?

**A:** Yes, each role can be assigned a different provider profile.

### Q: How are conflicts between agents handled?

**A:** The system uses file locking and coordination to prevent conflicts.

### Q: Can I customize the workflow steps?

**A:** Yes, you can create custom workflow templates with custom steps.

### Q: How is data privacy handled?

**A:** All data is processed locally, and provider configurations are user-controlled.

## Version History

### Version 5.5.0

- Added YOLO mode toggle for auto-approval
- Added session rename functionality
- Improved agent health monitoring

### Version 5.4.0

- Enhanced workflow state management
- Improved artifact validation
- Added custom role support

### Version 5.3.0

- Initial multi-agent orchestration release
- Core workflow system
- Basic role configuration

## Support and Feedback

We welcome your feedback and contributions:

- **GitHub Issues**: Report bugs and request features
- **Discord Community**: Get help and discuss features
- **Documentation**: Contribute to documentation improvements
- **Code**: Submit pull requests for enhancements

---

**Last Updated**: 2026-02-15  
**Version**: 5.5.0  
**Documentation**: [Kilo Code Multi-Agent Orchestration](https://kilo.ai/docs/multi-agent-orchestration)
