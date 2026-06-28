import mongoose from "mongoose";
import Order from "../app/models/order/order.schema";
import "dotenv/config";
const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB");
        const orders = await Order.find({ orderStatus: "completed" });
        console.log(`Found ${orders.length} completed orders. Simulating clearance sale (loss)...`);
        const bulkOps = [];
        for (const order of orders) {
            // Giả lập xả lỗ: Giá vốn (Cost) = 120% - 130% Giá bán (Revenue)
            const lossPercent = (Math.floor(Math.random() * 10) + 120) / 100; // 1.20 - 1.30
            let newTotalCost = 0;
            const newItems = order.items.map((item) => {
                const itemCost = Math.round(item.lineTotal * lossPercent);
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
            console.log(`Executing ${bulkOps.length} bulk updates to simulate negative profit...`);
            await Order.bulkWrite(bulkOps);
            console.log("Loss simulation completed successfully! Check the dashboard.");
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
