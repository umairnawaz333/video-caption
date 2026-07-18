#!/usr/bin/env python3
"""List translation target languages available from English (Argos Translate).

Prints JSON to stdout: [{"code": "ur", "name": "Urdu", "installed": bool}]
Sorted by name. Errors go to stderr with non-zero exit.
"""
import json
import sys


def main() -> int:
    try:
        import argostranslate.package as pkg
    except ImportError:
        print("argostranslate not installed; run: pip install -r requirements.txt", file=sys.stderr)
        return 2

    try:
        pkg.update_package_index()
    except Exception as e:  # offline: fall back to installed packages only
        print(f"package index refresh failed ({e}); listing installed only", file=sys.stderr)

    installed = {p.to_code for p in pkg.get_installed_packages() if p.from_code == "en"}
    try:
        available = [p for p in pkg.get_available_packages() if p.from_code == "en"]
    except Exception:
        available = []

    by_code = {}
    for p in available:
        by_code[p.to_code] = {"code": p.to_code, "name": p.to_name, "installed": p.to_code in installed}
    for code in installed:  # installed but missing from index (offline)
        by_code.setdefault(code, {"code": code, "name": code, "installed": True})

    json.dump(sorted(by_code.values(), key=lambda x: x["name"]), sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
