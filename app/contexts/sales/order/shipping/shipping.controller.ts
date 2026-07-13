import { Request, Response } from "express";

import { calcShippingFeeFromSettings } from "./shipping.service.js";

import { catchAsync } from "../../../../shared/helpers/catchAsync.js";

export const calculateFee = catchAsync(async (
  req: Request,
  res: Response,
) => {
  const { subtotal, totalItems, province, district, ward, street, channel } =
    req.body;
  const fee = await calcShippingFeeFromSettings(
    subtotal,
    totalItems,
    province,
    district,
    ward,
    street,
    channel,
  );
  res.json({ success: true, fee });
});

export const postCalculate = calculateFee;