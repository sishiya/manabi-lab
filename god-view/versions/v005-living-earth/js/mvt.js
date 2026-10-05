// mvt.js — Mapbox Vector Tile（Protocol Buffers）の小さな解読器。必要な層だけを読む。
// 仕様: https://github.com/mapbox/vector-tile-spec （v2）
// GV.decodeMVT(arrayBuffer, ['building']) -> { building: { extent, features: [{ type, props, geom }] } }
//   geom: 線・面は「点の列」の配列（タイル内の座標 0..extent）。type 1=点 2=線 3=面
'use strict';

(function () {
  const GV = window.GV;

  // --- Protocol Buffers の読み手 ---
  function Reader(buf, pos, end) {
    this.b = buf; this.p = pos || 0; this.end = end == null ? buf.length : end;
  }
  Reader.prototype.varint = function () {
    let v = 0, s = 0, c;
    do {
      c = this.b[this.p++];
      v += (c & 0x7f) * Math.pow(2, s);   // 32 ビットを超えても壊れないように掛け算
      s += 7;
    } while (c & 0x80);
    return v;
  };
  Reader.prototype.svarint = function () { const n = this.varint(); return n % 2 ? -(n + 1) / 2 : n / 2; };
  Reader.prototype.skip = function (wire) {
    if (wire === 0) this.varint();
    else if (wire === 1) this.p += 8;
    else if (wire === 2) this.p += this.varint();
    else if (wire === 5) this.p += 4;
    else throw new Error('mvt: unknown wire type ' + wire);
  };
  Reader.prototype.sub = function () { const len = this.varint(), r = new Reader(this.b, this.p, this.p + len); this.p += len; return r; };
  const td = new TextDecoder();
  Reader.prototype.str = function () { const len = this.varint(), s = td.decode(this.b.subarray(this.p, this.p + len)); this.p += len; return s; };

  function readValue(r) {
    let v = null;
    while (r.p < r.end) {
      const tag = r.varint(), f = tag >> 3, w = tag & 7;
      if (f === 1) v = r.str();
      else if (f === 2) { v = new DataView(r.b.buffer, r.b.byteOffset + r.p, 4).getFloat32(0, true); r.p += 4; }
      else if (f === 3) { v = new DataView(r.b.buffer, r.b.byteOffset + r.p, 8).getFloat64(0, true); r.p += 8; }
      else if (f === 4 || f === 5) v = r.varint();
      else if (f === 6) v = r.svarint();
      else if (f === 7) v = !!r.varint();
      else r.skip(w);
    }
    return v;
  }

  function readGeometry(cmds) {
    const out = [];
    let x = 0, y = 0, cur = null, i = 0;
    while (i < cmds.length) {
      const ci = cmds[i++], id = ci & 7, n = ci >> 3;
      if (id === 1 || id === 2) {
        for (let k = 0; k < n; k++) {
          const dx = cmds[i++], dy = cmds[i++];
          x += dx % 2 ? -(dx + 1) / 2 : dx / 2;
          y += dy % 2 ? -(dy + 1) / 2 : dy / 2;
          if (id === 1) { cur = []; out.push(cur); }
          cur.push(x, y);
        }
      } else if (id === 7) {
        if (cur && cur.length) cur.push(cur[0], cur[1]);
      }
    }
    return out;
  }

  function readFeature(r, keys, vals) {
    const f = { type: 0, props: {}, geom: null };
    let tags = [], cmds = [];
    while (r.p < r.end) {
      const tag = r.varint(), fn = tag >> 3, w = tag & 7;
      if (fn === 2) { const s = r.sub(); while (s.p < s.end) tags.push(s.varint()); }
      else if (fn === 3) f.type = r.varint();
      else if (fn === 4) { const s = r.sub(); while (s.p < s.end) cmds.push(s.varint()); }
      else r.skip(w);
    }
    for (let i = 0; i + 1 < tags.length; i += 2) f.props[keys[tags[i]]] = vals[tags[i + 1]];
    f.geom = readGeometry(cmds);
    return f;
  }

  function readLayer(r) {
    let name = '', extent = 4096;
    const keys = [], vals = [], feats = [];
    while (r.p < r.end) {
      const tag = r.varint(), f = tag >> 3, w = tag & 7;
      if (f === 1) name = r.str();
      else if (f === 2) feats.push(r.sub());
      else if (f === 3) keys.push(r.str());
      else if (f === 4) vals.push(readValue(r.sub()));
      else if (f === 5) extent = r.varint();
      else r.skip(w);
    }
    return { name, extent, keys, vals, feats };
  }

  GV.decodeMVT = function (arrayBuffer, wanted) {
    const r = new Reader(new Uint8Array(arrayBuffer));
    const out = {};
    while (r.p < r.end) {
      const tag = r.varint(), f = tag >> 3, w = tag & 7;
      if (f !== 3) { r.skip(w); continue; }
      const L = readLayer(r.sub());
      if (wanted && !wanted.includes(L.name)) continue;
      out[L.name] = { extent: L.extent, features: L.feats.map(fr => readFeature(fr, L.keys, L.vals)) };
    }
    return out;
  };
})();
