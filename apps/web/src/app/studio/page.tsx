"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ContentProject {
  id: string;
  title: string;
  status: string;
  videoCount: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function statusColor(status: string): { bg: string; text: string } {
  if (status === "published") return { bg: "rgba(52,211,153,0.12)", text: "#34d399" };
  if (status === "transcribed") return { bg: "rgba(34,211,238,0.12)", text: "#22d3ee" };
  if (status === "processing") return { bg: "rgba(251,191,36,0.12)", text: "#fbbf24" };
  return { bg: "rgba(255,255,255,0.06)", text: "#a1a1aa" };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface NavCardProps {
  href: string;
  label: string;
  description: string;
  icon: string;
}

function NavCard({ href, label, description, icon }: NavCardProps) {
  return (
    <Link
      href={href}
      className="flex items-start gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-white/20 hover:bg-white/[0.06]"
    >
      <span className="text-2xl shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-zinc-100">{label}</p>
        <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{description}</p>
      </div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StudioPage() {
  const [projects, setProjects] = useState<ContentProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/studio/projects")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((json) => {
        if (json?.success && Array.isArray(json.data)) {
          setProjects(json.data as ContentProject[]);
        }
        setLoading(false);
      });
  }, []);

  const totalVideos = projects.reduce((s, p) => s + (p.videoCount ?? 0), 0);
  const publishedCount = projects.filter((p) => p.status === "published").length;

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-6xl space-y-8">
        {/* Header */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-2">
            Content Studio
          </p>
          <h1 className="text-3xl font-light text-zinc-100">Studio</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Create, transcribe, caption, and schedule content across platforms.
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label: "Projects",
              value: loading ? "—" : String(projects.length),
              hint: "Content projects",
            },
            {
              label: "Total Videos",
              value: loading ? "—" : String(totalVideos),
              hint: "Across all projects",
            },
            {
              label: "Published",
              value: loading ? "—" : String(publishedCount),
              hint: "Live projects",
              accent: true,
            },
            {
              label: "In Progress",
              value: loading ? "—" : String(projects.length - publishedCount),
              hint: "Draft / processing",
            },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-xl border border-white/10 p-6 flex flex-col gap-2"
              style={{
                background: card.accent
                  ? "linear-gradient(135deg, rgba(52,211,153,0.08) 0%, rgba(255,255,255,0.03) 100%)"
                  : "rgba(255,255,255,0.03)",
              }}
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                {card.label}
              </p>
              <p
                className="text-3xl font-light tabular-nums"
                style={{ color: card.accent ? "#34d399" : "#f4f4f5" }}
              >
                {card.value}
              </p>
              <p className="text-sm text-zinc-400">{card.hint}</p>
            </div>
          ))}
        </div>

        {/* Navigation */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-4">
            Studio Tools
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <NavCard
              href="/studio/library"
              label="Library"
              description="Browse all uploaded videos, transcripts, and captions."
              icon="🎬"
            />
            <NavCard
              href="/studio/calendar"
              label="Calendar"
              description="View and manage your scheduled content posts by date."
              icon="📅"
            />
            <NavCard
              href="/studio/new"
              label="New Project"
              description="Upload a video, run transcription, and generate captions."
              icon="➕"
            />
          </div>
        </div>

        {/* Recent Projects */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-4">
            Recent Projects
          </p>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-16 rounded-xl border border-white/10 bg-white/[0.03] animate-pulse"
                />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-10 text-center">
              <p className="text-zinc-500 text-sm">No projects yet.</p>
              <p className="text-zinc-600 text-xs mt-1">
                Upload a video to get started.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
              {projects.slice(0, 10).map((project, idx) => {
                const colors = statusColor(project.status);
                return (
                  <Link
                    key={project.id}
                    href={`/studio/${project.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-white/[0.04]"
                    style={{
                      borderTop: idx > 0 ? "1px solid rgba(255,255,255,0.06)" : undefined,
                    }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-lg shrink-0">🎬</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-100 truncate">
                          {project.title}
                        </p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {project.videoCount} video{project.videoCount !== 1 ? "s" : ""} ·{" "}
                          {relativeTime(project.updatedAt)}
                        </p>
                      </div>
                    </div>
                    <span
                      className="shrink-0 text-xs font-semibold px-2.5 py-0.5 rounded-full capitalize"
                      style={{ backgroundColor: colors.bg, color: colors.text }}
                    >
                      {project.status}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
