// ── Inventory Response DTOs ───────────────────────────────────────────────────
export function mapSupplier(doc) {
    return {
        id: doc._id.toString(),
        name: doc.name,
        phone: doc.phone,
        email: doc.email,
        address: doc.address,
    };
}
export function mapGoodsReceipt(doc) {
    return {
        id: doc._id.toString(),
        code: doc.code,
        supplierId: doc.supplierId?.toString(),
        items: (doc.items || []).map((item) => ({
            productId: item.productId?.toString(),
            variantId: item.variantId?.toString(),
            productName: item.productName,
            variantName: item.variantName,
            quantity: item.quantity,
            importPrice: item.importPrice,
        })),
        totalAmount: doc.totalAmount,
        createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : "",
    };
}
