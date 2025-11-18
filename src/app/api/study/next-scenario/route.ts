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

    const url = new URL(request.url);
    const currentPosition = parseInt(url.searchParams.get('position') || '0');

    // Load data
    const criteria = await loadCriteria(CONSTITUTION_PATH);
    const allResponses = await loadResponses(DATASET_PATH);
    const limitedResponses = allResponses.slice(0, MAX_SCENARIOS);

    // Get user progress
    const judgedScenarios = await getUserProgress(
      user.id,
      CONSTITUTION_PATH,
      DATASET_PATH
    );

    // Filter remaining scenarios
    const remainingIndices = limitedResponses
      .map((_: any, index: number) => index)
      .filter((index: number) => {
        const scenarioIndex = limitedResponses[index].scenario_index ?? index;
        return !judgedScenarios.includes(scenarioIndex);
      });

    if (currentPosition >= remainingIndices.length) {
      return NextResponse.json({
        success: true,
        complete: true,
      });
    }

    const scenarioIdx = remainingIndices[currentPosition];
    const scenario = limitedResponses[scenarioIdx];

    // Random pair of models
    const responsesDict = scenario.responses || {};
    const models = Object.keys(responsesDict);

    if (models.length < 2) {
      // Skip scenario with insufficient responses
      return NextResponse.json({
        success: true,
        complete: false,
        skip: true,
        nextPosition: currentPosition + 1,
      });
    }

    // Select random pair
    const shuffled = models.sort(() => Math.random() - 0.5);
    const selectedModels = shuffled.slice(0, 2);

    return NextResponse.json({
      success: true,
      complete: false,
      scenario: scenario.scenario || '',
      scenario_index: scenario.scenario_index ?? scenarioIdx,
      response1: responsesDict[selectedModels[0]],
      response2: responsesDict[selectedModels[1]],
      model1: selectedModels[0],
      model2: selectedModels[1],
      criteria,
      criterion_total: criteria.length,
      scenario_number: currentPosition + 1,
      scenario_total: remainingIndices.length,
    });
  } catch (error: any) {
    console.error('Next scenario error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

