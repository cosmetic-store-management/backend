import mongoose from "mongoose";
import Order from "../app/models/order/order.schema";
import "dotenv/config";
const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB");
        const orders = await Order.find({}, { _id: 1, orderStatus: 1 });
        console.log(`Found ${orders.length} orders. Adjusting statuses...`);
        let completed = 0;
        let cancelled = 0;
        let returned = 0;
        let processing = 0;
        const bulkOps = [];
        for (const order of orders) {
            const rand = Math.random() * 100;
            let newStatus = "completed";
            // Phân bổ thực tế: 85% Hoàn thành, 8% Đã hủy, 4% Hoàn trả, 3% Đang xử lý
            if (rand < 85) {
                newStatus = "completed";
                completed++;
            }
            else if (rand < 93) {
                newStatus = "cancelled";
                cancelled++;
            }
            else if (rand < 97) {
                newStatus = "returned";
                returned++;
            }
            else {
                // Random 1 trong 3 trạng thái đang xử lý: pending, processing, shipping
                const processingStatuses = ["pending", "processing", "shipping"];
                newStatus = processingStatuses[Math.floor(Math.random() * processingStatuses.length)];
                processing++;
            }
            if (order.orderStatus !== newStatus) {
                bulkOps.push({
                    updateOne: {
                        filter: { _id: order._id },
                        update: { $set: { orderStatus: newStatus } },
                    },
                });
            }
        }
        if (bulkOps.length > 0) {
            console.log(`Executing ${bulkOps.length} bulk updates...`);
            await Order.bulkWrite(bulkOps);
            console.log("Update completed successfully!");
        }
        else {
            console.log("No updates needed.");
        }
        console.log(`Final Distribution:`);
        console.log(`- Completed: ${completed}`);
        console.log(`- Cancelled: ${cancelled}`);
        console.log(`- Returned: ${returned}`);
        console.log(`- Processing: ${processing}`);
    }
    catch (error) {
        console.error("Error:", error);
    }
    finally {
        process.exit(0);
    }
};
run();
