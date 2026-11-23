"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  X,
  Plus,
  Trash2,
  Sliders,
  Type,
  Hash,
  ListFilter,
  Calendar,
  Loader2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { CustomFieldType, ProjectCustomField } from "@/types/database";

interface CustomFieldsManagerModalProps {
  projectId: string;
  projectName: string;
  isOpen: boolean;
  onClose: () => void;
  onFieldsUpdated?: () => void;
}

const FIELD_TYPE_OPTIONS: Array<{
  type: CustomFieldType;
  label: string;
  icon: typeof Type;
  hint: string;
}> = [
  {
    type: "text",
    label: "Văn bản (Text)",
    icon: Type,
    hint: "Dành cho Tác giả, Dịch giả, Biên tập viên, Nhà in...",
  },
  {
    type: "number",
    label: "Số (Number)",
    icon: Hash,
    hint: "Số trang, Giá bìa (VNĐ), Số lượng in dự kiến...",
  },
  {
    type: "dropdown",
    label: "Danh sách chọn (Dropdown)",
    icon: ListFilter,
    hint: "Khổ sách (13x20.5cm, 16x24cm...), Thể loại, Bản quyền...",
  },
  {
    type: "date",
    label: "Ngày tháng (Date)",
    icon: Calendar,
    hint: "Ngày nộp bản thảo, Ngày xin giấy phép, Ngày phát hành...",
  },
];

// Gợi ý trường chuẩn ngành xuất bản sách Alpha Books
const SUGGESTED_PRESETS = [
  { name: "Tác giả / Dịch giả", type: "text" as CustomFieldType, options: [] },
  { name: "Số trang dự kiến", type: "number" as CustomFieldType, options: [] },
  {
    name: "Khổ sách",
    type: "dropdown" as CustomFieldType,
    options: ["13 x 20.5 cm", "14.5 x 20.5 cm", "16 x 24 cm", "19 x 26 cm", "Khổ đặc biệt"],
  },
  { name: "Giá bìa dự kiến (VNĐ)", type: "number" as CustomFieldType, options: [] },
  { name: "Số lượng in đợt 1", type: "number" as CustomFieldType, options: [] },
  {
    name: "Loại ấn phẩm",
    type: "dropdown" as CustomFieldType,
    options: ["Kinh doanh & Quản trị", "Tâm lý kỹ năng", "Khoa học công nghệ", "Thiếu nhi", "Bìa cứng giới hạn"],
  },
  { name: "Hạn nộp bản dịch cuối", type: "date" as CustomFieldType, options: [] },
];

export default function CustomFieldsManagerModal({
  projectId,
  projectName,
  isOpen,
  onClose,
  onFieldsUpdated,
}: CustomFieldsManagerModalProps) {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [fields, setFields] = useState<ProjectCustomField[]>([]);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form thêm trường mới
  const [fieldName, setFieldName] = useState("");
  const [fieldType, setFieldType] = useState<CustomFieldType>("text");
  const [rawOptions, setRawOptions] = useState("");

  const loadFields = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("project_custom_fields")
        .select("*")
        .eq("project_id", projectId)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) throw error;
      setFields((data as ProjectCustomField[]) || []);
    } catch {
      toast.error("Không thể tải danh sách trường tùy biến");
    } finally {
      setLoading(false);
    }
  }, [supabase, projectId]);

  useEffect(() => {
    if (isOpen) {
      loadFields();
    }
  }, [isOpen, loadFields]);

  if (!isOpen) return null;

  async function handleAddField(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = fieldName.trim();
    if (!trimmedName) {
      toast.error("Vui lòng nhập tên trường dữ liệu");
      return;
    }

    // Kiểm tra trùng tên
    if (fields.some((f) => f.name.toLowerCase() === trimmedName.toLowerCase())) {
      toast.error("Trường với tên này đã tồn tại trong dự án");
      return;
    }

    let parsedOptions: string[] = [];
    if (fieldType === "dropdown") {
      parsedOptions = rawOptions
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean);

      if (parsedOptions.length === 0) {
        toast.error("Vui lòng nhập ít nhất một lựa chọn cho danh sách (cách nhau bởi dấu phẩy)");
        return;
      }
    }

    setSaving(true);
    try {
      const newPosition = fields.length;
      const { data, error } = await supabase
        .from("project_custom_fields")
        .insert({
          project_id: projectId,
          name: trimmedName,
          field_type: fieldType,
          options: parsedOptions,
          position: newPosition,
        })
        .select("*")
        .single();

      if (error || !data) throw error;

      setFields((prev) => [...prev, data as ProjectCustomField]);
      setFieldName("");
      setRawOptions("");
      toast.success(`Đã thêm trường "${trimmedName}"`);
      onFieldsUpdated?.();
    } catch {
      toast.error("Không thể tạo trường dữ liệu mới");
    } finally {
      setSaving(false);
    }
  }

  async function handleApplyPreset(preset: typeof SUGGESTED_PRESETS[0]) {
    if (fields.some((f) => f.name.toLowerCase() === preset.name.toLowerCase())) {
      toast.info(`Trường "${preset.name}" đã có trong dự án.`);
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("project_custom_fields")
        .insert({
          project_id: projectId,
          name: preset.name,
          field_type: preset.type,
          options: preset.options,
          position: fields.length,
        })
        .select("*")
        .single();

      if (error || !data) throw error;
      setFields((prev) => [...prev, data as ProjectCustomField]);
      toast.success(`Đã thêm trường mẫu "${preset.name}"`);
      onFieldsUpdated?.();
    } catch {
      toast.error("Không thể thêm trường mẫu");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteField(fieldId: string, name: string) {
    setDeletingId(fieldId);
    try {
      const { error } = await supabase
        .from("project_custom_fields")
        .delete()
        .eq("id", fieldId);

      if (error) throw error;

      setFields((prev) => prev.filter((f) => f.id !== fieldId));
      toast.success(`Đã xóa trường "${name}"`);
      onFieldsUpdated?.();
    } catch {
      toast.error("Không thể xóa trường dữ liệu");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]">
      <div className="flex w-full max-w-2xl flex-col max-h-[90vh] rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand dark:bg-brand/20">
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Tùy biến cột & Thông tin xuất bản
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Dự án: <span className="font-semibold text-slate-700 dark:text-slate-200">{projectName}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Quick Preset Badges */}
          <div className="rounded-xl border border-orange-100 bg-orange-50/50 p-3.5 dark:border-orange-950/50 dark:bg-orange-950/20">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-brand mb-2">
              <Sparkles className="h-3.5 w-3.5" />
              Gợi ý nhanh cho dự án Sách Alpha Books:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_PRESETS.map((preset) => {
                const isAdded = fields.some((f) => f.name.toLowerCase() === preset.name.toLowerCase());
                return (
                  <button
                    key={preset.name}
                    type="button"
                    disabled={saving || isAdded}
                    onClick={() => handleApplyPreset(preset)}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
                      isAdded
                        ? "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 cursor-not-allowed"
                        : "bg-white text-slate-700 border border-slate-200 hover:border-brand hover:text-brand dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 dark:hover:border-brand"
                    }`}
                  >
                    <Plus className="h-3 w-3" />
                    {preset.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Form thêm trường mới */}
          <form onSubmit={handleAddField} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/40 space-y-3">
            <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Thêm trường mới vào dự án
            </h3>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Tên trường (VD: Tác giả, Khổ sách, Giá bìa...)
                </label>
                <input
                  type="text"
                  required
                  value={fieldName}
                  onChange={(e) => setFieldName(e.target.value)}
                  placeholder="Nhập tên trường..."
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Loại dữ liệu
                </label>
                <select
                  value={fieldType}
                  onChange={(e) => setFieldType(e.target.value as CustomFieldType)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  {FIELD_TYPE_OPTIONS.map((f) => (
                    <option key={f.type} value={f.type}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {fieldType === "dropdown" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Các lựa chọn (phân cách bằng dấu phẩy)
                </label>
                <input
                  type="text"
                  required
                  value={rawOptions}
                  onChange={(e) => setRawOptions(e.target.value)}
                  placeholder="VD: 13 x 20.5 cm, 14.5 x 20.5 cm, 16 x 24 cm"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={saving || !fieldName.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-brand-hover disabled:opacity-50 cursor-pointer"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Thêm trường
              </button>
            </div>
          </form>

          {/* Danh sách các trường hiện có */}
          <div>
            <h3 className="mb-2 text-xs font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Các trường tùy biến hiện có ({fields.length})
            </h3>

            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-brand" />
                <span className="ml-2 text-xs text-slate-500">Đang tải danh sách trường...</span>
              </div>
            ) : fields.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                Chưa có trường tùy biến nào. Thêm trường mới hoặc chọn từ gợi ý mẫu ở trên.
              </div>
            ) : (
              <div className="space-y-2">
                {fields.map((f) => {
                  const typeMeta = FIELD_TYPE_OPTIONS.find((t) => t.type === f.field_type) || FIELD_TYPE_OPTIONS[0];
                  const IconComp = typeMeta.icon;
                  const isDeleting = deletingId === f.id;

                  return (
                    <div
                      key={f.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          <IconComp className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {f.name}
                          </p>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400">
                            <span>{typeMeta.label}</span>
                            {f.options && f.options.length > 0 && (
                              <span>• {f.options.length} lựa chọn: {f.options.slice(0, 3).join(", ")}{f.options.length > 3 ? "..." : ""}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => handleDeleteField(f.id, f.name)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400 cursor-pointer"
                        title="Xóa trường này"
                      >
                        {isDeleting ? <Loader2 className="h-4 w-4 animate-spin text-red-500" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-slate-200 px-6 py-3.5 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
