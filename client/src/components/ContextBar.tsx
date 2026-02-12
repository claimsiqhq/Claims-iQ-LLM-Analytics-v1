import React, { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import logo from "@/assets/logo-white.png";
import { getClients } from "@/lib/api";
import { AnomalyBadges } from "@/components/AnomalyBadges";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ContextBarProps {
  clientId: string;
  onClientChange: (clientId: string) => void;
}

export const ContextBar = ({ clientId, onClientChange }: ContextBarProps) => {
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([]);
  const { theme, setTheme, resolvedTheme } = useTheme();

  useEffect(() => {
    getClients()
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        const mapped = list.map((c: any) => ({ id: c.id, name: c.name || c.slug || c.id }));
        setClients(mapped);
        if ((!clientId || !mapped.find((c) => c.id === clientId)) && mapped.length > 0) {
          onClientChange(mapped[0].id);
        }
      })
      .catch(console.error);
  }, []);

  const selectedClient = clients.find((c) => c.id === clientId);

  return (
    <div className="h-14 w-full bg-brand-deep-purple flex items-center justify-between px-6 fixed top-0 left-0 right-0 z-50 shadow-md">
      <div className="flex items-center gap-6">
        <div className="flex items-center justify-center h-8 w-8 rounded-full overflow-hidden">
          <img src={logo} alt="Claims IQ Logo" className="w-full h-full object-contain" />
        </div>
        <div className="h-4 w-[1px] bg-white/20"></div>

        <Select value={clientId} onValueChange={onClientChange}>
          <SelectTrigger className="w-48 bg-white/10 border-white/20 text-white hover:bg-white/20" data-testid="select-client-trigger">
            <SelectValue placeholder="Select client">
              {selectedClient ? selectedClient.name : "Select client"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-white border-surface-grey-lavender shadow-lg">
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id} className="text-brand-deep-purple hover:bg-surface-purple-light focus:bg-surface-purple-light focus:text-brand-deep-purple" data-testid={`select-client-${c.id}`}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-brand-purple-secondary type-caption hidden md:block">
          Session started {new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => setTheme((resolvedTheme ?? theme) === "dark" ? "light" : "dark")}
          className="p-2 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors"
          title={(resolvedTheme ?? theme) === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {(resolvedTheme ?? theme) === "dark" ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>
        <AnomalyBadges clientId={clientId} />
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-brand-gold animate-pulse shadow-[0_0_8px_rgba(198,165,78,0.6)]"></div>
          <span className="text-brand-gold text-xs font-mono font-medium tracking-wide">LIVE</span>
        </div>
      </div>
    </div>
  );
};
