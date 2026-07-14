import { SettingService } from "../../../shared/setting/setting.service.js";
import { container } from "tsyringe";

/**
 * Hàm loại bỏ dấu Tiếng Việt để so sánh chuỗi chính xác
 */
const removeVietnameseTones = (str: string): string => {
  str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
  str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
  str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
  str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
  str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
  str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
  str = str.replace(/đ/g, "d");
  str = str.replace(/\u0300|\u0301|\u0303|\u0309|\u0323/g, "");
  str = str.replace(/\u02C6|\u0306|\u031B/g, "");
  return str.trim();
};

export const calcShippingFeeFromSettings = async (
  _subtotal: number,
  _totalItems: number,
  province: string,
  district: string,
  _ward: string,
  _street: string,
  channel: string,
): Promise<number> => {
  if (channel === "pos") return 0;

  const settings = (await container.resolve(SettingService).getSettings()) as any;
  const storeAddress = (
    settings?.storeAddress || "Hanoi, Vietnam"
  ).toLowerCase();

  const normalizedStore = removeVietnameseTones(storeAddress);
  const rawProv = (province || "").toLowerCase().trim();
  const rawDist = (district || "").toLowerCase().trim();
  const normalizedProv = removeVietnameseTones(rawProv);

  const coreProv = normalizedProv
    .replace(/tp\s|thanh pho\s|tinh\s/g, "")
    .trim();

  let isSameProvince = false;
  if (coreProv && normalizedStore.includes(coreProv)) {
    isSameProvince = true;
  }

  const isHCMSynonyms = (p: string) =>
    p === "hcm" ||
    p.includes("ho chi minh") ||
    p === "sg" ||
    p.includes("sai gon");
  const isHNSynonyms = (p: string) => p === "hn" || p.includes("ha noi");

  if (isHCMSynonyms(normalizedProv) && isHCMSynonyms(normalizedStore))
    isSameProvince = true;
  if (isHNSynonyms(normalizedProv) && isHNSynonyms(normalizedStore))
    isSameProvince = true;

  if (!isSameProvince) {
    return 35000;
  }

  const hasHuyenKeyword =
    rawDist.includes("district") ||
    rawDist.includes("huyen") ||
    rawDist.includes("town") ||
    rawDist.includes("thi xa");

  if (hasHuyenKeyword) {
    return 25000;
  }

  return 15000;
};
