#!/usr/bin/env python3
"""Translate English texts using Argos Translate (local, free).

Reads JSON from stdin: {"texts": ["...", ...]}
Prints JSON to stdout: {"translations": ["...", ...]}
Installs the language package on first use (one-time download); progress
notes go to stderr ("STATUS downloading" / "STATUS translating").
"""
import argparse
import json
import sys


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--to", required=True, help="target language code, e.g. ur")
    args = parser.parse_args()

    try:
        import argostranslate.package as pkg
        import argostranslate.translate as tr
    except ImportError:
        print("argostranslate not installed; run: pip install -r requirements.txt", file=sys.stderr)
        return 2

    payload = json.load(sys.stdin)
    texts = payload.get("texts", [])
    if not isinstance(texts, list):
        print("invalid input: texts must be a list", file=sys.stderr)
        return 2

    installed = {p.to_code for p in pkg.get_installed_packages() if p.from_code == "en"}
    if args.to not in installed:
        print("STATUS downloading", file=sys.stderr, flush=True)
        pkg.update_package_index()
        matches = [
            p for p in pkg.get_available_packages()
            if p.from_code == "en" and p.to_code == args.to
        ]
        if not matches:
            print(f"no English -> {args.to} package available", file=sys.stderr)
            return 3
        pkg.install_from_path(matches[0].download())

    print("STATUS translating", file=sys.stderr, flush=True)
    translations = [tr.translate(t, "en", args.to) if t.strip() else t for t in texts]
    json.dump({"translations": translations}, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
