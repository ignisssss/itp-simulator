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
    dhwHex: {
      icon: 'hex', title: 'ГВС: одноступенчатая параллельная схема',
      body: `<p>Горячая вода для кранов (ГВС) готовится в отдельном пластинчатом <b>ПТО ГВС</b>. Его греющая сторона подключена к теплосети
        <b>параллельно</b> теплообменнику отопления: сетевая вода после грязевика делится на две ветки — через КЗР отопления и через КЗР ГВС —
        и после теплообменников снова сливается в общую обратку перед V2.</p>
        <p class="mt-2">Нагреваемая сторона — водопровод: холодная вода из ввода <b>В1</b> (≈ 5 °C зимой, ≈ 4 бар) вместе с циркуляционной водой
        <b>T4</b> проходит ПТО ГВС снизу вверх и уходит в дом как горячая вода <b>T3</b>. Пока в доме разбирают воду, через ПТО идет и
        холодная вода, поэтому нужная мощность сильно зависит от водоразбора: днем ≈ 120 кВт, в утренний пик ≈ 380 кВт.</p>
        <p class="mt-2"><b>Норматив:</b> температура в местах водоразбора — не ниже 60 °C и не выше 75 °C (СанПиН; ниже 60 °C в воде
        размножаются бактерии, выше 75 °C — риск ожога). Поэтому на выходе ИТП держат ≈ 60–65 °C, здесь уставка 62 °C.</p>
        <p class="mt-2"><b>Влияние на ввод.</b> Через V1, грязевик и V2 идет суммарный расход двух веток. В пик водоразбора он растет,
        растут и потери на вводе — у отопления остается меньше напора (особенно при засоренном грязевике). Обратка ГВС холодная (≈ 30 °C),
        поэтому общая T2 в теплосеть снижается.</p>
        <p class="mt-2"><b>Когда так подключают.</b> Выбор схемы зависит от отношения максимальных нагрузок Q<sub>ГВС</sub>/Q<sub>отопл</sub>:
        при 0.2…1 рекомендуется двухступенчатая схема, при других соотношениях — одноступенчатая (СП 41-101-95, актуальная редакция —
        СП 510.1325800). У нашего дома ≈ 380/490 ≈ 0.8, поэтому по норме для него лучше двухступенчатая — ее можно выбрать
        в конфигураторе («2-ступ.»).</p>`
    },
    dhw2stage: {
      icon: 'hex', title: 'ГВС: двухступенчатая смешанная схема',
      body: `<p>Горячую воду греют в два приема. <b>II ступень</b> подключена к подаче теплосети T1 через КЗР ГВС — как одноступенчатый
        ПТО ГВС. <b>I ступень</b> (Kv = 28) стоит последовательно на обратке: через нее проходит вся сетевая вода — после системы
        отопления и после II ступени, уже слитая в общую обратку перед V2. Поэтому схема и называется <b>смешанной</b>: на отопление
        ПТО ГВС включен последовательно (I ступень), на подачу — параллельно (II ступень).</p>
        <p class="mt-2"><b>Почему I ступень на обратке.</b> Вода, вернувшаяся из системы отопления, еще горячая (≈ 50…55 °C), а холодная вода
        из водопровода — 5 °C. I ступень забирает это «бросовое» тепло и подогревает водопроводную воду до ≈ 40 °C, ничего не беря
        с подачи сети. II ступени остается догреть воду только до 62 °C.</p>
        <p class="mt-2"><b>Почему циркуляция T4 подключена между ступенями.</b> Циркуляционная вода возвращается из дома горячей (≈ 54 °C) —
        горячее, чем обратка сети на выходе I ступени. Если подмешать ее до I ступени, вода I ступени станет теплее, и I ступень
        почти перестанет охлаждать сетевую воду. Поэтому через I ступень идет только холодная вода В1, а T4 подмешивается к ней после I
        ступени, перед II ступенью.</p>
        <p class="mt-2"><b>Что это дает.</b> В утренний пик (5 т/ч) I ступень дает ≈ 220 кВт из ≈ 350 кВт. КЗР ГВС открыт ≈ 20 % вместо
        ≈ 34 %, расход сетевой воды на ГВС ≈ 2.7 т/ч вместо ≈ 4.6 т/ч, общий расход сети меньше на ≈ 2.3 т/ч. Обратка T2 уходит в сеть
        ≈ 38 °C вместо ≈ 46 °C: сетевая вода охлаждается глубже, и ТЭЦ или котельная вырабатывают больше энергии на том же расходе.</p>
        <p class="mt-2"><b>Цена.</b> Через I ступень идет вся сетевая вода, она добавляет сопротивление на вводе: у системы отопления
        немного меньше напора (G1 ≈ 9.6 т/ч вместо ≈ 10 т/ч, T11 на ≈ 1 °C ниже). Без водоразбора I ступень не работает,
        и T2 такая же, как без ГВС.</p>`
    },
    dhwKzr: {
      icon: 'gauge', title: 'КЗР ГВС и регулятор температуры',
      body: `<p>Клапан на сетевой стороне ПТО ГВС (Kvs = 10) меняет расход греющей воды. <b>Регулятор</b> (буква A на приводе) сравнивает
        T3 с уставкой 62 °C: вода холоднее — приоткрывает клапан, горячее — прикрывает. Привод ходит со скоростью 8 %/с.</p>
        <p class="mt-2">Нагрузка ГВС меняется быстро и сильно: ночью клапан почти закрыт (≈ 3 %), днем ≈ 13 %, в утренний пик ≈ 37 %.
        Ползунок КЗР ГВС в режиме АВТО показывает, как автоматика сама крутит клапан.</p>
        <p class="mt-2">В <b>ручном режиме</b> положение не подстраивается: если оставить клапан открытым на 60 %, а водоразбор упадет до нуля
        (ночь), T3 поднимется выше 75 °C — опасность ожога, а горячая обратка ГВС поднимет общую T2.</p>`
    },
    dhwPump: {
      icon: 'pump', title: 'Циркуляция ГВС: насос Нц и линия T4',
      body: `<p>Если горячую воду никто не разбирает, она стоит в стояках и остывает. Тогда из крана сначала долго течет холодная вода,
        а в остывающей воде размножаются бактерии. Поэтому горячую воду постоянно гоняют по кольцу: подача T3 → стояки и полотенцесушители
        → обратно в ИТП по линии <b>T4</b>. Это делает насос циркуляции <b>Нц</b> (здесь 1.8 т/ч); обратный клапан не дает холодной воде
        уйти в линию циркуляции.</p>
        <p class="mt-2">В стояках вода теряет ≈ 8 °C (≈ 17 кВт), поэтому даже ночью ПТО ГВС немного греет. Циркуляционная вода T4 смешивается
        с холодной водой В1 перед ПТО ГВС.</p>
        <p class="mt-2">Если Нц выключен и разбора нет — T4 падает, в квартирах из кранов идет остывшая вода.</p>`
    },
    makeupPump: {
      icon: 'pump', title: 'Станция подпитки: насос Нп и реле давления РД',
      body: `<p><b>Почему без насоса не обойтись.</b> Вода из сети идет в дом сама только туда, где давление ниже. Безнасосная подпитка
        берет воду из сетевой обратки через обратный клапан, поэтому поднять давление в доме можно не выше <b>P2</b>. Дому нужно
        ≈ 3.5 бар: 27 м водяного столба (2.65 бар) и запас для 9 этажа. Если в обратке сети <b>P2 = 2.5 бар</b>, вода дойдет лишь
        до ≈ 2.5 бар — верхние этажи останутся без воды и завоздушатся, а обратный клапан не даст воде уйти обратно в сеть.</p>
        <p class="mt-2"><b>Насос Нп</b> добавляет к давлению на всасе свой напор 2.5 бар: из обратки 2.5 бар получается до 5.0 бар —
        хватает, чтобы поднять дом до нормы.</p>
        <p class="mt-2"><b>Реле давления РД</b> включает Нп при <b>P21 &lt; 3.2 бар</b> и выключает при <b>P21 ≥ 3.6 бар</b>. Разница 0.4 бар —
        гистерезис: без него насос включался бы и выключался десятки раз в минуту. Вместе с насосом РД открывает электромагнитный клапан
        на линии подпитки, чтобы в паузах вода не шла самотеком.</p>
        <p class="mt-2"><b>Ручной режим опасен:</b> если забыть выключить Нп при нормальном P2 = 4.5 бар, он поднимет давление
        до 4.5 + 2.5 = 7 бар, и сработает предохранительный клапан ПК.</p>
        <p class="mt-2"><b>Сухой ход.</b> Если V2 закрыта, работающий Нп быстро выкачивает отсеченный участок до V2 и начинает крутиться
        без воды: торцевое уплотнение и подшипники перегреваются за минуты. Нп выключают или открывают V2.</p>`
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
    { x: 172, y: 128, w: 112, head: 'ГРЯЗЕВИК', m: 'gen', rows: [['P до', 'P_before_strainer', 'бар', 2], ['P после', 'P_after_strainer', 'бар', 2]] },
    { x: 320, y: 104, w: 112, head: 'ВХОД ПТО', m: 'hot', rows: [['P пто', 'P_hex_net', 'бар', 2], ['G1', 'G1', 'т/ч', 1]] },
    { x: 22, y: 362, w: 94, head: 'ОБРАТКА СЕТИ', m: 'cold', rows: [['T2', 'T2', '°C', 1], ['P2', 'P2', 'бар', 2]] },
    { x: 560, y: 16, w: 100, head: 'ПОДАЧА В ДОМ', m: 'hot', rows: [['T11', 'T11', '°C', 1], ['G2', 'G2', 'т/ч', 1]] },
    { x: 532, y: 452, w: 88, head: 'НАГНЕТАНИЕ', m: 'cold', rows: [['P11', 'P11', 'бар', 2]] },
    { x: 664, y: 452, w: 88, head: 'ВСАС', m: 'cold', rows: [['P21', 'P21_disp', 'бар', 2]] },
    { x: 736, y: 372, w: 88, head: 'ОБРАТКА ДОМА', m: 'cold', rows: [['T21', 'T21', '°C', 1]] },
    { x: 806, y: 16, w: 120, head: 'ВЫХОД ИТП', m: 'hot', rows: [['P подача', 'P_house_supply', 'бар', 2]] },
    { x: 694, y: 184, w: 128, head: 'ДОМ', m: 'gen', rows: [['P 9 эт.', 'P_top', 'бар', 2], ['ΔP дома', 'dP_house', 'бар', 2], ['P низ дома', 'P_house', 'бар', 2], ['T кварт.', 'T_room', '°C', 1]] },
    // ГВС: общие для обеих схем
    { g: 'dhwTags', x: 600, y: 542, w: 108, head: 'ПОДАЧА ГВС', m: 'hot', rows: [['T3', 'T3', '°C', 1], ['G гвс', 'G_draw', 'т/ч', 1]] },
    { g: 'dhwTags', x: 790, y: 656, w: 88, head: 'ЦИРКУЛЯЦИЯ', m: 'cold', rows: [['T4', 'T4', '°C', 1]] },
    // ГВС: только одноступенчатая схема
    { g: 'dhw1Tags', x: 110, y: 640, w: 118, head: 'СЕТЬ · ГВС', m: 'gen', rows: [['G1 гвс', 'G1_dhw', 'т/ч', 2], ['T2 гвс', 'T2_dhw', '°C', 1]] },
    { g: 'dhw1Tags', x: 760, y: 712, w: 96, head: 'ХВС В1 · 4 бар', m: 'cold', rows: [['T хвс', 'T_B1', '°C', 1]] },
    // ГВС: только двухступенчатая схема
    { g: 'dhw2Tags', x: 290, y: 624, w: 116, head: 'СЕТЬ · II СТ.', m: 'gen', rows: [['G1 гвс', 'G1_dhw', 'т/ч', 2], ['T2 II ст.', 'T2_dhw', '°C', 1]] },
    { g: 'dhw2Tags', x: 20, y: 616, w: 84, head: 'ХВС В1', m: 'cold', rows: [['T хвс', 'T_B1', '°C', 1]] },
    { g: 'dhw2Tags', x: 104, y: 440, w: 92, head: 'T2 · I СТУПЕНЬ', m: 'cold', rows: [['до', 'T2_mix', '°C', 1], ['после', 'T2_after_stage1', '°C', 1]] },
    { g: 'dhw2Tags', x: 640, y: 706, w: 104, head: 'МЕЖДУ СТУПЕНЯМИ', m: 'cold', rows: [['T меж', 'T_dhw_mid', '°C', 1]] }
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
    TAGS.forEach(t => {
      const g = $(t.g || 'tags');
      const h = 13 + t.rows.length * 18 + 4;
      const frame = svgEl('rect', { x: t.x, y: t.y, width: t.w, height: h, rx: 1.5, class: 'tag-box' }, g);
      svgEl('rect', { x: t.x + 0.5, y: t.y + 0.5, width: t.w - 1, height: 12, fill: MEDIUM[t.m] }, g);
      svgEl('text', { x: t.x + 5, y: t.y + 9.5, class: 'tag-head' }, g).textContent = t.head;
      t.rows.forEach((r, i) => {
        const y = t.y + 13 + 15 + i * 18;
        if (i) svgEl('line', { x1: t.x + 4, x2: t.x + t.w - 4, y1: y - 13.5, y2: y - 13.5, stroke: '#E2E8F0', 'stroke-width': 0.8 }, g);
        svgEl('text', { x: t.x + 5, y: y - 1, class: 'tag-name' }, g).textContent = r[0];
        const v = svgEl('text', { x: t.x + t.w - 5, y, 'text-anchor': 'end', class: 'tag-val' }, g);
        (tagEls[r[1]] || (tagEls[r[1]] = [])).push({ el: v, unit: r[2], digits: r[3] });
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
      case 'T3': return o.T3 > C.DHW_SCALD ? 'bad' : (o.T3 < C.DHW_LOW ? 'warn' : '');
      case 'T4': return (!sim.controls.DHW_PUMP && o.T4 < 45) ? 'warn' : '';
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
      row.querySelector('[data-val]').textContent = row.dataset.unit ? Number(val).toFixed(Number(row.dataset.digits || 1)) + ' ' + row.dataset.unit : Math.round(val) + '%';
    });
    renderToggles();
  }

  // Переключатели: <button data-toggle="КЛЮЧ" data-on="…" data-off="…" data-tone="green|amber|slate" data-inverse="1">
  const TONES = { green: 'tb-green', amber: 'tb-amber', red: 'tb-red', blue: 'tb-blue', off: '' };
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
  document.querySelectorAll('[data-draw]').forEach(b => b.addEventListener('click', () => {
    sim.controls.DHW_DRAW = Number(b.dataset.draw);
    log(`Водоразбор ГВС: ${b.textContent.trim()} т/ч`, 'op');
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

  // ---------------------------------------------------------------------------
  // Конфигуратор схемы (свободный режим)
  // ---------------------------------------------------------------------------
  const cfgBtns = Array.from(document.querySelectorAll('[data-cfg]'));
  const CFG_NOTE = {
    direct: 'Подпитка самотеком из обратки сети через обратный клапан: давление в доме можно поднять не выше P2.',
    pumped: 'Подпитка насосом Нп (+2.5 бар) по реле давления РД: включение ниже 3.2 бар, отключение на 3.6 бар.'
  };
  function cfgLocked() {
    return (window.ITPLessons && window.ITPLessons.active()) || (window.ITPLevels && window.ITPLevels.inLevel());
  }
  // Высота листа: 520 (только отопление) или 760 (с контуром ГВС), плавно
  let sheetH = 520, sheetAnim = null;
  function setSheetHeight(target) {
    if (sheetAnim && sheetAnim.target === target) return;
    if (!sheetAnim && sheetH === target) return;
    const from = sheetH, t0 = performance.now(), dur = 450;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    sheetAnim = { target };
    const stepH = now => {
      const k = reduce ? 1 : Math.min(1, (now - t0) / dur);
      sheetH = from + (target - from) * (1 - Math.pow(1 - k, 3));
      $('scheme').setAttribute('viewBox', `0 0 1000 ${sheetH.toFixed(1)}`);
      $('sheetFrameA').setAttribute('height', (sheetH - 6).toFixed(1));
      $('sheetFrameB').setAttribute('height', (sheetH - 12).toFixed(1));
      if (k < 1 && sheetAnim && sheetAnim.target === target) requestAnimationFrame(stepH);
      else {
        sheetH = target; sheetAnim = null;
        $('scheme').setAttribute('viewBox', `0 0 1000 ${target}`);
        $('sheetFrameA').setAttribute('height', String(target - 6));
        $('sheetFrameB').setAttribute('height', String(target - 12));
      }
    };
    requestAnimationFrame(stepH);
    // запасной вариант: во вкладке в фоне requestAnimationFrame не вызывается
    setTimeout(() => { if (sheetAnim && sheetAnim.target === target) stepH(t0 + dur + 1); }, dur + 120);
  }

  // Обратка сети: во 2-ступ. схеме она опускается к I ступени ПТО ГВС и возвращается к V2 снизу
  const P2A_D = { base: 'M440 430 H234', st2: 'M440 430 H256 V700' };
  const FLOWP2_D = { base: 'M440 430 H20', st2: 'M440 430 H256 V700' };
  let dhwLayout = null;
  function renderConfig() {
    const cfg = sim.config;
    const dhw = cfg.dhwScheme === '1stage' || cfg.dhwScheme === '2stage';
    const two = cfg.dhwScheme === '2stage';
    setSheetHeight(dhw ? 760 : 520);
    $('svgDhwGroup').toggleAttribute('hidden', !dhw);
    $('svgDhw1StageGroup').toggleAttribute('hidden', !(dhw && !two));
    $('svgDhw2StageGroup').toggleAttribute('hidden', !two);
    $('svgDhw2StageNet').toggleAttribute('hidden', !two);
    $('dhwControls').toggleAttribute('hidden', !dhw);
    const layout = cfg.dhwScheme;
    if (dhwLayout !== layout) {
      dhwLayout = layout;
      $('pipeP2a').setAttribute('d', two ? P2A_D.st2 : P2A_D.base);
      $('flowP2').setAttribute('d', two ? FLOWP2_D.st2 : FLOWP2_D.base);
      $('dhwSchemeLbl').textContent = two ? '2-ступ. смешанная схема' : '1-ступ. параллельная схема';
      $('dhwQhead').textContent = two ? 'Q II ст.' : 'Q ГВС';
      const lbl = $('dhwHexLbl');
      lbl.textContent = two ? 'ПТО ГВС · II ст.' : 'ПТО ГВС';
      lbl.setAttribute('y', two ? '574' : '740');
      $('dhwSecTitle').textContent = two ? 'Контур ГВС (2-ступ.)' : 'Контур ГВС (1-ступ.)';
      $('dhwSecInfo').dataset.info = two ? 'dhw2stage' : 'dhwHex';
    }
    const locked = cfgLocked();
    $('configPanel').hidden = !!locked;
    cfgBtns.forEach(b => b.classList.toggle('is-active', cfg[b.dataset.cfg] === b.dataset.val));
    $('configNote').textContent = CFG_NOTE[cfg.makeupType] + (cfg.network === 'low' ? ' Сейчас напор сети понижен: P2 = 2.5 бар — ниже статики дома.' : '') +
      (two ? ' ГВС: I ступень греет холодную воду обраткой (после системы отопления и II ступени), II ступень догревает от подачи T1 до 62 °C.'
        : dhw ? ' ГВС: ПТО ГВС подключен к сети параллельно системе отопления, регулятор держит T3 = 62 °C.' : '');
  }
  cfgBtns.forEach(b => b.addEventListener('click', () => {
    if (b.disabled || cfgLocked()) return;
    const key = b.dataset.cfg, val = b.dataset.val;
    if (sim.config[key] === val) return;
    P.setConfig(sim, { [key]: val });
    const names = { direct: 'безнасосная подпитка', pumped: 'насосная станция подпитки Нп + РД', normal: 'штатный напор сети 6.5 / 4.5 бар', low: 'пониженный напор сети 4.5 / 2.5 бар', none: 'без ГВС', '1stage': 'ГВС по одноступенчатой параллельной схеме', '2stage': 'ГВС по двухступенчатой смешанной схеме' };
    log(`Конфигурация: ${names[val] || val}`, 'op');
    syncControlsUI();
    renderConfig();
    render();
  }));

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
      states[key] = tagState(key, o);
      tagEls[key].forEach(t => {
        t.el.textContent = fmt(o[key], t.digits) + ' ' + t.unit;
        t.el.setAttribute('class', 'tag-val ' + states[key]);
      });
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
    fillPipe('pipeP2a', 4, o.dhwOn ? o.T2_co : o.T2);
    $('pipeP2b').style.stroke = tempColor(o.T2);
    $('pipeNetDr').style.stroke = c.NET_DRAIN ? '#D97706' : '#94A3B8';
    $('pipeVent').style.stroke = c.NET_VENT ? '#0284C7' : '#94A3B8';
    $('pipeS1').style.stroke = tempColor(o.T11);
    $('pipeS2').style.stroke = tempColor(o.T21);
    $('pipeMk').style.stroke = tempColor(o.dhwOn ? o.T2_co : o.T2);

    // Каналы ПТО: сеть сверху (T1) вниз (T2), дом снизу (T21) вверх (T11)
    $('gpTop').setAttribute('stop-color', o.fill[3] < 0.2 ? EMPTY : tempColor(secT));
    $('gpBot').setAttribute('stop-color', o.fill[4] < 0.2 ? EMPTY : tempColor(o.T2_co));
    $('gsTop').setAttribute('stop-color', tempColor(o.T11));
    $('gsBot').setAttribute('stop-color', tempColor(o.T21));
    $('hexPrimTop').style.stroke = o.fill[3] < 0.2 ? EMPTY : tempColor(secT);
    $('hexPrimBot').style.stroke = o.fill[4] < 0.2 ? EMPTY : tempColor(o.T2_co);
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

    // ГВС (1- и 2-ступенчатая схема)
    if (o.dhwOn) {
      $('txtQdhw').textContent = Math.round(o.Q_dhw_stage2);
      $('txtDhwKzr').textContent = Math.round(o.DHW_KZR) + '%';
      const dm = $('dhwKzrMode');
      dm.textContent = c.DHW_KZR_AUTO ? 'A' : 'Р';
      dm.style.fill = c.DHW_KZR_AUTO ? '#0F172A' : '#B45309';
      setValve('vDhwKzr', o.DHW_KZR >= 99.5 ? 100 : o.DHW_KZR);
      setValve('vB1', c.DHW_B1_VALVE ? 100 : 0);
      const dhwSupT = c.V1 >= C.CLOSED_PCT ? o.T1 : o.T2_dhw;
      $('pipeDhwS').style.stroke = tempColor(dhwSupT);
      $('pipeDhwR').style.stroke = tempColor(o.T2_dhw);
      $('pipeDhwT3').style.stroke = tempColor(o.T3);
      $('pipeDhwT4').style.stroke = tempColor(o.T4);
      $('pipeDhwB1').style.stroke = tempColor(o.T_B1);
      setFlow('flowDhwS', o.G1_dhw, 6);
      setFlow('flowDhwR', o.G1_dhw, 6);
      setFlow('flowDhwHexP', o.G1_dhw, 6);
      setFlow('flowDhwHexS', o.G_dhw_total, 6);
      setFlow('flowDhwT3', o.G_dhw_total, 6);
      setFlow('flowDhwT4', o.G_circ, 10);
      setFlow('flowDhwB1', o.G_draw, 8);
      if (o.dhw2) {
        $('txtQst1').textContent = Math.round(o.Q_dhw_stage1);
        setValve('vB1b', c.DHW_B1_VALVE ? 100 : 0);
        const f4 = o.fill[4] < 0.2;
        $('pipeDhwR2').style.stroke = tempColor(o.T2_dhw);
        $('pipeSt1In').style.stroke = f4 ? EMPTY : tempColor(o.T2_mix);
        $('pipeSt1Out').style.stroke = f4 ? EMPTY : tempColor(o.T2);
        $('pipeDhwB1b').style.stroke = tempColor(o.T_B1);
        $('pipeDhwMid').style.stroke = tempColor(o.T_dhw_mid);
        $('pipeDhwMix').style.stroke = tempColor(o.T_dhw_in);
        setFlow('flowDhwR2', o.G1_dhw, 6);
        setFlow('flowSt1In', o.G1_total, 4);
        setFlow('flowSt1Out', o.G1_total, 4);
        setFlow('flowSt1HexP', o.G1_total, 4);
        setFlow('flowSt1HexS', o.G_draw, 8);
        setFlow('flowDhwB1b', o.G_draw, 8);
        setFlow('flowDhwMid', o.G_draw, 8);
        setFlow('flowDhwMix', o.G_dhw_total, 6);
      }
      const pr = $('dhwPumpBody');
      $('dhwPumpRotor').classList.toggle('spin', c.DHW_PUMP);
      pr.setAttribute('fill', c.DHW_PUMP ? '#DCFCE7' : '#F1F5F9');
      pr.setAttribute('stroke', c.DHW_PUMP ? '#16A34A' : '#64748B');
      // в автомате ползунок КЗР ГВС показывает задание, которое выставляет регулятор
      if (c.DHW_KZR_AUTO) {
        const row = document.querySelector('[data-ctl="DHW_KZRcmd"]');
        row.querySelector('input').value = c.DHW_KZRcmd;
        row.querySelector('[data-val]').textContent = Math.round(c.DHW_KZRcmd) + '%';
      }
      $('dhwKzrPos').textContent = `положение ${Math.round(o.DHW_KZR)} %` + (c.DHW_KZR_AUTO ? ' · регулятор' : ' · вручную');
      $('dhwStatus').textContent = `T3 ${fmt(o.T3, 1)} °C · T4 ${fmt(o.T4, 1)} °C · Q ${Math.round(o.Q_dhw)} кВт · G1 ГВС ${fmt(o.G1_dhw, 2)} т/ч`;
      // Энергобаланс узла ГВС: откуда берется мощность и что уходит в сеть
      const qTot = Math.round(o.Q_dhw), q1 = Math.round(o.Q_dhw_stage1), q2 = Math.round(o.Q_dhw_stage2);
      const share = o.dhw2
        ? `I ст. от обратки: <b>${q1} кВт</b> + II ст. от подачи: <b>${q2} кВт</b>`
        : `<b>100%</b> от подачи сети T1`;
      $('dhwEnergy').innerHTML =
        `<div>Мощность ГВС: <b>${qTot} кВт</b> (${share})</div>` +
        `<div>Суммарный расход сети: <b>${fmt(o.G1_total, 2)} т/ч</b></div>` +
        `<div>Обратка T2 в сеть: <b>${fmt(o.T2, 1)} °C</b></div>`;
    }

    // Станция подпитки Нп + РД
    const pumped = o.makeupType === 'pumped';
    $('svgMakeupPumpGroup').toggleAttribute('hidden', !pumped);
    $('mpControls').hidden = !pumped;
    if (pumped) {
      const dry = o.mpRunning && o.mpDryTime > 0;
      $('mpRotor').classList.toggle('spin', o.mpRunning && !dry);
      $('mpRotor').setAttribute('opacity', o.mpRunning ? '1' : '0');
      $('mpRotor').setAttribute('stroke', dry ? '#DC2626' : '#16A34A');
      $('mpBody').setAttribute('fill', dry ? '#FEE2E2' : o.mpRunning ? '#DCFCE7' : '#F1F5F9');
      $('mpBody').setAttribute('stroke', dry ? '#DC2626' : o.mpRunning ? '#16A34A' : '#64748B');
      $('rdModeChip').setAttribute('fill', c.MAKEUP_AUTO ? '#0369A1' : '#D97706');
      $('rdModeTxt').textContent = c.MAKEUP_AUTO ? 'АВТО' : 'РУЧН';
      $('rdRunLed').setAttribute('fill', o.mpRunning ? (dry ? '#DC2626' : '#16A34A') : '#CBD5E1');
      $('mpPumpBtn').disabled = !!c.MAKEUP_AUTO;
      $('mpStatus').textContent = `Нп: ${o.mpRunning ? (dry ? 'СУХОЙ ХОД' : 'РАБОТА') : (o.mpTrip ? 'ОТКЛ. ЗАЩИТОЙ' : 'ОЖИДАНИЕ')} · всас ${fmt(o.P_node4, 2)} бар · P21 ${fmt(o.P21_disp, 2)} бар`;
    }
    renderConfig();

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
      ...(o.dhwOn ? [
        ['Сеть: отопл. + ГВС = всего', fmt(o.G1, 1) + ' + ' + fmt(o.G1_dhw, 1) + ' = ' + fmt(o.G1_total, 1) + ' т/ч'],
        ['ГВС: Q / T3 / T4', Math.round(o.Q_dhw) + ' кВт · ' + fmt(o.T3, 1) + ' / ' + fmt(o.T4, 1) + ' °C'],
        ...(o.dhw2 ? [
          ['ГВС: Q I ст. + Q II ст.', Math.round(o.Q_dhw_stage1) + ' + ' + Math.round(o.Q_dhw_stage2) + ' кВт · T меж ' + fmt(o.T_dhw_mid, 1) + ' °C'],
          ['T2: отопл. / II ст. / до I ст. / в сеть', fmt(o.T2_co, 1) + ' / ' + fmt(o.T2_dhw, 1) + ' / ' + fmt(o.T2_mix, 1) + ' / ' + fmt(o.T2, 1) + ' °C']
        ] : [
          ['T2: отопл. / ГВС / общая', fmt(o.T2_co, 1) + ' / ' + fmt(o.T2_dhw, 1) + ' / ' + fmt(o.T2, 1) + ' °C']
        ])
      ] : []),
      ['На улице / в квартирах', fmt(o.T_out, 0) + ' / ' + fmt(o.T_room, 1) + ' °C'],
      ['T11 по графику', fmt(o.T11_target, 1) + ' °C (T2 ≤ ' + fmt(o.T2_max, 1) + ')'],
      ['T11 подача в дом', fmt(o.T11, 1) + ' °C'],
      ['T21 обратка из дома', fmt(o.T21, 1) + ' °C'],
      ['T2 обратка в сеть', fmt(o.T2, 1) + ' °C'],
      ['ΔP грязевика', fmt(o.dP_strainer, 2) + ' бар'],
      ['КЗР задание / положение', Math.round(c.KZRcmd) + ' / ' + Math.round(c.KZR) + ' %' + (c.KZR_MANUAL ? ' (ручн.)' : '')],
      ['P21 всас / P11 нагнет.', fmt(o.P21_disp, 2) + ' / ' + fmt(o.P11, 2)],
      ['P1 / P2 сети', fmt(o.P1, 1) + ' / ' + fmt(o.P2, 1) + ' бар'],
      ['Подпитка', (o.makeupType === 'pumped' ? 'Нп ' + (o.mpRunning ? 'работа' : 'ожид.') + ' · ' : 'самотек · ') + fmt(o.P_makeup_avail, 2) + ' бар'],
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
