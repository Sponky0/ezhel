import { supabase } from "./supabase";

type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

const fallbackIceServers: IceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

let cachedIceServers: {
  iceServers: IceServer[];
  expiresAt: number;
} | null = null;

export async function getIceServers(): Promise<IceServer[]> {
  if (cachedIceServers && Date.now() + 60_000 < cachedIceServers.expiresAt) {
    return cachedIceServers.iceServers;
  }

  try {
    const { data, error } = await supabase.functions.invoke<{
      iceServers: IceServer[];
      expiresAt: number;
    }>("turn-credentials");

    if (error) throw error;
    if (!data?.iceServers?.length || !data.expiresAt) {
      throw new Error("TURN credentials response is invalid.");
    }

    cachedIceServers = data;
    return data.iceServers;
  } catch (error) {
    console.warn("Falling back to public STUN servers:", error);
    return fallbackIceServers;
  }
}
