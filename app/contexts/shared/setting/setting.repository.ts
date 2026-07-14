import { injectable } from "tsyringe";
import Setting from "./models/setting.schema.js";

@injectable()
export class SettingRepository {
  findByKey(key: string) {
    return Setting.findOne({ key });
  }

  findByKeyLean(key: string) {
    return Setting.findOne({ key }).lean();
  }

  create(data: any) {
    return Setting.create(data);
  }

  save(doc: any) {
    return doc.save();
  }
}
