#!/usr/bin/env python3
"""
Flask Web App for EigenBench Human Judgements
Replaces UIJudge.py with web interface + Supabase auth + PostgreSQL
"""
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from functools import wraps
import os
import json
import random
from datetime import datetime, timedelta
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", os.urandom(24).hex())
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=7)

# Supabase setup
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Configuration
DEFAULT_CONSTITUTION = "Constitutions/Kindness.txt"
DEFAULT_RESPONSES = "Datasets/evaluations.json"
DEFAULT_DATASET_PATH = "Datasets/evaluations.json"
MAX_SCENARIOS = int(os.getenv("MAX_SCENARIOS", "50"))


# ============================================================================
# Authentication Decorators
# ============================================================================


def login_required(f):
    """Decorator to require authentication"""

    @wraps(f)
    def decorated_function(*args, **kwargs):
        if "user" not in session:
            return redirect(url_for("login"))
        return f(*args, **kwargs)

    return decorated_function


# ============================================================================
# Helper Functions
# ============================================================================


def normalize_pair(a: str, b: str) -> tuple:
    """Return (modelA, modelB, flipped). modelA <= modelB case-insensitively.
    flipped=True means original (a,b) was reversed."""
    if a.lower() <= b.lower():
        return a, b, False
    else:
        return b, a, True


def load_criteria(path: str) -> list:
    """Load criteria from constitution file"""
    full_path = os.path.join(os.path.dirname(__file__), "..", path)
    with open(full_path, "r", encoding="utf-8") as f:
        return [line.strip() for line in f.read().splitlines() if line.strip()]


def load_responses(path: str) -> list:
    """Load scenario responses from JSON"""
    full_path = os.path.join(os.path.dirname(__file__), "..", path)
    with open(full_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError("Responses file must be a list of scenario objects")
    return data


def get_user_progress(user_id: str, constitution_path: str, dataset_path: str) -> dict:
    """Get user's judging progress from Supabase"""
    try:
        # Get all judged scenarios for this user/constitution/dataset combo
        response = (
            supabase.table("human_judgements")
            .select("scenario_index")
            .eq("user_id", user_id)
            .eq("constitution_path", constitution_path)
            .eq("dataset_path", dataset_path)
            .execute()
        )

        judged_scenarios = set(row["scenario_index"] for row in response.data)
        return {"judged_scenarios": list(judged_scenarios)}
    except Exception as e:
        print(f"Error getting progress: {e}")
        return {"judged_scenarios": []}


def upsert_vote(
    user_id: str,
    dataset_path: str,
    scenario_index: int,
    constitution_path: str,
    criterion: str,
    m1: str,
    m2: str,
    win1: int,
    tie: int,
    win2: int,
) -> bool:
    """Insert or update vote in Supabase"""
    try:
        # Normalize pair
        modelA, modelB, flipped = normalize_pair(m1, m2)
        winA, winB = (win1, win2) if not flipped else (win2, win1)

        # Check if record exists
        existing = (
            supabase.table("human_judgements")
            .select("*")
            .eq("user_id", user_id)
            .eq("dataset_path", dataset_path)
            .eq("scenario_index", scenario_index)
            .eq("constitution_path", constitution_path)
            .eq("criterion", criterion)
            .eq("model1", modelA)
            .eq("model2", modelB)
            .execute()
        )

        if existing.data:
            # Update existing record
            old_win1 = existing.data[0]["win1"]
            old_tie = existing.data[0]["tie"]
            old_win2 = existing.data[0]["win2"]

            supabase.table("human_judgements").update(
                {
                    "win1": old_win1 + winA,
                    "tie": old_tie + tie,
                    "win2": old_win2 + winB,
                    "updated_at": datetime.utcnow().isoformat(),
                }
            ).eq("id", existing.data[0]["id"]).execute()
        else:
            # Insert new record
            supabase.table("human_judgements").insert(
                {
                    "user_id": user_id,
                    "dataset_path": dataset_path,
                    "scenario_index": scenario_index,
                    "constitution_path": constitution_path,
                    "criterion": criterion,
                    "model1": modelA,
                    "model2": modelB,
                    "win1": winA,
                    "tie": tie,
                    "win2": winB,
                }
            ).execute()

        return True
    except Exception as e:
        print(f"Error upserting vote: {e}")
        return False


# ============================================================================
# Routes
# ============================================================================


@app.route("/")
def index():
    """Redirect to judge or login"""
    if "user" in session:
        return redirect(url_for("judge"))
    return redirect(url_for("login"))


@app.route("/login", methods=["GET", "POST"])
def login():
    """Login page with Supabase authentication"""
    if request.method == "POST":
        data = request.get_json()
        email = data.get("email")
        password = data.get("password")

        try:
            # Authenticate with Supabase
            auth_response = supabase.auth.sign_in_with_password(
                {"email": email, "password": password}
            )

            # Store user info in session
            session.permanent = True
            session["user"] = {
                "id": auth_response.user.id,
                "email": auth_response.user.email,
            }
            session["access_token"] = auth_response.session.access_token

            return jsonify({"success": True, "redirect": url_for("judge")})
        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 401

    return render_template("login.html")


@app.route("/signup", methods=["POST"])
def signup():
    """Sign up new user with Supabase"""
    data = request.get_json()
    email = data.get("email")
    password = data.get("password")

    try:
        # Sign up with Supabase
        auth_response = supabase.auth.sign_up({"email": email, "password": password})

        return jsonify(
            {
                "success": True,
                "message": "Account created! Please check your email to verify.",
            }
        )
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400


@app.route("/logout")
def logout():
    """Logout current user"""
    try:
        if "access_token" in session:
            supabase.auth.sign_out()
    except:
        pass

    session.clear()
    return redirect(url_for("login"))


@app.route("/judge")
@login_required
def judge():
    """Main judging interface"""
    # Get constitution and dataset from query params or use defaults
    constitution_path = request.args.get("constitution", DEFAULT_CONSTITUTION)
    dataset_path = request.args.get("dataset", DEFAULT_DATASET_PATH)

    # Store in session for API calls
    session["constitution_path"] = constitution_path
    session["dataset_path"] = dataset_path

    return render_template(
        "judge.html",
        user_email=session["user"]["email"],
        constitution=constitution_path,
    )


@app.route("/api/init", methods=["GET"])
@login_required
def api_init():
    """Initialize judging session - load data and get progress"""
    try:
        constitution_path = session.get("constitution_path", DEFAULT_CONSTITUTION)
        dataset_path = session.get("dataset_path", DEFAULT_DATASET_PATH)
        responses_path = request.args.get("responses", DEFAULT_RESPONSES)

        print(f"[DEBUG] Loading constitution from: {constitution_path}")
        print(f"[DEBUG] Loading responses from: {responses_path}")

        # Load criteria and responses
        criteria = load_criteria(constitution_path)
        print(f"[DEBUG] Loaded {len(criteria)} criteria")

        all_responses = load_responses(responses_path)
        print(f"[DEBUG] Loaded {len(all_responses)} scenarios total")

        # Limit to first MAX_SCENARIOS scenarios
        all_responses = all_responses[:MAX_SCENARIOS]
        print(f"[DEBUG] Limited to first {len(all_responses)} scenarios")

        # Get user progress
        user_id = session["user"]["id"]
        progress = get_user_progress(user_id, constitution_path, dataset_path)
        print(
            f"[DEBUG] User has completed {len(progress['judged_scenarios'])} scenarios"
        )

        # Filter out completed scenarios - only include first MAX_SCENARIOS
        judged = set(progress["judged_scenarios"])
        # Create list of indices for scenarios that haven't been judged yet
        remaining_indices = [
            i
            for i in range(len(all_responses))
            if all_responses[i].get("scenario_index", i) not in judged
        ]

        print(
            f"[DEBUG] Found {len(remaining_indices)} remaining scenarios (not yet judged)"
        )

        # Don't shuffle - keep in order
        # random.shuffle(remaining_indices)

        # Store ONLY indices and metadata in session (not the full responses!)
        session["scenario_order"] = remaining_indices
        session["criteria"] = criteria
        session["responses_path"] = responses_path  # Store path, not data
        session["current_position"] = 0

        print(f"[DEBUG] Returning {len(remaining_indices)} remaining scenarios")

        return jsonify(
            {
                "success": True,
                "total_scenarios": len(remaining_indices),
                "criteria_count": len(criteria),
                "completed_scenarios": len(judged),
            }
        )
    except Exception as e:
        import traceback

        error_details = traceback.format_exc()
        print(f"[ERROR] Failed to initialize: {error_details}")
        return (
            jsonify(
                {"success": False, "error": f"{str(e)} - Check Flask logs for details"}
            ),
            500,
        )


@app.route("/api/next_scenario", methods=["GET"])
@login_required
def api_next_scenario():
    """Get next scenario to judge"""
    try:
        order = session.get("scenario_order", [])
        pos = session.get("current_position", 0)
        criteria = session.get("criteria", [])
        responses_path = session.get("responses_path", DEFAULT_RESPONSES)

        if pos >= len(order):
            return jsonify({"success": True, "complete": True})

        # Reload responses from disk (can't store in session - too big!)
        all_responses = load_responses(responses_path)

        # Get current scenario
        scenario_idx = order[pos]
        scenario = all_responses[scenario_idx]

        # Random pair of models
        responses_dict = scenario.get("responses", {})
        if len(responses_dict) < 2:
            # Skip scenario with insufficient responses
            session["current_position"] = pos + 1
            return api_next_scenario()

        models = list(responses_dict.keys())
        selected_models = random.sample(models, k=2)

        # Store current state (minimal data only)
        session["current_scenario"] = {
            "index": scenario.get("scenario_index", scenario_idx),
            "text": scenario.get("scenario", ""),
            "models": selected_models,
            "responses": [responses_dict[m] for m in selected_models],
        }
        session["current_criterion_idx"] = 0

        return jsonify(
            {
                "success": True,
                "complete": False,
                "scenario": session["current_scenario"]["text"],
                "response1": session["current_scenario"]["responses"][0],
                "response2": session["current_scenario"]["responses"][1],
                "criteria": criteria,  # Return all criteria at once
                "criterion_total": len(criteria),
                "scenario_number": pos + 1,
                "scenario_total": len(order),
            }
        )
    except Exception as e:
        import traceback

        print(f"[ERROR] Failed to load scenario: {traceback.format_exc()}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/vote", methods=["POST"])
@login_required
def api_vote():
    """Record all votes for current scenario and move to next"""
    try:
        data = request.get_json()
        votes = data.get("votes")  # Array of 8 choices: ['1', 't', '2', 'b', ...]

        if not isinstance(votes, list):
            return jsonify({"success": False, "error": "Votes must be an array"}), 400

        ACCEPTABLE = {"1", "2", "t", "b"}  # Added 'b' for both-missed
        VOTE_MAP = {
            "1": (1, 0, 0),  # Left wins
            "2": (0, 0, 1),  # Right wins
            "t": (0, 1, 0),  # Tie
            "b": (0, 1, 0),  # Both missed - treat as tie for now
        }

        if not all(v in ACCEPTABLE for v in votes):
            return jsonify({"success": False, "error": "Invalid vote values"}), 400

        # Get current state
        user_id = session["user"]["id"]
        constitution_path = session.get("constitution_path")
        dataset_path = session.get("dataset_path")
        criteria = session.get("criteria", [])
        current_scenario = session.get("current_scenario")

        if not current_scenario:
            return jsonify({"success": False, "error": "No active scenario"}), 400

        if len(votes) != len(criteria):
            return (
                jsonify(
                    {
                        "success": False,
                        "error": f"Must provide exactly {len(criteria)} votes, got {len(votes)}",
                    }
                ),
                400,
            )

        print(
            f"[DEBUG] Saving {len(votes)} votes for scenario {current_scenario['index']}"
        )

        # Save all votes
        for i, choice in enumerate(votes):
            win1, tie, win2 = VOTE_MAP[choice]
            success = upsert_vote(
                user_id=user_id,
                dataset_path=dataset_path,
                scenario_index=current_scenario["index"],
                constitution_path=constitution_path,
                criterion=criteria[i],
                m1=current_scenario["models"][0],
                m2=current_scenario["models"][1],
                win1=win1,
                tie=tie,
                win2=win2,
            )
            if not success:
                return (
                    jsonify(
                        {
                            "success": False,
                            "error": f"Failed to save vote for criterion {i+1}",
                        }
                    ),
                    500,
                )

        # Move to next scenario (scenario now complete)
        session["current_position"] = session.get("current_position", 0) + 1

        print(f"[DEBUG] All votes saved successfully, moving to next scenario")

        return jsonify({"success": True, "next_scenario": True})

    except Exception as e:
        import traceback

        print(f"[ERROR] Failed to save votes: {traceback.format_exc()}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/complete")
@login_required
def complete():
    """Completion page"""
    return render_template("complete.html", user_email=session["user"]["email"])


# ============================================================================
# Error Handlers
# ============================================================================


@app.errorhandler(404)
def not_found(e):
    return render_template("login.html"), 404


@app.errorhandler(500)
def server_error(e):
    return jsonify({"error": "Internal server error"}), 500


# ============================================================================
# Main
# ============================================================================

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=8000)
