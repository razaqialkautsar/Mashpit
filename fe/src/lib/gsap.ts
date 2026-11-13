import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Draggable } from "gsap/Draggable";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { ScrollTrigger } from "gsap/ScrollTrigger";

// Register once, on the client only. Import GSAP from this module everywhere
// so plugins are never registered twice or tree-shaken away.
if (typeof window !== "undefined") {
  gsap.registerPlugin(useGSAP, ScrollTrigger, ScrollSmoother, Draggable);
}

export { Draggable, gsap, ScrollSmoother, ScrollTrigger, useGSAP };
