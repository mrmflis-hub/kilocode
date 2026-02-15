# Multi-Agent Orchestration System - Role Configuration

## Overview

Role configuration defines how each agent in the multi-agent system behaves, what capabilities it has, and which AI provider it uses. This document explains how to configure roles for optimal performance and collaboration.

## Role Categories

### Coordination Roles

#### Organiser (Required)

**Purpose**: Coordinates all agents and manages workflow state

**Capabilities**:

- Workflow state management
- Task delegation to agents
- Progress tracking and monitoring
- Artifact summary management
- Health check coordination
- Timeout and retry management

**Input Artifacts**: None (receives task description)
**Output Artifacts**: Workflow state, agent coordination logs

**Provider Requirements**:

- High reasoning capability
- Strong context management
- Reliable API performance
- Cost-effective for long-running tasks

**Recommended Models**:

- Claude 3.5 Sonnet
- GPT-4o
- Gemini 1.5 Pro

#### Architect (Required)

**Purpose**: Creates implementation plans and system designs

**Capabilities**:

- System architecture analysis
- Implementation planning
- Technology stack selection
- File structure design
- Pseudocode generation
- Plan revision and optimization

**Input Artifacts**: Task description, existing codebase analysis
**Output Artifacts**: IMPLEMENTATION_PLAN, PSEUDOCODE

**Provider Requirements**:

- Strong planning and reasoning
- Technical knowledge breadth
- Clear communication
- Cost-effective for planning tasks

**Recommended Models**:

- Claude 3.5 Sonnet
- GPT-4o
- Gemini 1.5 Pro

### Implementation Roles

#### Primary Coder (Required)

**Purpose**: Creates file structure and pseudocode

**Capabilities**:

- File structure creation
- Directory organization
- Pseudocode generation
- Code skeleton creation
- Progress reporting
- File locking integration

**Input Artifacts**: IMPLEMENTATION_PLAN, PSEUDOCODE
**Output Artifacts**: PSEUDOCODE, file structure artifacts

**Provider Requirements**:

- Strong code generation
- File system understanding
- Clear structure creation
- Cost-effective for implementation

**Recommended Models**:

- Claude 3.5 Sonnet
- GPT-4o
- Gemini 1.5 Pro

#### Secondary Coder (Required)

**Purpose**: Implements code from pseudocode

**Capabilities**:

- Code implementation from pseudocode
- Test writing
- Code fixing based on review
- Progress reporting
- File locking integration

**Input Artifacts**: PSEUDOCODE, file structure
**Output Artifacts**: CODE, TEST_RESULTS

**Provider Requirements**:

- Strong code generation
- Test writing capability
- Error handling
- Cost-effective for implementation

**Recommended Models**:

- Claude 3.5 Sonnet
- GPT-4o
- Gemini 1.5 Pro

### Review Roles

#### Code Sceptic (Optional)

**Purpose**: Reviews code for issues and vulnerabilities

**Capabilities**:

- Plan review and analysis
- Code review and security analysis
- Performance review
- Issue reporting with severity levels
- Artifact production (review reports)

**Input Artifacts**: IMPLEMENTATION_PLAN, CODE
**Output Artifacts**: REVIEW_REPORT

**Provider Requirements**:

- Critical thinking
- Security awareness
- Technical depth
- Clear communication

**Recommended Models**:

- Claude 3.5 Sonnet
- GPT-4o
- Gemini 1.5 Pro

### Documentation Roles

#### Documentation Writer (Optional)

**Purpose**: Creates and maintains documentation

**Capabilities**:

- Code documentation generation
- API documentation
- README file creation
- User guide creation
- Contributing guide creation
- Progress reporting

**Input Artifacts**: CODE, IMPLEMENTATION_PLAN
**Output Artifacts**: DOCUMENTATION

**Provider Requirements**:

- Clear writing
- Technical communication
- Documentation standards
- Cost-effective for documentation

**Recommended Models**:

- Claude 3.5 Sonnet
- GPT-4o
- Gemini 1.5 Pro

### Testing Roles

#### Debugger (Optional)

**Purpose**: Runs tests and identifies bugs

**Capabilities**:

- Test execution (multiple frameworks)
- Bug identification
- Debug workflow
- Test coverage analysis
- Test writing for missing coverage
- Flaky test investigation

**Input Artifacts**: CODE, TEST_RESULTS
**Output Artifacts**: TEST_RESULTS

**Provider Requirements**:

- Testing expertise
- Debugging skills
- Multiple framework support
- Clear error reporting

**Recommended Models**:

- Claude 3.5 Sonnet
- GPT-4o
- Gemini 1.5 Pro

## Configuration Process

### Step 1: Access Role Configuration

1. Open VS Code settings (`Ctrl+,`)
2. Navigate to **Extensions** → **Kilo Code** → **Agent Roles**
3. Click **Configure Roles**
4. Review available roles and current settings

### Step 2: Enable Required Roles

1. Ensure **Organiser**, **Architect**, **Primary Coder**, and **Secondary Coder** are enabled
2. Optionally enable **Code Sceptic**, **Documentation Writer**, and **Debugger**
3. Review role descriptions and capabilities
4. Click **Save** to apply changes

### Step 3: Configure Provider Profiles

1. Click **Manage Provider Profiles**
2. Create or select profiles for each role:
    - Choose provider (Anthropic, OpenAI, etc.)
    - Select model
    - Configure API key
    - Set rate limiting preferences
3. Assign profiles to roles:
    - Drag and drop profiles to roles
    - Use auto-assignment based on role type
    - Review and adjust as needed
4. Click **Save** to apply provider assignments

### Step 4: Fine-tune Role Settings

1. Configure role-specific settings:
    - **Auto-approval**: Enable for trusted roles
    - **Context limits**: Set appropriate context window sizes
    - **Rate limits**: Configure based on provider capabilities
    - **Timeouts**: Set appropriate timeout values
2. Review advanced settings:
    - **Priority**: Set agent execution priorities
    - **Retries**: Configure retry behavior
    - **Checkpoints**: Enable automatic checkpoints
3. Click **Validate** to check configuration
4. Click **Save** to apply settings

## Provider Profile Management

### Creating Provider Profiles

1. Click **Add Provider Profile**
2. Configure profile settings:
    - **Profile Name**: Descriptive name (e.g., "Architect - Claude")
    - **Provider**: Select AI provider
    - **Model**: Choose specific model
    - **API Key**: Enter or select existing key
    - **Rate Limits**: Configure requests per minute
    - **Context Window**: Set maximum context size
    - **Auto-approval**: Enable for trusted operations
3. Click **Test Connection** to verify
4. Click **Save** to create profile

### Profile Assignment Strategies

#### Role-Based Assignment

Assign profiles based on role requirements:

```json
{
	"architect": "architect-claude",
	"primaryCoder": "coder-openai",
	"secondaryCoder": "coder-anthropic",
	"codeSceptic": "reviewer-gemini"
}
```

#### Cost-Based Assignment

Optimize for cost efficiency:

```json
{
	"architect": "architect-cheap",
	"primaryCoder": "coder-cheap",
	"secondaryCoder": "coder-premium",
	"codeSceptic": "reviewer-premium"
}
```

#### Performance-Based Assignment

Optimize for performance:

```json
{
	"architect": "architect-premium",
	"primaryCoder": "coder-premium",
	"secondaryCoder": "coder-premium",
	"codeSceptic": "reviewer-premium"
}
```

### Profile Management

#### Editing Profiles

1. Select profile to edit
2. Modify settings as needed
3. Click **Test Connection** to verify changes
4. Click **Save** to update profile

#### Deleting Profiles

1. Select profile to delete
2. Click **Delete Profile**
3. Confirm deletion
4. Reassign roles if needed

#### Profile Import/Export

1. Click **Export Profiles** to save configuration
2. Click **Import Profiles** to load configuration
3. Share profiles between team members
4. Backup profile configurations

## Advanced Configuration

### Custom Role Definitions

Create custom roles for specialized tasks:

1. Click **Add Custom Role**
2. Configure custom role settings:
    - **Role Name**: Unique identifier
    - **Display Name**: User-friendly name
    - **Description**: Role purpose
    - **Category**: Coordination, Implementation, Review, Documentation, Testing
    - **Required**: Mark as required or optional
    - **Capabilities**: Select from available capabilities
    - **Input Artifacts**: Define required input types
    - **Output Artifacts**: Define produced artifact types
3. Configure provider profile assignment
4. Click **Save** to create custom role

### Role Dependencies

Define role dependencies for complex workflows:

```json
{
	"dependencies": {
		"secondaryCoder": ["primaryCoder"],
		"codeSceptic": ["architect", "secondaryCoder"],
		"documentationWriter": ["secondaryCoder"],
		"debugger": ["secondaryCoder"]
	}
}
```

### Workflow Integration

Configure role integration with workflows:

```json
{
	"workflows": {
		"newFeature": {
			"roles": ["organiser", "architect", "primaryCoder", "secondaryCoder"],
			"steps": ["planning", "structure", "implementation", "review"]
		},
		"bugFix": {
			"roles": ["organiser", "debugger", "secondaryCoder"],
			"steps": ["investigation", "fix", "testing"]
		}
	}
}
```

## Best Practices

### Role Configuration

#### 1. Start Simple

- Begin with required roles only
- Add optional roles as needed
- Test configuration before scaling

#### 2. Balance Cost and Performance

- Use cost-effective models for planning
- Use premium models for critical review
- Monitor API usage and costs

#### 3. Configure Appropriate Context

- Set context limits based on task complexity
- Use summarization for long-running tasks
- Monitor context window usage

#### 4. Set Appropriate Rate Limits

- Configure based on provider capabilities
- Set limits to prevent rate limiting
- Monitor and adjust as needed

### Provider Management

#### 1. Use Multiple Providers

- Distribute load across providers
- Use provider strengths for specific tasks
- Configure fallback providers

#### 2. Monitor Provider Performance

- Track API response times
- Monitor error rates
- Set up alerts for provider issues

#### 3. Optimize Provider Usage

- Use appropriate models for tasks
- Configure efficient rate limiting
- Monitor and optimize costs

### Workflow Optimization

#### 1. Define Clear Workflows

- Create workflow templates for common tasks
- Define role assignments for each workflow
- Test and refine workflows

#### 2. Monitor Workflow Performance

- Track workflow completion times
- Monitor agent performance
- Identify and resolve bottlenecks

#### 3. Optimize Workflow Steps

- Parallelize independent tasks
- Use checkpoints for long-running workflows
- Review and optimize artifact sizes

## Troubleshooting

### Common Configuration Issues

#### Role Not Available

**Issue**: Role missing from configuration
**Solution**:

1. Check role registry for available roles
2. Verify role definitions are loaded
3. Restart extension if needed
4. Check for configuration errors

#### Provider Profile Issues

**Issue**: Provider profile not working
**Solution**:

1. Test provider connection
2. Verify API key is valid
3. Check rate limiting settings
4. Review provider configuration

#### Workflow Issues

**Issue**: Workflow not progressing
**Solution**:

1. Check workflow state
2. Review agent status
3. Check for rate limiting or context issues
4. Use retry or restart workflow

#### Performance Issues

**Issue**: Slow performance or timeouts
**Solution**:

1. Check agent health
2. Review rate limiting status
3. Monitor context window usage
4. Adjust agent priorities

### Advanced Troubleshooting

#### Configuration Validation

Use the configuration validation tool:

```bash
# Validate role configuration
kilo validate-roles

# Check provider profiles
kilo validate-providers

# Test workflow configuration
kilo test-workflow --workflow=newFeature
```

#### Debug Logging

Enable debug logging for configuration issues:

```json
{
	"kilo": {
		"debug": {
			"roles": true,
			"providers": true,
			"workflows": true
		}
	}
}
```

#### Performance Monitoring

Monitor configuration performance:

```bash
# Monitor agent performance
kilo monitor-agents

# Check provider usage
kilo monitor-providers

# Analyze workflow performance
kilo analyze-workflows
```

## Version History

### Version 5.5.0

- Added YOLO mode toggle for auto-approval
- Enhanced role configuration interface
- Improved provider profile management

### Version 5.4.0

- Added custom role support
- Enhanced workflow integration
- Improved configuration validation

### Version 5.3.0

- Initial role configuration system
- Basic role definitions
- Provider profile management

## Support and Resources

### Documentation

- [User Guide](user-guide.md)
- [API Reference](api-reference.md)
- [Troubleshooting](troubleshooting.md)

### Community

- [Discord Community](https://kilo.ai/discord)
- [GitHub Issues](https://github.com/Kilo-Org/kilocode/issues)
- [Discussions](https://github.com/Kilo-Org/kilocode/discussions)

### Professional Support

- [Enterprise Support](https://kilo.ai/support)
- [Consulting Services](https://kilo.ai/consulting)
- [Training Programs](https://kilo.ai/training)

---

**Last Updated**: 2026-02-15  
**Version**: 5.5.0  
**Configuration**: [Role Configuration Guide](role-configuration.md)
