import { Platform } from "react-native";
import Purchases, {
  CustomerInfo,
  LOG_LEVEL,
  PurchasesOfferings,
  PurchasesPackage,
} from "react-native-purchases";

const REVENUECAT_KEYS = {
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY || "",
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY || "",
};

export const REVENUECAT_ENTITLEMENT_VIP = "vip_access";

let isRevenueCatInitialized = false;

/**
 * RevenueCat SDK initialization.
 * Call this early in app lifecycle (e.g. AuthContext or root layout).
 */
export async function initRevenueCat(userId?: string): Promise<boolean> {
  try {
    const apiKey = Platform.select({
      ios: REVENUECAT_KEYS.ios,
      android: REVENUECAT_KEYS.android,
      default: "",
    });

    if (!apiKey) {
      console.log(
        "[RevenueCat] API Key not set for current platform. Skipping initialization.",
      );
      return false;
    }

    if (__DEV__) {
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    }

    await Purchases.configure({ apiKey, appUserID: userId });
    isRevenueCatInitialized = true;
    console.log("[RevenueCat] SDK configured successfully.");

    if (userId) {
      await Purchases.logIn(userId);
    }

    return true;
  } catch (error) {
    console.error("[RevenueCat] Initialization error:", error);
    return false;
  }
}

/**
 * Identify user with unique database UID upon login.
 */
export async function identifyUser(userId: string): Promise<CustomerInfo | null> {
  if (!isRevenueCatInitialized) return null;
  try {
    const { customerInfo } = await Purchases.logIn(userId);
    return customerInfo;
  } catch (error) {
    console.error("[RevenueCat] User identification error:", error);
    return null;
  }
}

/**
 * Reset RevenueCat session upon logout.
 */
export async function resetUserSession(): Promise<CustomerInfo | null> {
  if (!isRevenueCatInitialized) return null;
  try {
    const customerInfo = await Purchases.logOut();
    return customerInfo;
  } catch (error) {
    console.error("[RevenueCat] Logout error:", error);
    return null;
  }
}

/**
 * Fetch available offerings (products & packages configured in RevenueCat dashboard).
 */
export async function getRevenueCatOfferings(): Promise<PurchasesOfferings | null> {
  if (!isRevenueCatInitialized) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings;
  } catch (error) {
    console.error("[RevenueCat] Fetch offerings error:", error);
    return null;
  }
}

/**
 * Execute store purchase for a given package.
 */
export async function purchaseRevenueCatPackage(
  rcPackage: PurchasesPackage,
): Promise<{ customerInfo?: CustomerInfo; userCancelled: boolean; error?: any }> {
  if (!isRevenueCatInitialized) {
    return {
      userCancelled: false,
      error: new Error("RevenueCat is not initialized"),
    };
  }

  try {
    const { customerInfo } = await Purchases.purchasePackage(rcPackage);
    return { customerInfo, userCancelled: false };
  } catch (error: any) {
    if (error.userCancelled) {
      return { userCancelled: true };
    }
    console.error("[RevenueCat] Purchase package error:", error);
    return { userCancelled: false, error };
  }
}

/**
 * Restore past purchases.
 */
export async function restoreRevenueCatPurchases(): Promise<CustomerInfo | null> {
  if (!isRevenueCatInitialized) return null;
  try {
    const customerInfo = await Purchases.restorePurchases();
    return customerInfo;
  } catch (error) {
    console.error("[RevenueCat] Restore purchases error:", error);
    return null;
  }
}

/**
 * Check if the active user possesses VIP entitlement.
 */
export async function checkIsVipActive(): Promise<boolean> {
  if (!isRevenueCatInitialized) return false;
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return (
      typeof customerInfo.entitlements.active[REVENUECAT_ENTITLEMENT_VIP] !==
      "undefined"
    );
  } catch (error) {
    console.error("[RevenueCat] Check VIP status error:", error);
    return false;
  }
}
