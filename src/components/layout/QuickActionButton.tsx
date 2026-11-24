"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar as CalendarIcon,
  Check,
  CheckSquare,
  Clock,
  FolderPlus,
  ListTodo,
  Loader2,
  Plus,
  Search,
  Tag,
  User,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  cn,
  formatDateVi,
  generateProjectCode,
  getInitials,
  PRIORITY_CONFIG,
} from "@/lib/utils";
import {
  getTodoCategoryConfig,
  TODO_CATEGORIES,
} from "@/components/home/PersonalTodoManager";
import type {
  PersonalTodo,
  PersonalTodoCategory,
  Profile,
  Task,
  TaskPriority,
  TaskStatus,
} from "@/types/database";

interface QuickActionButtonProps {
  currentUser: Profile;
}

type ModalMode = "task" | "project" | "todo" | null;
type TaskModalTab = "new" | "unassigned";

interface SimpleProject {
  id: string;
  name: string;
  code: string;
  color: string;
  project_type?: "publishing" | "operational";
}

interface UnassignedTaskItem {
  id: string;
  title: string;
  priority: TaskPriority;
  due_date: string | null;
}

function getTodayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getTomorrowString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function QuickActionButton({ currentUser }: QuickActionButtonProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const menuRef = useRef<HTMLDivElement>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>(null);

  // Common metadata
  const [projects, setProjects] = useState<SimpleProject[]>([]);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // ==========================================
  // TASK CREATION / ASSIGNMENT STATE
  // ==========================================
  const [taskTab, setTaskTab] = useState<TaskModalTab>("new");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskPriority, setTaskPriority] = useState<TaskPriority>("medium");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [selectedAssignees, setSelectedAssignees] = useState<Profile[]>([
    currentUser,
  ]);
  const [assigneeSearchQuery, setAssigneeSearchQuery] = useState("");
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);
  const assigneeDropdownRef = useRef<HTMLDivElement>(null);

  // Unassigned tasks tab state
  const [unassignedTasks, setUnassignedTasks] = useState<UnassignedTaskItem[]>(
    []
  );
  const [loadingUnassigned, setLoadingUnassigned] = useState(false);
  const [selectedUnassignedTaskId, setSelectedUnassignedTaskId] =
    useState<string>("");
  const [unassignedSearchQuery, setUnassignedSearchQuery] = useState("");

  // ==========================================
  // PROJECT CREATION STATE
  // ==========================================
  const [quickProjType, setQuickProjType] = useState<"publishing" | "operational">("operational");
  const [projName, setProjName] = useState("");
  const [projCode, setProjCode] = useState("");
  const [projDueDate, setProjDueDate] = useState("");

  // ==========================================
  // PERSONAL TODO CREATION STATE (MATCHING TODO 2.0)
  // ==========================================
  const [todoTitle, setTodoTitle] = useState("");
  const [todoCategory, setTodoCategory] =
    useState<PersonalTodoCategory>("work");
  const [todoPriority, setTodoPriority] = useState<TaskPriority>("medium");
  const [todoDueDate, setTodoDueDate] = useState("");
  const [todoNotes, setTodoNotes] = useState("");
  const [showTodoNotes, setShowTodoNotes] = useState(false);

  // Close menus on outside click
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
      if (
        assigneeDropdownRef.current &&
        !assigneeDropdownRef.current.contains(e.target as Node)
      ) {
        setShowAssigneeDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  // Fetch active projects & active profiles when modal opens
  useEffect(() => {
    if (!modalMode) return;
    let active = true;

    async function loadData() {
      const [{ data: pData }, { data: uData }] = await Promise.all([
        supabase
          .from("projects")
          .select("id, name, code, color, project_type")
          .eq("status", "active")
          .order("name", { ascending: true }),
        supabase
          .from("profiles")
          .select("*")
          .eq("is_active", true)
          .order("full_name", { ascending: true }),
      ]);

      if (!active) return;

      if (pData) {
        const list = pData as SimpleProject[];
        setProjects(list);
        if (list.length > 0 && !selectedProjectId && taskTab === "unassigned") {
          setSelectedProjectId(list[0].id);
        }
      }
      if (uData) {
        setAllProfiles(uData as Profile[]);
      }
    }

    loadData();
    return () => {
      active = false;
    };
  }, [modalMode, supabase, selectedProjectId]);

  // Fetch unassigned tasks whenever project changes or unassigned tab is active
  useEffect(() => {
    if (modalMode !== "task" || taskTab !== "unassigned" || !selectedProjectId)
      return;

    let active = true;
    async function loadUnassigned() {
      setLoadingUnassigned(true);
      try {
        const { data: rawTasks } = await supabase
          .from("tasks")
          .select("id, title, priority, due_date")
          .eq("project_id", selectedProjectId)
          .is("completed_at", null)
          .order("created_at", { ascending: false })
          .limit(60);

        if (!active || !rawTasks) return;

        const taskIds = rawTasks.map((t) => t.id);
        if (taskIds.length === 0) {
          setUnassignedTasks([]);
          setSelectedUnassignedTaskId("");
          return;
        }

        const { data: assignees } = await supabase
          .from("task_assignees")
          .select("task_id")
          .in("task_id", taskIds);

        const assignedSet = new Set((assignees || []).map((a) => a.task_id));
        const unassignedList = (rawTasks as UnassignedTaskItem[]).filter(
          (t) => !assignedSet.has(t.id)
        );

        if (active) {
          setUnassignedTasks(unassignedList);
          if (unassignedList.length > 0) {
            setSelectedUnassignedTaskId(unassignedList[0].id);
            setTaskPriority(unassignedList[0].priority || "medium");
            setTaskDueDate(
              unassignedList[0].due_date
                ? unassignedList[0].due_date.slice(0, 10)
                : ""
            );
          } else {
            setSelectedUnassignedTaskId("");
          }
        }
      } catch {
        // quiet error
      } finally {
        if (active) setLoadingUnassigned(false);
      }
    }

    loadUnassigned();
    return () => {
      active = false;
    };
  }, [modalMode, taskTab, selectedProjectId, supabase]);

  // Filter profiles for assignees picker
  const filteredProfiles = useMemo(() => {
    const selectedIds = new Set(selectedAssignees.map((a) => a.id));
    const available = allProfiles.filter((p) => !selectedIds.has(p.id));
    if (!assigneeSearchQuery.trim()) return available;
    const q = assigneeSearchQuery.toLowerCase();
    return available.filter(
      (p) =>
        p.full_name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        (p.job_title && p.job_title.toLowerCase().includes(q))
    );
  }, [allProfiles, selectedAssignees, assigneeSearchQuery]);

  // Filter unassigned tasks
  const filteredUnassignedTasks = useMemo(() => {
    if (!unassignedSearchQuery.trim()) return unassignedTasks;
    const q = unassignedSearchQuery.toLowerCase();
    return unassignedTasks.filter((t) => t.title.toLowerCase().includes(q));
  }, [unassignedTasks, unassignedSearchQuery]);

  // Toggle user in assignees
  function handleAddAssignee(user: Profile) {
    setSelectedAssignees((prev) => [...prev, user]);
    setAssigneeSearchQuery("");
  }

  function handleRemoveAssignee(userId: string) {
    setSelectedAssignees((prev) => prev.filter((u) => u.id !== userId));
  }

  function handleAssignOnlyMe() {
    setSelectedAssignees([currentUser]);
    setShowAssigneeDropdown(false);
  }

  // ==========================================
  // ACTION: CREATE NEW TASK
  // ==========================================
  async function handleCreateQuickTask(e: React.FormEvent) {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    setSubmitting(true);
    try {
      const statusQuery = selectedProjectId
        ? supabase
            .from("task_statuses")
            .select("*")
            .eq("project_id", selectedProjectId)
            .order("position", { ascending: true })
        : supabase
            .from("task_statuses")
            .select("*")
            .is("project_id", null)
            .order("position", { ascending: true });

      const { data: statusData } = await statusQuery;

      const statuses = (statusData ?? []) as TaskStatus[];
      const todoStatus =
        statuses.find((s) => s.category === "todo") ?? statuses[0] ?? null;

      const { data: newTask, error } = await supabase
        .from("tasks")
        .insert({
          project_id: selectedProjectId || null,
          status_id: todoStatus?.id ?? null,
          title: taskTitle.trim(),
          priority: taskPriority,
          due_date: taskDueDate || null,
          position: 0,
          created_by: currentUser.id,
        })
        .select("id, project_id, title, priority, due_date, status_id")
        .single();

      if (error || !newTask) throw error;

      // Insert Assignees
      if (selectedAssignees.length > 0) {
        const assigneeRows = selectedAssignees.map((u) => ({
          task_id: newTask.id,
          user_id: u.id,
          assigned_by: currentUser.id,
        }));
        await supabase.from("task_assignees").insert(assigneeRows);

        // Auto-add assignees to project_members only if task is part of a project
        if (selectedProjectId) {
          for (const u of selectedAssignees) {
            await supabase.from("project_members").upsert(
              {
                project_id: selectedProjectId,
                user_id: u.id,
                role: "member",
              },
              { onConflict: "project_id,user_id" }
            );
          }
        }
      }

      const enrichedTask: Task = {
        ...(newTask as Task),
        status: todoStatus,
        project: selectedProjectId
          ? (projects.find((p) => p.id === selectedProjectId) ?? null)
          : null,
        assignees: selectedAssignees,
      };

      window.dispatchEvent(
        new CustomEvent("alpha:task_created", { detail: enrichedTask })
      );

      toast.success("Đã tạo công việc mới!");
      setTaskTitle("");
      setTaskDueDate("");
      setSelectedAssignees([currentUser]);
      setModalMode(null);
      router.refresh();
    } catch {
      toast.error("Không thể tạo công việc lúc này.");
    } finally {
      setSubmitting(false);
    }
  }

  // ==========================================
  // ACTION: ASSIGN FROM UNASSIGNED TASK
  // ==========================================
  async function handleAssignUnassignedTask(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUnassignedTaskId || !selectedProjectId) return;
    if (selectedAssignees.length === 0) {
      toast.error("Vui lòng chọn ít nhất 1 người nhận công việc.");
      return;
    }

    setSubmitting(true);
    try {
      // 1. Update task's priority and due_date if changed
      await supabase
        .from("tasks")
        .update({
          priority: taskPriority,
          due_date: taskDueDate || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedUnassignedTaskId);

      // 2. Insert assignees
      const assigneeRows = selectedAssignees.map((u) => ({
        task_id: selectedUnassignedTaskId,
        user_id: u.id,
        assigned_by: currentUser.id,
      }));
      await supabase.from("task_assignees").insert(assigneeRows);

      // 3. Auto-add to project_members
      for (const u of selectedAssignees) {
        await supabase.from("project_members").upsert(
          {
            project_id: selectedProjectId,
            user_id: u.id,
            role: "member",
          },
          { onConflict: "project_id,user_id" }
        );
      }

      toast.success("Đã phân công việc thành công!");
      setModalMode(null);
      router.refresh();
    } catch {
      toast.error("Không thể phân công việc.");
    } finally {
      setSubmitting(false);
    }
  }

  // ==========================================
  // ACTION: CREATE QUICK PROJECT
  // ==========================================
  async function handleCreateQuickProject(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = projName.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      const code = (
        projCode.trim() || generateProjectCode(trimmed)
      ).toUpperCase();
      const { data: newProj, error } = await supabase
        .from("projects")
        .insert({
          name: trimmed,
          code,
          project_type: quickProjType,
          category: quickProjType === "operational" ? "Vận hành" : "Sách Quản trị & Kinh doanh",
          delivery_confidence: "on_track",
          color: quickProjType === "operational" ? "#3B82F6" : "#F47830",
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

  // ==========================================
  // ACTION: CREATE QUICK PERSONAL TODO (TODO 2.0)
  // ==========================================
  async function handleCreateQuickTodo(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = todoTitle.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      const payload = {
        user_id: currentUser.id,
        title: trimmed,
        notes: todoNotes.trim() || null,
        priority: todoPriority,
        category: todoCategory,
        due_date: todoDueDate || null,
        is_done: false,
        position: 0,
      };

      const { data, error } = await supabase
        .from("personal_todos")
        .insert(payload)
        .select("*")
        .single();

      if (error || !data) throw error;

      window.dispatchEvent(
        new CustomEvent("alpha:todo_created", { detail: data })
      );

      toast.success("Đã thêm vào Todo cá nhân!");
      setTodoTitle("");
      setTodoNotes("");
      setTodoDueDate("");
      setShowTodoNotes(false);
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
      {/* Header pill button: Orange circle (+) + "Tạo mới" */}
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

      {/* Dropdown Options */}
      {menuOpen && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-48 rounded-lg border border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f] p-1 shadow-lg">
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setTaskTab("new");
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

      {/* ====================================================================
       * MODAL 1: NEW TASK (UPGRADED DUAL-TAB LIKE WORLENZ ORIGINAL)
       * ==================================================================== */}
      {modalMode === "task" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !submitting && setModalMode(null)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#e8e8e8] dark:border-[#303030]">
              <h3 className="text-[15px] font-bold text-slate-900 dark:text-slate-100">
                {taskTab === "new"
                  ? "Tạo nhanh công việc"
                  : "Phân công việc chưa gán"}
              </h3>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Worklenz Dual Segment Tabs: New Task / From Unassigned */}
            <div className="mt-3.5 grid grid-cols-2 rounded-lg border border-[#e0e0e0] dark:border-[#383838] p-0.5 bg-[#f6f6f6] dark:bg-[#161616]">
              <button
                type="button"
                onClick={() => setTaskTab("new")}
                className={cn(
                  "rounded-md py-1.5 text-xs font-semibold transition cursor-pointer text-center",
                  taskTab === "new"
                    ? "bg-brand text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                Tạo việc mới (New Task)
              </button>
              <button
                type="button"
                onClick={() => setTaskTab("unassigned")}
                className={cn(
                  "rounded-md py-1.5 text-xs font-semibold transition cursor-pointer text-center",
                  taskTab === "unassigned"
                    ? "bg-brand text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                Từ việc chưa gán (From Unassigned)
              </button>
            </div>

            {/* TAB 1: CREATE NEW TASK */}
            {taskTab === "new" && (
              <form onSubmit={handleCreateQuickTask} className="mt-4 space-y-3.5">
                {/* Project Selection */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Dự án / Danh sách việc
                    </label>
                    <span className="text-[11px] text-slate-400">
                      {selectedProjectId ? "Gắn vào dự án" : "Việc độc lập / Giao nhanh"}
                    </span>
                  </div>
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="w-full rounded-md border border-[#d9d9d9] dark:border-[#3a3a3a] bg-white dark:bg-[#141414] px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:border-brand focus:outline-none cursor-pointer"
                  >
                    <option value="">-- Không thuộc dự án (Việc độc lập / Giao việc nhanh) --</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        [{p.code}] {p.name} {p.project_type === "operational" ? "📋 (Vận hành)" : "📚 (Xuất bản)"}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Task Name */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Tên công việc <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder="+ Thêm tên công việc..."
                    className="w-full rounded-md border border-[#d9d9d9] dark:border-[#3a3a3a] bg-white dark:bg-[#141414] px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:border-brand focus:outline-none"
                  />
                </div>

                {/* Due Date & Priority Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Hạn hoàn thành (Due Date)
                    </label>
                    <div className="relative">
                      <input
                        type="date"
                        value={taskDueDate}
                        onChange={(e) => setTaskDueDate(e.target.value)}
                        className="w-full rounded-md border border-[#d9d9d9] dark:border-[#3a3a3a] bg-white dark:bg-[#141414] px-3 py-2 font-mono text-xs text-slate-900 dark:text-slate-100 focus:border-brand focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Độ ưu tiên (Priority)
                    </label>
                    <select
                      value={taskPriority}
                      onChange={(e) =>
                        setTaskPriority(e.target.value as TaskPriority)
                      }
                      className="w-full rounded-md border border-[#d9d9d9] dark:border-[#3a3a3a] bg-white dark:bg-[#141414] px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:border-brand focus:outline-none"
                    >
                      <option value="low">Thấp</option>
                      <option value="medium">Trung bình</option>
                      <option value="high">Cao</option>
                      <option value="urgent">Khẩn cấp</option>
                    </select>
                  </div>
                </div>

                {/* Full Assignees Multi-select with Search & Chips */}
                <div className="relative" ref={assigneeDropdownRef}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Người thực hiện (Assignees)
                    </label>
                    {!selectedAssignees.some((a) => a.id === currentUser.id) && (
                      <button
                        type="button"
                        onClick={handleAssignOnlyMe}
                        className="text-[11px] font-medium text-brand hover:underline cursor-pointer"
                      >
                        + Gán cho tôi
                      </button>
                    )}
                  </div>

                  {/* Assignee Input & Active Chips Box */}
                  <div
                    onClick={() => setShowAssigneeDropdown(true)}
                    className="min-h-[38px] w-full rounded-md border border-[#d9d9d9] dark:border-[#3a3a3a] bg-white dark:bg-[#141414] p-1.5 flex flex-wrap items-center gap-1.5 cursor-text"
                  >
                    {selectedAssignees.map((user) => (
                      <span
                        key={user.id}
                        className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft dark:bg-brand-soft-dark border border-brand/20 px-2 py-0.5 text-xs font-medium text-brand"
                      >
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand text-[9px] font-bold text-white">
                          {getInitials(user.full_name)}
                        </span>
                        <span>{user.full_name}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveAssignee(user.id);
                          }}
                          className="hover:text-red-500 cursor-pointer"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}

                    <input
                      type="text"
                      value={assigneeSearchQuery}
                      onChange={(e) => {
                        setAssigneeSearchQuery(e.target.value);
                        setShowAssigneeDropdown(true);
                      }}
                      onFocus={() => setShowAssigneeDropdown(true)}
                      placeholder={
                        selectedAssignees.length === 0
                          ? "Tìm theo tên hoặc email để phân công..."
                          : "Thêm người khác..."
                      }
                      className="flex-1 min-w-[130px] border-none bg-transparent px-1.5 py-0.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none"
                    />
                  </div>

                  {/* Assignees Dropdown List */}
                  {showAssigneeDropdown && (
                    <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-48 overflow-y-auto rounded-lg border border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f] p-1 shadow-lg divide-y divide-[#f0f0f0] dark:divide-[#2a2a2a]">
                      {filteredProfiles.length === 0 ? (
                        <p className="p-2 text-center text-xs text-slate-400">
                          Không tìm thấy nhân sự nào.
                        </p>
                      ) : (
                        filteredProfiles.map((user) => (
                          <button
                            key={user.id}
                            type="button"
                            onClick={() => handleAddAssignee(user)}
                            className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-[#282828] rounded-md transition cursor-pointer"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700 text-[9px] font-bold text-slate-700 dark:text-slate-200">
                                {getInitials(user.full_name)}
                              </span>
                              <div className="truncate">
                                <p className="truncate text-xs font-medium text-slate-800 dark:text-slate-200">
                                  {user.full_name}
                                </p>
                                <p className="truncate text-[10.5px] text-slate-400">
                                  {user.job_title || user.email}
                                </p>
                              </div>
                            </div>
                            <Plus className="h-3.5 w-3.5 text-slate-400" />
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Submit Actions */}
                <div className="flex justify-end gap-2 pt-3 border-t border-[#e8e8e8] dark:border-[#303030]">
                  <button
                    type="button"
                    onClick={() => setModalMode(null)}
                    className="rounded-md border border-[#d9d9d9] dark:border-[#3a3a3a] px-3.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !taskTitle.trim()}
                    className="inline-flex items-center gap-1.5 rounded-md bg-brand px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-hover disabled:opacity-50 cursor-pointer transition shadow-sm"
                  >
                    {submitting && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    )}
                    <span>Tạo công việc (Create Task)</span>
                  </button>
                </div>
              </form>
            )}

            {/* TAB 2: ASSIGN FROM UNASSIGNED TASK */}
            {taskTab === "unassigned" && (
              <form
                onSubmit={handleAssignUnassignedTask}
                className="mt-4 space-y-3.5"
              >
                {/* Project Selection */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Dự án / Danh sách việc
                    </label>
                    <span className="text-[11px] text-slate-400">
                      {selectedProjectId ? "Gắn vào dự án" : "Việc độc lập / Giao nhanh"}
                    </span>
                  </div>
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="w-full rounded-md border border-[#d9d9d9] dark:border-[#3a3a3a] bg-white dark:bg-[#141414] px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:border-brand focus:outline-none cursor-pointer"
                  >
                    <option value="">-- Không thuộc dự án (Việc độc lập / Giao việc nhanh) --</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        [{p.code}] {p.name} {p.project_type === "operational" ? "📋 (Vận hành)" : "📚 (Xuất bản)"}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Unassigned Task Select / Search */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Công việc chưa có người nhận (Unassigned Task){" "}
                    <span className="text-red-500">*</span>
                  </label>

                  {loadingUnassigned ? (
                    <div className="flex items-center gap-2 p-3 text-xs text-slate-400">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />
                      <span>Đang tải danh sách việc chưa gán...</span>
                    </div>
                  ) : unassignedTasks.length === 0 ? (
                    <div className="rounded-md border border-dashed border-slate-300 dark:border-slate-700 p-4 text-center">
                      <CheckSquare className="mx-auto h-5 w-5 text-emerald-500 mb-1" />
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        Tuyệt vời! Không còn việc nào tồn đọng chưa gán trong dự
                        án này.
                      </p>
                      <button
                        type="button"
                        onClick={() => setTaskTab("new")}
                        className="mt-2 text-xs font-semibold text-brand hover:underline cursor-pointer"
                      >
                        + Tạo việc mới ngay
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input
                          type="text"
                          value={unassignedSearchQuery}
                          onChange={(e) =>
                            setUnassignedSearchQuery(e.target.value)
                          }
                          placeholder="Tìm nhanh việc chưa gán..."
                          className="w-full rounded-md border border-[#d9d9d9] dark:border-[#3a3a3a] bg-white dark:bg-[#141414] pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:border-brand focus:outline-none"
                        />
                      </div>

                      <select
                        required
                        value={selectedUnassignedTaskId}
                        onChange={(e) => {
                          setSelectedUnassignedTaskId(e.target.value);
                          const found = unassignedTasks.find(
                            (t) => t.id === e.target.value
                          );
                          if (found) {
                            setTaskPriority(found.priority || "medium");
                            setTaskDueDate(
                              found.due_date ? found.due_date.slice(0, 10) : ""
                            );
                          }
                        }}
                        className="w-full rounded-md border border-[#d9d9d9] dark:border-[#3a3a3a] bg-white dark:bg-[#141414] px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:border-brand focus:outline-none"
                      >
                        {filteredUnassignedTasks.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.title}{" "}
                            {t.due_date
                              ? `(Hạn: ${formatDateVi(t.due_date)})`
                              : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Due Date & Priority Grid */}
                {unassignedTasks.length > 0 && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                        Cập nhật Hạn hoàn thành
                      </label>
                      <input
                        type="date"
                        value={taskDueDate}
                        onChange={(e) => setTaskDueDate(e.target.value)}
                        className="w-full rounded-md border border-[#d9d9d9] dark:border-[#3a3a3a] bg-white dark:bg-[#141414] px-3 py-2 font-mono text-xs text-slate-900 dark:text-slate-100 focus:border-brand focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                        Cập nhật Độ ưu tiên
                      </label>
                      <select
                        value={taskPriority}
                        onChange={(e) =>
                          setTaskPriority(e.target.value as TaskPriority)
                        }
                        className="w-full rounded-md border border-[#d9d9d9] dark:border-[#3a3a3a] bg-white dark:bg-[#141414] px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:border-brand focus:outline-none"
                      >
                        <option value="low">Thấp</option>
                        <option value="medium">Trung bình</option>
                        <option value="high">Cao</option>
                        <option value="urgent">Khẩn cấp</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* Assignees to allocate */}
                {unassignedTasks.length > 0 && (
                  <div className="relative" ref={assigneeDropdownRef}>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                        Chỉ định người nhận việc (Assignees){" "}
                        <span className="text-red-500">*</span>
                      </label>
                      {!selectedAssignees.some(
                        (a) => a.id === currentUser.id
                      ) && (
                        <button
                          type="button"
                          onClick={handleAssignOnlyMe}
                          className="text-[11px] font-medium text-brand hover:underline cursor-pointer"
                        >
                          + Nhận việc này (Claim task)
                        </button>
                      )}
                    </div>

                    <div
                      onClick={() => setShowAssigneeDropdown(true)}
                      className="min-h-[38px] w-full rounded-md border border-[#d9d9d9] dark:border-[#3a3a3a] bg-white dark:bg-[#141414] p-1.5 flex flex-wrap items-center gap-1.5 cursor-text"
                    >
                      {selectedAssignees.map((user) => (
                        <span
                          key={user.id}
                          className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft dark:bg-brand-soft-dark border border-brand/20 px-2 py-0.5 text-xs font-medium text-brand"
                        >
                          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand text-[9px] font-bold text-white">
                            {getInitials(user.full_name)}
                          </span>
                          <span>{user.full_name}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveAssignee(user.id);
                            }}
                            className="hover:text-red-500 cursor-pointer"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}

                      <input
                        type="text"
                        value={assigneeSearchQuery}
                        onChange={(e) => {
                          setAssigneeSearchQuery(e.target.value);
                          setShowAssigneeDropdown(true);
                        }}
                        onFocus={() => setShowAssigneeDropdown(true)}
                        placeholder="Tìm nhân sự để giao việc..."
                        className="flex-1 min-w-[130px] border-none bg-transparent px-1.5 py-0.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none"
                      />
                    </div>

                    {showAssigneeDropdown && (
                      <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-48 overflow-y-auto rounded-lg border border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f] p-1 shadow-lg divide-y divide-[#f0f0f0] dark:divide-[#2a2a2a]">
                        {filteredProfiles.map((user) => (
                          <button
                            key={user.id}
                            type="button"
                            onClick={() => handleAddAssignee(user)}
                            className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-[#282828] rounded-md transition cursor-pointer"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700 text-[9px] font-bold text-slate-700 dark:text-slate-200">
                                {getInitials(user.full_name)}
                              </span>
                              <div className="truncate">
                                <p className="truncate text-xs font-medium text-slate-800 dark:text-slate-200">
                                  {user.full_name}
                                </p>
                                <p className="truncate text-[10.5px] text-slate-400">
                                  {user.job_title || user.email}
                                </p>
                              </div>
                            </div>
                            <Plus className="h-3.5 w-3.5 text-slate-400" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Submit Actions */}
                <div className="flex justify-end gap-2 pt-3 border-t border-[#e8e8e8] dark:border-[#303030]">
                  <button
                    type="button"
                    onClick={() => setModalMode(null)}
                    className="rounded-md border border-[#d9d9d9] dark:border-[#3a3a3a] px-3.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={
                      submitting ||
                      !selectedUnassignedTaskId ||
                      selectedAssignees.length === 0
                    }
                    className="inline-flex items-center gap-1.5 rounded-md bg-brand px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-hover disabled:opacity-50 cursor-pointer transition shadow-sm"
                  >
                    {submitting && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    )}
                    <span>Gán công việc (Assign Task)</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ====================================================================
       * MODAL 2: QUICK CREATE PROJECT
       * ==================================================================== */}
      {modalMode === "project" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !submitting && setModalMode(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f] p-5 shadow-xl"
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
              {/* Project Type Toggle */}
              <div className="flex rounded-lg bg-slate-100 p-1 dark:bg-[#181818]">
                <button
                  type="button"
                  onClick={() => setQuickProjType("operational")}
                  className={`flex-1 rounded-md py-1 text-xs font-semibold transition ${
                    quickProjType === "operational"
                      ? "bg-white text-brand shadow-xs dark:bg-[#252525] dark:text-brand"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  📋 Vận hành / Team
                </button>
                <button
                  type="button"
                  onClick={() => setQuickProjType("publishing")}
                  className={`flex-1 rounded-md py-1 text-xs font-semibold transition ${
                    quickProjType === "publishing"
                      ? "bg-white text-brand shadow-xs dark:bg-[#252525] dark:text-brand"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  📚 Dự án Xuất bản
                </button>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  {quickProjType === "operational"
                    ? "Tên danh sách công việc / Team"
                    : "Tên dự án / Đầu sách"}{" "}
                  <span className="text-red-500">*</span>
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
                  placeholder={
                    quickProjType === "operational"
                      ? "VD: Task Ecom 2026, Task CSKH, Vận hành Marketing..."
                      : "VD: Tư Duy Nhanh Và Chậm"
                  }
                  className="w-full rounded-md border border-[#d9d9d9] dark:border-[#3a3a3a] bg-white dark:bg-[#141414] px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:border-brand focus:outline-none"
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
                    className="w-full rounded-md border border-[#d9d9d9] dark:border-[#3a3a3a] bg-white dark:bg-[#141414] px-2.5 py-1.5 font-mono text-xs uppercase text-slate-900 dark:text-slate-100 focus:border-brand focus:outline-none"
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
                    className="w-full rounded-md border border-[#d9d9d9] dark:border-[#3a3a3a] bg-white dark:bg-[#141414] px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:border-brand focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#e8e8e8] dark:border-[#303030]">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  className="rounded-md border border-[#d9d9d9] dark:border-[#3a3a3a] px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-hover disabled:opacity-50 cursor-pointer"
                >
                  {submitting && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  <span>Tạo dự án</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====================================================================
       * MODAL 3: PERSONAL TODO (RICH GTD COMPOSER SYNCHRONIZED WITH TODO 2.0)
       * ==================================================================== */}
      {modalMode === "todo" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !submitting && setModalMode(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-[#e8e8e8] dark:border-[#303030] bg-white dark:bg-[#1f1f1f] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#e8e8e8] dark:border-[#303030] pb-3">
              <div className="flex items-center gap-2">
                <ListTodo className="h-4 w-4 text-brand" />
                <h3 className="text-[15px] font-bold text-slate-900 dark:text-slate-100">
                  Thêm Todo cá nhân
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateQuickTodo} className="mt-4 space-y-3.5">
              {/* Todo Title */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Việc cần làm <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={todoTitle}
                  onChange={(e) => setTodoTitle(e.target.value)}
                  placeholder="VD: Chuẩn bị tài liệu họp, gọi cho đối tác in ấn..."
                  className="w-full rounded-md border border-[#d9d9d9] dark:border-[#3a3a3a] bg-white dark:bg-[#141414] px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:border-brand focus:outline-none"
                />
              </div>

              {/* Category & Priority Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Phân loại
                  </label>
                  <select
                    value={todoCategory}
                    onChange={(e) =>
                      setTodoCategory(e.target.value as PersonalTodoCategory)
                    }
                    className="w-full rounded-md border border-[#d9d9d9] dark:border-[#3a3a3a] bg-white dark:bg-[#141414] px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 focus:border-brand focus:outline-none"
                  >
                    {(
                      Object.entries(TODO_CATEGORIES) as Array<
                        [PersonalTodoCategory, (typeof TODO_CATEGORIES)["work"]]
                      >
                    ).map(([k, cfg]) => (
                      <option key={k} value={k}>
                        {cfg.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Độ ưu tiên
                  </label>
                  <select
                    value={todoPriority}
                    onChange={(e) =>
                      setTodoPriority(e.target.value as TaskPriority)
                    }
                    className="w-full rounded-md border border-[#d9d9d9] dark:border-[#3a3a3a] bg-white dark:bg-[#141414] px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 focus:border-brand focus:outline-none"
                  >
                    <option value="low">Thấp</option>
                    <option value="medium">Trung bình</option>
                    <option value="high">Cao</option>
                    <option value="urgent">Khẩn cấp</option>
                  </select>
                </div>
              </div>

              {/* Due Date with Quick Presets */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Hạn hoàn thành
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setTodoDueDate(getTodayString())}
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10.5px] font-medium transition cursor-pointer",
                        todoDueDate === getTodayString()
                          ? "bg-brand text-white"
                          : "bg-slate-100 dark:bg-[#2c2c2c] text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                      )}
                    >
                      Hôm nay
                    </button>
                    <button
                      type="button"
                      onClick={() => setTodoDueDate(getTomorrowString())}
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10.5px] font-medium transition cursor-pointer",
                        todoDueDate === getTomorrowString()
                          ? "bg-brand text-white"
                          : "bg-slate-100 dark:bg-[#2c2c2c] text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                      )}
                    >
                      Ngày mai
                    </button>
                  </div>
                </div>
                <div className="relative">
                  <input
                    type="date"
                    value={todoDueDate}
                    onChange={(e) => setTodoDueDate(e.target.value)}
                    className="w-full rounded-md border border-[#d9d9d9] dark:border-[#3a3a3a] bg-white dark:bg-[#141414] px-3 py-1.5 font-mono text-xs text-slate-900 dark:text-slate-100 focus:border-brand focus:outline-none"
                  />
                  {todoDueDate && (
                    <button
                      type="button"
                      onClick={() => setTodoDueDate("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Expandable Notes */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowTodoNotes((v) => !v)}
                  className="text-xs font-medium text-brand hover:underline cursor-pointer"
                >
                  {showTodoNotes ? "- Ẩn ghi chú" : "+ Thêm ghi chú chi tiết"}
                </button>
                {showTodoNotes && (
                  <textarea
                    rows={2}
                    value={todoNotes}
                    onChange={(e) => setTodoNotes(e.target.value)}
                    placeholder="Ghi chú chi tiết, link tài liệu hoặc số điện thoại..."
                    className="mt-1.5 w-full rounded-md border border-[#d9d9d9] dark:border-[#3a3a3a] bg-white dark:bg-[#141414] px-3 py-2 text-xs text-slate-800 dark:text-slate-200 focus:border-brand focus:outline-none"
                  />
                )}
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end gap-2 pt-3 border-t border-[#e8e8e8] dark:border-[#303030]">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  className="rounded-md border border-[#d9d9d9] dark:border-[#3a3a3a] px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting || !todoTitle.trim()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-brand px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-hover disabled:opacity-50 cursor-pointer transition shadow-sm"
                >
                  {submitting && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
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
