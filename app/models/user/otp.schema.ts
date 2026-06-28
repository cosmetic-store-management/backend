import mongoose, { Document, Schema } from "mongoose";

export interface IOtp {
  email: string;
  otpCode: string;
  isVerified: boolean;
  expiresAt: Date;
}

export type OtpDocument = Document & IOtp;

const otpSchema = new Schema<OtpDocument>(
  {
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    otpCode: { type: String, required: true },
    isVerified: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true, index: { expires: 0 } }, // TTL index: auto delete when Date.now() > expiresAt
  },
  { timestamps: true, collection: "otps" }
);

const Otp = mongoose.model<OtpDocument>("Otp", otpSchema);

export default Otp;
