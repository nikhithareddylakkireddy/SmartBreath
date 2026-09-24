"""SageMaker-ready inference contract placeholder.

The local JavaScript inference adapter is used for tests. This module defines
the standard model_fn/input_fn/predict_fn/output_fn boundary for a future
SageMaker endpoint and does not call AWS services.
"""

import json


def model_fn(model_dir):
    with open(f"{model_dir}/model.json", encoding="utf-8") as handle:
        return json.load(handle)


def input_fn(request_body, request_content_type):
    if request_content_type != "application/json":
        raise ValueError("Only application/json is supported.")
    return json.loads(request_body)


def predict_fn(input_data, model):
    raise NotImplementedError(
        "Deploy only after an approved trained model artifact and calibrated uncertainty method exist."
    )


def output_fn(prediction, accept):
    if accept != "application/json":
        raise ValueError("Only application/json is supported.")
    return json.dumps(prediction), accept
