interface Props {
  className?: string;
}

/** Chakra ring — rings within rings. The Chakravyuh brand mark. */
export function ChakraRing({ className = "h-8 w-8" }: Props) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="chakra-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FF4FA3" />
          <stop offset="100%" stopColor="#B84DFF" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="21" stroke="url(#chakra-grad)" strokeWidth="2.4" />
      <circle cx="24" cy="24" r="15" stroke="url(#chakra-grad)" strokeWidth="1.6" opacity="0.75" />
      <circle cx="24" cy="24" r="9" stroke="url(#chakra-grad)" strokeWidth="1.4" opacity="0.55" />
      <circle cx="24" cy="24" r="3.2" fill="url(#chakra-grad)" />
      <g stroke="url(#chakra-grad)" strokeWidth="1.2" opacity="0.5">
        <line x1="24" y1="9" x2="24" y2="15" />
        <line x1="34.6" y1="13.4" x2="30.4" y2="17.6" />
        <line x1="39" y1="24" x2="33" y2="24" />
        <line x1="34.6" y1="34.6" x2="30.4" y2="30.4" />
        <line x1="24" y1="39" x2="24" y2="33" />
        <line x1="13.4" y1="34.6" x2="17.6" y2="30.4" />
        <line x1="9" y1="24" x2="15" y2="24" />
        <line x1="13.4" y1="13.4" x2="17.6" y2="17.6" />
      </g>
    </svg>
  );
}

export default ChakraRing;
