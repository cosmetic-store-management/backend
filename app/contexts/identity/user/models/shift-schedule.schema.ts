import mongoose, { Document, Schema, Types } from "mongoose";

export interface IShiftSchedule {
  userId: Types.ObjectId;
  date: string; // YYYY-MM-DD
  shiftType: "morning" | "afternoon" | "night" | "full" | "off";
  assignedBy?: Types.ObjectId;
}

export type ShiftScheduleDocument = Document & IShiftSchedule;

const shiftScheduleSchema = new Schema<ShiftScheduleDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: String, required: true },
    shiftType: {
      type: String,
      enum: ["morning", "afternoon", "night", "full", "off"],
      required: true,
    },
    assignedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true, collection: "shift_schedules", versionKey: false }
);

shiftScheduleSchema.index({ userId: 1, date: 1 }, { unique: true });

const ShiftSchedule = mongoose.model<ShiftScheduleDocument>("ShiftSchedule", shiftScheduleSchema);
export default ShiftSchedule;
