import { getSettings } from "../../setting/setting.service.js";
export const POINTS_EARN_RATE = 100;
export const MAX_POINTS_PCT = 0.5;
export const getOrderSettings = async () => {
    const s = (await getSettings());
    return {
        pointsEarnRate: (s?.pointsEarnRate ?? POINTS_EARN_RATE),
        maxPointsPct: ((s?.maxPointsPct ?? 50) / 100),
    };
};
export const ALLOWED_TRANSITIONS = {
    pending: ["processing", "cancelled"],
    processing: ["shipping", "cancelled"],
    shipping: ["completed", "returned"],
    completed: ["return_pending", "returned"],
    cancelled: [],
    returned: [],
    return_pending: ["returned", "completed"],
};
export const generateOrderCode = () => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const random = Math.floor(100000 + Math.random() * 900000);
    return `GLU-${yyyy}${mm}${dd}-${random}`;
};
export const calculateTierDiscount = (userTotalSpent, subtotal) => {
    if (userTotalSpent >= 20000000)
        return subtotal * 0.15; // Diamond
    if (userTotalSpent >= 10000000)
        return subtotal * 0.1; // Gold
    if (userTotalSpent >= 5000000)
        return subtotal * 0.05; // Silver
    return 0; // Bronze
};
