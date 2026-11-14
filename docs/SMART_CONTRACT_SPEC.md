# Smart Contract Spec — `mashpit`

| | |
| --- | --- |
| Versi | v1 (draf), 13 Nov 2026 |
| Pemilik | Razaqi |
| Jaringan | NEAR testnet |
| Bahasa / SDK | Rust, near-sdk 5.30.1 (terbaru di crates.io per 13 Nov), build dengan cargo-near (0.23.0). Test: `cargo test` untuk unit test, `near-sandbox` + `near-api` untuk integration test (cara yang disebut docs NEAR) |
| Terkait | [PRD.md](PRD.md), [FRONTEND_SPEC.md](FRONTEND_SPEC.md) |
| Agent skills | `near-smart-contracts`, `near-contract-audit`, `near-cli-rs` (terpasang di proyek lewat `npx skills add near/agent-skills`) |

Seluruh isi dokumen ini adalah **rancangan** kecuali yang ditandai **Fakta**. Nama API near-sdk di dokumen ini sudah dicek di docs.rs near-sdk 5.30.1 dan docs.near.org pada 13 Nov 2026 (lihat §1).

---

## 1. Fakta yang membatasi desain

| Fakta | Sumber | Dampak ke desain |
| --- | --- | --- |
| Kontrak tidak bisa berjalan sendiri; harus dipanggil akun eksternal | [docs.near.org](https://docs.near.org/smart-contracts/what-is) | Butuh keeper off-chain |
| Callback cross-contract "always runs, but it can still fail"; tidak ada rollback otomatis | [docs cross-contract](https://docs.near.org/smart-contracts/anatomy/crosscontract) | Callback tidak boleh panic; state "in-flight" ditangani eksplisit |
| Hasil panggilan dibaca di callback (`#[callback_result] r: Result<T, PromiseError>`); callback ditandai `#[private]` | docs cross-contract | Verifikasi sukses di callback |
| `env::epoch_height()` dan `env::block_height()` tersedia | [docs.rs](https://docs.rs/near-sdk/latest/near_sdk/env/fn.epoch_height.html) | Jadwal `EveryEpoch` dan `EveryBlocks` |
| `random_seed` bisa diakali validator | [docs random](https://docs.near.org/smart-contracts/security/random) | Pemenang ditentukan tanpa angka acak |
| Storage: 1E19 yoctoNEAR per byte; pemilik kontrak harus mengunci saldo untuk storage | [docs storage staking](https://docs.near.org/protocol/storage/storage-staking) | Deposit pengguna menanggung storage yang dibuatnya |
| Batas prepaid gas: dokumen menyebut 300 Tgas (halaman environment) dan 1.000 Tgas (halaman gas). **Diverifikasi 14 Nov:** `EXPERIMENTAL_protocol_config` testnet (protocol 88) memberi `max_total_prepaid_gas` = 1.000 Tgas | [environment](https://docs.near.org/smart-contracts/anatomy/environment), [gas](https://docs.near.org/protocol/transactions/gas), RPC testnet | Batas total gas `execute` = 400 Tgas (muat `epoch_stake` LiNEAR yang butuh 275 Tgas) |
| LiNEAR `epoch_update_rewards(validator_id)` mensyaratkan prepaid gas ≥ 75 + 25 + 25 = 125 Tgas | [epoch_actions.rs](https://github.com/linear-protocol/LiNEAR/blob/main/contracts/linear/src/epoch_actions.rs), [types.rs](https://github.com/linear-protocol/LiNEAR/blob/main/contracts/linear/src/types.rs) | Gas job demo ≥ 125 Tgas |
| LiNEAR `epoch_stake` mengembalikan `bool` (`false` = "There is no need to call this function again in this epoch") | epoch_actions.rs | Aturan sukses `ReturnsTrue` |
| Staking pool `ping` tidak mengembalikan nilai; berhenti tanpa efek kalau epoch belum berganti | [core-contracts](https://github.com/near/core-contracts/tree/master/staking-pool) | Job `EveryEpoch` dibayar maks sekali per epoch |
| Function-call key "do **not allow** to **attach NEAR tokens** to the call"; dibatasi `receiver_id` (satu kontrak), `method_names` opsional, `allowance` opsional (kalau dihilangkan: gas tak terbatas). "If an account has only function-call keys and their allowance runs out, the account cannot sign any more transactions." "The allowance of an existing key cannot be changed." | [docs access keys](https://docs.near.org/protocol/accounts-contracts/access-keys) | Semua method yang dipanggil keeper agent harus **tanpa attached deposit**, supaya keeper di Railway cukup memegang function-call key. Jaminan commit diambil dari stake, bukan dari deposit (§4.4) |
| `env::promise_result_checked(result_idx: u64, max_len: usize) -> Result<Vec<u8>, PromiseError>`; `env::promise_result` ditandai deprecated ("use `promise_result_checked` to prevent out-of-gas errors"). Halaman docs.rs-nya menyebut error `PromiseResultError::TooLong(len)`, tidak sama dengan tipe di signature | [promise_result_checked](https://docs.rs/near-sdk/5.30.1/near_sdk/env/fn.promise_result_checked.html), [promise_result](https://docs.rs/near-sdk/5.30.1/near_sdk/env/fn.promise_result.html) | Callback membaca hasil mentah dengan `promise_result_checked` (§5.4); tipe error dicek saat kompilasi |
| `Gas::from_tgas` ada (re-export near-gas 0.3.7); `NearToken` ada; `LookupMap`, `IterableMap`, `IterableSet` ada di `near_sdk::store` (`IterableMap`/`IterableSet` menggantikan `UnorderedMap`/`UnorderedSet` yang deprecated) | [docs.rs near-sdk 5.30.1](https://docs.rs/near-sdk/5.30.1/near_sdk/store/index.html) | Dipakai di §2 |
| Event NEP-297: "log entries that start with the `EVENT_JSON:` prefix followed by a single valid JSON string" dengan field `standard`, `version`, `event`, `data` (opsional). Di Rust: `#[near(event_json(standard = "..."))]` + `#[event_version("1.0.0")]`, lalu `.emit()` | [NEP-297](https://github.com/near/NEPs/blob/master/neps/nep-0297.md), [docs events](https://docs.near.org/smart-contracts/anatomy/events) | §7 |

---

## 2. Tipe data

```rust
// Semua jumlah NEAR di antarmuka JSON memakai U128 (string yoctoNEAR).

pub enum Schedule {
    EveryEpoch,                      // jatuh tempo saat env::epoch_height() > last_paid_epoch
    EveryBlocks { interval: u64 },   // jatuh tempo saat block_height >= last_exec_block + interval
}

pub enum SuccessRule {
    Any,          // panggilan target sukses
    ReturnsTrue,  // panggilan target sukses DAN nilai kembaliannya JSON `true`
}

pub enum JobStatus { Active, Paused, Closed }

pub struct Config {
    pub owner_id: AccountId,
    pub treasury_id: AccountId,
    pub protocol_fee_bps: u16,       // usulan 500 (5%)
    pub min_keeper_stake: U128,      // usulan 1 NEAR (keputusan tim, D6)
    pub stake_multiplier: u8,        // usulan 10
    pub min_commit_bond: U128,       // usulan 0.1 NEAR (keputusan tim, D6); dikunci dari stake bebas, bukan deposit
    pub commit_blocks: u64,          // 100 (~58 detik pada ~0,58 detik/blok); lihat §3
    pub reveal_blocks: u64,          // 100
    pub grace_blocks: u64,           // 150 (~87 detik): panjang jendela eksklusif pemenang
    pub max_commits_per_round: u8,   // usulan 10
    pub max_history: u8,             // usulan 20 entri per job
    pub max_memo_bytes: u16,         // usulan 280
    pub callback_gas_tgas: u64,      // usulan 20 (diukur saat integration test)
    pub overhead_gas_tgas: u64,      // usulan 15 (diukur saat integration test)
    pub max_total_gas_tgas: u64,     // 400 (NFR-1; protokol testnet mengizinkan 1.000)
}

pub struct Keeper {
    pub stake: u128,
    pub locked: u128,                // stake yang dikunci: jaminan commit yang belum di-reveal + kunci putaran yang dimenangkan
    pub rewards: u128,               // reward yang bisa ditarik
    pub executed: u64,
    pub slashed: u64,
    pub registered_at: u64,          // block height
}

pub struct Commit { pub keeper: AccountId, pub hash: [u8; 32], pub bond: u128, pub block: u64, pub revealed: bool }
pub struct Reveal { pub keeper: AccountId, pub bid: u128, pub commit_block: u64, pub memo: Option<String> }
pub struct Winner { pub keeper: AccountId, pub bid: u128, pub locked: u128, pub settled: bool }  // settled: kunci sudah dilepas atau di-slash
pub struct InFlight { pub executor: AccountId, pub pay: u128, pub started_block: u64 }

pub struct Round {
    pub round_id: u64,
    pub opened_at: u64,
    pub commit_end: u64,             // opened_at + commit_blocks
    pub reveal_end: u64,             // commit_end + reveal_blocks
    pub commits: Vec<Commit>,
    pub reveals: Vec<Reveal>,
    pub finalized: bool,
    pub winner: Option<Winner>,
    pub open_mode: bool,             // true: keeper terdaftar mana pun boleh execute, bayaran max_reward
    pub due_seen_block: Option<u64>, // blok pertama saat kontrak mencatat job jatuh tempo
    pub in_flight: Option<InFlight>,
}

pub enum Outcome {
    Paid,           // panggilan sukses sesuai aturan; keeper dibayar
    Failed,         // panggilan target gagal; tidak dibayar, job tetap jatuh tempo
    ReturnedFalse,  // sukses tapi bukan `true` di bawah ReturnsTrue; tidak dibayar, putaran ditutup
    Slashed,        // pemenang melewatkan jendela eksklusifnya dan di-slash; putaran pindah ke mode terbuka
}

pub struct ExecutionRecord {
    pub round_id: u64,
    pub executor: AccountId,         // baris Slashed: keeper yang di-slash
    pub paid: u128,                  // GROSS: jumlah yang diambil dari job.balance. Keeper menerima paid − fee
                                     // (fee = paid × protocol_fee_bps / 10_000). 0 kalau tidak dibayar
    pub outcome: Outcome,            // Paid | Failed | ReturnedFalse | Slashed
    pub due_block: Option<u64>,
    pub exec_block: u64,             // blok callback
    pub epoch: u64,
    pub open_mode: bool,
    pub slashed_keeper: Option<AccountId>,
}

pub struct Job {
    pub id: u64,
    pub owner: AccountId,
    pub target: AccountId,
    pub method: String,
    pub args: Base64VecU8,
    pub gas_tgas: u64,
    pub schedule: Schedule,
    pub success_rule: SuccessRule,
    pub max_reward: u128,
    pub balance: u128,
    pub status: JobStatus,
    pub last_exec_block: Option<u64>,
    pub last_paid_epoch: Option<u64>,
    pub created_at: u64,
    pub round: Round,
    pub history: Vec<ExecutionRecord>,  // ring buffer, panjang maks config.max_history
}

#[near(contract_state)]
pub struct Mashpit {
    config: Config,
    keepers: LookupMap<AccountId, Keeper>,
    keeper_ids: IterableSet<AccountId>,  // untuk list_keepers
    jobs: IterableMap<u64, Job>,
    next_job_id: u64,
    fees_accrued: u128,
}
```

Koleksi `LookupMap`, `IterableMap`, dan `IterableSet` berasal dari `near_sdk::store` (fakta, §1). `LookupMap` tidak bisa diiterasi, karena itu `keeper_ids` disimpan terpisah.

**Membaca riwayat (`get_history`).** Satu kejadian *failover* menghasilkan dua baris dengan `round_id` yang sama:

1. `outcome: "Slashed"`, `paid: "0"`, `executor` = `slashed_keeper` = pemenang yang melewatkan jendelanya, `open_mode: true`. Jumlah yang dipotong dari stake-nya masuk ke `job.balance`.
2. Baris eksekusi berikutnya (biasanya `Paid`) oleh keeper yang mengambil alih di mode terbuka, dengan bayaran `max_reward`.

`paid` selalu bruto. Contoh: `paid` 0,01 NEAR dengan fee 5% berarti keeper menerima 0,0095 NEAR dan 0,0005 NEAR masuk `fees_accrued`. Di testnet, total `paid` 0,0908 NEAR × 5% = 0,00454 NEAR, sama dengan `fees_accrued` (dicek Bayu, 14 Nov).

---

## 3. Parameter default

| Parameter | Default | Dasar |
| --- | --- | --- |
| `protocol_fee_bps` | 500 (5%) | CronCat: "a modest percentage" tanpa angka |
| `min_keeper_stake` | 1 NEAR | Usulan |
| `stake_multiplier` | 10 | Stake bebas ≥ 10 × `max_reward` untuk ikut lelang |
| `min_commit_bond` | 0.1 NEAR | Batas bawah supaya commit palsu tidak murah |
| `commit_blocks` / `reveal_blocks` / `grace_blocks` | 100 / 100 / 150 | ~58 / ~58 / ~87 detik pada waktu blok terukur ~0,58 detik. Awalnya 50 / 50 / 50, tapi di uji testnet 13 Nov jendela ~29 detik terlalu sempit: saat RPC publik membatasi request (HTTP 429), keeper jujur sempat gagal reveal dan gagal eksekusi tepat waktu. Kontrak testnet diubah lewat `set_config` pada 13 Nov (tx `DmZ2rnAaTSLNHHQN4A87sfVDg5ueQ1pXA1JpcWyVCAiA`), lalu default di kode disamakan. Putaran yang sudah dibuka sebelum perubahan tetap memakai 50 / 50 |
| `callback_gas_tgas` / `overhead_gas_tgas` | 20 / 15 | Diukur dan disesuaikan di integration test |
| `max_total_gas_tgas` | 400 | NFR-1. Awalnya 300, karena dokumen NEAR saling bertentangan. Protokol testnet 88 mengizinkan 1.000 Tgas (diverifikasi lewat RPC, 14 Nov), dan `epoch_stake` LiNEAR butuh 275 Tgas. Kontrak testnet diubah lewat `set_config` (tx `2sVV7GKf2ZwAYAFp5veDSDZLdH9e4LnVxpBMULszKvQR`) |

---

## 4. Method

Notasi: **payable** = menerima attached deposit; **owner** = hanya `config.owner_id`; **private** = hanya kontrak sendiri; **FC** = bisa dipanggil dengan function-call key (tidak butuh attached deposit).

Pembagian kunci keeper (rancangan, berdasarkan fakta function-call key di §1):

- **Full-access key** (disimpan lokal, tidak di Railway): `register_keeper`, `add_stake` (keduanya payable), `unregister_keeper`.
- **Function-call key** di Railway: `receiver_id` = kontrak `mashpit`; `method_names` = `commit_bid`, `reveal_bid`, `finalize_round`, `poke`, `execute`, `slash_missed`, `withdraw_rewards`. Kalau key ini bocor, penyerang hanya bisa memanggil method tersebut atas nama keeper; dana keluar hanya ke akun keeper itu sendiri.
- `allowance`: dihilangkan (gas tak terbatas) atau diisi cukup besar. Allowance tidak bisa diubah setelah key dibuat, dan kalau habis, akun yang hanya punya function-call key tidak bisa menandatangani lagi (fakta).

### 4.1 Inisialisasi & admin

| Method | Akses | Perilaku |
| --- | --- | --- |
| `new(owner_id, treasury_id, config: Option<ConfigInput>)` | `#[init]` | Isi config (default §3 kalau `None`) |
| `set_config(patch: ConfigPatch)` | owner | Ubah parameter; tidak berlaku surut ke putaran yang sedang berjalan |
| `withdraw_fees()` | owner | Kirim `fees_accrued` ke `treasury_id`, set 0 |

### 4.2 Keeper

| Method | Akses | Perilaku | Error |
| --- | --- | --- | --- |
| `register_keeper()` | payable (full-access key) | Daftarkan `predecessor` dengan `stake = attached` | `AlreadyRegistered`, `StakeTooLow` |
| `add_stake()` | payable (full-access key) | `stake += attached` | `NotKeeper` |
| `withdraw_stake(amount: U128)` | keeper | Hanya stake bebas (`stake − locked`); transfer ke keeper | `InsufficientFreeStake` |
| `withdraw_rewards()` | keeper, FC | Transfer `rewards`, set 0 | `NothingToWithdraw` |
| `unregister_keeper()` | keeper (full-access key) | Syarat `locked == 0`; kembalikan `stake + rewards`, hapus keeper | `StakeLocked` |

### 4.3 Job

| Method | Akses | Perilaku | Error |
| --- | --- | --- | --- |
| `register_job(input: JobInput) -> u64` | payable | Validasi; `balance = attached − biaya storage` (storage diukur dari selisih `env::storage_usage()` × 1E19 yocto/byte); buka putaran #1; kembalikan `job_id` | lihat §6 |
| `top_up(job_id)` | payable, siapa saja | `balance += attached` | `JobNotFound`, `JobClosed` |
| `pause_job(job_id)` / `resume_job(job_id)` | pemilik job | Ubah status; job `Paused` tidak bisa di-`execute` | `NotJobOwner` |
| `close_job(job_id)` | pemilik job | Syarat: tidak ada `in_flight`. Kunci stake pemenang dan jaminan commit yang belum di-reveal dilepas tanpa penalti. **Job dihapus dari state** (bukan sekadar status `Closed`), lalu `balance` + storage yang dibebaskan dikirim ke pemilik. Setelahnya `get_job` mengembalikan `null` | `ExecutionInFlight` |

`JobInput`: `target`, `method`, `args` (base64), `gas_tgas`, `schedule`, `success_rule`, `max_reward`.

Validasi `register_job`:

- `max_reward > 0`
- `target != env::current_account_id()`
- `gas_tgas + callback_gas_tgas + overhead_gas_tgas ≤ max_total_gas_tgas`
- `EveryBlocks.interval ≥ commit_blocks + reveal_blocks` (supaya lelang selesai sebelum jatuh tempo berikutnya)
- `balance ≥ max_reward` setelah dikurangi biaya storage

### 4.4 Lelang

| Method | Akses | Perilaku | Error |
| --- | --- | --- | --- |
| `commit_bid(job_id, hash: Base64VecU8)` | keeper, FC (tanpa deposit) | Syarat: fase Commit (`block < commit_end`); job `Active`; satu commit per keeper; `commits.len() < max_commits_per_round`; hash 32 byte. Jaminan `bond = max(min_commit_bond, max_reward)` **dikunci dari stake bebas** (`locked += bond`); setelah itu stake bebas harus tetap ≥ `stake_multiplier × max_reward` | `WrongPhase`, `AlreadyCommitted`, `TooManyCommits`, `InsufficientFreeStake` |
| `reveal_bid(job_id, bid: U128, salt: String, memo: Option<String>)` | keeper, FC | Syarat: fase Reveal (`commit_end ≤ block < reveal_end`); `sha256("{bid}:{salt}:{keeper}") == hash`; `bid ≤ max_reward`; `memo` ≤ `max_memo_bytes`. Jaminan dilepas (`locked −= bond`) | `WrongPhase`, `NoCommit`, `HashMismatch`, `BidAboveMax`, `MemoTooLong` |
| `finalize_round(job_id)` | siapa saja, FC | Syarat: `block ≥ reveal_end`, belum `finalized`. Keeper yang tidak reveal: jaminan dipotong dari stake (`stake −= bond`, `locked −= bond`) dan masuk ke `job.balance`. Tentukan pemenang (§5.2) dari reveal yang stake bebasnya masih cukup; kunci `stake_multiplier × max_reward` dari stake pemenang. Tanpa pemenang → `open_mode = true` | `WrongPhase`, `AlreadyFinalized` |

Format hash commit: `sha256(utf8("{bid_yocto}:{salt}:{keeper_account_id}"))`, dengan `bid_yocto` sebagai string desimal dan `salt` string hex 64 karakter. Keeper agent menghitung hal yang sama (FRONTEND_SPEC tidak terlibat). Salt diturunkan secara deterministik oleh keeper (PRD FR-K4), jadi kontrak tidak perlu tahu cara pembuatannya.

`execute` dan `poke` memanggil `finalize_round` secara internal kalau belum dilakukan.

### 4.5 Eksekusi

| Method | Akses | Perilaku | Error |
| --- | --- | --- | --- |
| `poke(job_id)` | siapa saja, FC | Kalau job jatuh tempo dan `due_seen_block` kosong: set `due_seen_block = block_height`. Memulai jendela eksklusif pemenang | `NotDue` |
| `execute(job_id) -> Promise` | keeper, FC | Lihat §5.3 | `NotDue`, `NotAuthorized`, `ExecutionInFlight`, `InsufficientJobBalance`, `NotEnoughGas`, `JobNotActive` |
| `on_executed(job_id, round_id)` | private (callback) | Lihat §5.4. **Tidak boleh panic** | — |
| `slash_missed(job_id)` (P1) | siapa saja, FC | Lihat §5.5 | `NoWinner`, `WindowNotOver`, `ExecutionInFlight`, `AlreadyOpen` |

### 4.6 View

| Method | Keluaran |
| --- | --- |
| `get_config()` | `Config` |
| `get_stats()` | jumlah job, keeper, total stake, `fees_accrued`, `block_height`, `epoch_height` saat ini |
| `get_job(job_id)` | `JobView`: semua field `Job` kecuali `history` + `phase` terhitung (`Commit`, `Reveal`, `AwaitingFinalize`, `Awarded`, `Exclusive`, `Open`, `InFlight`, `Paused`, `Closed`) + `is_due` + `due_block` + `exclusive_until` + `current_block` + `current_epoch` |
| `list_jobs(from_index, limit)` | `Vec<JobSummary>` (tanpa riwayat lengkap) |
| `get_round(job_id)` | `Round`; tiap commit menampilkan keeper, `hash` (base64), blok, jaminan, dan `revealed`. Hash ditampilkan supaya keeper yang restart di antara commit dan reveal bisa memulihkan tawarannya (ditambahkan 13 Nov, upgrade tanpa migrasi) |
| `get_history(job_id)` | `Vec<ExecutionRecord>` |
| `get_keeper(account_id)` | `Option<Keeper>` |
| `list_keepers(from_index, limit)` | `Vec<(AccountId, Keeper)>` |

---

## 5. Logika inti

### 5.1 Jatuh tempo

```
is_due(job):
  EveryEpoch:          last_paid_epoch is None || env::epoch_height() > last_paid_epoch
  EveryBlocks(n):      block_height >= (last_exec_block or created_at) + n

due_block(job):
  EveryBlocks(n):      (last_exec_block or created_at) + n          // dapat dihitung
  EveryEpoch:          round.due_seen_block                         // dicatat oleh poke/execute pertama
```

Alasan `due_seen_block` untuk `EveryEpoch`: kontrak tidak bisa tahu blok pertama sebuah epoch, hanya `epoch_height()` saat dipanggil (rancangan; berdasarkan fakta env API di atas).

### 5.2 Penentuan pemenang (deterministik)

```
kandidat = reveals yang stake bebas keeper ≥ stake_multiplier × max_reward
urutkan: bid naik, lalu commit_block naik, lalu keeper (string) naik
pemenang = kandidat[0], atau tidak ada → open_mode = true
```

### 5.3 `execute(job_id)`

```
syarat umum:
  job.status == Active
  finalize_round sudah/bisa dilakukan (block >= reveal_end)
  is_due(job)
  round.in_flight is None
  env::prepaid_gas() >= gas_tgas + callback_gas_tgas + overhead_gas_tgas
  predecessor adalah keeper terdaftar

EveryEpoch dan due_seen_block kosong: set = block_height
exclusive_until = max(due_block, reveal_end) + grace_blocks

pemenang melewatkan jendela (block_height > exclusive_until, belum settled): slash dulu (§5.5), open_mode = true

otorisasi:
  winner ada && !open_mode && block_height <= exclusive_until  -> hanya winner
  selain itu                                                     -> keeper terdaftar mana pun; set open_mode = true

pay = (winner && !open_mode) ? winner.bid : max_reward
syarat: job.balance >= pay

round.in_flight = { executor, pay, started_block }
return Promise::new(target)
         .function_call(method, args, deposit = 0, gas = gas_tgas)
         .then(Self::ext(current_account_id).with_static_gas(callback_gas).on_executed(job_id, round_id))
```

### 5.4 `on_executed(job_id, round_id)` (callback)

Hasil dibaca sebagai byte mentah dengan `env::promise_result_checked(0, MAX_RESULT_LEN)` (fakta §1; `promise_result` deprecated), supaya bisa menangani target yang mengembalikan nilai maupun tidak. `MAX_RESULT_LEN` = 1024 byte. Fakta dari kode near-sdk 5.30.1: kalau hasil lebih panjang dari batas, fungsi ini mengembalikan `Err(PromiseError::TooLong(len))` walaupun panggilannya sukses, dan `Err(PromiseError::Failed)` kalau panggilannya gagal. Karena itu `TooLong` diperlakukan sebagai sukses: `Paid` untuk aturan `Any`, `ReturnedFalse` untuk aturan `ReturnsTrue` (hasil sepanjang itu pasti bukan `true`). Perbaikan ini dibuat 14 Nov; versi sebelumnya salah menganggap `TooLong` sebagai `Failed`. Perilaku `#[callback_result]` untuk target tanpa nilai kembalian tidak ditemukan di docs (halaman docs.rs-nya 404), jadi tidak dipakai.

```
kalau job/round tidak cocok (round_id berbeda): log dan return (jangan panic)
in_flight = round.in_flight.take()

hasil:
  Err(Failed)                              -> outcome = Failed
  Ok(_) atau Err(TooLong) && rule == Any   -> outcome = Paid
  Ok(bytes) && rule == ReturnsTrue         -> outcome = (bytes == b"true") ? Paid : ReturnedFalse
  Err(TooLong) && rule == ReturnsTrue      -> outcome = ReturnedFalse

Paid:
  record.paid = pay (bruto)
  fee = pay * protocol_fee_bps / 10_000
  keeper[executor].rewards += pay - fee
  fees_accrued += fee
  job.balance -= pay
  keeper[executor].executed += 1
  last_exec_block = block_height
  EveryEpoch: last_paid_epoch = epoch_height
  lepas kunci stake pemenang (winner.locked)
  catat riwayat; buka putaran baru

ReturnedFalse (rancangan; perlu konfirmasi tim):
  tidak dibayar
  EveryEpoch: last_paid_epoch = epoch_height   // "no need to call again in this epoch"
  EveryBlocks: last_exec_block = block_height
  lepas kunci stake pemenang; catat riwayat; buka putaran baru

Failed:
  tidak dibayar; putaran TIDAK ditutup (job masih jatuh tempo)
  catat riwayat; executor boleh mencoba lagi
  kalau executor = pemenang (belum settled): lepas kunci pemenang TANPA slash, open_mode = true
```

Alasan aturan terakhir (perbaikan 14 Nov): pemenang yang sudah memanggil tidak lalai, karena target-nyalah yang gagal. Versi sebelumnya membiarkan kuncinya tetap aktif, sehingga pemenang itu di-slash setelah jendelanya lewat, padahal kesalahannya ada di pihak pemilik job. Sekarang pemenang dilepas tanpa penalti, dan putaran terbuka untuk keeper lain dengan bayaran `max_reward`. Keeper referensi berhenti mencoba setelah 3 kegagalan di satu putaran (`keeper/src/policy.ts`), supaya target yang rusak tidak menguras gas.

### 5.5 Slashing: `slash_missed(job_id)` dan otomatis di `execute`

Slashing terjadi lewat `slash_missed`, atau otomatis saat keeper mana pun memanggil `execute` setelah jendela pemenang lewat.

```
syarat: winner ada dan belum settled, !open_mode, due_block diketahui, block_height > exclusive_until, in_flight None
slash = min(max_reward, winner.locked, stake keeper)
keeper[winner].stake  -= slash
keeper[winner].locked -= winner.locked
keeper[winner].slashed += 1
job.balance += slash
round.open_mode = true
catat riwayat: outcome Slashed, paid 0, executor = slashed_keeper = winner
```

**Pemenang yang di-slash boleh ikut mengeksekusi di mode terbuka.** Ini konsekuensi aturan "di mode terbuka, keeper terdaftar mana pun boleh execute", dan memang terjadi di testnet (job 1 round 3: k1 di-slash, lalu k1 sendiri yang mengeksekusi). Hitungannya: pemenang yang terlambat kehilangan `max_reward` lewat slash, lalu menerima `max_reward × (1 − fee)`, jadi bersihnya −5% × `max_reward` dikurangi gas. Kalau tepat waktu, ia menerima `bid × (1 − fee)` ≥ 0. Jadi terlambat selalu lebih buruk daripada tepat waktu, dan job tetap dijalankan. **Diputuskan 14 Nov (Razaqi): perilaku ini dipertahankan.** Alasan utamanya liveness. Kalau keeper yang di-slash dikeluarkan dari putaran itu dan ternyata hanya dia yang online, tidak ada yang bisa mengeksekusi, dan putaran baru juga tidak terbuka karena putaran baru hanya dibuka setelah eksekusi.

Untuk dashboard: di `round_id` yang sama, kalau `executor` baris eksekusi **sama dengan** `slashed_keeper` baris `Slashed`, tampilkan sebagai "terlambat, kena penalti, tetap dieksekusi". Kalau berbeda, tampilkan sebagai "failover ke keeper lain".

Kasus tepi: kalau executor menghapus pendaftarannya di antara `execute` dan callback, outcome tetap `Paid` tapi `paid` = 0 dan dana tetap di job.

### 5.6 Putaran baru

```
round = Round { round_id + 1, opened_at = block_height, commit_end = opened_at + commit_blocks,
                reveal_end = commit_end + reveal_blocks, semua koleksi kosong }
```

Konsekuensi: untuk job `EveryEpoch`, lelang untuk epoch berikutnya langsung dimulai setelah eksekusi, dan selesai jauh sebelum epoch berganti (1 epoch = 43.200 blok; fakta). Pemenang menunggu sampai jatuh tempo.

---

## 6. Error

| Kode | Arti |
| --- | --- |
| `AlreadyRegistered`, `NotKeeper`, `StakeTooLow`, `StakeLocked`, `InsufficientFreeStake`, `NothingToWithdraw` | Keeper |
| `JobNotFound`, `JobClosed`, `JobNotActive`, `NotJobOwner`, `InvalidJob(<alasan>)`, `InsufficientDeposit`, `InsufficientJobBalance` | Job |
| `WrongPhase`, `AlreadyCommitted`, `TooManyCommits`, `BondTooLow`, `NoCommit`, `HashMismatch`, `BidAboveMax`, `MemoTooLong`, `AlreadyFinalized` | Lelang |
| `NotDue`, `NotAuthorized`, `ExecutionInFlight`, `NotEnoughGas`, `NoWinner`, `WindowNotOver`, `AlreadyOpen` | Eksekusi |

Format panic: `"Mashpit: <Kode>: <detail>"`, supaya mudah dibaca di explorer dan di keeper agent.

---

## 7. Event (P1)

Mengikuti NEP-297 (fakta §1): satu baris log `EVENT_JSON:` + JSON dengan `standard: "mashpit"`, `version: "1.0.0"`, `event`, dan `data`. Di Rust: enum event dengan `#[near(event_json(standard = "mashpit"))]`, setiap varian `#[event_version("1.0.0")]`, lalu `.emit()`.

| Event | Data |
| --- | --- |
| `keeper_registered` | `keeper`, `stake` |
| `job_registered` | `job_id`, `owner`, `target`, `method`, `schedule`, `max_reward` |
| `bid_committed` | `job_id`, `round_id`, `keeper`, `block` |
| `bid_revealed` | `job_id`, `round_id`, `keeper`, `bid`, `memo` |
| `round_finalized` | `job_id`, `round_id`, `winner`, `bid`, `open_mode` |
| `job_executed` | `job_id`, `round_id`, `executor`, `outcome`, `paid`, `fee` |
| `keeper_slashed` | `job_id`, `round_id`, `keeper`, `amount` |

Dashboard MVP membaca view method, bukan event, supaya tidak butuh indexer.

---

## 8. Storage

- Biaya storage dihitung dari selisih `env::storage_usage()` sebelum dan sesudah operasi, dikalikan 1E19 yoctoNEAR per byte (fakta).
- `register_job`: dibayar dari deposit pemilik job.
- `register_keeper`: **seluruh deposit menjadi stake**. Storage data keeper (entri `keepers` + `keeper_ids`) ditanggung saldo kontrak, dan dibebaskan lagi saat `unregister_keeper`. Spam pendaftaran tetap mahal, karena tiap keeper harus menyetor minimal `min_keeper_stake` (1 NEAR).
- Commit dan reveal (termasuk `memo`): ukurannya dibatasi (`max_commits_per_round`, `max_memo_bytes`). Pada MVP, storage ini ditanggung saldo kontrak, yang diisi pemilik kontrak saat deploy. Data commit/reveal dihapus saat putaran baru dibuka, sehingga storage dipakai ulang.
- Riwayat: ring buffer `max_history` entri per job.
- Ukuran byte per struktur **belum diukur**; ukur di integration test lalu tetapkan saldo awal kontrak.

---

## 9. Keamanan

| Ancaman | Mitigasi (rancangan) |
| --- | --- |
| Keeper menyalin tawaran keeper lain | Commit-reveal; hash memuat nama akun keeper, jadi hash tidak bisa dipakai ulang akun lain |
| Commit palsu untuk mengacaukan lelang | Jaminan ≥ `max(min_commit_bond, max_reward)` dikunci dari stake, hangus kalau tidak reveal |
| Kunci keeper di Railway bocor | Railway hanya memegang function-call key ke kontrak `mashpit` dengan `method_names` terbatas; key ini tidak bisa mentransfer NEAR atau menambah key (fakta §1). Full-access key tidak pernah disimpan di server |
| Pemenang tidak mengeksekusi | Jendela eksklusif terbatas + `slash_missed` + mode terbuka |
| Eksekusi ganda | `in_flight` mencegah `execute` paralel; `last_paid_epoch` mencegah bayar dua kali per epoch |
| Callback dipanggil pihak luar | `#[private]` |
| Callback panic sehingga state tertahan | Callback tidak memakai `unwrap`/`assert`; semua cabang menulis state yang konsisten |
| Job memanggil kontrak `mashpit` sendiri | Ditolak di validasi `register_job` |
| Pemilik job menutup job saat eksekusi berjalan | `close_job` ditolak kalau `in_flight` |
| Manipulasi angka acak | Tidak memakai `random_seed` |

---

## 10. Pengujian

Cara menurut docs NEAR (fakta): `cargo test` menjalankan unit test dan sandbox test sekaligus ("`cargo test` runs both unit and sandbox tests present in the project"). Unit test memakai dev-dependency `near-sdk` dengan feature `unit-testing`. Integration test memakai `near-sandbox` (node NEAR lokal) dan `near-api` (membuat akun, deploy, memanggil kontrak). Sumber: [unit test](https://docs.near.org/smart-contracts/testing/unit-test), [integration test](https://docs.near.org/smart-contracts/testing/integration-test).

**Unit test** (dalam crate): perhitungan fase; hash commit; aturan seri; perhitungan fee; `is_due` untuk kedua jadwal; batas pembayaran sekali per epoch; validasi `register_job`; penguncian dan pelepasan jaminan commit.

**Integration test** (`near-sandbox` + `near-api`), dengan kontrak `mock_target`:

| Method `mock_target` | Perilaku |
| --- | --- |
| `noop()` | Sukses, tanpa nilai kembalian |
| `ret_true()` / `ret_false()` | Mengembalikan `true` / `false` |
| `boom()` | Panic |

| Skenario | Acceptance criteria (PRD §6.1) |
| --- | --- |
| 3 keeper commit + reveal; pemenang sesuai aturan; seri diuji | AC-1, AC-2 |
| Non-pemenang `execute` di jendela eksklusif ditolak; diterima di mode terbuka | AC-3 |
| Target `boom` → tidak dibayar, putaran tetap terbuka | AC-4 |
| `ReturnsTrue` + `ret_false` → tidak dibayar | AC-5 |
| `EveryEpoch` tidak dibayar dua kali dalam satu epoch | AC-6 |
| Pemenang diam → `slash_missed` → mode terbuka → keeper lain sukses | AC-7 |
| Ukur gas `execute` + `on_executed` untuk menyetel `callback_gas_tgas`/`overhead_gas_tgas` | NFR-1 |
| Keeper dengan function-call key bisa commit, reveal, finalize, dan execute; panggilan `register_keeper` dengan function-call key ditolak | Pembagian kunci (§4) |

---

## 11. Build & deploy

Perintah build dari docs NEAR (fakta): `cargo near build non-reproducible-wasm`. Docs men-deploy dengan near CLI, contohnya `near contract deploy "$CONTRACT_ID" use-file ./target/near/<nama>.wasm …`. Sesuaikan argumen dengan versi near CLI yang terpasang.

`scripts/deploy.sh` (rancangan):

1. `cargo near build non-reproducible-wasm` di `contracts/mashpit`.
2. Buat akun tim di testnet dengan faucet: `near create-account <akun>.testnet --useFaucet` (fakta, [docs create account](https://docs.near.org/getting-started/create-account)). Faucet web juga tersedia di near-faucet.io (disebut di [nearbuilders.org/build](https://nearbuilders.org/build)).
3. Buat sub-account kontrak (misalnya `mashpit.<akun>.testnet`), deploy wasm, lalu panggil `new(owner_id, treasury_id, null)`.
4. Simpan `CONTRACT_ID` di `.env` tiap paket (tidak di-commit).

Docs yang dibaca tidak menunjukkan perintah CLI untuk membuat sub-account; yang terdokumentasi adalah `account.createSubAccount({ accountOrPrefix, publicKey, nearToTransfer })` di near-api-js ([docs near-api](https://docs.near.org/tools/near-api)). Karena itu pembuatan sub-account ditulis sebagai skrip Node, atau dibantu skill `near-cli-rs`. "Parent accounts have no control over their sub-accounts" (fakta), jadi kunci setiap sub-account harus disimpan.

`scripts/create-keepers` (Node, rancangan): buat `k1`, `k2`, `k3` sebagai sub-account; panggil `register_keeper` dengan stake memakai full-access key; tambahkan function-call key ke kontrak `mashpit` dengan `method_names` di §4; function-call key inilah yang dipasang sebagai sealed variable di Railway.

`scripts/seed-jobs.mjs` (job demo):

| Job | Target | Method & args | Gas | Jadwal | Aturan |
| --- | --- | --- | --- | --- | --- |
| LiNEAR update rewards (P0) | `linear-protocol.testnet` | `epoch_update_rewards`, `{"validator_id":"aurora.pool.f863973.m0"}` | ≥ 125 Tgas (usulan 150) | `EveryEpoch` | `Any` |
| LiNEAR stake (P1) | `linear-protocol.testnet` | `epoch_stake`, `{}` | Belum diketahui; baca rumus `min_gas` lengkap di `epoch_stake` | `EveryEpoch` | `ReturnsTrue` |
| Staking pool ping (P1) | `aurora.pool.f863973.m0` | `ping`, `{}` | Belum diukur | `EveryEpoch` | `Any` |

Validator `aurora.pool.f863973.m0` adalah salah satu dari 5 validator LiNEAR testnet (fakta, `get_validators` 13 Nov).

---

## 12. Pertanyaan terbuka (kontrak)

- [ ] Perlakuan `ReturnedFalse` (§5.4): menutup jadwal epoch tanpa bayar, atau membayar sebagian sebagai "biaya pengecekan"?
- [ ] Apakah keeper yang gagal (target panic) boleh mencoba ulang tanpa batas dalam jendela eksklusifnya?
- [ ] Rumus `min_gas` lengkap untuk `epoch_stake` / `epoch_unstake` LiNEAR.
- [ ] Ukuran storage per job, commit, reveal, dan riwayat (diukur di test).
- [ ] Cara menambahkan function-call key dengan `method_names` lewat CLI belum ditemukan di docs yang dibaca (contoh CLI `add-key` hanya menunjukkan mode lain). Cek skill `near-cli-rs` atau API near-api-js.
- [ ] Tipe error `promise_result_checked` (`PromiseError` di signature vs `PromiseResultError::TooLong` di teks docs) dipastikan saat kompilasi.
