import time
import argparse
import json
import sys
from decimal import Decimal
from pathlib import Path

# Make the app package importable when run from the project root.
AI_SERVICE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AI_SERVICE_DIR))

from app.propose import extract_invoice


CASES_PATH = Path(__file__).parent / "cases.jsonl"
TOLERANCE = Decimal("0.01")


def load_cases():
    cases = []

    with CASES_PATH.open("r", encoding="utf-8") as file:
        for line_number, line in enumerate(file, start=1):
            if not line.strip():
                continue

            try:
                cases.append(json.loads(line))
            except json.JSONDecodeError as error:
                raise ValueError(
                    f"Invalid JSON on line {line_number}: {error}"
                )

    return cases


def number_matches(actual, expected):
    try:
        return abs(
            Decimal(str(actual)) - Decimal(str(expected))
        ) <= TOLERANCE
    except Exception:
        return False


def compare_result(result, expected):
    failures = []

    for field in (
        "recipientName",
        "recipientEmail",
        "currency",
        "dueDate",
    ):
        if field in expected:
            actual_value = result.get(field, "")
            expected_value = expected[field]

            if actual_value != expected_value:
                failures.append(
                    f"{field}: expected {expected_value!r}, "
                    f"got {actual_value!r}"
                )

    if "item_count" in expected:
        actual_count = len(result.get("items", []))

        if actual_count != expected["item_count"]:
            failures.append(
                f"item_count: expected {expected['item_count']}, "
                f"got {actual_count}"
            )

    expected_items = expected.get("items", [])
    actual_items = result.get("items", [])

    for index, expected_item in enumerate(expected_items):
        if index >= len(actual_items):
            failures.append(f"item {index + 1}: missing")
            continue

        actual_item = actual_items[index]

        for field in ("quantity", "unitPrice", "total"):
            if field not in expected_item:
                continue

            if not number_matches(
                actual_item.get(field),
                expected_item[field],
            ):
                failures.append(
                    f"item {index + 1} {field}: "
                    f"expected {expected_item[field]}, "
                    f"got {actual_item.get(field)}"
                )

    if "grand_total" in expected:
        actual_total = sum(
            Decimal(str(item["total"]))
            for item in actual_items
        )

        if not number_matches(
            actual_total,
            expected["grand_total"],
        ):
            failures.append(
                f"grand_total: expected {expected['grand_total']}, "
                f"got {actual_total}"
            )

    return failures


def run_case(case):
    case_id = case["id"]
    text = case["text"]
    reference_date = case["referenceDate"]
    expected_error = case.get("expected_error")

    try:
        result = extract_invoice(
            text=text,
            reference_date=__import__("datetime").date.fromisoformat(
                reference_date
            ),
        )

    except ValueError as error:
        error_message = str(error)

        if expected_error:
            if expected_error.lower() in error_message.lower():
                return "PASS", f"Expected rejection: {error_message}"

            return "FAIL", (
                f"Expected error containing {expected_error!r}, "
                f"got {error_message!r}"
            )

        return "FAIL", f"Unexpected validation rejection: {error_message}"

    except Exception as error:
        return "ERROR", (
            f"{type(error).__name__}: {error}"
        )

    if expected_error:
        return "FAIL", (
            f"Expected rejection containing {expected_error!r}, "
            "but extraction succeeded"
        )

    failures = compare_result(result, case["expected"])

    if failures:
        return "FAIL", "; ".join(failures)

    return "PASS", "All expected fields matched"


def main():
    parser = argparse.ArgumentParser(
        description="Run FinPilot invoice extraction evaluations."
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Run only the first N cases. Default: all cases.",
    )
    args = parser.parse_args()

    cases = load_cases()

    if args.limit > 0:
        cases = cases[:args.limit]

    if not cases:
        print("No evaluation cases found.")
        return

    passed = 0
    failed = 0
    errors = 0

    print("\nFinPilot invoice extraction evaluation")
    print("=" * 55)

    for index, case in enumerate(cases, start=1):
        status, message = run_case(case)

        if status == "PASS":
            passed += 1
        elif status == "FAIL":
            failed += 1
        else:
            errors += 1

        print(f"[{status}] {index:02d} {case['id']}")
        if status != "PASS":
            print(f"       {message}")
        if index == 14 and index < len(cases):
            print("\nFree-tier rate limit buffer: waiting 31 seconds...\n")
            time.sleep(31)

    total = len(cases)
    print("\n" + "=" * 55)
    print(f"Total cases : {total}")
    print(f"Passed      : {passed}")
    print(f"Failed      : {failed}")
    print(f"Errors      : {errors}")

    if total:
        print(f"Pass rate   : {passed / total * 100:.1f}%")

    print("\nNote: This is a small evaluation set, not a guarantee")
    print("of production accuracy or safety.")

    if failed or errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
