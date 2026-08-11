# Plan Lanjutan: Dukungan Filter Plugin Umum (`50_filter.conf`)

> Addendum dari `plan-siem-pipeline-simulator.md`. File `97_exclude.conf` cuma butuh if/else-if + `mutate add_field` (satu event masuk → satu event keluar, ter-mutate atau tidak). File `50_filter.conf` jauh lebih kompleks: ada **plugin selain mutate** (`json`, `split`), **kondisi existence/truthy**, **sprintf interpolation** (`%{[field]}`), dan yang paling penting — **`split` bisa mengubah 1 event jadi N event**. Ini butuh perubahan model eksekusi, bukan cuma nambah tipe kondisi.

---

## 1. Insight Penting Sebelum Mulai (baca dulu, ini krusial)

Rawlog contoh kamu untuk `50_filter.conf` punya `indicators`, `matchedRules`, `impactScope.entities` sebagai **object tunggal** (bukan array). Tapi `50_filter.conf` punya:

```
if [indicators] {
  split { field => "[indicators]" }
}
```

`split` di Logstash cuma valid untuk **field bertipe Array atau String** — kalau field-nya Hash/object tunggal, real Logstash akan **gagal split** (biasanya nge-log error & event lewat tanpa ke-split, kadang nambah tag error tergantung versi plugin).

**Artinya**: rawlog yang kamu kasih itu kemungkinan besar adalah **hasil ELK setelah `50_filter.conf` jalan** (sudah ter-split, makanya `indicators` udah jadi objek tunggal — hasil split dari array `indicators` asli yang isinya banyak). Raw payload **sebelum** masuk `50_filter.conf` (langsung dari TrendMicro Vision One API) kemungkinan `indicators`, `matchedRules`, dan `impactScope.entities` masih berbentuk **array**.

Ini bukan bug di plan — ini konsekuensi alami dari desain pipeline kamu sendiri: **rawlog yang "benar" buat nge-test `50_filter.conf` beda bentuk dari rawlog yang "benar" buat nge-test `97_exclude.conf`.** Yang kedua adalah *output* dari yang pertama.

**Keputusan desain** (dokumentasikan ke user di UI, jangan silent):
- Simulator kasih **mode/label input**: *"Pre-filter (raw API payload)"* vs *"Post-filter (ELK document)"*.
- Kalau user testing `50_filter.conf` tapi field yang mestinya array ternyata object tunggal → tampilkan **warning**, bukan crash: *"Field [indicators] bertipe Object, bukan Array — di Logstash asli, `split` kemungkinan gagal/no-op di sini. Pastikan kamu pakai raw payload pre-filter, bukan dokumen ELK yang sudah jadi."*
- Solusi paling bersih jangka panjang: **Fase 5 dari plan sebelumnya (chain 50→97)** — user cukup kasih raw payload asli sekali, lalu simulator jalanin `50_filter.conf` dulu (hasilnya event(s) ter-split), baru hasil itu di-pipe otomatis ke `97_exclude.conf`. Ini paling akurat & paling sesuai kebutuhan real.

---

## 2. Kondisi Baru yang Harus Didukung

Selain yang sudah ada di plan sebelumnya (`=~`, `==`, `in [...]`), tambahkan:

| Sintaks | Contoh | Makna |
|---|---|---|
| Truthy/existence check | `if [impactScope][entities]` | true kalau field **ada DAN bukan nil/kosong**. Perilaku Logstash: field gak ada → false. Field ada tapi `""` (empty string) → **false**. Field `0` atau `false` (literal) → tetap **true** (beda dari JS truthy!). Field array kosong `[]` → **false**. Field object kosong `{}` → perlu dicek, biasanya **true** (object exists). |
| Negated existence | `if ![src_ips]` | kebalikan di atas — true kalau field TIDAK ada / kosong |
| Membership dengan field reference | `"_jsonparsefailure" in [tags]` | beda dari `in [...]` literal list — di sini kanan adalah **field reference** ke array (`tags`), bukan literal `["a","b"]`. Parser harus bisa bedain `in [literal, list]` vs `in [field][path]` |

⚠️ **Gotcha truthy semantics**: Logstash punya aturan sendiri soal apa yang dianggap "falsy" — **ini beda dari JS/Python**. Jangan asal pakai `!!value` di JS. Buat fungsi eksplisit:

```ts
function isLogstashTruthy(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (value === "") return false;
  if (Array.isArray(value) && value.length === 0) return false;
  // 0, false, {} dianggap truthy (field "exists")
  return true;
}
```
Tulis unit test eksplisit untuk tiap edge case ini — ini area yang paling gampang bikin simulator "kelihatan benar" tapi diam-diam salah.

---

## 3. Plugin Baru (Selain `mutate`)

Plugin di Logstash itu arsitektur **filter chain** — tiap plugin adalah fungsi `(events[]) → events[]`. Desain interface generic:

```ts
interface FilterPlugin {
  type: string; // "mutate" | "json" | "split" | ...
  apply(events: LogEvent[], config: PluginConfig, ctx: SimContext): LogEvent[];
}
```

### 3.1 `json` filter
```
json { source => "message" }
```
- Ambil value dari field `source`, coba `JSON.parse()`.
- **Sukses**: merge hasil parse ke root event (field-field baru masuk ke top-level, atau ke `target` field kalau dispesifikasikan).
- **Gagal / field gak ada**: tambahkan `"_jsonparsefailure"` ke array `tags` (buat array baru kalau belum ada).
- **Kasus khusus buat simulator kamu**: karena rawlog yang kamu paste biasanya **sudah** berupa JSON object (bukan string mentah di field `message`), field `message` kemungkinan gak ada di rawlog kamu. Kasih **toggle**:
  - **Practical mode** (default): kalau field `source` gak ada di event, **skip filter ini** (no-op, gak nambah tag apapun) — asumsinya "data ini emang bukan raw beats output, gak relevan buat disimulasikan di sini".
  - **Faithful mode**: ikutin behavior asli Logstash persis (nambah `_jsonparsefailure` kalau field gak ada) — berguna kalau user memang testing raw ingest path.

### 3.2 `split` filter
```
split { field => "[indicators]" }
```
- Field harus **Array**. Untuk tiap elemen di array, buat **event baru** = clone event asli, tapi field target diganti jadi elemen tunggal itu.
- 1 event masuk → **N event keluar** (N = panjang array). Kalau array kosong → **0 event** (event ke-drop, gak keluar sama sekali — ini juga sering jadi bug di real Logstash yang orang gak sadar).
- Kalau field bukan Array (String atau Hash) → **error/no-op**, event tetap 1 (gak ke-split), kasih warning di trace (lihat §1).

**Ini mengubah model eksekusi secara fundamental** — lihat §4.

### 3.3 `mutate` — perluasan
Selain `add_field` (sudah ada di plan v1), tambahkan:
- `remove_field => ["a", "b", "[nested][path]"]` — hapus field dari event, support bracket path.
- **Sprintf interpolation** di value `add_field`: `"%{[matchedRules][name]}"` → resolve ke value field tersebut saat runtime, bukan string literal. Kalau field yang direferensi gak ada → Logstash biasanya keluarin literal `%{[field]}` apa adanya (gak di-replace) — dokumentasikan sebagai behavior yang harus ditiru persis.

```ts
function resolveSprintf(template: string, event: LogEvent): string {
  return template.replace(/%\{(\[[^}]+\]|\w+)\}/g, (match, ref) => {
    const path = parseFieldRef(ref); // "[matchedRules][name]" → ["matchedRules","name"]
    const value = getNestedValue(event, path);
    return value !== undefined ? String(value) : match; // biarin literal kalau gak ketemu
  });
}
```

### 3.4 `@metadata` field
`[@metadata][failed_event]`, `[@metadata][log_type]` — field yang **ditulis** ke event selama pipeline berjalan (bisa dipakai kondisi di stage berikutnya / buat routing output), tapi **tidak pernah muncul di final indexed document** (Logstash strip `@metadata` sebelum output ke Elasticsearch).

- Simulator harus **track `@metadata` secara terpisah** dari body event.
- Di panel "Resulting Event", **tampilkan 2 bagian**: `Event Body` (yang bakal ke-index) dan `@metadata` (collapsible, buat debugging aja — kasih label jelas "tidak akan muncul di ELK, cuma internal pipeline").

---

## 4. Perubahan Model Eksekusi

**Plan sebelumnya** (untuk `97_exclude.conf`): if/else-if chain, evaluasi top-down, berhenti di match pertama → 1 event in, 1 event out.

**`50_filter.conf` beda total**: semua `if` block adalah **stage independen berurutan**, bukan else-if chain. Tiap stage dieksekusi (kalau kondisinya true), lanjut ke stage berikutnya — **bukan** berhenti di match pertama.

```ts
type Stage = {
  condition: Condition | null; // null = selalu jalan (mutate terakhir & remove_field gak pakai if)
  plugin: FilterPlugin;
  pluginConfig: PluginConfig;
  sourceLine: number;
};

type ParsedFilterPipeline = {
  stages: Stage[]; // dieksekusi SEMUA secara berurutan, bukan else-if
};

function runPipeline(pipeline: ParsedFilterPipeline, initialEvent: LogEvent): {
  finalEvents: LogEvent[];
  trace: StageTraceEntry[];
} {
  let workingSet: LogEvent[] = [initialEvent];
  const trace: StageTraceEntry[] = [];

  for (const stage of pipeline.stages) {
    const nextSet: LogEvent[] = [];
    for (const event of workingSet) {
      const conditionMet = stage.condition ? evaluate(stage.condition, event) : true;
      trace.push({ sourceLine: stage.sourceLine, eventRef: event.__id, conditionMet, plugin: stage.plugin.type });
      if (conditionMet) {
        nextSet.push(...stage.plugin.apply([event], stage.pluginConfig, ctx));
      } else {
        nextSet.push(event); // event lewat gak berubah
      }
    }
    workingSet = nextSet;
  }
  return { finalEvents: workingSet, trace };
}
```

**Poin penting**: karena `split` bisa multiply event, tiap event butuh **id/lineage tracking** (`__id`, `__parentId`) supaya trace-nya jelas "event mana pecahan dari event mana" — penting banget buat UX, kalau enggak user bakal bingung liat 15 hasil output tanpa tau asalnya dari mana.

---

## 5. Model Data & Lineage

```ts
type LogEvent = {
  __id: string;          // uuid internal, bukan bagian dari data asli
  __parentId?: string;   // kalau hasil split, siapa parent-nya
  __splitIndex?: number; // index ke berapa di array asli
  metadata: Record<string, unknown>; // @metadata, terpisah dari body
  body: Record<string, unknown>;     // event fields yang beneran
};
```

Trace per event bisa direkonstruksi jadi **tree**, bukan flat list:
```
Original event
├─ split by [impactScope][entities] → 1 hasil (array cuma 1 elemen)
│  ├─ split by [indicators] → 3 hasil
│  │  ├─ event #1 (indicators.value = "PAK_Generic.001")
│  │  ├─ event #2 (indicators.value = "...")
│  │  └─ event #3 (indicators.value = "...")
```

---

## 6. UI Changes yang Dibutuhkan

Panel hasil di plan v1 asumsi "1 event masuk → 1 event keluar". Sekarang harus handle **N event keluar**:

- **Result Summary bar**: `"1 input event → 3 output events (setelah split di baris 14 & 20)"`
- **Event list/tabs**: kalau hasil > 1 event, tampilkan sebagai list yang bisa diklik (bukan langsung dump semua JSON), tiap item kasih preview field kunci (misal `indicators.value`, biar user gampang bedain tanpa buka full JSON).
- **Trace view**: ubah dari flat accordion (v1) jadi **stage-by-stage log**, per stage tampilkan berapa event masuk & keluar, dan kalau ada yang di-drop (array kosong di split) atau error (split gagal karena bukan array) — highlight jelas beda warna (misal kuning buat warning, bukan merah buat error, karena ini bukan invalid input tapi limitasi data).
- **Toggle** "Practical mode" vs "Faithful mode" untuk `json` filter behavior (§3.1) — taruh di settings/advanced options, default practical.
- **Metadata panel** terpisah & collapsed by default (§3.4).

---

## 7. Golden Test Cases Tambahan

Tambahkan ke test suite (di luar yang sudah ada di plan v1):

1. **Existence check dengan berbagai tipe falsy**: field gak ada, field `""`, field `[]`, field `0` → assert hasil `isLogstashTruthy` sesuai tabel §2.
2. **Split pada array normal**: field array 3 elemen → assert 3 event keluar, tiap event field target jadi elemen tunggal, field lain tetap sama (clone).
3. **Split pada array kosong**: assert 0 event keluar (event ke-drop).
4. **Split pada field bukan array (Hash)**: assert event tetap 1 (no-op) + warning muncul di trace, bukan crash.
5. **Sprintf resolve sukses**: `"%{[matchedRules][name]}"` dengan field ada → assert value ter-resolve.
6. **Sprintf resolve gagal**: field gak ada → assert literal `%{[matchedRules][name]}` tetap apa adanya (gak crash, gak jadi `undefined`).
7. **`in [tags]` dengan field reference**: assert dibedakan dari `in ["a","b"]` literal list di parser (harus 2 branch parsing berbeda).
8. **remove_field dengan nested path**: assert `[event][Data]` ke-hapus tanpa error walau parent path gak ada.
9. **End-to-end pakai config & rawlog kamu**: karena rawlog kamu bentuknya post-filter (§1), buat 2 varian test:
   - **Varian A (realistic pre-filter)**: modifikasi rawlog manual jadi `indicators`, `matchedRules`, `impactScope.entities` sebagai array → assert hasil split sesuai jumlah elemen.
   - **Varian B (rawlog asli kamu, apa adanya)**: assert bahwa `split` filter kasih **warning** karena field-nya object bukan array, dan event lolos tanpa ke-split (dokumentasikan ini sebagai expected behavior, bukan bug).

---

## 8. Roadmap Tambahan (Fase 1.5 — sisipkan sebelum Fase 2 di plan v1)

- [ ] Refactor evaluator: dari "single event, else-if chain" → "event array, sequential stages" (§4)
- [ ] Implementasi `isLogstashTruthy` + existence condition parsing (`if [field]`, `if ![field]`)
- [ ] Parser: bedain `in [literal,"list"]` vs `in [field][ref]`
- [ ] Plugin: `json` (dengan toggle practical/faithful)
- [ ] Plugin: `split` (dengan lineage tracking `__id`/`__parentId`)
- [ ] `mutate`: tambah `remove_field`, sprintf interpolation di `add_field`
- [ ] `@metadata` tracking terpisah dari body
- [ ] Update semua 9 golden test case di §7
- [ ] Update UI: result summary bar, event list/tabs, stage-by-stage trace, metadata panel, mode toggle

**Acceptance criteria fase ini**: paste `50_filter.conf` + rawlog Varian A (pre-filter, field array) → simulator hasilkan event count yang benar sesuai jumlah split, tiap event ter-lineage dengan jelas, dan field hasil `mutate` (dst_ips, eventname, hostname dari sprintf) ter-resolve dengan benar per masing-masing split event.

---

## 9. Update ke Roadmap Fase 5 (Chain Pipeline, dari plan v1)

Dengan Fase 1.5 selesai, **Fase 5 (chain 50→97)** jadi jauh lebih bernilai & straightforward secara teknis:

```
rawPayload (pre-filter, dari TrendMicro API)
   → run 50_filter.conf  → N events (post-split)
   → tiap event di-pipe ke 97_exclude.conf → hasil whitelisted/tidak per event
   → tampilkan sebagai N hasil independen
```

Ini juga otomatis **menyelesaikan masalah di §1** — user cukup kasih 1 rawlog (bentuk pre-filter), gak perlu bingung nyiapin 2 bentuk rawlog berbeda buat masing-masing tahap.
