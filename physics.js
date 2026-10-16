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
    GATE_TRAVEL_S: 8.0,    // с, полный ход затвора задвижки V1/V2

    // Вторичный контур
    PUMP_HEAD: 1.8,        // бар, перепад, создаваемый насосом
    G2_NOMINAL: 14.0,      // т/ч, расход в системе отопления дома (см. README: почему не 22)
    P21_DEFAULT: 3.5,      // бар, статическое давление контура
    P21_CAVITATION: 1.5,   // бар, ниже — срыв (кавитация)
    RELIEF_SET: 6.0,       // бар, настройка предохранительного клапана
    RELIEF_RESEAT: 5.9,    // бар, давление обратной посадки
    DRAIN_P: 0.5,          // бар, к чему стремится контур при открытом дренаже
    K_MAKEUP: 0.6,         // 1/с, скорость подпитки при 100 % открытия
    K_DRAIN: 0.5,          // 1/с, скорость сброса в дренаж
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
      DRAIN: false
    };
  }

  function createSimulator() {
    const sim = { controls: nominalControls(), state: null, out: null };
    sim.state = { time: 0 };
    resetNominal(sim);
    return sim;
  }

  /** Возврат в штатный расчетный режим с прогревом до установившегося состояния. */
  function resetNominal(sim) {
    sim.controls = nominalControls();
    const time = sim.state ? sim.state.time : 0;
    sim.state = {
      time: time,
      P21: C.P21_DEFAULT,
      T11: C.T11_TARGET,
      T21: C.T11_TARGET - C.BUILDING_DT,
      T2: 54.0,
      nodes: [C.P1, C.P1, C.P1, C.P2, C.P2, C.P2],
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
  function solvePrimary(c, prevNodes) {
    const kv = [
      kvOf(c.V1, C.KVS_V1),
      strainerKv(c.strainerFouling),
      kvOf(c.KZR, C.KVS_KZR),
      C.KV_HEX,
      kvOf(c.V2, C.KVS_V2)
    ];
    const nodes = prevNodes.slice();
    nodes[0] = C.P1;
    nodes[NODE_COUNT - 1] = C.P2;

    let G1 = 0;
    let kvEq = 0;
    if (kv.every(k => k > 0)) {
      // Последовательная цепь: 1/Kv_eq² = Σ 1/Kv_i²
      const inv = kv.reduce((a, k) => a + 1 / (k * k), 0);
      kvEq = 1 / Math.sqrt(inv);
      G1 = kvEq * Math.sqrt(C.P1 - C.P2);
      // Потери на каждом элементе ΔP = (G/Kv)²
      let p = C.P1;
      for (let i = 0; i < kv.length; i++) {
        p -= (G1 / kv[i]) ** 2;
        nodes[i + 1] = p;
      }
      nodes[NODE_COUNT - 1] = C.P2;
    } else {
      // Расхода нет: каждый узел получает давление того источника,
      // с которым он соединен открытыми элементами. Отсеченные с двух
      // сторон участки сохраняют прежнее (запертое) давление.
      for (let i = 0; i < kv.length && kv[i] > 0; i++) nodes[i + 1] = C.P1;
      for (let i = kv.length - 1; i >= 0 && kv[i] > 0; i--) nodes[i] = C.P2;
      nodes[0] = C.P1;
    }

    const P_hex_net = G1 > 0 ? (nodes[3] + nodes[4]) / 2 : nodes[3];
    return { kv, kvEq, G1, nodes, P_after_strainer: nodes[2], P_hex_net };
  }

  // ---------------------------------------------------------------------------
  // Шаг модели
  // ---------------------------------------------------------------------------
  function step(sim, dt) {
    const c = sim.controls;
    const s = sim.state;

    // 0. Ход затворов задвижек: затвор всегда идет к крайнему положению,
    // остановить его посередине нельзя (задвижка — запорная арматура).
    const travel = (100 / C.GATE_TRAVEL_S) * dt;
    ['V1', 'V2'].forEach(k => {
      const target = c[k + 'cmd'] === 'open' ? 100 : 0;
      const d = target - c[k];
      c[k] = Math.abs(d) <= travel ? target : c[k] + Math.sign(d) * travel;
    });

    // 1. Сетевой контур
    const prim = solvePrimary(c, s.nodes);
    s.nodes = prim.nodes;
    const G1 = prim.G1;

    // 2. Внутренний контур: статическое давление P21
    // Подпитка берется из сетевой обратки до задвижки V2 (узел 4) через обратный клапан.
    const makeupSource = s.nodes[4];
    let dP21 = 0;
    let makeupFlow = 0;
    if (isOpen(c.MAKEUP) && makeupSource > s.P21) {
      makeupFlow = C.K_MAKEUP * (c.MAKEUP / 100) * (makeupSource - s.P21);
      dP21 += makeupFlow;
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

    // Насос
    const cavitation = c.PUMP && s.P21 < C.P21_CAVITATION;
    const pumpRunning = c.PUMP && !cavitation;
    const G2 = pumpRunning ? C.G2_NOMINAL : 0;
    const P11 = s.P21 + (pumpRunning ? C.PUMP_HEAD : 0);

    // 3. Теплообмен с инерцией (явный Эйлер)
    const W1 = G1 * C.C_WATER;
    const W2 = G2 * C.C_WATER;
    let Q = 0;
    let T11eq, T2eq;
    if (G1 > 0 && G2 > 0) {
      Q = Math.max(0, C.HEX_EFF * Math.min(W1, W2) * (C.T1 - s.T21));
      T2eq = C.T1 - Q / W1;
      T11eq = s.T21 + Q / W2;
    } else if (G1 > 0) {
      // Сетевая вода идет, а домовая стоит: ПТО «запаривается» до температуры сети
      T11eq = C.T1;
      T2eq = C.T1 - 2.0;
    } else {
      // Подача тепла прекращена
      T11eq = s.T21;
      T2eq = C.T_STAGNANT;
    }
    s.T11 += (dt / C.TAU_T) * (T11eq - s.T11);
    s.T2 += (dt / C.TAU_T) * (T2eq - s.T2);

    // Обратка из дома: при циркуляции следует за (T11 − ΔT_дома),
    // без циркуляции стоячая вода в стояках медленно остывает к комнатной.
    const T21target = G2 > 0 ? Math.max(C.T_MIN, s.T11 - C.BUILDING_DT) : C.T_MIN;
    const tau21 = G2 > 0 ? C.TAU_T21 : C.TAU_HOUSE_COOL;
    s.T21 += (dt / tau21) * (T21target - s.T21);
    s.T21 = Math.max(C.T_MIN, s.T21);

    s.time += dt;

    sim.out = {
      time: s.time,
      T1: C.T1, P1: C.P1, P2: C.P2,
      T2: s.T2, T11: s.T11, T21: s.T21,
      G1, G2, W1, W2, Q,
      kv: prim.kv, kvEq: prim.kvEq,
      nodes: s.nodes.slice(),
      P_after_strainer: prim.P_after_strainer,
      P_before_strainer: s.nodes[1],
      dP_strainer: s.nodes[1] - prim.P_after_strainer, // показания манометров до/после грязевика
      P_hex_net: prim.P_hex_net,
      P21: s.P21, P11,
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

    if (!isOpen(c.V2) && isOpen(c.V1) && isOpen(c.KZR)) {
      list.push({
        id: 'hex_overpressure', level: 'alarm',
        title: 'АВАРИЯ: Опрессовка ПТО подающим давлением!',
        text: 'Закрыта задвижка на обратке при открытой подаче! Давление в теплообменнике выросло до 6.5 бар. Риск разрыва уплотнений ПТО. Всегда закрывайте сначала подачу, затем обратку!',
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
    if (o.G1 > 0 && o.T2 > C.T2_MAX) {
      list.push({
        id: 't2_high', level: 'warn',
        title: 'ШТРАФ ОТ ТЕПЛОСЕТИ: Завышение температуры обратки T2!',
        text: 'Температура обратной сетевой воды превышает график (55 °C). Слишком большой расход сетевой воды — прикройте регулирующий клапан КЗР.',
        detail: `T2 = ${f1(o.T2)} °C при норме ≤ 55.0 °C`
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
    if (o.T11 < C.T11_MIN || o.T11 > C.T11_MAX) {
      const under = o.T11 < C.T11_MIN;
      list.push({
        id: 't11_range', level: 'warn',
        title: `ЖАЛОБЫ ЖИЛЬЦОВ: ${under ? 'Недотоп' : 'Перетоп'} здания!`,
        text: 'Температура подачи в дом отклонилась от расчетных 75 °C. Отрегулируйте клапан КЗР.',
        detail: `T11 = ${f1(o.T11)} °C, коридор 70…80 °C`
      });
    }
    if (list.length === 0) {
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
    kvOf
  });
})(typeof window !== 'undefined' ? window : globalThis);
