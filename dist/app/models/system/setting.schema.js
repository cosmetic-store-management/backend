import mongoose, { Schema } from "mongoose";
const settingSchema = new Schema({
    key: { type: String, required: true, unique: true, trim: true },
    value: { type: Schema.Types.Mixed, required: true },
    description: { type: String, trim: true, default: "" },
}, { timestamps: true, collection: "settings", versionKey: false });
const Setting = mongoose.model("Setting", settingSchema);
export default Setting;
