import type { UserResponse } from "../../user/dto/user.response.dto.js";

/**
 * AuthResponse — Shape của response trả về sau các thao tác xác thực
 * (register, login, refresh token).
 */
export interface AuthResponse {
  user: UserResponse;
  accessToken: string;
  refreshToken: string;
}

/**
 * TokenResponse — Shape của response khi chỉ cần cặp token mới (refresh).
 */
export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
}
