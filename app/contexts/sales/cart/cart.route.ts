import { Router } from "express";
import { container } from "tsyringe";
import { CartController } from "./cart.controller.js";

const router = Router();
const controller = container.resolve(CartController);

router.get("/", controller.getRoot);
router.post("/sync", controller.postSync);
router.post("/items", controller.postItems);
router.put("/items/:variantId", controller.putItemsVariantId);
router.delete("/items/:variantId", controller.deleteItemsVariantId);
router.delete("/", controller.deleteRoot);

export default router;
