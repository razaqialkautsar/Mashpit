"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useNearWallet } from "near-connect-hooks";
import { Loader, Pause, Play, Plus, Trash2, Wallet } from "lucide-react";
import { describeError } from "@/lib/contract";
import { formatNear, parseNear } from "@/lib/format";
import { dismissed, near } from "@/lib/near";
import { routes } from "@/lib/routes";
import type { JobView } from "@/lib/types";
import { buttonClasses } from "../landing/button";
import { Dialog } from "./dialog";

const GAS = "50000000000000"; // 50 Tgas
type Method = "top_up" | "pause_job" | "resume_job" | "close_job";

/**
 * Job actions. top_up is open to anyone; pause, resume and close only to the
 * owner. `layout="header"` sits beside the title on desktop; `layout="bar"`
 * is the sticky bottom bar on phones (DESIGN.md → Layout).
 */
export function JobActions({ job, onDone, layout }: { job: JobView; onDone: () => void; layout: "header" | "bar" }) {
  const router = useRouter();
  const { signedAccountId, signIn, callFunction } = useNearWallet();
  const [busy, setBusy] = useState<Method>();
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const [dialog, setDialog] = useState<"top_up" | "close">();
  const [amount, setAmount] = useState("0.5");

  if (job.status === "Closed") return null;
  const isOwner = signedAccountId === job.owner;
  const bar = layout === "bar";

  async function run(method: Method, deposit = "0") {
    setBusy(method);
    setMessage(undefined);
    try {
      await callFunction({ contractId: near.contractId, method, args: { job_id: job.id }, gas: GAS, deposit });
      // close_job deletes the job from state (spec §4.3), so its page has nothing left to show.
      if (method === "close_job") {
        router.replace(`${routes.live}?closed=${job.id}`);
        return;
      }
      setMessage({ ok: true, text: method === "top_up" ? "Balance topped up." : "Done." });
      setDialog(undefined);
      onDone();
    } catch (e) {
      setMessage({ ok: false, text: describeError(e) });
    } finally {
      setBusy(undefined);
    }
  }

  const spin = (m: Method) => busy === m && <Loader aria-hidden="true" className="size-4 animate-spin" />;
  const yocto = parseNear(amount);
  const amountOk = !!yocto && yocto !== "0";
  const btn = (variant: "primary" | "ghost") => `${buttonClasses(variant, bar ? "md" : "md")} disabled:opacity-50 ${bar ? "flex-1 px-3" : ""}`;

  const buttons = !signedAccountId ? (
    <button type="button" onClick={() => signIn().catch(dismissed)} className={btn("primary")}>
      <Wallet aria-hidden="true" className="size-4" /> Connect to top up
    </button>
  ) : (
    <>
      {isOwner &&
        (job.status === "Active" ? (
          <button type="button" disabled={!!busy} onClick={() => run("pause_job")} className={btn("ghost")}>
            {spin("pause_job") || <Pause aria-hidden="true" className="size-4" />} Pause
          </button>
        ) : (
          <button type="button" disabled={!!busy} onClick={() => run("resume_job")} className={btn("ghost")}>
            {spin("resume_job") || <Play aria-hidden="true" className="size-4" />} Resume
          </button>
        ))}
      {isOwner && (
        <button
          type="button"
          disabled={!!busy}
          onClick={() => setDialog("close")}
          className={`${btn("ghost")} border-accent-deep text-accent-hover hover:border-accent hover:bg-accent-soft`}
        >
          <Trash2 aria-hidden="true" className="size-4" /> {bar ? "Close" : "Close job"}
        </button>
      )}
      <button type="button" disabled={!!busy} onClick={() => setDialog("top_up")} className={`${btn("primary")} ${bar && isOwner ? "flex-[1.6]" : ""}`}>
        <Plus aria-hidden="true" className="size-4" /> Top up
      </button>
    </>
  );

  return (
    <>
      {bar ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur-md md:hidden">
          {message && (
            <p role="status" className={`mb-2 text-center text-[13px] ${message.ok ? "text-ok" : "text-bad"}`}>{message.text}</p>
          )}
          <div className="flex gap-2">{buttons}</div>
        </div>
      ) : (
        <div className="hidden flex-col items-end gap-2 md:flex">
          <div className="flex flex-wrap justify-end gap-2.5">{buttons}</div>
          {message && <p role="status" className={`text-[13px] ${message.ok ? "text-ok" : "text-bad"}`}>{message.text}</p>}
        </div>
      )}

      <Dialog open={dialog === "top_up"} onClose={() => setDialog(undefined)} title={`Top up job #${job.id}`}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (amountOk && yocto) run("top_up", yocto);
          }}
          className="grid gap-4"
        >
          <p className="text-sm text-ink-2">
            Balance now <span className="font-semibold text-glow">{formatNear(job.balance, 3)} NEAR</span>. Each run pays at most{" "}
            {formatNear(job.max_reward)} NEAR.
          </p>
          <label className="grid gap-1.5">
            <span className="text-sm font-semibold text-ink-2">Amount</span>
            <span className="relative">
              <input
                autoFocus
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-invalid={!amountOk}
                className="w-full rounded-xl border border-line-strong bg-bg px-3.5 py-3 pr-16 font-mono text-base outline-none focus:border-ink-3 aria-[invalid=true]:border-bad"
              />
              <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-sm text-ink-3">NEAR</span>
            </span>
          </label>
          <div className="flex gap-2">
            {["0.5", "1", "2"].map((v) => (
              <button key={v} type="button" onClick={() => setAmount(v)} className="rounded-full border border-line-strong px-3.5 py-1.5 text-sm font-semibold text-ink-2 hover:text-ink">
                {v} NEAR
              </button>
            ))}
          </div>
          {amountOk && yocto && (
            <p className="text-[13px] text-ink-3">
              Adds about {(BigInt(yocto) / BigInt(job.max_reward)).toString()} runs at the max reward.
            </p>
          )}
          {message && !message.ok && <p className="text-sm text-bad">{message.text}</p>}
          <button type="submit" disabled={!amountOk || !!busy} className={`${buttonClasses("primary")} w-full disabled:opacity-50`}>
            {spin("top_up")} Sign & top up
          </button>
        </form>
      </Dialog>

      <Dialog open={dialog === "close"} onClose={() => setDialog(undefined)} title={`Close job #${job.id}?`}>
        <div className="grid gap-4">
          <p className="text-sm text-ink-2">
            The remaining <span className="font-semibold text-glow">{formatNear(job.balance, 3)} NEAR</span> and the freed storage
            deposit go back to you. Keepers stop bidding, and a closed job cannot be reopened.
          </p>
          {message && !message.ok && <p className="text-sm text-bad">{message.text}</p>}
          <div className="flex gap-2.5">
            <button type="button" onClick={() => setDialog(undefined)} className={`${buttonClasses("ghost")} flex-1`}>
              Keep it
            </button>
            <button type="button" disabled={!!busy} onClick={() => run("close_job")} className={`${buttonClasses("primary")} flex-1 disabled:opacity-50`}>
              {spin("close_job")} Close job
            </button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
