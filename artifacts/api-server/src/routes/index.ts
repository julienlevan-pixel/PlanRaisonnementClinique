import { Router, type IRouter } from "express";
import healthRouter from "./health";
import prcRouter from "./prc";

const router: IRouter = Router();

router.use(healthRouter);
router.use(prcRouter);

export default router;
