import mongoose, { Document, Schema } from "mongoose";

export interface ISetting {
  key: string;
  value: any;
  description: string;
}

export type SettingDocument = Document & ISetting;

const settingSchema = new Schema<SettingDocument>(
  {
    key: { type: String, required: true, unique: true, trim: true },
    value: { type: Schema.Types.Mixed, required: true },
    description: { type: String, trim: true, default: "" },
  },
  { timestamps: true, collection: "settings", versionKey: false },
);

const Setting = mongoose.model<SettingDocument>("Setting", settingSchema);

export default Setting;
