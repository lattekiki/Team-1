import { BadgeCheck } from "lucide-react";

export function HeroIllustration() {
  return (
    <div className="relative mx-auto w-full max-w-[390px] select-none">
      <svg viewBox="0 0 400 420" className="w-full h-auto drop-shadow-sm" role="img" aria-label="Ethiopian student worker in Jimma">
        <defs>
          <linearGradient id="tibebAccent" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#D97706" />
            <stop offset="50%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
        </defs>
        <circle cx="205" cy="200" r="155" fill="#F4F4F5" />
        <path
          d="M70,260 C40,180 95,75 195,65 C295,55 365,135 345,235 C325,335 245,365 155,355 C95,348 90,315 70,260 Z"
          fill="#18181B"
          opacity="0.06"
        />
        <path d="M95,390 C102,315 142,285 200,285 C258,285 298,315 305,390 Z" fill="#18181B" />
        <path d="M168,285 L200,345 L232,285 Z" fill="#FFFFFF" />
        <path d="M150,288 L175,390 L192,390 L166,286 Z" fill="#FFFFFF" />
        <path d="M153,288 L158,390" stroke="url(#tibebAccent)" strokeWidth="4" strokeDasharray="6 3" />
        <path d="M250,288 L225,390 L208,390 L234,286 Z" fill="#FFFFFF" />
        <path d="M247,288 L242,390" stroke="url(#tibebAccent)" strokeWidth="4" strokeDasharray="6 3" />
        <rect x="182" y="236" width="36" height="54" rx="16" fill="#6F442B" />
        <circle cx="200" cy="158" r="76" fill="#18181B" />
        <circle cx="145" cy="145" r="34" fill="#18181B" />
        <circle cx="255" cy="145" r="34" fill="#18181B" />
        <circle cx="165" cy="105" r="32" fill="#18181B" />
        <circle cx="235" cy="105" r="32" fill="#18181B" />
        <circle cx="200" cy="94" r="34" fill="#18181B" />
        <path d="M150,158 C150,118 250,118 250,158 C250,212 228,248 200,248 C172,248 150,212 150,158 Z" fill="#855336" />
        <rect x="160" y="156" width="32" height="22" rx="7" fill="none" stroke="#18181B" strokeWidth="3.5" />
        <rect x="208" y="156" width="32" height="22" rx="7" fill="none" stroke="#18181B" strokeWidth="3.5" />
        <line x1="192" y1="166" x2="208" y2="166" stroke="#18181B" strokeWidth="3.5" />
        <circle cx="176" cy="167" r="3.5" fill="#18181B" />
        <circle cx="224" cy="167" r="3.5" fill="#18181B" />
        <path d="M185,204 Q200,218 215,204" fill="none" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" />
        <rect x="168" y="310" width="64" height="86" rx="12" fill="#27272A" stroke="#FFFFFF" strokeWidth="2.5" />
        <circle cx="200" cy="352" r="10" fill="#10B981" />
        <path d="M195,352 L199,356 L206,348" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" />
      </svg>

      <div className="absolute top-6 -left-2 sm:-left-6 bg-white border border-zinc-200 shadow-lg rounded-2xl px-3.5 py-2.5 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-zinc-900 text-white flex items-center justify-center">
          <BadgeCheck className="w-4 h-4 text-emerald-400" />
        </div>
        <div>
          <p className="text-[11px] font-bold text-zinc-900 leading-tight">@username • Public</p>
          <p className="text-[10px] text-zinc-500">Real name & phone stay private</p>
        </div>
      </div>

      <div className="absolute bottom-10 -right-2 sm:-right-4 bg-zinc-900 text-white shadow-xl rounded-2xl px-4 py-2.5 flex items-center gap-2.5">
        <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
        <div>
          <p className="text-xs font-bold">Pairing confirmed</p>
          <p className="text-[10px] text-zinc-400">Phone unlocked to start work</p>
        </div>
      </div>
    </div>
  );
}

export function HowItWorksIllustration() {
  return (
    <div className="relative mx-auto w-full max-w-[340px] select-none">
      <svg viewBox="0 0 360 380" className="w-full h-auto" role="img" aria-label="Ethiopian professional">
        <path
          d="M55,250 C30,190 65,115 145,105 C225,95 295,140 285,220 C275,295 190,320 115,305 C75,296 70,285 55,250 Z"
          fill="#111111"
        />
        <ellipse cx="185" cy="240" rx="135" ry="42" transform="rotate(-14 185 240)" fill="none" stroke="#111111" strokeWidth="2.5" />
        <path
          d="M112,265 L117,278 L130,283 L117,288 L112,301 L107,288 L94,283 L107,278 Z"
          fill="#FFFFFF"
          stroke="#111111"
          strokeWidth="2"
        />
        <path d="M105,355 C112,285 145,260 185,260 C225,260 258,285 265,355 Z" fill="#FFFFFF" stroke="#111111" strokeWidth="2.5" />
        <path d="M150,263 Q185,295 220,263" fill="none" stroke="#D97706" strokeWidth="5" />
        <circle cx="185" cy="102" r="28" fill="#18181B" />
        <path d="M136,162 C132,115 238,115 234,162 L240,225 L130,225 Z" fill="#18181B" />
        <rect x="171" y="216" width="28" height="46" rx="12" fill="#7A4B30" />
        <path d="M144,154 C144,118 226,118 226,154 C226,202 208,230 185,230 C162,230 144,202 144,154 Z" fill="#8E5838" />
        <circle cx="166" cy="162" r="3" fill="#18181B" />
        <circle cx="204" cy="162" r="3" fill="#18181B" />
        <path d="M174,194 Q185,204 196,194" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" />
        <rect x="132" y="252" width="76" height="94" rx="10" transform="rotate(-8 132 252)" fill="#D97706" stroke="#111111" strokeWidth="2.5" />
        <rect x="146" y="266" width="48" height="10" rx="4" transform="rotate(-8 146 266)" fill="#FFFFFF" />
      </svg>
    </div>
  );
}
