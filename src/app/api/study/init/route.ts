import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { readFile } from 'fs/promises';
import path from 'path';

const MAX_SCENARIOS = parseInt(process.env.MAX_SCENARIOS || '20');
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

async function loadResponses(responsesPath: string) {
  const fullPath = path.join(process.cwd(), 'Eigenbench_UI_4', responsesPath);
  const content = await readFile(fullPath, 'utf-8');
  return JSON.parse(content);
}

async function getUserProgress(
  userId: string,
  constitutionPath: string,
  datasetPath: string
): Promise<number[]> {
  const { data, error } = await supabase
    .from('human_judgements')
    .select('scenario_index')
    .eq('user_id', userId)
    .eq('constitution_path', constitutionPath)
    .eq('dataset_path', datasetPath);

  if (error) {
    console.error('Error getting progress:', error);
    return [];
  }

  const judgedScenarios = new Set(data.map((row) => row.scenario_index));
  return Array.from(judgedScenarios);
}

export async function GET(request: NextRequest) {
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

    // Load criteria and responses
    const criteria = await loadCriteria(CONSTITUTION_PATH);
    const allResponses = await loadResponses(DATASET_PATH);

    // Limit to first MAX_SCENARIOS
    const limitedResponses = allResponses.slice(0, MAX_SCENARIOS);

    // Get user progress
    const judgedScenarios = await getUserProgress(
      user.id,
      CONSTITUTION_PATH,
      DATASET_PATH
    );

    // Filter out completed scenarios
    const remainingIndices = limitedResponses
      .map((_: any, index: number) => index)
      .filter((index: number) => {
        const scenarioIndex = limitedResponses[index].scenario_index ?? index;
        return !judgedScenarios.includes(scenarioIndex);
      });

    return NextResponse.json({
      success: true,
      total_scenarios: remainingIndices.length,
      criteria_count: criteria.length,
      completed_scenarios: judgedScenarios.length,
      criteria,
    });
  } catch (error: any) {
    console.error('Init error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

