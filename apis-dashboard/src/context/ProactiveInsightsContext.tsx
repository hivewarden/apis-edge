/**
 * ProactiveInsightsContext
 *
 * Provides global state management for proactive BeeBrain insights.
 * Enables insights to be accessed and managed from anywhere in the app.
 *
 * NOTE: This context uses the useProactiveInsights hook internally to avoid
 * code duplication. The context adds site ID management on top of the hook.
 *
 * Part of Epic 8, Story 8.4: Proactive Insight Notifications
 */
import {
  createContext,
  useContext,
  useState,
  ReactNode,
} from 'react';
import { useProactiveInsights, type UseProactiveInsightsResult } from '../hooks/useProactiveInsights';

// Re-export ProactiveInsight type from hook to avoid duplication
export type { ProactiveInsight } from '../hooks/useProactiveInsights';

/**
 * Context value type for proactive insights management.
 * Extends the hook result with site ID management capabilities.
 */
export interface ProactiveInsightsContextValue extends UseProactiveInsightsResult {
  /** Manually refresh insights (alias for refresh) */
  refreshInsights: () => Promise<void>;
  /** Set the current site ID for filtering */
  setSiteId: (siteId: string | null) => void;
  /** Current site ID */
  siteId: string | null;
}

const ProactiveInsightsContext = createContext<ProactiveInsightsContextValue | null>(null);

interface ProactiveInsightsProviderProps {
  children: ReactNode;
}

/**
 * ProactiveInsightsProvider
 *
 * Provides proactive insights state management to child components.
 * Uses the useProactiveInsights hook internally and adds site ID management.
 */
export function ProactiveInsightsProvider({ children }: ProactiveInsightsProviderProps) {
  const [siteId, setSiteId] = useState<string | null>(null);

  // Use the hook internally - no duplication of logic
  const hookResult = useProactiveInsights(siteId);

  const value: ProactiveInsightsContextValue = {
    ...hookResult,
    refreshInsights: hookResult.refresh,
    setSiteId,
    siteId,
  };

  return (
    <ProactiveInsightsContext.Provider value={value}>
      {children}
    </ProactiveInsightsContext.Provider>
  );
}

/**
 * Hook to access proactive insights context.
 *
 * @throws Error if used outside ProactiveInsightsProvider
 *
 * @example
 * function MyComponent() {
 *   const { insights, dismissInsight } = useProactiveInsightsContext();
 *   return (
 *     <div>
 *       {insights.map(i => <Insight key={i.id} {...i} onDismiss={dismissInsight} />)}
 *     </div>
 *   );
 * }
 */
export function useProactiveInsightsContext(): ProactiveInsightsContextValue {
  const context = useContext(ProactiveInsightsContext);
  if (!context) {
    throw new Error('useProactiveInsightsContext must be used within a ProactiveInsightsProvider');
  }
  return context;
}

export default ProactiveInsightsContext;
