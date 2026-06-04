import json
from datetime import datetime

def run_foresight_analysis(current_path: str, task_context: dict, recent_changes: list = None):
    """
    Advanced foresight engine - predicts gaps, risks, and proactive improvements.
    """
    instructions = get_effective_instructions(current_path)
    analysis = {
        "timestamp": datetime.now().isoformat(),
        "path": current_path,
        "gaps": [],
        "risks": [],
        "proactive_suggestions": [],
        "confidence": 0.0
    }
    
    task_str = str(task_context).lower()
    
    # Gap Detection
    if "error" not in task_str and "except" not in task_str:
        analysis["gaps"].append({
            "type": "error_handling",
            "severity": "high",
            "description": "Missing error handling patterns",
            "recommendation": "Add structured try/except with logging per instructions"
        })
    
    if "log" not in task_str:
        analysis["gaps"].append({
            "type": "observability",
            "severity": "medium",
            "description": "Missing logging",
            "recommendation": "Add structured logging"
        })
    
    # Risk Forecasting
    if "database" in task_str or "query" in task_str:
        analysis["risks"].append({
            "type": "security",
            "probability": "medium",
            "description": "Potential SQL injection or credential exposure",
            "recommendation": "Use parameterized queries + run safety audit"
        })
    
    # Proactive suggestions from patterns
    analysis["proactive_suggestions"] = [
        "Consider adding rate limiting for public endpoints",
        "Add integration test coverage for this change"
    ]
    
    analysis["confidence"] = 0.75
    
    # Save to knowledge
    with open(".ai/knowledge/anticipated-gaps.md", "a") as f:
        f.write(f"\n## Analysis {analysis['timestamp']}\n{json.dumps(analysis, indent=2)}\n")
    
    return analysis
