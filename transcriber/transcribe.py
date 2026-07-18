#!/usr/bin/env python3
"""Transcribe audio to English segments using faster-whisper (local, free).

Prints JSON to stdout:
{"language": str, "segments": [{"start", "end", "text",
                                "words": [{"start", "end", "text"}]}]}
Non-English audio is re-run with task=translate so output text is English.
"""
import argparse
import json
import sys


def serialize(segs):
    out = []
    for s in segs:
        text = s.text.strip()
        if not text:
            continue
        words = [
            {"start": round(w.start, 3), "end": round(w.end, 3), "text": w.word.strip()}
            for w in (s.words or [])
            if w.word.strip()
        ]
        out.append(
            {"start": round(s.start, 3), "end": round(s.end, 3), "text": text, "words": words}
        )
    return out


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

    segments, info = model.transcribe(
        args.audio, task="transcribe", vad_filter=True, word_timestamps=True
    )
    segs = list(segments)  # generator -> list (runs the model)

    if info.language != "en":
        segments, info = model.transcribe(
            args.audio, task="translate", vad_filter=True, word_timestamps=True
        )
        segs = list(segments)

    json.dump({"language": info.language, "segments": serialize(segs)}, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
