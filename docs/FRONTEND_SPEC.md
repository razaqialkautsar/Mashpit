# Frontend Spec — Dashboard Mashpit

| | |
| --- | --- |
| Versi | v1 (draf), 13 Nov 2026 |
| Pemilik | Bayu |
| Terkait | [PRD.md](PRD.md), [SMART_CONTRACT_SPEC.md](SMART_CONTRACT_SPEC.md) |
| Agent skills | `near-dapp`, `near-api-js` (terpasang di proyek lewat `npx skills add near/agent-skills`) |

Isi dokumen ini adalah **rancangan** kecuali yang ditandai **Fakta**. API library sudah dicek di docs.near.org dan README near-api-js pada 13 Nov 2026 (§2).

---

## 1. Tujuan

Dashboard adalah tempat juri dan pengamat melihat pasar keeper bekerja secara live (wow moment), dan tempat pemilik job mendaftarkan job (P1). Dashboard **hanya membaca data dari kontrak** lewat RPC publik. Tidak ada backend, database, atau API key di frontend.

Requirement terkait di PRD: FR-W1 s/d FR-W5, NFR-5, NFR-6, NFR-9.

---

## 2. Fakta teknis yang dipakai

| Fakta | Sumber |
| --- | --- |
| Docs NEAR: "Do not use NEAR Wallet Selector (`@near-wallet-selector/*`). It is deprecated… Use NEAR Connect (`@hot-labs/near-connect`)". Instalasi: `npm install @hot-labs/near-connect near-api-js` | [docs wallet login](https://docs.near.org/web3-apps/tutorials/wallet-login) |
| Versi terbaru di npm per 13 Nov 2026: `near-api-js` 7.5.3, `@hot-labs/near-connect` 0.12.0 | registry npm |
| RPC publik testnet `https://rpc.testnet.near.org` dapat dipakai gratis | Q-009; diuji 13 Nov |
| Waktu blok terukur: testnet ~0,582 detik/blok (rata-rata 1000 blok, 13 Nov) | Pengukuran RPC |
| Format link explorer testnet yang dipakai proyek lain: `https://testnet.nearblocks.io/address/<akun>` | README Slay the Bear |
| Hosted demo nilai plus; biarkan online sampai 18 Nov, ideal 25 Nov | Q-012 |
| near-api-js v7: view call lewat `new JsonRpcProvider({ url })` lalu `provider.callFunction({ contractId, method, args })` (perhatikan: field-nya `method`). Butuh Node.js 22.22.2 atau lebih baru untuk tooling | [README near-api-js](https://github.com/near/near-api-js), [docs near-api](https://docs.near.org/tools/near-api) |
| NEAR Connect: `new NearConnector({ network: "testnet" })`; login dengan `connector.connect()`, akun dari `getAccounts()`, event `wallet:signIn`; transaksi lewat `(await connector.wallet()).signAndSendTransaction({ receiverId, actions: [{ type: "FunctionCall", params: { methodName, args, gas, deposit } }] })`; banyak transaksi dalam satu persetujuan lewat `signAndSendTransactions({ transactions })` | [docs wallet login](https://docs.near.org/web3-apps/tutorials/wallet-login) |
| "NEAR Connect does not provide a built-in way to call read-only (view) methods" → view call tetap lewat near-api-js | [docs near-connect](https://docs.near.org/tools/near-connect) |

---

## 3. Halaman

| Route | Prioritas | Isi | Data (view method kontrak) |
| --- | --- | --- | --- |
| `/` Live | P0 | Statistik ringkas (blok, epoch, jumlah job, keeper, total stake, fee); daftar job dengan fase putaran, hitung mundur, pemenang, hasil terakhir | `get_stats`, `list_jobs` |
| `/jobs/:id` Detail job | P0 | Parameter job; panel putaran (timeline fase, tabel commit/reveal + memo AI, pemenang, jendela eksklusif); tabel riwayat eksekusi | `get_job`, `get_round`, `get_history` |
| `/keepers` Keeper | P0 | Tabel keeper: stake, terkunci, reward, eksekusi, slash | `list_keepers` |
| `/new` Buat job | P1 | Connect wallet; template job; form; ringkasan deposit dan gas | `get_config` + transaksi `register_job` |
| Aksi pemilik di `/jobs/:id` | P1 | Tambah saldo, jeda/lanjutkan, tutup job (hanya muncul kalau akun yang login = pemilik job) | transaksi `top_up`, `pause_job`, `resume_job`, `close_job` |

### 3.1 Aturan tampilan

- **Fase putaran** diambil dari field `phase` di `get_job` (dihitung kontrak). Frontend tidak menghitung ulang aturan bisnis.
- **Hitung mundur** ditampilkan dalam blok, dengan perkiraan detik bertanda "≈", memakai 0,58 detik/blok (fakta pengukuran; bisa berubah).
- **Jumlah NEAR** diterima sebagai string yoctoNEAR (U128), dikonversi dengan `BigInt` (1 NEAR = 10^24 yocto). Jangan memakai `Number` untuk nilai yocto.
- **Memo AI** ditampilkan apa adanya sebagai teks biasa. Memo berasal dari keeper (data tidak tepercaya), jadi tidak boleh dirender sebagai HTML.
- **Hasil eksekusi** diberi label: `Paid` (dibayar), `ReturnedFalse` (berhasil, tidak ada pekerjaan, tidak dibayar), `Failed` (gagal). Baris yang punya `slashed_keeper` ditandai sebagai failover.
- **Keterlambatan** = `exec_block − due_block` (kalau `due_block` ada).
- **Link**: akun (keeper, target, pemilik) ke `https://testnet.nearblocks.io/address/<akun>`. Kontrak tidak menyimpan hash transaksi, jadi riwayat tidak menautkan ke transaksi individual.

---

## 4. Wireframe

### 4.1 Live (`/`)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ MASHPIT · keeper market on NEAR testnet          [Keepers] [New job] [Connect]│
├──────────────────────────────────────────────────────────────────────────────┤
│ Block 277,49x,xxx · Epoch 6,4xx · Jobs 3 · Keepers 3 · Stake 30 NEAR · Fee 0.2│
├──────────────────────────────────────────────────────────────────────────────┤
│ JOB  TARGET.METHOD                         SCHEDULE   PHASE        WINNER  LAST│
│ #1   linear-protocol.testnet               per epoch  ● Reveal     —       Paid│
│      .epoch_update_rewards                            12 blok (≈7s)            │
│ #2   aurora.pool.f863973.m0.ping           per epoch  ● Awarded    k2      Paid│
│ #3   linear-protocol.testnet.epoch_stake   per epoch  ● Open       —  RetFalse│
└──────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Detail job (`/jobs/:id`)

```
┌ Job #1 · linear-protocol.testnet.epoch_update_rewards ───────────────────────┐
│ Args {"validator_id":"aurora.pool.f863973.m0"} · Gas 150 Tgas · Per epoch     │
│ Rule: Any · Max reward 0.05 NEAR · Balance 1.2 NEAR · Owner razaqi.testnet    │
├ Round #7 ─────────────────────────────────────────────────────────────────────┤
│ Commit ──▶ Reveal ──▶ Awarded ──▶ Exclusive ──▶ (Open)                         │
│            ▲ sekarang · berakhir dalam 12 blok (≈7s)                           │
│                                                                                │
│ KEEPER  COMMIT@   BID         MEMO (alasan AI)                                 │
│ k1      +3        0.020 NEAR  "Gas ≈0.0125 NEAR; margin 60%; riwayat 7/7 sukses"│
│ k2      +5        0.018 NEAR  "Job rutin; tawar rendah untuk menang"            │
│ k3      +9        —           (belum reveal)                                    │
├ Riwayat ───────────────────────────────────────────────────────────────────────┤
│ ROUND EXECUTOR  OUTCOME  PAID        DUE→EXEC   NOTE                            │
│ 6     k3        Paid     0.050 NEAR  +61 blok   failover: k2 di-slash           │
│ 5     k2        Paid     0.018 NEAR  +4 blok                                     │
└───────────────────────────────────────────────────── [Top up] [Pause] [Close] ┘
```

Angka di wireframe adalah contoh tata letak, bukan data.

### 4.3 Keeper (`/keepers`)

```
┌ Keepers ──────────────────────────────────────────────────────────────────────┐
│ KEEPER                 STAKE    LOCKED   REWARDS   EXECUTED   SLASHED          │
│ k1.<akun>.testnet      10 NEAR  0        0.31      9          0                │
│ k2.<akun>.testnet      10 NEAR  0.5      0.22      7          1                │
└───────────────────────────────────────────────────────────────────────────────┘
```

### 4.4 Buat job (`/new`, P1)

```
┌ New job ─────────────────────────────────────────────── [Connected: x.testnet] ┐
│ Template: (●) LiNEAR epoch_update_rewards  ( ) Staking pool ping  ( ) Custom    │
│ Target contract  [linear-protocol.testnet          ]                            │
│ Method           [epoch_update_rewards             ]                            │
│ Args (JSON)      [{"validator_id":"aurora.pool..."}]                            │
│ Gas (Tgas)       [150]   total dengan callback+overhead: 185 / 300 ✓            │
│ Schedule         (●) Every epoch  ( ) Every [   ] blocks                        │
│ Success rule     (●) Any  ( ) Must return true                                  │
│ Max reward       [0.05] NEAR                                                    │
│ Deposit          [1.0 ] NEAR  (sebagian dipakai untuk storage; sisanya saldo)   │
│                                                        [ Register job ]         │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Lapisan data

| Modul | Tanggung jawab |
| --- | --- |
| `lib/near.ts` | View call: satu instance `JsonRpcProvider` (URL dari `VITE_RPC_URL`), fungsi `view(method, args)` yang membungkus `provider.callFunction({ contractId, method, args })` |
| `lib/wallet.ts` | Satu instance `NearConnector({ network: "testnet" })`; `signIn()` → `connect()` + `getAccounts()`; `call(methodName, args, gas, deposit)` → `wallet.signAndSendTransaction` dengan action `FunctionCall`. Skill `near-dapp` menyebut paket `near-connect-hooks` untuk React; pemakaiannya keputusan Bayu |
| `lib/contract.ts` | Fungsi bertipe untuk setiap view dan change method di SMART_CONTRACT_SPEC §4 |
| `lib/types.ts` | Tipe TypeScript yang mencerminkan `JobView`, `Round`, `ExecutionRecord`, `Keeper`, `Config` dari SMART_CONTRACT_SPEC §2 |
| `lib/format.ts` | yocto ↔ NEAR (BigInt), blok → perkiraan detik, pemendekan nama akun |
| `hooks/usePoll.ts` | Polling tiap 3 detik (usulan, memenuhi NFR-5); berhenti saat tab tidak aktif |

**Penanganan error:** banner kalau RPC gagal, coba lagi otomatis pada polling berikutnya. Error dari transaksi ditampilkan dengan kode dari kontrak (format `"Mashpit: <Kode>: <detail>"`, SMART_CONTRACT_SPEC §6).

**Tanpa data palsu.** Sesuai kriteria tim, tidak ada mock data. Sebelum kontrak `mashpit` ter-deploy, sambungan RPC diuji dengan view method nyata LiNEAR testnet (`get_summary`, `get_validators` di `linear-protocol.testnet`; fakta: keduanya merespons pada 13 Nov). Begitu Razaqi men-deploy versi awal kontrak dengan view method, halaman langsung memakai kontrak itu.

---

## 6. Struktur folder `web/` (rancangan)

Framework adalah keputusan Bayu (PRD D4). Usulan: Vite + React + TypeScript, karena hasilnya situs statis (NFR-6).

```
web/
├── package.json
├── .env.example            # VITE_NETWORK=testnet, VITE_CONTRACT_ID=, VITE_RPC_URL=https://rpc.testnet.near.org,
│                           # VITE_EXPLORER_URL=https://testnet.nearblocks.io
├── index.html
└── src/
    ├── main.tsx
    ├── App.tsx             # router
    ├── pages/
    │   ├── Live.tsx
    │   ├── JobDetail.tsx
    │   ├── Keepers.tsx
    │   └── NewJob.tsx      # P1
    ├── components/
    │   ├── StatsBar.tsx
    │   ├── JobTable.tsx
    │   ├── PhaseTimeline.tsx
    │   ├── BidsTable.tsx
    │   ├── HistoryTable.tsx
    │   ├── KeeperTable.tsx
    │   ├── OwnerActions.tsx   # P1
    │   └── ConnectButton.tsx  # P1
    ├── lib/
    │   ├── near.ts
    │   ├── wallet.ts
    │   ├── contract.ts
    │   ├── types.ts
    │   └── format.ts
    └── hooks/
        └── usePoll.ts
```

---

## 7. Non-functional

| ID | Requirement |
| --- | --- |
| FE-NFR-1 | Build menghasilkan situs statis; bisa di-hosting tanpa server aplikasi |
| FE-NFR-2 | Tidak ada secret di kode frontend; hanya variabel `VITE_*` publik |
| FE-NFR-3 | Data diperbarui ≤ 5 detik (polling 3 detik) |
| FE-NFR-4 | Tampilan bisa dipakai di desktop dan ponsel; tabel bisa digulir horizontal di layar kecil |
| FE-NFR-5 | Teks dari kontrak (memo, nama method) dirender sebagai teks, bukan HTML |
| FE-NFR-6 | Halaman Live bisa dibuka tanpa wallet |

---

## 8. Acceptance criteria (frontend)

| ID | Kriteria |
| --- | --- |
| FE-AC-1 | Halaman Live menampilkan semua job dari `list_jobs` beserta fase dan hitung mundur yang berubah tanpa reload |
| FE-AC-2 | Detail job menampilkan tawaran yang sudah di-reveal beserta memo AI, dan baris "belum reveal" untuk commit tanpa reveal |
| FE-AC-3 | Riwayat menampilkan outcome, jumlah dibayar, keterlambatan, dan tanda failover |
| FE-AC-4 | Halaman Keeper cocok dengan `list_keepers` |
| FE-AC-5 | (P1) Job baru bisa didaftarkan dari `/new` dengan wallet testnet, lalu langsung muncul di Live |
| FE-AC-6 | (P1) Aksi pemilik hanya tampil untuk pemilik job |
| FE-AC-7 | Langkah membuka dashboard tercantum di README dengan format "do X - see Y" |

---

## 9. Ketergantungan dengan kontrak

| Kebutuhan Bayu | Dari Razaqi | Kapan (usulan) |
| --- | --- | --- |
| Nama dan bentuk JSON view method | SMART_CONTRACT_SPEC §2 dan §4.6 (dibekukan lebih dulu) | 13 Nov, awal |
| Kontrak versi awal ter-deploy di testnet dengan view method | `CONTRACT_ID` testnet | 13 Nov malam |
| Job dan keeper nyata di kontrak | `scripts/seed-jobs.mjs`, `scripts/create-keepers.mjs` | 14 Nov pagi |

---

## 10. Pertanyaan terbuka (frontend)

- [ ] Framework dan hosting (PRD D4, D5).
- [ ] Pakai `near-connect-hooks` (disebut skill `near-dapp`) atau NEAR Connect langsung.
- [ ] Apakah halaman Live perlu menampilkan perbandingan dengan GitHub Actions (bahan pitch) atau cukup di README.
