import { Request, Response } from "express";

import * as cartService from "./cart.service.js";

import { addItemSchema, syncCartSchema, updateItemSchema } from "./dto/cart.request.dto.js";


import { catchAsync } from "../../shared/helpers/catchAsync.js";

export const getCart = async (req: Request, res: Response) => {
  const cart = await cartService.getCart(req.user!._id.toString());
  res.json(cart);
};

export const syncCart = async (req: Request, res: Response) => {
  const data = syncCartSchema.parse(req.body);
  const cart = await cartService.syncCart(req.user!._id.toString(), data);
  res.json(cart);
};

export const addItem = async (req: Request, res: Response) => {
  const data = addItemSchema.parse(req.body);
  const cart = await cartService.addItem(req.user!._id.toString(), data);
  res.json(cart);
};

export const updateItem = async (req: Request, res: Response) => {
  const data = updateItemSchema.parse({
    variantId: req.params.variantId as string,
    quantity: req.body.quantity,
  });
  const cart = await cartService.updateItem(req.user!._id.toString(), data);
  res.json(cart);
};

export const removeItem = async (req: Request, res: Response) => {
  const cart = await cartService.removeItem(req.user!._id.toString(), req.params.variantId as string);
  res.json(cart);
};

export const clearCart = async (req: Request, res: Response) => {
  await cartService.clearCart(req.user!._id.toString());
  res.status(204).send();
};

export const getRoot = catchAsync(getCart);

export const postSync = catchAsync(syncCart);

export const postItems = catchAsync(addItem);

export const putItemsVariantId = catchAsync(updateItem);

export const deleteItemsVariantId = catchAsync(removeItem);

export const deleteRoot = catchAsync(clearCart);