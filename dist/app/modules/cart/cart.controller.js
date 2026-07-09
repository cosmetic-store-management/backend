import { Router } from "express";
import * as cartService from "./cart.service.js";
import { addItemSchema, syncCartSchema, updateItemSchema } from "./dto/cart.request.dto.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { catchAsync } from "../../shared/helpers/catchAsync.js";
const router = Router();
export const getCart = async (req, res) => {
    const cart = await cartService.getCart(req.user._id.toString());
    res.json(cart);
};
export const syncCart = async (req, res) => {
    const data = syncCartSchema.parse(req.body);
    const cart = await cartService.syncCart(req.user._id.toString(), data);
    res.json(cart);
};
export const addItem = async (req, res) => {
    const data = addItemSchema.parse(req.body);
    const cart = await cartService.addItem(req.user._id.toString(), data);
    res.json(cart);
};
export const updateItem = async (req, res) => {
    const data = updateItemSchema.parse({
        variantId: req.params.variantId,
        quantity: req.body.quantity,
    });
    const cart = await cartService.updateItem(req.user._id.toString(), data);
    res.json(cart);
};
export const removeItem = async (req, res) => {
    const cart = await cartService.removeItem(req.user._id.toString(), req.params.variantId);
    res.json(cart);
};
export const clearCart = async (req, res) => {
    await cartService.clearCart(req.user._id.toString());
    res.status(204).send();
};
// Route Definitions
router.use(authenticate);
router.get("/", catchAsync(getCart));
router.post("/sync", catchAsync(syncCart));
router.post("/items", catchAsync(addItem));
router.put("/items/:variantId", catchAsync(updateItem));
router.delete("/items/:variantId", catchAsync(removeItem));
router.delete("/", catchAsync(clearCart));
export default router;
