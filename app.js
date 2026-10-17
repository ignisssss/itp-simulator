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
  // Линейные SVG-иконки (stroke = currentColor). Доступны lessons.js / levels.js через window.ITPIcons.
  // ---------------------------------------------------------------------------
  const ICON_PATHS = {
    alert: 'M12 3.5 2.8 19.5h18.4L12 3.5z M12 10v4.5 M12 17.2v.3',
    alarm: 'M8.2 3h7.6L21 8.2v7.6L15.8 21H8.2L3 15.8V8.2z M12 7.8v5.4 M12 16.4v.3',
    info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 11v5 M12 7.8v.3',
    check: 'M5 12.5l4.2 4.2L19 7',
    checkCircle: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M8 12.3l2.7 2.7L16.2 9.4',
    close: 'M6 6l12 12M18 6 6 18',
    reset: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3 M4.5 4.5v4h4',
    pause: 'M9 6v12M15 6v12',
    play: 'M8 5.5v13l10-6.5z',
    clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7.5V12l3 2',
    phone: 'M5 4h3.5l1.8 4.4-2.3 1.4a11 11 0 0 0 6.2 6.2l1.4-2.3 4.4 1.8V19a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4z',
    book: 'M4 5.5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2z M4 20.5v-15 M8 7.5h7',
    doc: 'M7 3h7l4 4v14H7z M14 3v4h4 M9.5 12h6 M9.5 15.5h6',
    flag: 'M5 21V4 M5 4h11l-2 4 2 4H5',
    gauge: 'M4 16a8 8 0 1 1 16 0 M12 16l4.2-5.2 M6.5 16h0 M17.5 16h0',
    list: 'M9 6h11M9 12h11M9 18h11 M4.5 6h.01M4.5 12h.01M4.5 18h.01',
    wrench: 'M15 4.5a4.5 4.5 0 0 0-4.3 5.9L4 17.1 6.9 20l6.7-6.7A4.5 4.5 0 0 0 19.5 9l-2.7 2.7-2.6-.9-.9-2.6z',
    sliders: 'M6 4v16M12 4v16M18 4v16 M4 15h4M10 8h4M16 12h4',
    gear: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z M12 2.8v2.6 M12 18.6v2.6 M2.8 12h2.6 M18.6 12h2.6 M5.5 5.5l1.9 1.9 M16.6 16.6l1.9 1.9 M5.5 18.5l1.9-1.9 M16.6 7.4l1.9-1.9',
    lock: 'M6 11h12v10H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3',
    mail: 'M3.5 6h17v12h-17z M3.5 6.5l8.5 6.5 8.5-6.5',
    star: 'M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6-4.5-4.2 6.1-.8z',
    valve: 'M4 7v10l16-10v10z M12 12V5 M8.5 5h7',
    filter: 'M4 5h16l-6 7v6l-4 2v-8z',
    pump: 'M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M12 12V6.5 M12 12l4.8 2.8 M12 12l-4.8 2.8',
    hex: 'M5 3h14v18H5z M9 3v18 M12 3v18 M15 3v18',
    shield: 'M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z',
    drop: 'M12 3.5c3.5 4.5 6 7.6 6 10.5a6 6 0 0 1-12 0c0-2.9 2.5-6 6-10.5z',
    drain: 'M12 3v9 M8.5 9.5 12 13l3.5-3.5 M4 17h16l-3 4H7z',
    building: 'M5 21V4h10v17 M15 9h4v12 M3 21h18 M8 7.5h1M11 7.5h1M8 11h1M11 11h1M8 14.5h1M11 14.5h1',
    arrowRight: 'M5 12h14M13 6l6 6-6 6',
    chevDown: 'M6 9l6 6 6-6',
    chevUp: 'M6 15l6-6 6 6',
    dot: 'M12 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
    circle: 'M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z'
  };
  const ICONS = {
    /** svg(имя, размер, {fill: true}) → строка разметки */
    svg(name, size, opt) {
      const d = ICON_PATHS[name] || ICON_PATHS.info;
      const z = size || 16;
      const fill = opt && opt.fill ? 'currentColor' : 'none';
      return `<svg class="ico" width="${z}" height="${z}" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
    },
    /** Геометрические звезды рейтинга: n закрашенных из 3 */
    stars(n, size) {
      let h = '<span class="stars" aria-label="' + n + ' из 3">';
      for (let i = 0; i < 3; i++) h += ICONS.svg('star', size || 16, { fill: i < n });
      return h + '</span>';
    },
    fillAll(root) {
      (root || document).querySelectorAll('[data-icon]').forEach(el => {
        if (!el.firstChild) el.innerHTML = ICONS.svg(el.dataset.icon, Number(el.dataset.size) || 15);
      });
    }
  };
  window.ITPIcons = ICONS;
  ICONS.fillAll();

  // ---------------------------------------------------------------------------
  // Справочник «Зачем нужен этот элемент?»
  // ---------------------------------------------------------------------------
  const INFO = {
    valves: {
      icon: 'valve', title: 'Задвижки V1 / V2',
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
      icon: 'drain', title: 'Дренаж и воздушник сетевого участка',
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
      icon: 'filter', title: 'Грязевик (сетчатый фильтр)',
      body: `<p>Ловит ржавчину, окалину и песок из теплосети, спасая <b>узкие каналы пластин ПТО</b> и <b>седло регулирующего клапана КЗР</b>.</p>
        <p class="mt-2">Диагностируется по <b>двум манометрам — до и после</b> фильтра. Чистый грязевик теряет сотые доли бара;
        перепад больше 0.6 бар означает, что сетка забита и ее пора промывать.</p>
        <p class="mt-2">Засоренный фильтр «съедает» располагаемый напор: даже полностью открытый КЗР не сможет пропустить нужный расход.</p>
        <p class="mt-2"><b>Промывка:</b> закрыть V1, затем V2 → открыть дренаж и воздушник сети → дождаться 0 бар и полного слива →
        «Вскрыть и промыть» → закрыть дренаж, заполнить участок через V2 с открытым воздушником → закрыть воздушник → открыть V1.</p>`
    },
    kzr: {
      icon: 'gauge', title: 'Клапан КЗР с электроприводом',
      body: `<p><b>Главный рабочий орган регулирования мощности ИТП.</b> Меняет расход греющей сетевой воды через ПТО.</p>
        <p class="mt-2">Больше открыт → больше расход G1 → выше T11 в доме, но и выше температура обратки T2 (штраф теплосети).
        Меньше открыт → недотоп.</p>
        <p class="mt-2">В реальном ИТП им управляет погодный контроллер по датчику наружного воздуха и T11. Здесь вы — контроллер:
        рабочая зона около 45…50 %.</p>
        <p class="mt-2">Положение клапана меняет <b>электропривод</b> (буква M на схеме). Если привод отказал (!), клапан стоит в последнем положении —
        тогда включают <b>ручной режим</b> (Р) и крутят клапан штурвалом. Штурвалом клапан движется медленнее.</p>`
    },
    hex: {
      icon: 'hex', title: 'ПТО — пластинчатый теплообменник',
      body: `<p>Передает тепло через <b>гофрированные стальные пластины</b> без смешения сетевой и домовой воды.</p>
        <p class="mt-2">На схеме видно устройство: между пластинами чередуются каналы. В каждом втором канале идет
        <b>сетевая вода — сверху вниз</b> (от T1 к T2), в соседних — <b>домовая вода снизу вверх</b> (от T21 к T11). Это противоток:
        самая горячая сетевая вода греет уже нагретую домовую, поэтому тепло передается эффективно. Резиновые уплотнения
        направляют каждый поток только в «свои» каналы, а коллекторы сверху и снизу раздают воду по всем каналам сразу.</p>
        <p class="mt-2">Благодаря независимой схеме давление и качество воды теплосети не попадают в стояки дома.</p>
        <p class="mt-2">Число в центре — текущая тепловая мощность <b>Q, кВт</b>. Если домовая вода не циркулирует, пластины
        перегреваются до температуры сети и обрастают накипью.</p>`
    },
    house: {
      icon: 'valve', title: 'Краны дома, спуск стояков и воздушники',
      body: `<p><b>Кд1 и Кд2</b> — отсекающие краны на подаче в дом и на обратке из дома. Ими дом отделяют от ИТП, например при
        прорыве радиатора или ремонте стояков. Пока хотя бы один кран открыт, давление в доме и в ИТП общее; циркуляция идет только при обоих открытых.</p>
        <p class="mt-2"><b>Спуск стояков</b> сбрасывает давление и сливает воду из дома в канализацию. <b>Воздушники 9 этажа</b> при сливе впускают воздух
        (без них вода уходит в 10 раз медленнее), а при заполнении выпускают его (иначе воздушная пробка — заполнится только 90 %).</p>
        <p class="mt-2">Заполняют дом снизу подпиткой через открытый кран обратки, с открытыми воздушниками; когда из них пошла вода — закрывают
        и поднимают давление до ≈ 3.5 бар. Насос пускают только в полностью заполненную систему.</p>`
    },
    pump: {
      icon: 'pump', title: 'Циркуляционные насосы Н1 и Н2',
      body: `<p>Крутит воду по стоякам и радиаторам дома. Важно: насос <b>не создает статического давления, а только перепад</b>
        (здесь 1.8 бар): P11 = P21 + 1.8.</p>
        <p class="mt-2">Если давление на всасе P21 упадет ниже 1.5 бар — начнется <b>кавитация</b>: вода вскипает на лопатках колеса и
        разрушает его, циркуляция срывается.</p>
        <p class="mt-2">Насосы стоят парой: <b>Н1 — рабочий, Н2 — резервный</b>. У каждого — краны до и после (на схеме один значок),
        чтобы снять насос в ремонт, не сливая систему. При аварии рабочего: пустить резервный, остановить и отсечь кранами неисправный.
        Насос, работающий на закрытые краны, гоняет воду «сам в себе» — она греется, уплотнения изнашиваются.</p>`
    },
    makeup: {
      icon: 'drop', title: 'Линия подпитки',
      body: `<p>Статическое давление, нужное чтобы вода дошла до верхних этажей, держит <b>линия подпитки</b> из сетевой обратки
        (через обратный клапан). Штатное давление на всасе — <b>3.5 бар</b>.</p>
        <p class="mt-2">Открытая подпитка поднимает P21 к давлению сетевой обратки (4.5 бар), и тогда P11 = 4.5 + 1.8 = 6.3 бар —
        сработает предохранительный клапан. Поэтому подпитку открывают ненадолго и следят за манометром.</p>`
    },
    relief: {
      icon: 'shield', title: 'Предохранительный клапан (ПК 6.0 бар)',
      body: `<p>Последний рубеж защиты внутреннего контура: при давлении выше <b>6.0 бар</b> пружина открывает клапан и сбрасывает воду,
        не давая разорвать радиаторы на нижних этажах. Садится обратно ниже 5.9 бар.</p>
        <p class="mt-2">Срабатывание ПК — всегда авария: нужно найти причину (обычно — открытая подпитка).</p>`
    },
    drain: {
      icon: 'drain', title: 'Дренаж',
      body: `<p>Кран сброса воды из внутреннего контура в канализацию. Нужен для ремонта и для снижения давления.</p>
        <p class="mt-2">Открытый дренаж опускает P21 почти до нуля — работающий насос уйдет в кавитацию. После дренажа давление
        поднимают подпиткой до 3.5 бар.</p>`
    },
    building: {
      icon: 'building', title: 'Система отопления дома',
      body: `<p>Стояки и радиаторы 9-этажного дома. Вода приходит с температурой <b>T11</b> (норма 70…80 °C), отдает тепло квартирам
        и возвращается с температурой <b>T21</b> примерно на 30 °C ниже.</p>
        <p class="mt-2">Чем холоднее на улице, тем больше тепла теряет дом, поэтому по <b>температурному графику</b> растет нужная T11
        (при −10 °C — 75 °C, при −15 °C — ≈ 82 °C, при −20 °C — ≈ 89 °C). Температура в квартирах меняется медленно — у здания большая тепловая инерция.</p>
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
    if (window.ITPLevels && window.ITPLevels.active()) return; // в уровнях справочник недоступен
    if (window.ITPLessons) window.ITPLessons.onInfo(key);
    $('infoIcon').innerHTML = ICONS.svg(it.icon, 22);
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
  // Шильдик прибора: сверху цветная плашка с позицией (горячая/обратная/общая среда),
  // ниже строки «код — значение». rows: [код, ключ в sim.out, единицы, знаков]
  const MEDIUM = { hot: '#C2410C', cold: '#0369A1', gen: '#334155' };
  const TAGS = [
    { x: 22, y: 16, w: 94, head: 'ПОДАЧА СЕТИ', m: 'hot', rows: [['T1', 'T1', '°C', 1], ['P1', 'P1', 'бар', 2]] },
    { x: 190, y: 128, w: 112, head: 'ГРЯЗЕВИК', m: 'gen', rows: [['P до', 'P_before_strainer', 'бар', 2], ['P после', 'P_after_strainer', 'бар', 2]] },
    { x: 320, y: 104, w: 112, head: 'ВХОД ПТО', m: 'hot', rows: [['P пто', 'P_hex_net', 'бар', 2], ['G1', 'G1', 'т/ч', 1]] },
    { x: 22, y: 362, w: 94, head: 'ОБРАТКА СЕТИ', m: 'cold', rows: [['T2', 'T2', '°C', 1], ['P2', 'P2', 'бар', 2]] },
    { x: 560, y: 16, w: 100, head: 'ПОДАЧА В ДОМ', m: 'hot', rows: [['T11', 'T11', '°C', 1], ['G2', 'G2', 'т/ч', 1]] },
    { x: 532, y: 452, w: 88, head: 'НАГНЕТАНИЕ', m: 'cold', rows: [['P11', 'P11', 'бар', 2]] },
    { x: 664, y: 452, w: 88, head: 'ВСАС', m: 'cold', rows: [['P21', 'P21_disp', 'бар', 2]] },
    { x: 736, y: 372, w: 88, head: 'ОБРАТКА ДОМА', m: 'cold', rows: [['T21', 'T21', '°C', 1]] },
    { x: 806, y: 16, w: 120, head: 'ВЫХОД ИТП', m: 'hot', rows: [['P подача', 'P_house_supply', 'бар', 2]] },
    { x: 694, y: 184, w: 128, head: 'ДОМ', m: 'gen', rows: [['P 9 эт.', 'P_top', 'бар', 2], ['ΔP дома', 'dP_house', 'бар', 2], ['P низ дома', 'P_house', 'бар', 2], ['T кварт.', 'T_room', '°C', 1]] }
  ];
  const tagEls = {};
  const tagFrames = [];   // { frame, keys }

  function svgEl(name, attrs, parent) {
    const el = document.createElementNS(SVG_NS, name);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }

  (function buildTags() {
    const g = $('tags');
    TAGS.forEach(t => {
      const h = 13 + t.rows.length * 18 + 4;
      const frame = svgEl('rect', { x: t.x, y: t.y, width: t.w, height: h, rx: 1.5, class: 'tag-box' }, g);
      svgEl('rect', { x: t.x + 0.5, y: t.y + 0.5, width: t.w - 1, height: 12, fill: MEDIUM[t.m] }, g);
      svgEl('text', { x: t.x + 5, y: t.y + 9.5, class: 'tag-head' }, g).textContent = t.head;
      t.rows.forEach((r, i) => {
        const y = t.y + 13 + 15 + i * 18;
        if (i) svgEl('line', { x1: t.x + 4, x2: t.x + t.w - 4, y1: y - 13.5, y2: y - 13.5, stroke: '#E2E8F0', 'stroke-width': 0.8 }, g);
        svgEl('text', { x: t.x + 5, y: y - 1, class: 'tag-name' }, g).textContent = r[0];
        const v = svgEl('text', { x: t.x + t.w - 5, y, 'text-anchor': 'end', class: 'tag-val' }, g);
        tagEls[r[1]] = { el: v, unit: r[2], digits: r[3] };
      });
      tagFrames.push({ frame, keys: t.rows.map(r => r[1]) });
    });

    // Окна дома: 9 этажей × 5 окон
    const w = $('houseWindows');
    for (let f = 0; f < 9; f++) {
      for (let k = 0; k < 5; k++) {
        svgEl('rect', { x: 842 + k * 26, y: 178 + f * 19, width: 16, height: 11, rx: 0.5, class: 'win', fill: '#FCD34D', stroke: '#94A3B8', 'stroke-width': 0.6 }, w);
      }
    }
  })();

  function tagState(key, o) {
    switch (key) {
      case 'T11': return (o.T11 < o.T11_min || o.T11 > o.T11_max) ? 'warn' : '';
      case 'T2': return (o.G1 > 0 && o.T2 > o.T2_max) ? 'warn' : '';
      case 'T_room': return (o.T_room < C.ROOM_COLD || o.T_room > C.ROOM_HOT) ? 'warn' : '';
      case 'P_hex_net': return (sim.controls.V2 < C.CLOSED_PCT && o.P_hex_net > 6.0) ? 'bad' : '';
      case 'P_after_strainer': return o.dP_strainer > C.STRAINER_DP_WARN ? 'warn' : '';
      case 'P21_disp': return (sim.controls.PUMP && o.P21 < C.P21_CAVITATION) ? 'bad' : (o.P21 < 3.0 || o.P21 > 4.0 ? 'warn' : '');
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
  // Инженерная палитра теплоносителя: обратка — стальной синий, середина — охра, подача — терракотовая медь
  // до 55 °C — обратка (синий), 55…68 °C — переход в охру, 68…90 °C — к терракоте подачи
  const T_STOPS = [[20, [3, 105, 161]], [55, [3, 105, 161]], [68, [217, 119, 6]], [90, [194, 65, 12]]];
  function tempColor(t) {
    const v = Math.min(90, Math.max(20, t));
    let k = 0;
    while (k < T_STOPS.length - 2 && v > T_STOPS[k + 1][0]) k++;
    const [t0, c0] = T_STOPS[k], [t1, c1] = T_STOPS[k + 1];
    const x = (v - t0) / (t1 - t0);
    const c = c0.map((a, i) => Math.round(a + (c1[i] - a) * x));
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
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
      const want = opening ? 'close' : 'open';
      if (btn.dataset.want !== want) {
        btn.dataset.want = want;
        btn.innerHTML = opening ? ICONS.svg('chevDown', 14) + 'Закрыть' : ICONS.svg('chevUp', 14) + 'Открыть';
        btn.className = 'gate-btn btn btn-sm w-24 ' + (opening ? 'btn-close' : 'btn-open');
      }
      const bar = row.querySelector('.gate-bar');
      bar.style.width = pos.toFixed(1) + '%';
      bar.style.background = moving ? '#D97706' : (pos >= 100 ? '#16A34A' : '#DC2626');
      const tag = row.querySelector('.tag-btn');
      const tagged = sim.controls[k + 'tag'];
      const tagSt = tagged ? 'on' : 'off';
      if (tag.dataset.state !== tagSt) {
        tag.dataset.state = tagSt;
        tag.innerHTML = tagged ? '<span>Не открывать!</span><span>Работают люди</span>' : 'Повесить плакат';
        tag.className = 'tag-btn ' + (tagged ? 'tag-on' : 'tag-off');
      }
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
    renderToggles();
  }

  // Переключатели: <button data-toggle="КЛЮЧ" data-on="…" data-off="…" data-tone="green|amber|slate" data-inverse="1">
  const TONES = { green: 'tb-green', amber: 'tb-amber', red: 'tb-red', off: '' };
  const toggleEls = Array.from(document.querySelectorAll('[data-toggle]'));
  toggleEls.forEach(b => { b.dataset.base = b.className; });
  function renderToggles() {
    toggleEls.forEach(b => {
      const on = !!sim.controls[b.dataset.toggle];
      const label = on ? b.dataset.on : b.dataset.off;
      if (b.textContent !== label) b.textContent = label;
      // «Инверсные» (краны, нормально открытые): закрытое состояние подсвечивается красным
      const tone = b.dataset.inverse ? (on ? 'off' : 'red') : (on ? b.dataset.tone : 'off');
      const cls = (b.dataset.base + ' ' + TONES[tone]).trim();
      if (b.className !== cls) b.className = cls;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  toggleEls.forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.toggle;
    sim.controls[k] = !sim.controls[k];
    if ((k === 'PUMP' || k === 'PUMP2') && sim.controls[k]) sim.state.pumpTripped = false;
    log(`Оператор: ${b.dataset.label} — ${(sim.controls[k] ? b.dataset.on : b.dataset.off).toLowerCase()}`, 'op');
    renderToggles();
  }));

  ctlRows.forEach(row => {
    const key = row.dataset.ctl;
    row.querySelector('input').addEventListener('input', e => {
      sim.controls[key] = Number(e.target.value);
      syncControlsUI();
    });
  });
  document.querySelectorAll('.kzr-step').forEach(b => b.addEventListener('click', () => {
    sim.controls.KZRcmd = Math.min(100, Math.max(0, sim.controls.KZRcmd + Number(b.dataset.step)));
    syncControlsUI();
  }));
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
    if (window.ITPLevels && window.ITPLevels.inLevel()) { window.ITPLevels.restart(); return; }
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
      b.classList.toggle('is-active', active);
    });
    $('pauseBtn').classList.toggle('is-paused', paused);
    $('pauseBtn').innerHTML = ICONS.svg(paused ? 'play' : 'pause', 13);
    $('pauseBtn').setAttribute('aria-label', paused ? 'Продолжить' : 'Пауза');
  }
  document.querySelectorAll('.speed-btn').forEach(b =>
    b.addEventListener('click', () => { paused = false; setSpeed(Number(b.dataset.speed)); }));
  $('pauseBtn').addEventListener('click', () => {
    if (window.ITPLevels && window.ITPLevels.active()) return; // в уровнях паузы нет
    paused = !paused; setSpeed(speed);
  });

  // ---------------------------------------------------------------------------
  // Журнал событий
  // ---------------------------------------------------------------------------
  function fmtTime(t) {
    const s = Math.floor(t);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }
  const LOG_COLORS = { alarm: 'log-alarm', warn: 'log-warn', ok: 'log-ok', op: 'log-op', info: 'log-info', clear: 'log-clear' };
  function log(msg, kind) {
    const div = document.createElement('div');
    div.className = LOG_COLORS[kind] || 'log-def';
    div.textContent = `[${fmtTime(sim.state.time)}] ${msg}`;
    const box = $('log');
    box.prepend(div);
    while (box.childElementCount > 200) box.lastChild.remove();
  }

  // ---------------------------------------------------------------------------
  // Табло аварий
  // ---------------------------------------------------------------------------
  const ICON = { alarm: 'alarm', warn: 'alert', ok: 'checkCircle', info: 'info' };
  let lastSignature = '';
  let activeIds = new Map(); // id -> заголовок

  function renderAlarms() {
    const list = P.diagnose(sim);
    const signature = list.map(a => a.id + '|' + a.title).join(';');
    if (signature !== lastSignature) {
      lastSignature = signature;
      $('alarms').innerHTML = list.map(a => `
        <div class="alarm-card ${a.level}">
          <div class="a-title"><span class="${a.level === 'alarm' ? 'blink' : ''}" style="margin-top:1px">${ICONS.svg(ICON[a.level], 16)}</span><span>${a.title}</span></div>
          <div class="alarm-text">${a.text}</div>
          <div class="a-detail" data-detail="${a.id}"></div>
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
    ctx.font = "500 10px 'JetBrains Mono', Consolas, monospace";
    ctx.fillStyle = '#64748B';
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    [20, 40, 60, 80, 100].forEach(t => {
      ctx.beginPath(); ctx.moveTo(0, y(t)); ctx.lineTo(w, y(t)); ctx.stroke();
      ctx.fillText(t + '°', 2, y(t) - 2);
    });
    ctx.fillStyle = 'rgba(22,163,74,.08)';
    ctx.fillRect(0, y(sim.out.T11_max), w, y(sim.out.T11_min) - y(sim.out.T11_max));
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(217,119,6,.75)';
    ctx.beginPath(); ctx.moveTo(0, y(sim.out.T2_max)); ctx.lineTo(w, y(sim.out.T2_max)); ctx.stroke();
    ctx.setLineDash([]);

    const colors = ['#C2410C', '#D97706', '#0369A1'];
    const dx = w / (TREND_LEN - 1);
    const x0 = w - (trend.length - 1) * dx;
    colors.forEach((col, k) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
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
    $('tOut').textContent = (o.T_out > 0 ? '+' : o.T_out < 0 ? '−' : '') + Math.abs(o.T_out).toFixed(0) + ' °C';

    // Приборы
    const states = {};
    for (const key in tagEls) {
      const t = tagEls[key];
      states[key] = tagState(key, o);
      t.el.textContent = fmt(o[key], t.digits) + ' ' + t.unit;
      t.el.setAttribute('class', 'tag-val ' + states[key]);
    }
    // рамка шильдика подсвечивается по худшему параметру
    tagFrames.forEach(({ frame, keys }) => {
      const st = keys.some(k => states[k] === 'bad') ? 'bad' : keys.some(k => states[k] === 'warn') ? 'warn' : '';
      frame.setAttribute('class', 'tag-box ' + st);
    });
    $('txtQ').textContent = Math.round(o.Q);
    $('txtKZR').textContent = Math.round(c.KZR) + '%';
    const mode = $('txtKZRmode');
    if (c.KZR_MANUAL) { mode.textContent = 'Р'; mode.style.fill = '#B45309'; }
    else if (o.kzrFail) { mode.textContent = '!'; mode.style.fill = '#DC2626'; }
    else { mode.textContent = 'M'; mode.style.fill = '#0F172A'; }
    $('kzrPos').textContent = `положение ${Math.round(c.KZR)} %` + (o.kzrFail && !c.KZR_MANUAL ? ' · привод не отвечает' : c.KZR_MANUAL ? ' · штурвал' : '');
    renderToggles();

    // Цвета труб по температуре
    // Сетевой участок: пустые трубы — серые, частично заполненные — полупрозрачные
    const EMPTY = '#CBD5E1';   // опорожненный участок
    const secT = c.V1 >= C.CLOSED_PCT ? o.T1 : o.T2;
    const fillPipe = (id, n, t) => {
      const f = o.fill[n];
      const el = $(id);
      el.style.stroke = f < 0.2 ? EMPTY : tempColor(t);
      el.style.opacity = f < 0.2 ? '1' : (0.45 + 0.55 * f).toFixed(2);
    };
    $('pipeP1a').style.stroke = tempColor(o.T1);
    fillPipe('pipeP1b', 1, secT);
    fillPipe('pipeP1c', 3, secT);
    fillPipe('pipeP2a', 4, o.T2);
    $('pipeP2b').style.stroke = tempColor(o.T2);
    $('pipeNetDr').style.stroke = c.NET_DRAIN ? '#D97706' : '#94A3B8';
    $('pipeVent').style.stroke = c.NET_VENT ? '#0284C7' : '#94A3B8';
    $('pipeS1').style.stroke = tempColor(o.T11);
    $('pipeS2').style.stroke = tempColor(o.T21);
    $('pipeMk').style.stroke = tempColor(o.T2);

    // Каналы ПТО: сеть сверху (T1) вниз (T2), дом снизу (T21) вверх (T11)
    $('gpTop').setAttribute('stop-color', o.fill[3] < 0.2 ? EMPTY : tempColor(secT));
    $('gpBot').setAttribute('stop-color', o.fill[4] < 0.2 ? EMPTY : tempColor(o.T2));
    $('gsTop').setAttribute('stop-color', tempColor(o.T11));
    $('gsBot').setAttribute('stop-color', tempColor(o.T21));
    $('hexPrimTop').style.stroke = o.fill[3] < 0.2 ? EMPTY : tempColor(secT);
    $('hexPrimBot').style.stroke = o.fill[4] < 0.2 ? EMPTY : tempColor(o.T2);
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
    $('pipeRv').style.stroke = o.reliefOpen ? '#DC2626' : '#94A3B8';
    $('vRV').style.fill = o.reliefOpen ? '#DC2626' : '#E2E8F0';
    $('pipeDr').style.stroke = c.DRAIN ? '#D97706' : '#94A3B8';

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

    // Насосы
    const env = sim.env;
    [['pumpBody', 'pumpRotor', c.PUMP, env.pump1Fail, o.p1Running], ['pump2Body', 'pump2Rotor', c.PUMP2, env.pump2Fail, o.p2Running]].forEach(([b, r, on, fail, run]) => {
      $(r).classList.toggle('spin', !!run);
      const body = $(b);
      if (on && fail) { body.setAttribute('stroke', '#DC2626'); body.setAttribute('fill', '#FEE2E2'); }
      else if (on && o.cavitation) { body.setAttribute('stroke', '#DC2626'); body.setAttribute('fill', '#FEE2E2'); }
      else if (run) { body.setAttribute('stroke', '#16A34A'); body.setAttribute('fill', '#DCFCE7'); }
      else if (on) { body.setAttribute('stroke', '#D97706'); body.setAttribute('fill', '#FEF3C7'); }
      else { body.setAttribute('stroke', '#64748B'); body.setAttribute('fill', '#F1F5F9'); }
    });
    setValve('vISO1', c.PUMP1_ISO ? 100 : 0);
    setValve('vISO2', c.PUMP2_ISO ? 100 : 0);
    $('pipeH2').style.stroke = tempColor(o.T21);
    setFlow('flowH2', o.p2Running && o.G2 > 0 ? o.G2 : 0, 4);

    // Дом: краны, спуск, воздушники, заполнение
    setValve('vHS', c.HOUSE_SUP ? 100 : 0);
    setValve('vHR', c.HOUSE_RET ? 100 : 0);
    setValve('vHD', c.HOUSE_DRAIN ? 100 : 0);
    setValve('vHV', c.HOUSE_VENT ? 100 : 0);
    $('pipeHD').style.stroke = c.HOUSE_DRAIN ? '#D97706' : '#94A3B8';
    $('pipeHV').style.stroke = c.HOUSE_VENT ? '#0284C7' : '#94A3B8';
    setFlow('flowHD', o.houseDrainFlow > 0 || (c.HOUSE_DRAIN && o.houseFill > 0 && o.P_house <= 0.01) ? 0.6 : 0, 30);
    setFlow('flowHV', c.HOUSE_VENT && (o.houseFilling || o.P_house > 0.05 || (c.HOUSE_DRAIN && o.houseFill > 0)) ? 0.5 : 0, 30);
    $('houseFillBar').style.width = (o.houseFill * 100).toFixed(0) + '%';
    $('houseFillTxt').textContent = `Заполнение дома ${Math.round(o.houseFill * 100)} % · P внизу дома ${fmt(o.P_house, 2)} бар` +
      (o.floodFlow > 0 ? ' · ТЕЧЬ В КВАРТИРУ' : '');

    // Окна дома — «самочувствие» жильцов по T11 в доме (с учетом циркуляции)
    const winColor = o.houseFill < 0.999 ? '#CBD5E1' : o.T_room < C.ROOM_COLD ? '#93C5FD' : o.T_room > C.ROOM_HOT ? '#FCA5A5' : '#FCD34D';
    document.querySelectorAll('#houseWindows .win').forEach(w => w.setAttribute('fill', winColor));

    // Сводка
    const rows = [
      ['Расход сети G1', fmt(o.G1, 2) + ' т/ч'],
      ['Расход дома G2', fmt(o.G2, 1) + ' т/ч'],
      ['Мощность Q', Math.round(o.Q) + ' кВт'],
      ['На улице / в квартирах', fmt(o.T_out, 0) + ' / ' + fmt(o.T_room, 1) + ' °C'],
      ['T11 по графику', fmt(o.T11_target, 1) + ' °C (T2 ≤ ' + fmt(o.T2_max, 1) + ')'],
      ['T11 подача в дом', fmt(o.T11, 1) + ' °C'],
      ['T21 обратка из дома', fmt(o.T21, 1) + ' °C'],
      ['T2 обратка в сеть', fmt(o.T2, 1) + ' °C'],
      ['ΔP грязевика', fmt(o.dP_strainer, 2) + ' бар'],
      ['КЗР задание / положение', Math.round(c.KZRcmd) + ' / ' + Math.round(c.KZR) + ' %' + (c.KZR_MANUAL ? ' (ручн.)' : '')],
      ['P21 всас / P11 нагнет.', fmt(o.P21_disp, 2) + ' / ' + fmt(o.P11, 2)],
      ['ΔP насоса (P11 − P21)', fmt(o.P11 - o.P21_disp, 2) + ' бар'],
      ['ΔP в ПТО (дом)', fmt(o.dP_hex_sec, 2) + ' бар'],
      ['P подача / обратка дома', fmt(o.P_house_supply, 2) + ' / ' + fmt(o.P_house_return, 2)],
      ['ΔP стояков дома', fmt(o.dP_house, 2) + ' бар'],
      ['P на 9 этаже', o.topFloorDry ? 'нет воды' : fmt(o.P_top, 2) + ' бар']
    ];
    $('summary').innerHTML = rows.map(r =>
      `<tr><td class="text-xs faint">${r[0]}</td><td class="text-right mono text-[13px] font-semibold">${r[1]}</td></tr>`).join('');

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
      if (window.ITPLevels) window.ITPLevels.tick();
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
