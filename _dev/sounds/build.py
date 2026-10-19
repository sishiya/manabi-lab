"""しし屋サウンドライブラリを catalog.json から作る。

Audio Studio MCP（%USERPROFILE%\\tools\\audio-studio-mcp）をふつうの MCP クライアントとして呼ぶ。
もうある音はとばすので、カタログに足して流し直せば、足した分だけ作る。

  & $env:USERPROFILE\\tools\\audio-studio-mcp\\.venv\\Scripts\\python.exe _dev\\sounds\\build.py [--only id,id] [--force]

出力（Git の外）: ..\\sound-library\\（アプリ開発 の となり）
  <kind>\\<id>_v1.ogg …  使う音（BGM・ジングルは LUFS、効果音はピークでそろえる）
  masters\\<id>_v1.wav … 生成したままの音と .json（文・種・設定）
  library.json / listen.html … 一覧と試聴ページ
"""
import argparse, asyncio, json, os, subprocess, sys, time, zlib
from pathlib import Path
from mcp import Client, StdioServerParameters

HERE = Path(__file__).resolve().parent
LIB = HERE.parents[2] / "sound-library"  # アプリ開発 の となり
MASTERS = LIB / "masters"
TOOL = Path.home() / "tools" / "audio-studio-mcp"


def seed_of(item):
    return item.get("seed", zlib.crc32(item["id"].encode()) % 1_000_000)


async def call(c, name, args):
    r = await c.call_tool(name, args)
    text = "".join(getattr(x, "text", "") for x in r.content)
    if r.is_error:
        raise RuntimeError(f"{name}: {text[:600]}")
    return json.loads(text)


def gen_args(item, d):
    a = {"duration_seconds": item.get("seconds", d["seconds"]), "variations": item.get("variations", d["variations"]),
         "seed": seed_of(item), "title": item["id"], "original_idea": item["ja"]}
    if item["kind"] in ("sfx", "ambience"):
        a.update(audio_type="sfx", sound_source=item["source"], sound_action=item["action"],
                 sound_material=item.get("material", ""), sound_space=item.get("space", ""))
    else:
        a.update(audio_type="music", prompt=item["prompt"] + ("" if "no vocals" in item["prompt"] else ", no vocals"))
        if item.get("bpm"):
            a["bpm"] = item["bpm"]
    return a


def proc_args(item, d, src, title):
    # OGG は ffmpeg で作る（libsndfile の Vorbis 書き出しは、長いノイズ系の音で Windows だとスタックがあふれて落ちる）
    a = {"input_audio": src, "format": "wav", "sample_rate": 48000, "title": title}
    if "lufs" in d:
        a.update(normalize="loudness", target_lufs=d["lufs"], peak_ceiling_db=-1)
    else:
        a.update(normalize="peak", peak_ceiling_db=d["peak"])
    if d.get("loop"):
        a.update(loop=True, loop_crossfade_ms=d["xfade_ms"])
    if d.get("fade_out_ms"):
        a["fade_out_ms"] = d["fade_out_ms"]
    if d.get("trim"):
        a["trim_silence"] = True
    if item.get("mono", d.get("mono", False)):
        a["mono"] = True
    return a


async def build(items, defaults, force):
    MASTERS.mkdir(parents=True, exist_ok=True)
    params = StdioServerParameters(command=str(TOOL / ".venv" / "Scripts" / "python.exe"),
                                   args=["-m", "audio_studio_mcp"], cwd=str(TOOL),
                                   env={**os.environ, "AUDIO_STUDIO_OUTPUT_DIR": str(MASTERS),
                                        "PYTHONIOENCODING": "utf-8", "HF_HUB_DISABLE_SYMLINKS_WARNING": "1"})
    made = 0
    async with Client(params, read_timeout_seconds=3600) as c:
        for item in items:
            d = defaults[item["kind"]]
            n = item.get("variations", d["variations"])
            outdir = LIB / item["kind"]
            outdir.mkdir(exist_ok=True)
            names = [item["id"] if n == 1 else f"{item['id']}_v{i + 1}" for i in range(n)]
            if not force and all((outdir / f"{nm}.ogg").exists() for nm in names):
                continue
            t0 = time.time()
            try:
                g = await call(c, "generate_audio", gen_args(item, d))
                for cand, nm in zip(g["candidates"], names):
                    p = await call(c, "process_audio", proc_args(item, d, cand["path"], nm + "_proc"))
                    wav, ogg = Path(p["path"]), outdir / f"{nm}.ogg"
                    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav),
                                    "-c:a", "libvorbis", "-q:a", "6", str(ogg)], check=True)
                    meta = json.loads(Path(str(wav) + ".json").read_text(encoding="utf-8"))
                    meta.update(file=ogg.name, format="ogg (ffmpeg libvorbis q6)")
                    Path(str(ogg) + ".json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
                    wav.unlink()
                    Path(str(wav) + ".json").unlink()
                made += 1
                print(f"{item['id']:28} {time.time() - t0:5.1f}s  {n}本", flush=True)
            except RuntimeError as e:
                print(f"{item['id']:28} NG  {e}", flush=True)
        await call(c, "unload_models", {})
    return made


def write_index(catalog):
    rows = []
    for item in catalog["items"]:
        d = catalog["defaults"][item["kind"]]
        files = sorted((LIB / item["kind"]).glob(f"{item['id']}*.ogg"))
        files = [f for f in files if f.stem == item["id"] or f.stem.startswith(item["id"] + "_v")]
        rows.append({"id": item["id"], "kind": item["kind"], "use": item["use"], "ja": item["ja"],
                     "bpm": item.get("bpm"), "seconds": item.get("seconds", d["seconds"]), "seed": seed_of(item),
                     "files": [f"{item['kind']}/{f.name}" for f in files]})
    (LIB / "library.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    html = (HERE / "listen.template.html").read_text(encoding="utf-8")
    (LIB / "listen.html").write_text(html.replace("/*DATA*/[]", json.dumps(rows, ensure_ascii=False)), encoding="utf-8")


def main():
    sys.stdout.reconfigure(errors="replace")
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="作る id をカンマ区切りで")
    ap.add_argument("--force", action="store_true", help="もうある音も作り直す")
    ap.add_argument("--index-only", action="store_true")
    a = ap.parse_args()
    catalog = json.loads((HERE / "catalog.json").read_text(encoding="utf-8"))
    items = catalog["items"]
    if a.only:
        want = set(a.only.split(","))
        items = [i for i in items if i["id"] in want]
    if not a.index_only:
        t0 = time.time()
        made = asyncio.run(build(items, catalog["defaults"], a.force))
        print(f"作った: {made} 件  {time.time() - t0:.0f}s")
    write_index(catalog)
    print(f"一覧: {LIB / 'listen.html'}")


if __name__ == "__main__":
    main()
