"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import type { Profile } from "@/types/database";
import { getInitials } from "@/lib/utils";
import { AtSign } from "lucide-react";

export interface MentionAutocompleteProps {
  profiles: Profile[];
  value: string;
  onChange: (value: string) => void;
  onMention?: (profile: Profile) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLTextAreaElement>) => void;
  id?: string;
  name?: string;
  dropdownPlacement?: "top" | "bottom";
}

export interface MentionTextareaRef {
  focus: () => void;
  textarea: HTMLTextAreaElement | null;
}

/**
 * Drop-in Textarea with smart @mention autocomplete dropdown,
 * keyboard navigation (ArrowUp, ArrowDown, Enter, Tab, Escape),
 * and tracking of mentioned users.
 */
export const MentionTextarea = forwardRef<
  MentionTextareaRef,
  MentionAutocompleteProps
>(function MentionTextarea(
  {
    profiles,
    value,
    onChange,
    onMention,
    placeholder = "Nhập nội dung... (gõ @ để nhắc tên đồng nghiệp)",
    rows = 3,
    className = "",
    disabled = false,
    autoFocus = false,
    onKeyDown,
    onPaste,
    onBlur,
    id,
    name,
    dropdownPlacement = "bottom",
  },
  ref
) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
    textarea: textareaRef.current,
  }));

  // Filter profiles based on search query with Vietnamese accent-insensitive support
  const filteredProfiles = React.useMemo(() => {
    if (!isOpen) return [];
    const q = mentionQuery.toLowerCase().trim();
    if (!q) return profiles.slice(0, 8);
    const qNorm = q
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/gi, "d");

    return profiles
      .filter((p) => {
        const name = (p.full_name ?? "").toLowerCase();
        const nameNorm = name
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/đ/gi, "d");
        const nameMatch = name.includes(q) || nameNorm.includes(qNorm);
        const emailMatch = (p.email ?? "").toLowerCase().includes(q);
        const roleMatch = (p.job_title ?? "").toLowerCase().includes(q);
        const deptMatch = (p.department?.name ?? "").toLowerCase().includes(q);
        return nameMatch || emailMatch || roleMatch || deptMatch;
      })
      .slice(0, 8);
  }, [profiles, isOpen, mentionQuery]);

  // Keep selected index within bounds
  useEffect(() => {
    if (selectedIndex >= filteredProfiles.length) {
      setSelectedIndex(Math.max(0, filteredProfiles.length - 1));
    }
  }, [filteredProfiles.length, selectedIndex]);

  // Detect @ keystroke and caret position
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newVal = e.target.value;
    onChange(newVal);

    const cursor = e.target.selectionStart;
    const textBeforeCursor = newVal.slice(0, cursor);

    // Look for last @ before cursor that is preceded by space, newline, or start of string
    const match = textBeforeCursor.match(/(?:^|\s)@([^\s@]*)$/);

    if (match) {
      const query = match[1];
      const matchIndex = cursor - query.length - 1; // start index of '@'
      setMentionStartIndex(matchIndex);
      setMentionQuery(query);
      setIsOpen(true);
      setSelectedIndex(0);
    } else {
      setIsOpen(false);
      setMentionStartIndex(null);
      setMentionQuery("");
    }
  };

  const insertMention = useCallback(
    (profile: Profile) => {
      if (mentionStartIndex === null || !textareaRef.current) return;

      const cursor = textareaRef.current.selectionStart;
      const before = value.slice(0, mentionStartIndex);
      const after = value.slice(cursor);
      const mentionToken = `@${profile.full_name} `;

      const nextVal = `${before}${mentionToken}${after}`;
      onChange(nextVal);
      onMention?.(profile);

      setIsOpen(false);
      setMentionStartIndex(null);
      setMentionQuery("");

      // Reposition cursor after the inserted token
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          const nextCursor = before.length + mentionToken.length;
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(nextCursor, nextCursor);
        }
      });
    },
    [mentionStartIndex, value, onChange, onMention]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isOpen && filteredProfiles.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredProfiles.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev === 0 ? filteredProfiles.length - 1 : prev - 1
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const selected = filteredProfiles[selectedIndex];
        if (selected) {
          insertMention(selected);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setIsOpen(false);
        return;
      }
    }

    onKeyDown?.(e);
  };

  // Close dropdown if user clicks outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative w-full">
      <textarea
        ref={textareaRef}
        id={id}
        name={name}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onPaste={onPaste}
        onBlur={onBlur}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        autoFocus={autoFocus}
        className={className}
      />

      {/* Floating Mention Dropdown */}
      {isOpen && filteredProfiles.length > 0 && (
        <div
          ref={dropdownRef}
          className={`absolute ${
            dropdownPlacement === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5"
          } left-0 z-50 w-72 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-800 dark:bg-slate-900`}
          style={{ minWidth: "260px" }}
        >
          <div className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800 mb-1">
            <AtSign className="h-3 w-3 text-brand" />
            <span>Đồng nghiệp ({filteredProfiles.length})</span>
          </div>

          <div className="space-y-0.5">
            {filteredProfiles.map((profile, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={profile.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault(); // prevent textarea blur
                    insertMention(profile);
                  }}
                  className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs transition cursor-pointer ${
                    isSelected
                      ? "bg-brand-soft text-brand font-medium dark:bg-brand-soft-dark"
                      : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  }`}
                >
                  {profile.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={profile.full_name}
                      className="h-6 w-6 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">
                      {getInitials(profile.full_name)}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900 dark:text-slate-100">
                      {profile.full_name}
                    </p>
                    <p className="truncate text-[10px] text-slate-400">
                      {profile.job_title || profile.department?.name || profile.email}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});

/**
 * Helper to auto-link URLs inside a plain text segment
 */
function renderTextWithLinks(
  text: string,
  keyPrefix: string,
  options?: { isInverse?: boolean }
): React.ReactNode {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[^\s<>"]+)/gi;
  const parts = text.split(urlRegex);
  if (parts.length === 1) return text;

  return parts.map((part, idx) => {
    if (/^https?:\/\//i.test(part)) {
      // Strip trailing punctuation like .,;:!?)
      const cleanUrl = part.replace(/[.,;:!?)]+$/, "");
      const trailing = part.slice(cleanUrl.length);
      return (
        <React.Fragment key={`${keyPrefix}-link-${idx}`}>
          <a
            href={cleanUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={
              options?.isInverse
                ? "underline decoration-white/70 underline-offset-2 font-medium text-white hover:decoration-white break-all"
                : "underline decoration-brand/60 underline-offset-2 font-medium text-brand hover:decoration-brand break-all"
            }
          >
            {cleanUrl}
          </a>
          {trailing}
        </React.Fragment>
      );
    }
    return <React.Fragment key={`${keyPrefix}-txt-${idx}`}>{part}</React.Fragment>;
  });
}

/**
 * Helper to render message/comment body with styled @mention pills and clickable URLs
 */
export function renderContentWithMentions(
  content: string,
  profiles?: Profile[],
  options?: { isInverse?: boolean }
): React.ReactNode {
  if (!content) return null;

  // Regex matches words starting with @
  // Vietnamese names can contain accented letters and spaces, e.g. @Nguyễn Văn A
  // We match @Name against existing profile full_names if available, or @(\S+)
  if (profiles && profiles.length > 0) {
    // Sort by name length descending to avoid partial matches
    const sortedNames = profiles
      .map((p) => p.full_name.trim())
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);

    if (sortedNames.length > 0) {
      // Escape for regex
      const pattern = sortedNames
        .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("|");
      const regex = new RegExp(`(@(?:${pattern}))`, "gi");

      const parts = content.split(regex);
      return parts.map((part, i) => {
        if (part.startsWith("@")) {
          const nameOnly = part.slice(1);
          const matchedProfile = profiles.find(
            (p) => p.full_name.toLowerCase() === nameOnly.toLowerCase()
          );
          return (
            <span
              key={i}
              className={
                options?.isInverse
                  ? "inline-flex items-center gap-0.5 rounded-md bg-white/20 px-1.5 py-0.5 text-xs font-semibold text-white transition hover:bg-white/30 cursor-pointer"
                  : "inline-flex items-center gap-0.5 rounded-md bg-brand-soft px-1.5 py-0.5 text-xs font-semibold text-brand transition hover:bg-brand/15 dark:bg-brand-soft-dark cursor-pointer"
              }
              title={matchedProfile ? `${matchedProfile.full_name} (${matchedProfile.email})` : part}
            >
              <AtSign
                className={
                  options?.isInverse
                    ? "h-3 w-3 inline text-white shrink-0"
                    : "h-3 w-3 inline text-brand shrink-0"
                }
              />
              {nameOnly}
            </span>
          );
        }
        return (
          <span key={i}>
            {renderTextWithLinks(part, `m-${i}`, options)}
          </span>
        );
      });
    }
  }

  // Fallback: match basic @words
  const fallbackRegex = /(@[\p{L}\p{N}_-]+(?:\s[\p{L}\p{N}_-]+)*)/gu;
  const parts = content.split(fallbackRegex);
  return parts.map((part, i) => {
    if (part.startsWith("@")) {
      return (
        <span
          key={i}
          className={
            options?.isInverse
              ? "inline-flex items-center gap-0.5 rounded-md bg-white/20 px-1.5 py-0.5 text-xs font-semibold text-white"
              : "inline-flex items-center gap-0.5 rounded-md bg-brand-soft px-1.5 py-0.5 text-xs font-semibold text-brand dark:bg-brand-soft-dark"
          }
        >
          {part}
        </span>
      );
    }
    return (
      <span key={i}>
        {renderTextWithLinks(part, `fb-${i}`, options)}
      </span>
    );
  });
}

/**
 * Extracts list of profile IDs mentioned in the text
 */
export function extractMentionedUserIds(
  text: string,
  profiles: Profile[]
): string[] {
  if (!text || !profiles.length) return [];
  const mentioned = new Set<string>();
  for (const profile of profiles) {
    if (profile.full_name && text.includes(`@${profile.full_name}`)) {
      mentioned.add(profile.id);
    }
  }
  return Array.from(mentioned);
}

export default MentionTextarea;
