import mongoose, { Schema } from "mongoose";
const attributeSchema = new Schema({
    name: { type: String, required: true, trim: true },
    code: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
    },
    values: { type: [String], default: [] },
}, { timestamps: true, collection: "attributes", versionKey: false });
const Attribute = mongoose.model("Attribute", attributeSchema);
export default Attribute;
