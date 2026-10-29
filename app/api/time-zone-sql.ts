export const SELECT_USER_TIME_ZONE = "SELECT time_zone AS timeZone FROM settings WHERE user_id = ?";

// Bind: zone, user id, zone. Writes only when the stored zone differs.
export const REMEMBER_TIME_ZONE = `
  UPDATE settings
  SET time_zone = ?, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = ? AND time_zone <> ?
`;
