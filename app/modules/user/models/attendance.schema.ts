import mongoose, { Document, Schema, Types } from "mongoose";

export interface IAttendance {
  userId: Types.ObjectId;
  date: string; // YYYY-MM-DD
  checkIn?: Date;
  checkOut?: Date;
  status: "present" | "absent" | "late" | "half_day" | "off";
  notes?: string;
}

export type AttendanceDocument = Document & IAttendance;

const attendanceSchema = new Schema<AttendanceDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: String, required: true },
    checkIn: { type: Date },
    checkOut: { type: Date },
    status: {
      type: String,
      enum: ["present", "absent", "late", "half_day", "off"],
      default: "present",
    },
    notes: { type: String, trim: true },
  },
  { timestamps: true, collection: "attendances", versionKey: false }
);

attendanceSchema.index({ userId: 1, date: 1 }, { unique: true });

const Attendance = mongoose.model<AttendanceDocument>("Attendance", attendanceSchema);
export default Attendance;
