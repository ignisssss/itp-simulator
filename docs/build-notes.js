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
.gloss { font-size: 8.6pt; line-height: 1.35; columns: 2; column-gap: 18px; background: #fbfcfd; border: 1px solid #dde6ee; border-radius: 4px; padding: 6px 10px; }
.gloss div { break-inside: avoid; margin-bottom: 2px; }
.gloss b { color: #0d3b5c; }
`;

// Обозначения и сокращения: в конспект попадают только те, что встречаются в его тексте
const GLOSSARY = [
  ['ИТП', 'индивидуальный тепловой пункт — узел ввода тепла в здание'],
  ['ПТО', 'пластинчатый теплообменник'],
  ['КЗР', 'клапан запорно-регулирующий с электроприводом — регулирует расход сетевой воды'],
  ['ПК', 'предохранительный клапан — сбрасывает воду при превышении давления'],
  ['V1', 'вводная задвижка на подаче теплосети'],
  ['V2', 'вводная задвижка на обратке теплосети'],
  ['T1', 'температура подачи теплосети, °C'],
  ['T2', 'температура обратки теплосети (после ПТО), °C'],
  ['T11', 'температура подачи в систему отопления дома, °C'],
  ['T21', 'температура обратки из системы отопления дома, °C'],
  ['P1', 'давление в подающем трубопроводе теплосети, бар'],
  ['P2', 'давление в обратном трубопроводе теплосети, бар'],
  ['P11', 'давление на нагнетании насоса (подача в дом), бар'],
  ['P21', 'давление на всасе насоса (обратка из дома), бар'],
  ['G1', 'расход сетевой воды, т/ч'],
  ['G2', 'расход воды в системе отопления дома, т/ч'],
  ['G', 'расход воды, т/ч'],
  ['Q', 'тепловая мощность, кВт'],
  ['ΔT', 'разность температур, °C (или К — для разности это одно и то же)'],
  ['ΔP', 'перепад давления, бар'],
  ['Kv', 'пропускная способность: расход воды (м³/ч) через элемент при перепаде 1 бар'],
  ['ε', 'эффективность теплообменника — доля от максимально возможной передачи тепла'],
  ['W', 'водяной эквивалент потока W = 1,163·G, кВт/°C'],
  ['NPSH', 'необходимый подпор на всасе насоса против кавитации'],
  ['бар', 'единица давления; 1 бар ≈ 1 кгс/см² ≈ 10,2 м водяного столба'],
  ['изб.', 'избыточное давление — показание манометра, сверх атмосферного'],
  ['абс.', 'абсолютное давление = избыточное + ≈ 1 бар'],
  ['т/ч', 'тонн воды в час; 1 т/ч ≈ 1 м³/ч'],
  ['Кд1, Кд2', 'краны на подаче и обратке системы отопления дома — отсекают дом от ИТП', 'Кд[12]'],
  ['Н1, Н2', 'рабочий и резервный циркуляционные насосы', '(?<![A-Za-zА-Яа-яЁё0-9])Н[12](?![0-9])'],
  ['КИПиА', 'служба контрольно-измерительных приборов и автоматики', 'КИПиА'],
  ['кран Маевского', 'ручной кран для выпуска воздуха из радиатора', 'Маевск'],
  ['наряд-допуск', 'письменное распоряжение на работы повышенной опасности с перечнем мер безопасности', 'наряд[а-яё]*-допуск'],
  ['СО', 'система отопления здания', '(?<![A-Za-zА-Яа-яЁё0-9])СО(?![A-Za-zА-Яа-яЁё0-9])', ''],
  ['ГВС', 'горячее водоснабжение'],
  ['ХВС', 'холодное водоснабжение (водопровод)'],
  ['В1', 'трубопровод (ввод) холодного водоснабжения ХВС и его вводной кран'],
  ['T3', 'подающий трубопровод ГВС в систему здания и температура в нем, °C'],
  ['T4', 'циркуляционный трубопровод ГВС (возврат из дома) и температура в нем, °C'],
  ['T_меж', 'температура воды ГВС после первой ступени преднагрева, °C', 'T_меж'],
  ['Нп', 'подпиточный насос'],
  ['Нц', 'циркуляционный насос ГВС'],
  ['РД', 'реле давления подпитки — включает и выключает Нп по давлению P21'],
  ['СанПиН', 'санитарные правила и нормы'],
  ['CIP', 'clean-in-place — химическая промывка оборудования на месте, без разборки', 'CIP'],
  ['байпас', 'обводная линия вокруг узла с ручной регулирующей арматурой', 'байпас'],
  ['трехходовой кран', 'кран манометра: рабочее положение — прибор на трубе, «0» — прибор на атмосфере', 'трехходов'],
  ['опрессовка', 'гидравлическое испытание системы давлением выше рабочего', 'опрессов'],
  ['P<sub>исп</sub>', 'испытательное давление при опрессовке, бар', 'P<sub>исп']
];

function glossaryFor(n) {
  const text = JSON.stringify(n).replace(/<sub>|<\/sub>/g, '').replace(/<[^>]+>/g, ' ');
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return GLOSSARY.filter(([term, , stem, flags]) => {
    if (stem) return new RegExp(stem, flags === undefined ? 'i' : flags).test(text);
    const re = new RegExp('(?<![A-Za-zА-Яа-яЁё0-9])' + esc(term) + '(?![A-Za-zА-Яа-яЁё0-9])', 'i');
    return re.test(text);
  });
}

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

<h2>Обозначения и сокращения</h2>
<div class="gloss">${glossaryFor(n).map(([t, d]) => `<div><b>${t}</b> — ${d}</div>`).join('')}</div>

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
