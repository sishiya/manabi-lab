# 日本語の公開音声を少量あつめて、話者ごとの wav にする。python -I -X utf8 ja_prepare.py <ja フォルダ> <話者数> <1人のファイル数>
# Lingua Libre（Commons、話者ごとの単語の録音。ライセンスを 1 ファイルずつ確かめる）＋ LibriVox の朗読（CC0 / PD、MP3）
import json, re, struct, subprocess, sys, time, urllib.parse, wave
from collections import defaultdict
from pathlib import Path
import numpy as np
import parselmouth as pm

base, NSP, NF = Path(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3])
raw, cut = base / "raw", base / "cut"
raw.mkdir(parents=True, exist_ok=True); cut.mkdir(parents=True, exist_ok=True)
UA = "manabi-lab-verify/1.0 (https://github.com/sishiya/manabi-lab)"
def fetch(url, extra=()):
    if "upload.wikimedia" in url: time.sleep(2)  # 連続で取ると 429 になる。間をあける
    return subprocess.run(["curl", "-sS", "-m", "120", "-L", "-A", UA, *extra, url], capture_output=True, check=True).stdout
API = "https://commons.wikimedia.org/w/api.php"
files, cont = [], {}
cache = base / "files.json"
if cache.exists(): files = json.loads(cache.read_text(encoding="utf-8"))
for page in range(0 if files else 80):
    q = {"action": "query", "format": "json", "generator": "categorymembers", "gcmtitle": "Category:Lingua Libre pronunciation-jpn", "gcmtype": "file", "gcmlimit": 50, "prop": "imageinfo", "iiprop": "url|size|extmetadata", "iiextmetadatafilter": "LicenseShortName", **cont}
    r = json.loads(fetch(API + "?" + urllib.parse.urlencode(q)).decode("utf-8"))
    for v in r.get("query", {}).get("pages", {}).values():
        ii = v.get("imageinfo", [{}])[0]
        files.append({"title": v["title"], "url": ii.get("url"), "size": ii.get("size"), "lic": (ii.get("extmetadata", {}).get("LicenseShortName", {}) or {}).get("value", "")})
    if "continue" not in r: break
    cont = r["continue"]
cache.write_text(json.dumps(files, ensure_ascii=False), encoding="utf-8")
print("files", len(files))
OK = re.compile(r"^(CC0|CC BY|Public domain)", re.I)
from collections import Counter
print("licenses", Counter(f["lic"] for f in files).most_common(6))
by = defaultdict(list)
for f in files:
    m = re.match(r"File:LL-Q5287 \(jpn\)-(.+?)-(.+)\.wav$", f["title"])
    if m and f["url"] and OK.match(f["lic"]) and (f["size"] or 0) < 2_000_000:
        by[m[1]].append({**f, "word": m[2]})
sp = sorted(((k, v) for k, v in by.items() if len(v) >= 25), key=lambda kv: -len(kv[1]))
print("speakers >=25:", len(sp), [len(v) for k, v in sp][:30])
sp = sp[:NSP]

def save(name, x, sr):
    y = np.clip(x, -1, 1)
    with wave.open(str(cut / name), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(int(sr))
        w.writeframes(struct.pack("<%dh" % len(y), *(y * 32767).astype(np.int16)))

total = 0; vowels = []
for si, (who, lst) in enumerate(sp):
    pick = [lst[int(i * len(lst) / min(NF, len(lst)))] for i in range(min(NF, len(lst)))]
    parts, sr = [], None
    for j, f in enumerate(pick):
        p = raw / f"s{si:02d}_{j:02d}.wav"
        if not p.exists():
            d = fetch(f["url"])
            if d[:4] != b"RIFF":
                print("skip", si, j, len(d), d[:80]); time.sleep(30); continue
            p.write_bytes(d)
        total += p.stat().st_size
        s = pm.Sound(str(p)).convert_to_mono()
        if sr is None: sr = s.sampling_frequency
        if s.sampling_frequency != sr: continue
        parts.append(s.values[0]); parts.append(np.zeros(int(.3 * sr)))
    x = np.concatenate(parts)[:int(25 * sr)]
    save(f"ll{si:02d}-talk.wav", x, sr)
    print(f"s{si:02d} files {len(pick)} sr {sr:.0f} dur {len(x)/sr:.1f}")
    # 母音だけの単語で長いもの
    for f in lst:
        if f["word"] in ("あ", "い", "う", "え", "お", "ああ", "いい", "うう", "ええ", "おお", "あー", "いー", "うー", "えー", "おー"):
            vowels.append((si, f["word"], f["url"], f["size"]))
print("vowel words", len(vowels))
for si, w, url, size in vowels[:30]:
    p = raw / f"v{si:02d}_{abs(hash(w))%9999}.wav"
    if not p.exists():
        d = fetch(url)
        if d[:4] != b"RIFF": continue
        p.write_bytes(d)
    s = pm.Sound(str(p)).convert_to_mono(); f0 = s.to_pitch_ac(time_step=.01, pitch_floor=75., pitch_ceiling=600.).selected_array["frequency"]
    print("vowel", si, w, "voiced sec", round(float((f0 > 0).sum()) * .01, 2))
print("lingua libre MB", round(total / 1e6, 1))

# LibriVox: 読み手のわかる 2 人。始めの 3MB（約 6 分）だけ落として、1 分すぎから 25 秒
for name, item in (("lv00", "rojyoo_1306_librivox"), ("lv01", "hyakunin_isshu_librivox")):
    m = json.loads(fetch("https://archive.org/metadata/" + item).decode("utf-8"))
    mp3 = sorted(f["name"] for f in m["files"] if f["name"].endswith("_64kb.mp3"))[0]
    p = raw / f"{name}.mp3"
    if not p.exists():
        p.write_bytes(fetch(f"https://archive.org/download/{item}/{urllib.parse.quote(mp3)}", ("-r", "0-3000000")))
    s = pm.Sound(str(p)).convert_to_mono()
    sr, x = s.sampling_frequency, s.values[0]
    save(f"{name}-talk.wav", x[int(60 * sr):int(85 * sr)], sr)
    print(name, item, m["metadata"].get("licenseurl"), "dur", round(s.duration, 1), "sr", sr)
