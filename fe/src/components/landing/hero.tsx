import { routes } from "@/lib/routes";
import { Heading, Reveal } from "./motion";
import { ButtonLink } from "./button";
import { PitScene3D } from "./pit-scene-3d";

/**
 * One viewport: the 3D pit fills the section and everything else floats over it.
 * Desktop puts the copy on the left with the pit to its right; narrower screens
 * stack the copy on top and drop the pit below it (the scene does the offset).
 */
export function Hero() {
  return (
    <section className="relative isolate h-svh min-h-[680px] max-h-[980px] overflow-hidden">
      <PitScene3D />

      {/* Darkens only behind the copy on desktop, where it overlaps the ring. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden bg-radial-[ellipse_45%_60%_at_18%_50%] from-bg/85 to-transparent lg:block"
      />
      {/* Fades the floor into the next section. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-linear-to-b from-transparent to-bg"
      />

      {/* Lets drags reach the canvas everywhere except on the buttons. */}
      <div className="wrap pointer-events-none relative flex h-full flex-col pt-[calc(72px+clamp(24px,5vw,48px))] text-center lg:justify-center lg:pt-[72px] lg:text-left">
        <div className="mx-auto max-w-[600px] lg:mx-0">
          <Heading
            tag="h1"
            onLoad
            text="Stop babysitting your cron bot."
            className="text-[clamp(2.375rem,5vw,4.25rem)] leading-[1.02] tracking-[-0.03em]"
          />
          <Reveal trigger="mount" delay={0.3} distance={16}>
            <p className="mx-auto mt-5 max-w-[46ch] text-[clamp(1rem,1.3vw,1.125rem)] text-ink-2 lg:mx-0 lg:max-w-[38ch]">
              Mashpit is a keeper market on NEAR. Post a scheduled contract call, AI keepers bid to
              run it, and you pay only when it succeeds.
            </p>
          </Reveal>
          <Reveal
            trigger="mount"
            delay={0.45}
            distance={16}
            stagger={0.08}
            className="pointer-events-auto mt-7 flex flex-wrap justify-center gap-3 lg:justify-start"
          >
            <ButtonLink href={routes.live}>Watch the live arena</ButtonLink>
            <ButtonLink href={routes.newJob} variant="ghost">
              Post a job
            </ButtonLink>
          </Reveal>
          {/* ink-2 on narrow screens, where this line sits on the orange spotlight. */}
        </div>
      </div>

    </section>
  );
}
