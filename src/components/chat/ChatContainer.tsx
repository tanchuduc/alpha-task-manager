"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Profile, Department, Project } from "@/types/database";
import { useUnifiedChat, type UnifiedMessageItem } from "@/lib/chat/useUnifiedChat";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatMessageArea } from "@/components/chat/ChatMessageArea";
import { ChatContextPanel } from "@/components/chat/ChatContextPanel";
import { CreateGroupModal } from "@/components/chat/CreateGroupModal";
import { ThreadDrawer } from "@/components/chat/ThreadDrawer";
import {
  ConvertMessageToTaskModal,
  type SourceChatMessage,
} from "@/components/chat/ConvertMessageToTaskModal";
import { cn } from "@/lib/utils";

interface ChatContainerProps {
  currentUser: Profile;
  allProfiles: Profile[];
  allDepartments?: Department[];
  allProjects?: Project[];
}

export function ChatContainer({
  currentUser,
  allProfiles,
  allProjects = [],
}: ChatContainerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const userParam = searchParams.get("user");
  const projectParam = searchParams.get("project");

  // Core Unified Chat Hook
  const {
    conversations,
    rawConversations,
    activeConversationId,
    activeConversation,
    messages,
    loadingConversations,
    loadingMessages,
    activeFilter,
    setActiveFilter,
    searchQuery,
    setSearchQuery,
    onlineUserIds,
    currentTypingUser,
    selectConversation,
    selectByUserId,
    selectByProjectId,
    sendMessage,
    editMessage,
    unsendMessage,
    toggleReaction,
    togglePin,
    togglePinConversation,
    toggleMuteConversation,
    broadcastTyping,
    createGroup,
    addMembersToGroup,
    leaveGroup,
    forwardMessage,
    requestBrowserNotificationPermission,
  } = useUnifiedChat({
    currentUser,
    allProfiles,
    allProjects,
    initialUserId: userParam,
    initialProjectId: projectParam,
  });

  // UI state: Context panel visibility & Convert-to-task modal & Create Group Modal & Active Thread
  const [showContextPanel, setShowContextPanel] = useState(false);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [activeThreadMessage, setActiveThreadMessage] = useState<UnifiedMessageItem | null>(null);
  const [mobileShowSidebar, setMobileShowSidebar] = useState(true);
  const [convertModalMessage, setConvertModalMessage] =
    useState<SourceChatMessage | null>(null);

  // Sync selection with URL
  const handleSelectConversation = useCallback(
    (convId: string) => {
      selectConversation(convId);
      setActiveThreadMessage(null);
      setMobileShowSidebar(false);

      if (convId.startsWith("dm:")) {
        const uid = convId.replace("dm:", "");
        router.replace(`/chat?user=${uid}`);
      } else if (convId.startsWith("proj:")) {
        const pid = convId.replace("proj:", "");
        router.replace(`/chat?project=${pid}`);
      }
    },
    [selectConversation, router]
  );

  // When clicking back on mobile
  const handleBackToMobileList = useCallback(() => {
    setMobileShowSidebar(true);
  }, []);

  // When task is created from chat message
  const handleTaskCreated = useCallback(
    ({
      taskId,
      taskTitle,
      projectId,
    }: {
      taskId: string;
      taskTitle: string;
      projectId: string;
      projectName: string;
    }) => {
      const taskUrl = `${window.location.origin}/projects/${projectId}?task=${taskId}`;
      sendMessage(`[Tạo việc thành công: ${taskTitle}](${taskUrl})`);
    },
    [sendMessage]
  );

  const isOnline = Boolean(
    activeConversation?.type === "direct" &&
      activeConversation.partnerId &&
      onlineUserIds.has(activeConversation.partnerId)
  );

  return (
    <div className="flex h-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
      {/* ====================================================================
       * CỘT 1: CHAT NAVIGATION & FILTERS
       * ==================================================================== */}
      <ChatSidebar
        conversations={conversations}
        allConversations={rawConversations}
        currentUser={currentUser}
        activeConversationId={activeConversationId}
        onSelectConversation={handleSelectConversation}
        activeFilter={activeFilter}
        onChangeFilter={setActiveFilter}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onlineUserIds={onlineUserIds}
        onTogglePinConversation={togglePinConversation}
        onToggleMuteConversation={toggleMuteConversation}
        onCreateGroupClick={() => setShowCreateGroupModal(true)}
        onRequestNotificationPermission={requestBrowserNotificationPermission}
        className={cn(!mobileShowSidebar && "hidden md:flex")}
      />

      {/* ====================================================================
       * CỘT 2: ACTIVE CONVERSATION STREAM & COMPOSER
       * ==================================================================== */}
      <ChatMessageArea
        conversation={activeConversation}
        conversations={rawConversations}
        messages={messages}
        currentUser={currentUser}
        allProfiles={allProfiles}
        loadingMessages={loadingMessages}
        typingUser={currentTypingUser}
        isOnline={isOnline}
        onSendMessage={sendMessage}
        onEditMessage={editMessage}
        onUnsendMessage={unsendMessage}
        onToggleReaction={toggleReaction}
        onTogglePin={togglePin}
        onForwardMessage={forwardMessage}
        onBroadcastTyping={broadcastTyping}
        onConvertToTask={setConvertModalMessage}
        onOpenThread={(msg) => {
          setActiveThreadMessage(msg);
          setShowContextPanel(false);
        }}
        onOpenContextPanel={() => {
          setShowContextPanel((p) => !p);
          setActiveThreadMessage(null);
        }}
        showContextPanelToggle={true}
        onBackToList={handleBackToMobileList}
        className={cn(mobileShowSidebar && "hidden md:flex")}
      />

      {/* ====================================================================
       * CỘT 3: COLLAPSIBLE CONTEXT PANEL (BÊN PHẢI)
       * ==================================================================== */}
      {showContextPanel && activeConversation && (
        <>
          {/* Desktop: side column */}
          <ChatContextPanel
            conversation={activeConversation}
            currentUser={currentUser}
            allProfiles={allProfiles}
            messages={messages}
            onClose={() => setShowContextPanel(false)}
            onScrollToMessage={(msgId) => {
              const el = document.getElementById(`unified-msg-${msgId}`);
              el?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            onTogglePinConversation={togglePinConversation}
            onToggleMuteConversation={toggleMuteConversation}
            onAddMembers={addMembersToGroup}
            onLeaveGroup={leaveGroup}
            className="hidden lg:flex"
          />

          {/* Mobile & Tablet (< 1024px): Overlay Drawer */}
          <div className="fixed inset-0 z-40 lg:hidden flex justify-end">
            <div
              className="fixed inset-0 bg-black/40 backdrop-blur-xs"
              onClick={() => setShowContextPanel(false)}
            />
            <div className="relative z-10 w-full sm:w-88 max-w-full h-full bg-white dark:bg-slate-900 shadow-2xl animate-in slide-in-from-right duration-200">
              <ChatContextPanel
                conversation={activeConversation}
                currentUser={currentUser}
                allProfiles={allProfiles}
                messages={messages}
                onClose={() => setShowContextPanel(false)}
                onScrollToMessage={(msgId) => {
                  setShowContextPanel(false);
                  const el = document.getElementById(`unified-msg-${msgId}`);
                  el?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
                onTogglePinConversation={togglePinConversation}
                onToggleMuteConversation={toggleMuteConversation}
                onAddMembers={addMembersToGroup}
                onLeaveGroup={leaveGroup}
                className="w-full h-full border-l-0"
              />
            </div>
          </div>
        </>
      )}

      {/* ====================================================================
       * NHÁNH THẢO LUẬN (THREAD DRAWER)
       * ==================================================================== */}
      {activeThreadMessage && (
        <>
          {/* Desktop: side column */}
          <ThreadDrawer
            parentMessage={activeThreadMessage}
            messages={messages}
            currentUser={currentUser}
            allProfiles={allProfiles}
            onClose={() => setActiveThreadMessage(null)}
            onSendMessage={sendMessage}
            onToggleReaction={toggleReaction}
            className="hidden lg:flex"
          />

          {/* Mobile & Tablet (< 1024px): Overlay Drawer */}
          <div className="fixed inset-0 z-40 lg:hidden flex justify-end">
            <div
              className="fixed inset-0 bg-black/40 backdrop-blur-xs"
              onClick={() => setActiveThreadMessage(null)}
            />
            <div className="relative z-10 w-full sm:w-96 max-w-full h-full bg-white dark:bg-slate-900 shadow-2xl animate-in slide-in-from-right duration-200">
              <ThreadDrawer
                parentMessage={activeThreadMessage}
                messages={messages}
                currentUser={currentUser}
                allProfiles={allProfiles}
                onClose={() => setActiveThreadMessage(null)}
                onSendMessage={sendMessage}
                onToggleReaction={toggleReaction}
                className="w-full h-full border-l-0"
              />
            </div>
          </div>
        </>
      )}

      {/* ====================================================================
       * MODAL TẠO TASK TỪ TIN NHẮN
       * ==================================================================== */}
      {convertModalMessage && (
        <ConvertMessageToTaskModal
          message={convertModalMessage}
          currentUser={currentUser}
          allProfiles={allProfiles}
          projects={allProjects}
          defaultAssigneeId={
            activeConversation?.type === "direct"
              ? activeConversation.partnerId
              : null
          }
          onClose={() => setConvertModalMessage(null)}
          onTaskCreated={handleTaskCreated}
        />
      )}

      {/* ====================================================================
       * MODAL TẠO NHÓM CHAT MỚI
       * ==================================================================== */}
      {showCreateGroupModal && (
        <CreateGroupModal
          currentUser={currentUser}
          allProfiles={allProfiles}
          onClose={() => setShowCreateGroupModal(false)}
          onCreateGroup={async (data) => {
            const newId = await createGroup(data);
            setShowCreateGroupModal(false);
            handleSelectConversation(newId);
          }}
        />
      )}
    </div>
  );
}
