# Plan: SIEM Pipeline Whitelist/Exclude Simulator

> Dokumen ini ditulis sebagai *build plan* untuk AI coding agent (Claude Code / Cursor / dst). Setiap fase punya scope, deliverable, dan acceptance criteria yang jelas supaya bisa dieksekusi bertahap tanpa banyak ambiguitas.

---

## 1. Ringkasan Proyek

**Masalah**: Kamu punya pipeline Logstash (`00_input → 50_filter → 97_exclude → 98/99_output`) dan mau tahu, tanpa deploy ulang ke Logstash beneran: *"kalau rawlog JSON ini masuk, apakah dia bakal ke-whitelist oleh `97_exclude.conf` atau enggak, dan whitelistId berapa yang match?"*

**Solusi**: Web app (JS full-stack) dengan dua input:
1. **Raw log** (JSON dari ELK/OpenSearch `_source` atau full hit object)
2. **Pipeline config** (`.conf` Logstash atau config Vector)

Lalu engine mem-parse config tersebut jadi AST kondisi, mengevaluasinya terhadap field-field di rawlog, dan menampilkan **hasil akhir** (event ter-mutate + field baru seperti `whitelisted`/`whitelistId`) plus **jejak keputusan** (rule mana yang match, kondisi mana yang true).

**Scope v1**: fokus ke `97_exclude.conf` style (if/else-if chain berisi `mutate { add_field }`). Bisa diperluas ke filter Logstash lain dan ke Vector (VRL) di fase berikutnya.

---

## 2. User Stories

- Sebagai SOC analyst, saya paste rawlog JSON dan paste isi `97_exclude.conf`, klik "Simulate", dan langsung lihat apakah event itu whitelisted, di rule ke berapa, dan field apa yang ditambahkan.
- Sebagai engineer, saya mau lihat **kenapa** suatu kondisi match/tidak match (field mana, value apa, regex apa yang dipakai) — bukan cuma hasil true/false.
- Sebagai engineer, saya mau simpan beberapa config pipeline (misal per client/tenant) dan pilih dari dropdown, bukan paste ulang tiap kali.
- Sebagai engineer, saya mau mode yang sama tapi untuk **Vector** (transform + VRL), karena sebagian infra sudah/akan migrasi dari Logstash ke Vector.
- (v2) Saya mau simulasikan full chain `50_filter → 97_exclude` sekaligus, bukan cuma satu file.

---

## 3. Arsitektur Sistem

```
┌─────────────────────────────┐
│         Frontend (Next.js)   │
│  - Editor rawlog JSON        │
│  - Editor pipeline config    │
│  - Panel hasil + trace       │
│  - Saved configs list        │
└───────────────┬───────────────┘
                │ REST (JSON)
┌───────────────▼───────────────┐
│      Backend (Next.js API      │
│      routes / Express)         │
│                                 │
│  ┌───────────────────────────┐ │
│  │ Logstash Conf Parser       │ │  → AST (if/else-if/else tree)
│  └───────────────────────────┘ │
│  ┌───────────────────────────┐ │
│  │ Vector Config/VRL Parser   │ │  → AST
│  └───────────────────────────┘ │
│  ┌───────────────────────────┐ │
│  │ Condition Evaluator        │ │  → jalanin AST vs event JSON
│  │ (=~, ==, in [], and/or/!)  │ │  → hasilkan trace
│  └───────────────────────────┘ │
│  ┌───────────────────────────┐ │
│  │ Mutation Applier            │ │  → apply add_field, dst
│  └───────────────────────────┘ │
└───────────────┬───────────────┘
                │
        ┌───────▼────────┐
        │  Storage (opsional) │  SQLite/Postgres — saved configs & history
        └────────────────────┘
```

**Kenapa bukan menjalankan Logstash/Vector beneran (headless)?**
Bisa saja (jalankan `logstash -f config --config.test_and_exit` atau pipe event lewat stdin), tapi itu berat (JVM startup, butuh binary Logstash/Vector ter-install, susah di-deploy sebagai web app ringan). Untuk kasus "exclude/whitelist simulator" yang cuma butuh subset grammar (if/else-if, kondisi field, mutate add_field), **custom parser + interpreter jauh lebih ringan, cepat, dan gampang dikasih explainability (trace)**. Opsi "real engine" bisa jadi mode tambahan di v2/v3 kalau butuh 100% fidelity untuk plugin-plugin kompleks.

---

## 4. Tech Stack

| Layer | Pilihan | Alasan |
|---|---|---|
| Frontend | Next.js 15 (App Router) + React + TailwindCSS | Kamu udah biasa pakai ini di project lain (roblox-store-dashboard) |
| Code editor UI | Monaco Editor (`@monaco-editor/react`) | Syntax highlighting untuk JSON & conf, line numbers buat trace |
| Backend | Next.js API routes (bisa full-stack 1 app, gak perlu server terpisah) | Simple, gak butuh infra tambahan |
| Parser | Custom hand-written recursive-descent parser (JS/TS) | Grammar Logstash conditional itu kecil & terbatas, gak butuh parser generator |
| Storage (opsional) | SQLite (better-sqlite3) untuk local/self-host, atau Postgres kalau mau selaras infra kamu yang lain | Simpan saved pipeline configs |
| Deployment | Docker + PM2/Nginx (samain pola kamu yang sudah ada di Tencent Cloud) | Konsisten sama setup existing |

> Alternatif ringan: kalau gak butuh "saved configs", app ini bisa 100% stateless (paste-only), gak perlu DB sama sekali di v1. Simpan config di localStorage browser dulu.

---

## 5. Domain Model & Parsing Strategy

### 5.1 Logstash Conditional Grammar (subset yang relevan)

File exclude kamu cuma pakai fitur-fitur ini — parser **tidak perlu** mendukung full Logstash grammar:

```
filter {
  if <condition> {
    mutate { add_field => { "k" => "v", ... } }
  } else if <condition> {
    ...
  } else {
    ...
  }
}
```

**Condition types yang harus didukung:**
| Sintaks | Contoh | Makna |
|---|---|---|
| Regex match | `[indicators][value] =~ /pattern/` | field cocok regex (case-insensitive kalau ada `(?i)`) |
| Regex not match | `[field] !~ /pattern/` | kebalikannya |
| Equality | `[model] == "Network Sniffing"` | field sama persis dengan string |
| Inequality | `[model] != "X"` | field tidak sama |
| Membership | `[indicators][value] in ["a", "b", "c"]` | field ada di list |
| Not membership | `[field] not in [...]` | field tidak ada di list |
| Logical AND | `condA and condB` | kedua kondisi true |
| Logical OR | `condA or condB` | salah satu true |
| Negation | `!condA` | kebalikan |
| Nested field path | `[a][b][c]` | akses nested JSON, setara `event.a.b.c` |

**Bracket path** (`[indicators][value]`) adalah cara Logstash reference field bersarang — parser harus translate `[indicators][value]` → `getNestedValue(event, ["indicators", "value"])`.

### 5.2 AST Shape (contoh TypeScript type)

```ts
type FieldPath = string[]; // ["indicators", "value"]

type Condition =
  | { type: "regexMatch"; field: FieldPath; pattern: string; flags: string; negate: boolean }
  | { type: "equals"; field: FieldPath; value: string; negate: boolean }
  | { type: "in"; field: FieldPath; values: string[]; negate: boolean }
  | { type: "and"; left: Condition; right: Condition }
  | { type: "or"; left: Condition; right: Condition }
  | { type: "not"; inner: Condition };

type MutateAction = { addField: Record<string, string> }; // bisa diperluas: remove_field, update, dst

type Rule = {
  condition: Condition | null; // null = branch "else" tanpa kondisi
  actions: MutateAction[];
  sourceLine: number; // buat highlight di editor
  branchIndex: number; // urutan if/else-if ke berapa
};

type ParsedPipeline = {
  filters: Rule[]; // urutan sesuai file, dievaluasi top-down, stop di match pertama (mirip if/else-if)
};
```

### 5.3 Evaluator

Evaluasi **top-down**, berhenti di kondisi pertama yang `true` (persis semantik `if / else if / else` Logstash — bukan evaluasi semua rule). Untuk tiap rule yang dicoba, catat:
- index & source line rule
- hasil evaluasi tiap sub-kondisi (kalau ada `and`/`or`, breakdown per-leaf)
- field value aktual yang dibaca dari event (buat debugging "kenapa gak match")

Output trace contoh:
```json
{
  "matchedRule": { "branchIndex": 5, "whitelistId": "6", "sourceLine": 44 },
  "evaluationTrace": [
    { "branchIndex": 0, "matched": false, "reason": "[indicators][value] tidak mengandung '/opt/metasploit-framework/data/'" },
    { "branchIndex": 1, "matched": false, "reason": "[model] != 'User Discovery via W Command - MacOS'" },
    { "branchIndex": 2, "matched": false, "reason": "[model] != 'Network Sniffing'" },
    { "branchIndex": 3, "matched": false, "reason": "[model] != 'Access to Web Browser Login Data File'" },
    { "branchIndex": 4, "matched": false, "reason": "[model] != 'Cloudflare Tunnel Connection'" },
    { "branchIndex": 5, "matched": true, "reason": "[model] == 'Scanned Malware Detection' DAN regex ^C:\\Program Files (x86)\\nxlog\\.* cocok" }
  ],
  "resultEvent": { "...event asli...", "whitelisted": "true", "whitelistId": "6" }
}
```

> Catatan penting dari contoh rawlog kamu: field yang dipakai kondisi (`[model]`, `[indicators][value]`) ada di `_source`. Jadi evaluator harus tahu root object mana yang dipakai — default-nya `_source` kalau user paste full ES hit, atau langsung root kalau user paste isi `_source` saja. Tambahkan auto-detect: kalau ada key `_source`, pakai `_source` sebagai root event; kalau tidak, pakai object langsung.

### 5.4 Vector (fase 2)

Vector pakai **VRL (Vector Remap Language)** di dalam `remap` transform, sintaksnya beda total dari Logstash:

```toml
[transforms.exclude]
type = "remap"
inputs = ["filter"]
source = '''
if match(.indicators.value, r'/opt/metasploit-framework/data/') {
  .whitelisted = "true"
  .whitelistId = "1"
} else if .model == "Network Sniffing" && match(.indicators.value, r'(?i)tcpdump') {
  .whitelisted = "true"
  .whitelistId = "3"
}
'''
```

Strategi: buat **parser VRL terpisah** (subset: `if/else if`, `match()`, `contains()`, `==`, `!=`, `&&`, `||`, field assignment `.field = value`). Reuse **AST & evaluator yang sama** dari Logstash parser — cukup beda di layer parsing (front-end grammar), evaluator/engine-nya sama. Ini alasan kenapa AST di §5.2 didesain generic, bukan Logstash-specific.

---

## 6. API Design

```
POST /api/simulate
Body:
{
  "engine": "logstash" | "vector",
  "rawlog": <object>,          // JSON event
  "pipelineConfig": "<string>", // isi file .conf / .toml
  "rootPath": "_source"          // opsional, override root object
}

Response 200:
{
  "matched": true,
  "matchedRule": { "branchIndex": 5, "whitelistId": "6", "sourceLine": 44 },
  "evaluationTrace": [ ... ],
  "resultEvent": { ... },
  "parseWarnings": []   // syntax yang gak dikenali parser, biar user tau limitasi
}

Response 400 (parse error):
{
  "error": "ParseError",
  "message": "Unexpected token at line 12: ...",
  "line": 12
}
```

```
GET    /api/configs          # list saved pipeline configs
POST   /api/configs          # simpan config baru (name, engine, content)
GET    /api/configs/:id
DELETE /api/configs/:id
```

---

## 7. Frontend — Flow UI

**Layout 2 kolom + 1 panel hasil (bisa dibuat 3-pane resizable):**

1. **Kolom kiri**: Editor "Raw Log (JSON)" — Monaco, JSON syntax + validasi.
2. **Kolom tengah**: Editor "Pipeline Config" — tab switch `Logstash` / `Vector`, textarea/Monaco dengan syntax highlight custom (atau plain, minimal versi awal).
3. **Kolom kanan / bawah**: Panel hasil:
   - Badge besar: ✅ **Whitelisted (id: 6)** atau ❌ **Not whitelisted**
   - Accordion "Evaluation Trace" — list semua branch yang dicoba, expand tiap branch buat lihat detail field vs pattern
   - Tab "Resulting Event (JSON)" — hasil akhir setelah mutate, dengan diff highlight (field baru di-highlight hijau)
   - Tombol "Copy result", "Save this config"

**Komponen tambahan (v1.5):**
- Dropdown "Load saved pipeline" (kalau pakai storage)
- Tombol "Load example" (isi otomatis dengan contoh dari kamu, buat testing cepat)
- Klik salah satu trace row → auto-scroll & highlight baris terkait di editor config (pakai `sourceLine`)

---

## 8. Evaluation Engine — Detail Implementasi

### 8.1 Tokenizer + Parser (Logstash)
- Tokenizer: split jadi token (`if`, `else`, `[`, `]`, identifier, string literal, regex literal `/.../`, operator `=~ !~ == != in and or not && ||`, `{`, `}`)
- Parser: recursive descent, precedence: `not` > `and` > `or` (sesuaikan dengan Logstash real precedence — cek dokumentasi resmi buat presisi)
- Regex literal Logstash pakai Ruby-style regex (`(?i)` inline flag). JS regex support `(?i)`? **Tidak native** — perlu translate `(?i)pattern` → `new RegExp(pattern, "i")` di parser (strip `(?i)` dari string, set flag `i`).

### 8.2 Mutate Applier
- v1: cuma `add_field`
- v2: `remove_field`, `update`, `replace`, `rename` (kalau dipakai di filter lain yang mau disimulasikan)

### 8.3 Regex Compatibility Gotchas (penting!)
Logstash pakai Ruby (Oniguruma) regex, sedangkan JS pakai regex engine sendiri. Sebagian besar syntax kompatibel, tapi ada beda:
- Ruby `(?i)` inline anywhere in pattern → JS gak support inline flag di tengah, harus di-extract ke `RegExp` flags.
- Ruby lookbehind/lookahead sedikit beda edge case dari V8 regex — cukup untuk kasus umum tapi dokumentasikan sebagai limitasi.
- Escape backslash di path Windows (`C:\\Program Files...`) — hati-hati double-escaping saat parsing string dari conf ke JS string ke RegExp.

Tulis **unit test khusus** untuk pola regex yang ada di 6 contoh rule kamu, supaya kepastian match/no-match terverifikasi sebelum lanjut fitur lain.

---

## 9. Contoh End-to-End (pakai data kamu)

Rawlog kamu: `model = "Scanned Malware Detection"`, tapi **tidak ada field** yang berisi path `C:\Program Files (x86)\nxlog\...` (field `indicators.value` isinya `"PAK_Generic.001"`, itu bukan path nxlog).

Expected result simulasi:
```
matched: false
whitelisted: (tidak ditambahkan)
evaluationTrace: branch 0-4 → model tidak cocok, branch 5 → model cocok TAPI regex nxlog tidak cocok pada value "PAK_Generic.001" → overall not matched
resultEvent: sama seperti rawlog asli (tidak ada mutasi)
```

Gunakan case ini sebagai **golden test case #1** di test suite.

---

## 10. Roadmap / Fase Implementasi

### Fase 0 — Setup
- [ ] Init Next.js 15 project (App Router, TS, Tailwind)
- [ ] Setup struktur folder: `/lib/parser`, `/lib/evaluator`, `/lib/engines/logstash`, `/lib/engines/vector`, `/app/api/simulate`, `/app/(ui)`
- [ ] Setup testing (Vitest/Jest)

### Fase 1 — Logstash Engine (MVP)
- [ ] Tokenizer untuk Logstash conditional syntax
- [ ] Parser → AST (`Condition`, `Rule`, `ParsedPipeline`)
- [ ] Evaluator (top-down, short-circuit di match pertama)
- [ ] Mutate applier (`add_field` only)
- [ ] Unit test pakai 6 rule contoh kamu + beberapa rawlog (match & no-match case)
- [ ] API route `POST /api/simulate` (engine=logstash)

**Acceptance criteria**: paste 97_exclude.conf kamu + rawlog contoh di atas → API return `matched: false` dengan trace yang benar per branch.

### Fase 2 — Frontend MVP
- [ ] Layout 2-3 kolom (raw log / config / result)
- [ ] Monaco editor integration
- [ ] Panel hasil + evaluation trace (accordion)
- [ ] "Load example" button (prefill data kamu)
- [ ] Error handling untuk JSON invalid / parse error di config

**Acceptance criteria**: dari browser, paste config + rawlog, klik simulate, lihat hasil + trace tanpa reload/error.

### Fase 3 — Vector Support
- [ ] Tokenizer + parser VRL subset (if/else, `match()`, `contains()`, field assignment)
- [ ] Reuse evaluator/engine dari Fase 1 (AST sama)
- [ ] Toggle engine di UI (Logstash ↔ Vector)
- [ ] Test case Vector setara dengan test case Logstash (sama rule, beda sintaks, hasil harus identik)

### Fase 4 — Saved Configs & Persistence (opsional)
- [ ] Setup DB (SQLite/Postgres)
- [ ] CRUD `/api/configs`
- [ ] UI dropdown load/save
- [ ] (opsional) auth simple kalau mau multi-user/multi-client config

### Fase 5 — Nice to have
- [ ] Simulasi full chain (`50_filter.conf` → `97_exclude.conf`) sekaligus, bukan cuma 1 file
- [ ] Diff viewer visual (before/after event, highlight field yang berubah)
- [ ] Rule coverage report: dari kumpulan rawlog historis, rule mana yang paling sering/gak pernah match (bantu audit whitelist yang udah gak relevan)
- [ ] Import langsung dari OpenSearch/Elastic query (paste query DSL atau doc ID → fetch via API kamu) — **hati-hati kalau ini expose credentials ke instance ELK, taruh di backend only, jangan pernah expose ke client**
- [ ] Export hasil simulasi ke JSON/PDF buat dokumentasi audit

---

## 11. Testing Strategy

- **Unit test** parser: tokenize & parse tiap tipe kondisi (regex, equals, in-list, and/or/not, nested field path) secara terpisah.
- **Unit test** evaluator: kombinasi kondisi kompleks (`and` + `or` + `not` bersarang).
- **Golden test cases**: ambil beberapa rawlog real (anonymized) + expected result manual, jadikan regression suite — supaya kalau parser di-refactor gak diam-diam berubah behaviour.
- **Parity test** (fase 3): rule yang sama ditulis di Logstash & Vector syntax, harus hasilkan `resultEvent` identik untuk rawlog yang sama.

---

## 12. Deployment

Selaras sama pola kamu yang sudah ada (Tencent Cloud, PM2/Nginx/Docker):
```
Docker build (multi-stage: build Next.js → run standalone output)
→ push image / rsync build
→ PM2 start (atau Docker Compose)
→ Nginx reverse proxy + TLS
```
Karena tool ini internal (SOC/engineering use), pertimbangkan taruh di belakang VPN/basic auth — jangan expose publik tanpa auth kalau nanti ada fitur import langsung dari ELK instance.

---

## 13. Risiko & Open Questions

| Risiko | Mitigasi |
|---|---|
| Grammar Logstash conditional lebih kaya dari yang diasumsikan (ada sintaks lain di file lain yang belum kelihatan) | Desain parser modular, `parseWarnings` di response biar keliatan kalau ada token yang gak dikenali, bukan silent-fail |
| Regex Ruby vs JS beda edge case | Dokumentasikan limitasi, tulis test khusus untuk pattern yang benar-benar dipakai di prod kamu |
| Root object event ambigu (`_source` vs root) | Auto-detect + opsi override manual di UI |
| Vector VRL grammar cukup luas (function calls macam-macam) | Scope v1 Vector cuma subset fungsi yang benar-benar dipakai di config kamu — jangan coba full VRL interpreter dari awal |

**Pertanyaan buat kamu sebelum eksekusi (AI agent sebaiknya konfirmasi ini dulu):**
1. Apakah butuh persistence (saved configs) di v1, atau paste-only dulu cukup?
2. Root object rawlog: selalu full ES hit (ada `_index`, `_source`, dst) atau kadang cuma isi `_source`?
3. File config lain (`50_filter.conf`, dst) — apakah nanti perlu disimulasikan juga (chain), atau `97_exclude.conf` aja cukup untuk sekarang?
