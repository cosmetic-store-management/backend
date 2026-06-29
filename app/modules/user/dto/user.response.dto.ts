import type { UserDocument } from "../models/user.schema.js";

export interface UserResponse {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  addresses: any[];
  role: string;
  permissions?: string[];
  isActive: boolean;
  points: number;
  internalNotes?: string;
  hasOnlineAccount?: boolean;
  dob?: Date;
  gender?: "male" | "female" | "other";
  favorites?: any[];
  recentlyViewed?: any[];
  avatar?: string;
}

/**
 * mapUser — Strip password và internal fields, trả về safe response.
 * Dùng chung bởi auth.service và user.service.
 */
export const mapUser = (user: UserDocument): UserResponse => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  phone: user.phone,
  addresses: user.addresses || [],
  role: user.role,
  permissions: user.permissions || [],
  isActive: user.isActive,
  points: user.points || 0,
  internalNotes: user.internalNotes,
  hasOnlineAccount: !!user.password || (user.providers && user.providers.length > 0),
  dob: user.dob,
  gender: user.gender,
  favorites: user.favorites,
  recentlyViewed: user.recentlyViewed,
  avatar: user.avatar,
});
