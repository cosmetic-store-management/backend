import { Router } from "express";
import { authenticate, isAuthenticated, isManager, requirePermission } from "../../../middlewares/auth.middleware.js";
import { validate } from "../../../middlewares/validate.middleware.js";
import { AddressSchema, CreateStaffSchema, UpdateProfileSchema, UpdateRoleSchema, UpdateStatusSchema } from "./dto/user.request.dto.js";
import { container } from "tsyringe";
import { UserController } from "./user.controller.js";

const router = Router();
const controller = container.resolve(UserController);

router.get("/", authenticate, isManager, controller.getRoot);
router.get("/me/tier-info", authenticate, isAuthenticated, controller.getMeTierInfo);
router.patch("/me", authenticate, isAuthenticated, validate(UpdateProfileSchema), controller.patchMe);
router.patch("/me/avatar", authenticate, isAuthenticated, controller.patchMeAvatar);
router.post("/me/addresses", authenticate, isAuthenticated, validate(AddressSchema), controller.postMeAddresses);
router.put("/me/addresses/:addressId", authenticate, isAuthenticated, validate(AddressSchema), controller.putMeAddressesAddressId);
router.delete("/me/addresses/:addressId", authenticate, isAuthenticated, controller.deleteMeAddressesAddressId);
router.get("/me/favorites", authenticate, isAuthenticated, controller.getMeFavorites);
router.post("/me/favorites/:productId", authenticate, isAuthenticated, controller.postMeFavoritesProductId);
router.get("/me/viewed", authenticate, isAuthenticated, controller.getMeViewed);
router.post("/me/viewed/:productId", authenticate, isAuthenticated, controller.postMeViewedProductId);
router.delete("/me/viewed", authenticate, isAuthenticated, controller.deleteMeViewed);
router.delete("/me/viewed/:productId", authenticate, isAuthenticated, controller.deleteMeViewedProductId);
router.get("/customers", authenticate, requirePermission("customers.view"), controller.getCustomers);
router.post("/customers", authenticate, requirePermission("customers.manage"), controller.postCustomers);
router.post("/staff", authenticate, isManager, validate(CreateStaffSchema), controller.postStaff);
router.get("/:id", authenticate, requirePermission("customers.view"), controller.getId);
router.patch("/:id", authenticate, isManager, controller.patchId);
router.patch("/:id/role", authenticate, isManager, validate(UpdateRoleSchema), controller.patchIdRole);
router.patch("/:id/status", authenticate, isManager, validate(UpdateStatusSchema), controller.patchIdStatus);
router.patch("/:id/reset-password", authenticate, isManager, controller.patchIdResetPassword);
router.delete("/:id", authenticate, isManager, controller.deleteId);
router.patch("/:id/internal-notes", authenticate, requirePermission("customers.manage"), controller.patchIdInternalNotes);
router.patch("/:id/staff-notes", authenticate, isManager, controller.patchIdStaffNotes);
router.patch("/:id/points", authenticate, isManager, controller.patchIdPoints);
router.get("/:id/points/history", authenticate, requirePermission("customers.view"), controller.getIdPointsHistory);

export default router;
