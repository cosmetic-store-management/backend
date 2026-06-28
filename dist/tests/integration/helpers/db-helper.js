/**
 * db-helper.ts — Shared helper cho integration tests.
 * Khởi động MongoDB in-memory, kết nối Mongoose, dọn dẹp sau mỗi test suite.
 */
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
let mongoServer;
export const connectTestDB = async () => {
    mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
};
export const disconnectTestDB = async () => {
    await mongoose.disconnect();
    if (mongoServer) {
        await mongoServer.stop();
    }
};
export const clearCollections = async () => {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        await collections[key].deleteMany({});
    }
};
