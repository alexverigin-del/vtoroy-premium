#!/usr/bin/env python3
"""Execute Trade-in notebook code cells top-to-bottom and persist compact outputs."""

from __future__ import annotations

import contextlib
import io
import json
import traceback
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
NOTEBOOK_PATH = ROOT / "analysis" / "trade-in-pricing-2026-08-29" / "trade_in_pricing_analysis.ipynb"


def execute() -> None:
    notebook = json.loads(NOTEBOOK_PATH.read_text(encoding="utf-8"))
    namespace = {"__name__": "__main__"}
    execution_count = 0

    for cell in notebook["cells"]:
        if cell.get("cell_type") != "code":
            continue
        execution_count += 1
        source = "".join(cell.get("source", []))
        stream = io.StringIO()
        try:
            with contextlib.redirect_stdout(stream):
                compiled = compile(source, f"{NOTEBOOK_PATH.name}:cell-{execution_count}", "exec")
                exec(compiled, namespace)
        except Exception:
            cell["execution_count"] = execution_count
            cell["outputs"] = [{
                "output_type": "error",
                "ename": "NotebookExecutionError",
                "evalue": f"cell {execution_count}",
                "traceback": traceback.format_exc().splitlines(),
            }]
            NOTEBOOK_PATH.write_text(json.dumps(notebook, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
            raise

        output = stream.getvalue()
        cell["execution_count"] = execution_count
        cell["outputs"] = []
        if output:
            cell["outputs"].append({"output_type": "stream", "name": "stdout", "text": output.splitlines(keepends=True)})

    notebook["metadata"]["execution"] = {"status": "passed", "code_cells": execution_count}
    NOTEBOOK_PATH.write_text(json.dumps(notebook, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Executed {execution_count} code cells: {NOTEBOOK_PATH}")


if __name__ == "__main__":
    execute()
