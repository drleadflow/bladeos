---
name: vet-repo
description: Security vet a GitHub repository before cloning or installing. Run /vet-repo <github-url> to get a SAFE/CAUTION/DANGER rating.
disable-model-invocation: true
allowed-tools: Agent, Read, Bash, Grep, Glob, WebFetch, WebSearch, mcp__github__get_file_contents, mcp__github__list_commits, mcp__github__list_issues, mcp__github__search_code
---

# /vet-repo — GitHub Repository Security Audit

You are running a security audit on a GitHub repository before the user clones or installs it.

**Input:** The user provides a GitHub URL (e.g., `https://github.com/owner/repo`).

Parse the owner and repo name from the URL. If the URL is invalid, ask for a valid GitHub URL.

## Audit Checklist

Run ALL checks. Use parallel tool calls where possible.

### Phase 1: Identity & Trust (run in parallel)

1. **Ownership**
   - Use `mcp__github__get_file_contents` to read the repo's README
   - Check: Is the owner a verified org or a real person with history?
   - Red flags: new account (<1 year), no other repos, no profile info

2. **Activity**
   - Use `mcp__github__list_commits` (limit 10) to check recent activity
   - Check: Regular commits? Multiple contributors? Or abandoned?
   - Red flags: no commits in 6+ months, single anonymous contributor

3. **License**
   - Use `mcp__github__get_file_contents` to read LICENSE file
   - Check: Standard OSS license (MIT, BSD, Apache, GPL)?
   - Red flags: no license, custom restrictive license, license that conflicts with commercial use

4. **Stars & Community**
   - Note star count, fork count from repo metadata
   - Check: proportional to claims? Fake star patterns?
   - Red flags: very low stars for big claims, sudden star spikes

### Phase 2: Code Security (run in parallel)

5. **Install Scripts (CRITICAL)**
   - Read `package.json` (npm), `setup.py` / `pyproject.toml` (Python), `Makefile`, or equivalent
   - Check for: `preinstall`, `postinstall`, `prepare` scripts
   - Red flags: scripts that curl/wget remote URLs, run encoded commands, or modify system files
   - If install scripts exist, READ THEM FULLY and report what they do

6. **Dependency Health**
   - Read the dependency file (package.json, requirements.txt, go.mod, etc.)
   - Check for: known malicious packages, typosquatted names, excessive dependencies
   - Red flags: dependencies with very similar names to popular packages (e.g., `lodassh` instead of `lodash`)

7. **Entry Point Analysis**
   - Read the main entry file (index.js, main.py, src/index.ts, bin/*, etc.)
   - Check for: obfuscated code, base64-encoded strings, eval(), exec(), hidden network calls
   - Red flags: minified source code in a source repo, encoded payloads, outbound HTTP to unknown hosts

8. **Secrets & Env**
   - Check if `.env`, `.env.example`, or config files contain hardcoded tokens/keys
   - Check `.gitignore` exists and covers sensitive files
   - Red flags: committed API keys, tokens, passwords

### Phase 3: Known Vulnerabilities

9. **Security Advisories**
   - Use `mcp__github__list_issues` with labels like "security", "vulnerability", "CVE"
   - Check: are security issues addressed promptly or ignored?
   - Red flags: open security issues older than 90 days

10. **GitHub Security Features**
    - Check for: `.github/dependabot.yml`, CodeQL config, security policy (SECURITY.md)
    - Their presence is a positive signal, absence is neutral (not a red flag alone)

## Rating

After all checks, assign ONE rating:

### SAFE
- Verified org or well-known maintainer
- Active development with multiple contributors
- Clean entry points, no suspicious scripts
- Standard license
- No unaddressed security issues

### CAUTION
- Some yellow flags but no deal-breakers
- Examples: single maintainer, low stars, missing security features, old dependencies
- Include specific concerns and mitigation advice

### DANGER
- Any of these triggers DANGER immediately:
  - Obfuscated code or encoded payloads
  - Install scripts that download/execute remote code
  - Typosquatted dependency names
  - Committed secrets or credentials
  - Unaddressed security vulnerabilities
  - Owner account is suspicious (new, no history, fake profile)

## Output Format

```
## /vet-repo: [owner/repo]

**Rating: [SAFE / CAUTION / DANGER]**

### Quick Facts
- Owner: [org/person] ([verified/unverified])
- Stars: [count] | Forks: [count]
- Last commit: [date]
- License: [type]
- Contributors: [count]

### Findings
[Bullet list of key findings from each check — keep it concise]

### Red Flags
[List any concerns, or "None found"]

### Recommendation
[One sentence: safe to clone, clone with caution, or do not clone]
```

Keep the output to ONE SCREEN. No raw API dumps. Be direct.
