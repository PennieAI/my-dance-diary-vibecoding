import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the anonymized dance diary", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /MY DANCE DIARY/);
  assert.match(html, /120/);
  assert.match(html, /数据备份/);
  assert.match(html, /月视图/);
  assert.match(html, /周视图/);
  assert.match(html, /平均舞力指数/);
  assert.match(html, /当前单节课价/);
  assert.match(html, /已使用卡期/);
  assert.match(html, /课次进度/);
  assert.match(html, /时间进度/);
  assert.doesNotMatch(html, /真实课表|真实老师|真实金额|Pennie|PENNIE|10728|小玥|小羽|萝卜/);
});

test("keeps configuration separate from product logic", async () => {
  const [calendar, config, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/DanceCalendar.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/dance-config.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(config, /const ANNUAL_SPEND = 3600/);
  assert.match(config, /const TARGET_COUNT = 120/);
  assert.match(config, /const MONTHLY_TARGET = 10/);
  assert.match(config, /const BACKUP_APP_ID = "my-dance-diary"/);
  assert.match(config, /my-dance-diary-demo-v1/);
  assert.match(config, /老师 A/);
  assert.match(config, /Demo values only/);
  assert.match(config, /Demo schedule only/);
  assert.match(calendar, /shiftDateKey\(chinaDateKey\(\), -1\)/);
  assert.match(calendar, /calendar-view-switch/);
  assert.match(calendar, /week-head-metrics/);
  assert.match(calendar, /danceIndex/);
  assert.match(calendar, /exportBackup/);
  assert.match(calendar, /importBackup/);
  assert.match(calendar, /backupPanelRef/);
  assert.match(calendar, /scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
  assert.match(calendar, /aria-controls="data-backup-panel"/);
  assert.match(calendar, /aria-expanded=\{showBackup\}/);
  assert.match(calendar, /导出数据/);
  assert.match(calendar, /导入数据/);
  assert.match(calendar, /近月节奏/);
  assert.match(calendar, /remainingPassDays/);
  assert.match(calendar, /visibleLinkedMonthStats/);
  assert.match(calendar, /window\.localStorage/);
  assert.doesNotMatch(calendar, /Pennie|PENNIE|10728|小玥|小羽|萝卜/);
  assert.match(layout, /Vibe Coding 练舞打卡/);
  assert.doesNotMatch(layout, /chatgpt\.site/);
  assert.match(packageJson, /my-dance-diary-vibecoding/);
});

test("omits the obsolete nodejs compatibility flag from the worker build", async () => {
  const workerConfig = JSON.parse(
    await readFile(new URL("../dist/server/wrangler.json", import.meta.url), "utf8"),
  );
  assert.equal("compatibility_flags" in workerConfig, false);
});
