---
disable-model-invocation: true
---

Create a new Claude Code project from the ClaudeOS template.

**Input:** The user provides a project name and optional path:
```
/template-project my-new-project
/template-project my-new-project ~/Desktop/projects/
```

## What To Do

1. Determine the target directory:
   - If a path is given: `{path}/{project-name}`
   - If no path: `./{project-name}` (current directory)

2. Create the project directory and copy the ClaudeOS structure:

```bash
TARGET="{resolved-path}"
mkdir -p "$TARGET"

# Core files
cp CLAUDE.md "$TARGET/"
cp CLAUDE.local.md "$TARGET/" 2>/dev/null || true
cp .gitignore "$TARGET/"
cp .mcp.json "$TARGET/"
cp setup.sh "$TARGET/"
cp setup.ps1 "$TARGET/" 2>/dev/null || true
cp setup.bat "$TARGET/" 2>/dev/null || true

# Directory structure
mkdir -p "$TARGET/tasks"
cp tasks/NOTES.md "$TARGET/tasks/"

mkdir -p "$TARGET/.claude"
cp .claude/PRIMER.md "$TARGET/.claude/"
cp .claude/settings.json "$TARGET/.claude/"

# Agents
mkdir -p "$TARGET/.claude/agents"
cp .claude/agents/_template.md "$TARGET/.claude/agents/"
cp .claude/agents/self-critic.md "$TARGET/.claude/agents/"
cp .claude/agents/policy-refiner.md "$TARGET/.claude/agents/"

# Skills (template only — don't copy project-specific skills)
mkdir -p "$TARGET/.claude/skills/_template/references"
cp -r .claude/skills/_template/* "$TARGET/.claude/skills/_template/"

# Workforce (all 6 roles)
for role in researcher builder reviewer tester auditor ops; do
  mkdir -p "$TARGET/.claude/workforce/$role"
  cp .claude/workforce/$role/profile.md "$TARGET/.claude/workforce/$role/"
  cp .claude/workforce/$role/memory.md "$TARGET/.claude/workforce/$role/"
done

# Team-up and vet-repo skills
mkdir -p "$TARGET/.claude/skills/team-up"
cp .claude/skills/team-up/SKILL.md "$TARGET/.claude/skills/team-up/"
mkdir -p "$TARGET/.claude/skills/vet-repo"
cp .claude/skills/vet-repo/SKILL.md "$TARGET/.claude/skills/vet-repo/"

# Commands
mkdir -p "$TARGET/.claude/commands"
cp .claude/commands/update-context.md "$TARGET/.claude/commands/"
cp .claude/commands/team-up.md "$TARGET/.claude/commands/"
cp .claude/commands/vet-repo.md "$TARGET/.claude/commands/"
cp .claude/commands/template-project.md "$TARGET/.claude/commands/"

# Rules
mkdir -p "$TARGET/.claude/rules"
cp .claude/rules/*.md "$TARGET/.claude/rules/"

# Hooks
mkdir -p "$TARGET/.claude/hooks"
cp .claude/hooks/*.sh "$TARGET/.claude/hooks/"
chmod +x "$TARGET/.claude/hooks/"*.sh

# Error tracking
mkdir -p "$TARGET/.claude/errors"
touch "$TARGET/.claude/errors/LOG.md"
touch "$TARGET/.claude/errors/PATTERNS.md"

# Hindsight
mkdir -p "$TARGET/.claude/hindsight"
touch "$TARGET/.claude/hindsight/PATTERNS.md"

# Git-ignored dirs
mkdir -p "$TARGET/.claude/logs"
mkdir -p "$TARGET/.claude/sessions"
```

3. Initialize git:
```bash
cd "$TARGET"
git init
git add -A
git commit -m "feat: scaffold project from ClaudeOS template"
```

4. Report what was created:
```
## Project Created: {project-name}

### Location
{absolute-path}

### What's Included
- 5-layer memory system (CLAUDE.md, PRIMER, memory hook, hindsight, knowledge base)
- 6 workforce roles (researcher, builder, reviewer, tester, auditor, ops)
- /team-up orchestrator skill
- /vet-repo security audit skill
- /update-context self-improvement command
- Self-critic + policy-refiner agents
- 6 automation hooks
- Modular rules system

### Next Steps
1. cd {path} && edit CLAUDE.md with your project rules
2. Edit .mcp.json to add your MCP servers
3. Run: claude
```

$ARGUMENTS
