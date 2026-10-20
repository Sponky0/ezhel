import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

import Constants from "expo-constants";

type UnreadByConversation = Record<string, number>;

interface UnreadMessagesContextType {
  totalUnread: number;
  unreadByConversation: UnreadByConversation;
  activeConversationId: string | null;
  refreshUnreadCount: () => Promise<void>;
  markConversationRead: (conversationId: string) => Promise<void>;
  setActiveConversationId: (conversationId: string | null) => void;
}

const UnreadMessagesContext = createContext<UnreadMessagesContextType | undefined>(undefined);

let Notifications: any = null;
let canSetBadge = false;

const isExpoGo = Constants.appOwnership === "expo";

if (Platform.OS !== "web" && !isExpoGo) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Notifications = require("expo-notifications");
    canSetBadge = !!Notifications?.setBadgeCountAsync;
  } catch {
    canSetBadge = false;
  }
}

async function setAppBadge(count: number) {
  if (!canSetBadge || !Notifications) return;

  try {
    await Notifications.setBadgeCountAsync(count);
  } catch (error) {
    console.warn("Failed to update app badge count:", error);
  }
}

export function UnreadMessagesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [unreadByConversation, setUnreadByConversation] = useState<UnreadByConversation>({});
  const [activeConversationId, setActiveConversationIdState] = useState<string | null>(null);
  const activeConversationIdRef = useRef<string | null>(null);

  const totalUnread = useMemo(
    () => Object.values(unreadByConversation).reduce((sum, count) => sum + count, 0),
    [unreadByConversation],
  );

  useEffect(() => {
    setAppBadge(totalUnread);
  }, [totalUnread]);

  const setActiveConversationId = useCallback((conversationId: string | null) => {
    activeConversationIdRef.current = conversationId;
    setActiveConversationIdState(conversationId);
  }, []);

  const refreshUnreadCount = useCallback(async () => {
    if (!userId) {
      setUnreadByConversation({});
      return;
    }

    try {
      const { data: participants, error } = await supabase
        .from("conversation_participants")
        .select("conversation_id, last_read_at")
        .eq("user_id", userId);

      if (error) throw error;

      const unreadEntries = await Promise.all(
        (participants || []).map(async (participant: any) => {
          let query = supabase
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("conversation_id", participant.conversation_id)
            .neq("sender_id", userId)
            .is("deleted_at", null);

          if (participant.last_read_at) {
            query = query.gt("created_at", participant.last_read_at);
          }

          const { count, error: countError } = await query;
          if (countError) throw countError;

          return [participant.conversation_id, count || 0] as const;
        }),
      );

      setUnreadByConversation(
        unreadEntries.reduce<UnreadByConversation>((acc, [conversationId, count]) => {
          if (count > 0) acc[conversationId] = count;
          return acc;
        }, {}),
      );
    } catch (error) {
      console.error("Error refreshing unread message count:", error);
    }
  }, [userId]);

  const markConversationRead = useCallback(
    async (conversationId: string) => {
      if (!userId || !conversationId) return;

      setUnreadByConversation((prev) => {
        if (!prev[conversationId]) return prev;
        const next = { ...prev };
        delete next[conversationId];
        return next;
      });

      try {
        const { error } = await supabase.rpc("mark_conversation_read", {
          read_conversation_id: conversationId,
        });

        if (error) throw error;
      } catch (error) {
        console.error("Error marking conversation as read:", error);
        refreshUnreadCount();
      }
    },
    [refreshUnreadCount, userId],
  );

  useEffect(() => {
    if (!userId) {
      const timer = setTimeout(() => {
        setActiveConversationId(null);
        setUnreadByConversation({});
        setAppBadge(0);
      }, 0);

      return () => clearTimeout(timer);
    }

    const refreshTimer = setTimeout(() => {
      refreshUnreadCount();
    }, 0);

    const channel = supabase
      .channel(`unread_messages:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const message = payload.new as any;
          if (!message?.conversation_id || message.sender_id === userId) return;

          if (activeConversationIdRef.current === message.conversation_id) {
            markConversationRead(message.conversation_id);
            return;
          }

          setUnreadByConversation((prev) => ({
            ...prev,
            [message.conversation_id]: (prev[message.conversation_id] || 0) + 1,
          }));
        },
      )
      .subscribe();

    return () => {
      clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [markConversationRead, refreshUnreadCount, setActiveConversationId, userId]);

  const value = useMemo(
    () => ({
      totalUnread,
      unreadByConversation,
      activeConversationId,
      refreshUnreadCount,
      markConversationRead,
      setActiveConversationId,
    }),
    [
      activeConversationId,
      markConversationRead,
      refreshUnreadCount,
      setActiveConversationId,
      totalUnread,
      unreadByConversation,
    ],
  );

  return (
    <UnreadMessagesContext.Provider value={value}>
      {children}
    </UnreadMessagesContext.Provider>
  );
}

export function useUnreadMessages() {
  const context = useContext(UnreadMessagesContext);
  if (!context) {
    throw new Error("useUnreadMessages must be used within an UnreadMessagesProvider");
  }
  return context;
}
