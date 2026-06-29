import mongoose, { Schema, Document } from "mongoose";

export interface IUpload extends Document {
  filename: string;
  mimeType: string;
  size: number;
  data: Buffer;
  createdAt: Date;
  updatedAt: Date;
}

const UploadSchema: Schema = new Schema(
  {
    filename: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
    },
    data: {
      type: Buffer,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

const Upload = mongoose.model<IUpload>("Upload", UploadSchema);
export default Upload;
