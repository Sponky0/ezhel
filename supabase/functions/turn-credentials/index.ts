import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

async function hmacSha1Base64(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );

  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const turnSecret = Deno.env.get("TURN_SECRET");
  const turnDomain = Deno.env.get("TURN_DOMAIN") ?? "turn.kodmatex.com";
  const ttlSeconds = Number(Deno.env.get("TURN_TTL_SECONDS") ?? "600");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authHeader = req.headers.get("Authorization") ?? "";

  if (!turnSecret || !supabaseUrl || !supabaseAnonKey) {
    return json({ error: "TURN credential service is not configured." }, 500);
  }

  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "Authentication required." }, 401);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return json({ error: "Authentication required." }, 401);
  }

  const expiresAtSeconds = Math.floor(Date.now() / 1000) + ttlSeconds;
  const username = `${expiresAtSeconds}:${user.id}`;
  const credential = await hmacSha1Base64(turnSecret, username);

  return json({
    expiresAt: expiresAtSeconds * 1000,
    iceServers: [
      { urls: `stun:${turnDomain}:3478` },
      {
        urls: [
          `turn:${turnDomain}:3478?transport=udp`,
          `turn:${turnDomain}:3478?transport=tcp`,
          `turns:${turnDomain}:5349?transport=tcp`,
        ],
        username,
        credential,
      },
    ],
  });
});
