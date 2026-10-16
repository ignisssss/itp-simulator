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
      pumpProtection: false   // защита насоса по низкому давлению (останов через 3 с)
    };
  }

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
      KZR: C.NOMINAL_KZR,
      V2: 100,
      V2cmd: 'open',
      PUMP: true,
      MAKEUP: 0,
      DRAIN: false,
      NET_DRAIN: false,      // дренаж сетевого участка (нижняя точка, перед V2)
      NET_VENT: false,       // воздушник сетевого участка (верхняя точка, вход ПТО)
      V1tag: false,          // плакат «Не открывать — работают люди» на V1
      V2tag: false
    };
  }

  function createSimulator() {
    const sim = { controls: nominalControls(), state: null, out: null, env: defaultEnv() };
    sim.state = { time: 0 };
    resetNominal(sim);
    return sim;
  }

  /** Возврат в штатный расчетный режим с прогревом до установившегося состояния. */
  function resetNominal(sim) {
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
      nodes: [C.P1, C.P1, C.P1, C.P2, C.P2, C.P2],
      fill: [1, 1, 1, 1, 1, 1],
      strainerAlarmUntil: -1,
      reliefOpen: false
    };
    settle(sim, 180);
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
  function solvePrimary(c, s, dt, env) {
    const P1 = env.P1, P2 = env.P2;
    const kv = [
      kvOf(c.V1, C.KVS_V1),
      strainerKv(c.strainerFouling),
      kvOf(c.KZR, C.KVS_KZR),
      C.KV_HEX,
      kvOf(c.V2, C.KVS_V2)
    ];
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

    let allFull = true;
    let drainLeak = false;   // дренаж открыт на участке, соединенном с теплосетью
    let ventSpray = false;   // воздушник открыт на участке под давлением сети
    let netDrainFlow = 0;
    let netVentFlow = 0;
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
    if (open.every(Boolean) && allFull) {
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
      kv, kvEq, G1, nodes, P_after_strainer: nodes[2], P_hex_net,
      segs: segInfo, drainLeak, ventSpray, netDrainFlow, netVentFlow
    };
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

    // 1. Сетевой контур
    const prim = solvePrimary(c, s, dt, env);
    s.nodes = prim.nodes;
    const G1 = prim.G1;

    // 2. Внутренний контур: статическое давление P21
    // Подпитка берется из сетевой обратки до задвижки V2 (узел 4) через обратный клапан.
    const makeupSource = s.nodes[4];
    let dP21 = 0;
    let makeupFlow = 0;
    if (isOpen(c.MAKEUP) && makeupSource > s.P21 && s.fill[4] > 0.5) {
      makeupFlow = C.K_MAKEUP * (c.MAKEUP / 100) * (makeupSource - s.P21);
      dP21 += makeupFlow;
      // Если сетевой участок отсечен от теплосети, подпитка берет воду из его малого объема:
      // давление в нем быстро падает, и подпитать дом нечем (нужно открыть V2).
      const seg4 = prim.segs.find(g => g.nodes.includes(4));
      if (seg4 && seg4.src === null) {
        seg4.nodes.forEach(n => { s.nodes[n] = Math.max(0, s.nodes[n] - 4 * makeupFlow * dt); });
      }
    }
    // Утечка в системе отопления дома (сценарии уровней)
    let leakFlow = 0;
    if (env.houseLeak > 0 && s.P21 > 0) {
      leakFlow = env.houseLeak * Math.sqrt(s.P21 / C.P21_DEFAULT);
      dP21 -= leakFlow;
    }
    let drainFlow = 0;
    if (c.DRAIN && s.P21 > C.DRAIN_P) {
      drainFlow = C.K_DRAIN * (s.P21 - C.DRAIN_P);
      dP21 -= drainFlow;
    }

    // Предохранительный клапан на подаче в дом (с гистерезисом)
    const headBefore = (c.PUMP && s.P21 >= C.P21_CAVITATION) ? C.PUMP_HEAD : 0;
    const P11before = s.P21 + headBefore;
    if (P11before > C.RELIEF_SET) s.reliefOpen = true;
    else if (P11before < C.RELIEF_RESEAT) s.reliefOpen = false;
    let reliefFlow = 0;
    if (s.reliefOpen) {
      reliefFlow = C.K_RELIEF * (P11before - (C.RELIEF_RESEAT - 0.1));
      dP21 -= reliefFlow;
    }

    s.P21 = Math.max(0, s.P21 + dP21 * dt);

    // Защита насоса по низкому давлению на всасе: через PUMP_TRIP_S с останавливает насос
    if (c.PUMP && s.P21 < C.P21_CAVITATION) s.lowPTime += dt; else s.lowPTime = 0;
    if (env.pumpProtection && c.PUMP && s.lowPTime >= C.PUMP_TRIP_S) {
      c.PUMP = false;
      c.KZR = 0;            // автоматика закрывает КЗР, чтобы не «запарить» ПТО без циркуляции
      s.pumpTripped = true;
      s.lowPTime = 0;
    }

    // Насос
    const cavitation = c.PUMP && s.P21 < C.P21_CAVITATION;
    const pumpRunning = c.PUMP && !cavitation;
    const G2 = pumpRunning ? C.G2_NOMINAL : 0;
    const P11 = s.P21 + (pumpRunning ? C.PUMP_HEAD : 0);

    // Давления по контуру дома. Напор насоса тратится на ПТО (0.5 бар) и на стояки (1.3 бар).
    const dP_hex_sec = pumpRunning ? C.HEX_SEC_DP : 0;
    const P_house_supply = P11 - dP_hex_sec;           // подача в дом на выходе ИТП (1-й этаж)
    const P_house_return = s.P21;                       // обратка из дома перед насосом
    const dP_house = P_house_supply - P_house_return;   // располагаемый перепад на вводе в дом
    const P_hydro = C.HOUSE_HEIGHT_M * C.BAR_PER_M;     // гидростатика столба 27 м
    // Верх стояков — середина пути по системе: среднее подачи и обратки минус столб воды
    // Отрицательное значение означает, что столб воды не доходит до 9-го этажа (стояки опорожнились).
    const P_top_raw = (P_house_supply + P_house_return) / 2 - P_hydro;
    const P_top = Math.max(0, P_top_raw);
    const topFloorDry = P_top_raw < 0;

    // 3. Теплообмен с инерцией (явный Эйлер)
    const W1 = G1 * C.C_WATER;
    const W2 = G2 * C.C_WATER;
    let Q = 0;
    let T11eq, T2eq;
    if (G1 > 0 && G2 > 0) {
      Q = Math.max(0, C.HEX_EFF * Math.min(W1, W2) * (T1 - s.T21));
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
    s.dryTopTime = topFloorDry ? s.dryTopTime + dt : 0;

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
      cavTime: s.cavTime, noCircTime: s.noCircTime, dryTopTime: s.dryTopTime,
      T2: s.T2, T11: s.T11, T21: s.T21,
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
      makeupFlow, drainFlow, reliefFlow
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
    if (c.PUMP && o.P21 < C.P21_CAVITATION) {
      list.push({
        id: 'cavitation', level: 'alarm',
        title: 'АВАРИЯ: Кавитация на всасе насоса!',
        text: 'Давление на всасе ниже 1.5 бар! Вода вскипает на лопатках рабочего колеса, разрушая насос. Срочно откройте кран подпитки до 3.5 бар или выключите насос!',
        detail: `P21 = ${f2(o.P21)} бар`
      });
    }
    if (!c.PUMP && o.G1 > 1.0) {
      list.push({
        id: 'no_circulation', level: 'alarm',
        title: 'АВАРИЯ: Подача теплоносителя без циркуляции отопления!',
        text: 'Насос отопления выключен, но сетевая вода идет в ПТО! Вторичный контур в теплообменнике перегревается до 95 °C, интенсивно выпадает накипь, а дом остывает.',
        detail: `G1 = ${f1(o.G1)} т/ч, T11 = ${f1(o.T11)} °C`
      });
    }
    if (o.reliefOpen || o.P11 > C.RELIEF_SET) {
      list.push({
        id: 'relief', level: 'alarm',
        title: 'АВАРИЯ: Сработал предохранительный клапан (> 6.0 бар)!',
        text: 'Превышено допустимое давление во внутреннем контуре! Закройте кран подпитки.',
        detail: `P11 = ${f2(o.P11)} бар, P21 = ${f2(o.P21)} бар`
      });
    }
    if (o.P_top < C.TOP_FLOOR_MIN_P) {
      list.push({
        id: 'top_floor', level: 'warn',
        title: 'ПРЕДУПРЕЖДЕНИЕ: Завоздушивание верхних этажей!',
        text: 'Давления в контуре не хватает, чтобы держать воду до 9-го этажа с запасом. В верхних радиаторах скапливается воздух, они перестают греть. Поднимите статическое давление подпиткой до 3.5 бар.',
        detail: o.topFloorDry
          ? `Вода не доходит до 9-го этажа: верхние стояки пустые. P21 = ${f2(o.P21)} бар`
          : `P на 9 эт. = ${f2(o.P_top)} бар (нужно ≥ ${f2(C.TOP_FLOOR_MIN_P)}), P21 = ${f2(o.P21)} бар`
      });
    }
    if (o.pumpTripped && !c.PUMP) {
      list.push({
        id: 'pump_trip', level: 'alarm',
        title: 'АВАРИЯ: Насос остановлен защитой по низкому давлению!',
        text: 'Давление на всасе упало ниже 1.5 бар — автоматика остановила насос, чтобы спасти его от кавитации, и закрыла КЗР. Циркуляции в доме нет.',
        detail: `P21 = ${f2(o.P21)} бар`
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
    CONST: C,
    createSimulator,
    resetNominal,
    settle,
    step,
    diagnose,
    strainerKv,
    cleanStrainer,
    defaultEnv,
    graphT1, graphT11, graphT2max,
    kvOf
  });
})(typeof window !== 'undefined' ? window : globalThis);
