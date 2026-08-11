# Plan Lanjutan: Vector (VRL) Support di "Exclude Simulator (v1)"

> Addendum dari 2 plan sebelumnya. Ini mengisi **Fase 3** yang tadinya masih placeholder di plan v1 — sekarang berdasarkan contoh VRL asli dari kamu. Fokusnya: halaman utama sekarang punya **engine selector** (`Logstash` / `Vector`), tapi semua fitur pendukung lain (rawlog input, editor config, panel hasil, trace) **tetap dipakai bersama** — cukup beda parser & sedikit beda semantik eksekusi.

---

## 1. Perubahan UI Utama

Halaman **"Exclude Simulator (v1)"** ditambah **engine selector** di paling atas, sebelum kedua editor:

```
┌─────────────────────────────────────────────┐
│  Exclude Simulator (v1)                       │
│  Engine: ( ● Logstash )  ( ○ Vector )         │  ← tab/segmented control
├─────────────────────────────────────────────┤
│  [ Raw Log (JSON) ]     [ Pipeline Config ]   │
│                                                │
│  Placeholder config berubah sesuai engine:     │
│   - Logstash → contoh 97_exclude.conf          │
│   - Vector   → contoh VRL whitelist di atas     │
├─────────────────────────────────────────────┤
│  Hasil: whitelisted? rule mana? trace           │
└─────────────────────────────────────────────┘
```

- Engine selector **switch parser** yang dipakai di backend (`engine: "logstash" | "vector"` — field ini sudah ada di API design plan v1 §6, tinggal dipakai).
- Editor config kanan: kalau memungkinkan, ganti syntax highlighting Monaco sesuai engine (`ruby`-ish buat Logstash conf, custom/plain buat VRL — Monaco gak punya built-in VRL, bisa pakai highlighting minimal berbasis regex token).
- Simpan pilihan engine terakhir di state/localStorage biar gak reset tiap reload.

---

## 2. VRL Grammar Subset yang Harus Didukung

Berdasarkan contoh whitelist kamu:

| Sintaks VRL | Contoh | Makna |
|---|---|---|
| Existence check | `exists(.whitelisted)` | field ada & bukan null |
| Negasi | `!exists(.whitelisted)` | field gak ada |
| Field path (dot notation) | `.last_action`, `.process_chain[1].command` | akses field, termasuk index array |
| Equality | `.last_action == "DELETE_SUCCESS"` | sama persis |
| Logical AND/OR | `&&`, `\|\|` | sama seperti bahasa lain |
| Function call: `contains` | `contains(to_string!(.path), "CL_Utility.ps1")` | substring check |
| Function call: `match` | `match(to_string!(x), r'(?i)pattern')` | regex match |
| Type coercion (fallible) | `to_string!(.path)` | convert ke string; suffix `!` = **abort kalau gagal** (field null/gak ada) |
| Raw string regex literal | `r'(?i)CompatTelRunner\.exe...'` | delimiter beda dari string biasa (`'...'` bukan `"..."`), prefix `r` |
| Assignment | `.whitelisted = "true"` | set field, di dalam block `if { }` |
| Comment | `# ...` sampai akhir baris | termasuk **blok if yang di-comment-out semua** (contoh rule 2 di kamu) |

Function registry di v1 cukup 3 fungsi ini (`exists`, `contains`, `match`, `to_string!`) — tapi desain sebagai **registry extensible**, karena VRL production biasanya juga pakai `starts_with`, `ends_with`, `includes`, `to_int!`, `is_nullish`, `downcase`, dll. Jangan hardcode cuma 3 fungsi ini di parser, treat semua function call sebagai generic `FunctionCall(name, args)` node, lalu registry-nya yang nentuin diimplementasi atau enggak (kalau belum diimplementasi → `parseWarnings`, bukan crash).

---

## 3. Parser Design (VRL Tokenizer)

Beda-beda penting dari tokenizer Logstash (plan v1 §8.1):

- **Field path**: `.field.nested[0].more` — leading dot, lalu chain `.identifier` atau `[index]`. Beda dari Logstash yang pakai bracket semua (`[field][nested]`).
- **String literal biasa**: `"..."` — normal escape rules.
- **Raw regex literal**: `r'...'` — **tidak** ada escape processing di dalam (semua backslash literal, persis ditulis), delimiter pakai `'` bukan `"`. Parser harus baca dari `r'` sampai `'` penutup tanpa proses escape.
- **Fallible function suffix**: `nama_fungsi!(...)` — `!` nempel di nama fungsi, bukan operator terpisah. Tokenizer harus include `!` sebagai bagian dari identifier function kalau langsung diikuti `(`.
- **Comment**: `#` sampai akhir baris — termasuk baris yang isinya kode valid tapi di-comment (contoh rule 2 kamu). Strip semua komentar **sebelum** tokenizing utama, tapi **simpan posisi/isi comment block** kalau mau fitur "tampilkan rule yang di-disable" (§7).

### AST tambahan (extend dari plan v1 §5.2)

```ts
type Expr =
  | { type: "fieldRef"; path: FieldPath }
  | { type: "stringLiteral"; value: string }
  | { type: "regexLiteral"; pattern: string; flags: string }
  | { type: "functionCall"; name: string; fallible: boolean; args: Expr[] };

type Condition =
  | { type: "equals"; left: Expr; right: Expr; negate: boolean }
  | { type: "functionCall"; name: string; args: Expr[]; negate: boolean } // exists(), contains(), match() dipakai sbg boolean langsung
  | { type: "and"; left: Condition; right: Condition }
  | { type: "or"; left: Condition; right: Condition }
  | { type: "not"; inner: Condition };

type Assignment = { targetPath: FieldPath; valueExpr: Expr };

type VrlStage = {
  condition: Condition;
  assignments: Assignment[];
  sourceLine: number;
  disabled?: boolean; // true kalau seluruh block ini di-comment-out di source
};
```

---

## 4. Execution Model

**Kabar baik**: model eksekusi VRL whitelist ini **lebih sederhana** dari `50_filter.conf` (gak ada split, 1 event tetap 1 event), tapi **beda dari `97_exclude.conf`** (bukan else-if chain eksplisit) — semua `if` block dieksekusi **berurutan**, tapi pola `!exists(.whitelisted)` di tiap kondisi berfungsi sebagai **guard manual** yang meniru perilaku else-if:

```
Rule 1: if !exists(.whitelisted) && (...) { set whitelisted, whitelistID=1 }
Rule 3: if !exists(.whitelisted) && (...) { set whitelisted, whitelistID=2 }
Rule 4: if !exists(.whitelisted) && (...) { set whitelisted, whitelistID=3 }
```
Begitu salah satu rule match & set `.whitelisted`, rule-rule berikutnya otomatis `!exists(.whitelisted)` → false → skip. **Hasil akhirnya sama seperti else-if chain**, tapi caranya beda — dan ini penting buat implementasi engine:

⚠️ **Kondisi harus dievaluasi terhadap event yang ter-update secara mutable, bukan snapshot event asli** — kalau engine kamu naif (evaluasi semua kondisi terhadap event awal sebelum ada mutasi apapun), rule 1 dan rule 3 bisa dua-duanya "match" secara independen padahal harusnya rule 3 ke-skip karena rule 1 udah keburu set `.whitelisted`. Reuse persis arsitektur sequential-stage dari plan part 2 (§4) — event working state di-mutate in-place tiap stage, bukan dievaluasi dari snapshot awal.

```ts
function runVrlPipeline(stages: VrlStage[], initialEvent: LogEvent): {
  finalEvent: LogEvent;
  trace: VrlTraceEntry[];
} {
  const event = structuredClone(initialEvent); // mutable working copy
  const trace: VrlTraceEntry[] = [];

  for (const stage of stages) {
    if (stage.disabled) {
      trace.push({ sourceLine: stage.sourceLine, skipped: true, reason: "Rule di-comment-out di source config" });
      continue;
    }
    const { matched, evalDetail, error } = evaluateVrlCondition(stage.condition, event);
    trace.push({ sourceLine: stage.sourceLine, matched, evalDetail, error });
    if (matched) {
      for (const a of stage.assignments) {
        setNestedValue(event, a.targetPath, resolveExpr(a.valueExpr, event));
      }
    }
  }
  return { finalEvent: event, trace };
}
```

---

## 5. Function Registry & Fallible Function Semantics

```ts
type VrlFunctionImpl = (args: unknown[], event: LogEvent) => { value: unknown; error?: string };

const VRL_FUNCTIONS: Record<string, VrlFunctionImpl> = {
  exists: (args) => ({ value: args[0] !== undefined && args[0] !== null }),
  contains: (args) => ({ value: typeof args[0] === "string" && args[0].includes(String(args[1])) }),
  match: (args) => {
    const [str, regex] = args as [string, RegExp];
    if (typeof str !== "string") return { value: false, error: "Input bukan string" };
    return { value: regex.test(str) };
  },
  to_string: (args) => {
    if (args[0] === undefined || args[0] === null) {
      return { value: undefined, error: "Field tidak ada / null — to_string! akan abort di Vector asli" };
    }
    return { value: String(args[0]) };
  },
  // extend di sini: starts_with, ends_with, includes, to_int, downcase, dst.
};
```

**Semantik `!` (fallible/abort)** — ini beda perilaku dari fungsi biasa, butuh **toggle mode** (pola yang sama seperti `json` filter di plan part 2 §3.1):

- **Practical mode (default)**: kalau fungsi fallible (`to_string!`, dst.) gagal (field null/gak ada) → kondisi yang memakainya dianggap **false** (rule di-skip), lanjut ke rule berikutnya, kasih warning di trace: *"to_string!(.path) gagal karena field tidak ada — rule ini di-skip"*.
- **Faithful mode**: ikutin perilaku asli Vector — runtime error di fallible function **menghentikan seluruh eksekusi VRL script untuk event itu** (abort). Assignment yang sudah kejalan sebelum baris error tetap ke-apply, tapi rule setelahnya (termasuk rule lain yang gak terkait) **tidak dievaluasi sama sekali**. Tampilkan di trace: *"❌ Aborted at line X — remaining rules tidak dievaluasi"*.

Dokumentasikan jelas di UI mana mode yang lagi aktif, karena hasilnya bisa beda signifikan.

---

## 6. Comment & Disabled-Rule Handling

Contoh kamu (rule 2) di-comment-out total pakai `#` per baris. Ini fitur yang **berguna ditampilkan**, bukan cuma di-skip diam-diam:

- Saat parsing, deteksi blok comment yang **strukturnya mirip rule VRL valid** (mengandung `if`, `.whitelisted`, kurung kurawal) → tandai sebagai `disabled: true` stage, **tetap coba parse isinya** (best-effort) supaya bisa ditampilkan di UI, tapi **tidak pernah dievaluasi**.
- UI: tampilkan rule ini di list rule dengan style "strikethrough / abu-abu / badge **DISABLED**", biar engineer yang baca langsung ngeh ada whitelist rule yang sengaja dimatikan — ini berguna banget buat audit ("kenapa rule 2 gak pernah kepakai? oh ternyata di-comment").
- Kalau comment block **gak** mirip struktur rule (comment biasa, penjelasan, dst) → treat sebagai comment biasa, gak perlu ditampilkan spesial.

---

## 7. Root Object Addressing (konsisten dengan Logstash mode)

VRL selalu address field langsung dari root event (`.field`, bukan `[field]` under `_source`) — secara konsep, **VRL beroperasi seolah root-nya sudah `_source`**. Jadi reuse auto-detect dari plan v1 §5.3: kalau rawlog yang dipaste adalah full ES hit (ada `_index`, `_source`, dst), root evaluasi = `_source`; kalau rawlog cuma isi objectnya langsung, root = objek itu sendiri. Behavior ini **sama** baik untuk Logstash maupun Vector mode — jangan bikin logic terpisah, cukup satu fungsi `resolveEventRoot(rawlog)` yang dipakai kedua engine.

---

## 8. Walkthrough Manual (Golden Test Case)

Contoh rawlog untuk test (dikonstruksi sesuai field yang dipakai config kamu):

```json
{
  "last_action": "SOMETHING_ELSE",
  "description": "Script contains suspicious features.",
  "path": "C:\\Scripts\\CL_Utility.ps1",
  "process_chain": [
    { "command": "powershell.exe -Command ... HKLM:\\SOFTWARE\\Microsoft\\CTF\\TIP ..." },
    { "command": "CompatTelRunner.exe -m:appraiser.dll" }
  ]
}
```

**Trace yang diharapkan:**
1. Rule 1 (`whitelistID=1`): `!exists(.whitelisted)` → true. `.last_action == "DELETE_SUCCESS"`? false. `== "QUARANTINE_SUCCESS"`? false. → kondisi keseluruhan **false** → skip.
2. Rule 2: `disabled: true` (comment) → skip, gak dievaluasi, muncul di UI sebagai disabled.
3. Rule 3 (`whitelistID=2`): `!exists(.whitelisted)` → masih true. `.description == "Script contains suspicious features."` → true. `contains(to_string!(.path), "CL_Utility.ps1")` → `to_string!(.path)` sukses (`"C:\\Scripts\\CL_Utility.ps1"`), `contains(...)` → true. → kondisi **true** → **MATCH**. Set `.whitelisted = "true"`, `.whitelistID = "2"`.
4. Rule 4 (`whitelistID=3`): `!exists(.whitelisted)` → **sekarang false** (udah di-set rule 3) → skip, **walaupun** kondisi `process_chain` sebenarnya juga match kalau dicek terpisah. Ini justru bukti bahwa engine **wajib** mutable-state evaluation (§4) — kalau salah implementasi (evaluasi semua terhadap snapshot awal), rule 4 bakal ke-flag match juga, padahal harusnya enggak.

**Expected final event**: `whitelisted: "true"`, `whitelistID: "2"`, sisanya field asli tetap sama.

Jadikan ini **golden test case wajib** — khususnya poin ke-4, karena ini nge-test bug paling gampang kejadian di implementasi VRL guard-pattern.

**Test case tambahan**: rawlog dengan `last_action = "DELETE_SUCCESS"` → assert rule 1 match duluan (`whitelistID=1`), dan rule 3 & 4 ke-skip walau kondisinya sendiri sebenarnya true — buktiin guard-nya kerja dari rule paling awal juga, bukan cuma dari rule 3.

---

## 9. Roadmap Tambahan (Fase 3, sekarang lebih konkret)

- [ ] Tambah engine selector di UI utama (`Logstash` / `Vector`), simpan state pilihan
- [ ] VRL tokenizer: dot-path, array index, string literal, raw regex literal (`r'...'`), fallible function suffix (`!`), comment stripping dengan deteksi "disabled block"
- [ ] VRL parser → `VrlStage[]` (reuse `Condition`/`Expr` AST, extend seperlunya sesuai §3)
- [ ] Function registry (`exists`, `contains`, `match`, `to_string!`) — desain extensible, `parseWarnings` untuk fungsi belum didukung
- [ ] Evaluator: sequential mutable-state execution (§4) — **wajib** ada golden test untuk guard-pattern (§8 poin 4)
- [ ] Practical/Faithful mode toggle untuk fallible function abort semantics (§5)
- [ ] UI: tampilkan disabled rules dengan badge jelas (§6)
- [ ] Reuse `resolveEventRoot()` dari Logstash mode, jangan duplikat logic (§7)
- [ ] Golden test suite: minimal 3 kasus dari §8 (match rule 3, match rule 1 duluan, disabled rule diverifikasi gak pernah true)

**Acceptance criteria**: user pilih engine "Vector" di UI, paste config VRL kamu + rawlog dari §8 → hasil `whitelisted: true, whitelistID: "2"`, trace nunjukin rule 1 & 4 di-skip dengan alasan yang benar, rule 2 muncul sebagai disabled.

---

## 10. Open Questions

1. **Mode default** (Practical vs Faithful) buat fallible function abort — practical lebih ramah buat "quick check apakah event ke-whitelist", tapi kurang akurat 1:1 sama Vector asli. Perlu dikonfirmasi mana yang lebih relevan buat use case sehari-hari kamu.
2. Apakah butuh fungsi VRL lain di luar 4 yang ada di contoh (`starts_with`, `ends_with`, `to_int!`, dll) untuk config-config lain yang belum kamu share? Kalau iya, lebih baik disiapkan daftarnya di awal biar function registry-nya langsung lengkap, bukan nambah satu-satu tiap ketemu kasus baru.
3. Apakah rule yang di-comment-out **selalu** ingin ditampilkan di UI (§6), atau cukup di-skip diam-diam seperti comment biasa? (Rekomendasi plan ini: tampilkan, karena berguna buat audit.)
