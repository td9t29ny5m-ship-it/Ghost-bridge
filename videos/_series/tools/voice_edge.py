"""Record the voice-over with a Microsoft neural voice and write exact word timings.
Usage: python3 voice_edge.py <projectDir> [voice] [rate]
Reads vo.txt; writes assets/audio/voice.wav (48 kHz stereo) and transcript.json ({"words":[{word,start,end}]})."""
import sys, os, json, asyncio, subprocess, edge_tts
d = sys.argv[1]; voice = sys.argv[2] if len(sys.argv) > 2 else "en-US-AndrewMultilingualNeural"; rate = sys.argv[3] if len(sys.argv) > 3 else "+10%"
text = " ".join(open(f"{d}/vo.txt").read().split())
os.makedirs(f"{d}/assets/audio", exist_ok=True)
async def main():
    c = edge_tts.Communicate(text, voice, rate=rate, boundary="WordBoundary", proxy=os.environ.get("HTTPS_PROXY"))
    audio = bytearray(); words = []
    async for ch in c.stream():
        if ch["type"] == "audio": audio += ch["data"]
        elif ch["type"] == "WordBoundary":
            s = ch["offset"] / 1e7; words.append({"word": ch["text"], "start": round(s, 3), "end": round(s + ch["duration"] / 1e7, 3)})
    open(f"{d}/assets/audio/voice_raw.mp3", "wb").write(audio)
    return words
words = asyncio.run(main())
# re-attach punctuation from the script so captions keep it
toks = text.split(); j = 0
for w in words:
    while j < len(toks) and w["word"].lower().strip(".,!?") not in toks[j].lower(): j += 1
    if j < len(toks): w["word"] = toks[j]; j += 1
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"{d}/assets/audio/voice_raw.mp3", "-ar", "48000", "-ac", "2", "-af", "apad=pad_dur=0.4", f"{d}/assets/audio/voice.wav"], check=True)
json.dump({"words": words}, open(f"{d}/transcript.json", "w"))
print(voice, rate, len(words), "words, ends", words[-1]["end"])
