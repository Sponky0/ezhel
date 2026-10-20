import { supabase } from './supabase';
let active: { userId: string; token: string } | null = null;
let pending: Promise<unknown> = Promise.resolve();
export async function registerDevicePushToken(userId: string, token: string) {
  active = { userId, token };
  const task = pending.catch(() => undefined).then(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user.id !== userId) return;
    const { error } = await supabase.rpc('register_push_token', { p_token: token });
    if (error) throw error;
  });
  pending = task;
  return task;
}
export async function detachPushRegistration(userId: string) {
  await pending.catch(() => undefined);
  const registration = active;
  if (registration?.userId === userId) {
    const { error } = await supabase.rpc('unregister_push_token', { p_token: registration.token });
    if (error) throw error;
  } else {
    const { error } = await supabase.from('profiles').update({ expo_push_token: null }).eq('id', userId);
    if (error) throw error;
  }
  active = null;
}
