"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckSquare,
  FolderPlus,
  ListTodo,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { generateProjectCode } from "@/lib/utils";
import type { Profile, TaskPriority, TaskStatus } from "@/types/database";

interface QuickActionButtonProps {
  currentUser: Profile;
}

type ModalMode = "task" | "project" | "todo" | null;

interface SimpleProject {
  id: string;
  name: string;
  code: string;
}

export function QuickActionButton({ currentUser }: QuickActionButtonProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const menuRef = useRef<HTMLDivElement>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>(null);

  // Task creation state
  const [projects, setProjects] = useState<SimpleProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskPriority, setTaskPriority] = useState<TaskPriority>("medium");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [assignToMe, setAssignToMe] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Project creation state
  const [projName, setProjName] = useState("");
  const [projCode, setProjCode] = useState("");
  const [projDueDate, setProjDueDate] = useState("");

  // Personal todo state
  const [todoTitle, setTodoTitle] = useState("");

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  useEffect(() => {
    if (modalMode !== "task") return;
    let active = true;
    async function loadProjects() {
      const { data } = await supabase
        .from("projects")
        .select("id, name, code")
        .eq("status", "active")
        .order("name", { ascending: true });
      if (active && data) {
        const list = data as SimpleProject[];
        setProjects(list);
        if (list.length > 0 && !selectedProjectId) {
          setSelectedProjectId(list[0].id);
        }
      }
    }
    loadProjects();
    return () => {
      active = false;
    };
  }, [modalMode, supabase, selectedProjectId]);

  async function handleCreateQuickTask(e: React.FormEvent) {
    e.preventDefault();
    if (!taskTitle.trim() || !selectedProjectId) return;
    setSubmitting(true);
    try {
      const { data: statusData } = await supabase
        .from("task_statuses")
        .select("*")
        .eq("project_id", selectedProjectId)
        .order("position", { ascending: true });

      const statuses = (statusData ?? []) as TaskStatus[];
      const todoStatus =
        statuses.find((s) => s.category === "todo") ?? statuses[0] ?? null;

      const { data: newTask, error } = await supabase
        .from("tasks")
        .insert({
          project_id: selectedProjectId,
          status_id: todoStatus?.id ?? null,
          title: taskTitle.trim(),
          priority: taskPriority,
          due_date: taskDueDate || null,
          position: 0,
          created_by: currentUser.id,
        })
        .select("id, project_id")
        .single();

      if (error || !newTask) throw error;

      if (assignToMe) {
        await supabase.from("task_assignees").insert({
          task_id: newTask.id,
          user_id: currentUser.id,
          assigned_by: currentUser.id,
        });
      }

      toast.success("Đã tạo công việc mới!");
      setTaskTitle("");
      setTaskDueDate("");
      setModalMode(null);
      router.refresh();
    } catch {
      toast.error("Không thể tạo công việc lúc này.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateQuickProject(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = projName.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      const code = (projCode.trim() || generateProjectCode(trimmed)).toUpperCase();
      const { data: newProj, error } = await supabase
        .from("projects")
        .insert({
          name: trimmed,
          code,
          category: "Sách Quản trị & Kinh doanh",
          delivery_confidence: "on_track",
          color: "#F47830",
          status: "active",
          department_id: currentUser.department_id || null,
          start_date: new Date().toISOString().slice(0, 10),
          due_date: projDueDate || null,
          created_by: currentUser.id,
        })
        .select("id")
        .single();

      if (error || !newProj) throw error;

      await supabase.from("project_members").upsert(
        {
          project_id: newProj.id,
          user_id: currentUser.id,
          role: "owner",
        },
        { onConflict: "project_id,user_id" }
      );

      toast.success(`Đã tạo dự án "${trimmed}"`);
      setProjName("");
      setProjCode("");
      setProjDueDate("");
      setModalMode(null);
      router.push(`/projects/${newProj.id}`);
      router.refresh();
    } catch {
      toast.error("Không thể tạo dự án (kiểm tra quyền tạo dự án).");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateQuickTodo(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = todoTitle.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("personal_todos").insert({
        user_id: currentUser.id,
        title: trimmed,
        is_done: false,
        position: 0,
      });
      if (error) throw error;
      toast.success("Đã thêm vào Todo cá nhân!");
      setTodoTitle("");
      setModalMode(null);
      router.refresh();
    } catch {
      toast.error("Không thể thêm việc cần làm.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div ref={menuRef} className="relative">
      {/* Worklenz pill button: orange circle (+) + "Mới" */}
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        className="flex h-[32px] items-center gap-2 rounded-full border border-[#d9d9d9] dark:border-[#3a3a3a] bg-transparent pl-1 pr-3 text-[13px] font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-brand transition cursor-pointer"
      >
        <span className="flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full bg-brand text-white">
          <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
        </span>
        <span className="hidden sm:inline">Tạo mới</span>
      </button>

      {menuOpen && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-48 rounded-lg border border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f] p-1 shadow-lg">
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setModalMode("task");
            }}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-[13px] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#2a2a2a] cursor-pointer"
          >
            <CheckSquare className="h-3.5 w-3.5 text-brand" />
            <span>Công việc mới</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setModalMode("project");
            }}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-[13px] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#2a2a2a] cursor-pointer"
          >
            <FolderPlus className="h-3.5 w-3.5 text-brand" />
            <span>Dự án mới</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setModalMode("todo");
            }}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-[13px] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#2a2a2a] cursor-pointer"
          >
            <ListTodo className="h-3.5 w-3.5 text-brand" />
            <span>Todo cá nhân</span>
          </button>
        </div>
      )}

      {/* Quick Create Task Modal */}
      {modalMode === "task" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !submitting && setModalMode(null)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f] p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#e8e8e8] dark:border-[#303030] pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Tạo nhanh công việc
              </h3>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateQuickTask} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Dự án <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full rounded-md border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#141414] px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:border-brand focus:outline-none"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.code}] {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Tên công việc <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="Nhập tiêu đề công việc..."
                  className="w-full rounded-md border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#141414] px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:border-brand focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                    Độ ưu tiên
                  </label>
                  <select
                    value={taskPriority}
                    onChange={(e) =>
                      setTaskPriority(e.target.value as TaskPriority)
                    }
                    className="w-full rounded-md border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#141414] px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:border-brand focus:outline-none"
                  >
                    <option value="low">Thấp</option>
                    <option value="medium">Trung bình</option>
                    <option value="high">Cao</option>
                    <option value="urgent">Khẩn cấp</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                    Hạn hoàn thành
                  </label>
                  <input
                    type="date"
                    value={taskDueDate}
                    onChange={(e) => setTaskDueDate(e.target.value)}
                    className="w-full rounded-md border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#141414] px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:border-brand focus:outline-none"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 pt-1 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={assignToMe}
                  onChange={(e) => setAssignToMe(e.target.checked)}
                  className="rounded border-slate-300 text-brand accent-brand"
                />
                <span>Giao trực tiếp cho tôi</span>
              </label>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#e8e8e8] dark:border-[#303030]">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  className="rounded-md border border-slate-200 dark:border-[#3a3a3a] px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-hover disabled:opacity-50 cursor-pointer"
                >
                  {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Tạo công việc</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Create Project Modal */}
      {modalMode === "project" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !submitting && setModalMode(null)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f] p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#e8e8e8] dark:border-[#303030] pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Tạo nhanh dự án
              </h3>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateQuickProject} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Tên dự án / Đầu sách <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={projName}
                  onChange={(e) => {
                    setProjName(e.target.value);
                    setProjCode(generateProjectCode(e.target.value));
                  }}
                  placeholder="VD: Tư Duy Nhanh Và Chậm"
                  className="w-full rounded-md border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#141414] px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:border-brand focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                    Mã dự án
                  </label>
                  <input
                    type="text"
                    value={projCode}
                    onChange={(e) => setProjCode(e.target.value.toUpperCase())}
                    maxLength={12}
                    className="w-full rounded-md border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#141414] px-2.5 py-1.5 font-mono text-xs uppercase text-slate-900 dark:text-slate-100 focus:border-brand focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                    Hạn dự kiến
                  </label>
                  <input
                    type="date"
                    value={projDueDate}
                    onChange={(e) => setProjDueDate(e.target.value)}
                    className="w-full rounded-md border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#141414] px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:border-brand focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#e8e8e8] dark:border-[#303030]">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  className="rounded-md border border-slate-200 dark:border-[#3a3a3a] px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-hover disabled:opacity-50 cursor-pointer"
                >
                  {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Tạo dự án</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Create Personal Todo Modal */}
      {modalMode === "todo" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !submitting && setModalMode(null)}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f] p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#e8e8e8] dark:border-[#303030] pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Thêm Todo cá nhân
              </h3>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateQuickTodo} className="mt-4 space-y-3">
              <div>
                <input
                  type="text"
                  required
                  autoFocus
                  value={todoTitle}
                  onChange={(e) => setTodoTitle(e.target.value)}
                  placeholder="Nhập việc cá nhân cần ghi nhớ..."
                  className="w-full rounded-md border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#141414] px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:border-brand focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  className="rounded-md border border-slate-200 dark:border-[#3a3a3a] px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-hover disabled:opacity-50 cursor-pointer"
                >
                  {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Lưu Todo</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
