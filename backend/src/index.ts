import express from "express";
import { appConfig } from "./configs/app-config";

const app = express();
app.use(express.json());

app.listen(appConfig.port, () => {
  console.log(`🚀 Backend running in ${appConfig.env} mode on http://localhost:${appConfig.port}`);
});
