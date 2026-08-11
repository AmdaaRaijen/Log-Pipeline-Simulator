# Plan: Auto Whitelist Creator (Halaman Baru)

> Addendum dari 3 plan sebelumnya (`Exclude Simulator` — Logstash & Vector). Fitur ini **reuse habis-habisan** parser & evaluator yang udah dibangun di plan-plan sebelumnya, dipakai sebagai **validator otomatis** buat output LLM. Ini poin desain paling penting di seluruh plan ini — jangan bangun validasi terpisah, pakai ulang engine yang sudah ada.

---

## 1. Konsep Inti

```
[Raw Log JSON] + [Engine target] + [Contoh whitelist (opsional)] + [Penjelasan bahasa natural]
        │
        ▼
   LLM generate kandidat rule (snippet if-block, sesuai syntax engine target)
        │
        ▼
   Validasi OTOMATIS pakai parser + evaluator dari Exclude Simulator
   (parse snippet → evaluasi terhadap rawlog yang sama)
        │
   ┌────┴────┐
   ▼          ▼
 MATCH      GAGAL (parse error / gak match / field salah)
 (whitelisted=true)   │
   │          ▼
   │      Feed error balik ke LLM → retry (max N attempt)
   ▼
 Tampilkan hasil final: rule + badge "✅ Verified" + trace + explanation
```

**Prinsip keamanan penting**: fitur ini adalah **draft assistant**, bukan auto-deploy. Output selalu perlu **direview manusia** sebelum ditempel ke `97_exclude.conf` / VRL config produksi — ini rule yang bakal nyembunyiin event dari SOC kalau salah, jadi human-in-the-loop wajib, gak boleh ada tombol "langsung deploy ke prod".

---

## 2. Layout Halaman (3 Kolom)

```
┌───────────────┬─────────────────────────┬───────────────────────┐
│  RAW INPUT     │  CONFIG                  │  OUTPUT                │
│                │                           │                        │
│  [JSON editor] │  Engine: (●Logstash)      │  Status: ✅ Verified   │
│  rawlog event  │           (○Vector)       │                        │
│                │                           │  [Generated snippet]   │
│  (toggle)      │  Contoh whitelist          │  syntax-highlighted,   │
│  "Lihat field  │  (opsional)                │  copy button           │
│  path tersedia"│  [textarea/monaco]         │                        │
│                │                           │  Penjelasan (dari LLM) │
│                │  Penjelasan whitelist       │  "Rule ini match       │
│                │  (wajib)                   │  karena hostname &     │
│                │  [textarea]                │  indicator value..."   │
│                │  "hostname X && indicator   │                        │
│                │  value Y"                  │  ⚠️ Warnings (kalau ada)│
│                │                           │                        │
│                │  [Generate Whitelist]      │  ▸ Attempt history      │
│                │  ⚙️ Advanced: max retries   │  (collapsible, 3x try) │
│                │                           │                        │
│                │                           │  [Test lagi di          │
│                │                           │   Exclude Simulator →]  │
└───────────────┴─────────────────────────┴───────────────────────┘
```

**Field kolom tengah** (sesuai request kamu):
1. **Engine** — required, default `Logstash`, segmented control sama seperti di Exclude Simulator (reuse komponen).
2. **Contoh whitelist** — optional. Ini few-shot example, bantu LLM ngikutin gaya/style penulisan rule yang biasa kamu pakai (misal urutan field, penamaan `whitelistId`).
3. **Penjelasan whitelist** — required, bahasa natural (Indonesia/Inggris campur juga oke), misal: *"whitelist event dengan hostname REDACTED... && indicator.value == PAK_Generic.001"*.

**Fitur bantu tambahan yang disarankan ditambah** (bukan dari brief asli, tapi bantu akurasi LLM):
- Toggle **"Lihat field path tersedia"** di kolom kiri — hasil flatten rawlog jadi list path (lihat §4), biar user bisa nulis "Penjelasan whitelist" pakai nama field yang akurat, bukan nebak-nebak.
- Optional field **"Whitelist ID yang mau dihindari"** (comma-separated, misal `1,2,3,4,5,6`) — karena kita gak tau existing max ID dari config production kamu (lihat §9 Open Questions), biar LLM gak nyaranin ID yang collision.

---

## 3. API Design

```
POST /api/auto-whitelist
Body:
{
  "engine": "logstash" | "vector",
  "rawlog": <object>,
  "exampleWhitelist": "<string>",   // opsional
  "description": "<string>",        // wajib
  "avoidWhitelistIds": ["1","2","3"], // opsional
  "maxRetries": 3                    // opsional, default 3
}

Response 200:
{
  "success": true,
  "verified": true,
  "finalSnippet": "else if [hostname] == \"...\" and [indicators][value] == \"...\" { mutate { add_field => { \"whitelisted\" => \"true\", \"whitelistId\" => \"7\" } } }",
  "explanation": "Rule ini match karena field [hostname] sama persis dengan 'REDACTED...' dan [indicators][value] sama persis dengan 'PAK_Generic.001'.",
  "warnings": [],
  "attempts": [
    { "attemptNumber": 1, "snippet": "...", "parseOk": true, "matched": true, "errors": [] }
  ]
}

Response 200 (gagal setelah retry habis):
{
  "success": false,
  "verified": false,
  "lastSnippet": "...",
  "lastError": "Field [indicators][value] yang dipakai LLM tidak ditemukan di rawlog — kemungkinan salah path (harusnya [indicators][value], LLM nulis [indicator][value])",
  "attempts": [ ... semua percobaan ... ]
}
```

⚠️ **Penting**: request ini **harus lewat backend**, jangan pernah panggil LLM API langsung dari browser — API key harus disimpan server-side (env var), gak boleh ke-expose ke client bundle. Contoh kode `fetch` yang kamu kasih itu polanya oke, tapi taruh di **API route/server action**, bukan di komponen React client-side.

---

## 4. Field Path Flattening (Context Builder untuk LLM)

Sebelum manggil LLM, flatten rawlog jadi list `path = sample value` — ini ngurangin drastis kemungkinan LLM salah nebak nama field/nesting (kasus nyata: `impactScope.entities.entityValue.name` itu dalam banget, gampang typo kalau LLM ngarang dari "feeling"):

```ts
function flattenForPrompt(obj: unknown, prefix: string[] = []): string[] {
  const lines: string[] = [];
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => lines.push(...flattenForPrompt(item, [...prefix, `[${i}]`])));
  } else if (obj !== null && typeof obj === "object") {
    for (const [key, value] of Object.entries(obj)) {
      lines.push(...flattenForPrompt(value, [...prefix, key]));
    }
  } else {
    lines.push(`${prefix.join(".")} = ${JSON.stringify(obj)}`);
  }
  return lines;
}
```

Contoh hasil flatten dari rawlog kamu (dipotong):
```
hostname = "REDACTED.intra.com.co.id"
model = "Scanned Malware Detection"
indicators.value = "PAK_Generic.001"
indicators.field = "malName"
impactScope.entities.entityValue.name = "REDACTED.intra.com.co.id"
impactScope.entities.entityValue.ips.0 = "10.24.141.11"
...
```

Ini yang dikirim ke LLM sebagai **grounding context**, bukan cuma raw JSON mentah — kirim dua-duanya sebenarnya (raw JSON buat struktur lengkap, flattened list buat quick reference path yang valid).

**Auto-root-detection reuse**: sama seperti Exclude Simulator (plan v1 §5.3) — kalau rawlog yang dipaste full ES hit (ada `_source`), flatten dari `_source`. Rawlog contoh kamu kali ini gak ada wrapper `_source`/`_index` (langsung objek), jadi flatten dari root langsung. Reuse fungsi `resolveEventRoot()` yang sama.

---

## 5. Prompt Design

### 5.1 System Prompt — harus berisi "grammar contract"

Poin paling krusial: LLM **tidak boleh mengarang syntax bebas** — parser kita di Exclude Simulator cuma support **subset** grammar (lihat plan part 1 §5.1 untuk Logstash, part 3 §2 untuk Vector). Kalau LLM nulis syntax yang gak didukung parser kita (misal fungsi VRL yang belum ada di registry, atau operator Logstash yang gak umum), hasilnya bakal **parse error di validator** padahal secara syntax itu valid di Logstash/Vector asli — ini bikin loop retry sia-sia. Makanya system prompt **wajib** eksplisit kasih tau LLM batasan syntax yang didukung.

```
Kamu adalah asisten pembuat rule whitelist untuk SIEM pipeline (Logstash conditional filter / Vector VRL).

ATURAN OUTPUT:
- Output HANYA satu blok rule (if-block), bukan seluruh file config.
- Gunakan HANYA syntax berikut (di luar ini akan gagal divalidasi):
  [Logstash]: kondisi memakai =~, !~, ==, !=, in [...], and, or, !; hanya action mutate.add_field yang didukung.
  [Vector]: kondisi memakai exists(), contains(), match() dengan regex r'...', to_string!(), ==, &&, ||, !; assignment .field = "value".
- Field path HARUS diambil dari daftar "Available field paths" yang diberikan — JANGAN mengarang path yang tidak ada di sana.
- Response harus JSON: { "snippet": string, "explanation": string, "suggestedWhitelistId": string }
- whitelistId TIDAK BOLEH salah satu dari: {avoidWhitelistIds}

KONTEKS:
Raw event JSON: {rawlog}
Available field paths: {flattenedPaths}
Contoh whitelist (gaya yang diikuti, kalau ada): {exampleWhitelist}
Penjelasan whitelist dari user: {description}
```

### 5.2 Output Schema (Zod, divalidasi sebelum dipakai)

```ts
const LlmWhitelistOutputSchema = z.object({
  snippet: z.string().min(1),
  explanation: z.string(),
  suggestedWhitelistId: z.string(),
});
```
Kalau LLM balikin JSON yang gak sesuai schema (walau udah pakai `response_format: json_object`) → treat sebagai attempt gagal, masuk retry loop juga (jangan asumsikan `response_format: json_object` menjamin schema-nya benar, itu cuma menjamin valid JSON, bukan shape yang kita mau).

---

## 6. Validation & Self-Correction Loop

**Ini bagian yang reuse langsung dari 3 plan sebelumnya** — parser + evaluator Logstash/Vector yang udah dibangun di Exclude Simulator dipakai lagi di sini tanpa modifikasi:

```ts
async function generateAndValidate(input: AutoWhitelistInput): Promise<AutoWhitelistResult> {
  const flattenedPaths = flattenForPrompt(resolveEventRoot(input.rawlog));
  const attempts: Attempt[] = [];
  let conversationHistory: ChatMessage[] = [buildSystemPrompt(input, flattenedPaths)];

  for (let i = 0; i < (input.maxRetries ?? 3); i++) {
    const llmResponse = await callLlm(conversationHistory);
    const parsed = LlmWhitelistOutputSchema.safeParse(JSON.parse(llmResponse));

    if (!parsed.success) {
      attempts.push({ attemptNumber: i + 1, error: "LLM output tidak sesuai schema" });
      conversationHistory.push({ role: "user", content: "Output kamu tidak sesuai format JSON yang diminta. Coba lagi." });
      continue;
    }

    const snippet = normalizeSnippetForValidation(parsed.data.snippet, input.engine);
    // ^ auto-convert "else if" jadi "if" (lihat §7), wrap jadi mini pipeline

    const parseResult = input.engine === "logstash"
      ? parseLogstashPipeline(snippet)
      : parseVrlPipeline(snippet);

    if (!parseResult.ok) {
      attempts.push({ attemptNumber: i + 1, snippet, parseOk: false, error: parseResult.error });
      conversationHistory.push({
        role: "user",
        content: `Rule kamu gagal di-parse: "${parseResult.error}". Perbaiki syntax-nya, ikuti grammar yang dibolehkan.`,
      });
      continue;
    }

    const evalResult = evaluate(parseResult.pipeline, resolveEventRoot(input.rawlog));
    const isWhitelisted = evalResult.resultEvent.whitelisted === "true";

    attempts.push({ attemptNumber: i + 1, snippet, parseOk: true, matched: isWhitelisted, trace: evalResult.trace });

    if (isWhitelisted) {
      const warnings = lintForOverBroadRule(parseResult.pipeline, flattenedPaths); // lihat §8
      return { success: true, verified: true, finalSnippet: parsed.data.snippet, explanation: parsed.data.explanation, warnings, attempts };
    }

    conversationHistory.push({
      role: "user",
      content: `Rule kamu ke-parse dengan benar, tapi TIDAK match terhadap event yang diberikan. Trace evaluasi: ${JSON.stringify(evalResult.trace)}. Perbaiki kondisinya.`,
    });
  }

  return { success: false, verified: false, lastSnippet: attempts.at(-1)?.snippet, lastError: attempts.at(-1)?.error, attempts };
}
```

---

## 7. Gotcha: Snippet Standalone vs Full Pipeline

LLM sering bakal nulis output pakai keyword `else if` (niru gaya contoh whitelist yang dikasih), tapi itu **gak valid berdiri sendiri** — `else if` butuh `if` sebelumnya. Untuk validasi, snippet perlu di-**normalize**:

```ts
function normalizeSnippetForValidation(snippet: string, engine: Engine): string {
  if (engine === "logstash") {
    // "else if (...)" di awal snippet → ganti jadi "if (...)" biar valid berdiri sendiri
    const trimmed = snippet.trim();
    const normalized = trimmed.startsWith("else if")
      ? trimmed.replace(/^else\s+if/, "if")
      : trimmed;
    return `filter {\n${normalized}\n}`; // wrap biar sesuai grammar parseLogstashPipeline
  }
  // Vector: if-block VRL udah valid berdiri sendiri, gak perlu normalize
  return snippet;
}
```

Tampilkan **snippet asli** (dengan `else if`) ke user di panel output (karena itu yang mau mereka copy-paste ke config asli, nyambung ke rule sebelumnya), tapi versi **ternormalisasi** yang dipakai internal buat validasi. Jangan sampai user bingung liat snippet di UI beda dari yang divalidasi — kasih catatan kecil di UI: *"Divalidasi sebagai rule mandiri, sesuaikan `else if` → `if` kalau ini rule pertama di file kamu."*

---

## 8. Linter "Rule Terlalu Broad" (Safety Check)

Rule whitelist yang salah desain **menyembunyikan ancaman nyata** dari SOC — risiko ini lebih tinggi kalau rule digenerate otomatis. Tambahkan heuristic check (bukan blocking, cuma warning) sebelum kasih hasil final:

| Heuristik | Kenapa berisiko |
|---|---|
| Kondisi cuma cek **1 field** | Terlalu general, gampang exploited (attacker bisa mimic 1 field itu doang) |
| Pakai `contains`/substring tanpa anchor, string pendek (<5 char) | Gampang false-positive ke banyak value lain |
| Regex tanpa anchor (`^`/`$`) dan tanpa escape khusus | Match lebih luas dari yang diniatkan |
| Field yang dipakai kondisi adalah field **high-cardinality tapi bukan unique-identifying** (misal cuma cek `severity == "high"`) | Ini bukan indikator spesifik ke satu jenis event, whitelist jadi terlalu permisif |
| Value yang dipakai match hasil kesamaan **exact** dengan seluruh field description (bukan sebagian spesifik) | Biasanya oke, tapi kalau description field gampang berubah dikit (ada versi/timestamp di dalamnya), rule jadi rapuh — flag sebagai info, bukan warning keras |

```ts
function lintForOverBroadRule(pipeline: ParsedPipeline, availablePaths: string[]): string[] {
  const warnings: string[] = [];
  const conditionFieldCount = countDistinctFields(pipeline.filters[0].condition);
  if (conditionFieldCount < 2) {
    warnings.push("⚠️ Rule ini cuma cek 1 field kondisi — pertimbangkan tambah kondisi lain biar lebih spesifik dan gak over-whitelist event lain yang mirip.");
  }
  // ... heuristik lain
  return warnings;
}
```

Tampilkan warning ini **jelas** di panel output (bukan disembunyikan di collapsible), karena ini yang paling penting buat user baca sebelum copy-paste ke production.

---

## 9. Audit Trail & Rate Limiting

- **Log setiap request** (input rawlog hash/redacted, description, snippet final, siapa yang generate, timestamp) ke storage — penting buat audit "kenapa event kayak gini di-whitelist, siapa yang bikin rule-nya, kapan". Ini SOC tooling, harus punya jejak.
- Jangan log rawlog mentah kalau isinya sensitif (IP internal, hostname internal) tanpa retensi/akses yang jelas — pertimbangkan redaksi atau retention policy pendek.
- **Rate limit** endpoint ini (LLM call = biaya + risiko abuse) — misal N request/menit per user.
- Model & endpoint LLM (`ai.sumopod.com`, `deepseek-v4-flash`) taruh di **env var**, jangan hardcode, biar gampang ganti provider/model tanpa redeploy code.

---

## 10. Walkthrough Manual (Golden Test Case)

Pakai persis contoh kamu:
- **Engine**: Logstash
- **Rawlog**: seperti yang kamu kasih (root langsung, gak ada `_source` wrapper)
- **Penjelasan**: *"whitelist event dengan hostname REDACTED.intra.com.co.id && indicator.value == PAK_Generic.001"*

**Expected flow:**
1. Flatten rawlog → LLM dapat konteks `hostname = "REDACTED.intra.com.co.id"`, `indicators.value = "PAK_Generic.001"`.
2. LLM attempt #1 generate:
   ```
   else if [hostname] == "REDACTED.intra.com.co.id" and [indicators][value] == "PAK_Generic.001" {
     mutate {
       add_field => {
         "whitelisted" => "true"
         "whitelistId" => "7"
       }
     }
   }
   ```
3. Normalize: `else if` → `if`, wrap `filter { ... }`.
4. Parse: **sukses** (syntax sesuai grammar yang didukung).
5. Evaluate terhadap rawlog: `[hostname]` cocok, `[indicators][value]` cocok → **matched = true**.
6. Linter: 2 field dicek (hostname + indicators.value) → **tidak** kena warning "cuma 1 field", exact match (bukan substring) → aman.
7. Hasil: **✅ Verified** langsung di attempt #1, tampilkan snippet asli (dengan `else if`), explanation, no warnings.

Jadikan ini **golden test case wajib** untuk skenario "happy path, langsung berhasil attempt pertama". Buat juga test case skenario **retry** (misal LLM salah nulis path `[indicator][value]` — kurang huruf `s` — attempt pertama gagal karena field gak ketemu, attempt kedua benar setelah dapat feedback trace).

---

## 11. Roadmap

### Fase A — Backend LLM Integration
- [ ] API route `/api/auto-whitelist`, API key dari env var, panggilan LLM di server-side
- [ ] Zod schema validasi output LLM
- [ ] Error handling utk LLM API failure (5xx, timeout, rate limit) — retry terpisah dari retry validasi

### Fase B — Context Builder
- [ ] `flattenForPrompt()` + reuse `resolveEventRoot()` dari Exclude Simulator
- [ ] System prompt builder dengan grammar contract per engine

### Fase C — Validation Loop (reuse core)
- [ ] `normalizeSnippetForValidation()` (handle `else if` standalone issue)
- [ ] Reuse `parseLogstashPipeline` / `parseVrlPipeline` / `evaluate` — **tidak boleh** ada implementasi validasi baru yang terpisah dari Exclude Simulator
- [ ] Retry loop dengan conversation history (feed error balik ke LLM)

### Fase D — Safety Linter
- [ ] Heuristik over-broad rule (§8), tampilkan sebagai warning non-blocking

### Fase E — Frontend
- [ ] Layout 3 kolom (§2)
- [ ] Toggle "Lihat field path tersedia" (pakai `flattenForPrompt` yang sama, expose sebagai endpoint/util di client juga)
- [ ] Panel attempt history (collapsible)
- [ ] Tombol "Test lagi di Exclude Simulator" — deep link prefill snippet + rawlog ke halaman Exclude Simulator

### Fase F — Audit & Ops
- [ ] Logging request (redacted sesuai kebijakan)
- [ ] Rate limiting
- [ ] Env var config buat model/endpoint LLM

**Acceptance criteria**: input contoh kamu (rawlog + engine Logstash + penjelasan hostname+indicator) → hasil akhir snippet valid, ✅ verified di attempt pertama atau setelah retry, dengan trace & explanation yang jelas, dan gak ada warning over-broad palsu.

---

## 12. Open Questions

1. **Existing whitelistId** — kita gak tau ID berapa aja yang udah dipakai di `97_exclude.conf` produksi kamu tanpa user input manual. Perlu field tambahan "avoid these IDs" (§2) atau lebih baik user bisa **paste full existing exclude.conf** juga sebagai context opsional (biar LLM auto-detect next ID & gaya existing rules)? Ini bisa jadi field ke-4 di kolom config.
2. **Provider/model LLM** — pakai `ai.sumopod.com` + `deepseek-v4-flash` sesuai contoh kamu, tapi worth dikonfirmasi apakah ini yang mau dipakai permanent atau cuma contoh, karena pricing/rate-limit/reliability provider ini akan mempengaruhi desain retry & rate limiting di §9.
3. **Retention log** — rawlog yang di-generate biasanya berisi hostname/IP internal. Perlu kebijakan eksplisit soal retensi log audit (§9) — disimpan berapa lama, siapa yang bisa akses.
4. **Approval workflow** — apakah cukup user copy-paste manual ke config production, atau nanti butuh fitur formal "submit for review" (misal ke reviewer lain) sebelum dipakai? (Di luar scope v1, tapi worth dipikirkan kalau tim SOC-nya lebih dari 1 orang.)
