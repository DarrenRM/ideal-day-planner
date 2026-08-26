"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  latestLunaMessageId,
  resolveMobileDrawerInitialOpen,
  shouldShowUnreadLunaBoundary,
  unreadLunaMessageId,
} from "./mobile-conversation-drawer-state";

const STORAGE_KEY = "idealized-day-mobile-drawer-v2";

type DrawerMessage = { id: string; author: "user" | "luna" };
type DrawerPreference = { open: boolean | null; lastSeenLunaMessageId: string | null };

function readPreference(activityId: string): DrawerPreference {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}") as Record<string, Partial<DrawerPreference>>;
    return {
      open: typeof saved[activityId]?.open === "boolean" ? saved[activityId].open : null,
      lastSeenLunaMessageId: typeof saved[activityId]?.lastSeenLunaMessageId === "string"
        ? saved[activityId].lastSeenLunaMessageId
        : null,
    };
  } catch {
    return { open: null, lastSeenLunaMessageId: null };
  }
}

function savePreference(activityId: string, preference: DrawerPreference) {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}") as Record<string, Partial<DrawerPreference>>;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...saved, [activityId]: preference }));
  } catch {
    // Device-local drawer memory is helpful, but never blocks an activity.
  }
}

export function useMobileConversationDrawer({
  activityId,
  canCollapse,
  contentReady,
  hasConversationJob,
  openOnMount = false,
  preferConversation = false,
  messages,
}: {
  activityId: string;
  canCollapse: boolean;
  contentReady: boolean;
  hasConversationJob: boolean;
  openOnMount?: boolean;
  preferConversation?: boolean;
  messages: DrawerMessage[];
}) {
  const [preferredOpen, setPreferredOpen] = useState(false);
  const [unreadMessageId, setUnreadMessageId] = useState<string | null>(null);
  const [unreadBoundaryMessageId, setUnreadBoundaryMessageId] = useState<string | null>(null);
  const [readyActivityId, setReadyActivityId] = useState<string | null>(null);
  const preferenceReadyRef = useRef(false);
  const explicitOpenRef = useRef<boolean | null>(null);
  const initializedActivityIdRef = useRef<string | null>(null);
  const latestLunaMessageIdRef = useRef<string | null>(null);
  const lastSeenLunaMessageIdRef = useRef<string | null>(null);
  const pointerStartRef = useRef<number | null>(null);
  const gestureRef = useRef(false);
  const isOpen = canCollapse ? preferredOpen : true;

  useEffect(() => {
    if (!contentReady || initializedActivityIdRef.current === activityId) return;
    preferenceReadyRef.current = false;
    const preference = readPreference(activityId);
    const latestMessageId = latestLunaMessageId(messages);
    const nextUnreadMessageId = unreadLunaMessageId(latestMessageId, preference.lastSeenLunaMessageId);
    const restoredOpen = resolveMobileDrawerInitialOpen({
      canCollapse,
      hasConversation: messages.length > 0,
      hasConversationJob,
      openOnMount,
      preferConversation,
      savedOpen: preference.open,
    });
    explicitOpenRef.current = preference.open;
    latestLunaMessageIdRef.current = latestMessageId;
    lastSeenLunaMessageIdRef.current = preference.lastSeenLunaMessageId;
    const frame = window.requestAnimationFrame(() => {
      setPreferredOpen(restoredOpen);
      setUnreadMessageId(nextUnreadMessageId);
      setUnreadBoundaryMessageId(nextUnreadMessageId);
      initializedActivityIdRef.current = activityId;
      preferenceReadyRef.current = true;
      setReadyActivityId(activityId);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activityId, canCollapse, contentReady, hasConversationJob, messages, openOnMount, preferConversation]);

  useEffect(() => {
    const latestMessageId = latestLunaMessageId(messages);
    latestLunaMessageIdRef.current = latestMessageId;
    const frame = window.requestAnimationFrame(() => {
      if (!preferenceReadyRef.current) return;
      const nextUnreadMessageId = unreadLunaMessageId(latestMessageId, lastSeenLunaMessageIdRef.current);
      setUnreadMessageId(nextUnreadMessageId);
      if (nextUnreadMessageId && shouldShowUnreadLunaBoundary({
        isInitialLoad: false,
        isDrawerOpen: isOpen,
        isDocumentVisible: document.visibilityState === "visible",
      })) {
        setUnreadBoundaryMessageId(nextUnreadMessageId);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen, messages]);

  const markLatestLunaRead = useCallback(() => {
    const latestMessageId = latestLunaMessageIdRef.current;
    if (!latestMessageId || latestMessageId === lastSeenLunaMessageIdRef.current) return;
    lastSeenLunaMessageIdRef.current = latestMessageId;
    setUnreadMessageId(null);
    setUnreadBoundaryMessageId(null);
    savePreference(activityId, {
      open: explicitOpenRef.current,
      lastSeenLunaMessageId: latestMessageId,
    });
  }, [activityId]);

  const markUnreadLunaBoundary = useCallback((messageId: string) => {
    if (messageId !== latestLunaMessageIdRef.current || messageId === lastSeenLunaMessageIdRef.current) return;
    setUnreadBoundaryMessageId(messageId);
  }, []);

  function setOpen(open: boolean) {
    if (!window.matchMedia("(max-width: 680px)").matches) return;
    if (!open && !canCollapse) return;
    explicitOpenRef.current = open;
    setPreferredOpen(open);
    savePreference(activityId, {
      open,
      lastSeenLunaMessageId: lastSeenLunaMessageIdRef.current,
    });
  }

  function toggle() {
    if (gestureRef.current) {
      gestureRef.current = false;
      return;
    }
    setOpen(!isOpen);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    pointerStartRef.current = event.clientY;
    gestureRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (start === null) return;
    const distance = event.clientY - start;
    if (Math.abs(distance) < 36) return;
    gestureRef.current = true;
    setOpen(distance < 0);
  }

  function handlePointerCancel() {
    pointerStartRef.current = null;
  }

  return {
    handlePointerCancel,
    handlePointerDown,
    handlePointerUp,
    hasUnreadLuna: unreadMessageId !== null,
    isOpen,
    isPreferenceReady: readyActivityId === activityId,
    markLatestLunaRead,
    markUnreadLunaBoundary,
    setOpen,
    toggle,
    unreadBoundaryLunaMessageId: unreadBoundaryMessageId,
    unreadLunaMessageId: unreadMessageId,
  };
}
