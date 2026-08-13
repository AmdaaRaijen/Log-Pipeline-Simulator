import { NextResponse } from "next/server";
import { z } from "zod";
import { formatCode } from "../../../lib/utils/formatter";
import {
  flattenForPrompt,
  lintForOverBroadRule,
  normalizeSnippetForValidation,
} from "../../../lib/evaluator/auto-whitelist-utils";
import { runSimulation } from "../../../lib/evaluator/simulator";

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
  trace?: any[];
};

export function resolveEventRoot(rawlog: any): any {
  if (rawlog && typeof rawlog === "object" && rawlog._source) {
    return rawlog._source;
  }
  return rawlog;
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
    const flattenedPaths = flattenForPrompt(
      eventRoot,
      engine as "logstash" | "vector",
    );

    let systemPrompt = `Kamu adalah asisten pembuat rule whitelist untuk SIEM pipeline (${engine === "logstash" ? "Logstash conditional filter" : "Vector VRL"}).

ATURAN OUTPUT:
- Output HANYA satu blok rule (if-block), bukan seluruh file config.
- Gunakan HANYA syntax berikut (di luar ini akan gagal divalidasi):
  ${
    engine === "logstash"
      ? "[Logstash]: kondisi memakai =~, !~, ==, !=, in [...], and, or, !; hanya action mutate.add_field yang didukung. Untuk assignment ID, gunakan '{id}'"
      : '[Vector]: Gunakan syntax Vector Remap Language (VRL) standar. Untuk assignment ID, gunakan \'{id}\' (misal: .whitelist = "true"; .whitelistID = "{id}")'
  }
- Field path HARUS diambil dari daftar "Available field paths" yang diberikan — JANGAN mengarang path yang tidak ada di sana.
- Response harus berformat JSON valid mengikuti schema: { "snippet": "string", "explanation": "string", "suggestedWhitelistId": "string" }
- Gunakan whitelistId '{id}' di snippet agar pengguna bisa mengganti ID secara dinamis.

KONTEKS:
Available field paths:
${flattenedPaths.join("\n")}

Penjelasan whitelist dari user: ${description}
${exampleWhitelist ? `Contoh whitelist (gaya yang diikuti): ${exampleWhitelist}` : ""}`;

    const attempts: Attempt[] = [];
    let conversationHistory = [
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

    // Determine Base URL (can be customized if using a proxy, but user said standard fetch, so using OpenAI)
    const baseUrl = process.env.OPENAI_BASE_URL || "https://ai.sumopod.com/v1";

    for (let i = 0; i < maxRetries; i++) {
      let llmResponseText = "";
      try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini", // can be overridden by env
            messages: conversationHistory,
            response_format: { type: "json_object" },
            temperature: 0.1,
          }),
        });

        if (!response.ok) {
          const errBody = await response.text();
          throw new Error(`LLM API returned ${response.status}: ${errBody}`);
        }

        const data = await response.json();
        llmResponseText = data.choices[0].message.content;
      } catch (err: any) {
        return NextResponse.json(
          { error: `LLM Call failed: ${err.message}` },
          { status: 500 },
        );
      }

      // Add assistant response to history
      conversationHistory.push({ role: "assistant", content: llmResponseText });

      let parsedPayload: any;
      try {
        parsedPayload = JSON.parse(llmResponseText);
      } catch (err) {
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

      const snippet = normalizeSnippetForValidation(
        parsed.data.snippet,
        engine as "logstash" | "vector",
      );

      let isWhitelisted = false;
      let evalTrace: any[] = [];
      let lintWarnings: string[] = [];

      try {
        const result = runSimulation(engine as "logstash" | "vector", snippet, parsedRawlog);

        if (!result.success) {
          throw new Error(result.message || result.error);
        }

        isWhitelisted = result.matched;
        
        evalTrace = result.evaluationTrace.map((t: any) => ({
          matched: t.matched,
          branchIndex: String(t.branchIndex).includes("Branch") ? t.branchIndex : `Branch ${t.branchIndex}`,
          reason: t.reason,
        }));

        if (isWhitelisted && engine === "logstash" && result.pipelineAST) {
          lintWarnings = lintForOverBroadRule(result.pipelineAST, "logstash");
        } else if (isWhitelisted && engine === "vector") {
          lintWarnings = [];
        }
      } catch (err: any) {
        attempts.push({
          attemptNumber: i + 1,
          snippet: parsed.data.snippet,
          parseOk: false,
          error: err.message,
        });
        conversationHistory.push({
          role: "user",
          content: `Rule kamu gagal di-parse oleh parser simulator: "${err.message}". Perbaiki syntax-nya, ikuti grammar yang dibolehkan untuk ${engine}.`,
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
        // Format the snippet before returning it to the user
        const finalSnippet = formatCode(
          parsed.data.snippet,
          engine as "logstash" | "vector",
        );

        return NextResponse.json({
          success: true,
          verified: true,
          finalSnippet,
          explanation: parsed.data.explanation,
          warnings: lintWarnings,
          attempts,
        });
      } else {
        conversationHistory.push({
          role: "user",
          content: `Rule kamu ke-parse dengan benar, tapi TIDAK match terhadap event yang diberikan sehingga block whitelisted tidak dieksekusi. Trace evaluasi:\n${JSON.stringify(evalTrace, null, 2)}\n\nPerbaiki kondisinya agar match dengan rawlog.`,
        });
      }
    }

    // Exhausted retries
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
