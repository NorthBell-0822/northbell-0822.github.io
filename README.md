# NorthBell / 少女唄日（しょうじょうか）公式サイト

バーチャルシンガー「少女唄日」のプロフィール・ポートフォリオサイト。
HTML / CSS / JavaScript のみの静的サイト（ビルド不要）。GitHub Pages（main ブランチ）で公開。

URL は `/profile/` のように末尾が `/` で、`.html` は表示されない。

## 構成（タブ＝ページ）

```
index.html             /           Top
profile/index.html     /profile/   Profile
works/index.html       /works/     Works（ポートフォリオ）
news/index.html        /news/      News
contact/index.html     /contact/   Contact
assets/css/style.css   見た目（色・文字サイズ・余白は先頭の :root）
assets/js/scene.js     背景の3D（すりガラスの立方体・三角すい）
assets/js/vendor/      three.js（r170）
assets/img/            キャラ画像・サムネ・OGP画像（ogp.jpg 1200x630）
assets/3d/             Blender 素材の置き場（将来 .glb を読み込む用）
```

## デザインのルール（黄金比 φ = 1.618）

- 画面の分割：61.8% : 38.2%
- 文字サイズ：11 / 13 / 21 / 34 / 55 / 89px
- 余白：8 / 13 / 21 / 34 / 55px
- 3D の配置：`scene.js` の `LAYOUTS`（画面に対する割合で指定）
- 背景の雲：`scene.js` の `SKY_FRAG`（写真は使わずノイズで描画）。ページごとの淡さは `<body data-sky-fade="0.25">`（0〜1、大きいほど白っぽい）

## 背景の世界（2種類）

- 雲の空（標準）：`/`
- 境界の風景（雲の海に、どこにも繋がっていない扉が並ぶ）：URL の末尾に `?world=gate`
  - 中身は `assets/js/gate.js`。標準にしたい時は `scene.js` の `WORLD` の初期値を `'gate'` に

## チェキ風の仕上げ

画面全体に、ふんわりした光・明るくやわらかい色・ピンクと黄色の光漏れ・細かい粒子をかけている（`scene.js` の `FILM_FRAG`）。
URL の末尾に `?film=off` を付けると外した状態を見られる。

## 保存してある状態

- コミット `562e298`：フィルム質感を入れる前（雲の空が標準）

## 3D の調整

`assets/js/scene.js` の `glass` の値で質感が変わる。

- `roughness`：すりガラスのぼけ具合（0 で透明ガラス）
- `iridescence`：パールの虹色の強さ

## 確認方法

ES モジュールを使っているので、ファイルを直接開くのではなくローカルサーバーで確認する。

```
python3 -m http.server 8000
# → http://localhost:8000/
```
