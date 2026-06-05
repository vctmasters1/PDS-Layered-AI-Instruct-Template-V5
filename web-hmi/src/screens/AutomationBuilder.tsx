/**
 * AutomationBuilder.tsx
 * Create and manage automation pipelines
 */

import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { FormField, FormTextarea } from '../components/FormField';
import { useFormValidation } from '../hooks/useFormValidation';
import { formValidators } from '../utils/validation';

const AutomationBuilder: React.FC = () => {
  const {
    pipelines,
    activePipelineId,
    loadPipelines,
    deployPipeline,
    undeployPipeline,
    createPipeline,
    deletePipeline,
    setActivePipeline,
    describePipeline,
  } = useAppContext();

  const [showCreateForm, setShowCreateForm] = useState(false);

  const createForm = useFormValidation({
    initialValues: { name: '', description: '' },
    validate: (values) => ({
      name: formValidators.pipelineName(values.name),
      description: [], // No validation needed
    }),
    onSubmit: async (values) => {
      const id = `pipeline_${Date.now()}`;
      const newPipeline = {
        id,
        name: values.name,
        description: values.description,
        enabled: false,
        conditions: [],
        actions: [],
        timers: [],
        lastModified: Date.now(),
        createdAt: Date.now(),
      };

      createPipeline(newPipeline);
      createForm.resetForm();
      setShowCreateForm(false);
      setActivePipeline(id);
    },
  });

  // Load pipelines on mount
  useEffect(() => {
    loadPipelines();
  }, [loadPipelines]);

  const handleDeploy = async (pipelineId: string) => {
    const pipeline = pipelines.get(pipelineId);
    if (!pipeline) return;

    try {
      await deployPipeline(pipeline);
      alert('Pipeline deployed successfully');
    } catch (error) {
      alert(`Failed to deploy pipeline: ${error}`);
    }
  };

  const handleUndeploy = async (pipelineId: string) => {
    try {
      await undeployPipeline(pipelineId);
      alert('Pipeline undeployed successfully');
    } catch (error) {
      alert(`Failed to undeploy pipeline: ${error}`);
    }
  };

  const activePipeline = activePipelineId ? pipelines.get(activePipelineId) : null;

  return (
    <div className="p-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pipeline List */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Pipelines</h2>
              <button
                onClick={() => setShowCreateForm(true)}
                className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition"
              >
                + New
              </button>
            </div>

            {/* Create Form */}
            {showCreateForm && (
              <form onSubmit={createForm.handleSubmit} className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-md space-y-3">
                <FormField
                  label="Pipeline Name"
                  name="name"
                  placeholder="e.g., Water Level Safety"
                  value={createForm.values.name}
                  onChange={createForm.handleChange}
                  onBlur={createForm.handleBlur}
                  error={createForm.getFieldErrorMessage('name')}
                  required
                />

                <FormTextarea
                  label="Description"
                  name="description"
                  placeholder="What does this pipeline do? (optional)"
                  value={createForm.values.description}
                  onChange={createForm.handleChange}
                  onBlur={createForm.handleBlur}
                  error={createForm.getFieldErrorMessage('description')}
                  rows={2}
                />

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={createForm.isSubmitting}
                    className="flex-1 px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50 transition font-medium"
                  >
                    {createForm.isSubmitting ? 'Creating...' : 'Create'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateForm(false);
                      createForm.resetForm();
                    }}
                    className="flex-1 px-3 py-2 bg-gray-300 dark:bg-gray-600 text-gray-900 dark:text-white rounded text-sm hover:bg-gray-400 transition"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {/* Pipeline Items */}
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {pipelines.size === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-sm">No pipelines yet</p>
              ) : (
                Array.from(pipelines.values()).map((pipeline: any) => (
                  <button
                    key={pipeline.id}
                    onClick={() => setActivePipeline(pipeline.id)}
                    className={`w-full text-left p-3 rounded-md transition ${
                      activePipelineId === pipeline.id
                        ? 'bg-blue-100 dark:bg-blue-900/40 border border-blue-500'
                        : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 border border-transparent'
                    }`}
                  >
                    <p className="font-semibold text-gray-900 dark:text-white text-sm">{pipeline.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {pipeline.enabled ? '✓ Active' : '○ Inactive'}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Pipeline Editor */}
        <div className="lg:col-span-2">
          {activePipeline ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{activePipeline.name}</h2>
                  {activePipeline.description && (
                    <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">{activePipeline.description}</p>
                  )}
                </div>
                <button
                  onClick={() => deletePipeline(activePipeline.id)}
                  className="px-3 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition"
                >
                  Delete
                </button>
              </div>

              {/* Status */}
              <div className="mb-6 p-4 bg-gray-100 dark:bg-gray-700/50 rounded-md">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Status</p>
                    <p className={`text-sm ${activePipeline.enabled ? 'text-green-600' : 'text-gray-600'} dark:text-gray-400`}>
                      {activePipeline.enabled ? '✓ Deployed' : '○ Not deployed'}
                    </p>
                  </div>
                  {activePipeline.enabled ? (
                    <button
                      onClick={() => handleUndeploy(activePipeline.id)}
                      className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition font-medium"
                    >
                      Undeploy
                    </button>
                  ) : (
                    <button
                      onClick={() => handleDeploy(activePipeline.id)}
                      className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition font-medium"
                    >
                      Deploy
                    </button>
                  )}
                </div>
              </div>

              {/* Configuration Sections */}
              <div className="space-y-6">
                {/* Conditions */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Conditions</h3>
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-md p-4 text-center">
                    <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">
                      {activePipeline.conditions.length === 0 ? 'No conditions yet' : `${activePipeline.conditions.length} condition(s)`}
                    </p>
                    <button className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition">
                      Add Condition
                    </button>
                  </div>
                </div>

                {/* Actions */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Actions</h3>
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-md p-4 text-center">
                    <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">
                      {activePipeline.actions.length === 0 ? 'No actions yet' : `${activePipeline.actions.length} action(s)`}
                    </p>
                    <button className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition">
                      Add Action
                    </button>
                  </div>
                </div>

                {/* Timers */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Timers</h3>
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-md p-4 text-center">
                    <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">
                      {!activePipeline.timer ? 'No timer' : '1 timer configured'}
                    </p>
                    <button className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition">
                      Add Timer
                    </button>
                  </div>
                </div>

                {/* Summary */}
                <div className="p-4 bg-gray-100 dark:bg-gray-700/50 rounded-md">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Pipeline Summary</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {describePipeline(activePipeline.id)}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 text-center">
              <p className="text-gray-600 dark:text-gray-400">Select or create a pipeline to get started</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AutomationBuilder;
