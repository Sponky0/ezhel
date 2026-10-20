export const LicenseConfig = {
  // Hardcoded offline expiration date (UTC ISO String)
  // If the device date is past this date, the app will lock automatically.
  OFFLINE_EXPIRY_DATE: '2030-12-31T23:59:59.000Z',

  // Expected package name to prevent cloning/re-packaging
  EXPECTED_PACKAGE_NAME: 'app.napan.mobile',

  // Allow offline usage up to 48 hours (in milliseconds) before requiring an online check
  GRACE_PERIOD_MS: 48 * 60 * 60 * 1000, // 48 hours

  // Local storage keys
  STORAGE_KEY_LAST_CHECK: 'rancha_license_last_check',
  STORAGE_KEY_OFFLINE_ALLOWED: 'rancha_license_offline_allowed',
};
