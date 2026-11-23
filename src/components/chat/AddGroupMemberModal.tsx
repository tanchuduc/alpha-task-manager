"use client";

import React, { useState, useMemo } from "react";
import type { Profile } from "@/types/database";
import { cn, getInitials } from "@/lib/utils";
import { X, Search, Check, UserPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface AddGroupMemberModalProps {
  conversationTitle: string;
  existingMemberIds: string[];
  allProfiles: Profile[];
  onClose: () => void;
  onAddMembers: (newMemberIds: string[]) => Promise<void>;
}

export function AddGroupMemberModal({
  conversationTitle,
  existingMemberIds,
  allProfiles,
  onClose,
  onAddMembers,
}: AddGroupMemberModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const existingSet = useMemo(() => new Set(existingMemberIds), [existingMemberIds]);

  // Available candidates: not already in group
  const candidates = useMemo(
    () => allProfiles.filter((p) => !existingSet.has(p.id)),
    [allProfiles, existingSet]
  );

  const filteredCandidates = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return candidates;
    return candidates.filter(
      (p) =>
        p.full_name?.toLowerCase().includes(q) ||
        p.job_title?.toLowerCase().includes(q) ||
        p.department?.name?.toLowerCase().includes(q) ||
        p.email?.toLowerCase().includes(q)
    );
  }, [candidates, searchQuery]);

  const toggleSelect = (uid: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selectedIds.size === 0) {
      toast.error("Vui lòng chọn ít nhất một nhân sự để thêm vào nhóm.");
      return;
    }

    setIsSubmitting(true);
    try {
      await onAddMembers(Array.from(selectedIds));
      onClose();
    } catch (err) {
      console.error("Lỗi thêm thành viên:", err);
      toast.error("Không thể thêm thành viên. Vui lòng thử lại.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Thêm thành viên vào nhóm
              </h3>
              <p className="text-[11px] text-slate-500 line-clamp-1">
                {conversationTitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm kiếm nhân sự theo tên, vị trí, phòng ban..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-1.5 pl-8 pr-3 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:border-brand focus:outline-none"
            />
          </div>
        </div>

        {/* Candidates list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1 max-h-60 text-xs">
          {filteredCandidates.length === 0 ? (
            <p className="text-center py-8 text-slate-400 text-xs">
              {candidates.length === 0
                ? "Tất cả nhân sự đã có mặt trong nhóm này."
                : "Không tìm thấy nhân sự phù hợp."}
            </p>
          ) : (
            filteredCandidates.map((p) => {
              const isSelected = selectedIds.has(p.id);
              return (
                <div
                  key={p.id}
                  onClick={() => toggleSelect(p.id)}
                  className={cn(
                    "flex items-center gap-2.5 p-2 rounded-xl cursor-pointer transition border select-none",
                    isSelected
                      ? "bg-brand/10 border-brand/50 text-brand"
                      : "border-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                  )}
                >
                  <div className="h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center font-bold text-xs shrink-0">
                    {getInitials(p.full_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{p.full_name}</p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {p.job_title || p.department?.name || "Nhân sự Alpha"}
                    </p>
                  </div>
                  <div
                    className={cn(
                      "h-5 w-5 rounded-md border flex items-center justify-center transition shrink-0",
                      isSelected
                        ? "border-brand bg-brand text-white"
                        : "border-slate-300 dark:border-slate-700"
                    )}
                  >
                    {isSelected && <Check className="h-3.5 w-3.5" />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 p-3 bg-white dark:bg-slate-900 shrink-0">
          <span className="text-[11px] text-slate-500">
            Đã chọn: <strong className="text-brand">{selectedIds.size}</strong> nhân sự
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={selectedIds.size === 0 || isSubmitting}
              onClick={handleSubmit}
              className="flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-brand-dark disabled:opacity-50 transition"
            >
              {isSubmitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <UserPlus className="h-3.5 w-3.5" />
              )}
              <span>Thêm vào nhóm</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
