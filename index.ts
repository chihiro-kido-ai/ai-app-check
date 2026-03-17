import express from "express";
import { analyzeTextOnServer, searchGuideOnServer } from "../server/gemini.js";

const app = express();
app.use(express.json({ limit: '50mb' }));

app.post("/api/analyzeText", async (req, res) => {
  try {
    const { text, fileData } = req.body;
    const result = await analyzeTextOnServer(text, fileData);
    res.json(result);
  } catch (error: any) {
    console.error("Error in /api/analyzeText:", error);
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
});

app.post("/api/searchGuide", async (req, res) => {
  try {
    const { query } = req.body;
    const result = await searchGuideOnServer(query);
    res.json({ result });
  } catch (error: any) {
    console.error("Error in /api/searchGuide:", error);
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
});

export default app;
