import { NextResponse } from "next/server";
import { evaluate_vrl } from "../../../lib/vrl-wasm-pkg/vrl_wasm";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

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
          temperature: 0.2,
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          throw new Error(`LLM API returned ${response.status}: ${errBody}`);
        }
        throw new Error(`LLM API returned ${response.status}: ${errBody}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (err: any) {
      lastErr = err;
      if (i < maxApiRetries) {
        await new Promise((r) => setTimeout(r, 500 * Math.pow(2, i)));
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
      rawlog,
      description,
      existingVrl,
      nextSid,
      maxRetries = 3,
    }: {
      rawlog: any;
      description: string;
      existingVrl?: string;
      nextSid: number;
      maxRetries?: number;
    } = body;

    if (!rawlog || !description) {
      return NextResponse.json(
        { error: "Missing rawlog or description" },
        { status: 400 },
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured on the server." },
        { status: 500 },
      );
    }

    const baseUrl = process.env.OPENAI_BASE_URL || "https://ai.sumopod.com/v1";
    const model = process.env.AUTO_WHITELIST_MODEL || "gpt-4.1-mini";

    const parsedRawlog = typeof rawlog === "string" ? JSON.parse(rawlog) : rawlog;
    const eventToEvaluate = parsedRawlog._source ? parsedRawlog._source : parsedRawlog;
    const flatFields = flattenFields(eventToEvaluate);

    const systemPrompt = `Kamu adalah asisten pembuat rule usecase untuk SIEM pipeline (Vector VRL custom filter).

TUJUAN:
Buat satu blok usecase VRL untuk mendeteksi event berdasarkan deskripsi yang diberikan.
Blok ini akan ditambahkan ke file 60_custom-filter_{group}.vrl yang dijalankan SEBELUM 97_whitelist dan 70_dsiem-plugin.

ATURAN WAJIB:
- Gunakan HANYA Vector VRL syntax yang valid
- Selalu buka dengan: if !exists(.usecase.id) && (<kondisi deteksi>) {
- Di dalam blok WAJIB set field-field berikut:
    .usecase.id         = "${nextSid}"
    .usecase.title_name = "<judul exact match sesuai TSV>"
    .usecase.author     = "analyst"
    .usecase.type       = "<tipe singkat>"
    .usecase.description = "<deskripsi singkat>"
- title_name harus UNIK dan DESKRIPTIF karena akan dipakai sebagai lookup key di enrichment table
- Gunakan field path dari "Available field paths" — jangan mengarang path yang tidak ada
- Output berformat JSON: { "vrl_block": "string", "title_name": "string", "explanation": "string" }

KONTEKS:
Available field paths:
${flatFields.join("\n")}

Existing usecase IDs sudah dipakai (id 1 s/d ${nextSid - 1}) — kamu harus menggunakan id "${nextSid}".

Deskripsi usecase yang diminta: ${description}
${existingVrl ? `\nKonten VRL yang sudah ada (JANGAN hapus, hanya tambah blok baru):\n${existingVrl.slice(0, 2000)}` : ""}`;

    const conversationHistory: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: "Buatkan blok VRL usecase baru sesuai deskripsi, format output JSON.",
      },
    ];

    const attempts: { attempt: number; vrlBlock?: string; error?: string; vrlResult?: any }[] = [];

    for (let i = 0; i < maxRetries; i++) {
      let llmText: string;
      try {
        llmText = await callLlmWithBackoff(baseUrl, apiKey, model, conversationHistory);
      } catch (err: any) {
        return NextResponse.json(
          { error: "LLM API Error", message: err.message },
          { status: 502 },
        );
      }

      let parsed: { vrl_block: string; title_name: string; explanation: string };
      try {
        parsed = JSON.parse(llmText);
        if (!parsed.vrl_block || !parsed.title_name) throw new Error("Missing fields");
      } catch {
        attempts.push({ attempt: i + 1, error: "JSON parse error: " + llmText.slice(0, 200) });
        conversationHistory.push(
          { role: "assistant", content: llmText },
          { role: "user", content: "Response tidak valid JSON atau field vrl_block/title_name tidak ada. Coba lagi dengan format JSON yang benar." },
        );
        continue;
      }

      // Validate via VRL WASM — wrap block in a full VRL script that just runs it
      const testVrl = `${parsed.vrl_block}\n.`;
      let vrlOk = false;
      let vrlError = "";
      try {
        const vrlResult = evaluate_vrl(testVrl, JSON.stringify(eventToEvaluate));
        vrlOk = vrlResult.success;
        if (!vrlOk) {
          vrlError = vrlResult.output || "VRL execution failed";
        }
      } catch (e: any) {
        vrlError = e.message || "WASM error";
      }

      attempts.push({
        attempt: i + 1,
        vrlBlock: parsed.vrl_block,
        error: vrlOk ? undefined : vrlError,
      });

      if (vrlOk) {
        return NextResponse.json({
          success: true,
          vrlBlock: parsed.vrl_block,
          titleName: parsed.title_name,
          explanation: parsed.explanation,
          attempts,
        });
      }

      // Feed error back to LLM
      conversationHistory.push(
        { role: "assistant", content: llmText },
        {
          role: "user",
          content: `VRL block gagal validasi dengan error:\n${vrlError}\n\nPerbaiki VRL block dan kembalikan JSON yang valid.`,
        },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "MaxRetriesExceeded",
        message: `Gagal generate VRL yang valid setelah ${maxRetries} percobaan.`,
        attempts,
      },
      { status: 422 },
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: "InternalServerError", message: e.message || String(e) },
      { status: 500 },
    );
  }
}

function flattenFields(obj: any, prefix = ".", result: string[] = []): string[] {
  if (typeof obj !== "object" || obj === null) return result;
  for (const key of Object.keys(obj)) {
    const path = prefix === "." ? `.${key}` : `${prefix}.${key}`;
    result.push(path);
    if (typeof obj[key] === "object" && obj[key] !== null && !Array.isArray(obj[key])) {
      flattenFields(obj[key], path, result);
    }
  }
  return result;
}
