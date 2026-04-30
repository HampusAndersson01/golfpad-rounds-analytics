from __future__ import annotations

import csv
import hashlib
import json
import logging
import math
import re
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Any, Iterable

import pandas as pd


LATEST_ROUNDS_ONLY = True
LATEST_ROUND_COUNT = 20

EXPORT_DIR = Path("export")
OUTPUT_DIR = Path("parsed_rounds")


logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
LOGGER = logging.getLogger("golfpad_parser")


def canonical_name(name: str) -> str:
    return re.sub(r"\s+", " ", str(name).strip().lower())


def canonical_columns(df: pd.DataFrame) -> dict[str, str]:
    return {canonical_name(col): col for col in df.columns}


def get_value(row: pd.Series, columns: dict[str, str], name: str, default: Any = None) -> Any:
    column = columns.get(canonical_name(name))
    if column is None:
        return default
    value = row.get(column, default)
    return default if is_blank(value) else value


def is_blank(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, float) and math.isnan(value):
        return True
    return str(value).strip() == ""


def clean_scalar(value: Any) -> Any:
    if is_blank(value):
        return None
    return str(value).strip()


def parse_number(value: Any) -> int | float | None:
    if is_blank(value):
        return None
    text = str(value).strip().replace(",", "")
    try:
        parsed = float(text)
    except ValueError:
        return None
    if math.isnan(parsed):
        return None
    if parsed.is_integer():
        return int(parsed)
    return parsed


def parse_bool(value: Any, default: bool | None = None) -> bool | None:
    if is_blank(value):
        return default
    text = str(value).strip().lower()
    if text in {"yes", "y", "true", "t", "1", "hit", "gir"}:
        return True
    if text in {"no", "n", "false", "f", "0", "miss"}:
        return False
    return default


def raw_record(row: pd.Series) -> dict[str, Any]:
    return {str(key): clean_scalar(value) for key, value in row.to_dict().items()}


def detect_delimiter(path: Path) -> str:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        sample = handle.read(4096)
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
        return dialect.delimiter
    except csv.Error:
        return ","


def read_export_csv(path: Path) -> pd.DataFrame:
    delimiter = detect_delimiter(path)
    LOGGER.info("Reading %s with delimiter %r", path.name, delimiter)
    return pd.read_csv(
        path,
        sep=delimiter,
        encoding="utf-8-sig",
        dtype=str,
        keep_default_na=False,
    )


def classify_csv(path: Path, df: pd.DataFrame) -> str:
    cols = set(canonical_columns(df))
    name = path.name.lower()
    if "shot number" in cols:
        return "shots"
    if "hole number" in cols and "total strokes" in cols:
        return "holes"
    if "gross score" in cols or "completed holes" in cols or "round" in name:
        return "rounds"
    return "metadata"


def discover_exports() -> tuple[dict[str, Path], dict[str, pd.DataFrame], list[Path]]:
    if not EXPORT_DIR.exists():
        raise FileNotFoundError(f"Missing export folder: {EXPORT_DIR}")

    classified_paths: dict[str, Path] = {}
    frames: dict[str, pd.DataFrame] = {}
    metadata_files: list[Path] = []

    for path in sorted(EXPORT_DIR.iterdir()):
        if path.is_dir():
            metadata_files.append(path)
            continue
        if path.suffix.lower() != ".csv":
            metadata_files.append(path)
            continue

        df = read_export_csv(path)
        kind = classify_csv(path, df)
        if kind == "metadata":
            metadata_files.append(path)
            continue
        if kind in classified_paths:
            raise ValueError(f"Multiple {kind} CSV files found: {classified_paths[kind].name}, {path.name}")
        classified_paths[kind] = path
        frames[kind] = df

    return classified_paths, frames, metadata_files


def identity_key_from_row(row: pd.Series, columns: dict[str, str], include_hole: bool = False) -> tuple[Any, ...]:
    key: list[Any] = [
        normalize_key(get_value(row, columns, "player name")),
        normalize_key(get_value(row, columns, "date")),
        normalize_key(get_value(row, columns, "course name")),
        normalize_key(get_value(row, columns, "tee name")),
    ]
    if include_hole:
        key.append(parse_number(get_value(row, columns, "hole number")))
    return tuple(key)


def normalize_key(value: Any) -> str:
    return "" if is_blank(value) else str(value).strip().casefold()


def shot_lookup_key(row: pd.Series, columns: dict[str, str]) -> tuple[Any, ...]:
    return (
        normalize_key(get_value(row, columns, "date")),
        normalize_key(get_value(row, columns, "course name")),
        parse_number(get_value(row, columns, "hole number")),
    )


def stable_round_id(row: pd.Series, columns: dict[str, str]) -> str:
    parts = [
        clean_scalar(get_value(row, columns, "player name")) or "",
        clean_scalar(get_value(row, columns, "date")) or "",
        clean_scalar(get_value(row, columns, "course name")) or "",
        clean_scalar(get_value(row, columns, "tee name")) or "",
        clean_scalar(get_value(row, columns, "start time")) or "",
    ]
    digest = hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()[:12]
    return f"golfpad_{digest}"


def score_to_par(total_strokes: Any, par: Any) -> int | float | None:
    strokes = parse_number(total_strokes)
    hole_par = parse_number(par)
    if strokes is None or hole_par is None:
        return None
    return strokes - hole_par


def slugify(value: Any) -> str:
    text = clean_scalar(value) or "unknown-course"
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-") or "unknown-course"


def output_path_for_round(row: pd.Series, columns: dict[str, str], used_names: Counter[str]) -> Path:
    date = clean_scalar(get_value(row, columns, "date")) or "unknown-date"
    course = slugify(get_value(row, columns, "course name"))
    base = f"{date}_{course}"
    used_names[base] += 1
    suffix = "" if used_names[base] == 1 else f"_{used_names[base]}"
    return OUTPUT_DIR / f"{base}{suffix}.json"


def sorted_latest_rounds(rounds_df: pd.DataFrame, round_cols: dict[str, str]) -> pd.DataFrame:
    date_col = round_cols.get("date")
    start_col = round_cols.get("start time")
    if date_col is None:
        LOGGER.warning("Rounds file has no date column; keeping source order")
        return rounds_df.head(LATEST_ROUND_COUNT) if LATEST_ROUNDS_ONLY else rounds_df

    sortable = rounds_df.copy()
    time_values = sortable[start_col] if start_col else ""
    sortable["_sort_timestamp"] = pd.to_datetime(
        sortable[date_col].astype(str) + " " + pd.Series(time_values, index=sortable.index).astype(str),
        errors="coerce",
    )
    sortable = sortable.sort_values("_sort_timestamp", ascending=False, na_position="last").drop(columns=["_sort_timestamp"])
    if LATEST_ROUNDS_ONLY:
        LOGGER.info("Processing latest %s rounds by date descending", LATEST_ROUND_COUNT)
        return sortable.head(LATEST_ROUND_COUNT)
    return sortable


def build_hole_index(holes_df: pd.DataFrame, hole_cols: dict[str, str]) -> dict[tuple[Any, ...], list[pd.Series]]:
    index: dict[tuple[Any, ...], list[pd.Series]] = {}
    for _, row in holes_df.iterrows():
        index.setdefault(identity_key_from_row(row, hole_cols), []).append(row)
    return index


def build_shot_index(shots_df: pd.DataFrame, shot_cols: dict[str, str]) -> dict[tuple[Any, ...], list[pd.Series]]:
    index: dict[tuple[Any, ...], list[pd.Series]] = {}
    for _, row in shots_df.iterrows():
        index.setdefault(shot_lookup_key(row, shot_cols), []).append(row)
    return index


def build_shot_json(row: pd.Series, shot_cols: dict[str, str]) -> dict[str, Any]:
    return {
        "shot_number": parse_number(get_value(row, shot_cols, "shot number")),
        "lie": clean_scalar(get_value(row, shot_cols, "lie")) or "",
        "club": clean_scalar(get_value(row, shot_cols, "club")) or "",
        "club_details": clean_scalar(get_value(row, shot_cols, "club details")) or "",
        "shot_length": parse_number(get_value(row, shot_cols, "shot length meters")),
        "target_distance_before": parse_number(get_value(row, shot_cols, "target distance before")),
        "target_distance_after": parse_number(get_value(row, shot_cols, "target distance after")),
        "outcome": clean_scalar(get_value(row, shot_cols, "outcome")) or "",
        "included_in_distance_stats": parse_bool(get_value(row, shot_cols, "included in distance stats")),
        "strokes_gained": parse_number(get_value(row, shot_cols, "strokes gained")),
        "fairway_center_offset": parse_number(get_value(row, shot_cols, "distance from center of fairway")),
        "time": clean_scalar(get_value(row, shot_cols, "time")) or "",
    }


def build_hole_json(
    row: pd.Series,
    hole_cols: dict[str, str],
    shot_rows: list[pd.Series],
    shot_cols: dict[str, str],
) -> dict[str, Any]:
    sorted_shots = sorted(
        shot_rows,
        key=lambda shot: parse_number(get_value(shot, shot_cols, "shot number")) or 9999,
    )
    total_strokes = get_value(row, hole_cols, "total strokes")
    hole_par = get_value(row, hole_cols, "hole par")
    return {
        "hole_number": parse_number(get_value(row, hole_cols, "hole number")),
        "hole_par": parse_number(hole_par),
        "total_strokes": parse_number(total_strokes),
        "putts": parse_number(get_value(row, hole_cols, "putts")),
        "penalties": parse_number(get_value(row, hole_cols, "penalties")),
        "sand_shots": parse_number(get_value(row, hole_cols, "sand shots")),
        "fairway_result": clean_scalar(get_value(row, hole_cols, "fairway")) or "",
        "gir": parse_bool(get_value(row, hole_cols, "GIR"), default=False),
        "hole_score_to_par": score_to_par(total_strokes, hole_par),
        "shots": [build_shot_json(shot, shot_cols) for shot in sorted_shots],
    }


def pct(numerator: int | float | None, denominator: int | float | None) -> float | None:
    if numerator is None or denominator in {None, 0}:
        return None
    return round((numerator / denominator) * 100, 2)


def numeric_values(values: Iterable[Any]) -> list[float]:
    parsed: list[float] = []
    for value in values:
        number = parse_number(value)
        if number is not None:
            parsed.append(float(number))
    return parsed


def classify_shot_category(shot: dict[str, Any]) -> str | None:
    lie = str(shot.get("lie") or "").lower()
    club = str(shot.get("club") or "").lower()
    before = shot.get("target_distance_before")
    length = shot.get("shot_length")

    if "putt" in lie or club in {"p", "pt", "putter"}:
        return "putt"
    if "tee" in lie and (club in {"d", "dr", "driver"} or (length is not None and length >= 150)):
        return "driving"
    if before is not None and before <= 50:
        return "short_game"
    if any(token in club for token in ["sw", "gw", "lw", "pw"]) and before is not None and before <= 80:
        return "short_game"
    if club or before is not None:
        return "approach"
    return None


def build_club_usage_summary(shots: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for shot in shots:
        club = shot.get("club") or "unknown"
        grouped.setdefault(str(club), []).append(shot)

    summary: dict[str, dict[str, Any]] = {}
    for club, club_shots in sorted(grouped.items()):
        distances = [float(s["shot_length"]) for s in club_shots if s.get("shot_length") is not None]
        summary[club] = {
            "shot_count": len(club_shots),
            "average_shot_length": round(sum(distances) / len(distances), 2) if distances else None,
            "included_distance_stat_count": sum(1 for s in club_shots if s.get("included_in_distance_stats") is True),
        }
    return summary


def derived_metrics(holes: list[dict[str, Any]], shots: list[dict[str, Any]]) -> dict[str, Any]:
    front = [h for h in holes if h.get("hole_number") is not None and h["hole_number"] <= 9]
    back = [h for h in holes if h.get("hole_number") is not None and h["hole_number"] >= 10]

    gir_count = sum(1 for h in holes if h.get("gir") is True)
    fairway_attempts = [h for h in holes if str(h.get("fairway_result") or "").strip()]
    fairway_hits = [h for h in fairway_attempts if str(h.get("fairway_result") or "").strip().lower() == "hit"]
    penalty_total = sum(float(h.get("penalties") or 0) for h in holes)
    sand_total = sum(float(h.get("sand_shots") or 0) for h in holes)
    strokes_gained = [float(s["strokes_gained"]) for s in shots if s.get("strokes_gained") is not None]
    distances = [float(s["shot_length"]) for s in shots if s.get("shot_length") is not None]
    categories = Counter(classify_shot_category(shot) for shot in shots)

    return {
        "front9_score": sum_or_none(h.get("total_strokes") for h in front),
        "back9_score": sum_or_none(h.get("total_strokes") for h in back),
        "front9_putts": sum_or_none(h.get("putts") for h in front),
        "back9_putts": sum_or_none(h.get("putts") for h in back),
        "gir_percentage": pct(gir_count, len(holes)),
        "fairway_percentage": pct(len(fairway_hits), len(fairway_attempts)),
        "penalty_rate": round(penalty_total / len(holes), 3) if holes else None,
        "sand_rate": round(sand_total / len(holes), 3) if holes else None,
        "average_strokes_gained": round(sum(strokes_gained) / len(strokes_gained), 3) if strokes_gained else None,
        "average_recorded_shot_distance": round(sum(distances) / len(distances), 2) if distances else None,
        "driving_shot_count": categories.get("driving", 0),
        "approach_shot_count": categories.get("approach", 0),
        "short_game_shot_count": categories.get("short_game", 0),
        "putt_count_from_shots": categories.get("putt", 0),
    }


def sum_or_none(values: Iterable[Any]) -> int | float | None:
    numbers = numeric_values(values)
    if not numbers:
        return None
    total = sum(numbers)
    return int(total) if total.is_integer() else total


def build_round_json(
    round_row: pd.Series,
    round_cols: dict[str, str],
    hole_rows: list[pd.Series],
    hole_cols: dict[str, str],
    shot_index: dict[tuple[Any, ...], list[pd.Series]],
    shot_cols: dict[str, str],
) -> dict[str, Any]:
    holes: list[dict[str, Any]] = []
    all_shot_rows: list[pd.Series] = []

    for hole_row in sorted(hole_rows, key=lambda row: parse_number(get_value(row, hole_cols, "hole number")) or 9999):
        shot_key = shot_lookup_key(hole_row, hole_cols)
        shot_rows = shot_index.get(shot_key, [])
        all_shot_rows.extend(shot_rows)
        holes.append(build_hole_json(hole_row, hole_cols, shot_rows, shot_cols))

    all_shots = [shot for hole in holes for shot in hole["shots"]]

    return {
        "round_metadata": {
            "round_id": stable_round_id(round_row, round_cols),
            "player_name": clean_scalar(get_value(round_row, round_cols, "player name")) or "",
            "date": clean_scalar(get_value(round_row, round_cols, "date")) or "",
            "start_time": clean_scalar(get_value(round_row, round_cols, "start time")) or "",
            "finish_time": clean_scalar(get_value(round_row, round_cols, "finish time")) or "",
            "course_name": clean_scalar(get_value(round_row, round_cols, "course name")) or "",
            "course_holes": parse_number(get_value(round_row, round_cols, "course holes")),
            "tee_name": clean_scalar(get_value(round_row, round_cols, "tee name")) or "",
            "rating": parse_number(get_value(round_row, round_cols, "rating")),
            "slope": parse_number(get_value(round_row, round_cols, "slope")),
            "course_handicap": parse_number(get_value(round_row, round_cols, "course handicap")),
            "scoring_format": clean_scalar(get_value(round_row, round_cols, "scoring format")) or "",
            "completed_holes": parse_number(get_value(round_row, round_cols, "completed holes")),
        },
        "score_summary": {
            "gross_score": parse_number(get_value(round_row, round_cols, "gross score")),
            "gross_score_over_par": parse_number(get_value(round_row, round_cols, "gross score over par")),
            "net_score_or_points": parse_number(get_value(round_row, round_cols, "net score or points")),
            "putts": parse_number(get_value(round_row, round_cols, "putts")),
            "penalties": parse_number(get_value(round_row, round_cols, "penalties")),
            "girs": parse_number(get_value(round_row, round_cols, "GIRs")),
            "fairways": parse_number(get_value(round_row, round_cols, "fairways")),
            "sand_shots": parse_number(get_value(round_row, round_cols, "sand shots")),
        },
        "holes": holes,
        "club_usage_summary": build_club_usage_summary(all_shots),
        "derived_ai_metrics": derived_metrics(holes, all_shots),
        "raw_source_rows": {
            "round_row": raw_record(round_row),
            "hole_rows": [raw_record(row) for row in hole_rows],
            "shot_rows": [raw_record(row) for row in all_shot_rows],
        },
    }


def validate_required_exports(paths: dict[str, Path]) -> None:
    missing = sorted({"rounds", "holes", "shots"} - set(paths))
    if missing:
        raise FileNotFoundError(f"Missing required Golf Pad export file(s): {', '.join(missing)}")


def log_schema(paths: dict[str, Path], frames: dict[str, pd.DataFrame], metadata_files: list[Path]) -> None:
    LOGGER.info("Export files found:")
    for kind in ("rounds", "holes", "shots"):
        if kind in paths:
            LOGGER.info("  %s: %s (%s rows)", kind, paths[kind].name, len(frames[kind]))
            LOGGER.info("  %s columns: %s", kind, list(frames[kind].columns))
    if metadata_files:
        LOGGER.info("Additional metadata/unclassified files: %s", [p.name for p in metadata_files])
    else:
        LOGGER.info("Additional metadata/unclassified files: none")


def log_matching_limitations(rounds_df: pd.DataFrame, shots_df: pd.DataFrame) -> None:
    round_cols = canonical_columns(rounds_df)
    shot_cols = canonical_columns(shots_df)
    if {"player name", "tee name"}.issubset(shot_cols):
        return

    date_col = round_cols.get("date")
    course_col = round_cols.get("course name")
    if date_col is None or course_col is None:
        return

    duplicate_groups = rounds_df.groupby([date_col, course_col], dropna=False).size()
    duplicate_groups = duplicate_groups[duplicate_groups > 1]
    if duplicate_groups.empty:
        return

    LOGGER.warning(
        "Shots file lacks player name and tee name columns; shot matching uses date + course name + hole number. "
        "The export has %s date/course groups with multiple rounds, so those groups are not uniquely distinguishable from Shots.csv alone.",
        len(duplicate_groups),
    )


def main() -> None:
    paths, frames, metadata_files = discover_exports()
    log_schema(paths, frames, metadata_files)
    validate_required_exports(paths)

    rounds_df = frames["rounds"]
    holes_df = frames["holes"]
    shots_df = frames["shots"]
    round_cols = canonical_columns(rounds_df)
    hole_cols = canonical_columns(holes_df)
    shot_cols = canonical_columns(shots_df)
    log_matching_limitations(rounds_df, shots_df)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    hole_index = build_hole_index(holes_df, hole_cols)
    shot_index = build_shot_index(shots_df, shot_cols)
    selected_rounds = sorted_latest_rounds(rounds_df, round_cols)
    used_names: Counter[str] = Counter()

    written = 0
    for _, round_row in selected_rounds.iterrows():
        round_key = identity_key_from_row(round_row, round_cols)
        hole_rows = hole_index.get(round_key, [])
        if not hole_rows:
            LOGGER.warning("No hole rows matched round identity %s", round_key)

        payload = build_round_json(round_row, round_cols, hole_rows, hole_cols, shot_index, shot_cols)
        output_path = output_path_for_round(round_row, round_cols, used_names)
        with output_path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, ensure_ascii=False, allow_nan=False)
            handle.write("\n")
        written += 1
        LOGGER.info("Wrote %s (%s holes, %s shots)", output_path, len(payload["holes"]), len(payload["raw_source_rows"]["shot_rows"]))

    LOGGER.info("Done. Wrote %s JSON file(s) to %s", written, OUTPUT_DIR)


if __name__ == "__main__":
    main()
