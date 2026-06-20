import { getSettings } from "../setting/setting.service.js";
import { WEIGHT_BASE_G, WEIGHT_SURCHARGE_STEP_G, WEIGHT_SURCHARGE_PER_STEP, FREE_SHIP_THRESHOLD, DEFAULT_SHIPPING_FEE } from "./order.helper.js";
export const calcShippingFee = (subtotal) => subtotal > FREE_SHIP_THRESHOLD ? 0 : DEFAULT_SHIPPING_FEE;
export const calcShippingFeeFromSettings = async (subtotal, totalWeight, province, channel) => {
    if (channel === "pos")
        return 0;
    const settings = await getSettings();
    const standardFee = settings?.standardShippingFee ?? DEFAULT_SHIPPING_FEE;
    const freeThreshold = settings?.freeShippingThreshold ?? FREE_SHIP_THRESHOLD;
    if (subtotal >= freeThreshold)
        return 0;
    let fee = standardFee;
    const prov = province.toLowerCase();
    if (prov.includes("hồ chí minh") || prov.includes("hcm") || prov.includes("hó chí minh")) {
        fee = Math.round(standardFee * 2 / 3);
    }
    if (totalWeight > WEIGHT_BASE_G) {
        fee += Math.ceil((totalWeight - WEIGHT_BASE_G) / WEIGHT_SURCHARGE_STEP_G) * WEIGHT_SURCHARGE_PER_STEP;
    }
    return fee;
};
