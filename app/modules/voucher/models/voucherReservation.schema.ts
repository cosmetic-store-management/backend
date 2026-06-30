import mongoose, { Document, Schema } from "mongoose";

export interface IVoucherReservation {
  voucherId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  expiresAt?: Date;
}

export type VoucherReservationDocument = Document & IVoucherReservation;

const voucherReservationSchema = new Schema<VoucherReservationDocument>(
  {
    voucherId: {
      type: Schema.Types.ObjectId,
      ref: "Voucher",
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    expiresAt: {
      type: Date,
      // TTL Index: Tự động xoá document khi đến thời điểm expiresAt
      expires: 0, 
    },
  },
  { timestamps: true, collection: "voucher_reservations", versionKey: false },
);

// Đảm bảo mỗi user chỉ giữ chỗ 1 voucher 1 lần tại một thời điểm
voucherReservationSchema.index({ voucherId: 1, userId: 1 }, { unique: true });

const VoucherReservation = mongoose.model<VoucherReservationDocument>(
  "VoucherReservation",
  voucherReservationSchema,
);

export default VoucherReservation;
