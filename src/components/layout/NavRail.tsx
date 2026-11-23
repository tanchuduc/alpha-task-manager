"use client";

import React from "react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface NavRailItemConfig {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  group?: string;
}

export interface NavRailProps {
  surfaceKey: string;
  items: NavRailItemConfig[];
  activeKey: string;
  collapsed: boolean;
  pinnedKey: string | null;
  onSelect: (key: string) => void;
  onToggleCollapse: () => void;
  onTogglePin: (key: string) => void;
}

export function NavRail({
  items,
  activeKey,
  collapsed,
  pinnedKey,
  onSelect,
  onToggleCollapse,
  onTogglePin,
}: NavRailProps) {
  return (
    <aside
      className="nav-rail-width-transition flex flex-col shrink-0 select-none bg-white dark:bg-[#141414] h-full overflow-y-auto overflow-x-hidden"
      style={{
        width: collapsed ? 56 : 68,
        minWidth: collapsed ? 56 : 68,
      }}
    >
      {/* Top Collapse Toggle Button */}
      <div className="flex items-center justify-center pt-3 pb-3">
        <button
          type="button"
          onClick={onToggleCollapse}
          title={collapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200 transition cursor-pointer"
        >
          {collapsed ? (
            <PanelLeftOpen className="h-[17px] w-[17px]" />
          ) : (
            <PanelLeftClose className="h-[17px] w-[17px]" />
          )}
        </button>
      </div>

      {/* Rail Items */}
      <div className="flex flex-1 flex-col gap-2.5 pt-1 pb-4">
        {items.map((item, idx) => {
          const Icon = item.icon;
          const isActive = activeKey === item.key;
          const isPinned = pinnedKey === item.key;
          const prevGroup = idx > 0 ? items[idx - 1].group : item.group;
          const showDivider = idx > 0 && item.group && item.group !== prevGroup;

          return (
            <React.Fragment key={item.key}>
              {showDivider && (
                <div className="mx-2 my-1">
                  {!collapsed && (
                    <div className="px-1 pb-1 text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 text-center">
                      {item.group}
                    </div>
                  )}
                  <div className="h-px bg-[#e8e8e8] dark:bg-[#303030]" />
                </div>
              )}

              <div
                className="nav-rail-item-wrapper relative w-full"
                style={{
                  borderLeft: isActive
                    ? "3px solid #F47830"
                    : "3px solid transparent",
                }}
              >
                {/* Pin as default view button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onTogglePin(item.key);
                  }}
                  title={
                    isPinned
                      ? "Bỏ ghim chế độ mặc định"
                      : "Ghim làm chế độ mặc định khi mở"
                  }
                  className={cn(
                    "nav-rail-pin-affordance absolute top-0.5 left-1 z-10 flex h-4 w-4 items-center justify-center rounded cursor-pointer",
                    (isActive || isPinned) && "nav-rail-pin-visible",
                    isPinned
                      ? "text-brand"
                      : "text-slate-400 hover:text-brand dark:text-slate-500"
                  )}
                >
                  <Pin
                    className={cn(
                      "h-2.5 w-2.5",
                      isPinned && "fill-current rotate-45"
                    )}
                  />
                </button>

                {/* Main item button */}
                <button
                  type="button"
                  onClick={() => onSelect(item.key)}
                  title={
                    isPinned
                      ? `${item.label.replace(/\n/g, " ")} (Đã ghim mặc định)`
                      : item.label.replace(/\n/g, " ")
                  }
                  className={cn(
                    "relative flex w-full flex-col items-center justify-center gap-1 cursor-pointer focus:outline-none",
                    collapsed ? "py-1.5 px-0.5" : "py-1.5 px-1"
                  )}
                >
                  {/* Unread / count badge */}
                  {typeof item.badge === "number" && item.badge > 0 && (
                    <span className="pointer-events-none absolute top-0.5 right-1.5 z-10 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white shadow-2xs">
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  )}

                  <span
                    className={cn(
                      "nav-rail-item-icon",
                      isActive
                        ? "text-brand"
                        : "text-black/45 dark:text-white/45"
                    )}
                  >
                    <Icon className="h-[20px] w-[20px]" />
                  </span>

                  {!collapsed && (
                    <span
                      className={cn(
                        "nav-rail-item-label",
                        isActive
                          ? "font-semibold text-brand"
                          : "font-medium text-black/55 dark:text-white/55"
                      )}
                    >
                      {item.label}
                    </span>
                  )}
                </button>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </aside>
  );
}
