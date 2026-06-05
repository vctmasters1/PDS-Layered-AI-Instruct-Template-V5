/**
 * AppContext.tsx
 * Global application context — cloud-only.
 *
 * WEB-HMI is a cloud-tier app: the device communicates with the cloud via the
 * Android app (phone-as-relay) or directly when cellular/WiFi infrastructure is
 * available.  There is NO direct physical connection from this web app to any
 * device.  All connection, BLE, mDNS, and WiFi scan wiring has been removed.
 *
 * What lives here:
 *   - Pipeline / automation state (localStorage-backed, deploying via cloud API)
 *   - Shared UI helpers (expandable in future)
 */

import React, { createContext, useState, useCallback, ReactNode } from 'react';
import type { Pipeline } from '../automation/datamodels';
import { summarizePipeline } from '../automation/datamodels';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AppContextType {
  // Automation state
  pipelines: Map<string, Pipeline>;
  activePipelineId: string | null;
  automationLoading: boolean;
  automationError: string | null;

  // Automation methods
  loadPipelines: () => Promise<void>;
  deployPipeline: (pipeline: Pipeline) => Promise<void>;
  undeployPipeline: (pipelineId: string) => Promise<void>;
  createPipeline: (pipeline: Pipeline) => void;
  editPipeline: (pipelineId: string, updates: Partial<Pipeline>) => void;
  deletePipeline: (pipelineId: string) => void;
  getPipeline: (pipelineId: string) => Pipeline | undefined;
  setActivePipeline: (pipelineId: string | null) => void;
  describePipeline: (pipelineId: string) => string;
  clearAutomationError: () => void;
}

export const AppContext = createContext<AppContextType | undefined>(undefined);

// ── Provider ──────────────────────────────────────────────────────────────────

const PIPELINES_KEY = 'h2o_pipelines';

interface AppProviderProps {
  children: ReactNode;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  const [pipelines, setPipelines] = useState<Map<string, Pipeline>>(() => {
    try {
      const stored = localStorage.getItem(PIPELINES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as { pipelines: Pipeline[] };
        return new Map(parsed.pipelines.map((p) => [p.id, p]));
      }
    } catch { /* corrupt storage — start fresh */ }
    return new Map();
  });
  const [activePipelineId, setActivePipelineIdState] = useState<string | null>(null);
  const [automationLoading, setAutomationLoading] = useState(false);
  const [automationError, setAutomationError] = useState<string | null>(null);

  // Persist pipelines to localStorage whenever they change
  const persist = useCallback((map: Map<string, Pipeline>) => {
    try {
      localStorage.setItem(PIPELINES_KEY, JSON.stringify({ pipelines: Array.from(map.values()) }));
    } catch { /* quota exceeded — silently skip */ }
  }, []);

  const loadPipelines = useCallback(async () => {
    setAutomationLoading(true);
    try {
      const stored = localStorage.getItem(PIPELINES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as { pipelines: Pipeline[] };
        setPipelines(new Map(parsed.pipelines.map((p) => [p.id, p])));
      }
    } catch (err) {
      setAutomationError(err instanceof Error ? err.message : 'Failed to load pipelines');
    } finally {
      setAutomationLoading(false);
    }
  }, []);

  /**
   * deployPipeline — marks the pipeline as enabled and persists it.
   * The actual push to the device is handled by the cloud API / firmware sync cycle.
   */
  const deployPipeline = useCallback(async (pipeline: Pipeline) => {
    setAutomationLoading(true);
    try {
      setPipelines(prev => {
        const next = new Map(prev).set(pipeline.id, { ...pipeline, enabled: true });
        persist(next);
        return next;
      });
    } catch (err) {
      setAutomationError(err instanceof Error ? err.message : 'Failed to deploy pipeline');
      throw err;
    } finally {
      setAutomationLoading(false);
    }
  }, [persist]);

  const undeployPipeline = useCallback(async (pipelineId: string) => {
    setAutomationLoading(true);
    try {
      setPipelines(prev => {
        const existing = prev.get(pipelineId);
        if (!existing) return prev;
        const next = new Map(prev).set(pipelineId, { ...existing, enabled: false });
        persist(next);
        return next;
      });
    } catch (err) {
      setAutomationError(err instanceof Error ? err.message : 'Failed to undeploy pipeline');
      throw err;
    } finally {
      setAutomationLoading(false);
    }
  }, [persist]);

  const createPipeline = useCallback((pipeline: Pipeline) => {
    setPipelines(prev => {
      const next = new Map(prev).set(pipeline.id, pipeline);
      persist(next);
      return next;
    });
  }, [persist]);

  const editPipeline = useCallback((pipelineId: string, updates: Partial<Pipeline>) => {
    setPipelines(prev => {
      const existing = prev.get(pipelineId);
      if (!existing) return prev;
      const next = new Map(prev).set(pipelineId, { ...existing, ...updates });
      persist(next);
      return next;
    });
  }, [persist]);

  const deletePipeline = useCallback((pipelineId: string) => {
    setPipelines(prev => {
      const next = new Map(prev);
      next.delete(pipelineId);
      persist(next);
      return next;
    });
  }, [persist]);

  const getPipeline = useCallback((pipelineId: string) => pipelines.get(pipelineId), [pipelines]);

  const setActivePipeline = useCallback((id: string | null) => setActivePipelineIdState(id), []);

  const describePipeline = useCallback((pipelineId: string) => {
    const p = pipelines.get(pipelineId);
    return p ? summarizePipeline(p) : 'Unknown pipeline';
  }, [pipelines]);

  const clearAutomationError = useCallback(() => setAutomationError(null), []);

  const value: AppContextType = {
    pipelines,
    activePipelineId,
    automationLoading,
    automationError,
    loadPipelines,
    deployPipeline,
    undeployPipeline,
    createPipeline,
    editPipeline,
    deletePipeline,
    getPipeline,
    setActivePipeline,
    describePipeline,
    clearAutomationError,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export const useAppContext = (): AppContextType => {
  const context = React.useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within AppProvider');
  }
  return context;
};
