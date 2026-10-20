import { supabase } from "./supabase";

type ConversationRpcRow = {
  conversation_id: string;
  is_new: boolean;
};

/**
 * Finds an existing 1:1 conversation between the current Supabase user and the
 * target user, or creates one via an RLS-safe database function.
 */
export async function findOrCreateConversation(
  myId: string,
  otherId: string,
): Promise<{ conversationId: string; isNew: boolean }> {
  if (!myId || !otherId) {
    throw new Error("Kullanici bilgisi eksik.");
  }

  const { data, error } = await supabase
    .rpc("find_or_create_conversation", { other_user_id: otherId })
    .single();

  if (error) throw error;
  const row = data as ConversationRpcRow | null;
  if (!row) throw new Error("Konusma olusturulamadi.");

  return {
    conversationId: row.conversation_id,
    isNew: row.is_new,
  };
}
