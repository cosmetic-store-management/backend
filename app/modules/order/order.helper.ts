import { getSettings } from "../setting/setting.service.js";

export const POINTS_EARN_RATE = 100;
export const MAX_POINTS_PCT = 0.5;
export const DEFAULT_ITEM_WEIGHT_G = 200;
export const WEIGHT_SURCHARGE_STEP_G = 500;
export const WEIGHT_SURCHARGE_PER_STEP = 2000;
export const WEIGHT_BASE_G = 1000;

export const FREE_SHIP_THRESHOLD = 500000;
export const DEFAULT_SHIPPING_FEE = 30000;

export const getOrderSettings = async () => {
  const s = await getSettings() as any;
  return {
    standardShippingFee:   (s?.standardShippingFee   ?? DEFAULT_SHIPPING_FEE) as number,
    freeShippingThreshold: (s?.freeShippingThreshold ?? FREE_SHIP_THRESHOLD)  as number,
    pointsEarnRate:        (s?.pointsEarnRate         ?? POINTS_EARN_RATE)     as number,
    maxPointsPct:          ((s?.maxPointsPct          ?? 50) / 100)            as number,
  };
};

export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending:   ["processing", "cancelled"],
  processing:["shipping", "cancelled"],
  shipping:  ["completed", "returned"],
  completed: ["returned"],
  cancelled: [],
  returned:  []
};

export const generateOrderCode = (): string => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const random = Math.floor(100 + Math.random() * 900);
  return `GLU-${yyyy}${mm}${dd}-${random}`;
};

export const calculateTierDiscount = (userTotalSpent: number, subtotal: number): number => {
  if (userTotalSpent >= 20000000) return subtotal * 0.15; // Diamond
  if (userTotalSpent >= 10000000) return subtotal * 0.10; // Gold
  if (userTotalSpent >= 5000000)  return subtotal * 0.05; // Silver
  return 0; // Bronze
};
