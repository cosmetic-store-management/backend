import mongoose, { Schema } from "mongoose";
const qaSchema = new Schema({
    productId: {
        type: Schema.Types.ObjectId,
        ref: "Product",
        required: true,
        index: true,
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: false, // Không bắt buộc, để khách vãng lai cũng hỏi được (tùy nghiệp vụ)
    },
    userName: {
        type: String,
        required: true,
    },
    question: {
        type: String,
        required: true,
        trim: true,
        maxlength: 1000,
    },
    answer: {
        type: String,
        trim: true,
        maxlength: 2000,
    },
    adminId: {
        type: Schema.Types.ObjectId,
        ref: "User", // Staff/Admin đã trả lời
    },
    status: {
        type: String,
        enum: ["pending", "answered"],
        default: "pending",
        index: true,
    },
}, { timestamps: true });
const QA = mongoose.models.QA || mongoose.model("QA", qaSchema);
export default QA;
