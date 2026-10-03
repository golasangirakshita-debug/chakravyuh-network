import IntroSplash from "@/components/IntroSplash";
import LineWaves from "@/components/LineWaves";
import TargetCursor from "@/components/TargetCursor";
import { useEffect, useState, type CSSProperties } from "react";

/**
 * Global chrome: one-shot intro splash, the custom target cursor, and the
 * fixed LineWaves background.
 *
 * The layer sits at z-index -1 and `body` is deliberately transparent
 * (see index.css) so the WebGL canvas is actually visible — an opaque body
 * background paints over negative z-index children and hid this entirely.
 */
export default function AppChrome() {
  const [waves, setWaves] = useState(false);

  // The wave shader is fill-rate heavy; mount it one frame after paint so it
  // never competes with first paint of the route content.
  useEffect(() => {
    const id = window.setTimeout(() => setWaves(true), 60);
    return () => window.clearTimeout(id);
  }, []);

  const bgLayer: CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: -1,
    pointerEvents: "none",
    overflow: "hidden",
    // Vignette so foreground text keeps contrast over the brightest wave ridges.
    background:
      "radial-gradient(1200px 800px at 50% 40%, rgba(5,6,10,0.30), rgba(5,6,10,0.86) 78%)",
  };

  return (
    <>
      <IntroSplash onDone={() => {}} />
      <TargetCursor
        spinDuration={2}
        hideDefaultCursor
        parallaxOn
        cursorColor="#ffffff"
        cursorColorOnTarget="#ff4fa3"
      />
      <div aria-hidden style={bgLayer}>
        {waves && (
          <LineWaves
            speed={0.22}
            innerLineCount={22}
            outerLineCount={30}
            warpIntensity={1.15}
            rotation={-52}
            edgeFadeWidth={0.55}
            colorCycleSpeed={0.75}
            brightness={0.42}
            color1="#22D3EE"
            color2="#A78BFA"
            color3="#B84DFF"
            enableMouseInteraction
            mouseInfluence={1.4}
          />
        )}
        <div className="grid-bg" style={{ position: "absolute", inset: 0, opacity: 0.45 }} />
      </div>
    </>
  );
}