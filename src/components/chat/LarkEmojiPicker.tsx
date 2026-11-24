"use client";

import React, { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Search, Smile, Heart, Star, Sparkles, X } from "lucide-react";

interface LarkEmojiPickerProps {
  onSelectEmoji: (emoji: string) => void;
  onClose: () => void;
  className?: string;
}

const FREQUENT_EMOJIS = [
  "👍",
  "👌",
  "✅",
  "❤️",
  "🔥",
  "🎉",
  "😂",
  "👏",
  "🙏",
  "💪",
  "🚀",
  "👀",
  "💡",
  "⏰",
  "📍",
  "✨",
];

const WORKPLACE_STICKERS = [
  { label: "OK", text: "👌 OK" },
  { label: "DONE", text: "✅ DONE" },
  { label: "GOT IT", text: "👍 GOT IT" },
  { label: "YES", text: "🙌 YES" },
  { label: "+1", text: "➕1" },
  { label: "THANK YOU", text: "🙏 CẢM ƠN" },
  { label: "URGENT", text: "🚨 KHẨN CẤP" },
  { label: "REVIEW", text: "🔍 XEM XÉT" },
];

const EMOJI_CATEGORIES: { name: string; icon: string; items: string[] }[] = [
  {
    name: "Mặt cười & Cảm xúc",
    icon: "😀",
    items: [
      "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇",
      "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚",
      "😋", "😛", "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🤩",
      "🥳", "😏", "😒", "😞", "😔", "😟", "😕", "🙁", "😣", "😖",
      "😫", "😩", "🥺", "😢", "😭", "😤", "😠", "😡", "🤯", "😳",
    ],
  },
  {
    name: "Cử chỉ & Bàn tay",
    icon: "👍",
    items: [
      "👍", "👎", "👌", "🤌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙",
      "👈", "👉", "👆", "🖕", "👇", "☝️", "👋", "🤚", "🖐️", "✋",
      "🖖", "👏", "🙌", "👐", "🤲", "🤝", "🙏", "✍️", "💪", "👊",
    ],
  },
  {
    name: "Biểu tượng & Trạng thái",
    icon: "⭐",
    items: [
      "✅", "❌", "❓", "❗", "⚠️", "🔥", "✨", "🎉", "💯", "🚀",
      "📌", "📍", "⏰", "⌛", "📊", "📈", "📉", "📁", "📂", "📄",
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💔", "💬",
    ],
  },
];

export function LarkEmojiPicker({
  onSelectEmoji,
  onClose,
  className,
}: LarkEmojiPickerProps) {
  const [activeTab, setActiveTab] = useState<"emoji" | "stickers">("emoji");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredEmojis = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;
    const all = EMOJI_CATEGORIES.flatMap((c) => c.items);
    return all.filter((e) => e.includes(q));
  }, [searchQuery]);

  return (
    <div
      className={cn(
        "flex flex-col w-72 sm:w-80 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden text-xs z-50 animate-in fade-in zoom-in-95 duration-150",
        className
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Top Search & Close */}
      <div className="p-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm emoji..."
            className="w-full pl-8 pr-2 py-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border-0 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-brand text-xs"
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-6 w-6 rounded-lg flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100 dark:border-slate-800 px-2 pt-1 gap-2 text-[11px] font-semibold text-slate-500">
        <button
          type="button"
          onClick={() => setActiveTab("emoji")}
          className={cn(
            "pb-1.5 px-2 border-b-2 transition cursor-pointer",
            activeTab === "emoji"
              ? "border-brand text-brand"
              : "border-transparent hover:text-slate-800 dark:hover:text-slate-200"
          )}
        >
          Biểu tượng cảm xúc
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("stickers")}
          className={cn(
            "pb-1.5 px-2 border-b-2 transition cursor-pointer",
            activeTab === "stickers"
              ? "border-brand text-brand"
              : "border-transparent hover:text-slate-800 dark:hover:text-slate-200"
          )}
        >
          Huy hiệu công việc
        </button>
      </div>

      {/* Scrollable Content */}
      <div className="max-h-60 overflow-y-auto p-2.5 space-y-3">
        {activeTab === "stickers" ? (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Phản hồi nhanh công việc
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {WORKPLACE_STICKERS.map((stk) => (
                <button
                  key={stk.label}
                  type="button"
                  onClick={() => {
                    onSelectEmoji(` ${stk.text} `);
                    onClose();
                  }}
                  className="flex items-center justify-center py-2 px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 hover:border-brand hover:bg-orange-50/60 dark:hover:bg-orange-950/30 text-slate-800 dark:text-slate-200 font-bold text-xs transition"
                >
                  {stk.text}
                </button>
              ))}
            </div>
          </div>
        ) : filteredEmojis ? (
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Kết quả tìm kiếm ({filteredEmojis.length})
            </p>
            <div className="grid grid-cols-8 gap-1">
              {filteredEmojis.map((emoji, idx) => (
                <button
                  key={`${emoji}-${idx}`}
                  type="button"
                  onClick={() => {
                    onSelectEmoji(emoji);
                    onClose();
                  }}
                  className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-base hover:scale-125 transition"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* 1. Thường dùng (Frequently Used - Chuẩn Lark) */}
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Thường dùng
              </p>
              <div className="grid grid-cols-8 gap-1">
                {FREQUENT_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      onSelectEmoji(emoji);
                      onClose();
                    }}
                    className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-base hover:scale-125 transition"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Danh mục đầy đủ */}
            {EMOJI_CATEGORIES.map((cat) => (
              <div key={cat.name} className="space-y-1">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  {cat.name}
                </p>
                <div className="grid grid-cols-8 gap-1">
                  {cat.items.map((emoji, idx) => (
                    <button
                      key={`${cat.name}-${idx}`}
                      type="button"
                      onClick={() => {
                        onSelectEmoji(emoji);
                        onClose();
                      }}
                      className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-base hover:scale-125 transition"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
