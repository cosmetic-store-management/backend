import { injectable, inject } from "tsyringe";
import { Request, Response } from "express";
import { catchAsync } from "../../../shared/helpers/catchAsync.js";
import { CartService } from "./cart.service.js";
import { addItemSchema, syncCartSchema, updateItemSchema } from "./dto/cart.request.dto.js";

@injectable()
export class CartController {
  constructor(
    @inject(CartService) private readonly cartService: CartService
  ) {}

  getRoot = catchAsync(async (req: Request, res: Response) => {
    const cart = await this.cartService.getCart(req.user!._id.toString());
    res.json(cart);
  });

  postSync = catchAsync(async (req: Request, res: Response) => {
    const data = syncCartSchema.parse(req.body);
    const cart = await this.cartService.syncCart(req.user!._id.toString(), data);
    res.json(cart);
  });

  postItems = catchAsync(async (req: Request, res: Response) => {
    const data = addItemSchema.parse(req.body);
    const cart = await this.cartService.addItem(req.user!._id.toString(), data);
    res.json(cart);
  });

  putItemsVariantId = catchAsync(async (req: Request, res: Response) => {
    const data = updateItemSchema.parse({
      variantId: req.params.variantId as string,
      quantity: req.body.quantity,
    });
    const cart = await this.cartService.updateItem(req.user!._id.toString(), data);
    res.json(cart);
  });

  deleteItemsVariantId = catchAsync(async (req: Request, res: Response) => {
    const cart = await this.cartService.removeItem(req.user!._id.toString(), req.params.variantId as string);
    res.json(cart);
  });

  deleteRoot = catchAsync(async (req: Request, res: Response) => {
    await this.cartService.clearCart(req.user!._id.toString());
    res.status(204).send();
  });
}