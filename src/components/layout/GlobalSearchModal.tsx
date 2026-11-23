"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn, formatDateVi, getInitials, PRIORITY_CONFIG } from "@/lib/utils";
import type { TaskPriority } from "@/types/database";
import {
  CheckSquare,
  FolderKanban,
  Loader2,
  Search,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";

interface SearchProject {
  id: string;
  name: string;
  code: string;
  color: string;
}

interface SearchTask {
  id: string;
  title: string;
  project_id: string;
  priority: TaskPriority;
  due_date: string | null;
  project: { id: string; name: string; code: string; color: string } | null;
}

interface SearchProfile {
  id: string;
  full_name: string;
  email: string;
  job_title: string | null;
  avatar_url: string | null;
}

type SearchResultItem =
  | { kind: "project"; data: SearchProject }
  | { kind: "task"; data: SearchTask }
  | { kind: "profile"; data: SearchProfile };

interface GlobalSearchModalProps {
  open: boolean;
  onClose: () => void;
}

export function GlobalSearchModal({ open, onClose }: GlobalSearchModalProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<SearchProject[]>([]);
  const [tasks, setTasks] = useState<SearchTask[]>([]);
  const [profiles, setProfiles] = useState<SearchProfile[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const flatItems = useMemo<SearchResultItem[]>(() => {
    return [
      ...projects.map((data) => ({ kind: "project" as const, data })),
      ...tasks.map((data) => ({ kind: "task" as const, data })),
      ...profiles.map((data) => ({ kind: "profile" as const, data })),
    ];
  }, [projects, tasks, profiles]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 20);
    } else {
      setQuery("");
      setProjects([]);
      setTasks([]);
      setProfiles([]);
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const trimmed = query.trim();
    if (!trimmed) {
      setProjects([]);
      setTasks([]);
      setProfiles([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const supabase = createClient();
        const pattern = `%${trimmed}%`;

        const [projRes, taskRes, profRes] = await Promise.all([
          supabase
            .from("projects")
            .select("id, name, code, color")
            .or(`name.ilike.${pattern},code.ilike.${pattern}`)
            .limit(5),
          supabase
            .from("tasks")
            .select(
              "id, title, project_id, priority, due_date, project:projects(id, name, code, color)"
            )
            .ilike("title", pattern)
            .limit(8),
          supabase
            .from("profiles")
            .select("id, full_name, email, job_title, avatar_url")
            .or(`full_name.ilike.${pattern},email.ilike.${pattern}`)
            .limit(5),
        ]);

        if (cancelled) return;

        setProjects((projRes.data as SearchProject[]) ?? []);
        const rawTasks = (taskRes.data ?? []) as unknown as Array<
          Omit<SearchTask, "project"> & {
            project:
              | { id: string; name: string; code: string; color: string }
              | Array<{ id: string; name: string; code: string; color: string }>
              | null;
          }
        >;
        setTasks(
          rawTasks.map((t) => ({
            ...t,
            project: Array.isArray(t.project) ? t.project[0] ?? null : t.project,
          }))
        );
        setProfiles((profRes.data as SearchProfile[]) ?? []);
        setActiveIndex(0);
      } catch {
        if (!cancelled) {
          toast.error("Không thể tìm kiếm lúc này.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open]);

  function handleSelect(item: SearchResultItem) {
    if (item.kind === "project") {
      onClose();
      router.push(`/projects/${item.data.id}`);
    } else if (item.kind === "task") {
      onClose();
      router.push(`/projects/${item.data.project_id}?task=${item.data.id}`);
    } else {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(item.data.email).catch(() => {});
      }
      toast.info(`${item.data.full_name} — ${item.data.email} (đã sao chép email)`);
      onClose();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (flatItems.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % flatItems.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + flatItems.length) % flatItems.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = flatItems[activeIndex];
      if (target) handleSelect(target);
    }
  }

  if (!open) return null;

  let currentIdx = -1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/50 backdrop-blur-xs pt-16 sm:pt-24 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 px-4 py-3.5">
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-brand shrink-0" />
          ) : (
            <Search className="h-5 w-5 text-slate-400 shrink-0" />
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm dự án, công việc hoặc nhân sự..."
            className="w-full bg-transparent text-sm sm:text-base text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label="Xóa từ khóa"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-1.5 py-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {!query.trim() ? (
            <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
              Nhập từ khóa để tìm kiếm nhanh dự án, công việc hoặc đồng nghiệp.
            </div>
          ) : !loading && flatItems.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
              Không tìm thấy kết quả phù hợp cho{" "}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                &ldquo;{query}&rdquo;
              </span>
              .
            </div>
          ) : (
            <div className="space-y-4 py-1">
              {projects.length > 0 && (
                <div>
                  <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Dự án ({projects.length})
                  </div>
                  <div className="space-y-0.5">
                    {projects.map((p) => {
                      currentIdx += 1;
                      const idx = currentIdx;
                      const isActive = idx === activeIndex;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onMouseEnter={() => setActiveIndex(idx)}
                          onClick={() => handleSelect({ kind: "project", data: p })}
                          className={cn(
                            "w-full flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition cursor-pointer",
                            isActive
                              ? "bg-brand-soft dark:bg-brand-soft-dark/70 text-slate-900 dark:text-white"
                              : "hover:bg-slate-50 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-200"
                          )}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span
                              className="h-3 w-3 rounded-full shrink-0"
                              style={{ backgroundColor: p.color || "#F26522" }}
                            />
                            <FolderKanban className="h-4 w-4 text-slate-400 shrink-0" />
                            <span className="truncate text-sm font-medium">
                              {p.name}
                            </span>
                          </div>
                          <span className="shrink-0 rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-mono text-slate-600 dark:text-slate-300">
                            {p.code}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {tasks.length > 0 && (
                <div>
                  <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Công việc ({tasks.length})
                  </div>
                  <div className="space-y-0.5">
                    {tasks.map((t) => {
                      currentIdx += 1;
                      const idx = currentIdx;
                      const isActive = idx === activeIndex;
                      const priorityCfg = PRIORITY_CONFIG[t.priority];
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onMouseEnter={() => setActiveIndex(idx)}
                          onClick={() => handleSelect({ kind: "task", data: t })}
                          className={cn(
                            "w-full flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition cursor-pointer",
                            isActive
                              ? "bg-brand-soft dark:bg-brand-soft-dark/70 text-slate-900 dark:text-white"
                              : "hover:bg-slate-50 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-200"
                          )}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <CheckSquare className="h-4 w-4 text-brand shrink-0" />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {t.title}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                {t.project && (
                                  <span className="inline-flex items-center gap-1">
                                    <span
                                      className="h-2 w-2 rounded-full"
                                      style={{
                                        backgroundColor:
                                          t.project.color || "#F26522",
                                      }}
                                    />
                                    {t.project.name}
                                  </span>
                                )}
                                {t.due_date && (
                                  <span>• Hạn {formatDateVi(t.due_date)}</span>
                                )}
                              </div>
                            </div>
                          </div>
                          {priorityCfg && (
                            <span
                              className={cn(
                                "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                                priorityCfg.bg,
                                priorityCfg.color
                              )}
                            >
                              {priorityCfg.label}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {profiles.length > 0 && (
                <div>
                  <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Nhân sự ({profiles.length})
                  </div>
                  <div className="space-y-0.5">
                    {profiles.map((u) => {
                      currentIdx += 1;
                      const idx = currentIdx;
                      const isActive = idx === activeIndex;
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onMouseEnter={() => setActiveIndex(idx)}
                          onClick={() => handleSelect({ kind: "profile", data: u })}
                          className={cn(
                            "w-full flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition cursor-pointer",
                            isActive
                              ? "bg-brand-soft dark:bg-brand-soft-dark/70 text-slate-900 dark:text-white"
                              : "hover:bg-slate-50 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-200"
                          )}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/15 text-xs font-semibold text-brand">
                              {getInitials(u.full_name)}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {u.full_name}
                              </p>
                              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                {u.email}
                                {u.job_title ? ` • ${u.job_title}` : ""}
                              </p>
                            </div>
                          </div>
                          <User className="h-4 w-4 text-slate-400 shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer hints */}
        <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 px-4 py-2 text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-3">
            <span>↑↓ Di chuyển</span>
            <span>↵ Mở nhanh</span>
            <span>ESC Đóng</span>
          </div>
          <span>ALPHA Work</span>
        </div>
      </div>
    </div>
  );
}
