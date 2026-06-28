import mongoose from "mongoose";
import Order from "../app/models/order/order.schema";
import "dotenv/config";
const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB");
        const orders = await Order.find({ orderStatus: "completed" });
        console.log(`Found ${orders.length} completed orders. Adjusting cost prices...`);
        const bulkOps = [];
        for (const order of orders) {
            // Chúng ta muốn lợi nhuận gộp ngẫu nhiên từ 30% đến 45% (nghĩa là giá vốn từ 55% đến 70% doanh thu)
            const randomCostPercent = (Math.floor(Math.random() * 15) + 55) / 100; // 0.55 - 0.70
            let newTotalCost = 0;
            const newItems = order.items.map((item) => {
                // Giá vốn của từng món hàng
                const itemCost = Math.round(item.lineTotal * randomCostPercent);
                newTotalCost += itemCost;
                return {
                    ...item,
                    costPriceTotal: itemCost
                };
            });
            bulkOps.push({
                updateOne: {
                    filter: { _id: order._id },
                    update: {
                        $set: {
                            items: newItems,
                            totalCost: newTotalCost
                        }
                    },
                },
            });
        }
        if (bulkOps.length > 0) {
            console.log(`Executing ${bulkOps.length} bulk updates...`);
            await Order.bulkWrite(bulkOps);
            console.log("Cost adjustment completed successfully!");
        }
        else {
            console.log("No updates needed.");
        }
    }
    catch (error) {
        console.error("Error:", error);
    }
    finally {
        process.exit(0);
    }
};
run();
