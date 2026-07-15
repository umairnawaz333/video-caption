# Transcriber sidecar

    python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
    .venv/bin/python transcribe.py --audio path/to/audio.wav

First run downloads the Whisper `base` model (~150 MB) to the local HF cache. Free, offline after that.
