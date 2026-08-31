// 配布ページの回帰テスト。`node test.mjs` で実行する。
//
// 見張っているのは3つ。いずれも「一度直しても、次に触ると戻る」場所。
//
//  1. 端末判定が期待どおりか（クローラ・Kindle Fire・iPadOS の偽装UAを含む）
//  2. 主ボタンの付け替えが、自動遷移より「前」にあること
//  3. OGP の絶対URLが、いま配信しているドメインを指していること
//
// ロジックは実ファイルから抜き出す。書き写すと、ページを直したときに
// テストの方が嘘になる。

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(root, "index.html"), "utf8");
const DOMAIN = readFileSync(join(root, "CNAME"), "utf8").trim();

let failed = 0;
const fail = (m) => { console.log("  NG  " + m); failed++; };
const ok = (m) => console.log("  OK  " + m);

/* ---------- 1. 端末判定 ---------- */
const m = html.match(/function detect\([\s\S]*?\n  \}/);
if (!m) { console.error("detect() を抽出できませんでした"); process.exit(1); }
const detect = new Function("return (" + m[0] + ")")();

const cases = [
  ["iPhone Safari", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1", "iPhone", 5, "ios"],
  ["iPadOS デスクトップUA(既定)", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15", "MacIntel", 5, "ios"],
  ["iPad モバイルUA", "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1", "iPad", 5, "ios"],
  ["Instagram iOS", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Instagram 300.0", "iPhone", 5, "ios"],
  ["LINE iOS", "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 Line/13.0", "iPhone", 5, "ios"],
  ["Android Chrome", "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36", "Linux armv8l", 5, "android"],
  ["LINE Android", "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 Chrome/119 Line/14.5.0", "Linux armv8l", 5, "android"],
  // 実測値。エミュレーションでは platform が MacIntel を返しつつ Android UA になる。
  // Android を Mac+タッチ判定より先に見ていないと、これが ios に化ける。
  ["Android（platform が MacIntel を返す）", "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36", "MacIntel", 5, "android"],
  ["Mac Safari", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15", "MacIntel", 0, "other"],
  ["Windows タッチ機", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120", "Win32", 10, "other"],
  ["Kindle Fire (Play なし)", "Mozilla/5.0 (Linux; Android 9; KFTHW) AppleWebKit/537.36 Silk/119 Safari/537.36", "Linux armv8l", 5, "other"],
  ["Googlebot Smartphone", "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X) AppleWebKit/537.36 (compatible; Googlebot/2.1)", "", 0, "other"],
  ["facebookexternalhit", "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)", "", 0, "other"],
  ["platform が空の iPad", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15", "", 5, "ios"],
];

console.log("端末判定");
for (const [name, ua, plat, mtp, want] of cases) {
  const got = detect(ua, plat, mtp);
  got === want ? ok(`${name} -> ${got}`) : fail(`${name} -> ${got}（期待 ${want}）`);
}

/* ---------- 2. 付け替えが遷移より前にあること ---------- */
console.log("\n実行順序");
const iSwap = html.indexOf('classList.add("primary")');
const iRedirect = html.indexOf("location.replace(");
const iStay = html.search(/\[\?&\]stay/);

if (iSwap === -1) fail("主ボタンの付け替えが見つかりません");
else if (iRedirect === -1) ok("自動遷移なし（付け替えの順序は問題にならない）");
else if (iSwap < iRedirect) ok("付け替えが自動遷移より前にある");
else fail("付け替えが自動遷移より後ろにあります。遷移が塞がれた環境で、間違ったストアが主役の画面が残ります");

if (iStay !== -1 && iSwap !== -1) {
  iSwap < iStay
    ? ok("付け替えが ?stay の early return より前にある")
    : fail("?stay を付けると付け替えが飛ばされます（early return の先にあります）");
}

/* ---------- 3. OGP がいまのドメインを指していること ---------- */
console.log("\nOGP の絶対URL");
for (const prop of ["og:url", "og:image", "twitter:image"]) {
  const mm = html.match(new RegExp(`(?:property|name)="${prop}"[^>]*content="([^"]+)"`));
  if (!mm) { fail(`${prop} がありません`); continue; }
  const url = mm[1];
  if (!/^https:\/\//.test(url)) fail(`${prop} が絶対URLではありません: ${url}`);
  else if (!url.includes(DOMAIN)) fail(`${prop} が配信ドメイン(${DOMAIN})を指していません: ${url}`);
  else ok(`${prop} -> ${url}`);
}

console.log(failed === 0 ? "\nすべて期待どおり" : `\n${failed}件が期待と違います`);
process.exit(failed === 0 ? 0 : 1);
