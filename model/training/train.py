"""SageMaker-ready training entry point.

This module is intentionally dependency-light in the repository. The local
JavaScript trainer is the executable test implementation; this entry point
documents the future SageMaker container contract without requiring AWS.
"""

import json
import os
from pathlib import Path


def chronological_split(rows, train_ratio=0.6, validation_ratio=0.2):
    rows = sorted(rows, key=lambda row: row["timestamp"])
    train_end = int(len(rows) * train_ratio)
    validation_end = train_end + int(len(rows) * validation_ratio)
    return rows[:train_end], rows[train_end:validation_end], rows[validation_end:]


def save_model_artifact(model, output_dir):
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    with open(Path(output_dir) / "model.json", "w", encoding="utf-8") as handle:
        json.dump(model, handle)


def main():
    # A SageMaker job should load its approved, real training data from the
    # configured input channel. Synthetic data must never be treated as real.
    input_dir = os.environ.get("SM_CHANNEL_TRAINING", "/opt/ml/input/data/training")
    output_dir = os.environ.get("SM_MODEL_DIR", "/opt/ml/model")
    save_model_artifact(
        {
            "modelVersion": "gradient-boosting-stumps-v1",
            "trainingInput": input_dir,
            "target": "targetPM25",
            "horizonHours": 3,
            "note": "Replace with approved chronological training implementation before deployment."
        },
        output_dir,
    )


if __name__ == "__main__":
    main()
