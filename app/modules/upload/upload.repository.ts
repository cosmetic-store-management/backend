import Upload from "./models/upload.schema.js";

export const saveFile = async (
  filename: string,
  mimeType: string,
  size: number,
  data: Buffer,
) => {
  const upload = new Upload({
    filename,
    mimeType,
    size,
    data,
  });
  return await upload.save();
};

export const getFileByFilename = async (filename: string) => {
  return await Upload.findOne({ filename });
};

export const deleteFileByFilename = async (filename: string) => {
  return await Upload.deleteOne({ filename });
};
