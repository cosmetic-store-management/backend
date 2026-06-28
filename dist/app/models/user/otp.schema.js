import mongoose, { Schema } from "mongoose";
const otpSchema = new Schema({
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    otpCode: { type: String, required: true },
    isVerified: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true, index: { expires: 0 } }, // TTL index: auto delete when Date.now() > expiresAt
}, { timestamps: true, collection: "otps" });
const Otp = mongoose.model("Otp", otpSchema);
export default Otp;
