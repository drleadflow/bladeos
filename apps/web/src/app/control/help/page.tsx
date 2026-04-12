'use client'

import { useState } from 'react'
import { PageShell, Panel, PanelHeader } from '@/components/dashboard/cockpit-ui'

interface FaqItem {
  question: string
  answer: string
}

interface FaqSection {
  title: string
  icon: string
  items: FaqItem[]
}

const faqSections: FaqSection[] = [
  {
    title: 'Getting Started',
    icon: '🚀',
    items: [
      {
        question: 'What is Blade OS?',
        answer:
          'Blade OS is an AI workforce platform that replaces human employees with specialized AI agents. Each agent has a defined role, personality, KPIs, scheduled routines, and scoped tool access — operating autonomously around the clock. It\'s not a chatbot or coding assistant. It\'s a full operating system for running a business with AI employees.',
      },
      {
        question: 'How do I create my account?',
        answer:
          'Go to the login page and click "Create one" to register. Enter your email, a password (8+ characters), and optionally your name. The first user to register is automatically promoted to admin.',
      },
      {
        question: 'What do I do after signing up?',
        answer:
          'After registration you\'ll go through onboarding where you select which AI employees to activate and choose a communication archetype (Coach or Operator). Once onboarded, your employees start running their scheduled routines automatically.',
      },
    ],
  },
  {
    title: 'AI Employees',
    icon: '⚡',
    items: [
      {
        question: 'What employees are available?',
        answer:
          'Blade has 9 AI employees: Chief of Staff (executive coordination), CSM Agent (client health monitoring), Engineering Manager (codebase health), Finance Analyst (cost tracking), Growth Lead (marketing funnels), Ops Manager (system operations), Product Manager (feature delivery), SDR (sales pipeline), and Support Lead (ticket resolution).',
      },
      {
        question: 'How do employees work autonomously?',
        answer:
          'Each employee has scheduled routines that run on cron schedules. For example, the Chief of Staff generates a morning briefing at 6 AM every weekday, the CSM Agent checks client health at 7 AM, and the Ops Manager runs system health checks every 6 hours. These routines execute through the agent loop with scoped tool access.',
      },
      {
        question: 'What are the two personality archetypes?',
        answer:
          'Operator: direct, action-oriented, biased toward execution. Moves fast, gives clear directives. Coach: facilitative, asks questions, guides humans to their own decisions. Each employee can be activated in either mode.',
      },
      {
        question: 'What tools can employees use?',
        answer:
          'Each employee has a hard-scoped set of allowed tools. For example, the CSM Agent can access Meta Ads, client health data, Slack, and memory tools — but cannot run shell commands. The Ops Manager can run shell commands and read files but cannot access CRM data. This is a hard sandbox, not a suggestion.',
      },
      {
        question: 'What happens when an employee gets stuck?',
        answer:
          'Each employee has an escalation policy. Depending on the trigger (error, budget exceeded, blocked, low confidence), the employee will either notify the user, pause and ask for guidance, or hand off to another employee (usually the Chief of Staff).',
      },
      {
        question: 'Can employees hand off work to each other?',
        answer:
          'Yes. Employees have explicit handoff rules. For example, if the CSM Agent detects a technical issue affecting a client, it can hand off to the Engineering Manager. If the SDR identifies a lead that needs nurturing rather than outreach, it hands off to the Growth Lead.',
      },
    ],
  },
  {
    title: 'Dashboard Sections',
    icon: '📊',
    items: [
      {
        question: 'What is the Command Center?',
        answer:
          'The Command Center is your operational cockpit. It includes the main dashboard (Cockpit), a daily snapshot (Today), KPI scorecard, clarity compass, focus timer, delegation tools, and direct chat with Blade.',
      },
      {
        question: 'What does the Revenue section show?',
        answer:
          'Revenue tracks your sales operations: MRR, ARR, active clients, pipeline value, deal kanban, lead management, client health, AI closer performance, outreach campaigns, and ad campaigns.',
      },
      {
        question: 'What is the Workforce section?',
        answer:
          'Workforce shows all your AI employees, their performance metrics, scheduled routines, pending approvals, and operating playbooks/frameworks.',
      },
      {
        question: 'What does Operations track?',
        answer:
          'Operations covers system health: workflow execution history, health monitors and alerts, automation rules, and cron job scheduling.',
      },
      {
        question: 'What is the Memory section?',
        answer:
          'Memory is Blade\'s knowledge base. It stores business facts, customer knowledge, decision rationale, and SOPs. Employees can save and recall memories during their routines to maintain context across sessions.',
      },
      {
        question: 'What does the Studio do?',
        answer:
          'The Content Studio manages video and content projects. It handles R2 file uploads, transcription, caption generation, and content scheduling across platforms.',
      },
    ],
  },
  {
    title: 'KPIs & Monitoring',
    icon: '📈',
    items: [
      {
        question: 'How are KPIs measured?',
        answer:
          'Each employee has 2-4 KPIs with measurable targets, measured daily, weekly, or monthly. Built-in measurement functions track metrics like daily spend, job success rate, and activity count. Each KPI has green/yellow/red thresholds.',
      },
      {
        question: 'What do the monitor colors mean?',
        answer:
          'Green: on target, healthy. Yellow: warning, needs attention. Red: critical, action required. The Chief of Staff flags yellow and red KPIs in the morning briefing.',
      },
      {
        question: 'What monitors run automatically?',
        answer:
          'Four built-in monitors run every 6 hours: Cost Burn (spend vs budget), Employee Health (per-employee KPI rollup), Client Health (account performance snapshots), and Memory Health (memory usage patterns).',
      },
    ],
  },
  {
    title: 'Routines & Automation',
    icon: '🔄',
    items: [
      {
        question: 'What are routines?',
        answer:
          'Routines are scheduled tasks that run automatically on cron schedules. Each routine belongs to an employee, uses their scoped tools, runs through the agent loop, and logs results. There are 17 routines across 9 employees.',
      },
      {
        question: 'What is the daily schedule?',
        answer:
          '6 AM: Chief of Staff morning briefing. 7 AM: CSM health check. 8 AM: Support backlog review. 9 AM: SDR pipeline review + PM sprint review (Mondays). 10 AM: Eng deploy health + Growth funnel review (Mondays). 12 PM: CSM decline watch. 2 PM: Eng PR review + SDR lead qualification + CSM weekly report (Fridays). 3 PM: Support escalation check. 5 PM: Ops + Finance cost reviews. 6 PM: Chief of Staff end-of-day summary. Plus: Ops health check every 6 hours.',
      },
      {
        question: 'What is the approval queue?',
        answer:
          'When employees encounter decisions that require human judgment (sensitive actions, high-cost operations, conflicting priorities), they create approval requests. These appear in the Workforce > Approvals section for you to approve or reject.',
      },
    ],
  },
  {
    title: 'Integrations & Tools',
    icon: '🔗',
    items: [
      {
        question: 'What platforms does Blade integrate with?',
        answer:
          'GoHighLevel (CRM), Meta Ads, Slack, Telegram, GitHub, and more. The SDR uses GHL for lead management. The CSM Agent uses Meta Ads and Slack for client monitoring and alerts. Engineering uses GitHub for PR automation.',
      },
      {
        question: 'How does the chat work?',
        answer:
          'Chat uses a unified conversation engine that works across CLI, web dashboard, Telegram, and Slack. Messages are streamed via Server-Sent Events (SSE) on the web. Conversations can move between channels.',
      },
      {
        question: 'Can Blade write and deploy code?',
        answer:
          'Yes. The coding pipeline clones a repo, creates a branch, spins up a Docker sandbox (2GB RAM, isolated), writes code via the agent loop, runs tests, and creates a pull request. Use the CLI: blade code "task" --repo=url.',
      },
    ],
  },
  {
    title: 'Cost & Security',
    icon: '🔒',
    items: [
      {
        question: 'How is cost tracked?',
        answer:
          'Every API call logs model, input/output tokens, and USD cost to the cost_entries table. The Finance Analyst monitors daily burn vs budget autonomously. You can view spend in Engineering > Costs or via blade costs CLI.',
      },
      {
        question: 'What are the model tiers?',
        answer:
          'Light (Haiku): quick lookups, cheapest. Standard (Sonnet): most work including coding, reviews, routines. Heavy (Opus): architecture decisions, complex reasoning. Smart routing selects the cheapest model that meets quality requirements.',
      },
      {
        question: 'How are employees sandboxed?',
        answer:
          'Each employee only accesses tools in their allowed_tools list. This is a hard sandbox — no fallthrough to global tools. Additionally, coding runs in Docker containers with dropped capabilities, memory limits, and PID limits.',
      },
      {
        question: 'How does authentication work?',
        answer:
          'Blade uses Lucia session-based authentication with Argon2 password hashing. Sessions are stored in auth_session with HTTP-only, Secure, SameSite=Strict cookies. Rate limiting: 60 req/min authenticated, 30 req/min unauthenticated.',
      },
    ],
  },
  {
    title: 'CLI Reference',
    icon: '⌨️',
    items: [
      {
        question: 'What CLI commands are available?',
        answer:
          'blade setup (config wizard), blade chat (interactive REPL), blade code "task" --repo=url (autonomous coding), blade team (list employees), blade briefing (morning briefing), blade scorecard (KPI table), blade jobs (list jobs), blade costs (spending), blade memory [query] (search knowledge), blade doctor (system check), blade start (web dashboard), blade telegram / blade slack (start bots).',
      },
      {
        question: 'How do I configure Blade?',
        answer:
          'Run blade setup for interactive configuration. It sets your API key (Anthropic), GitHub token, default model, and cost budget. Config is saved to ~/.blade/config.json and .env. You can also configure via Control > Settings in the web dashboard.',
      },
    ],
  },
  {
    title: 'Architecture',
    icon: '🏗️',
    items: [
      {
        question: 'What is the tech stack?',
        answer:
          'TypeScript (strict mode, ESM), Node.js 20+, Next.js 14 (App Router), SQLite via better-sqlite3 (with PostgreSQL option), Anthropic Claude API, npm workspaces + Turborepo monorepo, Tailwind CSS, Docker for sandboxed code execution.',
      },
      {
        question: 'How is the codebase organized?',
        answer:
          'Monorepo with 4 apps and 4 packages. Apps: cli (blade command), web (Next.js dashboard), landing (marketing page). Packages: core (agent loop, tools, employees, routines), conversation (unified engine + channel adapters), db (SQLite/Postgres, 16 migrations, 13 repos), shared (logger, config), docker-runner (sandboxed execution).',
      },
      {
        question: 'What is the agent loop?',
        answer:
          'The core execution engine. It receives a task (system prompt + message + tools), calls the AI model, executes any tool calls, feeds results back, and repeats until done. Safety: 25 iteration max, 10-minute timeout, cost gating, stuck-loop detection (breaks if same tool+input called 3+ times).',
      },
      {
        question: 'How does the database work?',
        answer:
          'SQLite in WAL mode with 50+ tables across 16 migrations. All access goes through repository functions. Tables cover conversations, employees, routines, KPIs, monitors, clients, leads, costs, auth, content, and more. On Railway, data persists via a volume mounted at /data.',
      },
    ],
  },
]

export default function HelpPage() {
  const [openItems, setOpenItems] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  function toggleItem(key: string) {
    setOpenItems((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const filteredSections = search.trim()
    ? faqSections
        .map((section) => ({
          ...section,
          items: section.items.filter(
            (item) =>
              item.question.toLowerCase().includes(search.toLowerCase()) ||
              item.answer.toLowerCase().includes(search.toLowerCase())
          ),
        }))
        .filter((section) => section.items.length > 0)
    : faqSections

  return (
    <PageShell
      eyebrow="Control"
      title="Help & FAQ"
      description="Everything you need to know about Blade OS"
    >
      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search questions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-cyan-500/50 focus:bg-white/8"
        />
      </div>

      {/* FAQ Sections */}
      <div className="space-y-6">
        {filteredSections.map((section) => (
          <Panel key={section.title}>
            <PanelHeader
              title={`${section.icon}  ${section.title}`}
              description={`${section.items.length} questions`}
            />
            <div className="divide-y divide-white/5">
              {section.items.map((item) => {
                const key = `${section.title}-${item.question}`
                const isOpen = openItems.has(key)
                return (
                  <div key={key}>
                    <button
                      onClick={() => toggleItem(key)}
                      className="flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-white/3"
                    >
                      <span className="pr-4 text-sm font-medium text-zinc-200">
                        {item.question}
                      </span>
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="shrink-0 text-zinc-500 transition-transform"
                        style={{
                          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        }}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-4 text-sm leading-relaxed text-zinc-400">
                        {item.answer}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </Panel>
        ))}

        {filteredSections.length === 0 && (
          <div className="py-12 text-center text-sm text-zinc-500">
            No questions match &ldquo;{search}&rdquo;
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-8 rounded-xl border border-white/5 bg-white/3 px-5 py-4 text-center text-sm text-zinc-500">
        Need more help? Chat with Blade directly at{' '}
        <a href="/chat" className="text-cyan-400 hover:underline">
          Advisor Chat
        </a>{' '}
        or check the{' '}
        <a
          href="https://github.com/drleadflow/bladeos"
          target="_blank"
          rel="noopener noreferrer"
          className="text-cyan-400 hover:underline"
        >
          GitHub repo
        </a>
        .
      </div>
    </PageShell>
  )
}
