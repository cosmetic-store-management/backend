import Variant from "../../../app/models/product/variant.schema.js";
const InventoryCheck = {
    name: "Negative Inventory Check",
    description: "Phát hiện các sản phẩm có số lượng tồn kho âm (< 0)",
    async run() {
        const issues = [];
        const negativeVariants = await Variant.find({ stock: { $lt: 0 } }).lean();
        for (const variant of negativeVariants) {
            issues.push({
                message: `Sản phẩm biến thể (Variant) có SKU ${variant.sku} đang có tồn kho âm: ${variant.stock}`,
                severity: "error",
                data: {
                    variantId: variant._id,
                    productId: variant.productId,
                    sku: variant.sku,
                    stock: variant.stock
                }
            });
        }
        return issues;
    }
};
export default InventoryCheck;
