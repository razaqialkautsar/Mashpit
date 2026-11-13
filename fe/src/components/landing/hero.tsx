import { routes } from "@/lib/routes";
import { ButtonLink } from "./button";
import { PitScene3D } from "./pit-scene-3d";

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-[calc(72px+clamp(28px,4vw,56px))]">
      <div className="wrap text-center">
        <h1 className="mx-auto max-w-[14ch] text-[clamp(2.75rem,6vw,4.75rem)] leading-[0.98] tracking-[-0.03em]">
          Stop babysitting your cron bot.
        </h1>
        <p className="mx-auto mt-6 max-w-[52ch] text-[clamp(1rem,1.3vw,1.125rem)] text-ink-2">
          Mashpit is a keeper market on NEAR. Post a scheduled contract call, AI keepers bid to
          run it, and you pay only when it succeeds.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink href={routes.live}>Watch the live arena</ButtonLink>
          <ButtonLink href={routes.newJob} variant="ghost">
            Post a job
          </ButtonLink>
        </div>
        <p className="mt-5 text-[13px] text-ink-3">
          NEAR testnet · hackathon build · the potato picks a keeper, you can drag it
        </p>
      </div>
      <div className="mt-[clamp(16px,2.5vw,32px)]">
        <PitScene3D />
      </div>
    </section>
  );
}
