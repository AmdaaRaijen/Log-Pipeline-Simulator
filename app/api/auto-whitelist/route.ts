import { NextResponse } from "next/server";
import { z } from "zod";
import { formatCode } from "../../../lib/utils/formatter";
import {
  flattenForPrompt,
  normalizeSnippetForValidation,
} from "../../../lib/evaluator/auto-whitelist-utils";
import { runSimulation } from "../../../lib/evaluator/simulator";
import {
  buildSystemPrompt,
  mapErrorToHint,
  isInfrastructureError,
  lintSnippetSpecificity,
  WHITELIST_ID_PLACEHOLDER,
  type Engine,
} from "../../../lib/prompt-guides/prompt-guides";

const LlmWhitelistOutputSchema = z.object({
  snippet: z.string().min(1),
  explanation: z.string(),
  suggestedWhitelistId: z.string().optional(),
});

type Attempt = {
  attemptNumber: number;
  snippet?: string;
  parseOk?: boolean;
  matched?: boolean;
  error?: string;
  hint?: string;
  trace?: any[];
};

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export function resolveEventRoot(rawlog: any): any {
  if (rawlog && typeof rawlog === "object" && rawlog._source) {
    return rawlog._source;
  }
  return rawlog;
}

/**
 * Panggil LLM dengan retry ringan untuk kegagalan TRANSIENT (network/5xx/timeout).
 * Ini terpisah dari retry loop "perbaiki syntax" — kegagalan API call bukan salah LLM,
 * jadi jangan dikonsumsi sebagai attempt validasi.
 */
async function callLlmWithBackoff(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  maxApiRetries = 2,
): Promise<string> {
  let lastErr: Error | null = null;
  for (let i = 0; i <= maxApiRetries; i++) {
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          response_format: { type: "json_object" },
          temperature: 0.1,
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        // 4xx (selain 429) biasanya bukan transient — jangan retry, langsung throw ke pemanggil.
        if (
          response.status >= 400 &&
          response.status < 500 &&
          response.status !== 429
        ) {
          throw new Error(`LLM API returned ${response.status}: ${errBody}`);
        }
        throw new Error(`LLM API returned ${response.status}: ${errBody}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (err: any) {
      lastErr = err;
      if (i < maxApiRetries) {
        await new Promise((r) => setTimeout(r, 500 * Math.pow(2, i))); // 500ms, 1s, ...
        continue;
      }
    }
  }
  throw lastErr ?? new Error("LLM call failed after retries");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      engine,
      rawlog,
      exampleWhitelist,
      description,
      maxRetries = 3,
    }: {
      engine: Engine;
      rawlog: any;
      exampleWhitelist?: string;
      description: string;
      maxRetries?: number;
    } = body;

    if (!rawlog || !description) {
      return NextResponse.json(
        { error: "Missing rawlog or description" },
        { status: 400 },
      );
    }

    const parsedRawlog =
      typeof rawlog === "string" ? JSON.parse(rawlog) : rawlog;
    const eventRoot = resolveEventRoot(parsedRawlog);
    const flattenedPaths = flattenForPrompt(eventRoot, engine);

    const systemPrompt = buildSystemPrompt({
      engine,
      flattenedPaths,
      description,
      exampleWhitelist,
    });

    const attempts: Attempt[] = [];
    const conversationHistory: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content:
          "Buatkan snippet rule whitelist berdasarkan penjelasan dan konteks yang diberikan, format output dalam JSON.",
      },
    ];

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured on the server." },
        { status: 500 },
      );
    }
    const baseUrl = process.env.OPENAI_BASE_URL || "https://ai.sumopod.com/v1";
    const model = process.env.AUTO_WHITELIST_MODEL || "gpt-4.1-mini";

    for (let i = 0; i < maxRetries; i++) {
      let llmResponseText: string;
      try {
        llmResponseText = await callLlmWithBackoff(
          baseUrl,
          apiKey,
          model,
          conversationHistory,
        );
      } catch (err: any) {
        // Kegagalan API (setelah retry internal habis) langsung dihentikan, bukan diperlakukan
        // sebagai "attempt validasi ke-i" — beda kelas masalah dari syntax error LLM.
        return NextResponse.json(
          { error: `LLM Call failed: ${err.message}`, attempts },
          { status: 502 },
        );
      }

      conversationHistory.push({ role: "assistant", content: llmResponseText });

      let parsedPayload: any;
      try {
        parsedPayload = JSON.parse(llmResponseText);
      } catch {
        attempts.push({
          attemptNumber: i + 1,
          error: "LLM output is not valid JSON",
        });
        conversationHistory.push({
          role: "user",
          content:
            "Output kamu bukan JSON yang valid. Coba lagi dengan format JSON yang benar.",
        });
        continue;
      }

      const parsed = LlmWhitelistOutputSchema.safeParse(parsedPayload);
      if (!parsed.success) {
        attempts.push({
          attemptNumber: i + 1,
          error: "LLM output tidak sesuai schema Zod",
        });
        conversationHistory.push({
          role: "user",
          content:
            "Output kamu tidak sesuai format schema JSON yang diminta. Harus punya property 'snippet' dan 'explanation'. Coba lagi.",
        });
        continue;
      }

      // Pastikan placeholder ID konsisten walau LLM lupa instruksi (defensive normalize).
      const snippetWithSafeId = parsed.data.snippet.replace(
        /"whitelist[Ii][dD]"\s*=>\s*"(?!__WHITELIST_ID__)[^"]*"/g,
        `"whitelistId" => "${WHITELIST_ID_PLACEHOLDER}"`,
      );

      const snippet = normalizeSnippetForValidation(snippetWithSafeId, engine);

      let isWhitelisted = false;
      let evalTrace: any[] = [];
      let lintWarnings: string[] = [];

      try {
        const result = runSimulation(engine, snippet, parsedRawlog);

        if (!result.success) {
          throw new Error(result.message || result.error);
        }

        isWhitelisted = result.matched;
        evalTrace = result.evaluationTrace.map((t: any) => ({
          matched: t.matched,
          branchIndex: String(t.branchIndex).includes("Branch")
            ? t.branchIndex
            : `Branch ${t.branchIndex}`,
          reason: t.reason,
        }));

        // Lint sekarang jalan untuk KEDUA engine (sebelumnya cuma Logstash) — lihat prompt-guides.ts
        if (isWhitelisted) {
          lintWarnings = lintSnippetSpecificity(engine, snippet);
        }
      } catch (err: any) {
        const errorMessage = err.message ?? String(err);

        if (isInfrastructureError(errorMessage)) {
          // Bukan salah syntax LLM — jangan buang attempt buat ini, langsung gagalkan request.
          return NextResponse.json(
            {
              error: "Infrastructure error saat menjalankan simulator/compiler",
              message: errorMessage,
              attempts,
            },
            { status: 500 },
          );
        }

        const hint = mapErrorToHint(engine, errorMessage);
        attempts.push({
          attemptNumber: i + 1,
          snippet: parsed.data.snippet,
          parseOk: false,
          error: errorMessage,
          hint,
        });
        conversationHistory.push({
          role: "user",
          content: `Rule kamu gagal di-parse/di-compile: "${errorMessage}".${
            hint ? ` ${hint}` : ""
          } Perbaiki syntax-nya, ikuti guide yang sudah diberikan untuk ${engine}.`,
        });
        continue;
      }

      attempts.push({
        attemptNumber: i + 1,
        snippet: parsed.data.snippet,
        parseOk: true,
        matched: isWhitelisted,
        trace: evalTrace,
      });

      if (isWhitelisted) {
        const finalSnippet = formatCode(parsed.data.snippet, engine);
        return NextResponse.json({
          success: true,
          verified: true,
          finalSnippet,
          whitelistIdPlaceholder: WHITELIST_ID_PLACEHOLDER,
          explanation: parsed.data.explanation,
          warnings: lintWarnings,
          attempts,
        });
      }

      conversationHistory.push({
        role: "user",
        content: `Rule kamu ke-parse/ke-compile dengan benar, tapi TIDAK match terhadap event yang diberikan sehingga field whitelisted tidak ke-set. Trace evaluasi:\n${JSON.stringify(
          evalTrace,
          null,
          2,
        )}\n\nPerbaiki kondisinya agar match dengan rawlog yang diberikan.`,
      });
    }

    return NextResponse.json({
      success: false,
      verified: false,
      lastSnippet: attempts.at(-1)?.snippet,
      lastError:
        attempts.at(-1)?.error ||
        "Rule valid secara syntax namun tidak berhasil match dengan rawlog setelah maksimal retry.",
      attempts,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Internal Server Error", message: error.message },
      { status: 500 },
    );
  }
}
