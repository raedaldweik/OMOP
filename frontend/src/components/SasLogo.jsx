/**
 * SAS-style wordmark rendered as inline SVG so we never depend on
 * file extensions, transparency, or static asset serving.
 *
 * Two variants:
 *   - "white" (default): for dark navy navs / hero sections
 *   - "blue":  for light backgrounds
 *
 * To swap in a real SAS Institute brand asset later, replace the
 * <img src="/logo.png" /> usages OR drop a real transparent PNG/SVG
 * into frontend/public/ and update App.jsx + LandingPage.jsx.
 */
export default function SasLogo({ size = 32, variant = 'white', glow = false }) {
  const fill = variant === 'white' ? '#FFFFFF' : '#0072CE';
  const accent = variant === 'white' ? '#2B95E8' : '#005299';
  const filterId = `sas-glow-${variant}`;

  return (
    <svg
      viewBox="0 0 140 56"
      xmlns="http://www.w3.org/2000/svg"
      style={{ height: size, width: 'auto', display: 'block' }}
      aria-label="SAS"
    >
      {glow && (
        <defs>
          <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      )}
      <g filter={glow ? `url(#${filterId})` : undefined}>
        {/* Stylized "§sas" wordmark — accent square + uppercase letters */}
        <rect x="0" y="6" width="36" height="44" rx="4" fill={accent} opacity="0.85" />
        <text
          x="6" y="42"
          fontFamily="Inter, system-ui, sans-serif"
          fontSize="34" fontWeight="900"
          fill="#FFFFFF" letterSpacing="-1"
        >§</text>
        <text
          x="44" y="42"
          fontFamily="Inter, system-ui, sans-serif"
          fontSize="34" fontWeight="900"
          fill={fill} letterSpacing="-1.5"
        >sas</text>
        <text
          x="124" y="18"
          fontFamily="Inter, system-ui, sans-serif"
          fontSize="9" fontWeight="600"
          fill={fill} opacity="0.55"
        >®</text>
      </g>
    </svg>
  );
}
