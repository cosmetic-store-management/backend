import { Router } from "express";
import * as controller from "./shipping.controller.js";
const router = Router();
router.post("/calculate", controller.postCalculate);

export default router;

