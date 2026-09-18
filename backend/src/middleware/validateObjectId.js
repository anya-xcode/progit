import mongoose from "mongoose";
import { badRequest } from "../utils/httpError.js";

export function validateObjectId(paramName = "id") {
  return (req, res, next) => {
    if (!mongoose.isValidObjectId(req.params[paramName])) {
      next(badRequest(`Invalid ${paramName}`));
      return;
    }
    next();
  };
}
