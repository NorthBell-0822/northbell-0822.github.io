# NorthBell / 少女唄日（しょうじょうか）公式サイト

バーチャルシンガー「少女唄日」のプロフィール・ポートフォリオサイト。
HTML / CSS のみの静的サイト（ビルド不要）。GitHub Pages で公開する想定。

## 構成（タブ＝ページ）

```
index.html            Top
profile/index.html    Profile
works/index.html      Works（ポートフォリオ）
news/index.html       News
contact/index.html    Contact
assets/css/style.css  見た目（色・ガラスの強さは先頭の :root で調整）
assets/img/           立ち絵・サムネ・OGP画像（ogp.jpg 1200x630）
assets/3d/            Blender で書き出した3D素材（透過 webp / png）
```

## 更新のしかた

- 作品を追加：`works/index.html` の `<a class="work glass">…</a>` をコピー
- お知らせを追加：`news/index.html` の `<li>` を一番上に追加
- タブを増やす：全ページの `<nav class="tabbar">` に同じ行を追加

## 公開（GitHub Pages）

Settings → Pages → Branch を `main` / `/ (root)` にして保存。
