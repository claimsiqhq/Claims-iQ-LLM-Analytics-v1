/**
 * APP.TSX ENHANCEMENT GUIDE
 *
 * This file shows the exact code changes needed to App.tsx to:
 * 1. Wrap the app in ErrorBoundary
 * 2. Add state for drill-down functionality
 * 3. Replace hardcoded client ID with dynamic state
 * 4. Integrate MorningBrief component
 * 5. Wire up drill-down handlers to Canvas
 *
 * Each section is clearly marked with comments.
 */

// ============================================================================
// SECTION 1: ADD THESE IMPORTS AT THE TOP OF App.tsx
// ============================================================================

// ADD THIS IMPORT
import { ErrorBoundary } from '../components/ErrorBoundary';

// ADD THIS IMPORT
import { MorningBrief } from '../components/MorningBrief';

// Make sure you have these imports already:
// import { ContextBar } from '../components/ContextBar';
// import { Canvas } from '../components/Canvas';
// import { ChatPanel } from '../components/ChatPanel';


// ============================================================================
// SECTION 2: UPDATE THE TYPES/INTERFACES
// ============================================================================

// If you have an AppState interface, ADD these properties:
interface AppState {
  // ... existing state ...

  // ADD THESE: Drill-down state
  drillDown: {
    isOpen: boolean;
    metric: string;
    filters?: Record<string, string | number>;
    timeRange?: { start: string; end: string };
  };

  // ADD THIS: Replace any hardcoded DEFAULT_CLIENT_ID with dynamic state
  selectedClientId: string;
}


// ============================================================================
// SECTION 3: ADD STATE VARIABLES AT TOP OF App COMPONENT
// ============================================================================

export const App: React.FC = () => {
  // ... existing state variables ...

  // ADD THIS: State for managing drill-down panel
  const [drillDownState, setDrillDownState] = React.useState({
    isOpen: false,
    metric: '',
    filters: {} as Record<string, string | number>,
    timeRange: { start: '', end: '' },
  });

  // CHANGE THIS: Replace hardcoded client ID with state
  // OLD: const DEFAULT_CLIENT_ID = 'acme-corp';
  // NEW:
  const [selectedClientId, setSelectedClientId] = React.useState('acme-corp'); // Set default or fetch from storage


  // =========================================================================
  // SECTION 4: ADD HANDLER FUNCTIONS FOR DRILL-DOWN
  // =========================================================================

  // ADD THIS FUNCTION: Opens drill-down panel with context
  const handleDrillDown = (
    metric: string,
    filters: Record<string, string | number>,
    timeRange?: { start: string; end: string }
  ) => {
    setDrillDownState({
      isOpen: true,
      metric,
      filters,
      timeRange: timeRange || { start: '', end: '' },
    });
  };

  // ADD THIS FUNCTION: Closes drill-down panel
  const handleCloseDrillDown = () => {
    setDrillDownState({
      isOpen: false,
      metric: '',
      filters: {},
      timeRange: { start: '', end: '' },
    });
  };


  // =========================================================================
  // SECTION 5: UPDATE useEffect CALLS TO USE selectedClientId
  // =========================================================================

  // FIND ALL useEffect CALLS that fetch data and use a hardcoded client ID
  // CHANGE: getThreads('acme-corp')
  // TO:     getThreads(selectedClientId)
  //
  // EXAMPLE:
  React.useEffect(() => {
    const loadThreads = async () => {
      try {
        const threads = await getThreads(selectedClientId); // CHANGED FROM hardcoded
        // ... rest of logic
      } catch (error) {
        // ... error handling
      }
    };
    loadThreads();
  }, [selectedClientId]); // ADD selectedClientId to dependency array


  // =========================================================================
  // SECTION 6: UPDATE THE RETURN STATEMENT - WRAP IN ErrorBoundary
  // =========================================================================

  // CHANGE THIS:
  // return (
  //   <div className="flex h-screen bg-gray-50">
  //     <ChatPanel ... />
  //     <div className="flex flex-col flex-1">
  //       <ContextBar />
  //       <Canvas ... />
  //     </div>
  //   </div>
  // );

  // TO THIS:
  return (
    <ErrorBoundary>
      <div className="flex h-screen bg-gray-50">
        {/* LEFT: Chat Panel */}
        <ChatPanel
          // ... existing props ...
        />

        {/* RIGHT: Main Content Area */}
        <div className="flex flex-col flex-1">
          {/* Top: Context Bar with client selector and anomalies */}
          <ContextBar
            clientId={selectedClientId}
            onClientChange={setSelectedClientId}
          />

          {/* Main Content: Morning Brief + Chart */}
          <div className="flex-1 overflow-y-auto">
            <div className="px-6 py-6">
              {/* ADD THIS: Morning Brief Component */}
              <MorningBrief clientId={selectedClientId} />

              {/* Canvas with drill-down support */}
              <Canvas
                data={currentResponse?.data}
                insight={currentResponse?.insight}
                assumptions={currentResponse?.assumptions}
                loading={isLoading}
                clientId={selectedClientId}
                onDrillDown={(metric, filters) =>
                  handleDrillDown(metric, filters)
                }
                drillDownState={drillDownState}
              />
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};


// ============================================================================
// SECTION 7: COMPLETE EXAMPLE - Full App Component Structure
// ============================================================================

/**
 * Here's what your complete App component should look like:
 */
import React from 'react';
import { ContextBar } from '../components/ContextBar';
import { Canvas } from '../components/Canvas';
import { ChatPanel } from '../components/ChatPanel';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { MorningBrief } from '../components/MorningBrief';
import { getThreads, getThread } from '../lib/api';

export const App: React.FC = () => {
  // ===== STATE =====
  const [selectedThread, setSelectedThread] = React.useState<string | null>(null);
  const [currentResponse, setCurrentResponse] = React.useState<any>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  // NEW: Drill-down state
  const [drillDownState, setDrillDownState] = React.useState({
    isOpen: false,
    metric: '',
    filters: {} as Record<string, string | number>,
    timeRange: { start: '', end: '' },
  });

  // NEW: Dynamic client selection (replaces hardcoded DEFAULT_CLIENT_ID)
  const [selectedClientId, setSelectedClientId] = React.useState('acme-corp');

  // ===== EFFECTS =====
  React.useEffect(() => {
    const loadThreads = async () => {
      try {
        const threads = await getThreads(selectedClientId);
        // ... update thread list
      } catch (error) {
        console.error('Error loading threads:', error);
      }
    };
    loadThreads();
  }, [selectedClientId]); // Include selectedClientId in dependencies

  // ===== HANDLERS =====
  const handleDrillDown = (
    metric: string,
    filters: Record<string, string | number>,
    timeRange?: { start: string; end: string }
  ) => {
    setDrillDownState({
      isOpen: true,
      metric,
      filters,
      timeRange: timeRange || { start: '', end: '' },
    });
  };

  const handleCloseDrillDown = () => {
    setDrillDownState({
      isOpen: false,
      metric: '',
      filters: {},
      timeRange: { start: '', end: '' },
    });
  };

  // ===== RENDER =====
  return (
    <ErrorBoundary>
      <div className="flex h-screen bg-gray-50">
        {/* Left Sidebar: Chat */}
        <ChatPanel
          threads={[]}
          selectedThreadId={selectedThread}
          onSelectThread={setSelectedThread}
          onSendMessage={async (message) => {
            // Handle message sending
          }}
        />

        {/* Right Content: Analytics */}
        <div className="flex flex-col flex-1">
          {/* Top: Context Bar */}
          <ContextBar
            clientId={selectedClientId}
            onClientChange={setSelectedClientId}
          />

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto bg-gray-50">
            <div className="p-6">
              {/* Morning Brief */}
              <MorningBrief clientId={selectedClientId} />

              {/* Canvas with Drill-down */}
              <Canvas
                data={currentResponse?.data}
                insight={currentResponse?.insight}
                assumptions={currentResponse?.assumptions}
                loading={isLoading}
                clientId={selectedClientId}
                onDrillDown={handleDrillDown}
                drillDownState={drillDownState}
              />
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default App;


// ============================================================================
// SECTION 8: MIGRATION CHECKLIST
// ============================================================================

/**
 * Follow these steps to integrate the enhancements:
 *
 * 1. Add all new imports (ErrorBoundary, MorningBrief, etc.)
 * 2. Add drill-down state variables
 * 3. Replace all hardcoded client IDs with selectedClientId state
 * 4. Add new handler functions (handleDrillDown, handleCloseDrillDown)
 * 5. Update all useEffect dependency arrays to include selectedClientId
 * 6. Wrap entire app return in <ErrorBoundary>
 * 7. Add <MorningBrief> component above Canvas
 * 8. Update <Canvas> props to include drill-down handlers
 * 9. Update <ContextBar> props with clientId and onClientChange
 * 10. Test drill-down by clicking on chart elements
 * 11. Test client selector to ensure data updates correctly
 * 12. Test error boundary by intentionally throwing an error
 * 13. Verify morning brief displays and refreshes correctly
 */


// ============================================================================
// SUMMARY OF CHANGES:
// ============================================================================
//
// 1. Two new imports added:
//    - ErrorBoundary component
//    - MorningBrief component
//
// 2. AppState interface updated with:
//    - drillDownState object
//    - selectedClientId string
//
// 3. State variables added:
//    - drillDownState
//    - selectedClientId
//
// 4. Handler functions added:
//    - handleDrillDown()
//    - handleCloseDrillDown()
//
// 5. All useEffect calls updated:
//    - Replace hardcoded client IDs with selectedClientId
//    - Add selectedClientId to dependency arrays
//
// 6. Return statement wrapped:
//    - Entire app wrapped in <ErrorBoundary>
//
// 7. New components integrated:
//    - <MorningBrief> added above Canvas
//
// 8. Component props updated:
//    - Canvas: receives drill-down state and handlers
//    - ContextBar: receives clientId and callback
//
// ============================================================================
