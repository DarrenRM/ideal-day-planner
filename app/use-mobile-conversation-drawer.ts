"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { resolveMobileDrawerInitialOpen } from "./mobile-conversation-drawer-state";

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
  messages,
}: {
  activityId: string;
  canCollapse: boolean;
  contentReady: boolean;
  hasConversationJob: boolean;
  openOnMount?: boolean;
  messages: DrawerMessage[];
}) {
  const [preferredOpen, setPreferredOpen] = useState(false);
  const [hasUnreadLuna, setHasUnreadLuna] = useState(false);
  const [readyActivityId, setReadyActivityId] = useState<string | null>(null);
  const preferenceReadyRef = useRef(false);
  const preferredOpenRef = useRef(false);
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
    const latestLunaMessageId = [...messages].reverse().find((message) => message.author === "luna")?.id ?? null;
    const restoredOpen = resolveMobileDrawerInitialOpen({
      canCollapse,
      hasConversation: messages.length > 0,
      hasConversationJob,
      openOnMount,
      savedOpen: preference.open,
    });
    preferredOpenRef.current = restoredOpen;
    explicitOpenRef.current = preference.open;
    latestLunaMessageIdRef.current = latestLunaMessageId;
    lastSeenLunaMessageIdRef.current = preference.lastSeenLunaMessageId;
    const frame = window.requestAnimationFrame(() => {
      setPreferredOpen(restoredOpen);
      setHasUnreadLuna(Boolean(canCollapse && !restoredOpen && latestLunaMessageId && latestLunaMessageId !== preference.lastSeenLunaMessageId));
      if (restoredOpen && latestLunaMessageId) {
        lastSeenLunaMessageIdRef.current = latestLunaMessageId;
        savePreference(activityId, { open: preference.open, lastSeenLunaMessageId: latestLunaMessageId });
      }
      initializedActivityIdRef.current = activityId;
      preferenceReadyRef.current = true;
      setReadyActivityId(activityId);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activityId, canCollapse, contentReady, hasConversationJob, messages, openOnMount]);

  useEffect(() => {
    const latestMessageId = [...messages].reverse().find((message) => message.author === "luna")?.id ?? null;
    latestLunaMessageIdRef.current = latestMessageId;
    const frame = window.requestAnimationFrame(() => {
      if (!preferenceReadyRef.current) return;
      if (isOpen) {
        lastSeenLunaMessageIdRef.current = latestMessageId;
        setHasUnreadLuna(false);
        savePreference(activityId, { open: explicitOpenRef.current, lastSeenLunaMessageId: latestMessageId });
      } else if (latestMessageId && latestMessageId !== lastSeenLunaMessageIdRef.current) {
        setHasUnreadLuna(true);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activityId, isOpen, messages]);

  function setOpen(open: boolean) {
    if (!window.matchMedia("(max-width: 680px)").matches) return;
    if (!open && !canCollapse) return;
    preferredOpenRef.current = open;
    explicitOpenRef.current = open;
    setPreferredOpen(open);
    if (open) {
      lastSeenLunaMessageIdRef.current = latestLunaMessageIdRef.current;
      setHasUnreadLuna(false);
    }
    savePreference(activityId, {
      open,
      lastSeenLunaMessageId: open ? latestLunaMessageIdRef.current : lastSeenLunaMessageIdRef.current,
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
    hasUnreadLuna,
    isOpen,
    isPreferenceReady: readyActivityId === activityId,
    setOpen,
    toggle,
  };
}
