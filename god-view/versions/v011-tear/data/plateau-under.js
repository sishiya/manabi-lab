// plateau-under.js — PLATEAU の地下のデータ（地下街・地下埋設物）の一覧。2026-10-05 にカタログ API から手で作成（数が少ないため）。
// 範囲 bb は tileset.json の root の region（度）、geoid はその区・市の建物の索引と同じジオイド高（m）。
// URL は GV.PLATEAU_PREFIX を省いたもの。出典: 国土交通省 Project PLATEAU。
'use strict';
window.GV = window.GV || {};

// 3D Tiles（本当の深さ・形）
GV.PLATEAU_UNDER = [
  // 地下街（LOD4、写真つき）
  { kind: 'mall', name: '札幌（さっぽろ地下街など）', bb: [141.34959, 43.05502, 141.3568, 43.0655], geoid: 32.45, url: '9c/85884b-ae29-434e-8f48-02e20fd6397b/01100_sapporo-shi_city_2020_citygml_7_op_ubld_3dtiles_lod4/tileset.json' },
  { kind: 'mall', name: '東京駅・八重洲（千代田区）', bb: [139.76766, 35.67848, 139.77164, 35.68275], geoid: 36.84, url: 'a6/9bd820-9d7c-4d7e-ba79-369f9b245d09/13101_chiyoda-ku_pref_2025_citygml_1_op_ubld_3dtiles_lod4/tileset.json' },
  { kind: 'mall', name: '東京駅・八重洲（中央区）', bb: [139.76766, 35.67848, 139.77164, 35.68275], geoid: 36.66, url: '4b/59935f-b488-4701-891d-adee4492ab2f/13102_chuo-ku_pref_2025_citygml_1_op_ubld_3dtiles_lod4/tileset.json' },
  { kind: 'mall', name: '新宿', bb: [139.69803, 35.6907, 139.70362, 35.69501], geoid: 37.11, url: '7d/d6f2c5-80ca-4c58-ac34-a67de3786d04/13104_shinjuku-ku_pref_2025_citygml_1_op_ubld_3dtiles_lod4/tileset.json' },
  { kind: 'mall', name: '上野・浅草（台東区）', bb: [139.77248, 35.70726, 139.79811, 35.71243], geoid: 36.94, url: '8d/91afeb-528e-46d5-8796-d0dcb9d850d0/13106_taito-ku_city_2025_citygml_1_op_ubld_3dtiles_lod4/tileset.json' },
  { kind: 'mall', name: '渋谷', bb: [139.69851, 35.65835, 139.70305, 35.66133], geoid: 36.95, url: 'ea/284655-a1e2-46c1-bdb5-ee4a66af67a3/13113_shibuya-ku_pref_2025_citygml_1_op_ubld_3dtiles_lod4/tileset.json' },
  { kind: 'mall', name: '池袋', bb: [139.70939, 35.72805, 139.71337, 35.73137], geoid: 37.29, url: 'd0/b74723-d536-4f18-89fd-1770b143041f/13116_toshima-ku_pref_2025_citygml_1_op_ubld_3dtiles_lod4/tileset.json' },
  // 地下埋設物（長岡市、LOD3）
  { kind: 'sewer', name: '長岡市の下水道管', bb: [138.74343, 37.40634, 138.75771, 37.43125], geoid: 39.82, url: '9c/425424-d404-4018-a3b2-62865beb97ec/15202_nagaoka-shi_city_2024_citygml_1_op_unf_SewerPipe_3dtiles_lod3/tileset.json' },
  { kind: 'manhole', name: '長岡市のマンホール', bb: [138.74347, 37.40633, 138.75752, 37.43126], geoid: 39.82, url: '3a/1feb2e-5c73-4ff5-8d4a-4e09c156b879/15202_nagaoka-shi_city_2024_citygml_1_op_unf_Manhole_3dtiles_lod3/tileset.json' },
];

// 平面の線だけのもの（ベクトルタイル、ズーム8〜18。深さ・太さのデータはない → 深さは推定で描く）
GV.PLATEAU_PIPES = {
  bb: [138.7372966, 37.4061466, 138.7678912, 37.4312582],   // 水道管の metadata.json の bounds
  z: 15,
  layers: [
    { kind: 'water', name: '水道管', layer: 'WaterPipe', color: '#3fa9ff', url: '6a/32a335-2c05-472a-b968-fa8a9fc8703a/15202_nagaoka-shi_city_2024_citygml_1_op_unf_WaterPipe_dm_geometric_attributes/{z}/{x}/{y}.mvt' },
    { kind: 'gas', name: 'ガス管', layer: 'OilGasChemicalsPipe', color: '#ffd23f', url: '15/1ce457-a819-4e65-bd09-ef0ecc4adf15/15202_nagaoka-shi_city_2024_citygml_1_op_unf_OilGasChemicalsPipe_dm_geometric_attributes/{z}/{x}/{y}.mvt' },
    { kind: 'other', name: 'その他の管路（電気・通信など）', layer: 'Pipe', color: '#c58bff', url: '17/26a0b7-c31e-41bc-a811-f2cb6d8ffede/15202_nagaoka-shi_city_2024_citygml_1_op_unf_Pipe_dm_geometric_attributes/{z}/{x}/{y}.mvt' },
  ],
};
