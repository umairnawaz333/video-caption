#!/usr/bin/env python3
"""Transcribe audio to English segments using faster-whisper (local, free).

Prints JSON to stdout: {"language": str, "segments": [{"start","end","text"}]}
Non-English audio is re-run with task=translate so output text is English.
"""
import argparse
import json
import sys


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", required=True)
    parser.add_argument("--model", default="base")
    args = parser.parse_args()

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("faster-whisper not installed; run: pip install -r requirements.txt", file=sys.stderr)
        return 2

    model = WhisperModel(args.model, device="cpu", compute_type="int8")

    segments, info = model.transcribe(args.audio, task="transcribe", vad_filter=True)
    segs = list(segments)  # generator -> list (runs the model)

    if info.language != "en":
        segments, info = model.transcribe(args.audio, task="translate", vad_filter=True)
        segs = list(segments)

    json.dump(
        {
            "language": info.language,
            "segments": [
                {"start": round(s.start, 3), "end": round(s.end, 3), "text": s.text.strip()}
                for s in segs
                if s.text.strip()
            ],
        },
        sys.stdout,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
