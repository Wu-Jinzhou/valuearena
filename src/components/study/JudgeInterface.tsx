'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

type VoteChoice = '1' | '2' | 't' | 'b';

interface ScenarioData {
  scenario: string;
  scenario_index: number;
  response1: string;
  response2: string;
  model1: string;
  model2: string;
  criteria: string[];
  criterion_total: number;
  scenario_number: number;
  scenario_total: number;
}

export default function JudgeInterface() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);

  // Study state
  const [totalScenarios, setTotalScenarios] = useState(0);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [scenarioData, setScenarioData] = useState<ScenarioData | null>(null);
  const [currentCriterionIdx, setCurrentCriterionIdx] = useState(0);
  const [votes, setVotes] = useState<VoteChoice[]>([]);

  // Animation state
  const [showCheckmark, setShowCheckmark] = useState<'left' | 'right' | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    initializeStudy();
  }, []);

  const initializeStudy = async () => {
    try {
      setLoading(true);
      const token = session?.access_token;

      const response = await fetch('/api/study/init', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error || 'Failed to initialize study');
        return;
      }

      setTotalScenarios(data.total_scenarios);

      if (data.total_scenarios === 0) {
        setComplete(true);
        return;
      }

      await loadNextScenario();
    } catch (err: any) {
      setError(err.message || 'Failed to initialize study');
    } finally {
      setLoading(false);
    }
  };

  const loadNextScenario = async () => {
    try {
      setLoading(true);
      const token = session?.access_token;

      const response = await fetch(
        `/api/study/next-scenario?position=${currentPosition}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!data.success) {
        setError(data.error || 'Failed to load scenario');
        return;
      }

      if (data.complete) {
        setComplete(true);
        return;
      }

      if (data.skip) {
        // Skip scenario with insufficient responses
        setCurrentPosition(data.nextPosition);
        await loadNextScenario();
        return;
      }

      setScenarioData(data);
      setCurrentCriterionIdx(0);
      setVotes([]);
      setShowCheckmark(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load scenario');
    } finally {
      setLoading(false);
    }
  };

  const handleVote = async (choice: VoteChoice) => {
    if (!scenarioData || submitting) return;

    // Show animation
    if (choice === '1') {
      setShowCheckmark('left');
    } else if (choice === '2') {
      setShowCheckmark('right');
    }

    // Update votes array
    const newVotes = [...votes, choice];
    setVotes(newVotes);

    // Wait for animation
    await new Promise((resolve) => setTimeout(resolve, 800));
    setShowCheckmark(null);

    // Check if all criteria are judged
    if (newVotes.length >= scenarioData.criteria.length) {
      // Submit all votes
      await submitVotes(newVotes);
    } else {
      // Move to next criterion
      setCurrentCriterionIdx(currentCriterionIdx + 1);
    }
  };

  const submitVotes = async (allVotes: VoteChoice[]) => {
    if (!scenarioData) return;

    try {
      setSubmitting(true);
      const token = session?.access_token;

      const response = await fetch('/api/study/vote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          votes: allVotes,
          scenario_index: scenarioData.scenario_index,
          model1: scenarioData.model1,
          model2: scenarioData.model2,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error || 'Failed to submit votes');
        return;
      }

      // Move to next scenario
      setCurrentPosition(currentPosition + 1);
      await loadNextScenario();
    } catch (err: any) {
      setError(err.message || 'Failed to submit votes');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !scenarioData) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-slate-300 border-t-slate-900" />
          <p className="text-slate-600">Loading scenarios...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-lg font-semibold text-red-900">Error</p>
        <p className="mt-2 text-sm text-red-700">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
        >
          Reload Page
        </button>
      </div>
    );
  }

  if (complete) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-lg">
        <div className="mb-4 text-6xl">🎉</div>
        <h2 className="mb-4 text-3xl font-bold text-slate-900">
          Study Complete!
        </h2>
        <p className="mb-6 text-lg text-slate-600">
          Thank you for contributing to the EigenBench human evaluation study.
          Your judgments help us better understand AI value alignment.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-xl bg-slate-900 px-6 py-3 font-semibold text-white transition hover:bg-slate-700"
        >
          Start New Session
        </button>
      </div>
    );
  }

  if (!scenarioData) return null;

  const currentCriterion = scenarioData.criteria[currentCriterionIdx];
  const progress = Math.round(
    ((currentPosition * scenarioData.criterion_total + currentCriterionIdx) /
      (totalScenarios * scenarioData.criterion_total)) *
      100
  );

  return (
    <div className="space-y-6">
      {/* Progress Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
        <p className="text-sm text-slate-600">
          Scenario {scenarioData.scenario_number} of {scenarioData.scenario_total} •
          Criterion {currentCriterionIdx + 1} of {scenarioData.criterion_total}
        </p>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full bg-slate-900 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Scenario Card */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="whitespace-pre-wrap text-base leading-relaxed text-slate-800">
          {scenarioData.scenario}
        </p>
      </div>

      {/* Assistant Responses */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Assistant A */}
        <div className="relative rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
            <span className="text-lg font-semibold text-slate-900">Assistant A</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              {scenarioData.model1}
            </span>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {scenarioData.response1}
          </p>
          {/* Checkmark Overlay */}
          {showCheckmark === 'left' && (
            <div className="absolute inset-0 flex items-center justify-center rounded-3xl bg-green-600/70 text-8xl text-white">
              ✓
            </div>
          )}
        </div>

        {/* Assistant B */}
        <div className="relative rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
            <span className="text-lg font-semibold text-slate-900">Assistant B</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              {scenarioData.model2}
            </span>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {scenarioData.response2}
          </p>
          {/* Checkmark Overlay */}
          {showCheckmark === 'right' && (
            <div className="absolute inset-0 flex items-center justify-center rounded-3xl bg-green-600/70 text-8xl text-white">
              ✓
            </div>
          )}
        </div>
      </div>

      {/* Voting Card */}
      <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-indigo-600 to-purple-600 p-6 text-white shadow-lg">
        <div className="mb-6 text-center">
          <p className="mb-2 text-sm opacity-90">Criterion</p>
          <p className="text-lg font-semibold leading-relaxed">{currentCriterion}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <button
            onClick={() => handleVote('1')}
            disabled={submitting}
            className="group flex flex-col items-center justify-center rounded-2xl border-2 border-white/30 bg-white/10 px-4 py-4 transition hover:-translate-y-1 hover:border-white/60 hover:bg-white/20 disabled:opacity-50"
          >
            <span className="mb-1 text-2xl font-bold">←</span>
            <span className="text-sm font-semibold">Left feels closer</span>
            <span className="mt-1 text-xs opacity-75">Assistant A matches</span>
          </button>

          <button
            onClick={() => handleVote('t')}
            disabled={submitting}
            className="group flex flex-col items-center justify-center rounded-2xl border-2 border-white/30 bg-white/10 px-4 py-4 transition hover:-translate-y-1 hover:border-white/60 hover:bg-white/20 disabled:opacity-50"
          >
            <span className="text-sm font-semibold">It's a tie</span>
            <span className="mt-1 text-xs opacity-75">Similar values</span>
          </button>

          <button
            onClick={() => handleVote('b')}
            disabled={submitting}
            className="group flex flex-col items-center justify-center rounded-2xl border-2 border-white/30 bg-white/10 px-4 py-4 transition hover:-translate-y-1 hover:border-white/60 hover:bg-white/20 disabled:opacity-50"
          >
            <span className="text-sm font-semibold">Both missed</span>
            <span className="mt-1 text-xs opacity-75">Neither aligns</span>
          </button>

          <button
            onClick={() => handleVote('2')}
            disabled={submitting}
            className="group flex flex-col items-center justify-center rounded-2xl border-2 border-white/30 bg-white/10 px-4 py-4 transition hover:-translate-y-1 hover:border-white/60 hover:bg-white/20 disabled:opacity-50"
          >
            <span className="mb-1 text-2xl font-bold">→</span>
            <span className="text-sm font-semibold">Right feels closer</span>
            <span className="mt-1 text-xs opacity-75">Assistant B captures</span>
          </button>
        </div>

        {submitting && (
          <div className="mt-4 text-center text-sm opacity-90">
            Saving your judgments...
          </div>
        )}
      </div>
    </div>
  );
}

