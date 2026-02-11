import React, { useState, useEffect } from "react";
import { NavArrowDown } from "iconoir-react";
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

  useEffect(() => {
    getClients()
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setClients(list.map((c: any) => ({ id: c.id, name: c.name || c.slug || c.id })));
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
          <SelectTrigger className="w-48 bg-white/10 border-white/20 text-white hover:bg-white/20">
            <SelectValue placeholder="Select client">
              {selectedClient ? selectedClient.name : "Select client"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
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
        <AnomalyBadges clientId={clientId} />
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-brand-gold animate-pulse shadow-[0_0_8px_rgba(198,165,78,0.6)]"></div>
          <span className="text-brand-gold text-xs font-mono font-medium tracking-wide">LIVE</span>
        </div>
      </div>
    </div>
  );
};
