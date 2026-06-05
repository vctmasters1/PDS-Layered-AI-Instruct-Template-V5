import WorkflowStep from './WorkflowStep.jsx';

const STEP_LABELS = {
  'analyze':   'Analyze',
  'draft-000': 'Draft v0',
  'score-000': 'Score v0',
  'draft-001': 'Draft v1',
  'score-001': 'Score v1',
  'build':     'Build PDF',
};

const STEP_ORDER = ['analyze', 'draft-000', 'score-000', 'draft-001', 'score-001', 'build'];

export default function WorkflowPanel({ listingId, pipeline, onRefresh }) {
  if (!pipeline) return <div className="empty-state">Loading pipeline…</div>;

  return (
    <div>
      {STEP_ORDER.map((step) => (
        <WorkflowStep
          key={step}
          listingId={listingId}
          step={step}
          label={STEP_LABELS[step]}
          info={pipeline[step]}
          onTriggered={onRefresh}
        />
      ))}
    </div>
  );
}

