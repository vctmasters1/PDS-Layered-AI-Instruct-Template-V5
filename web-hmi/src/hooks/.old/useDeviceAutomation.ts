/**
 * useDeviceAutomation Hook
 * Manages automation pipelines on device
 */

import { useState, useCallback, useRef } from 'react';
import type { PDS_web_NetworkManager } from '../network/PDS_web_wifi';
import type { Pipeline, DeviceAutomation } from '../automation/datamodels';
import { summarizePipeline } from '../automation/datamodels';

export interface AutomationState {
  pipelines: Map<string, Pipeline>;
  activePipelineId: string | null;
  deployedPipelineIds: Set<string>;
  loading: boolean;
  error: string | null;
  lastDeployTime: number | null;
}

interface UseDeviceAutomationReturn {
  state: AutomationState;
  loadPipelines: () => Promise<void>;
  deployPipeline: (pipeline: Pipeline) => Promise<void>;
  undeployPipeline: (pipelineId: string) => Promise<void>;
  createPipeline: (pipeline: Pipeline) => void;
  editPipeline: (pipelineId: string, updates: Partial<Pipeline>) => void;
  deletePipeline: (pipelineId: string) => void;
  getPipeline: (pipelineId: string) => Pipeline | undefined;
  setActivePipeline: (pipelineId: string | null) => void;
  describePipeline: (pipelineId: string) => string;
  clearError: () => void;
}

export const useDeviceAutomation = (
  manager: PDS_web_NetworkManager | null
): UseDeviceAutomationReturn => {
  const [state, setState] = useState<AutomationState>({
    pipelines: new Map(),
    activePipelineId: null,
    deployedPipelineIds: new Set(),
    loading: false,
    error: null,
    lastDeployTime: null,
  });

  const localStorageKeyRef = useRef<string>('h2o_pipelines');

  // Load pipelines from local storage on init
  const loadPipelines = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      // Try to load from device first
      if (manager) {
        // Note: Device may not support GET /automation yet
        // Fall back to local storage
      }

      // Load from local storage
      const stored = localStorage.getItem(localStorageKeyRef.current);
      if (stored) {
        const parsed = JSON.parse(stored) as DeviceAutomation;
        const pipelineMap = new Map(parsed.pipelines.map((p) => [p.id, p]));
        setState((prev) => ({
          ...prev,
          pipelines: pipelineMap,
          loading: false,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          loading: false,
        }));
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to load pipelines';
      setState((prev) => ({
        ...prev,
        loading: false,
        error: errorMsg,
      }));
    }
  }, [manager]);

  const deployPipeline = useCallback(
    async (pipeline: Pipeline) => {
      if (!manager) {
        setState((prev) => ({
          ...prev,
          error: 'No device connected',
        }));
        return;
      }

      setState((prev) => ({
        ...prev,
        loading: true,
        error: null,
      }));

      try {
        // Send pipeline to device (wrapped in DeviceAutomation)
        await manager.sendAutomation({ pipelines: [pipeline] });

        // Mark as deployed
        setState((prev) => ({
          ...prev,
          pipelines: new Map(prev.pipelines).set(pipeline.id, {
            ...pipeline,
            enabled: true,
          }),
          deployedPipelineIds: new Set(prev.deployedPipelineIds).add(pipeline.id),
          loading: false,
          lastDeployTime: Date.now(),
        }));

        // Save to local storage
        savePipelinesToLocalStorage(state.pipelines);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Failed to deploy pipeline';
        setState((prev) => ({
          ...prev,
          loading: false,
          error: errorMsg,
        }));
        throw error;
      }
    },
    [manager, state.pipelines]
  );

  const undeployPipeline = useCallback(
    async (pipelineId: string) => {
      if (!manager) {
        setState((prev) => ({
          ...prev,
          error: 'No device connected',
        }));
        return;
      }

      setState((prev) => ({
        ...prev,
        loading: true,
        error: null,
      }));

      try {
        // Create disabled copy of pipeline
        const pipeline = state.pipelines.get(pipelineId);
        if (!pipeline) {
          throw new Error('Pipeline not found');
        }

        // Send disabled version to device
        const disabledPipeline = { ...pipeline, enabled: false };
        await manager.sendAutomation({ pipelines: [disabledPipeline] });

        // Mark as not deployed
        setState((prev) => ({
          ...prev,
          deployedPipelineIds: new Set(
            Array.from(prev.deployedPipelineIds).filter((id) => id !== pipelineId)
          ),
          loading: false,
        }));
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Failed to undeploy pipeline';
        setState((prev) => ({
          ...prev,
          loading: false,
          error: errorMsg,
        }));
        throw error;
      }
    },
    [manager, state.pipelines]
  );

  const createPipeline = useCallback((pipeline: Pipeline) => {
    setState((prev) => ({
      ...prev,
      pipelines: new Map(prev.pipelines).set(pipeline.id, pipeline),
    }));
    // Don't save to local storage yet; user must deploy explicitly
  }, []);

  const editPipeline = useCallback(
    (pipelineId: string, updates: Partial<Pipeline>) => {
      setState((prev) => {
        const existing = prev.pipelines.get(pipelineId);
        if (!existing) return prev;

        const updated = { ...existing, ...updates };
        return {
          ...prev,
          pipelines: new Map(prev.pipelines).set(pipelineId, updated),
        };
      });
    },
    []
  );

  const deletePipeline = useCallback((pipelineId: string) => {
    setState((prev) => {
      const newMap = new Map(prev.pipelines);
      newMap.delete(pipelineId);
      return {
        ...prev,
        pipelines: newMap,
        deployedPipelineIds: new Set(
          Array.from(prev.deployedPipelineIds).filter((id) => id !== pipelineId)
        ),
        activePipelineId:
          prev.activePipelineId === pipelineId ? null : prev.activePipelineId,
      };
    });
  }, []);

  const getPipeline = useCallback(
    (pipelineId: string) => {
      return state.pipelines.get(pipelineId);
    },
    [state.pipelines]
  );

  const setActivePipeline = useCallback((pipelineId: string | null) => {
    setState((prev) => ({
      ...prev,
      activePipelineId: pipelineId,
    }));
  }, []);

  const describePipeline = useCallback(
    (pipelineId: string) => {
      const pipeline = state.pipelines.get(pipelineId);
      if (!pipeline) return 'Pipeline not found';
      return summarizePipeline(pipeline);
    },
    [state.pipelines]
  );

  const clearError = useCallback(() => {
    setState((prev) => ({
      ...prev,
      error: null,
    }));
  }, []);

  return {
    state,
    loadPipelines,
    deployPipeline,
    undeployPipeline,
    createPipeline,
    editPipeline,
    deletePipeline,
    getPipeline,
    setActivePipeline,
    describePipeline,
    clearError,
  };
};

// Helper to save pipelines to local storage
function savePipelinesToLocalStorage(pipelines: Map<string, Pipeline>) {
  const automation: DeviceAutomation = {
    pipelines: Array.from(pipelines.values()),
  };
  localStorage.setItem('h2o_pipelines', JSON.stringify(automation));
}
