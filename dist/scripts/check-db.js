import mongoose from "mongoose";
import Order from "../app/models/order/order.schema";
import "dotenv/config";
const run = async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const result = await Order.aggregate([{ $group: { _id: "$orderStatus", count: { $sum: 1 } } }]);
    console.log(result);
    process.exit(0);
};
run();
