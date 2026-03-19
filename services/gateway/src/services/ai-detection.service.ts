import { createLogger } from "../lib/logger.js";

const logger = createLogger("ai-detection");

export interface DetectionResult {
  type: "person" | "vehicle" | "animal" | "unknown";
  confidence: number;
  label: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
}

export class AIDetectionService {
  private provider: string;
  private apiKey: string | undefined;

  constructor() {
    this.provider = process.env["AI_PROVIDER"] ?? "none";
    this.apiKey = process.env["OPENAI_API_KEY"];
  }

  isConfigured(): boolean {
    return this.provider !== "none" && !!this.apiKey;
  }

  getStatus() {
    return {
      status: this.isConfigured() ? "configured" : "not_configured",
      provider: this.provider,
    };
  }

  /**
   * Analyze a JPEG frame buffer and return AI detections.
   * Gracefully returns empty array if not configured.
   */
  async analyzeFrame(
    cameraId: string,
    frameBuffer: Buffer,
  ): Promise<DetectionResult[]> {
    if (!this.isConfigured()) return [];

    try {
      if (this.provider === "openai") {
        return await this.analyzeWithOpenAI(cameraId, frameBuffer);
      }
      return [];
    } catch (err) {
      logger.warn("AI detection failed", { cameraId, error: String(err) });
      return [];
    }
  }

  private async analyzeWithOpenAI(
    cameraId: string,
    frameBuffer: Buffer,
  ): Promise<DetectionResult[]> {
    const base64 = frameBuffer.toString("base64");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: 'Analyze this security camera frame. List any people, vehicles, or animals visible. Respond ONLY with JSON array: [{"type":"person"|"vehicle"|"animal","confidence":0.0-1.0,"label":"description"}]. Empty array if nothing detected.',
              },
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${base64}`, detail: "low" },
              },
            ],
          },
        ],
        max_tokens: 200,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const json = (await response.json()) as {
      choices: { message: { content: string } }[];
    };
    const content = json.choices[0]?.message?.content ?? "[]";

    // Parse the JSON response
    const cleaned = content.replace(/```json\n?|\n?```/g, "").trim();
    const detections = JSON.parse(cleaned) as DetectionResult[];

    logger.info("AI detections", { cameraId, count: detections.length });
    return detections;
  }
}

let instance: AIDetectionService | null = null;

export function getAIDetectionService(): AIDetectionService {
  if (!instance) {
    instance = new AIDetectionService();
    if (instance.isConfigured()) {
      logger.info("AI detection configured", { provider: process.env["AI_PROVIDER"] });
    }
  }
  return instance;
}
