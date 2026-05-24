import { cn } from '../lib/utils';

interface LogoProps {
  className?: string;
  showText?: boolean;
}

export function Logo({ className, showText = true }: LogoProps) {
  return (
    <div className={cn("flex items-center space-x-3 select-none", className)}>
      <div className="relative w-10 h-10 shrink-0">
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <defs>
            <linearGradient id="logoBlue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#125688" />
              <stop offset="100%" stopColor="#0a3d60" />
            </linearGradient>
            <linearGradient id="logoGreen" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7ce121" />
              <stop offset="100%" stopColor="#5fab14" />
            </linearGradient>
            <linearGradient id="logoSeat" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#227ebc" />
              <stop offset="100%" stopColor="#0e4b75" />
            </linearGradient>
            <radialGradient id="logoGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#a3f740" />
              <stop offset="100%" stopColor="#7ce121" />
            </radialGradient>
          </defs>
          
          {/* Subtle logo drop shadow */}
          <ellipse cx="50" cy="94" rx="18" ry="3" fill="rgba(0,0,0,0.12)" />

          {/* Left Wing (Blue Map-Pin Shield) */}
          <path 
            d="M 50,14 C 33.5,14 20,27.5 20,45 C 20,62 35,76 50,86 V 14 Z" 
            fill="url(#logoBlue)" 
          />

          {/* Right Wing (Apple Green Crescent Accent) -> Hollow center */}
          <path 
            d="M 50,14 C 66.5,14 80,27.5 80,45 C 80,62 65,76 50,86 C 50.5,86 54,78 58,68 C 66,48 70,36 70,28 C 70,22 62,17 50,14 Z" 
            fill="url(#logoGreen)" 
          />

          {/* Backrest of the Seat */}
          <path 
            d="M 34,26 C 33,21 38,18 43,20 C 47,21 49,29 50,39 C 50,44 49,47 46,48 C 42,49 37,47 35,45 C 33,42 34,31 34,26 Z" 
            fill="url(#logoBlue)" 
          />

          {/* Seat Cushion Trapezoid with a white border */}
          <path 
            d="M 38,54 C 47,47 57,46 66,49 C 71,51 75,54 72,57 C 68,60 57,62 46,61 C 40,60 36,57 38,54 Z" 
            fill="url(#logoSeat)" 
            stroke="#ffffff" 
            strokeWidth="2.5" 
            strokeLinejoin="round" 
          />

          {/* Green Glowing Sensor Dot */}
          <circle cx="56" cy="55" r="4.5" fill="url(#logoGlow)" />
          
          {/* Pulsing indicator halo */}
          <circle cx="56" cy="55" r="7.2" stroke="#7ce121" strokeWidth="1.2" fill="none" opacity="0.65" className="animate-pulse" />
        </svg>
      </div>
      {showText && (
        <div className="flex font-bold text-2xl tracking-tighter">
          <span className="text-[#125688] dark:text-slate-100 transition-colors">Seat</span>
          <span className="text-[#7ce121] transition-colors">Idle</span>
        </div>
      )}
    </div>
  );
}
