/*
 * physics.js — детерминированное физическое ядро тренажера ИТП.
 *
 * Объект: ИТП 9-этажного жилого дома, независимая схема присоединения
 * системы отопления через пластинчатый теплообменник (ПТО).
 * Расчетный режим: T_наруж = -10 °C.
 *
 * Никакой случайности: при одинаковых действиях оператора результат всегда одинаков.
 * Файл подключается обычным <script>, наружу отдается объект window.ITPPhysics.
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Константы модели
  // ---------------------------------------------------------------------------
  const C = Object.freeze({
    // Граничные условия теплосети
    T1: 95.0,              // °C, подача теплосети
    P1: 6.5,               // бар, подача теплосети
    P2: 4.5,               // бар, обратка теплосети

    // Гидравлика первичного контура (Kv, м3/ч при 1 бар)
    KVS_V1: 80,
    KVS_V2: 80,
    KV_STRAINER_CLEAN: 60, // чистый грязевик; при засорении 90 % Kv = 6
    KVS_KZR: 16,
    KV_HEX: 25,            // ПТО со стороны сети
    CLOSED_PCT: 0.5,       // открытие < 0.5 % считается «закрыто»
    GATE_TRAVEL_S: 8.0,
    K_NET_DRAIN: 1.2,      // 1/с, сброс давления отсеченного участка через дренаж/воздушник
    EMPTY_RATE: 0.12,      // 1/с, опорожнение участка (с воздушником; без него в 10 раз медленнее)
    FILL_RATE: 0.2,        // 1/с, заполнение участка из теплосети (с воздушником)
    FILL_NO_VENT_CAP: 0.9, // без воздушника заполняется только 90 % объема — воздушная пробка    // с, полный ход затвора задвижки V1/V2

    // Вторичный контур
    PUMP_HEAD: 1.8,        // бар, перепад, создаваемый насосом
    G2_NOMINAL: 14.0,      // т/ч, расход в системе отопления дома (см. README: почему не 22)
    P21_DEFAULT: 3.5,      // бар, статическое давление контура
    P21_CAVITATION: 1.5,   // бар, ниже — срыв (кавитация)
    HEX_SEC_DP: 0.5,       // бар, потери в ПТО со стороны дома при G2 ном.
                           // (остальные 1.3 бар напора насоса теряются в стояках и радиаторах)
    HOUSE_HEIGHT_M: 27.0,  // м, высота верхних приборов 9-го этажа над ИТП
    BAR_PER_M: 0.098,      // бар на 1 м водяного столба
    TOP_FLOOR_MIN_P: 0.5,  // бар, минимальный избыток давления на 9-м этаже (запас ~5 м)
    RELIEF_SET: 6.0,       // бар, настройка предохранительного клапана
    RELIEF_RESEAT: 5.9,    // бар, давление обратной посадки
    DRAIN_P: 0.5,          // бар, к чему стремится контур при открытом дренаже
    K_MAKEUP: 0.6,         // 1/с, скорость подпитки при 100 % открытия
    K_DRAIN: 0.1,          // 1/с, скорость сброса в дренаж
    K_RELIEF: 3.0,         // 1/с, скорость сброса через ПК

    // Теплотехника
    C_WATER: 1.163,        // кВт·ч/(т·К)
    HEX_EFF: 0.82,         // эффективность ПТО
    // Сервисные узлы (регламентные и ремонтные работы)
    KVS_KZR_BYPASS: 16,    // Kvs ручного вентиля на байпасе КЗР
    PRESS_TARGET: 6.25,    // бар, испытательное давление опрессовки = 1.25 × рабочее
    PRESS_RATE: 0.08,      // бар/с, опрессовочный насос (вдали от предела)
    BUILDING_DT: 30.0,     // °C, остывание воды в системе отопления дома (75 → 45, см. README)
    TAU_T: 3.0,            // с, инерция T11 и T2
    TAU_T21: 8.0,          // с, инерция обратки из дома
    TAU_HOUSE_COOL: 60.0,  // с, остывание стоячей воды в доме без циркуляции
    T_MIN: 20.0,           // °C, ниже температуры помещений вода не остывает
    T_STAGNANT: 25.0,      // °C, к чему остывает стоячая сетевая вода

    // Здание: тепловая инерция и радиаторы (подобрано так, что при −10 °C и T11 = 75 °C в квартирах 20 °C)
    T_ROOM_SET: 20.0,      // °C, расчетная температура в квартирах
    T_OUT_DEFAULT: -10.0,  // °C, наружная температура по умолчанию
    TAU_ROOM: 1800.0,      // с, постоянная времени здания (в жизни — часы; ускорено для тренажера)
    RAD_EXP: 1.3,          // показатель степени теплоотдачи радиаторов
    ROOM_COLD: 18.0,       // °C, ниже — жалобы на холод
    ROOM_HOT: 24.0,        // °C, выше — жалобы на духоту
    PUMP_TRIP_S: 3.0,      // с, задержка защиты насоса по низкому давлению на всасе
    KZR_RATE: 6.0,         // %/с, скорость электропривода КЗР
    KZR_MANUAL_RATE: 1.5,  // %/с, ручной штурвал КЗР
    K_HOUSE_DRAIN: 0.15,   // 1/с, слив системы отопления дома через спускники стояков
    HOUSE_EMPTY_RATE: 0.04,// 1/с, опорожнение дома при открытых воздушниках (без них — в 10 раз медленнее)
    MP_HEAD: 2.5,          // бар, напор подпиточного насоса Нп
    RD_ON: 3.2,            // бар, реле давления РД: включение Нп при P21 ниже
    RD_OFF: 3.6,           // бар, отключение Нп при P21 не ниже (гистерезис 0.4 бар)
    MP_MIN_SUCTION: 0.8,   // бар, ниже на всасе Нп — сухой ход
    MP_DRY_TRIP_S: 2.0,    // с, защита отключает Нп после сухого хода
    MP_FLOW_K: 0.12,       // производительность Нп относительно безнасосной подпитки (небольшой насос, ~1 м3/ч)
    MP_SUCTION_DRAW: 0.15, // бар/с — работающий Нп откачивает отсеченный участок до V2
    // ГВС, одноступенчатая параллельная схема
    DHW_KVS: 10,           // Kvs клапана КЗР ГВС
    DHW_HEX_KV: 18,        // Kv ПТО ГВС по сетевой стороне
    DHW_EFF: 0.85,         // эффективность ПТО ГВС
    T3_SET: 62.0,          // °C, уставка регулятора ГВС
    DHW_KZR_RATE: 8.0,     // %/с, скорость привода КЗР ГВС
    DHW_KP: 4.0,           // %/°C, пропорциональная часть регулятора ГВС
    DHW_KI: 0.6,           // %/(°C·с), интегральная часть
    G_CIRC: 1.8,           // т/ч, циркуляция ГВС (насос Нц)
    T_B1: 5.0,             // °C, холодная вода
    P_B1: 4.0,             // бар, давление в водопроводе
    CIRC_DT: 8.0,          // °C, остывание в стояках и полотенцесушителях
    TAU_DHW: 2.0,          // с, инерция ПТО ГВС
    TAU_DRAW: 10.0,        // с, водоразбор жильцов меняется плавно (краны открывают и закрывают постепенно)
    TAU_T4: 6.0,           // с, инерция циркуляционной линии
    TAU_T4_COOL: 12.0,     // с, остывание стоящей циркуляции
    DHW_SCALD: 75.0,       // °C, выше — опасность ожога (верхняя граница СанПиН)
    DHW_LOW: 55.0,         // °C, ниже — недогрев
    // ГВС, двухступенчатая смешанная схема: I ступень на общей обратке перед V2
    DHW_ST1_KV: 28,        // Kv I ступени ПТО ГВС по сетевой стороне
    DHW_ST1_EFF: 0.78,     // эффективность I ступени
    TAU_DHW_ST1: 2.5,      // с, инерция I ступени
    DHW_ST1_BYP_KV: 40,    // Kv обвода I ступени по сетевой воде (задвижка открыта)
    // Обвязка узла ГВС
    CW_FILTER_KV: 15,      // Kv чистого фильтра ХВС на вводе
    CW_SYS_KV: 4.5,        // Kv водопроводного тракта дома (ПТО, стояки, смесители)
    CW_HEAD: 2.5,          // бар, располагаемый напор водопровода на водоразбор
    CW_FILTER_DP_WARN: 0.6, // бар, перепад на фильтре ХВС — пора промывать
    CIRC_FILTER_KV: 6,     // Kv чистого фильтра перед насосом Нц
    CIRC_FILTER_WARN: 60,  // %, засор фильтра Нц — циркуляция заметно падает
    DHW_LOCK_K: 0.4,       // бар/°C, рост давления запертой воды в ПТО ГВС при ее нагреве
    DHW_RELIEF_SET: 6.0,   // бар, настройка предохранительного клапана ГВС
    HOUSE_FILL_K: 0.03,    // заполнение дома: доля объема на 1 бар/с подпитки

    // Нормативы
    T11_TARGET: 75.0,
    T11_MIN: 70.0,
    T11_MAX: 80.0,
    T2_MAX: 55.0,
    STRAINER_DP_WARN: 0.6,

    // Штатный режим (кнопка «Сбросить в штатный режим»)
    NOMINAL_KZR: 48
  });

  // Узлы первичного контура (давления):
  //  0 — подача теплосети (перед V1)       элемент 0: V1
  //  1 — после V1, перед грязевиком         элемент 1: грязевик
  //  2 — после грязевика, перед КЗР         элемент 2: КЗР
  //  3 — после КЗР, вход ПТО                элемент 3: ПТО
  //  4 — выход ПТО, перед V2 (отбор подпитки) элемент 4: V2
  //  5 — обратка теплосети (после V2)
  const NODE_COUNT = 6;

  // Температурные графики (подобраны под модель; при −10 °C: T1 = 95, T11 = 75, T2 ≤ 55)
  function graphT1(tOut) {        // подача теплосети
    return Math.min(120, Math.max(70, 95 - 1.333 * (tOut + 10)));
  }
  function graphT11(tOut) {       // подача в систему отопления дома
    return 20 + 55 * Math.pow(Math.max(0, (20 - tOut) / 30), 0.8);
  }
  function graphT2max(tOut) {     // наибольшая допустимая обратка в теплосеть
    return 55 - 0.8 * (tOut + 10);
  }

  // Номинальная нагрузка дома при −10 °C и параметры здания
  const Q_NOM = C.G2_NOMINAL * C.C_WATER * C.BUILDING_DT;           // ≈ 488 кВт
  const UA_BLD = Q_NOM / (C.T_ROOM_SET - C.T_OUT_DEFAULT);          // кВт/К, теплопотери здания
  const K_RAD = Q_NOM / Math.pow(C.T11_TARGET - C.BUILDING_DT / 2 - C.T_ROOM_SET, C.RAD_EXP);
  const C_BLD = UA_BLD * C.TAU_ROOM;                                // кДж/К, теплоемкость здания

  /** Внешние условия: погода, теплосеть, неисправности. Меняются уровнями и сценариями. */
  function defaultEnv() {
    return {
      T_out: C.T_OUT_DEFAULT,
      T1: null,               // null — по графику теплосети; число — фактическая подача (недодача сети)
      P1: C.P1,
      P2: C.P2,
      houseLeak: 0,           // бар/с при 3.5 бар — утечка в системе отопления дома
      foulRate: 0,            // %/с — скорость засорения грязевика
      pumpProtection: false,  // защита насоса по низкому давлению (останов через 3 с)
      kzrFail: false,         // отказ электропривода КЗР
      pump1Fail: false,       // авария насоса Н1
      pump2Fail: false,       // авария насоса Н2
      burst: 0,               // бар/с при 3.5 бар — прорыв радиатора (вода в квартиру)
      v1Passing: 0,           // 1/с — закрытая V1 пропускает воду из теплосети
      p21Stuck: null,         // число — манометр P21 «залип» на этом значении
      hexScaling: 0           // 0…1 — накипь в ПТО отопления (1 — сильная)
    };
  }

  const houseFull0 = s => s.houseFill >= 0.999;

  function kvOf(pct, kvs) {
    return pct < C.CLOSED_PCT ? 0 : kvs * pct / 100;
  }

  function strainerKv(foulingPct) {
    const f = Math.min(90, Math.max(0, foulingPct));
    return C.KV_STRAINER_CLEAN * (1 - f / 100);
  }

  function isOpen(pct) {
    return pct >= C.CLOSED_PCT;
  }

  // ---------------------------------------------------------------------------
  // Создание и сброс
  // ---------------------------------------------------------------------------
  function nominalControls() {
    return {
      V1: 100,               // фактическое положение затвора, %
      V1cmd: 'open',         // команда оператора: 'open' | 'close'
      strainerFouling: 0,
      KZR: C.NOMINAL_KZR,    // фактическое положение КЗР, %
      KZRcmd: C.NOMINAL_KZR, // задание КЗР (с пульта или штурвалом в ручном режиме)
      KZR_MANUAL: false,     // ручной режим КЗР (штурвал, привод отключен)
      V2: 100,
      V2cmd: 'open',
      PUMP: true,            // насос Н1 (рабочий)
      PUMP2: false,          // насос Н2 (резервный)
      PUMP1_ISO: true,       // краны до/после Н1 открыты
      PUMP2_ISO: true,       // краны до/после Н2 открыты
      HOUSE_SUP: true,       // кран на подаче в дом
      HOUSE_RET: true,       // кран на обратке из дома
      HOUSE_DRAIN: false,    // спуск воды из системы отопления дома (спускники стояков)
      HOUSE_VENT: false,     // воздушники верхнего этажа
      MAKEUP: 0,
      MAKEUP_AUTO: false,    // насосная подпитка: автоматика по реле давления РД
      MAKEUP_PUMP: false,    // насосная подпитка: ручной пуск Нп (когда РД не в автомате)
      DHW_KZR_AUTO: true,    // ГВС: регулятор температуры T3 (уставка 62 °C)
      DHW_KZRcmd: 25,        // ГВС: задание КЗР ГВС, %
      DHW_PUMP: true,        // ГВС: циркуляционный насос Нц
      DHW_B1_VALVE: true,    // ГВС: вводной кран холодной воды В1
      DHW_DRAW: 1.5,         // ГВС: водоразбор жильцов, т/ч
      // Обвязка узла ГВС (true — открыт). Сеть: краны ветки ГВС; I ступень и ее обвод
      DHW_NET_SUP: true,     // Кс1 — кран на врезке ветки ГВС (сеть, подача)
      DHW_NET_RET: true,     // Кс2 — кран на возврате ветки ГВС (сеть, обратка II ступени)
      DHW_ST1_IN: true,      // Кс3 — вход сетевой воды в I ступень
      DHW_ST1_OUT: true,     // Кс4 — выход сетевой воды из I ступени
      DHW_ST1_BYP: false,    // Кс5 — обвод I ступени по сети (нормально закрыт)
      // Водопровод: I ступень и ее обвод, II ступень, насос Нц
      DHW_ST1_WIN: true,     // Кв1 — вход холодной воды в I ступень
      DHW_ST1_WOUT: true,    // Кв2 — выход воды из I ступени
      DHW_ST1_WBYP: false,   // Кв5 — обвод I ступени по воде (нормально закрыт)
      DHW_HEX2_WIN: true,    // Кв3 — вход воды во II ступень (ПТО ГВС)
      DHW_HEX2_WOUT: true,   // Кв4 — выход горячей воды T3 в дом
      DHW_CIRC_IN: true,     // Кн1 — кран до насоса Нц
      DHW_CIRC_OUT: true,    // Кн2 — кран после насоса Нц
      dhwCwFoul: 0,          // засор фильтра ХВС, %
      dhwCircFoul: 0,        // засор фильтра Нц, %
      DRAIN: false,
      NET_DRAIN: false,      // дренаж сетевого участка (нижняя точка, перед V2)
      NET_VENT: false,       // воздушник сетевого участка (верхняя точка, вход ПТО)
      V1tag: false,          // плакат «Не открывать — работают люди» на V1
      V2tag: false,
      // Сервисные узлы: в штатном положении не влияют на работу ИТП
      KZR_ISO: true,         // отсечные краны до и после КЗР (false — КЗР отсечен для ремонта)
      KZR_BYPASS: 0,         // ручной регулирующий вентиль на байпасе КЗР, %
      P21_COCK: 'work',      // трехходовой кран манометра P21: 'work' — на трубе, 'zero' — на атмосфере
      RELIEF_ISO: true,      // кран перед ПК (false — ПК отсечен на время опрессовки)
      PRESS_PUMP: false      // опрессовочный насос
    };
  }

  /** Конфигурация схемы ИТП (выбирается в свободном режиме; уроки и уровни всегда работают на базовой). */
  function defaultConfig() {
    return {
      makeupType: 'direct',  // 'direct' — безнасосная подпитка от P2; 'pumped' — станция подпитки Нп + РД
      dhwScheme: 'none',     // задел: 'none' | '1stage' | '2stage'
      network: 'normal'      // 'normal' — P1/P2 = 6.5/4.5 бар; 'low' — пониженный напор 4.5/2.5 бар
    };
  }

  /** Применить конфигурацию к органам управления и внешним условиям. */
  function applyConfig(sim) {
    const cfg = sim.config;
    const c = sim.controls;
    if (cfg.makeupType === 'pumped') {
      c.MAKEUP_AUTO = true;     // автоматика на дежурстве
      c.MAKEUP = 100;           // кран подпитки открыт, расход открывает РД вместе с электромагнитным клапаном
      c.MAKEUP_PUMP = false;
    } else {
      c.MAKEUP_AUTO = false;
      c.MAKEUP_PUMP = false;
    }
    sim.env.P1 = cfg.network === 'low' ? 4.5 : C.P1;
    sim.env.P2 = cfg.network === 'low' ? 2.5 : C.P2;
    if (sim.state) { sim.state.mpRunning = false; sim.state.mpDryTime = 0; sim.state.mpTrip = false; }
  }

  /**
   * Изменить конфигурацию (частично) в свободном режиме. При смене типа подпитки кран и автоматика
   * переводятся в штатное для этой схемы положение.
   */
  function setConfig(sim, patch) {
    const prev = sim.config || defaultConfig();
    const cfg = Object.assign({}, prev, patch || {});
    sim.config = cfg;
    const c = sim.controls;
    if (cfg.makeupType !== prev.makeupType) {
      if (cfg.makeupType === 'pumped') { c.MAKEUP_AUTO = true; c.MAKEUP = 100; c.MAKEUP_PUMP = false; }
      else { c.MAKEUP_AUTO = false; c.MAKEUP_PUMP = false; c.MAKEUP = 0; }
      if (sim.state) { sim.state.mpRunning = false; sim.state.mpDryTime = 0; sim.state.mpTrip = false; }
    }
    sim.env.P1 = cfg.network === 'low' ? 4.5 : C.P1;
    sim.env.P2 = cfg.network === 'low' ? 2.5 : C.P2;
    return cfg;
  }

  function createSimulator() {
    const sim = { controls: nominalControls(), state: null, out: null, env: defaultEnv(), config: defaultConfig() };
    sim.state = { time: 0 };
    resetNominal(sim);
    return sim;
  }

  /**
   * Возврат в штатный расчетный режим с прогревом до установившегося состояния.
   * Конфигурация схемы сохраняется; opts.forceBase = true возвращает базовую (для уроков и уровней).
   */
  function resetNominal(sim, opts) {
    if (!sim.config || (opts && opts.forceBase)) sim.config = defaultConfig();
    sim.controls = nominalControls();
    sim.env = defaultEnv();
    const time = sim.state ? sim.state.time : 0;
    sim.state = {
      time: time,
      P21: C.P21_DEFAULT,
      T11: C.T11_TARGET,
      T21: C.T11_TARGET - C.BUILDING_DT,
      T2: 54.0,
      T_room: C.T_ROOM_SET,
      lowPTime: 0, cavTime: 0, noCircTime: 0, dryTopTime: 0,
      pumpTripped: false,
      houseFill: 1, P_house: C.P21_DEFAULT, houseConnPrev: true, floodTime: 0, floodVolume: 0,
      nodes: [C.P1, C.P1, C.P1, C.P2, C.P2, C.P2],
      fill: [1, 1, 1, 1, 1, 1],
      strainerAlarmUntil: -1,
      reliefOpen: false,
      mpRunning: false, mpDryTime: 0, mpTrip: false,
      DHW_KZR: 25, T3: C.T3_SET, T4: C.T3_SET - C.CIRC_DT - 1, T2_dhw: 35.0, dhwEprev: 0, G_draw: 1.5,
      T_dhw_mid: 32.0, T2_after_stage1: 38.0,
      P_lock1: C.P_B1, P_lock2: C.P_B1, dhwMeter: 0, T_st1w: 40, lockRef1: null, lockRef2: null,
      hexWashed: false, pump1Replaced: false, gaugeReplaced: false, kzrRepaired: false,
      serviceAlarmUntil: -1, serviceAlarmText: ''
    };
    applyConfig(sim);
    settle(sim, 180);
  }

  /** Установить КЗР сразу (задание и положение) — для сценариев и уроков. */
  function setKZR(sim, v) {
    sim.controls.KZR = v;
    sim.controls.KZRcmd = v;
  }

  /** Прогнать модель вперед без продвижения часов симуляции (для установления режима). */
  function settle(sim, seconds) {
    const t = sim.state.time;
    const n = Math.round(seconds / 0.1);
    for (let i = 0; i < n; i++) step(sim, 0.1);
    sim.state.time = t;
  }

  // ---------------------------------------------------------------------------
  // Первичный (сетевой) контур
  // ---------------------------------------------------------------------------
  function solvePrimary(c, s, dt, env, dhwKv, st1Kv) {
    const P1 = env.P1, P2 = env.P2;
    const kv = [
      kvOf(c.V1, C.KVS_V1),
      strainerKv(c.strainerFouling),
      kvOf(c.KZR, C.KVS_KZR),
      C.KV_HEX,
      kvOf(c.V2, C.KVS_V2)
    ];
    // 2-ступ. ГВС: I ступень (с обводом) стоит на общей обратке между узлом 4 (врезки подпитки и дренажа)
    // и V2 — последовательно с задвижкой. Перекрыта без обвода — для ПТО это то же, что закрытая V2.
    // Узел регулирования: основная ветка КЗР (если не отсечена кранами) параллельно с байпасом
    if (c.KZR_ISO === false || c.KZR_BYPASS > 0) {
      kv[2] = (c.KZR_ISO === false ? 0 : kv[2]) + (c.KZR_BYPASS > 0 ? kvOf(c.KZR_BYPASS, C.KVS_KZR_BYPASS) : 0);
    }
    // Накипь сужает каналы пластин ПТО
    if (env.hexScaling > 0) kv[3] = C.KV_HEX * (1 - 0.5 * env.hexScaling);
    if (st1Kv !== null && st1Kv !== undefined) {
      kv[4] = (kv[4] > 0 && st1Kv > 0) ? 1 / Math.sqrt(1 / (kv[4] * kv[4]) + 1 / (st1Kv * st1Kv)) : 0;
    }
    const open = kv.map(k => k > 0);
    const nodes = s.nodes.slice();
    const fill = s.fill;
    nodes[0] = P1;
    nodes[NODE_COUNT - 1] = P2;

    // Внутренние узлы 1…4 разбиваются закрытой арматурой на отсеки.
    // Дренаж сети — в нижней точке (узел 4, перед V2), воздушник — в верхней (узел 3, вход ПТО).
    const segs = [];
    let cur = [1];
    for (let i = 1; i <= 3; i++) {
      if (open[i]) cur.push(i + 1);
      else { segs.push(cur); cur = [i + 1]; }
    }
    segs.push(cur);
    // Ветка ГВС соединяет узел 2 (после грязевика) и узел 4 (перед V2) параллельно КЗР + ПТО отопления
    if (dhwKv > 0) {
      const a = segs.findIndex(g => g.includes(2)), b = segs.findIndex(g => g.includes(4));
      if (a !== b) {
        const merged = segs[a].concat(segs[b]).sort((x, y) => x - y);
        segs.splice(Math.max(a, b), 1);
        segs.splice(Math.min(a, b), 1, merged);
      }
    }

    let allFull = true;
    let drainLeak = false;   // дренаж открыт на участке, соединенном с теплосетью
    let ventSpray = false;   // воздушник открыт на участке под давлением сети
    let netDrainFlow = 0;
    let netVentFlow = 0;
    let v1Leak = false;
    const segInfo = segs.map(seg => {
      const fromP1 = seg[0] === 1 && open[0];
      const fromP2 = seg[seg.length - 1] === 4 && open[4];
      const src = fromP1 ? P1 : (fromP2 ? P2 : null);
      const hasDrain = c.NET_DRAIN && seg.includes(4);
      const hasVent = c.NET_VENT && seg.includes(3);
      let f = seg.reduce((a, n) => a + fill[n], 0) / seg.length;
      let p = seg.reduce((a, n) => Math.max(a, nodes[n]), 0);
      let state;

      if (src !== null) {
        // Участок соединен с теплосетью: он заполняется, затем выходит на давление сети.
        if (hasDrain) {
          drainLeak = true;
          netDrainFlow = 1;
          state = f >= 0.999 ? 'leak' : 'leak_filling';
        } else if (f < 0.999) {
          const cap = hasVent ? 1 : C.FILL_NO_VENT_CAP;   // без воздушника воздух запирает остаток объема
          if (f < cap) f = Math.min(cap, f + (hasVent ? C.FILL_RATE : C.FILL_RATE * 0.5) * dt);
          if (hasVent) netVentFlow = Math.max(netVentFlow, 0.3);
          state = (!hasVent && f >= cap - 1e-6) ? 'airlock' : 'filling';
        } else {
          state = 'full';
        }
        if (f >= 0.999) f = 1;
        p = src * Math.pow(f, 8);
        if (f >= 1 && hasVent) { ventSpray = true; netVentFlow = 1; }
      } else {
        // Закрытая V1 пропускает: вода из теплосети просачивается в отсеченный участок
        if (env.v1Passing > 0 && seg[0] === 1 && !open[0]) {
          p += env.v1Passing * (P1 - p) * dt;
          if (f < 1) f = Math.min(1, f + env.v1Passing * 2 * dt);
          v1Leak = true;
        }
        // Отсеченный участок: давление заперто, пока его не сбросить дренажом или воздушником.
        if (hasDrain || hasVent) {
          if (p > 0) {
            p = Math.max(0, p - (C.K_NET_DRAIN * p + 0.05) * dt);
            if (hasDrain) netDrainFlow = Math.max(netDrainFlow, 0.8);
            if (hasVent) netVentFlow = Math.max(netVentFlow, 0.8);
          }
          if (hasDrain && p <= 0 && f > 0) {
            f = Math.max(0, f - (hasVent ? C.EMPTY_RATE : C.EMPTY_RATE * 0.1) * dt);
            netDrainFlow = Math.max(netDrainFlow, 0.5);
          }
        }
        state = f <= 0.001 ? 'empty' : (hasDrain && p <= 0 ? 'draining' : (p > 0.05 ? 'trapped' : 'isolated'));
      }
      seg.forEach(n => { fill[n] = f; nodes[n] = p; });
      if (f < 0.999) allFull = false;
      return { nodes: seg, src, fill: f, p, hasDrain, hasVent, state };
    });

    let G1 = 0;
    let kvEq = 0;
    let G1_dhw = 0;
    if (dhwKv > 0) {
      // Две параллельные ветки между узлами 2 и 4: отопление (КЗР + ПТО) и ГВС (КЗР ГВС + ПТО ГВС).
      // Через V1, грязевик и V2 идет их суммарный расход.
      const kvCo = open[2] ? 1 / Math.sqrt(1 / (kv[2] * kv[2]) + 1 / (kv[3] * kv[3])) : 0;
      const kvPar = kvCo + dhwKv;
      if (kvPar > 0 && open[0] && open[1] && open[4] && allFull) {
        const inv = 1 / (kv[0] * kv[0]) + 1 / (kv[1] * kv[1]) + 1 / (kvPar * kvPar) + 1 / (kv[4] * kv[4]);
        kvEq = 1 / Math.sqrt(inv);
        const Gt = kvEq * Math.sqrt(Math.max(0, P1 - P2));
        const dPpar = (Gt / kvPar) ** 2;
        G1 = kvCo * Math.sqrt(dPpar);
        G1_dhw = dhwKv * Math.sqrt(dPpar);
        nodes[1] = P1 - (Gt / kv[0]) ** 2;
        nodes[2] = nodes[1] - (Gt / kv[1]) ** 2;
        nodes[4] = nodes[2] - dPpar;
        nodes[3] = G1 > 0 ? nodes[2] - (G1 / kv[2]) ** 2 : nodes[4];
        nodes[NODE_COUNT - 1] = P2;
      }
    } else if (open.every(Boolean) && allFull) {
      // Последовательная цепь: 1/Kv_eq² = Σ 1/Kv_i²
      const inv = kv.reduce((a, k) => a + 1 / (k * k), 0);
      kvEq = 1 / Math.sqrt(inv);
      G1 = kvEq * Math.sqrt(Math.max(0, P1 - P2));
      // Потери на каждом элементе ΔP = (G/Kv)²
      let p = P1;
      for (let i = 0; i < kv.length; i++) {
        p -= (G1 / kv[i]) ** 2;
        nodes[i + 1] = p;
      }
      nodes[NODE_COUNT - 1] = P2;
    }

    const P_hex_net = G1 > 0 ? (nodes[3] + nodes[4]) / 2 : nodes[3];
    return {
      kv, kvEq, G1, G1_dhw, nodes, P_after_strainer: nodes[2], P_hex_net,
      segs: segInfo, drainLeak, ventSpray, netDrainFlow, netVentFlow, v1Leak
    };
  }

  // ---------------------------------------------------------------------------
  // Регламентные и ремонтные работы. Каждая возвращает { ok, level, msg }.
  // Попытка вскрыть оборудование под давлением — авария open_under_pressure (10 с на табло).
  // ---------------------------------------------------------------------------
  function underPressure(sim, msg) {
    sim.state.serviceAlarmUntil = sim.state.time + 10;
    sim.state.serviceAlarmText = msg;
    return { ok: false, level: 'alarm', msg };
  }

  /** Химическая промывка ПТО: только отсеченный с обеих сторон и опорожненный по сети теплообменник. */
  function washHEX(sim) {
    const c = sim.controls, s = sim.state;
    if (c.V1 > 0 || c.V2 > 0 || c.HOUSE_SUP || c.HOUSE_RET) {
      return underPressure(sim, 'ПТО не отсечен: для промывки закрывают V1 и V2 по сети и краны дома Кд1 и Кд2 по контуру отопления. Иначе при вскрытии патрубков польется вода под давлением.');
    }
    if (c.PUMP || c.PUMP2) return { ok: false, level: 'warn', msg: 'Сначала остановите циркуляционные насосы: промывку ведут на неподвижном теплообменнике.' };
    if (s.fill[3] >= 0.1 || s.nodes[3] >= 0.1) {
      return underPressure(sim, `В ПТО по сетевой стороне еще ${Math.round(s.fill[3] * 100)} % воды при ${s.nodes[3].toFixed(2)} бар. Сбросьте давление и слейте воду дренажом сети при открытом воздушнике (и открытом КЗР).`);
    }
    sim.env.hexScaling = 0;
    s.hexWashed = true;
    return { ok: true, level: 'ok', msg: 'Химическая промывка ПТО (CIP) выполнена: раствор прокачан, накипь растворена, теплообменник промыт водой и нейтрализован.' };
  }

  /** Замена насоса Н1: только выключенный и отсеченный кранами. */
  function replacePump1(sim) {
    const c = sim.controls;
    if (c.PUMP1_ISO) return underPressure(sim, 'Краны насоса Н1 открыты: при снятии насоса из фланцев ударит горячая вода под давлением ≈ 3.5 бар. Сначала закройте краны Н1.');
    if (c.PUMP) return { ok: false, level: 'warn', msg: 'Насос Н1 включен: сначала снимите с него питание.' };
    sim.env.pump1Fail = false;
    sim.state.pump1Replaced = true;
    return { ok: true, level: 'ok', msg: 'Насос Н1 заменен. Корпус пустой: при открытии кранов выпустите воздух.' };
  }

  /** Замена манометра P21: только при трехходовом кране в положении «на атмосферу». */
  function replaceGaugeP21(sim) {
    const c = sim.controls;
    if (c.P21_COCK !== 'zero') return underPressure(sim, 'Трехходовой кран манометра P21 в рабочем положении: штуцер под давлением контура, при откручивании манометра ударит струя горячей воды. Переведите кран в положение «0».');
    sim.env.p21Stuck = null;
    sim.state.gaugeReplaced = true;
    return { ok: true, level: 'ok', msg: 'Манометр P21 заменен. На атмосфере новый прибор показывает 0.0 бар.' };
  }

  /** Ремонт привода КЗР: только при отсеченном кранами клапане. */
  function repairKZR(sim) {
    const c = sim.controls;
    if (c.KZR_ISO !== false) return underPressure(sim, 'Клапан КЗР не отсечен: при разборке узла клапана из-под крышки ударит сетевая вода 95 °C. Переведите регулирование на байпас и закройте краны КЗР.');
    sim.env.kzrFail = false;
    sim.state.kzrRepaired = true;
    return { ok: true, level: 'ok', msg: 'Привод КЗР отремонтирован, обратная связь восстановлена.' };
  }

  /** Засорить фильтр ГВС на 10 % ('cw' — фильтр ХВС на вводе, 'circ' — фильтр перед Нц). */
  function foulDhwFilter(sim, which) {
    const k = which === 'circ' ? 'dhwCircFoul' : 'dhwCwFoul';
    sim.controls[k] = Math.min(90, sim.controls[k] + 10);
    return sim.controls[k];
  }
  /** Промывка фильтра ГВС: только на отключенном участке. Возвращает { ok, level, msg }. */
  function cleanDhwFilter(sim, which) {
    const c = sim.controls;
    if (which === 'circ') {
      if (c.DHW_CIRC_IN || c.DHW_CIRC_OUT) {
        return { ok: false, level: 'alarm', msg: 'Фильтр Нц под давлением: сначала выключите Нц и закройте краны Кн1 и Кн2.' };
      }
      c.dhwCircFoul = 0;
      return { ok: true, level: 'ok', msg: 'Фильтр перед насосом Нц промыт. Откройте Кн1, Кн2 и включите Нц.' };
    }
    if (c.DHW_B1_VALVE) {
      return { ok: false, level: 'alarm', msg: 'Фильтр ХВС под давлением водопровода 4 бар: сначала закройте ввод В1.' };
    }
    c.dhwCwFoul = 0;
    return { ok: true, level: 'ok', msg: 'Сетка фильтра ХВС промыта. Откройте ввод В1.' };
  }

  /**
   * Промывка сетки грязевика. Разрешена только на отключенном и опорожненном участке.
   * Возвращает { ok, level, msg } для журнала.
   */
  function cleanStrainer(sim) {
    const s = sim.state;
    const p = s.nodes[2];
    const f = s.fill[2];
    if (p >= 0.1) {
      s.strainerAlarmUntil = s.time + 10;
      return { ok: false, level: 'alarm', msg: `Попытка вскрыть грязевик под давлением ${p.toFixed(2)} бар! Крышка не снята.` };
    }
    if (f > 0.1) {
      return { ok: false, level: 'warn', msg: `В грязевике еще ${Math.round(f * 100)} % воды. Дождитесь слива через дренаж (с открытым воздушником быстрее).` };
    }
    sim.controls.strainerFouling = 0;
    if (sim.env) sim.env.foulRate = 0;   // новая грязь набирается очень медленно
    s.strainerAlarmUntil = -1;
    return { ok: true, level: 'ok', msg: 'Грязевик вскрыт, сетка промыта от окалины, крышка закрыта.' };
  }

  // ---------------------------------------------------------------------------
  // Шаг модели
  // ---------------------------------------------------------------------------
  function step(sim, dt) {
    const c = sim.controls;
    const s = sim.state;
    const env = sim.env || (sim.env = defaultEnv());
    const T1 = env.T1 === null ? graphT1(env.T_out) : env.T1;

    // Постепенное засорение грязевика (сценарии уровней)
    if (env.foulRate > 0) c.strainerFouling = Math.min(90, c.strainerFouling + env.foulRate * dt);

    // 0. Ход затворов задвижек: затвор всегда идет к крайнему положению,
    // остановить его посередине нельзя (задвижка — запорная арматура).
    const travel = (100 / C.GATE_TRAVEL_S) * dt;
    ['V1', 'V2'].forEach(k => {
      const target = c[k + 'cmd'] === 'open' ? 100 : 0;
      const d = target - c[k];
      c[k] = Math.abs(d) <= travel ? target : c[k] + Math.sign(d) * travel;
    });

    // КЗР: привод (или штурвал в ручном режиме) ведет клапан к заданию. При отказе привода клапан стоит.
    if (c.KZRcmd === undefined) c.KZRcmd = c.KZR;
    if (!env.kzrFail || c.KZR_MANUAL) {
      const rate = (c.KZR_MANUAL ? C.KZR_MANUAL_RATE : C.KZR_RATE) * dt;
      const d = c.KZRcmd - c.KZR;
      c.KZR = Math.abs(d) <= rate ? c.KZRcmd : c.KZR + Math.sign(d) * rate;
    }

    // ГВС (1-ступ. параллельная или 2-ступ. смешанная схема): регулятор T3 и привод КЗР ГВС
    const dhwScheme = sim.config ? sim.config.dhwScheme : 'none';
    const dhw2 = dhwScheme === '2stage';
    const dhwOn = dhwScheme === '1stage' || dhw2;
    let dhwKv = 0;
    if (dhwOn) {
      if (c.DHW_KZR_AUTO) {
        // ПИ-регулятор в скоростной форме: открывает при T3 < 62 °C, прикрывает при T3 > 62 °C
        const e = C.T3_SET - s.T3;
        c.DHW_KZRcmd = Math.min(100, Math.max(0, c.DHW_KZRcmd + C.DHW_KP * (e - s.dhwEprev) + C.DHW_KI * e * dt));
        s.dhwEprev = e;
      } else s.dhwEprev = C.T3_SET - s.T3;
      const rate = C.DHW_KZR_RATE * dt;
      const d = c.DHW_KZRcmd - s.DHW_KZR;
      s.DHW_KZR = Math.abs(d) <= rate ? c.DHW_KZRcmd : s.DHW_KZR + Math.sign(d) * rate;
      const kvK = kvOf(s.DHW_KZR, C.DHW_KVS);
      const netOpen = c.DHW_NET_SUP && c.DHW_NET_RET;   // краны ветки ГВС на врезке и возврате
      dhwKv = (kvK > 0 && netOpen) ? 1 / Math.sqrt(1 / (kvK * kvK) + 1 / (C.DHW_HEX_KV * C.DHW_HEX_KV)) : 0;
    }
    // I ступень по сети: своя пара кранов + обвод. Доля сетевой воды, идущей через сам теплообменник:
    const st1NetOpen = dhw2 && c.DHW_ST1_IN && c.DHW_ST1_OUT;
    const st1Kv = (st1NetOpen ? C.DHW_ST1_KV : 0) + (dhw2 && c.DHW_ST1_BYP ? C.DHW_ST1_BYP_KV : 0);
    const st1NetFrac = st1Kv > 0 && st1NetOpen ? C.DHW_ST1_KV / st1Kv : 0;

    // 1. Сетевой контур
    const prim = solvePrimary(c, s, dt, env, dhwKv, dhw2 ? st1Kv : null);
    s.nodes = prim.nodes;
    const G1 = prim.G1;

    // 2. Внутренний контур: статическое давление P21
    // Краны дома: хотя бы один открыт — давления ИТП и дома общие; оба открыты — возможна циркуляция.
    const houseConn = c.HOUSE_SUP || c.HOUSE_RET;
    const houseOpen = c.HOUSE_SUP && c.HOUSE_RET;
    if (houseConn && !s.houseConnPrev) {
      // объем дома много больше объема трубопроводов ИТП — давление определяет дом
      s.P21 = s.houseFill >= 0.999 ? 0.9 * s.P_house + 0.1 * s.P21 : 0;
    }
    s.houseConnPrev = houseConn;

    // Подпитка берется из сетевой обратки до задвижки V2 (узел 4) через обратный клапан.
    const cfg = sim.config || defaultConfig();
    const P_node4 = s.nodes[4];
    let makeupSource = P_node4;            // располагаемое давление на линии подпитки
    let mpWater = s.fill[4] > 0.5;          // есть ли вода у источника
    if (cfg.makeupType === 'pumped') {
      // Насосная станция подпитки: Нп (+2.5 бар) и реле давления РД 3.2…3.6 бар.
      const suctionOk = s.fill[4] > 0.1 && P_node4 >= C.MP_MIN_SUCTION;
      if (c.MAKEUP_AUTO) {
        if (s.mpTrip && suctionOk) s.mpTrip = false;                 // давление на всасе вернулось
        if (s.P21 < C.RD_ON) s.mpRunning = true;
        else if (s.P21 >= C.RD_OFF) s.mpRunning = false;
        if (s.mpTrip) s.mpRunning = false;
      } else {
        s.mpTrip = false;
        s.mpRunning = !!c.MAKEUP_PUMP;
      }
      if (s.mpRunning && !suctionOk) s.mpDryTime += dt; else s.mpDryTime = 0;
      // Защита от сухого хода (в автомате, если включена защита насосов)
      if (c.MAKEUP_AUTO && env.pumpProtection && s.mpDryTime > C.MP_DRY_TRIP_S) {
        s.mpRunning = false; s.mpTrip = true; s.mpDryTime = 0;
      }
      if (s.mpRunning) {
        makeupSource = suctionOk ? P_node4 + C.MP_HEAD : 0;
        mpWater = suctionOk;
        // Если участок до V2 отсечен от сети, работающий насос откачивает его и уходит в сухой ход
        const seg4d = prim.segs.find(g => g.nodes.includes(4));
        if (seg4d && seg4d.src === null) seg4d.nodes.forEach(n => { s.nodes[n] = Math.max(0, s.nodes[n] - C.MP_SUCTION_DRAW * dt); });
      } else if (c.MAKEUP_AUTO) {
        makeupSource = 0;      // в автомате РД держит электромагнитный клапан закрытым, пока Нп стоит
      } else {
        makeupSource = P_node4; // ручной режим: самотек через остановленный насос
      }
    } else {
      s.mpRunning = false; s.mpDryTime = 0;
    }
    const P_makeup_avail = mpWater ? makeupSource : 0;
    let dP21 = 0;
    let makeupFlow = 0;
    if (isOpen(c.MAKEUP) && makeupSource > s.P21 && mpWater) {
      makeupFlow = C.K_MAKEUP * (c.MAKEUP / 100) * (makeupSource - s.P21) * (s.mpRunning ? C.MP_FLOW_K : 1);
      dP21 += makeupFlow;
      // Если сетевой участок отсечен от теплосети, подпитка берет воду из его малого объема:
      // давление в нем быстро падает, и подпитать дом нечем (нужно открыть V2).
      const seg4 = prim.segs.find(g => g.nodes.includes(4));
      if (seg4 && seg4.src === null) {
        seg4.nodes.forEach(n => { s.nodes[n] = Math.max(0, s.nodes[n] - (s.mpRunning ? 10 : 4) * makeupFlow * dt); });
      }
    }

    // Расход воды из дома: утечка, прорыв радиатора, спуск стояков
    const Pb = houseConn ? s.P21 : s.P_house;            // давление внизу дома
    let leakFlow = 0, floodFlow = 0, houseDrainFlow = 0;
    if (Pb > 0) {
      const k = Math.sqrt(Pb / C.P21_DEFAULT);
      leakFlow = env.houseLeak * k;
      floodFlow = env.burst * k;
      if (c.HOUSE_DRAIN) houseDrainFlow = C.K_HOUSE_DRAIN * Pb + 0.02;
    }
    let houseVentRelief = 0;
    if (!houseConn && c.HOUSE_VENT && s.P_house > 0) houseVentRelief = C.K_HOUSE_DRAIN * s.P_house + 0.02;
    const houseOut = leakFlow + floodFlow + houseDrainFlow;
    if (houseConn) dP21 -= houseOut;
    else s.P_house = Math.max(0, s.P_house - (houseOut + houseVentRelief) * dt);
    // Давление внизу ноль, а вода продолжает уходить — дом опорожняется
    const PbNow = houseConn ? s.P21 + dP21 * dt : s.P_house;
    const outlets = c.HOUSE_DRAIN || env.houseLeak > 0 || env.burst > 0;
    if (PbNow <= 0.01 && outlets && s.houseFill > 0) {
      const rate = C.HOUSE_EMPTY_RATE * (c.HOUSE_VENT ? 1 : 0.1) * (c.HOUSE_DRAIN ? 1 : 0.5);
      s.houseFill = Math.max(0, s.houseFill - rate * dt);
      if (env.burst > 0) floodFlow = Math.max(floodFlow, 0.02);
    }
    // Заполнение дома подпиткой: пока дом не полон, давление не растет
    let houseFilling = false;
    if (houseConn && s.houseFill < 0.999) {
      const cap = c.HOUSE_VENT ? 1 : C.FILL_NO_VENT_CAP;   // без воздушников — воздушная пробка
      if (s.houseFill < cap) s.houseFill = Math.min(cap, s.houseFill + makeupFlow * C.HOUSE_FILL_K * dt);
      if (s.houseFill >= 0.999) s.houseFill = 1;
      houseFilling = makeupFlow > 0;
      if (s.houseFill < 0.999) { dP21 = 0; s.P21 = 0; }
    }
    // Опрессовочный насос: плавно поднимает давление контура к испытательному (1.25 × рабочее)
    let pressFlow = 0;
    if (c.PRESS_PUMP && houseFull0(s) && s.P21 < C.PRESS_TARGET) {
      pressFlow = C.PRESS_RATE * Math.min(1, (C.PRESS_TARGET - s.P21) / 0.4);
      dP21 += pressFlow;
    }
    let drainFlow = 0;
    if (c.DRAIN && s.P21 > C.DRAIN_P) {
      drainFlow = C.K_DRAIN * (s.P21 - C.DRAIN_P);
      dP21 -= drainFlow;
    }

    // Насосы Н1 (рабочий) и Н2 (резервный), каждый со своими кранами
    const p1Avail = c.PUMP && !env.pump1Fail;
    const p2Avail = c.PUMP2 && !env.pump2Fail;
    const p1Flow = p1Avail && c.PUMP1_ISO;
    const p2Flow = p2Avail && c.PUMP2_ISO;

    // Предохранительный клапан на подаче в дом (с гистерезисом)
    const headBefore = ((p1Flow || p2Flow) && s.P21 >= C.P21_CAVITATION) ? C.PUMP_HEAD : 0;
    const P11before = s.P21 + headBefore;
    if (c.RELIEF_ISO === false) s.reliefOpen = false;        // ПК отсечен краном — не сбрасывает
    else if (P11before > C.RELIEF_SET) s.reliefOpen = true;
    else if (P11before < C.RELIEF_RESEAT) s.reliefOpen = false;
    let reliefFlow = 0;
    if (s.reliefOpen) {
      reliefFlow = C.K_RELIEF * (P11before - (C.RELIEF_RESEAT - 0.1));
      dP21 -= reliefFlow;
    }

    s.P21 = Math.max(0, s.P21 + dP21 * dt);
    if (houseConn) s.P_house = s.P21;

    // Защита насосов по низкому давлению на всасе: через PUMP_TRIP_S с останавливает оба насоса
    if ((p1Flow || p2Flow) && s.P21 < C.P21_CAVITATION) s.lowPTime += dt; else s.lowPTime = 0;
    if (env.pumpProtection && (p1Flow || p2Flow) && s.lowPTime >= C.PUMP_TRIP_S) {
      c.PUMP = false;
      c.PUMP2 = false;
      // автоматика закрывает КЗР, чтобы не «запарить» ПТО без циркуляции (если привод исправен)
      if (!env.kzrFail && !c.KZR_MANUAL) c.KZRcmd = 0;
      s.pumpTripped = true;
      s.lowPTime = 0;
    }

    // Насосы
    const q1 = c.PUMP && !env.pump1Fail && c.PUMP1_ISO;
    const q2 = c.PUMP2 && !env.pump2Fail && c.PUMP2_ISO;
    const cavitation = (q1 || q2) && s.P21 < C.P21_CAVITATION;
    const pumpsOn = (q1 || q2) && !cavitation;
    const houseFull = s.houseFill >= 0.999;
    const pumpRunning = pumpsOn && houseOpen && houseFull;      // есть циркуляция через дом
    const deadhead = (c.PUMP && !env.pump1Fail && !c.PUMP1_ISO) || (c.PUMP2 && !env.pump2Fail && !c.PUMP2_ISO) ||
      (pumpsOn && (!houseOpen || !houseFull));
    const G2 = pumpRunning ? C.G2_NOMINAL : 0;
    const P11 = s.P21 + (pumpsOn ? C.PUMP_HEAD : 0);

    // Давления по контуру дома. Напор насоса тратится на ПТО (0.5 бар) и на стояки (1.3 бар).
    const dP_hex_sec = pumpRunning ? C.HEX_SEC_DP : 0;
    const P_house_supply = houseConn ? (pumpRunning ? P11 - dP_hex_sec : s.P21) : s.P_house; // подача в дом (1-й этаж)
    const P_house_return = houseConn ? s.P21 : s.P_house;                                     // обратка из дома
    const dP_house = P_house_supply - P_house_return;   // располагаемый перепад на вводе в дом
    const P_hydro = C.HOUSE_HEIGHT_M * C.BAR_PER_M;     // гидростатика столба 27 м
    // Верх стояков — середина пути по системе: среднее подачи и обратки минус столб воды.
    // Отрицательное значение — вода не доходит до 9-го этажа (стояки опорожнились).
    const P_top_raw = houseFull ? (P_house_supply + P_house_return) / 2 - P_hydro : -1;
    const P_top = Math.max(0, P_top_raw);
    const topFloorDry = P_top_raw < 0;
    s.floodTime = floodFlow > 0 ? s.floodTime + dt : s.floodTime;
    s.floodVolume += floodFlow * dt;

    // 3. Теплообмен с инерцией (явный Эйлер)
    const W1 = G1 * C.C_WATER;
    const W2 = G2 * C.C_WATER;
    let Q = 0;
    let T11eq, T2eq;
    if (G1 > 0 && G2 > 0) {
      const eff = env.hexScaling > 0 ? C.HEX_EFF * (1 - 0.38 * env.hexScaling) : C.HEX_EFF;
      Q = Math.max(0, eff * Math.min(W1, W2) * (T1 - s.T21));
      T2eq = T1 - Q / W1;
      T11eq = s.T21 + Q / W2;
    } else if (G1 > 0) {
      // Сетевая вода идет, а домовая стоит: ПТО «запаривается» до температуры сети
      T11eq = T1;
      T2eq = T1 - 2.0;
    } else {
      // Подача тепла прекращена
      T11eq = s.T21;
      T2eq = C.T_STAGNANT;
    }
    s.T11 += (dt / C.TAU_T) * (T11eq - s.T11);
    s.T2 += (dt / C.TAU_T) * (T2eq - s.T2);

    // ПТО ГВС: вторичный контур — холодная вода В1 (водоразбор) + циркуляция T4 (насос Нц)
    const G1_dhw = prim.G1_dhw || 0;
    let G_draw = 0, G_circ = 0, G_dhw_sec = 0, Q_dhw = 0, T_dhw_in = 20, Q_st1 = 0, T2_net = s.T2;
    let waterOK = false, G_drawCap = 0, dP_cwFilter = 0, circDeadhead = false, G_st1n = 0, G_st1w = 0;
    let relief1 = false, relief2 = false;
    if (dhwOn) {
      // Водопроводный тракт: В1 → фильтр → водосчетчик → обратный клапан → (I ступень или ее обвод) → II ступень → T3
      const st1W = dhw2 && c.DHW_ST1_WIN && c.DHW_ST1_WOUT;
      const st1Path = !dhw2 || st1W || c.DHW_ST1_WBYP;
      const hex2W = c.DHW_HEX2_WIN && c.DHW_HEX2_WOUT;
      waterOK = c.DHW_B1_VALVE && st1Path && hex2W;
      // Засор фильтра ХВС ограничивает возможный водоразбор
      const kvF = C.CW_FILTER_KV * Math.max(0.02, 1 - c.dhwCwFoul / 100);
      G_drawCap = waterOK ? Math.sqrt(C.CW_HEAD) / Math.sqrt(1 / (kvF * kvF) + 1 / (C.CW_SYS_KV * C.CW_SYS_KV)) : 0;
      const drawTarget = Math.min(Math.max(0, c.DHW_DRAW), G_drawCap);
      // Жильцы открывают и закрывают краны постепенно (инерция TAU_DRAW), а закрытый кран тракта
      // обрывает поток сразу. Засоренный фильтр ограничивает расход тоже сразу.
      if (!waterOK) s.G_draw = 0;
      else {
        s.G_draw += (dt / C.TAU_DRAW) * (drawTarget - s.G_draw);
        if (s.G_draw > G_drawCap) s.G_draw = G_drawCap;
        if (drawTarget === 0 && s.G_draw < 0.02) s.G_draw = 0;
      }
      G_draw = s.G_draw;
      dP_cwFilter = (G_draw / kvF) ** 2;
      s.dhwMeter += G_draw * dt / 3600;          // показания водосчетчика, м³
      // Циркуляция: насос Нц, его краны и фильтр; кольцо идет через II ступень
      const circValves = c.DHW_CIRC_IN && c.DHW_CIRC_OUT;
      const kvC = C.CIRC_FILTER_KV * Math.max(0.02, 1 - c.dhwCircFoul / 100);
      const circK = Math.sqrt((1 + (C.G_CIRC / C.CIRC_FILTER_KV) ** 2) / (1 + (C.G_CIRC / kvC) ** 2));
      G_circ = (c.DHW_PUMP && circValves && hex2W) ? C.G_CIRC * circK : 0;
      circDeadhead = c.DHW_PUMP && !(circValves && hex2W);
      G_dhw_sec = G_draw + G_circ;
      // 2-ступ.: холодная вода приходит во II ступень уже подогретой в I ступени (T_dhw_mid),
      // циркуляция T4 подмешивается между ступенями
      const T_cold = dhw2 ? s.T_dhw_mid : C.T_B1;
      if (G_dhw_sec > 0) T_dhw_in = (G_draw * T_cold + G_circ * s.T4) / G_dhw_sec;
      const W1d = G1_dhw * C.C_WATER, W2d = G_dhw_sec * C.C_WATER;
      let T3eq, T2deq, tau3 = C.TAU_DHW;
      if (G1_dhw > 0 && G_dhw_sec > 0) {
        Q_dhw = C.DHW_EFF * Math.min(W1d, W2d) * Math.max(0, T1 - T_dhw_in);
        T3eq = T_dhw_in + Q_dhw / W2d;
        T2deq = T1 - Q_dhw / W1d;
      } else if (G1_dhw > 0) {
        // разбора и циркуляции нет — стоячая вода в ПТО ГВС перегревается к T1;
        // скорость нагрева пропорциональна расходу греющей воды (при большом расходе — за секунды)
        T3eq = T1; T2deq = T1 - 1;
        tau3 = C.TAU_DHW * Math.min(30, Math.max(1, 4 / G1_dhw));
      } else if (G_dhw_sec > 0) {
        T3eq = T_dhw_in; T2deq = C.T_STAGNANT;   // греющей воды нет — через ПТО идет ненагретая вода
      } else {
        T3eq = 20; T2deq = C.T_STAGNANT;          // все стоит — вода в ПТО ГВС медленно остывает
        tau3 = 60;
      }
      s.T3 += (dt / tau3) * (T3eq - s.T3);
      s.T2_dhw += (dt / C.TAU_DHW) * (T2deq - s.T2_dhw);
      if (G_circ > 0) s.T4 += (dt / C.TAU_T4) * (Math.max(20, s.T3 - C.CIRC_DT) - s.T4);
      else s.T4 += (dt / C.TAU_T4_COOL) * (22 - s.T4);

      const Gt = G1 + G1_dhw;
      T2_net = Gt > 0 ? (G1 * s.T2 + G1_dhw * s.T2_dhw) / Gt : s.T2;
      if (dhw2) {
        // I ступень: греющая — общая обратка (отопление + II ступень), нагреваемая — только холодная вода В1.
        // Открытые обводы забирают часть потока мимо теплообменника.
        const Wt = Gt * C.C_WATER, Wdr = G_draw * C.C_WATER;
        G_st1n = Gt * st1NetFrac;
        G_st1w = st1W ? G_draw * (c.DHW_ST1_WBYP ? 0.5 : 1) : 0;
        let TmidEq, T2st1Eq, tauMid = C.TAU_DHW_ST1;
        if (G_st1n > 0 && G_st1w > 0 && T2_net > C.T_B1) {
          Q_st1 = C.DHW_ST1_EFF * Math.min(G_st1n, G_st1w) * C.C_WATER * (T2_net - C.T_B1);
          TmidEq = C.T_B1 + Q_st1 / Wdr;
          T2st1Eq = T2_net - Q_st1 / Wt;
        } else {
          if (G_draw > 0) TmidEq = C.T_B1;            // холодная вода проходит, не нагреваясь
          else if (G_st1n > 0) TmidEq = T2_net;       // разбора нет — вода в I ступени стоит и прогревается
          else { TmidEq = 20; tauMid = 60; }
          if (Gt > 0) T2st1Eq = T2_net;               // I ступень не работает (нет разбора или она в обводе)
          else if (G_draw > 0) T2st1Eq = 15;          // сеть стоит — холодная вода выхолаживает I ступень
          else { T2st1Eq = C.T_STAGNANT; tauMid = 60; }
        }
        s.T_dhw_mid += (dt / tauMid) * (TmidEq - s.T_dhw_mid);
        s.T2_after_stage1 += (dt / tauMid) * (T2st1Eq - s.T2_after_stage1);
        T2_net = s.T2_after_stage1;
      }

      // Температура воды внутри I ступени (по водопроводной стороне)
      if (dhw2) {
        let Tw = Math.min(s.T_st1w, 20), tauW = 60;   // все стоит: горячая вода остывает, холодная не греется
        if (G_st1w > 0) { Tw = C.T_B1 + Q_st1 / (G_st1w * C.C_WATER); tauW = C.TAU_DHW_ST1; }
        else if (G_st1n > 0) { Tw = T2_net; tauW = 15; }   // вода стоит, греющая идет — прогревается
        s.T_st1w += (dt / tauW) * (Tw - s.T_st1w);
      }
      // Предохранительные клапаны ГВС: ПТО, отсеченный по воде с двух сторон, при нагреве запертой воды
      // набирает давление (вода почти не сжимается). При настройке ПК клапан стравливает воду в дренаж.
      const lockStep = (locked, T, Tprev, refKey, pKey) => {
        if (!locked) { s[refKey] = null; s[pKey] = C.P_B1; return false; }
        if (s[refKey] === null) s[refKey] = T;                     // температура в момент отсечения
        const span = (C.DHW_RELIEF_SET - C.P_B1) / C.DHW_LOCK_K;  // нагрев до срабатывания ПК, °C
        if (T - s[refKey] > span) s[refKey] = T - span;            // ПК стравил расширившуюся воду
        s[pKey] = Math.max(0.3, C.P_B1 + C.DHW_LOCK_K * (T - s[refKey]));
        return s[pKey] >= C.DHW_RELIEF_SET - 1e-9 && T > Tprev + 1e-5;  // ПК открыт, пока вода греется
      };
      const lock2 = !c.DHW_HEX2_WIN && !c.DHW_HEX2_WOUT;
      relief2 = lockStep(lock2, s.T3, s.T3prev === undefined ? s.T3 : s.T3prev, 'lockRef2', 'P_lock2');
      const lock1 = dhw2 && !c.DHW_ST1_WIN && !c.DHW_ST1_WOUT;
      relief1 = lockStep(lock1, s.T_st1w, s.Tst1prev === undefined ? s.T_st1w : s.Tst1prev, 'lockRef1', 'P_lock1');
      s.T3prev = s.T3; s.Tst1prev = s.T_st1w;
    }

    // Радиаторы и здание. Теплоотдача радиаторов Q_rad = K·(Tср − Tвн)^1.3;
    // при завоздушивании верхние этажи греют хуже.
    const airFactor = topFloorDry ? 0.6 : (P_top < C.TOP_FLOOR_MIN_P ? 0.85 : 1);
    const Tmean = G2 > 0 ? (s.T11 + s.T21) / 2 : s.T21;
    const Q_rad = airFactor * K_RAD * Math.pow(Math.max(0, Tmean - s.T_room), C.RAD_EXP);
    // Обратка из дома: при циркуляции T21 = T11 − Q_rad/W2, без циркуляции вода в стояках остывает.
    let T21target, tau21;
    if (G2 > 0) {
      T21target = Math.max(Math.min(s.T_room, s.T11), s.T11 - Q_rad / W2);
      tau21 = C.TAU_T21;
    } else {
      T21target = s.T_room;
      tau21 = C.TAU_HOUSE_COOL;
    }
    s.T21 += (dt / tau21) * (T21target - s.T21);
    // Температура в квартирах: приход от радиаторов минус теплопотери через ограждения
    s.T_room += dt * (Q_rad - UA_BLD * (s.T_room - env.T_out)) / C_BLD;

    // Счетчики длительности опасных режимов (для оценки на уровнях)
    s.cavTime = cavitation ? s.cavTime + dt : 0;
    s.noCircTime = (G1 > 1 && G2 === 0) ? s.noCircTime + dt : 0;
    s.dryTopTime = (topFloorDry && houseFull && houseOpen) ? s.dryTopTime + dt : 0;

    s.time += dt;

    sim.out = {
      time: s.time,
      T1, P1: env.P1, P2: env.P2,
      T_out: env.T_out, T_room: s.T_room, Q_rad,
      T11_target: graphT11(env.T_out),
      T11_min: graphT11(env.T_out) - 5,
      T11_max: graphT11(env.T_out) + 5,
      T2_max: graphT2max(env.T_out),
      leakFlow, pumpTripped: s.pumpTripped,
      // Манометр P21: залипший показывает застывшее значение; трехходовой кран в положении 'zero' — атмосфера
      P21_disp: (env.p21Stuck !== null && env.p21Stuck !== undefined) ? env.p21Stuck : (c.P21_COCK === 'zero' ? 0 : s.P21),
      P21_cock: c.P21_COCK, hexScaling: env.hexScaling || 0, pressFlow, reliefIso: c.RELIEF_ISO !== false,
      p1Running: q1 && pumpsOn, p2Running: q2 && pumpsOn, deadhead,
      houseFill: s.houseFill, houseConn, houseOpen, P_house: houseConn ? s.P21 : s.P_house,
      floodFlow, floodTime: s.floodTime, houseDrainFlow, houseFilling, v1Leak: prim.v1Leak,
      kzrFail: env.kzrFail, KZRcmd: c.KZRcmd,
      cavTime: s.cavTime, noCircTime: s.noCircTime, dryTopTime: s.dryTopTime,
      T2: dhwOn ? T2_net : s.T2,
      T2_mix: (dhwOn && G1 + G1_dhw > 0) ? (G1 * s.T2 + G1_dhw * s.T2_dhw) / (G1 + G1_dhw) : s.T2,
      T2_co: s.T2, T11: s.T11, T21: s.T21,
      G1, G2, W1, W2, Q,
      kv: prim.kv, kvEq: prim.kvEq,
      nodes: s.nodes.slice(),
      fill: s.fill.slice(),
      segs: prim.segs,
      drainLeak: prim.drainLeak, ventSpray: prim.ventSpray,
      netDrainFlow: prim.netDrainFlow, netVentFlow: prim.netVentFlow,
      P_after_strainer: prim.P_after_strainer,
      P_before_strainer: s.nodes[1],
      dP_strainer: s.nodes[1] - prim.P_after_strainer, // показания манометров до/после грязевика
      P_hex_net: prim.P_hex_net,
      P21: s.P21, P11,
      P_house_supply, P_house_return, dP_house, dP_hex_sec, P_top, P_hydro, topFloorDry,
      dP_pump: P11 - s.P21,
      pumpRunning, cavitation,
      reliefOpen: s.reliefOpen,
      makeupFlow, drainFlow, reliefFlow,
      dhwOn, dhw2, G1_dhw, G1_total: G1 + G1_dhw, G_draw, G_circ, G_dhw_total: G_dhw_sec,
      Q_dhw: Q_dhw + Q_st1, Q_dhw_stage1: Q_st1, Q_dhw_stage2: Q_dhw, T_dhw_in,
      T_dhw_mid: dhw2 ? s.T_dhw_mid : C.T_B1, T2_after_stage1: s.T2_after_stage1, T_st1_w: s.T_st1w,
      dhwWaterOK: waterOK, G_drawCap, dP_cwFilter, cwFoul: c.dhwCwFoul, circFoul: c.dhwCircFoul, circDeadhead,
      G_st1_net: G_st1n, G_st1_w: G_st1w, st1Blocked: dhw2 && st1Kv === 0, st1Bypass: dhw2 && !!c.DHW_ST1_BYP,
      P_lock1: s.P_lock1, P_lock2: s.P_lock2, dhwRelief1: relief1, dhwRelief2: relief2, dhwMeter: s.dhwMeter,
      T3: s.T3, T4: s.T4, T2_dhw: s.T2_dhw, DHW_KZR: s.DHW_KZR, P_B1: C.P_B1, T_B1: C.T_B1,
      makeupType: cfg.makeupType, mpRunning: s.mpRunning, mpDryTime: s.mpDryTime, mpTrip: !!s.mpTrip,
      P_makeup_avail, P_node4: s.nodes[4],
    };
    return sim.out;
  }

  // ---------------------------------------------------------------------------
  // Диагностика: аварии и предупреждения
  // ---------------------------------------------------------------------------
  const f1 = v => v.toFixed(1);
  const f2 = v => v.toFixed(2);

  function diagnose(sim) {
    const c = sim.controls;
    const o = sim.out;
    const list = [];
    const s = sim.state;

    if (s.time < s.strainerAlarmUntil) {
      list.push({
        id: 'strainer_pressure', level: 'alarm',
        title: 'АВАРИЯ: Попытка вскрыть грязевик под давлением!',
        text: 'Крышку фильтра открывают только на отключенном и опорожненном участке: закройте V1, затем V2, откройте дренаж и воздушник, дождитесь 0 бар на манометрах до и после грязевика. Иначе крышку сорвет струей воды 95 °C.',
        detail: `P в грязевике = ${f2(o.nodes[2])} бар`
      });
    }
    const tagged = ['V1', 'V2'].filter(k => c[k + 'tag'] && c[k + 'cmd'] === 'open');
    if (tagged.length) {
      list.push({
        id: 'tag_violation', level: 'warn',
        title: 'НАРУШЕНИЕ: Открыта задвижка с плакатом «Не открывать — работают люди»!',
        text: 'Плакат вешают, чтобы никто не подал воду на участок, где идет ремонт. Открывать такую задвижку нельзя, пока работы не закончены и плакат не снят ответственным.',
        detail: `Задвижка: ${tagged.join(', ')}`
      });
    }
    if (o.drainLeak) {
      list.push({
        id: 'net_drain_leak', level: 'warn',
        title: 'ШТРАФ ОТ ТЕПЛОСЕТИ: Сброс сетевой воды в канализацию!',
        text: 'Дренаж открыт на участке, который соединен с теплосетью через открытую задвижку. Сетевая вода уходит в канализацию — это утечка теплоносителя. Сначала отсеките участок задвижками V1 и V2.',
        detail: `V1 = ${Math.round(c.V1)} %, V2 = ${Math.round(c.V2)} %`
      });
    }
    if (o.ventSpray) {
      list.push({
        id: 'vent_spray', level: 'warn',
        title: 'ПРЕДУПРЕЖДЕНИЕ: Воздушник открыт под давлением!',
        text: 'Из воздушника бьет горячая вода. Воздушник открывают на отключенном участке (при сливе) или при заполнении, пока не пойдет вода без воздуха, — затем закрывают.',
        detail: `P в ПТО (сеть) = ${f2(o.P_hex_net)} бар`
      });
    }

    if (!isOpen(c.V2) && isOpen(c.V1) && isOpen(c.KZR)) {
      list.push({
        id: 'hex_overpressure', level: 'alarm',
        title: 'АВАРИЯ: Опрессовка ПТО подающим давлением!',
        text: 'Закрыта задвижка на обратке при открытой подаче! Теплообменник и вся арматура до V2 оказались под полным давлением подачи 6.5 бар, циркуляции сетевой воды нет. Если давление подачи выше допустимого для оборудования (уплотнения ПТО, арматура и приборы на обратке), возможен разрыв. Всегда закрывайте сначала подачу, затем обратку!',
        detail: `P в ПТО (сеть) = ${f2(o.P_hex_net)} бар`
      });
    }
    if (o.cavTime > 0) {
      list.push({
        id: 'cavitation', level: 'alarm',
        title: 'АВАРИЯ: Кавитация на всасе насоса!',
        text: 'Давление на всасе ниже 1.5 бар! Вода вскипает на лопатках рабочего колеса, разрушая насос. Срочно откройте кран подпитки до 3.5 бар или выключите насос!',
        detail: `P21 = ${f2(o.P21_disp)} бар`
      });
    }
    if (o.G2 === 0 && o.G1 > 1.0) {
      list.push({
        id: 'no_circulation', level: 'alarm',
        title: 'АВАРИЯ: Подача теплоносителя без циркуляции отопления!',
        text: 'Циркуляции в доме нет (насос выключен, остановлен или дом отсечен), а сетевая вода идет в ПТО! Вторичный контур в теплообменнике перегревается до 95 °C, выпадает накипь, а дом остывает.',
        detail: `G1 = ${f1(o.G1)} т/ч, T11 = ${f1(o.T11)} °C`
      });
    }
    if (s.time < s.serviceAlarmUntil) {
      list.push({
        id: 'open_under_pressure', level: 'alarm',
        title: 'АВАРИЯ: Вскрытие оборудования под давлением!',
        text: s.serviceAlarmText,
        detail: `P21 = ${f2(o.P21)} бар, P в ПТО (сеть) = ${f2(o.P_hex_net)} бар`
      });
    }
    if (c.RELIEF_ISO === false && isOpen(c.V1) && isOpen(c.KZR)) {
      list.push({
        id: 'relief_isolated_alarm', level: 'alarm',
        title: 'АВАРИЯ: Заглушен предохранительный клапан при работающем нагреве!',
        text: 'Кран перед ПК закрыт, а в ПТО подан теплоноситель. При нагреве вода расширяется, и защиты от превышения давления нет — риск разрыва оборудования. ПК отсекают только на время гидравлических испытаний холодной системы.',
        detail: `P11 = ${f2(o.P11)} бар, V1 = ${Math.round(c.V1)} %, КЗР = ${Math.round(c.KZR)} %`
      });
    } else if (c.RELIEF_ISO === false) {
      list.push({
        id: 'relief_isolated', level: 'warn',
        title: 'Предохранительный клапан отсечен краном',
        text: 'Допустимо только на время гидравлических испытаний (опрессовки) холодной системы. После испытаний кран перед ПК обязательно открывают.',
        detail: `P21 = ${f2(o.P21)} бар`
      });
    }
    if ((sim.env.hexScaling || 0) > 0.5 && o.G1 > 0) {
      list.push({
        id: 'hex_scaled', level: 'warn',
        title: 'Накипь в пластинчатом теплообменнике!',
        text: 'Теплопередача снижена, обратка T2 перегревается при недотопе дома. Требуется химическая промывка ПТО.',
        detail: `T11 = ${f1(o.T11)} °C, T2 = ${f1(o.T2)} °C, КЗР = ${Math.round(c.KZR)} %`
      });
    }
    if (o.reliefOpen || (o.P11 > C.RELIEF_SET && c.RELIEF_ISO !== false)) {
      list.push({
        id: 'relief', level: 'alarm',
        title: 'АВАРИЯ: Сработал предохранительный клапан (> 6.0 бар)!',
        text: 'Превышено допустимое давление во внутреннем контуре! Закройте кран подпитки.',
        detail: `P11 = ${f2(o.P11)} бар, P21 = ${f2(o.P21_disp)} бар`
      });
    }
    if (o.P_top < C.TOP_FLOOR_MIN_P) {
      list.push({
        id: 'top_floor', level: 'warn',
        title: 'ПРЕДУПРЕЖДЕНИЕ: Завоздушивание верхних этажей!',
        text: 'Давления в контуре не хватает, чтобы держать воду до 9-го этажа с запасом. В верхних радиаторах скапливается воздух, они перестают греть. Поднимите статическое давление подпиткой до 3.5 бар.',
        detail: o.topFloorDry
          ? `Вода не доходит до 9-го этажа: верхние стояки пустые. P21 = ${f2(o.P21_disp)} бар`
          : `P на 9 эт. = ${f2(o.P_top)} бар (нужно ≥ ${f2(C.TOP_FLOOR_MIN_P)}), P21 = ${f2(o.P21_disp)} бар`
      });
    }
    if ((c.PUMP && sim.env.pump1Fail) || (c.PUMP2 && sim.env.pump2Fail)) {
      list.push({
        id: 'pump_fault', level: 'alarm',
        title: `АВАРИЯ: Насос ${c.PUMP && sim.env.pump1Fail ? 'Н1' : 'Н2'} — отказ электродвигателя!`,
        text: 'Насос включен, но не создает перепад. Нужно перейти на исправный насос, а неисправный отсечь кранами для ремонта.',
        detail: `P11 − P21 = ${f2(o.P11 - o.P21)} бар`
      });
    }
    if (sim.env.kzrFail && !c.KZR_MANUAL) {
      list.push({
        id: 'kzr_fault', level: 'alarm',
        title: 'АВАРИЯ: Привод КЗР — нет обратной связи!',
        text: 'Электропривод регулирующего клапана не отрабатывает команды. Клапан стоит в последнем положении. Переведите КЗР в ручной режим и регулируйте штурвалом.',
        detail: `Положение КЗР ${Math.round(c.KZR)} %, задание ${Math.round(c.KZRcmd)} %`
      });
    }
    if (o.floodFlow > 0) {
      list.push({
        id: 'flood', level: 'alarm',
        title: 'АВАРИЯ: Течь в квартире — заливает!',
        text: 'Вода из системы отопления уходит в квартиру. Остановите поступление воды: отсеките дом кранами и сбросьте давление в доме.',
        detail: `P внизу дома = ${f2(o.P_house)} бар`
      });
    }
    if (o.deadhead) {
      list.push({
        id: 'pump_deadhead', level: 'warn',
        title: 'ПРЕДУПРЕЖДЕНИЕ: Насос работает на закрытую арматуру!',
        text: 'Насос включен, но вода через него не идет: закрыты его краны или краны дома. Вода в насосе нагревается, уплотнения изнашиваются.',
        detail: `Н1: ${c.PUMP ? 'вкл' : 'выкл'}, кран ${c.PUMP1_ISO ? 'откр' : 'закр'} · Н2: ${c.PUMP2 ? 'вкл' : 'выкл'}, кран ${c.PUMP2_ISO ? 'откр' : 'закр'} · дом ${o.houseOpen ? 'откр' : 'закр'}`
      });
    }
    if (c.HOUSE_VENT && o.houseFill >= 0.999 && o.P_house > 0.3) {
      list.push({
        id: 'house_vent_spray', level: 'warn',
        title: 'ПРЕДУПРЕЖДЕНИЕ: Из воздушников на 9 этаже течет вода!',
        text: 'Система заполнена — воздушники нужно закрыть.',
        detail: `P внизу дома = ${f2(o.P_house)} бар`
      });
    }
    if (o.houseFill < 0.999) {
      list.push({
        id: 'house_section', level: 'info',
        title: o.houseFilling ? 'Идет заполнение системы отопления дома' : 'Система отопления дома не заполнена',
        text: o.houseFilling ? (c.HOUSE_VENT ? 'Воздух выходит через воздушники верхнего этажа.' : 'Без открытых воздушников воздух не выйдет — заполнится только 90 %.') : 'В стояках нет воды. Циркуляция невозможна.',
        detail: `Заполнение ${Math.round(o.houseFill * 100)} %, P внизу дома ${f2(o.P_house)} бар`
      });
    }
    if (o.dhwOn) {
      if (o.T3 > C.DHW_SCALD && o.dhwWaterOK) {
        list.push({
          id: 'dhw_scald', level: 'alarm',
          title: 'ОПАСНОСТЬ ОЖОГА: Перегрев ГВС (T3 > 75 °C)!',
          text: 'Температура горячей воды в кранах жильцов критически завышена! Прикройте КЗР ГВС или переведите регулятор ГВС в режим АВТО.',
          detail: `T3 = ${f1(o.T3)} °C, КЗР ГВС ${Math.round(o.DHW_KZR)} %, водоразбор ${f1(o.G_draw)} т/ч`
        });
      }
      if (o.dhwWaterOK && o.T3 < C.DHW_LOW) {
        list.push({
          id: 'dhw_low_temp', level: 'warn',
          title: 'Нарушение СанПиН: Недогрев ГВС (T3 < 55 °C)',
          text: 'Вода в системе ГВС ниже норматива (в местах водоразбора — не ниже 60 °C). Увеличьте подачу теплоносителя через КЗР ГВС или проверьте перепад давления в сети.',
          detail: `T3 = ${f1(o.T3)} °C, КЗР ГВС ${Math.round(o.DHW_KZR)} %, G1 ГВС ${f2(o.G1_dhw)} т/ч`
        });
      }
      if (o.G_circ === 0 && c.DHW_DRAW < 0.2) {
        list.push({
          id: 'dhw_no_circ', level: 'warn',
          title: 'Остановлена циркуляция ГВС',
          text: 'Насос Нц выключен или кольцо циркуляции перекрыто кранами. Без водоразбора стояки ГВС и полотенцесушители остывают (T4 падает), а из кранов пойдет остывшая вода.',
          detail: `T4 = ${f1(o.T4)} °C, Нц ${c.DHW_PUMP ? 'вкл' : 'выкл'}`
        });
      }
      if (o.circDeadhead) {
        list.push({
          id: 'dhw_circ_deadhead', level: 'warn',
          title: 'Насос Нц работает на закрытую арматуру',
          text: 'Кран до или после насоса циркуляции (Кн1, Кн2) или краны II ступени по воде (Кв3, Кв4) закрыты, а Нц включен. Вода в насосе греется, уплотнение изнашивается. Выключите Нц перед тем, как перекрывать кольцо.',
          detail: `Кн1 ${c.DHW_CIRC_IN ? 'откр' : 'закр'}, Кн2 ${c.DHW_CIRC_OUT ? 'откр' : 'закр'}, Кв3 ${c.DHW_HEX2_WIN ? 'откр' : 'закр'}, Кв4 ${c.DHW_HEX2_WOUT ? 'откр' : 'закр'}`
        });
      }
      if (!o.dhwWaterOK && c.DHW_DRAW >= 0.2) {
        list.push({
          id: 'dhw_no_water', level: 'warn',
          title: 'ЖАЛОБЫ ЖИЛЬЦОВ: Нет горячей воды',
          text: (!c.DHW_B1_VALVE
            ? 'Закрыт ввод ХВС В1. Циркуляция по кольцу T3 → стояки → T4 продолжается, но она гоняет по кругу одну и ту же воду. Каждый литр, разобранный из крана, восполняет только водопровод через В1 и ПТО ГВС. Без притока давление в системе ГВС падает, и краны пустеют.'
            : (!c.DHW_HEX2_WIN || !c.DHW_HEX2_WOUT)
              ? 'Закрыт кран II ступени по воде (Кв3 или Кв4): горячая вода не проходит из ПТО ГВС в дом. Циркуляция через ПТО тоже остановлена — стояки остывают.'
              : 'I ступень отключена по воде (закрыт Кв1 или Кв2), а обвод Кв5 закрыт: холодной воде некуда пройти ко II ступени. Циркуляция T4 продолжается, но восполнять разобранную воду нечем.'),
          detail: `В1 ${c.DHW_B1_VALVE ? 'откр' : 'закр'}, Кв3/Кв4 ${c.DHW_HEX2_WIN ? 'откр' : 'закр'}/${c.DHW_HEX2_WOUT ? 'откр' : 'закр'}` +
            (o.dhw2 ? `, Кв1/Кв2 ${c.DHW_ST1_WIN ? 'откр' : 'закр'}/${c.DHW_ST1_WOUT ? 'откр' : 'закр'}, обвод Кв5 ${c.DHW_ST1_WBYP ? 'откр' : 'закр'}` : '')
        });
      } else if (o.dhwWaterOK && c.DHW_DRAW > o.G_drawCap + 0.05) {
        list.push({
          id: 'dhw_low_flow', level: 'warn',
          title: 'ЖАЛОБЫ ЖИЛЬЦОВ: Слабый напор горячей воды',
          text: 'Водопровод не пропускает нужный расход: засорен сетчатый фильтр ХВС на вводе. Отключите В1 и промойте фильтр.',
          detail: `Нужно ${f1(c.DHW_DRAW)} т/ч, проходит ${f1(o.G_drawCap)} т/ч, засор фильтра ${Math.round(o.cwFoul)} %`
        });
      }
      if (o.dP_cwFilter > C.CW_FILTER_DP_WARN) {
        list.push({
          id: 'dhw_cw_filter', level: 'warn',
          title: 'Засорен фильтр ХВС на вводе ГВС',
          text: 'Большой перепад на сетчатом фильтре холодной воды. Окалина и песок из водопровода копятся на сетке; дальше они забьют пластины ПТО ГВС.',
          detail: `ΔP фильтра = ${f2(o.dP_cwFilter)} бар при ${f1(o.G_draw)} т/ч, засор ${Math.round(o.cwFoul)} %`
        });
      }
      if (o.circFoul >= C.CIRC_FILTER_WARN && c.DHW_PUMP) {
        list.push({
          id: 'dhw_circ_filter', level: 'warn',
          title: 'Засорен фильтр перед насосом Нц',
          text: 'Циркуляция ГВС упала: T4 и температура в дальних стояках снижаются. Выключите Нц, закройте Кн1 и Кн2, промойте фильтр.',
          detail: `G циркуляции = ${f2(o.G_circ)} т/ч из ${f1(C.G_CIRC)}, засор ${Math.round(o.circFoul)} %`
        });
      }
      if (o.dhwRelief1 || o.dhwRelief2) {
        list.push({
          id: 'dhw_relief', level: 'alarm',
          title: `АВАРИЯ: Сработал предохранительный клапан ГВС (${o.dhwRelief2 ? 'II' : 'I'} ступень, ${f1(C.DHW_RELIEF_SET)} бар)!`,
          text: 'ПТО ГВС закрыт по воде с двух сторон, а греющая сетевая вода продолжает идти: запертая вода нагревается, расширяется, и давление растет. ПК сбрасывает ее в дренаж. Порядок вывода ПТО в ремонт: сначала отключить по сети (КЗР ГВС или краны сетевой стороны), потом по воде.',
          detail: `P в отсеченном ПТО: I ст. ${f2(o.P_lock1)} бар, II ст. ${f2(o.P_lock2)} бар`
        });
      } else if (Math.max(o.P_lock1, o.P_lock2) > C.P_B1 + 1.0) {
        list.push({
          id: 'dhw_lock_pressure', level: 'warn',
          title: 'Растет давление в отсеченном ПТО ГВС',
          text: 'Теплообменник ГВС закрыт по воде с двух сторон и продолжает нагреваться. Перекройте подачу греющей воды или откройте кран по воде, иначе сработает предохранительный клапан.',
          detail: `P: I ст. ${f2(o.P_lock1)} бар, II ст. ${f2(o.P_lock2)} бар (ПК ${f1(C.DHW_RELIEF_SET)} бар)`
        });
      }
      if (o.st1Blocked && isOpen(c.V1) && isOpen(c.V2)) {
        list.push({
          id: 'dhw_st1_blocked', level: 'alarm',
          title: 'АВАРИЯ: Перекрыта обратка сети на I ступени ГВС!',
          text: 'Закрыт кран I ступени по сети (Кс3 или Кс4 — достаточно одного), а обвод Кс5 закрыт. Через I ступень идет вся обратка — расход сети встал, отопление и ГВС без тепла, ПТО под давлением подачи. Сначала откройте обвод Кс5, потом закрывайте краны I ступени.',
          detail: `Кс3 ${c.DHW_ST1_IN ? 'откр' : 'закр'}, Кс4 ${c.DHW_ST1_OUT ? 'откр' : 'закр'}, Кс5 ${c.DHW_ST1_BYP ? 'откр' : 'закр'} · P в ПТО (сеть) = ${f2(o.P_hex_net)} бар, G1 = ${f2(o.G1)} т/ч`
        });
      }
    }
    if (o.makeupType === 'pumped' && o.mpRunning && (o.nodes[4] < C.MP_MIN_SUCTION || o.fill[4] <= 0.1) && o.mpDryTime > C.MP_DRY_TRIP_S) {
      list.push({
        id: 'makeup_dry_run', level: 'alarm',
        title: 'Сухой ход подпиточного насоса Нп',
        text: 'На всасе линии подпитки (узел до V2) нет давления. Немедленно выключите Нп или откройте задвижку V2!',
        detail: `P на всасе Нп = ${f2(o.nodes[4])} бар, сухой ход ${o.mpDryTime.toFixed(1)} с`
      });
    }
    if (c.MAKEUP >= C.CLOSED_PCT && o.P21 < 3.1 && o.P_makeup_avail <= o.P21 + 0.05) {
      list.push({
        id: 'makeup_need_pump', level: 'warn',
        title: 'Недостаточный напор для подпитки',
        text: 'Давление в обратке сети (P2) ниже статического давления дома. Безнасосная подпитка невозможна — требуется подпиточный насос Нп.',
        detail: `Располагаемое давление подпитки ${f2(o.P_makeup_avail)} бар, P21 = ${f2(o.P21_disp)} бар`
      });
    }
    if (o.pumpTripped && !c.PUMP) {
      list.push({
        id: 'pump_trip', level: 'alarm',
        title: 'АВАРИЯ: Насос остановлен защитой по низкому давлению!',
        text: 'Давление на всасе упало ниже 1.5 бар — автоматика остановила насос, чтобы спасти его от кавитации, и закрыла КЗР. Циркуляции в доме нет.',
        detail: `P21 = ${f2(o.P21_disp)} бар`
      });
    }
    if (o.G1 > 0 && o.T2 > o.T2_max) {
      list.push({
        id: 't2_high', level: 'warn',
        title: 'ШТРАФ ОТ ТЕПЛОСЕТИ: Завышение температуры обратки T2!',
        text: `Температура обратной сетевой воды превышает график (${f1(o.T2_max)} °C). Слишком большой расход сетевой воды — прикройте регулирующий клапан КЗР.`,
        detail: `T2 = ${f1(o.T2)} °C при норме ≤ ${f1(o.T2_max)} °C`
      });
    }
    if (o.dP_strainer > C.STRAINER_DP_WARN) {
      list.push({
        id: 'strainer', level: 'warn',
        title: 'ПРЕДУПРЕЖДЕНИЕ: Засорен сетчатый фильтр (грязевик)!',
        text: 'Большой перепад давления на грязевике! Сетка забита окалиной, пропускная способность упала.',
        detail: `ΔP = ${f2(o.dP_strainer)} бар (до ${f2(o.P_before_strainer)} / после ${f2(o.P_after_strainer)})`
      });
    }
    if (o.T11 < o.T11_min || o.T11 > o.T11_max) {
      const under = o.T11 < o.T11_min;
      list.push({
        id: 't11_range', level: 'warn',
        title: `ЖАЛОБЫ ЖИЛЬЦОВ: ${under ? 'Недотоп' : 'Перетоп'} здания!`,
        text: `Температура подачи в дом отклонилась от графика (${f1(o.T11_target)} °C при ${f1(o.T_out)} °C на улице). Отрегулируйте клапан КЗР.`,
        detail: `T11 = ${f1(o.T11)} °C, коридор ${f1(o.T11_min)}…${f1(o.T11_max)} °C`
      });
    }
    if (o.T_room < C.ROOM_COLD || o.T_room > C.ROOM_HOT) {
      const cold = o.T_room < C.ROOM_COLD;
      list.push({
        id: 'room', level: 'warn',
        title: cold ? 'ЖАЛОБЫ ЖИЛЬЦОВ: В квартирах холодно!' : 'ЖАЛОБЫ ЖИЛЬЦОВ: В квартирах душно!',
        text: cold ? 'Температура в квартирах ниже нормы: дом получает меньше тепла, чем теряет на улицу.' : 'Температура в квартирах выше нормы: дом перетоплен.',
        detail: `T в квартирах = ${f1(o.T_room)} °C (норма ${C.ROOM_COLD}…${C.ROOM_HOT} °C), на улице ${f1(o.T_out)} °C`
      });
    }

    // Состояние сетевого участка (информационные сообщения)
    const minFill = Math.min(o.fill[1], o.fill[2], o.fill[3], o.fill[4]);
    if (minFill < 0.999) {
      const segs = o.segs;
      const empty = segs.every(g => g.state === 'empty');
      const draining = segs.find(g => g.state === 'draining');
      const airlock = segs.find(g => g.state === 'airlock');
      const filling = segs.find(g => g.state === 'filling' || g.state === 'leak_filling');
      let title, text;
      if (empty) {
        title = 'Сетевой участок опорожнен';
        text = 'Давление 0 бар, воды нет. Можно вскрывать и промывать грязевик. После ремонта закройте дренаж и заполните участок: откройте воздушник, затем плавно V2.';
      } else if (airlock) {
        title = 'Воздушная пробка при заполнении';
        text = 'Воздуху некуда выйти, участок заполнился только на 90 %. Откройте воздушник, а когда пойдет вода — закройте его.';
      } else if (filling) {
        title = 'Идет заполнение сетевого участка';
        text = filling.hasVent ? 'Воздух выходит через воздушник. Когда участок заполнится, закройте воздушник.' : 'Без воздушника воздух сожмется и запрет часть объема. Откройте воздушник.';
      } else if (draining) {
        title = 'Идет слив сетевого участка';
        text = draining.hasVent ? 'Воздух входит через воздушник, вода быстро уходит в дренаж.' : 'Без воздушника вода уходит очень медленно — внутрь не поступает воздух. Откройте воздушник.';
      } else {
        title = 'Сетевой участок частично опорожнен';
        text = 'Часть участка отсечена закрытой арматурой. Откройте КЗР, чтобы слить или заполнить весь участок.';
      }
      list.push({ id: 'net_section', level: 'info', title, text, detail: `Заполнение: ${Math.round(minFill * 100)} %, P до/после грязевика ${f2(o.nodes[1])}/${f2(o.nodes[2])} бар` });
    } else if (o.segs.some(g => g.state === 'trapped') && o.G1 === 0) {
      list.push({
        id: 'net_trapped', level: 'info',
        title: 'Давление заперто в отсеченном участке',
        text: 'Задвижки закрыты, но внутри осталась вода под давлением. Перед вскрытием арматуры сбросьте давление дренажом сети.',
        detail: `P до/после грязевика ${f2(o.nodes[1])}/${f2(o.nodes[2])} бар, P в ПТО ${f2(o.P_hex_net)} бар`
      });
    }

    if (!list.some(a => a.level === 'alarm' || a.level === 'warn')) {
      list.push({
        id: 'ok', level: 'ok',
        title: 'НОРМА',
        text: 'ИТП работает в штатном расчетном режиме. Тепловой баланс соблюден.',
        detail: `T11 = ${f1(o.T11)} °C, T2 = ${f1(o.T2)} °C, Q = ${Math.round(o.Q)} кВт`
      });
    }
    return list;
  }

  global.ITPPhysics = Object.freeze({
    CONST: C, foulDhwFilter, cleanDhwFilter, washHEX, replacePump1, replaceGaugeP21, repairKZR,
    createSimulator,
    resetNominal,
    settle,
    step,
    diagnose,
    strainerKv,
    cleanStrainer,
    setKZR,
    defaultEnv,
    defaultConfig,
    setConfig,
    graphT1, graphT11, graphT2max,
    kvOf
  });
})(typeof window !== 'undefined' ? window : globalThis);
