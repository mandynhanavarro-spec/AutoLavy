import React from 'react'
import autolavyLogo from '../assets/logo-autolavy.png.png'

export const LogoAutoLavy = ({ className = 'w-12 h-12', variant = 'icon' }) => {
  if (variant === 'icon') {
    return <img src={autolavyLogo} alt="AutoLavy" className={className} />
  }

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <img src={autolavyLogo} alt="AutoLavy" className="h-full w-auto object-contain" />
      {variant === 'horizontal' && (
        <span className="text-lg font-black tracking-tight text-slate-900">AutoLavy</span>
      )}
    </div>
  )
}

export const LogoMC = ({ className = "w-12 h-12", variant = "icon" }) => {
  if (variant === "horizontal") {
    return (
      <svg width="220" height="64" viewBox="0 0 220 64" xmlns="http://www.w3.org/2000/svg" className={className}>
        <rect width="64" height="64" rx="14" fill="#2563eb"/>
        <rect x="9" y="9" width="46" height="46" rx="9" fill="none" stroke="white" stroke-width="2.5"/>
        <rect x="24" y="11" width="16" height="4" rx="2" fill="white"/>
        <path d="M17 42 Q17 48 23 48 L41 48 Q47 48 47 42" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
        <text x="19" y="39" font-family="Arial Black, Arial" font-weight="900" font-size="15" fill="white">M</text>
        <text x="33" y="39" font-family="Arial Black, Arial" font-weight="900" font-size="15" fill="white">C</text>
        <polygon points="42,24 37,33 41,33 36,43 46,30 42,30" fill="#FACC15"/>
        <text x="76" y="30" font-family="Arial Black, Arial" font-weight="900" font-size="18" fill="#1e3a5f">Meu</text>
        <text x="76" y="52" font-family="Arial Black, Arial" font-weight="900" font-size="18" fill="#2563eb">Caixa</text>
        <rect x="76" y="33" width="54" height="2" rx="1" fill="#FACC15"/>
      </svg>
    )
  }

  if (variant === "white") {
    return (
      <svg width="160" height="48" viewBox="0 0 160 48" xmlns="http://www.w3.org/2000/svg" className={className}>
        <rect width="48" height="48" rx="11" fill="#3b82f6"/>
        <rect x="7" y="7" width="34" height="34" rx="7" fill="none" stroke="white" stroke-width="2"/>
        <rect x="18" y="8" width="12" height="3" rx="1.5" fill="white"/>
        <path d="M13 32 Q13 36 17 36 L31 36 Q35 36 35 32" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"/>
        <text x="14" y="30" font-family="Arial Black, Arial" font-weight="900" font-size="11" fill="white">MC</text>
        <polygon points="31,18 27,25 30,25 26,33 34,22 31,22" fill="#FACC15"/>
        <text x="58" y="22" font-family="Arial Black, Arial" font-weight="900" font-size="14" fill="white">Meu</text>
        <text x="58" y="39" font-family="Arial Black, Arial" font-weight="900" font-size="14" fill="#93c5fd">Caixa</text>
        <rect x="58" y="25" width="40" height="1.5" rx="1" fill="#FACC15"/>
      </svg>
    )
  }

  return (
    <svg width="96" height="96" viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect width="96" height="96" rx="22" fill="#2563eb"/>
      <rect x="14" y="14" width="68" height="68" rx="14" fill="none" stroke="white" stroke-width="4"/>
      <rect x="36" y="17" width="24" height="6" rx="3" fill="white"/>
      <path d="M26 62 Q26 72 36 72 L60 72 Q70 72 70 62" fill="none" stroke="white" stroke-width="4" stroke-linecap="round"/>
      <text x="30" y="57" font-family="Arial Black, Arial" font-weight="900" font-size="22" fill="white">M</text>
      <text x="50" y="57" font-family="Arial Black, Arial" font-weight="900" font-size="22" fill="white">C</text>
      <polygon points="62,36 55,50 61,50 54,64 67,46 61,46" fill="#FACC15"/>
    </svg>
  )
}
