import { injectable } from "tsyringe";
import Upload from "./models/upload.schema.js";

@injectable()
export class UploadRepository {
  async saveFile(
    filename: string,
    mimeType: string,
    size: number,
    data: Buffer,
  ) {
    const upload = new Upload({
      filename,
      mimeType,
      size,
      data,
    });
    return await upload.save();
  }

  async getFileByFilename(filename: string) {
    return await Upload.findOne({ filename });
  }

  async deleteFileByFilename(filename: string) {
    return await Upload.deleteOne({ filename });
  }
}
