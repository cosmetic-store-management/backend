/**
 * mapUser — Strip password và internal fields, trả về safe response.
 * Dùng chung bởi auth.service và user.service.
 */
export const mapUser = (user) => ({
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
    hasPassword: !!user.password,
    dob: user.dob,
    gender: user.gender,
    favorites: user.favorites,
    recentlyViewed: user.recentlyViewed,
    avatar: user.avatar,
});
