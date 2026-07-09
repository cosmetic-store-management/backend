import mongoose, { Document, Schema, Types } from "mongoose";

export interface IPayrollPeriod {
  month: string; // YYYY-MM
  isLocked: boolean;
  lockedAt?: Date;
  lockedBy?: Types.ObjectId;
  payrolls: any[];
}

export type PayrollPeriodDocument = Document & IPayrollPeriod;

const payrollPeriodSchema = new Schema<PayrollPeriodDocument>(
  {
    month: { type: String, required: true, unique: true },
    isLocked: { type: Boolean, default: false },
    lockedAt: { type: Date },
    lockedBy: { type: Schema.Types.ObjectId, ref: "User" },
    payrolls: [Schema.Types.Mixed],
  },
  { timestamps: true, collection: "payroll_periods", versionKey: false }
);

const PayrollPeriod = mongoose.model<PayrollPeriodDocument>("PayrollPeriod", payrollPeriodSchema);
export default PayrollPeriod;
