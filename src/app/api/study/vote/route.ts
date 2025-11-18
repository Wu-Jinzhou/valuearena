import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { readFile } from 'fs/promises';
import path from 'path';

const CONSTITUTION_PATH = process.env.CONSTITUTION_PATH || 'Constitutions/Kindness.txt';
const DATASET_PATH = process.env.DATASET_PATH || 'Datasets/evaluations.json';

async function loadCriteria(constitutionPath: string): Promise<string[]> {
  const fullPath = path.join(process.cwd(), 'Eigenbench_UI_4', constitutionPath);
  const content = await readFile(fullPath, 'utf-8');
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function normalizePair(a: string, b: string): [string, string, boolean] {
  if (a.toLowerCase() <= b.toLowerCase()) {
    return [a, b, false];
  } else {
    return [b, a, true];
  }
}

async function upsertVote(
  userId: string,
  datasetPath: string,
  scenarioIndex: number,
  constitutionPath: string,
  criterion: string,
  m1: string,
  m2: string,
  win1: number,
  tie: number,
  win2: number
): Promise<boolean> {
  try {
    const [modelA, modelB, flipped] = normalizePair(m1, m2);
    const [winA, winB] = flipped ? [win2, win1] : [win1, win2];

    // Check if record exists
    const { data: existing } = await supabase
      .from('human_judgements')
      .select('*')
      .eq('user_id', userId)
      .eq('dataset_path', datasetPath)
      .eq('scenario_index', scenarioIndex)
      .eq('constitution_path', constitutionPath)
      .eq('criterion', criterion)
      .eq('model1', modelA)
      .eq('model2', modelB)
      .single();

    if (existing) {
      // Update existing record
      const { error } = await supabase
        .from('human_judgements')
        .update({
          win1: existing.win1 + winA,
          tie: existing.tie + tie,
          win2: existing.win2 + winB,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (error) throw error;
    } else {
      // Insert new record
      const { error } = await supabase.from('human_judgements').insert({
        user_id: userId,
        dataset_path: datasetPath,
        scenario_index: scenarioIndex,
        constitution_path: constitutionPath,
        criterion,
        model1: modelA,
        model2: modelB,
        win1: winA,
        tie,
        win2: winB,
      });

      if (error) throw error;
    }

    return true;
  } catch (error) {
    console.error('Upsert vote error:', error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { votes, scenario_index, model1, model2 } = body;

    if (!Array.isArray(votes)) {
      return NextResponse.json(
        { success: false, error: 'Votes must be an array' },
        { status: 400 }
      );
    }

    const ACCEPTABLE = new Set(['1', '2', 't', 'b']);
    const VOTE_MAP: Record<string, [number, number, number]> = {
      '1': [1, 0, 0], // Left wins
      '2': [0, 0, 1], // Right wins
      't': [0, 1, 0], // Tie
      'b': [0, 1, 0], // Both missed - treat as tie
    };

    if (!votes.every((v) => ACCEPTABLE.has(v))) {
      return NextResponse.json(
        { success: false, error: 'Invalid vote values' },
        { status: 400 }
      );
    }

    // Load criteria
    const criteria = await loadCriteria(CONSTITUTION_PATH);

    if (votes.length !== criteria.length) {
      return NextResponse.json(
        {
          success: false,
          error: `Must provide exactly ${criteria.length} votes, got ${votes.length}`,
        },
        { status: 400 }
      );
    }

    console.log(`[DEBUG] Saving ${votes.length} votes for scenario ${scenario_index}`);

    // Save all votes
    for (let i = 0; i < votes.length; i++) {
      const [win1, tie, win2] = VOTE_MAP[votes[i]];
      const success = await upsertVote(
        user.id,
        DATASET_PATH,
        scenario_index,
        CONSTITUTION_PATH,
        criteria[i],
        model1,
        model2,
        win1,
        tie,
        win2
      );

      if (!success) {
        return NextResponse.json(
          { success: false, error: `Failed to save vote for criterion ${i + 1}` },
          { status: 500 }
        );
      }
    }

    console.log('[DEBUG] All votes saved successfully');

    return NextResponse.json({ success: true, next_scenario: true });
  } catch (error: any) {
    console.error('Vote error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

