import { ChooseSide } from "@/components/landing/choose-side";
import { Hero } from "@/components/landing/hero";
import { Nav } from "@/components/landing/nav";
import { Footer } from "@/components/landing/footer";
import { HotPotato } from "@/components/landing/hot-potato";
import { Compare, HowItWorks, Problem } from "@/components/landing/sections";
import { SmoothScroll } from "@/components/landing/smooth-scroll";

export default function LandingPage() {
  return (
    <>
      <Nav />
      <SmoothScroll>
        <main id="top">
          <Hero />
          <Problem />
          <HowItWorks />
          <HotPotato />
          <Compare />
          <ChooseSide />
        </main>
        <Footer />
      </SmoothScroll>
    </>
  );
}
