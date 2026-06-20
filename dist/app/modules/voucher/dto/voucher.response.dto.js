export const mapVoucher = (voucher) => ({
    id: voucher._id.toString(),
    code: voucher.code,
    discountType: voucher.discountType,
    discountValue: voucher.discountValue,
    minOrderValue: voucher.minOrderValue,
    maxDiscount: voucher.maxDiscount,
    startDate: voucher.startDate.toISOString(),
    endDate: voucher.endDate.toISOString(),
    usageLimit: voucher.usageLimit,
    usedCount: voucher.usedCount,
    isActive: voucher.isActive,
});
