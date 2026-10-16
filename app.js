/*
 * app.js — главный цикл тренажера ИТП: связка пульта с физическим ядром,
 * анимация мнемосхемы, табло аварий, тренд и журнал событий.
 */
(function () {
  'use strict';

  const P = window.ITPPhysics;
  const C = P.CONST;
  const DT = 0.1;          // с, шаг модели
  const TICK_MS = 100;     // мс, период цикла
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const sim = P.createSimulator();
  P.step(sim, 0); // заполнить sim.out
  let speed = 1;
  let paused = false;

  const $ = id => document.getElementById(id);

  // ---------------------------------------------------------------------------
  // Справочник «Зачем нужен этот элемент?»
  // ---------------------------------------------------------------------------
  const INFO = {
    valves: {
      icon: '🔩', title: 'Задвижки V1 / V2',
      body: `<p><b>Запорная арматура</b> на вводе теплосети: V1 — на подающем трубопроводе, V2 — на обратном.</p>
        <p class="mt-2">Работает только в двух положениях: <b>«открыто» или «закрыто»</b>. Регулировать расход задвижкой нельзя —
        поток в узкой щели срывает и размывает кромку затвора, после чего задвижка перестает держать.</p>
        <p class="mt-2">В тренажере задвижка управляется кнопкой «Открыть / Закрыть»: затвор за ~8 с проходит от одного крайнего
        положения до другого, остановить его посередине нельзя. Команду можно развернуть на ходу.</p>
        <p class="mt-2">Перед ремонтом на закрытые задвижки вешают плакат <b>«Не открывать — работают люди»</b> (кнопка «Плакат»),
        а дренажи на отключенном участке оставляют открытыми, чтобы пропуск задвижки не поднял давление.</p>
        <p class="mt-2">Порядок отключения ИТП: <b>сначала закрыть подачу V1, затем обратку V2</b>. Включение — в обратном порядке:
        сначала V2, затем V1. Если закрыть только обратку, ПТО окажется под полным давлением подачи (6.5 бар).</p>`
    },
    netdrain: {
      icon: '🪣', title: 'Дренаж и воздушник сетевого участка',
      body: `<p>Участок между вводными задвижками V1 и V2 (грязевик, КЗР, ПТО) нельзя ремонтировать, пока в нем есть вода под
        давлением. Закрытые задвижки только <b>отсекают</b> участок — давление и горячая вода остаются внутри.</p>
        <p class="mt-2"><b>Дренаж</b> стоит в нижней точке (перед V2): через него сбрасывают давление и сливают воду.
        <b>Воздушник</b> — в верхней точке (вход ПТО): при сливе он впускает воздух, иначе вода уходит очень медленно;
        при заполнении выпускает воздух, иначе образуется воздушная пробка.</p>
        <p class="mt-2">Если после закрытия V1 и V2 давление на манометрах не падает до нуля при открытом дренаже — одна из задвижек
        пропускает, вскрывать нельзя. Дренаж при открытой задвижке — это слив сетевой воды в канализацию и штраф.</p>
        <p class="mt-2">Если КЗР закрыт, грязевик отсечен от дренажа и останется под давлением — перед сливом откройте КЗР.</p>`
    },
    strainer: {
      icon: '🧲', title: 'Грязевик (сетчатый фильтр)',
      body: `<p>Ловит ржавчину, окалину и песок из теплосети, спасая <b>узкие каналы пластин ПТО</b> и <b>седло регулирующего клапана КЗР</b>.</p>
        <p class="mt-2">Диагностируется по <b>двум манометрам — до и после</b> фильтра. Чистый грязевик теряет сотые доли бара;
        перепад больше 0.6 бар означает, что сетка забита и ее пора промывать.</p>
        <p class="mt-2">Засоренный фильтр «съедает» располагаемый напор: даже полностью открытый КЗР не сможет пропустить нужный расход.</p>
        <p class="mt-2"><b>Промывка:</b> закрыть V1, затем V2 → открыть дренаж и воздушник сети → дождаться 0 бар и полного слива →
        «Вскрыть и промыть» → закрыть дренаж, заполнить участок через V2 с открытым воздушником → закрыть воздушник → открыть V1.</p>`
    },
    kzr: {
      icon: '🎛️', title: 'Клапан КЗР с электроприводом',
      body: `<p><b>Главный рабочий орган регулирования мощности ИТП.</b> Меняет расход греющей сетевой воды через ПТО.</p>
        <p class="mt-2">Больше открыт → больше расход G1 → выше T11 в доме, но и выше температура обратки T2 (штраф теплосети).
        Меньше открыт → недотоп.</p>
        <p class="mt-2">В реальном ИТП им управляет погодный контроллер по датчику наружного воздуха и T11. Здесь вы — контроллер:
        рабочая зона около 45…50 %.</p>`
    },
    hex: {
      icon: '♨️', title: 'ПТО — пластинчатый теплообменник',
      body: `<p>Передает тепло через <b>гофрированные стальные пластины</b> без смешения сетевой и домовой воды.</p>
        <p class="mt-2">На схеме видно устройство: между пластинами чередуются каналы. В каждом втором канале идет
        <b>сетевая вода — сверху вниз</b> (от T1 к T2), в соседних — <b>домовая вода снизу вверх</b> (от T21 к T11). Это противоток:
        самая горячая сетевая вода греет уже нагретую домовую, поэтому тепло передается эффективно. Резиновые уплотнения
        направляют каждый поток только в «свои» каналы, а коллекторы сверху и снизу раздают воду по всем каналам сразу.</p>
        <p class="mt-2">Благодаря независимой схеме давление и качество воды теплосети не попадают в стояки дома.</p>
        <p class="mt-2">Число в центре — текущая тепловая мощность <b>Q, кВт</b>. Если домовая вода не циркулирует, пластины
        перегреваются до температуры сети и обрастают накипью.</p>`
    },
    pump: {
      icon: '🌀', title: 'Циркуляционный насос',
      body: `<p>Крутит воду по стоякам и радиаторам дома. Важно: насос <b>не создает статического давления, а только перепад</b>
        (здесь 1.8 бар): P11 = P21 + 1.8.</p>
        <p class="mt-2">Если давление на всасе P21 упадет ниже 1.5 бар — начнется <b>кавитация</b>: вода вскипает на лопатках колеса и
        разрушает его, циркуляция срывается.</p>`
    },
    makeup: {
      icon: '💧', title: 'Линия подпитки',
      body: `<p>Статическое давление, нужное чтобы вода дошла до верхних этажей, держит <b>линия подпитки</b> из сетевой обратки
        (через обратный клапан). Штатное давление на всасе — <b>3.5 бар</b>.</p>
        <p class="mt-2">Открытая подпитка поднимает P21 к давлению сетевой обратки (4.5 бар), и тогда P11 = 4.5 + 1.8 = 6.3 бар —
        сработает предохранительный клапан. Поэтому подпитку открывают ненадолго и следят за манометром.</p>`
    },
    relief: {
      icon: '🛡️', title: 'Предохранительный клапан (ПК 6.0 бар)',
      body: `<p>Последний рубеж защиты внутреннего контура: при давлении выше <b>6.0 бар</b> пружина открывает клапан и сбрасывает воду,
        не давая разорвать радиаторы на нижних этажах. Садится обратно ниже 5.9 бар.</p>
        <p class="mt-2">Срабатывание ПК — всегда авария: нужно найти причину (обычно — открытая подпитка).</p>`
    },
    drain: {
      icon: '🚰', title: 'Дренаж',
      body: `<p>Кран сброса воды из внутреннего контура в канализацию. Нужен для ремонта и для снижения давления.</p>
        <p class="mt-2">Открытый дренаж опускает P21 почти до нуля — работающий насос уйдет в кавитацию. После дренажа давление
        поднимают подпиткой до 3.5 бар.</p>`
    },
    building: {
      icon: '🏢', title: 'Система отопления дома',
      body: `<p>Стояки и радиаторы 9-этажного дома. Вода приходит с температурой <b>T11</b> (норма 70…80 °C), отдает тепло квартирам
        и возвращается с температурой <b>T21</b> примерно на 30 °C ниже.</p>
        <p class="mt-2"><b>Давления в контуре дома.</b> Насос создает перепад 1.8 бар: 0.5 бар теряется в ПТО, 1.3 бар — в стояках
        и радиаторах (это «ΔP дома» между подачей и обраткой). Статическое давление задает подпитка: верхние радиаторы стоят
        на 27 м выше ИТП, а столб воды такой высоты «съедает» 2.65 бар. Чтобы на 9-м этаже оставался запас ≥ 0.5 бар,
        на всасе насоса держат около 3.5 бар. При меньшем давлении верхние этажи завоздушиваются.</p>
        <p class="mt-2">Цвет окон показывает самочувствие жильцов: голубой — холодно, теплый — норма, красный — душно.</p>`
    }
  };

  function openInfo(key) {
    const it = INFO[key];
    if (!it) return;
    if (window.ITPLessons) window.ITPLessons.onInfo(key);
    $('infoIcon').textContent = it.icon;
    $('infoTitle').textContent = it.title;
    $('infoBody').innerHTML = it.body;
    const m = $('infoModal');
    m.classList.remove('hidden');
    m.classList.add('flex');
  }
  function closeInfo() {
    const m = $('infoModal');
    m.classList.add('hidden');
    m.classList.remove('flex');
  }
  document.querySelectorAll('[data-info]').forEach(el =>
    el.addEventListener('click', () => openInfo(el.dataset.info)));
  $('infoClose').addEventListener('click', closeInfo);
  $('infoModal').addEventListener('click', e => { if (e.target.id === 'infoModal') closeInfo(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeInfo(); });

  // ---------------------------------------------------------------------------
  // Показания приборов на схеме
  // ---------------------------------------------------------------------------
  // rows: [название, ключ в sim.out, единицы, знаков]
  const TAGS = [
    { x: 22, y: 16, w: 94, rows: [['T1', 'T1', '°C', 1], ['P1', 'P1', 'бар', 2]] },
    { x: 190, y: 128, w: 112, rows: [['P до', 'P_before_strainer', 'бар', 2], ['P после', 'P_after_strainer', 'бар', 2]] },
    { x: 320, y: 104, w: 112, rows: [['P пто', 'P_hex_net', 'бар', 2], ['G1', 'G1', 'т/ч', 1]] },
    { x: 22, y: 362, w: 94, rows: [['T2', 'T2', '°C', 1], ['P2', 'P2', 'бар', 2]] },
    { x: 560, y: 16, w: 100, rows: [['T11', 'T11', '°C', 1], ['G2', 'G2', 'т/ч', 1]] },
    { x: 532, y: 456, w: 88, rows: [['P11', 'P11', 'бар', 2]] },
    { x: 664, y: 456, w: 88, rows: [['P21', 'P21', 'бар', 2]] },
    { x: 736, y: 376, w: 88, rows: [['T21', 'T21', '°C', 1]] },
    { x: 806, y: 16, w: 120, rows: [['P подача', 'P_house_supply', 'бар', 2]] },
    { x: 694, y: 188, w: 128, rows: [['P 9 эт.', 'P_top', 'бар', 2], ['ΔP дома', 'dP_house', 'бар', 2]] }
  ];
  const tagEls = {};

  function svgEl(name, attrs, parent) {
    const el = document.createElementNS(SVG_NS, name);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }

  (function buildTags() {
    const g = $('tags');
    TAGS.forEach(t => {
      const h = 8 + t.rows.length * 20;
      svgEl('rect', { x: t.x, y: t.y, width: t.w, height: h, rx: 3, class: 'tag-box' }, g);
      t.rows.forEach((r, i) => {
        const y = t.y + 20 + i * 20;
        svgEl('text', { x: t.x + 5, y: y - 1, class: 'tag-name' }, g).textContent = r[0];
        const v = svgEl('text', { x: t.x + t.w - 5, y, 'text-anchor': 'end', class: 'tag-val' }, g);
        tagEls[r[1]] = { el: v, unit: r[2], digits: r[3] };
      });
    });

    // Окна дома: 9 этажей × 5 окон
    const w = $('houseWindows');
    for (let f = 0; f < 9; f++) {
      for (let k = 0; k < 5; k++) {
        svgEl('rect', { x: 842 + k * 26, y: 178 + f * 19, width: 16, height: 11, rx: 1, class: 'win', fill: '#f5c26b' }, w);
      }
    }
  })();

  function tagState(key, o) {
    switch (key) {
      case 'T11': return (o.T11 < C.T11_MIN || o.T11 > C.T11_MAX) ? 'warn' : '';
      case 'T2': return (o.G1 > 0 && o.T2 > C.T2_MAX) ? 'warn' : '';
      case 'P_hex_net': return (sim.controls.V2 < C.CLOSED_PCT && o.P_hex_net > 6.0) ? 'bad' : '';
      case 'P_after_strainer': return o.dP_strainer > C.STRAINER_DP_WARN ? 'warn' : '';
      case 'P21': return (sim.controls.PUMP && o.P21 < C.P21_CAVITATION) ? 'bad' : (o.P21 < 3.0 || o.P21 > 4.0 ? 'warn' : '');
      case 'P11': return o.reliefOpen ? 'bad' : '';
      case 'P_top': return o.P_top < C.TOP_FLOOR_MIN_P ? (o.topFloorDry ? 'bad' : 'warn') : '';
      case 'dP_house': return (sim.controls.PUMP && o.dP_house < 0.1) ? 'warn' : '';
      case 'G1': return (!sim.controls.PUMP && o.G1 > 1) ? 'bad' : '';
      default: return '';
    }
  }

  // ---------------------------------------------------------------------------
  // Цвета и анимация потока
  // ---------------------------------------------------------------------------
  function tempColor(t) {
    // 20 °C — синий, 95 °C — красный
    const x = Math.min(1, Math.max(0, (t - 20) / 75));
    const hue = 215 - 215 * x;
    return `hsl(${hue.toFixed(0)}, 80%, ${(48 + 6 * x).toFixed(0)}%)`;
  }

  const flowCache = {};
  /** Скорость штрихов пропорциональна расходу; при G = 0 поток стоит. */
  function setFlow(id, rate, pxPerUnit) {
    const el = $(id);
    const on = rate > 0.01;
    const speedPx = Math.max(6, rate * pxPerUnit); // px/с
    const dur = on ? (20 / speedPx).toFixed(2) + 's' : '';
    const key = on + dur;
    if (flowCache[id] === key) return;
    flowCache[id] = key;
    el.classList.toggle('on', on);
    if (on) el.style.animationDuration = dur;
  }

  function setValve(id, pct, moving) {
    const el = $(id);
    el.classList.remove('valve-open', 'valve-part', 'valve-closed', 'valve-moving');
    el.classList.add(moving ? 'valve-moving' : pct < C.CLOSED_PCT ? 'valve-closed' : (pct >= 99.5 ? 'valve-open' : 'valve-part'));
  }

  // ---------------------------------------------------------------------------
  // Пульт управления
  // ---------------------------------------------------------------------------
  const ctlRows = Array.from(document.querySelectorAll('.ctl'));

  const gateRows = Array.from(document.querySelectorAll('.gate'));

  function gateMoving(k) {
    const pos = sim.controls[k];
    return sim.controls[k + 'cmd'] === 'open' ? pos < 100 : pos > 0;
  }

  function renderGates() {
    gateRows.forEach(row => {
      const k = row.dataset.gate;
      const pos = sim.controls[k];
      const opening = sim.controls[k + 'cmd'] === 'open';
      const moving = gateMoving(k);
      const btn = row.querySelector('.gate-btn');
      btn.textContent = opening ? '▼ Закрыть' : '▲ Открыть';
      btn.className = 'gate-btn w-28 py-1.5 rounded text-xs font-semibold border bg-slate-800 ' +
        (opening ? 'border-red-500/70 text-red-200 hover:bg-red-900/40' : 'border-green-500/70 text-green-200 hover:bg-green-900/40');
      const bar = row.querySelector('.gate-bar');
      bar.style.width = pos.toFixed(1) + '%';
      bar.style.background = moving ? '#f59e0b' : (pos >= 100 ? '#22c55e' : '#ef4444');
      const tag = row.querySelector('.tag-btn');
      const tagged = sim.controls[k + 'tag'];
      tag.textContent = tagged ? '🔒 Плакат' : 'Плакат';
      tag.className = 'tag-btn px-2 py-1.5 rounded text-xs border ' +
        (tagged ? 'bg-red-800/50 border-red-500 text-red-100' : 'bg-slate-800 border-slate-600 text-slate-400 hover:border-red-500');
      $('tag' + k).toggleAttribute('hidden', !tagged);
      row.querySelector('.gate-state').textContent = moving
        ? (opening ? 'открывается… ' : 'закрывается… ') + Math.round(pos) + '%'
        : (pos >= 100 ? 'ОТКРЫТА · 100%' : 'ЗАКРЫТА · 0%');
    });
  }

  gateRows.forEach(row => {
    const k = row.dataset.gate;
    row.querySelector('.tag-btn').addEventListener('click', () => {
      sim.controls[k + 'tag'] = !sim.controls[k + 'tag'];
      log(sim.controls[k + 'tag'] ? `Оператор: на ${k} вывешен плакат «Не открывать — работают люди»` : `Оператор: плакат с ${k} снят`, 'op');
      renderGates();
    });
    row.querySelector('.gate-btn').addEventListener('click', () => {
      const open = sim.controls[k + 'cmd'] !== 'open';
      sim.controls[k + 'cmd'] = open ? 'open' : 'close';
      log(`Оператор: ${k} — команда «${open ? 'открыть' : 'закрыть'}»`, 'op');
      renderGates();
    });
  });

  function toggleBtn(el, on, onText) {
    el.textContent = on ? onText : 'ЗАКРЫТ';
    el.className = 'py-2 rounded text-sm font-semibold border ' +
      (on ? 'bg-amber-700/40 border-amber-500 text-amber-200' : 'bg-slate-800 border-slate-600 text-slate-400');
  }

  function syncControlsUI() {
    ctlRows.forEach(row => {
      const key = row.dataset.ctl;
      const val = sim.controls[key];
      row.querySelector('input').value = val;
      row.querySelector('[data-val]').textContent = Math.round(val) + '%';
    });
    const pb = $('pumpBtn');
    pb.textContent = sim.controls.PUMP ? '● ВКЛЮЧЕН' : '○ ВЫКЛЮЧЕН';
    pb.className = 'py-2 rounded text-sm font-semibold border ' +
      (sim.controls.PUMP ? 'bg-green-700/40 border-green-500 text-green-200' : 'bg-slate-800 border-slate-600 text-slate-400');
    toggleBtn($('netDrainBtn'), sim.controls.NET_DRAIN, '▼ ОТКРЫТ');
    toggleBtn($('netVentBtn'), sim.controls.NET_VENT, '▲ ОТКРЫТ');
    const db = $('drainBtn');
    db.textContent = sim.controls.DRAIN ? '▼ ОТКРЫТ' : 'ЗАКРЫТ';
    db.className = 'py-2 rounded text-sm font-semibold border ' +
      (sim.controls.DRAIN ? 'bg-amber-700/40 border-amber-500 text-amber-200' : 'bg-slate-800 border-slate-600 text-slate-400');
  }

  ctlRows.forEach(row => {
    const key = row.dataset.ctl;
    row.querySelector('input').addEventListener('input', e => {
      sim.controls[key] = Number(e.target.value);
      syncControlsUI();
    });
  });
  document.querySelectorAll('.kzr-step').forEach(b => b.addEventListener('click', () => {
    sim.controls.KZR = Math.min(100, Math.max(0, sim.controls.KZR + Number(b.dataset.step)));
    syncControlsUI();
  }));
  $('pumpBtn').addEventListener('click', () => {
    sim.controls.PUMP = !sim.controls.PUMP;
    log(sim.controls.PUMP ? 'Оператор: насос включен' : 'Оператор: насос выключен', 'op');
    syncControlsUI();
  });
  $('drainBtn').addEventListener('click', () => {
    sim.controls.DRAIN = !sim.controls.DRAIN;
    log(sim.controls.DRAIN ? 'Оператор: открыт дренаж' : 'Оператор: дренаж закрыт', 'op');
    syncControlsUI();
  });
  $('netDrainBtn').addEventListener('click', () => {
    sim.controls.NET_DRAIN = !sim.controls.NET_DRAIN;
    log(sim.controls.NET_DRAIN ? 'Оператор: открыт дренаж сети' : 'Оператор: дренаж сети закрыт', 'op');
    syncControlsUI();
  });
  $('netVentBtn').addEventListener('click', () => {
    sim.controls.NET_VENT = !sim.controls.NET_VENT;
    log(sim.controls.NET_VENT ? 'Оператор: открыт воздушник' : 'Оператор: воздушник закрыт', 'op');
    syncControlsUI();
  });
  $('foulBtn').addEventListener('click', () => {
    sim.controls.strainerFouling = Math.min(90, sim.controls.strainerFouling + 10);
    log(`Инструктор: грязевик засорен до ${Math.round(sim.controls.strainerFouling)} %`, 'op');
  });
  $('cleanBtn').addEventListener('click', () => {
    const r = P.cleanStrainer(sim);
    log(r.msg, r.level);
    render();
  });
  $('resetBtn').addEventListener('click', () => {
    if (window.ITPLessons && window.ITPLessons.active()) { window.ITPLessons.restart(); return; }
    P.resetNominal(sim);
    P.step(sim, 0);
    trend.length = 0;
    log('Оператор: ИТП возвращен в штатный расчетный режим', 'op');
    syncControlsUI();
    render();
  });

  function setSpeed(s) {
    speed = s;
    document.querySelectorAll('.speed-btn').forEach(b => {
      const active = Number(b.dataset.speed) === s && !paused;
      b.classList.toggle('bg-sky-800', active);
      b.classList.toggle('border-sky-500', active);
    });
    $('pauseBtn').classList.toggle('bg-amber-800', paused);
    $('pauseBtn').textContent = paused ? '▶' : '❚❚';
  }
  document.querySelectorAll('.speed-btn').forEach(b =>
    b.addEventListener('click', () => { paused = false; setSpeed(Number(b.dataset.speed)); }));
  $('pauseBtn').addEventListener('click', () => { paused = !paused; setSpeed(speed); });

  // ---------------------------------------------------------------------------
  // Журнал событий
  // ---------------------------------------------------------------------------
  function fmtTime(t) {
    const s = Math.floor(t);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }
  const LOG_COLORS = { alarm: 'text-red-400', warn: 'text-amber-300', ok: 'text-green-400', op: 'text-sky-300', info: 'text-sky-300', clear: 'text-slate-500' };
  function log(msg, kind) {
    const div = document.createElement('div');
    div.className = LOG_COLORS[kind] || 'text-slate-300';
    div.textContent = `[${fmtTime(sim.state.time)}] ${msg}`;
    const box = $('log');
    box.prepend(div);
    while (box.childElementCount > 200) box.lastChild.remove();
  }

  // ---------------------------------------------------------------------------
  // Табло аварий
  // ---------------------------------------------------------------------------
  const ICON = { alarm: '🔴', warn: '🟡', ok: '🟢', info: '🔵' };
  let lastSignature = '';
  let activeIds = new Map(); // id -> заголовок

  function renderAlarms() {
    const list = P.diagnose(sim);
    const signature = list.map(a => a.id + '|' + a.title).join(';');
    if (signature !== lastSignature) {
      lastSignature = signature;
      $('alarms').innerHTML = list.map(a => `
        <div class="alarm-card ${a.level} px-3 py-2">
          <div class="text-sm font-semibold ${a.level === 'alarm' ? 'text-red-300' : a.level === 'warn' ? 'text-amber-200' : a.level === 'info' ? 'text-sky-300' : 'text-green-300'}">
            <span class="${a.level === 'alarm' ? 'blink' : ''}">${ICON[a.level]}</span> ${a.title}
          </div>
          <div class="text-xs text-slate-300 mt-1 leading-5">${a.text}</div>
          <div class="text-[11px] mono text-slate-400 mt-1" data-detail="${a.id}"></div>
        </div>`).join('');

      // Журнал: появление и снятие событий
      const now = new Map(list.map(a => [a.id, a.title]));
      list.forEach(a => { if (!activeIds.has(a.id) && a.id !== 'ok') log(a.title, a.level); });
      activeIds.forEach((title, id) => { if (!now.has(id) && id !== 'ok') log('Снято: ' + title, 'clear'); });
      if (now.has('ok') && !activeIds.has('ok') && activeIds.size) log('НОРМА: режим восстановлен', 'ok');
      activeIds = now;
    }
    list.forEach(a => {
      const d = document.querySelector(`[data-detail="${a.id}"]`);
      if (d) d.textContent = a.detail || '';
    });

    const alarms = list.filter(a => a.level === 'alarm').length;
    const warns = list.filter(a => a.level === 'warn').length;
    $('alarmCount').textContent = `аварий: ${alarms} · предупр.: ${warns}`;
    const lamp = $('statusLamp');
    lamp.className = 'inline-block w-3 h-3 rounded-full ' +
      (alarms ? 'bg-red-500 blink' : warns ? 'bg-amber-400' : 'bg-green-500');
  }

  // ---------------------------------------------------------------------------
  // Тренд
  // ---------------------------------------------------------------------------
  const trend = [];
  const TREND_LEN = 240;      // 240 точек × 0.5 с = 2 мин
  let lastTrendT = -1;

  function pushTrend() {
    if (sim.state.time - lastTrendT < 0.5 && trend.length) return;
    lastTrendT = sim.state.time;
    trend.push([sim.out.T11, sim.out.T2, sim.out.T21]);
    if (trend.length > TREND_LEN) trend.shift();
  }

  function drawTrend() {
    const cv = $('trend');
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const tMin = 20, tMax = 100;
    const y = t => h - 4 - (Math.min(tMax, Math.max(tMin, t)) - tMin) / (tMax - tMin) * (h - 8);

    // Сетка и нормативы
    ctx.font = '10px Consolas, monospace';
    ctx.fillStyle = '#4b6584';
    ctx.strokeStyle = '#132033';
    ctx.lineWidth = 1;
    [20, 40, 60, 80, 100].forEach(t => {
      ctx.beginPath(); ctx.moveTo(0, y(t)); ctx.lineTo(w, y(t)); ctx.stroke();
      ctx.fillText(t + '°', 2, y(t) - 2);
    });
    ctx.fillStyle = 'rgba(34,197,94,.08)';
    ctx.fillRect(0, y(C.T11_MAX), w, y(C.T11_MIN) - y(C.T11_MAX));
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(251,191,36,.5)';
    ctx.beginPath(); ctx.moveTo(0, y(C.T2_MAX)); ctx.lineTo(w, y(C.T2_MAX)); ctx.stroke();
    ctx.setLineDash([]);

    const colors = ['#f87171', '#fbbf24', '#60a5fa'];
    const dx = w / (TREND_LEN - 1);
    const x0 = w - (trend.length - 1) * dx;
    colors.forEach((col, k) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      trend.forEach((p, i) => { const X = x0 + i * dx; i ? ctx.lineTo(X, y(p[k])) : ctx.moveTo(X, y(p[k])); });
      ctx.stroke();
    });
  }

  // ---------------------------------------------------------------------------
  // Отрисовка кадра
  // ---------------------------------------------------------------------------
  function fmt(v, d) { return v.toFixed(d); }

  function render() {
    const o = sim.out;
    const c = sim.controls;

    $('simTime').textContent = fmtTime(o.time);

    // Приборы
    for (const key in tagEls) {
      const t = tagEls[key];
      t.el.textContent = fmt(o[key], t.digits) + ' ' + t.unit;
      t.el.setAttribute('class', 'tag-val ' + tagState(key, o));
    }
    $('txtQ').textContent = Math.round(o.Q);
    $('txtKZR').textContent = Math.round(c.KZR) + '%';

    // Цвета труб по температуре
    // Сетевой участок: пустые трубы — серые, частично заполненные — полупрозрачные
    const EMPTY = '#273244';
    const secT = c.V1 >= C.CLOSED_PCT ? o.T1 : o.T2;
    const fillPipe = (id, n, t) => {
      const f = o.fill[n];
      const el = $(id);
      el.style.stroke = f < 0.05 ? EMPTY : tempColor(t);
      el.style.opacity = (0.3 + 0.7 * f).toFixed(2);
    };
    $('pipeP1a').style.stroke = tempColor(o.T1);
    fillPipe('pipeP1b', 1, secT);
    fillPipe('pipeP1c', 3, secT);
    fillPipe('pipeP2a', 4, o.T2);
    $('pipeP2b').style.stroke = tempColor(o.T2);
    $('pipeNetDr').style.stroke = c.NET_DRAIN ? '#f59e0b' : '#3b4a60';
    $('pipeVent').style.stroke = c.NET_VENT ? '#38bdf8' : '#3b4a60';
    $('pipeS1').style.stroke = tempColor(o.T11);
    $('pipeS2').style.stroke = tempColor(o.T21);
    $('pipeMk').style.stroke = tempColor(o.T2);

    // Каналы ПТО: сеть сверху (T1) вниз (T2), дом снизу (T21) вверх (T11)
    $('gpTop').setAttribute('stop-color', o.fill[3] < 0.05 ? EMPTY : tempColor(secT));
    $('gpBot').setAttribute('stop-color', o.fill[4] < 0.05 ? EMPTY : tempColor(o.T2));
    $('gsTop').setAttribute('stop-color', tempColor(o.T11));
    $('gsBot').setAttribute('stop-color', tempColor(o.T21));
    $('hexPrimTop').style.stroke = o.fill[3] < 0.05 ? EMPTY : tempColor(secT);
    $('hexPrimBot').style.stroke = o.fill[4] < 0.05 ? EMPTY : tempColor(o.T2);
    $('hexSecTop').style.stroke = tempColor(o.T11);
    $('hexSecBot').style.stroke = tempColor(o.T21);

    // Поток: скорость пропорциональна расходу
    setFlow('flowP1', o.G1, 4);
    setFlow('flowHexP', o.G1, 4);
    setFlow('flowP2', o.G1, 4);
    setFlow('flowS1', o.G2, 4);
    setFlow('flowHexS', o.G2, 4);
    setFlow('flowS2', o.G2, 4);
    setFlow('flowMk', o.makeupFlow, 60);
    setFlow('flowDr', o.drainFlow, 30);
    setFlow('flowRv', o.reliefFlow, 30);
    setFlow('flowNetDr', o.netDrainFlow, 30);
    setFlow('flowVent', o.netVentFlow, 30);
    setValve('vNDR', c.NET_DRAIN ? 100 : 0);
    setValve('vNVT', c.NET_VENT ? 100 : 0);

    // Грязевик и заполнение сетевого участка на пульте
    $('foulVal').textContent = Math.round(c.strainerFouling) + '%';
    $('foulBar').style.width = (c.strainerFouling / 90 * 100).toFixed(0) + '%';
    const minFill = Math.min(o.fill[1], o.fill[2], o.fill[3], o.fill[4]);
    $('netFillBar').style.width = (minFill * 100).toFixed(0) + '%';
    $('netFillTxt').textContent = `Заполнение участка ${Math.round(minFill * 100)} % · P грязевик ${fmt(o.nodes[2], 2)} бар · P ПТО ${fmt(o.P_hex_net, 2)} бар`;
    $('pipeRv').style.stroke = o.reliefOpen ? '#ef4444' : '#3b4a60';
    $('vRV').style.fill = o.reliefOpen ? '#ef4444' : '#1c2a3d';
    $('pipeDr').style.stroke = c.DRAIN ? '#f59e0b' : '#3b4a60';

    // Арматура
    renderGates();
    ['V1', 'V2'].forEach(k => {
      const moving = gateMoving(k);
      setValve('v' + k, c[k], moving);
      $('txt' + k).textContent = moving ? Math.round(c[k]) + '%' : '';
    });
    setValve('vKZR', c.KZR >= 99.5 ? 100 : c.KZR);
    setValve('vMK', c.MAKEUP);
    setValve('vDR', c.DRAIN ? 100 : 0);
    $('strainerDirt').setAttribute('width', (30 * c.strainerFouling / 90).toFixed(1));

    // Насос
    const rotor = $('pumpRotor');
    rotor.classList.toggle('spin', o.pumpRunning);
    const body = $('pumpBody');
    if (o.cavitation) { body.setAttribute('stroke', '#ef4444'); body.setAttribute('fill', '#3a1010'); }
    else if (o.pumpRunning) { body.setAttribute('stroke', '#22c55e'); body.setAttribute('fill', '#0f2a1a'); }
    else { body.setAttribute('stroke', '#64748b'); body.setAttribute('fill', '#111827'); }

    // Окна дома — «самочувствие» жильцов по T11 в доме (с учетом циркуляции)
    const houseT = o.G2 > 0 ? o.T11 : o.T21 + 25;
    const winColor = houseT < C.T11_MIN ? '#7dd3fc' : houseT > C.T11_MAX ? '#f87171' : '#f5c26b';
    document.querySelectorAll('#houseWindows .win').forEach(w => w.setAttribute('fill', winColor));

    // Сводка
    const rows = [
      ['Расход сети G1', fmt(o.G1, 2) + ' т/ч'],
      ['Расход дома G2', fmt(o.G2, 1) + ' т/ч'],
      ['Мощность Q', Math.round(o.Q) + ' кВт'],
      ['T11 подача в дом', fmt(o.T11, 1) + ' °C'],
      ['T21 обратка из дома', fmt(o.T21, 1) + ' °C'],
      ['T2 обратка в сеть', fmt(o.T2, 1) + ' °C'],
      ['ΔP грязевика', fmt(o.dP_strainer, 2) + ' бар'],
      ['P21 всас / P11 нагнет.', fmt(o.P21, 2) + ' / ' + fmt(o.P11, 2)],
      ['ΔP насоса', fmt(o.dP_pump, 2) + ' бар'],
      ['ΔP в ПТО (дом)', fmt(o.dP_hex_sec, 2) + ' бар'],
      ['P подача / обратка дома', fmt(o.P_house_supply, 2) + ' / ' + fmt(o.P_house_return, 2)],
      ['ΔP стояков дома', fmt(o.dP_house, 2) + ' бар'],
      ['P на 9 этаже', o.topFloorDry ? 'нет воды' : fmt(o.P_top, 2) + ' бар']
    ];
    $('summary').innerHTML = rows.map(r =>
      `<tr class="border-b border-slate-800/70"><td class="py-1 text-slate-400 font-sans text-xs">${r[0]}</td><td class="py-1 text-right">${r[1]}</td></tr>`).join('');

    renderAlarms();
    drawTrend();
  }

  // ---------------------------------------------------------------------------
  // Главный цикл
  // ---------------------------------------------------------------------------
  function tick() {
    if (!paused) {
      for (let i = 0; i < speed; i++) {
        P.step(sim, DT);
        pushTrend();
      }
      if (window.ITPLessons) window.ITPLessons.tick();
    }
    render();
  }

  syncControlsUI();
  setSpeed(1);
  log('Смена принята. ИТП в штатном режиме.', 'op');
  render();
  // Интерфейс для движка уроков (lessons.js)
  window.ITPApp = {
    sim,
    log,
    render,
    syncControlsUI,
    clearTrend() { trend.length = 0; },
    setPaused(v) { paused = v; setSpeed(speed); },
    isPaused() { return paused; }
  };

  setInterval(tick, TICK_MS);
})();
