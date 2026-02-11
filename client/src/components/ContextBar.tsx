import React from 'react';
import { NavArrowDown } from 'iconoir-react';

export const ContextBar = () => {
  return (
    <div className="h-14 w-full bg-brand-deep-purple flex items-center justify-between px-6 fixed top-0 left-0 right-0 z-50 shadow-md">
      {/* Left: Logo & Context */}
      <div className="flex items-center gap-6">
        {/* Logo */}
        <div className="flex items-center justify-center h-8 w-8 rounded-full overflow-hidden">
          <img src="/attached_assets/ClaimsIQ_Logo_02-09_1770799240990.png" alt="Claims IQ Logo" className="w-full h-full object-contain" />
        </div>
        
        {/* Separator */}
        <div className="h-4 w-[1px] bg-white/20"></div>

        {/* Client Selector */}
        <button className="flex items-center gap-2 text-white hover:text-brand-purple-light transition-colors group">
          <span className="font-display font-semibold text-base">Global Insurance Co.</span>
          <NavArrowDown className="w-5 h-5 text-brand-purple-secondary group-hover:text-brand-purple-light transition-colors" />
        </button>

        {/* Session Info */}
        <span className="text-brand-purple-secondary text-xs font-body hidden md:block">
          Session started 9:14 AM
        </span>
      </div>

      {/* Right: Freshness */}
      <div className="flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full bg-brand-gold animate-pulse shadow-[0_0_8px_rgba(198,165,78,0.6)]"></div>
        <span className="text-brand-gold text-xs font-mono font-medium tracking-wide">LIVE</span>
      </div>
    </div>
  );
};
