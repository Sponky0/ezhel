export interface Report {
  id: string;
  reason: string;
  status: "pending" | "reviewed" | "resolved";
  created_at: string;
  reporter_id: string;
  reported_id: string;
  reporter_username?: string;
  reported_username?: string;
}

export interface UserProfile {
  id: string;
  username: string;
  avatar_url: string | null;
  role: "user" | "admin";
  is_vip: boolean;
  banned_at: string | null;
  created_at: string;
  phone_number?: string | null;
  is_verified?: boolean;
  is_bot?: boolean;
  is_online?: boolean;
  diamonds?: number;
  vip_until?: string | null;
}

export interface BotProfile {
  id: string;
  username: string;
  avatar_url: string | null;
  role: "user" | "admin";
  is_vip: boolean;
  is_online: boolean;
  banned_at: string | null;
  created_at: string;
  age: number | null;
  gender: "male" | "female" | null;
  city: string | null;
  bio: string | null;
  is_bot: boolean;
}

export interface DiamondPackage {
  id: string;
  amount: number;
  price: number;
  badge: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface DiamondWithdrawalRequest {
  id: string;
  user_id: string;
  diamond_amount: number;
  diamond_unit_price: number;
  payout_percentage: number;
  gross_cash_amount: number;
  user_cash_amount: number;
  app_cash_amount: number;
  bank_name: string;
  iban: string;
  account_holder_name: string;
  user_note: string | null;
  admin_note: string | null;
  status: "pending" | "approved" | "completed" | "cancelled";
  created_at: string;
  username?: string;
}

export interface DeletedMessage {
  id: string;
  content: string | null;
  media_url: string | null;
  created_at: string;
  deleted_at: string;
  sender_id: string;
  sender_username?: string;
}

export interface AdminStats {
  totalUsers: number;
  totalRealUsers: number;
  totalBots: number;
  onlineUsers: number;
  vipUsers: number;
  pendingReports: number;
  deletedMessages: number;
  pendingWithdrawals: number;
}
