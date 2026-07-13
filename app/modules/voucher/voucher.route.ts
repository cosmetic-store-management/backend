import { Router } from "express";
import { authenticate, isManager, isStaff, optionalAuth } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { CreateVoucherSchema, UpdateVoucherSchema, ValidateVoucherSchema } from "./dto/voucher.request.dto.js";
import * as controller from "./voucher.controller.js";
const router = Router();
router.get("/admin", authenticate, isStaff, controller.getAdmin);
router.post("/admin", authenticate, isManager, validate(CreateVoucherSchema), controller.postAdmin);
router.put("/admin/:id", authenticate, isManager, validate(UpdateVoucherSchema), controller.putAdminId);
router.delete("/admin/:id", authenticate, isManager, controller.deleteAdminId);
router.get("/public", controller.getPublic);
router.get("/wallet", authenticate, controller.getWallet);
router.get("/wallet/all", authenticate, controller.getWalletAll);
router.post("/validate", optionalAuth, validate(ValidateVoucherSchema), controller.postValidate);
router.post("/collect/:code", authenticate, controller.postCollectCode);
router.delete("/collect/:code", authenticate, controller.deleteCollectCode);

export default router;

