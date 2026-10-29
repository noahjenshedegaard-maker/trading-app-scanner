import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const SYSTEM_PROMPT = `You are a technical analyst reading a screenshot of a trading chart.
Look at trend, market structure (higher highs/lows or lower highs/lows), support and resistance,
candlestick patterns, volume, and any indicators visible on the chart.
Decide whether the chart setup leans LONG (price more likely to go up) or SHORT (price more likely to go down).
Give long_percent and short_percent as your honest probability split; they must add up to 100.
If the setup is unclear, keep the split close to 50/50 and say so. Do not overstate confidence.
If the image is not a price chart, set is_chart to false and explain in summary.`;

const RESULT_SCHEMA = {
  type: "object",
  properties: {
    is_chart: { type: "boolean" },
    asset: { type: "string", description: "Ticker or asset name if visible, otherwise 'Unknown'" },
    timeframe: { type: "string", description: "Chart timeframe if visible, otherwise 'Unknown'" },
    signal: { type: "string", enum: ["long", "short", "neutral"] },
    long_percent: { type: "integer" },
    short_percent: { type: "integer" },
    summary: { type: "string" },
    reasons: { type: "array", items: { type: "string" } },
    support: { type: "string" },
    resistance: { type: "string" },
  },
  required: [
    "is_chart", "asset", "timeframe", "signal", "long_percent",
    "short_percent", "summary", "reasons", "support", "resistance",
  ],
  additionalProperties: false,
};

app.use(express.json({ limit: "8mb" }));
app.use(express.static(path.join(here, "public")));

app.post("/api/analyze", async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY is not set on the server." });
  }
  const { image, mediaType } = req.body ?? {};
  if (typeof image !== "string" || !ALLOWED_TYPES.includes(mediaType)) {
    return res.status(400).json({ error: "Upload a PNG, JPG, GIF or WEBP image." });
  }
  if (Buffer.byteLength(image, "base64") > MAX_IMAGE_BYTES) {
    return res.status(400).json({ error: "Image is too large (max 5 MB)." });
  }

  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: RESULT_SCHEMA },
      },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
            { type: "text", text: "Analyze this chart. Should I go long or short?" },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return res.status(422).json({ error: "The AI declined to analyze this image." });
    }
    if (response.stop_reason === "max_tokens") {
      return res.status(502).json({ error: "The analysis was cut off. Please try again." });
    }

    const text = response.content.find((block) => block.type === "text")?.text;
    const result = JSON.parse(text);

    // Make sure the two percentages always add up to 100.
    const long = Math.min(100, Math.max(0, result.long_percent));
    result.long_percent = long;
    result.short_percent = 100 - long;

    res.json(result);
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      console.error("Invalid ANTHROPIC_API_KEY");
      res.status(500).json({ error: "Server API key is missing or invalid." });
    } else if (error instanceof Anthropic.RateLimitError) {
      res.status(429).json({ error: "Too many requests. Wait a moment and try again." });
    } else if (error instanceof Anthropic.APIError) {
      console.error(`API error ${error.status}:`, error.message);
      res.status(502).json({ error: "The AI service returned an error. Try again." });
    } else {
      console.error(error);
      res.status(500).json({ error: "Something went wrong analyzing the image." });
    }
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Chart analyzer running on http://localhost:${port}`);
  if (!process.env.ANTHROPIC_API_KEY) console.warn("Warning: ANTHROPIC_API_KEY is not set.");
});
