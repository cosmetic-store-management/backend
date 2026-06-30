/**
 * TIER CONSTANTS — Single source of truth cho toàn hệ thống.
 *
 * Cơ sở nghiên cứu:
 *  - Shopee Rewards VN: 4 bậc dựa trên tổng chi tiêu + số đơn (6-month cycle)
 *  - Tiki VIP: Tương tự, 4 bậc spending-based
 *  - Sephora Beauty Insider: Annual spending-based
 *
 * Quyết định: Dùng tổng chi tiêu từ đơn COMPLETED (không tính cancelled/returned)
 * để xác định hạng. Tự động, không cần admin can thiệp thủ công.
 */

export type TierKey = "member" | "silver" | "gold" | "diamond";

export interface TierConfig {
  key: TierKey;
  label: string; // Tên hiển thị VN
  labelEn: string; // Tên tiếng Anh
  minSpent: number; // Tổng chi tiêu tối thiểu (VNĐ) — all-time completed orders
  discount: number; // Tỉ lệ giảm giá áp dụng khi checkout (0-1)
  color: string; // Tailwind gradient class
  badgeClass: string; // Badge color class
  textColor: string; // Text color for display
}

export const TIERS: TierConfig[] = [
  {
    key: "diamond",
    label: "Diamond",
    labelEn: "Diamond",
    minSpent: 10_000_000, // ≥ 10 triệu VNĐ
    discount: 0.1, // 10%
    color: "from-violet-600 to-indigo-700",
    badgeClass: "bg-violet-100 text-violet-700 border-violet-200",
    textColor: "text-violet-600",
  },
  {
    key: "gold",
    label: "Gold",
    labelEn: "Gold",
    minSpent: 5_000_000, // ≥ 5 triệu VNĐ
    discount: 0.05, // 5%
    color: "from-yellow-500 to-amber-600",
    badgeClass: "bg-yellow-100 text-yellow-700 border-yellow-200",
    textColor: "text-yellow-600",
  },
  {
    key: "silver",
    label: "Silver",
    labelEn: "Silver",
    minSpent: 1_000_000, // ≥ 1 triệu VNĐ
    discount: 0.02, // 2%
    color: "from-slate-400 to-slate-600",
    badgeClass: "bg-slate-100 text-slate-600 border-slate-200",
    textColor: "text-slate-600",
  },
  {
    key: "member",
    label: "Member",
    labelEn: "Member",
    minSpent: 0,
    discount: 0, // 0%
    color: "from-emerald-500 to-teal-600",
    badgeClass: "bg-emerald-100 text-emerald-700 border-emerald-200",
    textColor: "text-emerald-600",
  },
];

/**
 * Xác định tier dựa trên tổng chi tiêu.
 */
export const getTierBySpending = (totalSpent: number): TierConfig => {
  for (const tier of TIERS) {
    if (totalSpent >= tier.minSpent) return tier;
  }
  return TIERS[TIERS.length - 1]; // member
};

/**
 * Lấy tier tiếp theo (null nếu đã là Diamond).
 */
export const getNextTier = (currentKey: TierKey): TierConfig | null => {
  const idx = TIERS.findIndex((t) => t.key === currentKey);
  if (idx <= 0) return null;
  return TIERS[idx - 1];
};

/**
 * Tính giảm giá tier tại checkout.
 * @param totalSpent - tổng chi tiêu lịch sử (VNĐ) từ completed orders
 * @param subtotal   - giá trị đơn hiện tại (trước shipping)
 */
export const calculateTierDiscount = (
  totalSpent: number,
  subtotal: number,
): number => {
  const tier = getTierBySpending(totalSpent);
  return Math.floor(subtotal * tier.discount);
};
