import IntroSplash from "@/components/IntroSplash";
import PixelSwap from "@/components/PixelSwap";
import TargetCursor from "@/components/TargetCursor";
import { useVyuh } from "@/store/vyuh";
import type { CSSProperties } from "react";

/** Scene A — deep navy drifting into violet. */
const sceneA = (
  <div
    style={{
      position: "absolute",
      inset: 0,
      background:
        "radial-gradient(1300px 700px at 22% 18%, rgba(43, 61, 138, 0.55), transparent 62%), radial-gradient(900px 600px at 82% 78%, rgba(94, 58, 176, 0.4), transparent 65%), linear-gradient(155deg, #060711 0%, #090a18 48%, #120b22 100%)",
    }}
  >
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity: 0.55,
        backgroundImage:
          "radial-gradient(rgba(126, 148, 255, 0.16) 1px, transparent 1px)",
        backgroundSize: "28px 28px",
      }}
    />
  </div>
);

/** Scene B — violet bleeding into a pink glow. */
const sceneB = (
  <div
    style={{
      position: "absolute",
      inset: 0,
      background:
        "radial-gradient(1100px 700px at 74% 22%, rgba(184, 77, 255, 0.34), transparent 62%), radial-gradient(950px 650px at 26% 84%, rgba(255, 79, 163, 0.26), transparent 62%), linear-gradient(155deg, #14081e 0%, #0a0714 55%, #05060a 100%)",
    }}
  >
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity: 0.5,
        backgroundImage:
          "radial-gradient(rgba(255, 168, 214, 0.14) 1px, transparent 1px)",
        backgroundSize: "28px 28px",
      }}
    />
  </div>
);

/**
 * Global chrome: one-shot intro splash, the custom target cursor and the
 * fixed PixelSwap background that flips scene whenever a sidebar item is hit.
 */
export default function AppChrome() {
  const { pixelActive } = useVyuh();

  const bgLayer: CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: -1,
    pointerEvents: "none",
    overflow: "hidden",
  };

  return (
    <>
      <IntroSplash />
      <TargetCursor
        spinDuration={2}
        hideDefaultCursor
        parallaxOn
        cursorColor="#ffffff"
        cursorColorOnTarget="#ff4fa3"
      />
      <div aria-hidden style={bgLayer}>
        <PixelSwap
          firstContent={sceneA}
          secondContent={sceneB}
          trigger="manual"
          active={pixelActive}
          pixelSize={64}
          pattern="spiral"
          fade
          duration={1400}
          pixelDuration={450}
          aspectRatio="auto"
          className="vyuh-pixelswap"
          style={{ height: "100vh", width: "100%" }}
        />
        <div className="grid-bg" style={{ position: "absolute", inset: 0, opacity: 0.6 }} />
      </div>
    </>
  );
}
