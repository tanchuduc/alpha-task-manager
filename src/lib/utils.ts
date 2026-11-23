import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { TaskPriority, UserRole } from "@/types/database";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const PRIORITY_CONFIG: Record<
  TaskPriority,
  { label: string; color: string; bg: string; dot: string }
> = {
  urgent: {
    label: "Khẩn cấp",
    color: "text-red-700 dark:text-red-300",
    bg: "bg-red-50 dark:bg-red-950/60 border-red-200 dark:border-red-900",
    dot: "bg-red-500",
  },
  high: {
    label: "Cao",
    color: "text-orange-700 dark:text-orange-300",
    bg: "bg-orange-50 dark:bg-orange-950/60 border-orange-200 dark:border-orange-900",
    dot: "bg-orange-500",
  },
  medium: {
    label: "Trung bình",
    color: "text-blue-700 dark:text-blue-300",
    bg: "bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-900",
    dot: "bg-blue-500",
  },
  low: {
    label: "Thấp",
    color: "text-slate-600 dark:text-slate-300",
    bg: "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700",
    dot: "bg-slate-400",
  },
};

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Quản trị viên",
  manager: "Trưởng phòng / Quản lý",
  member: "Nhân viên",
};

export function getInitials(name: string): string {
  if (!name) return "AB";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function formatDateVi(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function isOverdue(
  dueDate: string | null | undefined,
  completedAt?: string | null
): boolean {
  if (!dueDate || completedAt) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return due < today;
}

export function generateProjectCode(name: string): string {
  const cleaned = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "PRJ";
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  return words
    .slice(0, 4)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}
