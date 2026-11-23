"use client";

import React, { useState, useMemo } from "react";
import type { Profile } from "@/types/database";
import { cn, getInitials } from "@/lib/utils";
import {
  X,
  Users,
  Search,
  Check,
  UserPlus,
  Loader2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

interface CreateGroupModalProps {
  currentUser: Profile;
  allProfiles: Profile[];
  onClose: () => void;
  onCreateGroup: (data: {
    title: string;
    description?: string;
    memberIds: string[];
  }) => Promise<void>;
}

export function CreateGroupModal({
  currentUser,
  allProfiles,
  onClose,
  onCreateGroup,
}: CreateGroupModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [searchMember, setSearchMember] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(
    () => new Set()
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Exclude current user from candidate list (creator is always added)
  const candidateProfiles = useMemo(
    () => allProfiles.filter((p) => p.id !== currentUser.id),
    [allProfiles, currentUser.id]
  );

  // Filter candidates by search term
  const filteredCandidates = useMemo(() => {
    const q = searchMember.toLowerCase().trim();
    if (!q) return candidateProfiles;
    return candidateProfiles.filter(
      (p) =>
        p.full_name?.toLowerCase().includes(q) ||
        p.job_title?.toLowerCase().includes(q) ||
        p.department?.name?.toLowerCase().includes(q) ||
        p.email?.toLowerCase().includes(q)
    );
  }, [candidateProfiles, searchMember]);

  const toggleUserSelect = (uid: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      filteredCandidates.forEach((p) => next.add(p.id));
      return next;
    });
  };

  const handleDeselectAll = () => {
    setSelectedUserIds(new Set());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast.error("Vui lòng nhập tên nhóm.");
      return;
    }

    if (selectedUserIds.size === 0) {
      toast.error("Vui lòng chọn ít nhất 1 thành viên để tạo nhóm.");
      return;
    }

    setIsSubmitting(true);
    try {
      await onCreateGroup({
        title: trimmedTitle,
        description: description.trim() || undefined,
        memberIds: Array.from(selectedUserIds),
      });
      toast.success(`Đã tạo nhóm "${trimmedTitle}" thành công!`);
      onClose();
    } catch (err) {
      console.error("Lỗi tạo nhóm:", err);
      toast.error("Không thể tạo nhóm. Vui lòng thử lại.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-xs">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Tạo nhóm trò chuyện mới
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Trao đổi linh hoạt theo chuyên đề hoặc phối hợp liên phòng ban
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {/* Tên nhóm */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-800 dark:text-slate-200">
              Tên nhóm <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: Hội Chợ Sách 2026, Chiến Dịch Ra Mắt Sách..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950/40 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          {/* Mô tả nhóm */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-800 dark:text-slate-200">
              Mô tả mục tiêu nhóm (tùy chọn)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ghi chú mục đích trao đổi, kế hoạch công việc của nhóm..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950/40 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-brand resize-none"
            />
          </div>

          {/* Chọn thành viên */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-800 dark:text-slate-200">
                Thêm thành viên vào nhóm ({selectedUserIds.size} người được chọn)
              </label>
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={handleSelectAllFiltered}
                  className="text-brand hover:underline"
                >
                  Chọn tất cả
                </button>
                <span className="text-slate-300 dark:text-slate-700">•</span>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  Bỏ chọn
                </button>
              </div>
            </div>

            {/* Search candidate input */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchMember}
                onChange={(e) => setSearchMember(e.target.value)}
                placeholder="Tìm nhân sự theo tên, chức danh, phòng ban..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-brand text-xs"
              />
            </div>

            {/* Candidate List Scroll */}
            <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800/60 bg-white dark:bg-slate-900">
              {filteredCandidates.length === 0 ? (
                <div className="p-4 text-center text-slate-400 text-xs">
                  Không tìm thấy nhân sự phù hợp
                </div>
              ) : (
                filteredCandidates.map((candidate) => {
                  const isChecked = selectedUserIds.has(candidate.id);
                  return (
                    <div
                      key={candidate.id}
                      onClick={() => toggleUserSelect(candidate.id)}
                      className={cn(
                        "flex items-center justify-between p-2.5 cursor-pointer transition",
                        isChecked
                          ? "bg-emerald-50/60 dark:bg-emerald-950/20"
                          : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {candidate.avatar_url ? (
                          <img
                            src={candidate.avatar_url}
                            alt={candidate.full_name}
                            className="h-8 w-8 rounded-full object-cover shrink-0"
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-200 dark:bg-slate-800 font-bold text-xs shrink-0">
                            {getInitials(candidate.full_name)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 dark:text-slate-100 truncate text-xs">
                            {candidate.full_name}
                          </p>
                          <p className="text-[10px] text-slate-400 truncate">
                            {candidate.job_title || candidate.department?.name || candidate.email}
                          </p>
                        </div>
                      </div>

                      {/* Custom Checkbox */}
                      <div
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded-md border transition shrink-0",
                          isChecked
                            ? "bg-emerald-500 border-emerald-500 text-white shadow-2xs"
                            : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
                        )}
                      >
                        {isChecked && <Check className="h-3.5 w-3.5" />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Modal Footer */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !title.trim() || selectedUserIds.size === 0}
              className={cn(
                "flex items-center gap-1.5 px-4 py-1.5 rounded-xl font-semibold text-white shadow-xs transition",
                isSubmitting || !title.trim() || selectedUserIds.size === 0
                  ? "bg-emerald-300 dark:bg-emerald-900 cursor-not-allowed"
                  : "bg-emerald-500 hover:bg-emerald-600 cursor-pointer"
              )}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Đang tạo...</span>
                </>
              ) : (
                <>
                  <Users className="h-3.5 w-3.5" />
                  <span>Tạo nhóm ngay</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
