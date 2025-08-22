import dotenv from "dotenv";

dotenv.config();

export const appConfig = {
  env: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "4000"),
};
