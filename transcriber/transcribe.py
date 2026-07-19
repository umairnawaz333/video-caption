#!/usr/bin/env python3
"""Transcribe audio to English segments using faster-whisper (local, free).

Prints JSON to stdout:
{"language": str, "segments": [{"start", "end", "text",
                                "words": [{"start", "end", "text"}]}]}

`segments` is always English: task=translate transcribes English audio
as-is and translates any other detected language in a single pass.
`language` is the detected source language.
"""
import argparse
import json
import sys


def collect(segments, info):
    """Drain the segment generator, emitting PROGRESS lines on stderr.

    stdout stays reserved for the final JSON; the backend parses these
    stderr lines to drive the UI progress bar.
    """
    total = getattr(info, "duration", 0) or 0
    segs = []
    for s in segments:
        segs.append(s)
        if total > 0:
            print("PROGRESS %d" % min(99, int(s.end / total * 100)), file=sys.stderr, flush=True)
    return segs


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
        args.audio, task="translate", vad_filter=True, word_timestamps=True
    )
    segs = collect(segments, info)  # generator -> list (runs the model)

    json.dump({"language": info.language, "segments": serialize(segs)}, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
