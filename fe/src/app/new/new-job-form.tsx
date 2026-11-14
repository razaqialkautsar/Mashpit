"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useNearWallet } from "near-connect-hooks";
import {
  Activity,
  CalendarClock,
  CircleCheck,
  CircleDot,
  Circle,
  Droplets,
  FlaskConical,
  Loader,
  PenLine,
  TriangleExclamationPoint,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { describeError, getConfig } from "@/lib/contract";
import { encodeArgs, formatNear, parseNear } from "@/lib/format";
import { dismissed, near } from "@/lib/near";
import { jobHref, routes } from "@/lib/routes";
import type { Config, Schedule, SuccessRule } from "@/lib/types";
import { buttonClasses } from "@/components/landing/button";
import { GasMeter } from "@/components/app/gas-meter";
import { PageHeader, Panel } from "@/components/app/ui";

type Form = {
  target: string;
  method: string;
  args: string;
  gas: string;
  scheduleKind: "epoch" | "blocks";
  interval: string;
  rule: SuccessRule;
  maxReward: string;
  deposit: string;
};

// Real testnet calls that need a keeper (docs/SMART_CONTRACT_SPEC.md §11). They are
// examples to try Mashpit without a contract of your own; the form is for any contract.
const examples: { id: string; label: string; text: string; icon: LucideIcon; form: Partial<Form> }[] = [
  {
    id: "linear",
    label: "LiNEAR: record staking rewards",
    text: "LiNEAR is a liquid staking protocol. This call records one validator's new rewards, once per epoch.",
    icon: Droplets,
    form: {
      target: "linear-protocol.testnet",
      method: "epoch_update_rewards",
      args: '{ "validator_id": "aurora.pool.f863973.m0" }',
      gas: "150",
      scheduleKind: "epoch",
      rule: "Any",
    },
  },
  {
    id: "ping",
    label: "Staking pool: ping",
    text: "Keeps a validator pool's reported rewards current. Validator docs say to ping once per epoch.",
    icon: Activity,
    form: { target: "aurora.pool.f863973.m0", method: "ping", args: "{}", gas: "60", scheduleKind: "epoch", rule: "Any" },
  },
];

const initial: Form = {
  target: "",
  method: "",
  args: "{}",
  gas: "50",
  scheduleKind: "epoch",
  interval: "300",
  rule: "Any",
  maxReward: "0.05",
  deposit: "1.00",
};

const REGISTER_GAS = "100000000000000"; // 100 Tgas
const ACCOUNT_RE = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
// Rough on-chain size of a job record before its args, method and target.
// The contract charges the real figure (storage_usage delta × 1E19 yocto/byte).
const JOB_BASE_BYTES = 360;
const YOCTO_PER_BYTE = BigInt("10000000000000000000");

export function NewJobForm() {
  const router = useRouter();
  const { signedAccountId, signIn, callFunction } = useNearWallet();
  const [config, setConfig] = useState<Config>();
  const [example, setExample] = useState<string>();
  const [f, setF] = useState<Form>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    getConfig().then(setConfig, (e) => setError(describeError(e)));
  }, []);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  // Editing the call itself turns an example into your own job.
  const setCall = (k: "target" | "method" | "args", v: string) => {
    setExample(undefined);
    set(k, v);
  };
  const pickExample = (id: string) => {
    const ex = examples.find((e) => e.id === id);
    if (!ex) return;
    setExample(id);
    setF((p) => ({ ...p, ...ex.form }));
  };

  // ---- validation, mirroring register_job (SMART_CONTRACT_SPEC §4.3) ----
  const gas = Number(f.gas);
  const totalGas = config ? gas + config.callback_gas_tgas + config.overhead_gas_tgas : gas;
  const maxGas = config?.max_total_gas_tgas ?? 300;
  const minInterval = config ? config.commit_blocks + config.reveal_blocks : 0;
  const reward = parseNear(f.maxReward);
  const deposit = parseNear(f.deposit);
  let argsBase64: string | null = null;
  try {
    argsBase64 = encodeArgs(f.args);
  } catch {
    argsBase64 = null;
  }

  const issues: Partial<Record<keyof Form, string>> = {};
  if (!ACCOUNT_RE.test(f.target) || f.target.length < 2) issues.target = "Enter a NEAR account, e.g. app.testnet.";
  else if (f.target === near.contractId) issues.target = "A job cannot call the Mashpit contract itself.";
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(f.method)) issues.method = "Letters, digits and _ only.";
  if (argsBase64 == null) issues.args = "Arguments must be valid JSON.";
  if (!Number.isInteger(gas) || gas < 1) issues.gas = "Whole Tgas, at least 1.";
  else if (totalGas > maxGas) issues.gas = `Needs ${totalGas} Tgas with callback and overhead; the limit is ${maxGas}.`;
  if (f.scheduleKind === "blocks" && !(Number(f.interval) >= minInterval))
    issues.interval = `At least ${minInterval} blocks so the auction can finish.`;
  if (!reward || reward === "0") issues.maxReward = "Must be more than 0.";
  if (!deposit) issues.deposit = "Enter an amount in NEAR.";

  const storageBytes = JOB_BASE_BYTES + f.target.length + f.method.length + (argsBase64?.length ?? 0);
  const storage = BigInt(storageBytes) * YOCTO_PER_BYTE;
  const balance = deposit ? BigInt(deposit) - storage : BigInt(0);
  if (deposit && reward && !issues.deposit && balance < BigInt(reward))
    issues.deposit = "After storage, the balance must cover at least one max reward.";
  const valid = Object.keys(issues).length === 0;
  const runs = reward && reward !== "0" && balance > BigInt(0) ? (balance / BigInt(reward)).toString() : "0";

  async function submit() {
    if (!valid || !reward || !deposit || !argsBase64) return;
    setBusy(true);
    setError(undefined);
    const schedule: Schedule = f.scheduleKind === "epoch" ? "EveryEpoch" : { EveryBlocks: { interval: Number(f.interval) } };
    try {
      const id = await callFunction({
        contractId: near.contractId,
        method: "register_job",
        args: {
          input: {
            target: f.target,
            method: f.method,
            args: argsBase64,
            gas_tgas: gas,
            schedule,
            success_rule: f.rule,
            max_reward: reward,
          },
        },
        gas: REGISTER_GAS,
        deposit,
      });
      const jobId = Number(id);
      router.push(Number.isInteger(jobId) ? jobHref(jobId) : routes.live);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  const gasHint =
    example === "linear"
      ? "LiNEAR needs at least 125 Tgas for this call."
      : "Gas for your method alone. Unused gas is refunded to the keeper that runs it.";

  return (
    <div className="grid gap-6 md:gap-8">
      <PageHeader
        title="Throw a job into the pit"
        lede="Schedule a call on your own contract. Keepers compete to run it, and you only pay for runs that succeed."
      />

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]"
      >
        <Panel>
          <div className="divide-y divide-line">
            <Row title="Your contract" text="The method Mashpit calls for you on a schedule. Mashpit attaches no deposit.">
              <div className="grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Contract account" error={issues.target}>
                    <input className={input} value={f.target} aria-invalid={!!issues.target} onChange={(e) => setCall("target", e.target.value.trim())} placeholder="your-app.testnet" spellCheck={false} autoCapitalize="off" />
                  </Field>
                  <Field label="Method" error={issues.method}>
                    <input className={input} value={f.method} aria-invalid={!!issues.method} onChange={(e) => setCall("method", e.target.value.trim())} placeholder="settle_round" spellCheck={false} autoCapitalize="off" />
                  </Field>
                </div>
                <Field label="Arguments (JSON)" error={issues.args}>
                  <textarea className={`${input} min-h-[52px] resize-y`} rows={1} value={f.args} aria-invalid={!!issues.args} onChange={(e) => setCall("args", e.target.value)} spellCheck={false} />
                </Field>

                <div className="rounded-2xl border border-line bg-bg/60 p-4">
                  <p className="flex items-center gap-2 text-[13px] font-semibold text-ink-2">
                    <FlaskConical aria-hidden="true" className="size-4 text-accent" />
                    No contract at hand? Try a real testnet call that needs a keeper:
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {examples.map((ex) => {
                      const on = example === ex.id;
                      const Icon = ex.icon;
                      return (
                        <button
                          key={ex.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => pickExample(ex.id)}
                          className={`flex flex-col rounded-xl border p-3.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-amber ${
                            on ? "border-accent bg-accent-soft" : "border-line-strong bg-bg hover:border-ink-3"
                          }`}
                        >
                          <span className="flex items-center gap-2 text-sm font-bold">
                            <Icon aria-hidden="true" className={`size-4 shrink-0 ${on ? "text-accent" : "text-ink-2"}`} />
                            {ex.label}
                          </span>
                          <span className="mt-1.5 text-[13px] leading-snug text-ink-3">{ex.text}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </Row>

            <Row title="Gas" text={gasHint}>
              <div className="grid items-end gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
                <Field label="Gas for the call" error={issues.gas} suffix="Tgas">
                  <input className={`${input} pr-16`} inputMode="numeric" value={f.gas} aria-invalid={!!issues.gas} onChange={(e) => set("gas", e.target.value)} />
                </Field>
                <div className={issues.gas ? "sm:mb-7" : ""}>
                  <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2 text-[13px]">
                    <span className="text-ink-2">
                      With callback {config?.callback_gas_tgas ?? "—"} + overhead {config?.overhead_gas_tgas ?? "—"}
                    </span>
                    {config && (
                      <span className={`inline-flex items-center gap-1 font-semibold ${totalGas > maxGas ? "text-bad" : "text-ok"}`}>
                        {totalGas > maxGas ? <TriangleExclamationPoint aria-hidden="true" className="size-3.5" /> : <CircleCheck aria-hidden="true" className="size-3.5" />}
                        {totalGas} of {maxGas} Tgas
                      </span>
                    )}
                  </div>
                  <GasMeter gas={Number.isFinite(gas) ? gas : 0} config={config} compact />
                </div>
              </div>
            </Row>

            <Row
              title="Schedule & rule"
              text={`Every-N-blocks needs at least ${minInterval || "—"} blocks so the auction can finish.`}
            >
              <div className="grid gap-4 xl:grid-cols-2">
                <Field label="Schedule" as="div" error={issues.interval}>
                  <Segmented
                    name="schedule"
                    value={f.scheduleKind}
                    onChange={(v) => set("scheduleKind", v as Form["scheduleKind"])}
                    options={[["epoch", "Every epoch"], ["blocks", "Every N blocks"]]}
                  />
                  {f.scheduleKind === "blocks" && (
                    <span className="mt-2.5 flex items-center gap-2">
                      <input aria-label="Interval in blocks" className={`${input} w-32`} inputMode="numeric" value={f.interval} aria-invalid={!!issues.interval} onChange={(e) => set("interval", e.target.value)} />
                      <span className="text-sm text-ink-3">blocks ≈ {Math.round((Number(f.interval) || 0) * 0.58 / 60)} min</span>
                    </span>
                  )}
                </Field>
                <Field label="Pay when" as="div">
                  <Segmented
                    name="rule"
                    value={f.rule}
                    onChange={(v) => set("rule", v as SuccessRule)}
                    options={[["Any", "Call succeeds"], ["ReturnsTrue", "Returns true"]]}
                  />
                </Field>
              </div>
            </Row>

            <Row
              title="Money"
              text={`Keepers bid at or below max reward. Fee is ${config ? config.protocol_fee_bps / 100 : "—"}% of what is paid.`}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Max reward per run" error={issues.maxReward} suffix="NEAR">
                  <input className={`${input} pr-16`} inputMode="decimal" value={f.maxReward} aria-invalid={!!issues.maxReward} onChange={(e) => set("maxReward", e.target.value)} />
                </Field>
                <Field label="Deposit" error={issues.deposit} suffix="NEAR">
                  <input className={`${input} pr-16`} inputMode="decimal" value={f.deposit} aria-invalid={!!issues.deposit} onChange={(e) => set("deposit", e.target.value)} />
                </Field>
              </div>
            </Row>
          </div>
        </Panel>

        {/* Review */}
        <Panel glow className="lg:sticky lg:top-[104px]">
          <div className="flex flex-col p-6 sm:p-7">
            <h2 className="text-[clamp(1.5rem,2.5vw,1.75rem)] leading-none">Review</h2>
            <dl className="mt-6 grid gap-3.5 text-[15px]">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-2">Deposit</dt>
                <dd className="font-bold tabular-nums">{deposit ? formatNear(deposit, 3) : "—"} NEAR</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-2">Storage (estimate)</dt>
                <dd className="font-bold tabular-nums">− {formatNear(storage, 4)} NEAR</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-t border-line pt-3.5">
                <dt className="font-bold">Job balance</dt>
                <dd className="font-display text-xl text-glow tabular-nums">≈ {balance > BigInt(0) ? formatNear(balance, 3) : "0"} NEAR</dd>
              </div>
            </dl>

            <p className="mt-6 flex gap-3 rounded-2xl bg-bg/70 px-4 py-3.5 text-sm text-ink-2">
              <CalendarClock aria-hidden="true" className="mt-0.5 size-[18px] shrink-0 text-accent" />
              Covers about {runs} run{runs === "1" ? "" : "s"} even if every run pays the full max reward.
            </p>

            <h3 className="mt-6 font-sans text-sm font-bold tracking-normal">After you sign</h3>
            <ol className="mt-3 grid gap-3 text-sm text-ink-2">
              {[
                `Round #1 opens right away: ${config?.commit_blocks ?? "—"} blocks to commit, ${config?.reveal_blocks ?? "—"} to reveal.`,
                "The lowest bid wins and runs the call when it’s due.",
                "You pay only if the callback succeeds. Top up or close any time.",
              ].map((t, i) => (
                <li key={t} className="flex gap-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-3 text-xs font-bold text-ink">{i + 1}</span>
                  {t}
                </li>
              ))}
            </ol>

            {error && (
              <p role="alert" className="mt-6 flex items-start gap-2 rounded-2xl bg-bad-bg px-4 py-3 text-sm text-bad">
                <TriangleExclamationPoint aria-hidden="true" className="mt-0.5 size-4 shrink-0" /> {error}
              </p>
            )}

            {signedAccountId ? (
              <>
                <button type="submit" disabled={!valid || busy} className={`${buttonClasses("primary")} mt-7 w-full py-4 text-base disabled:opacity-50`}>
                  {busy ? <Loader aria-hidden="true" className="size-4 animate-spin" /> : <PenLine aria-hidden="true" className="size-4" />}
                  Sign & register job
                </button>
                <p className="mt-3 text-center text-[13px] text-ink-3">
                  Signing as <span className="text-ink-2">{signedAccountId}</span> with NEAR Connect
                </p>
                {!valid && <p className="mt-1 text-center text-[13px] text-ink-3">Fix the highlighted fields to continue.</p>}
              </>
            ) : (
              <>
                <button type="button" onClick={() => signIn().catch(dismissed)} className={`${buttonClasses("primary")} mt-7 w-full py-4 text-base`}>
                  <Wallet aria-hidden="true" className="size-4" /> Connect wallet to post
                </button>
                <p className="mt-3 text-center text-[13px] text-ink-3">You sign one transaction with the deposit attached.</p>
              </>
            )}
          </div>
        </Panel>
      </form>
    </div>
  );
}

const input =
  "w-full rounded-xl border border-line-strong bg-bg px-3.5 py-3 font-mono text-[15px] text-ink outline-none transition-colors placeholder:text-ink-3/60 focus:border-ink-3 aria-[invalid=true]:border-bad";

/** One form section: title and helper text on the left, fields on the right. */
function Row({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <div className="grid gap-4 px-5 py-6 sm:px-7 md:grid-cols-[200px_minmax(0,1fr)] md:gap-8">
      <div>
        <h2 className="font-sans text-base font-bold tracking-normal">{title}</h2>
        <p className="mt-1.5 text-[13px] text-ink-3">{text}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Field({
  label,
  error,
  suffix,
  as = "label",
  children,
}: {
  label: string;
  error?: string;
  suffix?: string;
  as?: "label" | "div";
  children: ReactNode;
}) {
  const Tag = as;
  return (
    <Tag className="grid content-start gap-2">
      <span className="text-[13px] font-semibold text-ink-2">{label}</span>
      <span className="relative block">
        {children}
        {suffix && <span className="pointer-events-none absolute top-[24px] right-3.5 -translate-y-1/2 text-sm text-ink-3">{suffix}</span>}
      </span>
      {error && <span className="text-[13px] text-bad">{error}</span>}
    </Tag>
  );
}

function Segmented({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <div role="radiogroup" className="grid grid-cols-2 rounded-xl border border-line-strong bg-bg p-1">
      {options.map(([v, label]) => {
        const on = value === v;
        const Mark = on ? CircleDot : Circle;
        return (
          <label key={v} className="cursor-pointer">
            <input type="radio" name={name} className="peer sr-only" checked={on} onChange={() => onChange(v)} />
            <span
              className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-amber ${
                on ? "bg-surface-3 text-ink" : "text-ink-2 hover:text-ink"
              }`}
            >
              <Mark aria-hidden="true" className={`size-4 ${on ? "text-accent" : "text-ink-3"}`} />
              {label}
            </span>
          </label>
        );
      })}
    </div>
  );
}
