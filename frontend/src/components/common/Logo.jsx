// ============================================================================
//  Logo.jsx  —  EHSIM · GITSIS tech-baykuş amblemi (ölçeklenebilir SVG).
//  Kullanıcının verdiği figürün vektör yorumudur: gümüş madalyon, koyu çekirdek,
//  tepede parlayan cyan nokta, iki büyük baykuş gözü (teknolojik halkalar) ve gaga.
//  Gradient id çakışmasını önlemek için useId ile benzersiz son ek kullanılır.
// ============================================================================
import { useId } from 'react'

export default function Logo({ size = 40, className = '' }) {
  const uid = useId().replace(/[:]/g, '')
  const ring = `ring-${uid}`
  const cyan = `cyan-${uid}`
  const glow = `glow-${uid}`
  const core = `core-${uid}`

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      className={className}
      role="img"
      aria-label="EHSIM GITSIS"
    >
      <defs>
        <linearGradient id={ring} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#eef4f9" />
          <stop offset="45%" stopColor="#a9bccd" />
          <stop offset="100%" stopColor="#5c7187" />
        </linearGradient>
        <linearGradient id={cyan} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
        <radialGradient id={core} cx="50%" cy="38%" r="70%">
          <stop offset="0%" stopColor="#1b2430" />
          <stop offset="100%" stopColor="#070b11" />
        </radialGradient>
        <radialGradient id={glow} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.9" />
          <stop offset="60%" stopColor="#22d3ee" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Dış madalyon */}
      <circle
        cx="60"
        cy="60"
        r="58"
        fill={`url(#${core})`}
        stroke={`url(#${ring})`}
        strokeWidth="4"
      />
      <circle
        cx="60"
        cy="60"
        r="52"
        fill="none"
        stroke={`url(#${ring})`}
        strokeWidth="1.4"
        opacity="0.65"
      />

      {/* Tepedeki parlayan nokta */}
      <circle cx="60" cy="27" r="13" fill={`url(#${glow})`} />
      <circle cx="60" cy="27" r="5" fill={`url(#${cyan})`} />

      {/* Baykuş kaş kemerleri (alından gözlere inen gümüş yaylar) */}
      <path
        d="M60 30 C 36 30, 22 46, 24 70"
        fill="none"
        stroke={`url(#${ring})`}
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <path
        d="M60 30 C 84 30, 98 46, 96 70"
        fill="none"
        stroke={`url(#${ring})`}
        strokeWidth="3.4"
        strokeLinecap="round"
      />

      {/* Sol göz */}
      <g>
        <circle cx="41" cy="66" r="17" fill="none" stroke={`url(#${ring})`} strokeWidth="3.2" />
        <path
          d="M41 49 A17 17 0 0 0 41 83"
          fill="none"
          stroke={`url(#${cyan})`}
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <circle
          cx="41"
          cy="66"
          r="11.5"
          fill="none"
          stroke={`url(#${cyan})`}
          strokeWidth="2.2"
          opacity="0.85"
        />
        <circle cx="41" cy="66" r="7.5" fill="#05080d" />
        <circle cx="38.5" cy="63.5" r="2.2" fill="#9fe9f5" opacity="0.8" />
      </g>

      {/* Sağ göz */}
      <g>
        <circle cx="79" cy="66" r="17" fill="none" stroke={`url(#${ring})`} strokeWidth="3.2" />
        <path
          d="M79 49 A17 17 0 0 1 79 83"
          fill="none"
          stroke={`url(#${cyan})`}
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <circle
          cx="79"
          cy="66"
          r="11.5"
          fill="none"
          stroke={`url(#${cyan})`}
          strokeWidth="2.2"
          opacity="0.85"
        />
        <circle cx="79" cy="66" r="7.5" fill="#05080d" />
        <circle cx="76.5" cy="63.5" r="2.2" fill="#9fe9f5" opacity="0.8" />
      </g>

      {/* Gaga (cyan ışıltılı üçgen + ince hat) */}
      <path d="M60 70 L 65 84 L 60 92 L 55 84 Z" fill={`url(#${cyan})`} />
      <line x1="60" y1="72" x2="60" y2="90" stroke="#bff3fb" strokeWidth="1" opacity="0.7" />
    </svg>
  )
}
