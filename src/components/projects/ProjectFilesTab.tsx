"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  FolderArchive,
  Upload,
  Link2,
  HardDrive,
  FileSpreadsheet,
  BookOpen,
  FileText,
  Download,
  Trash2,
  ExternalLink,
  Plus,
  Search,
  Eye,
  X,
  Loader2,
  Check,
  FileCode,
  Image as ImageIcon,
  Paperclip,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { cn, formatDateVi, getInitials } from "@/lib/utils";
import type {
  AttachmentType,
  Profile,
  ProjectFile,
  ProjectLink,
  Task,
  TaskAttachment,
} from "@/types/database";

interface ProjectFilesTabProps {
  projectId: string;
  projectName: string;
  tasks: Task[];
  currentUser: Profile;
  canManageFiles?: boolean;
  onOpenTask?: (taskId: string) => void;
}

const FILE_CATEGORIES = [
  "Tất cả",
  "Bản thảo",
  "Thiết kế bìa/ruột",
  "Giấy phép xuất bản",
  "Hợp đồng",
  "Khác",
] as const;

type FileCategory = (typeof FILE_CATEGORIES)[number];

const LINK_TYPE_META: Record<
  "gdrive" | "gsheet" | "lark" | "other",
  { label: string; icon: typeof HardDrive; colorClass: string; bgClass: string }
> = {
  gdrive: {
    label: "Google Drive",
    icon: HardDrive,
    colorClass: "text-blue-600 dark:text-blue-400",
    bgClass: "bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-900",
  },
  gsheet: {
    label: "Google Sheet",
    icon: FileSpreadsheet,
    colorClass: "text-emerald-600 dark:text-emerald-400",
    bgClass: "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-900",
  },
  lark: {
    label: "Lark Docs",
    icon: BookOpen,
    colorClass: "text-indigo-600 dark:text-indigo-400",
    bgClass: "bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-900",
  },
  other: {
    label: "Liên kết ngoài",
    icon: Link2,
    colorClass: "text-orange-600 dark:text-orange-400",
    bgClass: "bg-orange-50 dark:bg-orange-950/60 border-orange-200 dark:border-orange-900",
  },
};

function formatFileSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ProjectFilesTab({
  projectId,
  projectName,
  tasks,
  currentUser,
  canManageFiles = true,
  onOpenTask,
}: ProjectFilesTabProps) {
  const supabase = useMemo(() => createClient(), []);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sub-tab selection: Tệp dự án vs Kho liên kết vs Tệp từ công việc
  const [activeSection, setActiveSection] = useState<"files" | "links" | "task_attachments">("files");

  // Section 1: Project Files
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<FileCategory>("Tất cả");
  const [fileSearch, setFileSearch] = useState("");
  const [uploadCategory, setUploadCategory] = useState<Exclude<FileCategory, "Tất cả">>("Bản thảo");
  const [isUploading, setIsUploading] = useState(false);

  // Preview Modal
  const [previewFile, setPreviewFile] = useState<ProjectFile | null>(null);

  // Section 2: Project Links
  const [links, setLinks] = useState<ProjectLink[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(true);
  const [showAddLinkForm, setShowAddLinkForm] = useState(false);
  const [newLinkTitle, setNewLinkTitle] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newLinkType, setNewLinkType] = useState<"gdrive" | "gsheet" | "lark" | "other">("gdrive");
  const [savingLink, setSavingLink] = useState(false);

  // Section 3: Aggregated Task Attachments
  interface AggregatedTaskAttachment extends TaskAttachment {
    task?: { id: string; title: string };
  }
  const [taskAttachments, setTaskAttachments] = useState<AggregatedTaskAttachment[]>([]);
  const [loadingTaskAtts, setLoadingTaskAtts] = useState(true);
  const [taskAttSearch, setTaskAttSearch] = useState("");

  // Load project files
  const loadProjectFiles = useCallback(async () => {
    setLoadingFiles(true);
    try {
      const { data, error } = await supabase
        .from("project_files")
        .select("*, uploader:profiles(id, full_name, email, avatar_url)")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setFiles((data ?? []) as ProjectFile[]);
    } catch {
      toast.error("Không thể tải danh sách tệp dự án");
    } finally {
      setLoadingFiles(false);
    }
  }, [supabase, projectId]);

  // Load project links
  const loadProjectLinks = useCallback(async () => {
    setLoadingLinks(true);
    try {
      const { data, error } = await supabase
        .from("project_links")
        .select("*, creator:profiles(id, full_name, email, avatar_url)")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setLinks((data ?? []) as ProjectLink[]);
    } catch {
      toast.error("Không thể tải kho liên kết tài nguyên");
    } finally {
      setLoadingLinks(false);
    }
  }, [supabase, projectId]);

  // Load aggregated task attachments
  const loadTaskAttachments = useCallback(async () => {
    if (tasks.length === 0) {
      setTaskAttachments([]);
      setLoadingTaskAtts(false);
      return;
    }

    setLoadingTaskAtts(true);
    try {
      const taskIds = tasks.map((t) => t.id);
      const { data, error } = await supabase
        .from("task_attachments")
        .select("*, task:tasks(id, title)")
        .in("task_id", taskIds)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTaskAttachments((data ?? []) as AggregatedTaskAttachment[]);
    } catch {
      toast.error("Không thể tải tài liệu từ các công việc con");
    } finally {
      setLoadingTaskAtts(false);
    }
  }, [supabase, tasks]);

  useEffect(() => {
    loadProjectFiles();
    loadProjectLinks();
    loadTaskAttachments();
  }, [loadProjectFiles, loadProjectLinks, loadTaskAttachments]);

  // Handle Upload Project File
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!canManageFiles) {
      toast.error("Bạn không có quyền tải tệp lên dự án này.");
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      toast.error("Kích thước tệp vượt quá giới hạn 50MB");
      return;
    }

    setIsUploading(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const storagePath = `project-files/${projectId}/${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("attachments")
        .upload(storagePath, file, { upsert: false });

      if (uploadErr) throw new Error(uploadErr.message);

      const { data: urlData } = supabase.storage
        .from("attachments")
        .getPublicUrl(storagePath);

      const { data: row, error: dbError } = await supabase
        .from("project_files")
        .insert({
          project_id: projectId,
          name: file.name,
          file_url: urlData.publicUrl,
          storage_path: storagePath,
          file_size: file.size,
          category: uploadCategory,
          uploaded_by: currentUser.id,
        })
        .select("*, uploader:profiles(id, full_name, email, avatar_url)")
        .single();

      if (dbError || !row) throw new Error(dbError?.message || "Lỗi lưu thông tin tệp");

      setFiles((prev) => [row as ProjectFile, ...prev]);
      toast.success(`Đã tải lên tệp "${file.name}" vào danh mục [${uploadCategory}]`);
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? `Lỗi: ${err.message}` : "Không thể tải lên tệp dự án"
      );
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // Handle Delete Project File
  async function handleDeleteFile(file: ProjectFile) {
    if (!canManageFiles) {
      toast.error("Bạn không có quyền xóa tệp của dự án này.");
      return;
    }
    if (!confirm(`Bạn có chắc muốn xóa tệp "${file.name}" khỏi dự án không?`)) {
      return;
    }

    try {
      if (file.storage_path) {
        await supabase.storage.from("attachments").remove([file.storage_path]);
      }
      const { error } = await supabase
        .from("project_files")
        .delete()
        .eq("id", file.id);

      if (error) throw error;
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
      toast.success(`Đã xóa tệp "${file.name}"`);
    } catch {
      toast.error("Không thể xóa tệp");
    }
  }

  // Handle Add Project Link
  async function handleAddLink(e: React.FormEvent) {
    e.preventDefault();
    if (!canManageFiles) {
      toast.error("Bạn không có quyền thêm liên kết tài liệu cho dự án này.");
      return;
    }
    const title = newLinkTitle.trim();
    let url = newLinkUrl.trim();
    if (!title || !url) {
      toast.error("Vui lòng nhập tên tài liệu và đường dẫn liên kết");
      return;
    }

    if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`;
    }

    setSavingLink(true);
    try {
      const { data, error } = await supabase
        .from("project_links")
        .insert({
          project_id: projectId,
          title,
          url,
          link_type: newLinkType,
          created_by: currentUser.id,
        })
        .select("*, creator:profiles(id, full_name, email, avatar_url)")
        .single();

      if (error || !data) throw error;

      setLinks((prev) => [data as ProjectLink, ...prev]);
      setNewLinkTitle("");
      setNewLinkUrl("");
      setShowAddLinkForm(false);
      toast.success("Đã ghim liên kết tài nguyên thành công!");
    } catch {
      toast.error("Không thể thêm liên kết");
    } finally {
      setSavingLink(false);
    }
  }

  // Handle Delete Project Link
  async function handleDeleteLink(link: ProjectLink) {
    if (!canManageFiles) {
      toast.error("Bạn không có quyền xóa liên kết tài liệu của dự án này.");
      return;
    }
    if (!confirm(`Bạn có chắc muốn gỡ bỏ liên kết "${link.title}"?`)) return;

    try {
      const { error } = await supabase
        .from("project_links")
        .delete()
        .eq("id", link.id);

      if (error) throw error;
      setLinks((prev) => prev.filter((l) => l.id !== link.id));
      toast.success("Đã xóa liên kết");
    } catch {
      toast.error("Không thể xóa liên kết");
    }
  }

  // Filtered files
  const filteredFiles = useMemo(() => {
    return files.filter((f) => {
      const matchCat =
        selectedCategory === "Tất cả" || f.category === selectedCategory;
      const q = fileSearch.trim().toLowerCase();
      const matchSearch =
        !q ||
        f.name.toLowerCase().includes(q) ||
        (f.uploader?.full_name ?? "").toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [files, selectedCategory, fileSearch]);

  // Filtered task attachments
  const filteredTaskAttachments = useMemo(() => {
    const q = taskAttSearch.trim().toLowerCase();
    if (!q) return taskAttachments;
    return taskAttachments.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.task?.title ?? "").toLowerCase().includes(q)
    );
  }, [taskAttachments, taskAttSearch]);

  function isImage(filename: string): boolean {
    return /\.(jpe?g|png|gif|webp|svg)$/i.test(filename);
  }

  function isPdf(filename: string): boolean {
    return /\.pdf$/i.test(filename);
  }

  return (
    <div className="space-y-6">
      {/* Top Navigation Tabs */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveSection("files")}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition cursor-pointer",
              activeSection === "files"
                ? "bg-brand text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            )}
          >
            <FolderArchive className="h-4 w-4" />
            Tệp dự án tải lên ({files.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveSection("links")}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition cursor-pointer",
              activeSection === "links"
                ? "bg-brand text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            )}
          >
            <Link2 className="h-4 w-4" />
            Kho Liên kết dùng chung ({links.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveSection("task_attachments")}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition cursor-pointer",
              activeSection === "task_attachments"
                ? "bg-brand text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            )}
          >
            <Paperclip className="h-4 w-4" />
            Tổng hợp tệp từ các Task ({taskAttachments.length})
          </button>
        </div>

        {/* Section Action Trigger */}
        {activeSection === "files" && canManageFiles && (
          <div className="flex items-center gap-2">
            <select
              value={uploadCategory}
              onChange={(e) =>
                setUploadCategory(e.target.value as Exclude<FileCategory, "Tất cả">)
              }
              aria-label="Danh mục tải lên"
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
            >
              <option value="Bản thảo">Bản thảo</option>
              <option value="Thiết kế bìa/ruột">Thiết kế bìa/ruột</option>
              <option value="Giấy phép xuất bản">Giấy phép xuất bản</option>
              <option value="Hợp đồng">Hợp đồng</option>
              <option value="Khác">Khác</option>
            </select>

            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileUpload}
              className="hidden"
            />

            <button
              type="button"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-brand-hover disabled:opacity-50 cursor-pointer"
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Tải tệp lên
            </button>
          </div>
        )}

        {activeSection === "links" && canManageFiles && (
          <button
            type="button"
            onClick={() => setShowAddLinkForm((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-brand-hover cursor-pointer"
          >
            {showAddLinkForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showAddLinkForm ? "Đóng" : "Ghim liên kết mới"}
          </button>
        )}
      </div>

      {/* =====================================================================
       * MỤC 1: TỆP DỰ ÁN TẢI LÊN (PROJECT FILES)
       * =================================================================== */}
      {activeSection === "files" && (
        <div className="space-y-4">
          {/* Category Filter Chips & Search Bar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-1.5">
              {FILE_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer",
                    selectedCategory === cat
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                      : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={fileSearch}
                onChange={(e) => setFileSearch(e.target.value)}
                placeholder="Tìm tên tệp hoặc người tải..."
                className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 sm:w-64"
              />
            </div>
          </div>

          {/* Files Grid / Table */}
          {loadingFiles ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-brand" />
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
                <FolderArchive className="h-6 w-6" />
              </div>
              <h4 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200">
                Chưa có tệp nào trong mục này
              </h4>
              <p className="mt-1 text-xs text-slate-400">
                Chọn danh mục phía trên và nhấn nút Tải tệp lên để lưu trữ tài liệu dự án
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {filteredFiles.map((file) => {
                const isImg = isImage(file.name);
                const isPdfDoc = isPdf(file.name);

                return (
                  <div
                    key={file.id}
                    className="group flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-brand/50 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div>
                      {/* Top Meta: Category & Extension */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded-md bg-orange-50 px-2 py-0.5 text-[11px] font-bold text-brand border border-orange-200/60 dark:bg-orange-950/40 dark:border-orange-900">
                          {file.category}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400">
                          {formatFileSize(file.file_size)}
                        </span>
                      </div>

                      {/* File Icon & Name */}
                      <div className="mt-3 flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {isImg ? (
                            <ImageIcon className="h-5 w-5 text-indigo-500" />
                          ) : isPdfDoc ? (
                            <FileText className="h-5 w-5 text-red-500" />
                          ) : (
                            <FileCode className="h-5 w-5 text-slate-500" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4
                            title={file.name}
                            className="truncate text-sm font-bold text-slate-900 dark:text-slate-100"
                          >
                            {file.name}
                          </h4>
                          <p className="mt-0.5 text-[11px] text-slate-400">
                            Tải lên {formatDateVi(file.created_at)} bởi{" "}
                            <span className="font-medium text-slate-600 dark:text-slate-300">
                              {file.uploader?.full_name || "Ẩn danh"}
                            </span>
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Actions Toolbar */}
                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                      <div className="flex items-center gap-1.5">
                        {/* Preview button for images/pdf */}
                        {(isImg || isPdfDoc) && (
                          <button
                            type="button"
                            onClick={() => setPreviewFile(file)}
                            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Xem trước
                          </button>
                        )}

                        <a
                          href={file.file_url}
                          target="_blank"
                          rel="noreferrer"
                          download={file.name}
                          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-soft dark:hover:bg-brand/10 cursor-pointer"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Tải về
                        </a>
                      </div>

                      {canManageFiles && (
                        <button
                          type="button"
                          onClick={() => handleDeleteFile(file)}
                          title="Xóa tệp"
                          className="rounded-lg p-1.5 text-slate-400 opacity-60 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
       * MỤC 2: KHO LIÊN KẾT DÙNG CHUNG (PROJECT LINKS HUB)
       * =================================================================== */}
      {activeSection === "links" && (
        <div className="space-y-4">
          {/* Add Link Form */}
          {showAddLinkForm && (
            <form
              onSubmit={handleAddLink}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Ghim liên kết tài nguyên dùng chung cho toàn bộ dự án
              </h4>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
                <div className="sm:col-span-3">
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Loại liên kết
                  </label>
                  <select
                    value={newLinkType}
                    onChange={(e) =>
                      setNewLinkType(
                        e.target.value as "gdrive" | "gsheet" | "lark" | "other"
                      )
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="gdrive">Google Drive (Bản thảo / Thư mục)</option>
                    <option value="gsheet">Google Sheet (Kế hoạch / Dự toán)</option>
                    <option value="lark">Lark Docs (Tài liệu / Quy trình)</option>
                    <option value="other">Liên kết ngoài khác</option>
                  </select>
                </div>

                <div className="sm:col-span-4">
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Tên tài liệu / Tiêu đề ghim <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newLinkTitle}
                    onChange={(e) => setNewLinkTitle(e.target.value)}
                    placeholder="VD: Folder Bản dịch gốc & Thẩm định"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div className="sm:col-span-5">
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Đường dẫn URL <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="url"
                    value={newLinkUrl}
                    onChange={(e) => setNewLinkUrl(e.target.value)}
                    placeholder="https://drive.google.com/..."
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddLinkForm(false)}
                  className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={savingLink || !newLinkTitle.trim() || !newLinkUrl.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-brand-hover disabled:opacity-50 cursor-pointer"
                >
                  {savingLink ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Ghim liên kết
                </button>
              </div>
            </form>
          )}

          {/* Links List */}
          {loadingLinks ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-brand" />
            </div>
          ) : links.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand dark:bg-brand/20">
                <Link2 className="h-6 w-6" />
              </div>
              <h4 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200">
                Chưa ghim liên kết nào cho dự án
              </h4>
              <p className="mt-1 text-xs text-slate-400">
                Ghim các thư mục Google Drive, Google Sheet chi phí xuất bản, hoặc tài liệu Lark để cả team truy cập nhanh
              </p>
              <button
                type="button"
                onClick={() => setShowAddLinkForm(true)}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white hover:bg-brand-hover cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                Ghim liên kết ngay
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {links.map((link) => {
                const meta = LINK_TYPE_META[link.link_type] || LINK_TYPE_META.other;
                const IconComponent = meta.icon;

                return (
                  <div
                    key={link.id}
                    className="group flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-brand/40 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border",
                          meta.bgClass
                        )}
                      >
                        <IconComponent className={cn("h-5 w-5", meta.colorClass)} />
                      </div>

                      <div className="min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {meta.label}
                        </span>
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-sm font-bold text-slate-900 hover:text-brand dark:text-slate-100"
                        >
                          <span className="truncate">{link.title}</span>
                          <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-60" />
                        </a>
                        <p className="mt-0.5 truncate text-[11px] text-slate-400">
                          {link.url}
                        </p>
                      </div>
                    </div>

                    {canManageFiles && (
                      <button
                        type="button"
                        onClick={() => handleDeleteLink(link)}
                        title="Gỡ bỏ liên kết"
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-500 transition cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
       * MỤC 3: TỔNG HỢP TỆP TỪ CÁC TASK CON (TASK ATTACHMENTS AGGREGATION)
       * =================================================================== */}
      {activeSection === "task_attachments" && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Toàn bộ tài liệu đính kèm từ {tasks.length} công việc trong dự án
              </h4>
              <p className="text-xs text-slate-500">
                Tra cứu nhanh mọi bản thảo nháp, market bìa hoặc tài liệu được thành viên đính kèm trong các thẻ việc
              </p>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={taskAttSearch}
                onChange={(e) => setTaskAttSearch(e.target.value)}
                placeholder="Tìm tệp hoặc tên công việc..."
                className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 sm:w-64"
              />
            </div>
          </div>

          {loadingTaskAtts ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-brand" />
            </div>
          ) : filteredTaskAttachments.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center text-xs text-slate-400 dark:border-slate-800 dark:bg-slate-900">
              Không tìm thấy tài liệu đính kèm nào từ các công việc
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-100 bg-slate-50 text-[11px] font-bold uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-850 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Tên tài liệu</th>
                      <th className="px-4 py-3">Loại</th>
                      <th className="px-4 py-3">Thuộc công việc</th>
                      <th className="px-4 py-3">Kích thước</th>
                      <th className="px-4 py-3">Ngày đính kèm</th>
                      <th className="px-4 py-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredTaskAttachments.map((att) => (
                      <tr
                        key={att.id}
                        className="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                      >
                        <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                          <div className="flex items-center gap-2 max-w-xs truncate">
                            <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            <span className="truncate">{att.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {att.attachment_type}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {att.task ? (
                            <button
                              type="button"
                              onClick={() => onOpenTask?.(att.task!.id)}
                              className="font-medium text-brand hover:underline cursor-pointer max-w-xs truncate block text-left"
                            >
                              {att.task.title}
                            </button>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 font-mono">
                          {formatFileSize(att.file_size)}
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                          {formatDateVi(att.created_at)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <a
                            href={att.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-soft dark:hover:bg-brand/10 cursor-pointer"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Mở
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* File Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-slate-900 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                  {previewFile.name}
                </h3>
                <p className="text-xs text-slate-400">{previewFile.category}</p>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={previewFile.file_url}
                  target="_blank"
                  rel="noreferrer"
                  download={previewFile.name}
                  className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-hover cursor-pointer"
                >
                  Tải về
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewFile(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex flex-1 items-center justify-center overflow-auto p-4 bg-slate-100 dark:bg-slate-950 min-h-[400px]">
              {isImage(previewFile.name) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewFile.file_url}
                  alt={previewFile.name}
                  className="max-h-[70vh] w-auto max-w-full rounded-lg object-contain shadow-md"
                />
              ) : isPdf(previewFile.name) ? (
                <iframe
                  src={previewFile.file_url}
                  title={previewFile.name}
                  className="h-[70vh] w-full rounded-lg border-0 bg-white"
                />
              ) : (
                <div className="text-center text-xs text-slate-400">
                  Định dạng tệp không hỗ trợ xem trước trực tiếp. Vui lòng tải về máy.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
