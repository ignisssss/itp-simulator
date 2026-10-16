#!/usr/bin/env node
/*
 * Сборка PDF-конспектов к обучалкам.
 *   node docs/build-notes.js
 * Берет тексты из docs/notes-content.js, делает HTML и печатает его в PDF
 * через Chrome/Edge без окна (headless). Результат: docs/notes/NN-id.pdf.
 * Путь к браузеру можно задать переменной окружения CHROME.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const notes = require('./notes-content.js');
const OUT = path.join(__dirname, 'notes');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'itp-notes-'));

const BROWSERS = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
].filter(Boolean);
const browser = BROWSERS.find(p => fs.existsSync(p));
if (!browser) { console.error('Не найден Chrome/Edge. Укажите путь в переменной CHROME.'); process.exit(1); }

const CSS = `
@page { size: A4; margin: 14mm 14mm 16mm; }
* { box-sizing: border-box; }
body { font-family: "Segoe UI", Arial, sans-serif; font-size: 10.2pt; line-height: 1.45; color: #1b2430; margin: 0; }
.head { background: #0d1b2a; color: #e6f1fb; padding: 14px 18px 12px; border-radius: 6px; }
.head .kicker { font-size: 8.5pt; letter-spacing: .14em; text-transform: uppercase; color: #7cc4f0; }
.head h1 { font-size: 19pt; margin: 4px 0 2px; font-weight: 700; }
.head .sub { font-size: 10pt; color: #b9cde0; }
h2 { font-size: 12pt; margin: 16px 0 6px; color: #0d3b5c; border-bottom: 1.5px solid #cfe3f2; padding-bottom: 3px; break-after: avoid; }
h3 { font-size: 10.5pt; margin: 10px 0 3px; color: #12324a; break-after: avoid; }
p { margin: 0 0 6px; }
.situation { background: #f2f7fb; border-left: 4px solid #2b8ac6; padding: 8px 12px; border-radius: 0 4px 4px 0; margin-top: 12px; }
.formula { font-family: "Cambria Math", "Times New Roman", serif; font-size: 12pt; text-align: center; background: #fbfcfd; border: 1px solid #dde6ee; border-radius: 4px; padding: 6px; margin: 6px 0 8px; }
table { width: 100%; border-collapse: collapse; margin: 4px 0 8px; font-size: 9.4pt; }
th, td { border: 1px solid #d3dde6; padding: 5px 7px; vertical-align: top; text-align: left; }
th { background: #e8f1f8; color: #0d3b5c; font-weight: 600; }
tr { break-inside: avoid; }
td.n { width: 22px; text-align: center; color: #5a7186; }
td.do { width: 22%; font-weight: 600; }
.mist td:first-child { width: 38%; font-weight: 600; color: #8a1c1c; }
ol.q { margin: 4px 0 0 18px; padding: 0; }
ol.q li { margin-bottom: 3px; }
ul.norms { margin: 4px 0 0 18px; padding: 0; font-size: 9.2pt; color: #33475b; }
.foot { margin-top: 14px; font-size: 8.2pt; color: #6b7d8f; border-top: 1px solid #dde6ee; padding-top: 6px; }
.small-table td, .small-table th { text-align: center; }
`;

function section(t) {
  let h = `<h3>${t.h}</h3>`;
  (t.p || []).forEach(x => { h += `<p>${x}</p>`; });
  if (t.formula) h += `<div class="formula">${t.formula}</div>`;
  if (t.table) {
    h += '<table class="small-table">' + t.table.map((row, i) =>
      '<tr>' + row.map(c => i === 0 ? `<th>${c}</th>` : `<td>${c}</td>`).join('') + '</tr>').join('') + '</table>';
  }
  (t.after || []).forEach(x => { h += `<p>${x}</p>`; });
  return h;
}

function page(n) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${n.n}. ${n.title}</title><style>${CSS}</style></head><body>
<div class="head">
  <div class="kicker">Тренажер ИТП · Конспект к обучалке № ${n.n}</div>
  <h1>${n.title}</h1>
  <div class="sub">${n.subtitle}</div>
</div>
<div class="situation"><b>Ситуация.</b> ${n.situation}</div>

<h2>Теория: что нужно понимать</h2>
${n.theory.map(section).join('\n')}

<h2>Каждый шаг: почему именно так</h2>
<table>
  <tr><th></th><th>Действие</th><th>Физика: что происходит</th><th>Эксплуатация и безопасность: чем диктуется</th></tr>
  ${n.steps.map((s, i) => `<tr><td class="n">${i + 1}</td><td class="do">${s.do}</td><td>${s.physics}</td><td>${s.rules}</td></tr>`).join('\n  ')}
</table>

<h2>Типичные ошибки и их последствия</h2>
<table class="mist">
  <tr><th>Ошибка</th><th>Последствие</th></tr>
  ${n.mistakes.map(m => `<tr><td>${m[0]}</td><td>${m[1]}</td></tr>`).join('\n  ')}
</table>

<h2>Вопросы для самопроверки</h2>
<ol class="q">${n.questions.map(q => `<li>${q}</li>`).join('')}</ol>

<h2>На что опираться</h2>
<ul class="norms">${n.norms.map(x => `<li>${x}</li>`).join('')}</ul>

<div class="foot">Учебный материал к тренажеру ИТП. Числовые значения — параметры учебной модели (9-этажный дом, T<sub>нар</sub> = −10 °C).
На реальном объекте руководствуйтесь проектом, паспортами оборудования, местной производственной инструкцией и действующими редакциями нормативных документов.</div>
</body></html>`;
}

fs.mkdirSync(OUT, { recursive: true });
for (const n of notes) {
  const name = `${String(n.n).padStart(2, '0')}-${n.id}`;
  const html = path.join(TMP, name + '.html');
  const pdf = path.join(OUT, name + '.pdf');
  fs.writeFileSync(html, page(n), 'utf8');
  if (process.env.NOTES_HTML_DIR) fs.writeFileSync(path.join(process.env.NOTES_HTML_DIR, name + '.html'), page(n), 'utf8');
  execFileSync(browser, [
    '--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--no-first-run',
    `--user-data-dir=${path.join(TMP, 'profile')}`,
    `--print-to-pdf=${pdf}`,
    'file:///' + html.replace(/\\/g, '/')
  ], { stdio: 'ignore', timeout: 60000 });
  console.log('✓', path.relative(path.join(__dirname, '..'), pdf));
}
fs.rmSync(TMP, { recursive: true, force: true });
