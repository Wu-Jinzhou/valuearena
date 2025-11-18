import { createClient } from "@supabase/supabase-js";

// Note: NEXT_PUBLIC_ prefix is required for client-side access in Next.js
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables. Please ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set in .env.local"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Types for our database
export interface HumanJudgement {
  id: string;
  user_id: string;
  dataset_path: string;
  scenario_index: number;
  constitution_path: string;
  criterion: string;
  model1: string;
  model2: string;
  win1: number;
  tie: number;
  win2: number;
  created_at: string;
  updated_at: string;
}
