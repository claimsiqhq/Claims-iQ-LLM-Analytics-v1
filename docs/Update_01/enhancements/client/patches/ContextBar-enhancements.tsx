/**
 * CONTEXTBAR.TSX ENHANCEMENT GUIDE
 *
 * This file shows the exact code changes needed to ContextBar.tsx to:
 * 1. Wire up dynamic client selector using getClients() API
 * 2. Integrate AnomalyBadges component
 * 3. Make client name dynamic based on selection
 *
 * Each section is clearly marked with comments.
 */

// ============================================================================
// SECTION 1: ADD THESE IMPORTS AT THE TOP OF ContextBar.tsx
// ============================================================================

// ADD THIS IMPORT
import { AnomalyBadges } from '../components/AnomalyBadges';

// ADD THIS IMPORT (if not already present)
import { getClients } from '../lib/api';

// ADD THESE UI COMPONENT IMPORTS
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/Select';


// ============================================================================
// SECTION 2: UPDATE THE ContextBar COMPONENT PROPS
// ============================================================================

interface ContextBarProps {
  // ... existing props ...
  // CHANGE THIS: Make clientId come from props instead of being hardcoded
  clientId: string;
  onClientChange: (clientId: string) => void;
}


// ============================================================================
// SECTION 3: ADD STATE FOR CLIENT SELECTOR
// ============================================================================

export const ContextBar: React.FC<ContextBarProps> = ({
  // ... existing props ...
  clientId,
  onClientChange,
}) => {
  // ADD THIS STATE: Store list of available clients
  const [clients, setClients] = React.useState<Array<{
    id: string;
    name: string;
  }>>([]);

  // ADD THIS STATE: Store selected client details
  const [selectedClient, setSelectedClient] = React.useState<{
    id: string;
    name: string;
  } | null>(null);

  // ADD THIS STATE: Track loading state for client list
  const [loadingClients, setLoadingClients] = React.useState(false);

  // ADD THIS STATE: Track errors loading client list
  const [clientError, setClientError] = React.useState<string | null>(null);


  // =========================================================================
  // SECTION 4: ADD EFFECT TO LOAD CLIENTS ON MOUNT
  // =========================================================================

  // ADD THIS EFFECT: Fetch available clients when component mounts
  React.useEffect(() => {
    fetchClients();
  }, []);

  // ADD THIS FUNCTION: Fetch clients from API
  const fetchClients = async () => {
    setLoadingClients(true);
    setClientError(null);
    try {
      const clientList = await getClients();
      setClients(clientList || []);

      // Set the first client as selected if available
      if (clientList && clientList.length > 0 && !selectedClient) {
        const firstClient = clientList[0];
        setSelectedClient(firstClient);
      }
    } catch (error) {
      setClientError(
        error instanceof Error ? error.message : 'Failed to load clients'
      );
      console.error('Error loading clients:', error);
    } finally {
      setLoadingClients(false);
    }
  };

  // ADD THIS EFFECT: Update selectedClient when clientId prop changes
  React.useEffect(() => {
    const client = clients.find((c) => c.id === clientId);
    if (client) {
      setSelectedClient(client);
    }
  }, [clientId, clients]);

  // ADD THIS FUNCTION: Handle client selection change
  const handleClientChange = (newClientId: string) => {
    const selected = clients.find((c) => c.id === newClientId);
    if (selected) {
      setSelectedClient(selected);
      onClientChange(newClientId);
    }
  };


  // =========================================================================
  // SECTION 5: UPDATE THE RENDER - MAKE CLIENT NAME DYNAMIC
  // =========================================================================

  // FIND THIS SECTION IN ContextBar:
  // <div className="flex items-center gap-4">
  //   <span className="text-xl font-bold text-gray-900">
  //     Claims IQ Analytics — Acme Corp
  //   </span>

  // REPLACE WITH THIS:
  <div className="flex items-center gap-4">
    <span className="text-xl font-bold text-gray-900">
      Claims IQ Analytics
      {selectedClient && (
        <>
          {' '}— <span className="text-brand-purple">{selectedClient.name}</span>
        </>
      )}
    </span>
  </div>


  // =========================================================================
  // SECTION 6: ADD CLIENT SELECTOR DROPDOWN
  // =========================================================================

  // FIND THIS SECTION (after the title):
  // <div className="flex-1" />

  // ADD THIS CLIENT SELECTOR AFTER THE TITLE:
  {/* CLIENT SELECTOR DROPDOWN */}
  <div className="flex items-center gap-3">
    {loadingClients ? (
      <div className="text-sm text-gray-500">Loading clients...</div>
    ) : clientError ? (
      <div className="text-sm text-red-600">{clientError}</div>
    ) : (
      <Select value={clientId} onValueChange={handleClientChange}>
        <SelectTrigger className="w-48 h-10 bg-white border border-gray-200 rounded-lg">
          <SelectValue placeholder="Select client" />
        </SelectTrigger>
        <SelectContent>
          {clients.map((client) => (
            <SelectItem key={client.id} value={client.id}>
              {client.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )}
  </div>


  // =========================================================================
  // SECTION 7: ADD ANOMALY BADGES NEXT TO LIVE BADGE
  // =========================================================================

  // FIND THIS SECTION IN ContextBar:
  // <div className="flex items-center gap-2 ml-auto">
  //   <Badge className="bg-brand-gold text-brand-deep-purple">LIVE</Badge>
  // </div>

  // REPLACE WITH THIS:
  <div className="flex items-center gap-3 ml-auto">
    {/* ANOMALY BADGES */}
    <AnomalyBadges clientId={clientId} />

    {/* LIVE BADGE */}
    <Badge className="bg-brand-gold text-brand-deep-purple">LIVE</Badge>
  </div>


  // =========================================================================
  // SECTION 8: COMPLETE EXAMPLE - ContextBar STRUCTURE
  // =========================================================================

  // Here's what your complete ContextBar render should look like:

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between gap-4">
        {/* Left: Logo and Title */}
        <div className="flex items-center gap-4">
          {/* Logo */}
          <div className="w-8 h-8 bg-gradient-to-br from-brand-purple to-brand-deep-purple rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">IQ</span>
          </div>

          {/* Title with Dynamic Client Name */}
          <span className="text-xl font-bold text-gray-900">
            Claims IQ Analytics
            {selectedClient && (
              <>
                {' '}— <span className="text-brand-purple">{selectedClient.name}</span>
              </>
            )}
          </span>
        </div>

        {/* Center: Client Selector */}
        {!loadingClients && !clientError && (
          <Select value={clientId} onValueChange={handleClientChange}>
            <SelectTrigger className="w-48 h-10 bg-white border border-gray-200 rounded-lg">
              <SelectValue placeholder="Select client" />
            </SelectTrigger>
            <SelectContent>
              {clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Right: Anomaly Badges + Live Badge */}
        <div className="flex items-center gap-3 ml-auto">
          <AnomalyBadges clientId={clientId} />
          <Badge className="bg-brand-gold text-brand-deep-purple">LIVE</Badge>
        </div>
      </div>
    </div>
  );
};


// ============================================================================
// SECTION 9: UPDATE App.tsx TO PASS NEW PROPS TO ContextBar
// ============================================================================

// In your App.tsx, update the ContextBar usage:

// CHANGE THIS:
// <ContextBar />

// TO THIS:
<ContextBar
  clientId={selectedClientId}
  onClientChange={(clientId) => setSelectedClientId(clientId)}
/>

// (selectedClientId should be state in App.tsx - see App-enhancements.tsx)


// ============================================================================
// SUMMARY OF CHANGES:
// ============================================================================
//
// 1. Four new imports added:
//    - AnomalyBadges component
//    - getClients API function
//    - Select UI component (shadcn/ui)
//
// 2. ContextBarProps interface updated with:
//    - clientId prop (string)
//    - onClientChange callback
//
// 3. Local state added:
//    - clients[] array
//    - selectedClient object
//    - loadingClients boolean
//    - clientError string
//
// 4. Effects added:
//    - Fetch clients on mount
//    - Sync selectedClient when clientId prop changes
//
// 5. Handler function added:
//    - handleClientChange() to update selection
//
// 6. UI updates:
//    - Client name made dynamic (not hardcoded)
//    - Client selector dropdown added
//    - AnomalyBadges component integrated
//
// ============================================================================
