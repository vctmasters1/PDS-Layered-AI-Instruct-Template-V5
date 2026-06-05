#!/usr/bin/env python3
"""Local multi-method ATS-style scoring for resume vs job listing.

Adapted from K:\\Resume\\Tools\\ats_multi_score.py.
Added --name parameter so it works for any user, not just VictorMasters.

Outputs:
- Current/<listing>/ats-score-XXX.md
- Current/<listing>/ats-score-XXX.json
"""

from __future__ import annotations

import argparse
import json
import math
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

MONTH_NAME = r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
DATE_RANGE_MONTH = re.compile(rf"\b{MONTH_NAME}\s+\d{{4}}\s*[\-\u2013]\s*(?:Present|{MONTH_NAME}\s+\d{{4}})\b", re.IGNORECASE)
DATE_RANGE_NUMERIC = re.compile(r"\b\d{2}/\d{4}\s*[\-\u2013]\s*(?:Present|\d{2}/\d{4})\b", re.IGNORECASE)

REQUIRED_HEADINGS = [
    "Professional Summary",
    "Professional Experience",
    "Education",
    "Technical Skills",
    "Key Achievements",
]

SKILL_MAP: Dict[str, List[str]] = {
    "LabVIEW": ["labview"],
    "National Instruments": ["national instruments", "ni"],
    "DAQ": ["data acquisition", "daq"],
    "PXI": ["pxi"],
    "cRIO": ["crio", "compactrio"],
    "PLC": ["plc", "programmable logic controller"],
    "Allen-Bradley": ["allen-bradley", "allen bradley"],
    "EtherNet/IP": ["ethernet/ip", "ethernet ip"],
    "Modbus": ["modbus"],
    "Serial": ["serial", "rs-232", "rs-485", "rs232", "rs485"],
    "TCP/IP": ["tcp/ip", "tcp ip"],
    "SQL": ["sql"],
    "Git/SVN": ["git", "svn", "version control"],
    "Automated Test Systems": ["automated test systems", "test and measurement", "automated test"],
    "Electrical Schematics": ["electrical schematics", "schematic", "machine i/o", "machine io"],
    "Troubleshooting": ["troubleshooting", "debug", "diagnos"],
    "Pneumatics": ["pneumatic", "pneumatics"],
    "FAT": ["factory acceptance testing", "fat"],
    "SAT": ["site acceptance testing", "sat"],
    "Commissioning": ["commissioning"],
    "SCADA": ["scada", "supervisory control and data acquisition"],
    "Motion Systems": ["motion systems", "motion control"],
    "Safety Hardware": ["safety hardware", "safety circuits"],
}

STOPWORDS = {
    "the", "and", "for", "with", "from", "that", "this", "you", "your", "are", "was", "were",
    "have", "has", "had", "will", "their", "into", "through", "used", "using", "all", "any", "not",
    "job", "role", "work", "works", "team", "teams", "system", "systems", "support", "required", "preferred",
    "ability", "strong", "experience", "years", "year", "plus", "including", "across", "used", "build",
}


@dataclass
class SkillMatch:
    skill: str
    bucket: str
    matched: bool
    evidence: str
    weight: float


def normalize_text(text: str) -> str:
    text = text.lower()
    text = text.replace("\u2011", "-").replace("\u2013", "-").replace("\u2014", "-")
    text = re.sub(r"[^a-z0-9/\-\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def tokenize(text: str) -> List[str]:
    tokens = re.findall(r"[a-z0-9][a-z0-9/\-]*", normalize_text(text))
    return [t for t in tokens if t not in STOPWORDS and len(t) > 1]


def cosine_similarity(a: Counter, b: Counter) -> float:
    if not a or not b:
        return 0.0
    shared = set(a) & set(b)
    num = sum(a[t] * b[t] for t in shared)
    den_a = math.sqrt(sum(v * v for v in a.values()))
    den_b = math.sqrt(sum(v * v for v in b.values()))
    if den_a == 0 or den_b == 0:
        return 0.0
    return num / (den_a * den_b)


def jaccard_similarity(a_tokens: List[str], b_tokens: List[str]) -> float:
    a_set = set(a_tokens)
    b_set = set(b_tokens)
    if not a_set or not b_set:
        return 0.0
    return len(a_set & b_set) / len(a_set | b_set)


def split_jd_buckets(jd_text: str) -> Tuple[str, str, str]:
    text = jd_text
    lower = jd_text.lower()
    req_start = lower.find("required qualifications")
    pref_start = lower.find("preferred qualifications")
    required = ""
    preferred = ""
    body = text
    if req_start != -1:
        if pref_start != -1 and pref_start > req_start:
            required = text[req_start:pref_start]
        else:
            required = text[req_start:]
    if pref_start != -1:
        preferred = text[pref_start:]
    return body, required, preferred


def match_skills(jd_text: str, resume_text: str) -> List[SkillMatch]:
    _, required, preferred = split_jd_buckets(jd_text)
    jd_norm = normalize_text(jd_text)
    req_norm = normalize_text(required)
    pref_norm = normalize_text(preferred)
    resume_norm = normalize_text(resume_text)
    matches: List[SkillMatch] = []
    for canonical, aliases in SKILL_MAP.items():
        in_jd = any(alias in jd_norm for alias in aliases)
        if not in_jd:
            continue
        in_required = any(alias in req_norm for alias in aliases)
        in_preferred = any(alias in pref_norm for alias in aliases)
        bucket = "required" if in_required else "preferred" if in_preferred else "general"
        weight = 2.0 if bucket == "required" else 1.2 if bucket == "preferred" else 1.0
        matched_alias = next((alias for alias in aliases if alias in resume_norm), "")
        matches.append(SkillMatch(skill=canonical, bucket=bucket, matched=bool(matched_alias), evidence=matched_alias, weight=weight))
    return matches


def score_keywords(matches: List[SkillMatch]) -> Tuple[float, List[SkillMatch], List[SkillMatch]]:
    if not matches:
        return 0.0, [], []
    total = sum(m.weight for m in matches)
    covered = sum(m.weight for m in matches if m.matched)
    score = 100.0 * covered / total if total else 0.0
    missing = sorted([m for m in matches if not m.matched], key=lambda x: x.weight, reverse=True)
    present = sorted([m for m in matches if m.matched], key=lambda x: x.weight, reverse=True)
    return score, present, missing


def score_semantic(jd_text: str, resume_text: str) -> Tuple[float, float, float]:
    jd_tokens = tokenize(jd_text)
    resume_tokens = tokenize(resume_text)
    jac = jaccard_similarity(jd_tokens, resume_tokens)
    cos = cosine_similarity(Counter(jd_tokens), Counter(resume_tokens))
    semantic = (0.45 * jac + 0.55 * cos) * 100.0
    return semantic, jac * 100.0, cos * 100.0


def score_pyresparser_style_overlap(jd_text: str, resume_text: str) -> float:
    jd_norm = normalize_text(jd_text)
    resume_norm = normalize_text(resume_text)
    jd_skills = set()
    resume_skills = set()
    for canonical, aliases in SKILL_MAP.items():
        if any(alias in jd_norm for alias in aliases):
            jd_skills.add(canonical)
        if any(alias in resume_norm for alias in aliases):
            resume_skills.add(canonical)
    if not jd_skills:
        return 0.0
    common = jd_skills.intersection(resume_skills)
    return 100.0 * len(common) / len(jd_skills)


def score_format(resume_text: str) -> Tuple[float, List[str], List[str]]:
    checks_ok: List[str] = []
    checks_fail: List[str] = []
    for h in REQUIRED_HEADINGS:
        if re.search(rf"^##\s+{re.escape(h)}\s*$", resume_text, re.MULTILINE):
            checks_ok.append(f"Heading present: {h}")
        else:
            checks_fail.append(f"Missing standard heading: {h}")
    table_lines = [ln for ln in resume_text.splitlines() if re.match(r"^\s*\|.*\|\s*$", ln)]
    if table_lines:
        checks_fail.append("Detected markdown table-like lines")
    else:
        checks_ok.append("No markdown table blocks detected")
    month_dates = DATE_RANGE_MONTH.findall(resume_text)
    numeric_dates = DATE_RANGE_NUMERIC.findall(resume_text)
    has_month = bool(month_dates)
    has_numeric = bool(numeric_dates)
    if has_month and has_numeric:
        checks_fail.append("Mixed date formats detected")
    elif has_month or has_numeric:
        checks_ok.append("Consistent parseable date format detected")
    else:
        checks_fail.append("No parseable ATS-friendly date ranges detected")
    if re.search(r"[\U0001F300-\U0001FAFF]", resume_text):
        checks_fail.append("Emoji/icon characters detected")
    else:
        checks_ok.append("No emoji/icon characters detected")
    total_checks = len(checks_ok) + len(checks_fail)
    score = 100.0 * len(checks_ok) / total_checks if total_checks else 0.0
    return score, checks_ok, checks_fail


def clamp_score(value: float) -> float:
    return max(0.0, min(100.0, value))


def extract_listing_title(jd_text: str) -> str:
    for line in jd_text.splitlines():
        clean = line.strip()
        if clean:
            return clean
    return ""


def score_title_alignment(jd_text: str, resume_text: str) -> float:
    title = extract_listing_title(jd_text)
    if not title:
        return 70.0
    title_norm = normalize_text(title)
    resume_norm = normalize_text(resume_text)
    if title_norm and title_norm in resume_norm:
        return 100.0
    title_tokens = [t for t in tokenize(title) if len(t) > 2]
    if not title_tokens:
        return 70.0
    overlap = sum(1 for t in title_tokens if t in resume_norm)
    ratio = overlap / len(title_tokens)
    if ratio >= 0.9:
        return 90.0
    if ratio >= 0.6:
        return 75.0
    if ratio >= 0.3:
        return 55.0
    return 30.0


def score_requirement_coverage(matches: List[SkillMatch], keyword_score: float) -> float:
    required = [m for m in matches if m.bucket == "required"]
    if not required:
        return keyword_score
    covered = sum(1 for m in required if m.matched)
    return 100.0 * covered / len(required)


def score_acronym_dual_coverage(jd_text: str, resume_text: str) -> float:
    jd_norm = normalize_text(jd_text)
    resume_norm = normalize_text(resume_text)
    dual_pairs = 0
    dual_covered = 0
    for aliases in SKILL_MAP.values():
        if len(aliases) < 2:
            continue
        short_aliases = [a for a in aliases if len(a) <= 6 and " " not in a and "/" not in a]
        long_aliases = [a for a in aliases if len(a) > 6 or " " in a or "/" in a]
        if not short_aliases or not long_aliases:
            continue
        in_jd_short = any(a in jd_norm for a in short_aliases)
        in_jd_long = any(a in jd_norm for a in long_aliases)
        if not (in_jd_short or in_jd_long):
            continue
        dual_pairs += 1
        has_short = any(a in resume_norm for a in short_aliases)
        has_long = any(a in resume_norm for a in long_aliases)
        if has_short and has_long:
            dual_covered += 1
    if dual_pairs == 0:
        return 80.0
    return 100.0 * dual_covered / dual_pairs


def score_heading_compliance(resume_text: str) -> float:
    patterns = [
        r"^##\s+(Professional\s+Experience|Work\s+Experience)\s*$",
        r"^##\s+Education\s*$",
        r"^##\s+(Technical\s+Skills|Skills)\s*$",
        r"^##\s+Professional\s+Summary\s*$",
    ]
    hits = sum(1 for p in patterns if re.search(p, resume_text, re.IGNORECASE | re.MULTILINE))
    return 100.0 * hits / len(patterns)


def score_date_parseability(resume_text: str) -> float:
    month_dates = DATE_RANGE_MONTH.findall(resume_text)
    numeric_dates = DATE_RANGE_NUMERIC.findall(resume_text)
    has_month = bool(month_dates)
    has_numeric = bool(numeric_dates)
    if has_month and has_numeric:
        return 65.0
    if has_month or has_numeric:
        return 100.0
    return 0.0


def score_layout_safety(resume_text: str) -> float:
    has_table_lines = bool(re.search(r"^\s*\|.*\|\s*$", resume_text, re.MULTILINE))
    return 0.0 if has_table_lines else 100.0


def score_symbol_safety(resume_text: str) -> float:
    return 0.0 if re.search(r"[\U0001F300-\U0001FAFF]", resume_text) else 100.0


def score_measurable_density(resume_text: str) -> float:
    bullets = [ln.strip() for ln in resume_text.splitlines() if re.match(r"^\s*[-*]\s+", ln)]
    if not bullets:
        return 40.0
    measurable = [b for b in bullets if re.search(r"\d", b)]
    return 100.0 * len(measurable) / len(bullets)


def score_context_quality(resume_text: str, matches: List[SkillMatch]) -> float:
    bullets = [ln.strip() for ln in resume_text.splitlines() if re.match(r"^\s*[-*]\s+", ln)]
    if not bullets:
        return 50.0
    aliases = [m.evidence for m in matches if m.matched and m.evidence]
    if not aliases:
        return 40.0
    contextual_hits = sum(1 for bullet in bullets if any(a in normalize_text(bullet) for a in aliases))
    return 100.0 * contextual_hits / len(bullets)


def score_action_verb_quality(resume_text: str) -> float:
    bullets = [ln.strip() for ln in resume_text.splitlines() if re.match(r"^\s*[-*]\s+", ln)]
    if not bullets:
        return 40.0
    strong_verbs = {
        "designed", "delivered", "built", "implemented", "improved", "increased", "reduced",
        "led", "managed", "developed", "optimized", "automated", "executed", "launched",
        "streamlined", "coordinated", "analyzed", "resolved", "commissioned", "validated",
    }
    verb_hits = 0
    for bullet in bullets:
        text = re.sub(r"^\s*[-*]\s+", "", bullet).strip().lower()
        first = re.split(r"\W+", text)[0] if text else ""
        if first in strong_verbs:
            verb_hits += 1
    return 100.0 * verb_hits / len(bullets)


def score_platform_behavior(jd_text: str) -> Tuple[float, float, float]:
    jd_norm = normalize_text(jd_text)
    p_general = 85.0
    p_targeted = 70.0
    if "greenhouse" in jd_norm:
        p_targeted = 78.0
    elif "taleo" in jd_norm:
        p_targeted = 76.0
    elif "workday" in jd_norm or "icims" in jd_norm or "lever" in jd_norm:
        p_targeted = 74.0
    platform = 0.60 * p_general + 0.40 * p_targeted
    return platform, p_general, p_targeted


def score_v2026(jd_text, resume_text, keyword_score, matches):
    title_score = score_title_alignment(jd_text, resume_text)
    req_score = score_requirement_coverage(matches, keyword_score)
    acronym_score = score_acronym_dual_coverage(jd_text, resume_text)
    relevance = clamp_score(0.35 * keyword_score + 0.35 * title_score + 0.20 * req_score + 0.10 * acronym_score)
    heading_score = score_heading_compliance(resume_text)
    date_score = score_date_parseability(resume_text)
    layout_score = score_layout_safety(resume_text)
    file_safety = 100.0
    symbol_score = score_symbol_safety(resume_text)
    parseability = clamp_score(0.25 * heading_score + 0.25 * date_score + 0.20 * layout_score + 0.15 * file_safety + 0.15 * symbol_score)
    measurable_score = score_measurable_density(resume_text)
    context_score = score_context_quality(resume_text, matches)
    verb_score = score_action_verb_quality(resume_text)
    evidence = clamp_score(0.50 * measurable_score + 0.30 * context_score + 0.20 * verb_score)
    platform, p_general, p_targeted = score_platform_behavior(jd_text)
    critical_failures: List[str] = []
    if layout_score < 100.0:
        critical_failures.append("tables_or_columns_detected")
    if heading_score < 60.0:
        critical_failures.append("major_headings_missing")
    if date_score <= 0.0:
        critical_failures.append("date_parseability_invalid")
    email_match = re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", resume_text)
    top_chunk = "\n".join(resume_text.splitlines()[:12])
    if email_match and not re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", top_chunk):
        critical_failures.append("contact_info_not_near_top")
    gate = 1.0 if len(critical_failures) == 0 else 0.85 if len(critical_failures) == 1 else 0.70
    pre_gate = 0.45 * relevance + 0.30 * parseability + 0.20 * evidence + 0.05 * platform
    final_score = clamp_score(pre_gate * gate)
    return {
        "final": round(final_score, 2), "gate_parse": round(gate, 2),
        "relevance": round(relevance, 2), "parseability": round(parseability, 2),
        "evidence": round(evidence, 2), "platform": round(platform, 2),
        "title_alignment": round(title_score, 2), "requirements_coverage": round(req_score, 2),
        "acronym_dual_coverage": round(acronym_score, 2), "heading_compliance": round(heading_score, 2),
        "date_parseability": round(date_score, 2), "layout_safety": round(layout_score, 2),
        "symbol_safety": round(symbol_score, 2), "measurable_density": round(measurable_score, 2),
        "context_quality": round(context_score, 2), "action_verb_quality": round(verb_score, 2),
        "platform_general": round(p_general, 2), "platform_targeted": round(p_targeted, 2),
    }, critical_failures


def build_report(listing, pass_id, resume_file_name, keyword_score, semantic_score, format_score,
                 pyresparser_overlap_score, jaccard_score, cosine_score, present, missing,
                 checks_ok, checks_fail, v2026_scores, v2026_critical_failures):
    composite = 0.35 * keyword_score + 0.45 * semantic_score + 0.20 * format_score
    ensemble = 0.6 * composite + 0.4 * pyresparser_overlap_score

    def fmt_skill(m):
        return f"- {m.skill} ({m.bucket})"

    top_missing = "\n".join(fmt_skill(m) for m in missing[:12]) if missing else "- None"
    top_present = "\n".join(fmt_skill(m) for m in present[:12]) if present else "- None"
    ok_text = "\n".join(f"- {x}" for x in checks_ok) if checks_ok else "- None"
    fail_text = "\n".join(f"- {x}" for x in checks_fail) if checks_fail else "- None"
    v2026_fail_text = "\n".join(f"- {x}" for x in v2026_critical_failures) if v2026_critical_failures else "- None"

    md = f"""# ATS Multi-Score Report\n\nListing: {listing}\nPass: {pass_id}\nResume Source: {resume_file_name}\n\n## Legacy Scores\n- Ensemble Score: {ensemble:.1f}/100\n- Local Composite Score: {composite:.1f}/100\n- Keyword Coverage: {keyword_score:.1f}/100\n- Semantic Similarity: {semantic_score:.1f}/100\n- Format Compliance: {format_score:.1f}/100\n- Pyresparser-Style Skill Overlap: {pyresparser_overlap_score:.1f}/100\n\n## v2026 Scores\n- Final Score: {v2026_scores['final']:.1f}/100\n- Parse Gate: {v2026_scores['gate_parse']:.2f}\n- Relevance: {v2026_scores['relevance']:.1f}/100\n- Parseability: {v2026_scores['parseability']:.1f}/100\n- Evidence: {v2026_scores['evidence']:.1f}/100\n- Platform: {v2026_scores['platform']:.1f}/100\n\n## Score Comparison\n- Legacy Ensemble: {ensemble:.1f}/100\n- v2026 Final: {v2026_scores['final']:.1f}/100\n\n## Semantic Breakdown\n- Token Jaccard: {jaccard_score:.1f}/100\n- TF Cosine: {cosine_score:.1f}/100\n\n## Matched High-Value Keywords\n{top_present}\n\n## Missing / Weak Keywords\n{top_missing}\n\n## Format Checks Passed\n{ok_text}\n\n## Format Checks Failed\n{fail_text}\n\n## v2026 Critical Failures\n{v2026_fail_text}\n\n## Priority Fixes\n1. Add or strengthen the top 3 missing required keywords in context-rich bullets.\n2. If truthful, explicitly include missing tooling names in Technical Skills and one achievement bullet.\n3. Keep date format fully consistent and maintain standard ATS section headers.\n"""

    payload = {
        "listing": listing,
        "scores": {
            "ensemble": round(ensemble, 2), "composite": round(composite, 2),
            "keyword": round(keyword_score, 2), "semantic": round(semantic_score, 2),
            "format": round(format_score, 2), "pyresparser_skill_overlap": round(pyresparser_overlap_score, 2),
            "semantic_jaccard": round(jaccard_score, 2), "semantic_cosine": round(cosine_score, 2),
        },
        "scores_v2026": v2026_scores,
        "critical_failures_v2026": v2026_critical_failures,
        "matched_keywords": [m.skill for m in present],
        "missing_keywords": [{"skill": m.skill, "bucket": m.bucket, "weight": m.weight} for m in missing],
        "format": {"passed": checks_ok, "failed": checks_fail},
    }
    return md, payload


def get_latest_pass_resume(curr_dir: Path, name: str) -> Tuple[Path, str]:
    pattern = f"{name}-*.md"
    numbered = sorted(curr_dir.glob(pattern))
    if numbered:
        def pass_num(p: Path) -> int:
            m = re.search(rf"{re.escape(name)}-(\d{{3}})\.md$", p.name)
            return int(m.group(1)) if m else -1
        latest = sorted(numbered, key=pass_num)[-1]
        m = re.search(rf"{re.escape(name)}-(\d{{3}})\.md$", latest.name)
        return latest, m.group(1)
    legacy = curr_dir / f"{name}.md"
    if legacy.exists():
        return legacy, "000"
    raise FileNotFoundError(f"No resume source found in: {curr_dir}")


def get_resume_for_pass(curr_dir: Path, pass_id: str, name: str) -> Tuple[Path, str]:
    explicit = curr_dir / f"{name}-{pass_id}.md"
    if explicit.exists():
        return explicit, pass_id
    if pass_id == "000":
        legacy = curr_dir / f"{name}.md"
        if legacy.exists():
            return legacy, pass_id
    raise FileNotFoundError(f"Requested pass file not found: {explicit}")


def resolve_current_dir(listing: str, root: Path) -> Path:
    current_root = root / "Current"
    exact = current_root / listing
    if exact.exists():
        return exact
    exact_suffix_matches = []
    fuzzy_matches = []
    for child in current_root.iterdir():
        if not child.is_dir():
            continue
        if child.name == listing:
            exact_suffix_matches.append(child)
            continue
        stripped = re.sub(r"^\d{4}-", "", child.name)
        if stripped == listing:
            exact_suffix_matches.append(child)
            continue
        if stripped.startswith(f"{listing}-") or listing.startswith(f"{stripped}-"):
            fuzzy_matches.append(child)
    if len(exact_suffix_matches) == 1:
        return exact_suffix_matches[0]
    if len(exact_suffix_matches) > 1:
        raise FileNotFoundError(f"Multiple Current directories matched listing exactly: {listing}")
    matches = fuzzy_matches
    if not matches:
        return exact
    if len(matches) > 1:
        raise FileNotFoundError(f"Multiple Current directories matched listing: {listing}")
    return matches[0]


def run(listing: str, root: Path, name: str, pass_id: Optional[str] = None) -> Dict:
    listing_file = root / "Listings" / f"{listing}.md"
    curr_dir = resolve_current_dir(listing, root)
    if pass_id is None:
        resume_file, resolved_pass = get_latest_pass_resume(curr_dir, name)
    else:
        resume_file, resolved_pass = get_resume_for_pass(curr_dir, pass_id, name)
    out_md = curr_dir / f"ats-score-{resolved_pass}.md"
    out_json = curr_dir / f"ats-score-{resolved_pass}.json"

    if not listing_file.exists():
        raise FileNotFoundError(f"Listing file not found: {listing_file}")
    if not resume_file.exists():
        raise FileNotFoundError(f"Resume file not found: {resume_file}")

    jd_text = listing_file.read_text(encoding="utf-8")
    resume_text = resume_file.read_text(encoding="utf-8")

    matches = match_skills(jd_text, resume_text)
    keyword_score, present, missing = score_keywords(matches)
    semantic_score, jac, cos = score_semantic(jd_text, resume_text)
    pyresparser_overlap_score = score_pyresparser_style_overlap(jd_text, resume_text)
    format_score, checks_ok, checks_fail = score_format(resume_text)
    v2026_scores, v2026_critical_failures = score_v2026(
        jd_text=jd_text, resume_text=resume_text,
        keyword_score=keyword_score, matches=matches,
    )
    md_report, payload = build_report(
        listing=listing, pass_id=resolved_pass, resume_file_name=resume_file.name,
        keyword_score=keyword_score, semantic_score=semantic_score, format_score=format_score,
        pyresparser_overlap_score=pyresparser_overlap_score, jaccard_score=jac, cosine_score=cos,
        present=present, missing=missing, checks_ok=checks_ok, checks_fail=checks_fail,
        v2026_scores=v2026_scores, v2026_critical_failures=v2026_critical_failures,
    )
    out_md.write_text(md_report, encoding="utf-8")
    out_json.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Local ATS-style multi-method scoring")
    parser.add_argument("--listing", required=True, help="Listing slug (e.g. 'Acme-DataEngineer')")
    parser.add_argument("--root", default=".", help="Workspace root path (UserData/<username>/)")
    parser.add_argument("--pass", dest="pass_id", help="Pass id to score (e.g. 000, 001)")
    parser.add_argument("--name", default="VictorMasters", help="Resume name prefix (e.g. VictorMasters)")
    args = parser.parse_args()
    payload = run(args.listing, Path(args.root).resolve(), name=args.name, pass_id=args.pass_id)
    print(json.dumps(payload["scores"], indent=2))


if __name__ == "__main__":
    main()
