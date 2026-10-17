/*
 * levels.js — уровни: смены с всплывающими проблемами, без подсказок, с оценкой.
 *
 * Уровень = список инцидентов. У инцидента есть момент начала (at, секунды смены),
 * действие на модель (start/update), момент, когда о нем узнает оператор (reveal),
 * сообщение (или «тихий» инцидент — только приборы), условие решения (resolved + hold),
 * норматив времени (norm) и крайний срок (deadline).
 *
 * Оценка инцидента: 60 баллов за решение + до 40 за скорость (полные 40 в пределах
 * норматива, линейно до 0 при трех нормативах). Из среднего вычитаются штрафы за мягкие
 * ошибки. Критическая авария прекращает смену.
 * Чтобы добавить или поменять сценарий — правьте массив LEVELS ниже.
 */
(function () {
  'use strict';

  const P = window.ITPPhysics;
  const C = P.CONST;
  const app = window.ITPApp;
  const I = window.ITPIcons;
  const sim = app.sim;
  const $ = id => document.getElementById(id);
  const STORE_KEY = 'itp-levels-v1';

  // ---------------------------------------------------------------------------
  // Помощники для описания сценариев
  // ---------------------------------------------------------------------------
  const o = () => sim.out;
  const c = () => sim.controls;
  const near = (v, target, tol) => Math.abs(v - target) <= tol;
  /** Дом на графике: T11 в пределах ±2.5 °C от графика, обратка не выше нормы. */
  const onGraph = () => o().G1 > 0 && o().G2 > 0 && near(o().T11, o().T11_target, 2.5) && o().T2 <= o().T2_max + 0.3;
  /** Давление в доме в норме и подпитка закрыта. */
  const pressureOk = () => o().P21 >= 3.2 && o().P21 <= 4.0 && c().MAKEUP < 0.5 && !c().DRAIN && !o().reliefOpen;
  /** Сетевой участок полностью в работе после ремонта. */
  const sectionNormal = () => Math.min(o().fill[1], o().fill[2], o().fill[3], o().fill[4]) >= 0.999 &&
    !c().NET_DRAIN && !c().NET_VENT && !c().V1tag && !c().V2tag && c().V1 >= 100 && c().V2 >= 100;

  /** Плавное изменение наружной температуры: ramp(от, до, секунд). */
  function ramp(from, to, seconds) {
    return (sim, t) => { sim.env.T_out = from + (to - from) * Math.min(1, t / seconds); };
  }

  // ---------------------------------------------------------------------------
  // Уровни
  // ---------------------------------------------------------------------------
  const LEVELS = [
    {
      id: 'l1', n: 1, title: 'Первая смена', difficulty: 'Лёгкий',
      intro: 'Обычная зимняя смена, −10 °C. Проблемы будут приходить по одной. Подсказок нет — ориентируйтесь на сообщения и приборы.',
      setup() {},
      incidents: [
        {
          id: 'cold15', title: 'Похолодание до −15 °C', at: 30,
          update: ramp(-10, -15, 60),
          message: { from: 'Диспетчер теплосети', text: 'Ожидается похолодание до −15 °C. Обеспечьте параметры по температурному графику.' },
          resolved: onGraph, minTime: 90, hold: 30, norm: 180, deadline: 600, lesson: 'regulation',
          fix: 'Плавно приоткрыть КЗР (≈ 52 %), дождаться T11 ≈ 82 °C по графику, следить, чтобы T2 не превысила норму.'
        },
        {
          id: 'leak', title: 'Утечка в системе отопления', at: 330,
          start(sim) { sim.env.houseLeak = 0.006; },
          update(sim, t) { if (t > 150) sim.env.houseLeak = 0; },
          reveal: t => o().P_top < 0.9 || t > 160,   // внимательный оператор мог подпитать заранее
          message: { from: 'Жилец, кв. 112 (9 этаж)', text: 'Батареи стали еле теплые, в трубах журчит.' },
          extra: [{ at: 150, from: 'Сантехник', text: 'Нашли капающий кран на стояке в кв. 45, течь устранена.' }],
          resolved: () => pressureOk() && o().P_top >= 0.5, hold: 20, norm: 150, deadline: 700, lesson: 'makeup',
          fix: 'Приоткрыть подпитку на 10–20 %, поднять P21 до ≈ 3.5 бар, закрыть подпитку. Не допустить срабатывания ПК.'
        },
        {
          id: 'foul', title: 'Засор грязевика', at: 700,
          start(sim) { sim.env.foulRate = 0.35; },
          update(sim) { if (sim.controls.strainerFouling >= 85) sim.env.foulRate = 0; },
          reveal: () => o().dP_strainer > 0.6,
          message: { from: 'Автоматика ИТП', text: 'Перепад давления на грязевике выше уставки 0.6 бар.' },
          resolved: () => c().strainerFouling < 5 && sectionNormal() && o().G1 > 0, hold: 30, norm: 300, deadline: 1500, lesson: 'strainer',
          fix: 'Закрыть V1, затем V2, повесить плакаты, открыть дренаж и воздушник, дождаться 0 бар и слива, промыть, закрыть дренаж, снять плакаты, заполнить через V2, закрыть воздушник, открыть V1.'
        }
      ]
    },

    {
      id: 'l2', n: 2, title: 'Морозная ночь', difficulty: 'Средний',
      intro: 'Ночная смена. Принимая смену, проверьте приборы: предыдущий оператор мог что-то оставить. Ночью ожидается сильный мороз.',
      setup() { sim.controls.MAKEUP = 3; },
      incidents: [
        {
          id: 'makeupLeft', title: 'Сменщик оставил подпитку открытой', at: 0, silent: true,
          resolved: () => pressureOk(), hold: 20, norm: 60, deadline: 400, lesson: 'relief',
          fix: 'Заметить рост P21/P11, закрыть подпитку. Если давление выше 4 бар — стравить дренажом контура до ≈ 3.5 бар.'
        },
        {
          id: 'cold20', title: 'Мороз до −20 °C', at: 150,
          update: ramp(-10, -20, 120),
          message: { from: 'Диспетчер теплосети', text: 'Температура наружного воздуха понижается до −20 °C. Работаем по графику.' },
          resolved: onGraph, minTime: 150, hold: 30, norm: 240, deadline: 700, lesson: 'regulation',
          fix: 'Приоткрывать КЗР шагами до ≈ 57 % с выдержкой, T11 ≈ 89 °C, T2 ≤ 63 °C.'
        },
        {
          id: 't1up', title: 'Теплосеть подняла температуру подачи', at: 650,
          start(sim) { sim.env.T1 = P.graphT1(sim.env.T_out) + 10; },
          reveal: t => o().T2 > o().T2_max || t > 90,
          message: { from: 'Диспетчер теплосети', text: 'По вашему вводу температура обратной воды выше графика. Будет выставлен штраф.' },
          resolved: onGraph, hold: 30, norm: 180, deadline: 600, lesson: 'regulation',
          fix: 'Сеть дала более горячую воду — тот же расход дает перетоп и горячую обратку. Прикрыть КЗР до возврата на график.'
        },
        {
          id: 'thaw', title: 'Оттепель до −5 °C', at: 1050,
          start(sim) { sim.env.T1 = null; },
          update: ramp(-20, -5, 120),
          message: { from: 'Диспетчер теплосети', text: 'Утром потепление до −5 °C, подача переведена на график.' },
          resolved: onGraph, minTime: 150, hold: 30, norm: 240, deadline: 700, lesson: 'regulation',
          fix: 'Прикрыть КЗР до ≈ 43 %: дому нужно меньше тепла, иначе перетоп и штраф за обратку.'
        }
      ]
    },

    {
      id: 'l3', n: 3, title: 'Беспокойная смена', difficulty: 'Сложный',
      intro: 'Насос защищен автоматикой по низкому давлению. Проблемы будут накладываться друг на друга, часть из них не сопровождается сообщениями.',
      setup() { sim.env.pumpProtection = true; },
      incidents: [
        {
          id: 'v2closed', title: 'Закрыта задвижка обратки V2', at: 45, silent: true,
          start(sim) { sim.controls.V2cmd = 'close'; },
          resolved: () => c().V2 >= 100 && c().V1 >= 100 && o().G1 > 0, hold: 10, norm: 45, deadline: 300, lesson: 'hexpressure',
          fix: 'Плавно открыть V2. Закрывать подачу не нужно — это лишний перерыв в отоплении.'
        },
        {
          id: 'bigleak', title: 'Течь на стояке, насос остановлен', at: 260,
          start(sim) { sim.env.houseLeak = 0.035; },
          update(sim, t) { if (t > 70) sim.env.houseLeak = 0; },
          message: { from: 'Жилец, подвал', text: 'В подвале из трубы бежит вода!' },
          extra: [{ at: 70, from: 'Сантехник', text: 'Перекрыли и заменили участок стояка, течи больше нет.' }],
          resolved: () => o().pumpRunning && pressureOk() && onGraph(), hold: 30, norm: 300, deadline: 900, lesson: 'pumpstart',
          fix: 'Насос остановился по защите, автоматика закрыла КЗР. Не пускать насос на пустую систему: дождаться устранения течи, подпитать до ≈ 3.5 бар, закрыть подпитку, включить насос, вернуть КЗР в рабочее положение по графику.'
        },
        {
          id: 'p1drop', title: 'Теплосеть снизила давление подачи', at: 720, silent: true, needsReport: true,
          start(sim) { sim.env.P1 = 5.6; },
          resolved: () => onGraph(), hold: 30, norm: 240, deadline: 800, lesson: 'regulation',
          onReport(sim, lvl) { lvl.schedule(150, () => { sim.env.P1 = C.P1; lvl.toast('Диспетчер теплосети', 'Давление в подающем трубопроводе восстановлено до 6.5 бар.'); lvl.activate('p1back'); }); },
          fix: 'Падение T11 при исправном ИТП и меньшем перепаде P1−P2. Открыть КЗР больше (≈ 65–70 %) и сообщить диспетчеру теплосети.'
        },
        {
          id: 'p1back', title: 'Давление сети восстановлено', manual: true,
          resolved: onGraph, hold: 30, norm: 180, deadline: 600, lesson: 'regulation',
          fix: 'После восстановления давления прежнее открытие КЗР дает перетоп — вернуть КЗР к ≈ 52 %.'
        },
        {
          id: 'cold15b', title: 'Похолодание до −15 °C', at: 1150,
          update: ramp(-10, -15, 60),
          message: { from: 'Диспетчер теплосети', text: 'Похолодание до −15 °C.' },
          resolved: onGraph, minTime: 90, hold: 30, norm: 240, deadline: 900, lesson: 'regulation',
          fix: 'Приоткрыть КЗР по графику. Если параллельно идет промывка фильтра — сначала быстро закончить ремонт.'
        },
        {
          id: 'foul3', title: 'Засор грязевика', at: 1150,
          start(sim) { sim.controls.strainerFouling = Math.max(sim.controls.strainerFouling, 70); sim.env.foulRate = 0.2; },
          update(sim) { if (sim.controls.strainerFouling >= 88) sim.env.foulRate = 0; },
          reveal: () => o().dP_strainer > 0.6,
          message: { from: 'Автоматика ИТП', text: 'Перепад давления на грязевике выше уставки.' },
          resolved: () => c().strainerFouling < 5 && sectionNormal() && o().G1 > 0, hold: 30, norm: 240, deadline: 1500, lesson: 'strainer',
          fix: 'Промыть грязевик по полной процедуре. В мороз — без задержек: дом остывает, пока ИТП отключен.'
        }
      ]
    },

    {
      id: 'l4', n: 4, title: 'Отказы оборудования', difficulty: 'Очень сложный',
      intro: 'Смена, в которой отказывает оборудование. Пользуйтесь резервом: ручным режимом КЗР, резервным насосом Н2, отсекающими кранами дома.',
      setup() {},
      incidents: [
        {
          id: 'kzrfail', title: 'Отказ привода КЗР при похолодании', at: 40,
          start(sim) { sim.env.kzrFail = true; },
          update: ramp(-10, -15, 60),
          message: { from: 'Автоматика ИТП', text: 'Привод КЗР: потеря обратной связи. Регулятор не отрабатывает задание.' },
          extra: [{ at: 8, from: 'Диспетчер теплосети', text: 'Похолодание до −15 °C, работаем по графику.' }],
          resolved: () => c().KZR_MANUAL && onGraph(), minTime: 90, hold: 30, norm: 240, deadline: 800, lesson: 'kzrmanual',
          fix: 'Перевести КЗР в ручной режим и штурвалом открыть до ≈ 52 % (штурвал медленнее привода), выйти на график −15 °C.'
        },
        {
          id: 'pump1', title: 'Авария рабочего насоса Н1', at: 420,
          start(sim) { sim.env.pump1Fail = true; },
          message: { from: 'Автоматика ИТП', text: 'Насос Н1: авария электродвигателя. Перепад на насосе отсутствует.' },
          resolved: () => o().p2Running && o().G2 > 0 && !c().PUMP && !c().PUMP1_ISO, hold: 20, norm: 90, deadline: 600, lesson: 'pumpswap',
          onDone(sim, lvl) { lvl.toast('Слесарь', 'Н1 отсечен, забираем в мастерскую.'); },
          fix: 'Сразу пустить резервный Н2 (циркуляция нужна в течение 30 с, иначе ПТО «запарится»), затем остановить Н1 и закрыть его краны для ремонта.'
        },
        {
          id: 'burst', title: 'Прорыв радиатора в квартире', at: 820,
          start(sim) { sim.env.burst = 0.12; },
          update(sim, t, inst, lvl) {
            // сантехник меняет радиатор, когда дом отсечен и давление в нем сброшено (30 с)
            if (sim.env.burst > 0 && !sim.controls.HOUSE_SUP && !sim.controls.HOUSE_RET && sim.out.P_house < 0.1) {
              inst.repairT = (inst.repairT || 0) + lvl.dt;
              if (inst.repairT > 30) { sim.env.burst = 0; lvl.toast('Сантехник', 'Радиатор в кв. 37 заменен. Систему можно заполнять.'); }
            } else if (sim.env.burst > 0) inst.repairT = 0;
          },
          message: { from: 'Жилец, кв. 37 (3 этаж)', text: 'Прорвало радиатор! Кипяток на полу, заливает соседей снизу!' },
          resolved: () => sim.env.burst === 0 && o().houseOpen && o().houseFill >= 0.999 && o().pumpRunning && pressureOk() &&
            !c().HOUSE_VENT && !c().HOUSE_DRAIN && onGraph(),
          hold: 30, norm: 600, deadline: 1500, lesson: 'housedrain',
          fix: 'Остановить подачу воды в квартиру: закрыть краны дома Кд1 и Кд2, открыть спуск стояков и воздушники. Пока циркуляции нет — прекратить подачу тепла в ПТО (закрыть V1 или КЗР) и остановить насос. После замены радиатора: закрыть спуск, открыть Кд2, подпитать с открытыми воздушниками, закрыть воздушники, поднять давление до ≈ 3.5 бар, открыть Кд1, пустить насос, вернуть тепло.'
        }
      ]
    },

    {
      id: 'l5', n: 5, title: 'Тяжёлая смена', difficulty: 'Эксперт',
      intro: 'Сильный мороз, перебои в сети и скрытые неисправности. Не все проблемы видны сразу, не всем приборам можно верить. Насос защищен автоматикой.',
      setup() { sim.env.pumpProtection = true; },
      incidents: [
        {
          id: 'under', title: 'Мороз −25 °C, сеть недодает температуру', at: 30,
          start(sim) { sim.env.T1 = 100; },
          update: ramp(-10, -25, 120),
          message: { from: 'Диспетчер теплосети', text: 'Мороз до −25 °C. Авария на магистрали: подача будет около 100 °C вместо графика. Обеспечьте максимум, что возможно.' },
          resolved: () => c().KZR >= 85 && o().G2 > 0 && o().T2 <= o().T2_max + 1.5, minTime: 120, hold: 30, norm: 180, deadline: 700, lesson: 'regulation',
          onDone(sim, lvl) {
            lvl.schedule(240, () => { sim.env.T1 = null; lvl.toast('Диспетчер теплосети', 'Магистраль восстановлена, подача по графику.'); lvl.activate('restore'); });
          },
          fix: 'При недодаче сети по графику прогреть дом нельзя: открыть КЗР почти полностью (85–100 %), следя, чтобы обратка не ушла заметно выше нормы.'
        },
        {
          id: 'restore', title: 'Сеть вернулась на график', manual: true,
          resolved: onGraph, hold: 30, norm: 240, deadline: 700, lesson: 'regulation',
          fix: 'Сеть снова дает горячую воду — прикрыть КЗР до графика, иначе перетоп и штраф за обратку.'
        },
        {
          id: 'foul5', title: 'Засор грязевика в мороз', at: 760,
          start(sim) { sim.controls.strainerFouling = Math.max(sim.controls.strainerFouling, 72); sim.env.foulRate = 0.25; sim.env.v1Passing = 0.06; },
          update(sim) { if (sim.controls.strainerFouling >= 88) sim.env.foulRate = 0; },
          reveal: () => o().dP_strainer > 0.6,
          message: { from: 'Автоматика ИТП', text: 'Перепад давления на грязевике выше уставки.' },
          resolved: () => c().strainerFouling < 5 && sectionNormal() && o().G1 > 0, hold: 30, norm: 360, deadline: 1500, lesson: 'strainer',
          fix: 'Промыть грязевик по полной процедуре. Если давление на слитом участке не падает до нуля — вскрывать нельзя.'
        },
        {
          id: 'v1pass', title: 'Задвижка V1 пропускает', at: 760, optional: true, needsReport: true,
          reveal: () => c().V1cmd === 'close' && c().V1 <= 0 && c().NET_DRAIN && o().v1Leak && o().nodes[2] > 0.1,
          onReport(sim, lvl) {
            lvl.schedule(60, () => { sim.env.v1Passing = 0; lvl.toast('Диспетчер теплосети', 'Закрыли задвижку в тепловой камере. По окончании работ откроем, V1 после ремонта на замену.'); });
          },
          resolved: () => sim.env.v1Passing === 0, hold: 5, norm: 120, deadline: 900, lesson: 'strainer',
          fix: 'Давление на отключенном и открытом в дренаж участке не падает до нуля — значит, V1 пропускает. Вскрывать нельзя. Держать дренаж открытым и сообщить диспетчеру теплосети, чтобы отключили ввод в тепловой камере.'
        },
        {
          id: 'stuck', title: 'Отказ манометра P21 и утечка', at: 1400,
          start(sim) { sim.env.p21Stuck = Math.round(sim.out.P21 * 100) / 100; sim.env.houseLeak = 0.005; },
          update(sim, t) { if (t > 220) sim.env.houseLeak = 0; },
          reveal: t => o().P_top < 0.6 || t > 260,
          message: { from: 'Жилец, кв. 108 (9 этаж)', text: 'Батареи наверху холодные, в трубах журчит, а у соседей снизу тепло.' },
          extra: [{ at: 220, from: 'Сантехник', text: 'Нашли и устранили течь на стояке в подвале.' }],
          resolved: () => pressureOk() && o().P_top >= 0.5, hold: 20, norm: 240, deadline: 900, lesson: 'makeup',
          onDone(sim, lvl) { sim.env.p21Stuck = null; lvl.toast('Метролог', 'Манометр P21 на всасе был неисправен — заменен.'); },
          fix: 'Манометр P21 «застыл». Давление на всасе можно оценить по P11 − 1.8 бар и по давлению на 9 этаже. Подпитать по этим приборам до ≈ 3.5 бар.'
        }
      ]
    }
  ];

  // Будущие уровни
  const SOON = [];

  // ---------------------------------------------------------------------------
  // Мягкие ошибки и критические аварии
  // ---------------------------------------------------------------------------
  const SOFT = {
    tag_violation: { pts: 10, text: 'Открыта задвижка с плакатом' },
    net_drain_leak: { pts: 10, text: 'Слив сетевой воды в канализацию' },
    vent_spray: { pts: 3, after: 8, text: 'Воздушник открыт под давлением дольше 8 с' },
    relief: { pts: 15, text: 'Срабатывание предохранительного клапана' },
    cavitation: { pts: 10, text: 'Кавитация насоса (пуск при низком давлении)' },
    no_circulation: { pts: 10, after: 10, text: 'Подача тепла без циркуляции в доме дольше 10 с' },
    false_report: { pts: 5, text: 'Ложный вызов диспетчера' },
    pump_deadhead: { pts: 8, after: 10, text: 'Насос работал на закрытую арматуру дольше 10 с' },
    house_vent_spray: { pts: 3, after: 8, text: 'Вода из воздушников 9 этажа дольше 8 с' }
  };
  const RATE = { t2: { per: 10, cap: 20, text: 'Обратка T2 выше графика (−1 за 10 с)' }, room: { per: 20, cap: 20, text: 'Холодно или душно в квартирах при T11 вне графика (−1 за 20 с)' }, flood: { per: 5, cap: 30, text: 'Залив квартиры (−1 за 5 с)' } };

  function criticalCheck(diag, st) {
    const out = o();
    if (out.cavTime > 5) return { title: 'Насос разрушен кавитацией', text: 'Насос больше 5 секунд работал при давлении на всасе ниже 1.5 бар. Пузырьки пара разрушили рабочее колесо — дом без отопления до замены насоса.', lesson: 'pumpstart' };
    if (out.floodTime > 240) return { title: 'Затоплены квартиры', text: 'Больше 4 минут вода из системы отопления заливала квартиры. Ущерб жильцам, отключение подъезда, разбирательство. При прорыве первым делом отсекают дом (или стояк) и сбрасывают давление.', lesson: 'housedrain' };
    if (out.noCircTime > 30) return { title: 'Перегрев ПТО без циркуляции', text: 'Сетевая вода больше 30 секунд шла в теплообменник при стоящей домовой воде. Вода в ПТО вскипала, на пластинах выпала накипь, уплотнения перегреты.', lesson: 'shutdown' };
    if (diag.some(a => a.id === 'strainer_pressure')) return { title: 'Грязевик вскрыт под давлением', text: 'Крышку фильтра сорвало струей горячей воды. На объекте — тяжелые ожоги. Вскрывать можно только отключенный, опорожненный и остывший участок.', lesson: 'strainer' };
    if (st.reliefTime > 20) return { title: 'Длительный сброс через ПК', text: 'Предохранительный клапан больше 20 секунд сбрасывал воду: причина не устранена. Клапан размыт, система теряет воду, верхние этажи завоздушиваются.', lesson: 'relief' };
    if (out.dryTopTime > 60) return { title: 'Оголение системы отопления', text: 'Больше минуты вода не доходила до верхних этажей. Стояки завоздушены, в мороз возможна разморозка радиаторов.', lesson: 'makeup' };
    if (st.hexOverTime > 120) return { title: 'Течь уплотнений ПТО', text: 'Теплообменник больше 2 минут стоял под давлением подачи без циркуляции. Уплотнения пластин дали течь.', lesson: 'hexpressure' };
    return null;
  }

  // ---------------------------------------------------------------------------
  // Состояние движка
  // ---------------------------------------------------------------------------
  let level = null;
  let t0 = 0;               // время модели в начале смены
  let incs = [];            // состояние инцидентов
  let timers = [];          // отложенные действия {at, fn}
  let penalties = {};       // id → {pts, text, count}
  let rateAcc = { t2: 0, room: 0 };
  let st = {};              // таймеры критических режимов
  let prevDiag = new Set();
  let prevControls = null;
  let timeline = [];
  let reports = 0;
  let finished = false;

  const now = () => sim.state.time - t0;
  const fmt = t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

  function loadStore() { try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch (e) { return {}; } }
  function saveStore(d) { try { localStorage.setItem(STORE_KEY, JSON.stringify(d)); } catch (e) { /* без хранилища */ } }
  let store = loadStore();
  const unlocked = lv => lv.n === 1 || ((store['l' + (lv.n - 1)] || {}).stars || 0) >= 1;

  function note(kind, text) { timeline.push({ t: now(), kind, text }); }

  // ---------------------------------------------------------------------------
  // Жизненный цикл
  // ---------------------------------------------------------------------------
  function start(id) {
    const lv = LEVELS.find(l => l.id === id);
    if (!lv || !unlocked(lv)) return;
    if (window.ITPLessons && window.ITPLessons.active()) window.ITPLessons.exit();
    closeMenu();
    level = lv;
    P.resetNominal(sim, { forceBase: true });   // уровни рассчитаны на базовую схему
    lv.setup();
    P.step(sim, 0);
    t0 = sim.state.time;
    incs = lv.incidents.map(d => ({ d, at: d.at, state: d.manual ? 'idle' : 'pending', startT: null, repairT: 0, revealT: null, actT: null, okSince: null, doneT: null, extrasShown: 0 }));
    lastT = 0; timers = []; penalties = {}; rateAcc = { t2: 0, room: 0 }; st = { reliefTime: 0, hexOverTime: 0 };
    prevDiag = new Set(); prevControls = snapControls(); timeline = []; reports = 0; finished = false;
    $('levelToasts').innerHTML = '';
    $('levelMessages').innerHTML = '';
    $('levelPanel').hidden = false;
    $('levelTitle').textContent = `Уровень ${lv.n} · ${lv.title}`;
    $('levelIntro').textContent = lv.intro;
    document.body.classList.add('level-mode');
    app.clearTrend();
    app.setPaused(false);
    app.syncControlsUI();
    app.log(`Смена: уровень ${lv.n} «${lv.title}»`, 'op');
    note('op', 'Смена принята');
    setMode('levels');
    renderHud();
  }

  function exit() {
    level = null;
    $('levelPanel').hidden = true;
    $('levelToasts').innerHTML = '';
    document.body.classList.remove('level-mode');
    setMode('free');
    app.setPaused(false);
  }
  function exitIfActive() { if (level) exit(); }
  function restart() { if (level) start(level.id); }

  // API для сценариев
  const api = {
    schedule(delay, fn) { timers.push({ at: now() + delay, fn }); },
    toast(from, text) { toast(from, text); },
    get dt() { return lastDt; },
    activate(id) { const i = incs.find(x => x.d.id === id); if (i && i.state === 'idle') { i.state = 'pending'; i.at = now(); } }
  };

  // ---------------------------------------------------------------------------
  // Отслеживание действий оператора
  // ---------------------------------------------------------------------------
  const CTL_KEYS = ['V1cmd', 'V2cmd', 'KZRcmd', 'KZR_MANUAL', 'PUMP', 'PUMP2', 'PUMP1_ISO', 'PUMP2_ISO', 'MAKEUP', 'DRAIN',
    'NET_DRAIN', 'NET_VENT', 'V1tag', 'V2tag', 'HOUSE_SUP', 'HOUSE_RET', 'HOUSE_DRAIN', 'HOUSE_VENT'];
  function snapControls() { const s = {}; CTL_KEYS.forEach(k => { s[k] = sim.controls[k]; }); s.clean = sim.controls.strainerFouling; return s; }
  function describe(k, v) {
    const map = {
      V1cmd: v === 'open' ? 'V1: открыть' : 'V1: закрыть', V2cmd: v === 'open' ? 'V2: открыть' : 'V2: закрыть',
      KZRcmd: `КЗР → ${Math.round(v)} %`, KZR_MANUAL: v ? 'КЗР: ручной режим' : 'КЗР: автомат',
      PUMP: v ? 'Н1: пуск' : 'Н1: стоп', PUMP2: v ? 'Н2: пуск' : 'Н2: стоп',
      PUMP1_ISO: v ? 'Краны Н1: открыть' : 'Краны Н1: закрыть', PUMP2_ISO: v ? 'Краны Н2: открыть' : 'Краны Н2: закрыть',
      HOUSE_SUP: v ? 'Кд1: открыть' : 'Кд1: закрыть', HOUSE_RET: v ? 'Кд2: открыть' : 'Кд2: закрыть',
      HOUSE_DRAIN: v ? 'Спуск стояков: открыть' : 'Спуск стояков: закрыть', HOUSE_VENT: v ? 'Воздушники 9 эт.: открыть' : 'Воздушники 9 эт.: закрыть',
      MAKEUP: `Подпитка → ${Math.round(v)} %`,
      DRAIN: v ? 'Дренаж дома: открыть' : 'Дренаж дома: закрыть', NET_DRAIN: v ? 'Дренаж сети: открыть' : 'Дренаж сети: закрыть',
      NET_VENT: v ? 'Воздушник: открыть' : 'Воздушник: закрыть', V1tag: v ? 'Плакат на V1' : 'Плакат с V1 снят', V2tag: v ? 'Плакат на V2' : 'Плакат с V2 снят'
    };
    return map[k] || k;
  }
  function trackActions() {
    const cur = snapControls();
    let acted = false;
    CTL_KEYS.forEach(k => {
      if (cur[k] !== prevControls[k]) {
        // Остановка насоса защитой — не действие оператора
        if ((k === 'PUMP' || k === 'PUMP2') && !cur[k] && sim.state.pumpTripped) return;
        acted = true;
        const last = timeline[timeline.length - 1];
        const txt = describe(k, cur[k]);
        if (last && last.kind === 'act' && last.key === k && now() - last.t < 3) { last.text = txt; last.t = now(); }
        else timeline.push({ t: now(), kind: 'act', key: k, text: txt });
      }
    });
    if (cur.clean < prevControls.clean - 1) { acted = true; note('act', 'Грязевик промыт'); }
    if (acted) incs.forEach(i => { if (i.state === 'active' && i.actT === null && i.revealT !== null) i.actT = now(); });
    prevControls = cur;
  }

  // ---------------------------------------------------------------------------
  // Главный тик
  // ---------------------------------------------------------------------------
  let lastT = 0;
  let lastDt = 0;
  function tick() {
    if (!level || finished) return;
    const t = now();
    const dt = Math.max(0, t - lastT);
    lastT = t;
    lastDt = dt;
    trackActions();

    // отложенные действия
    timers = timers.filter(tm => { if (t >= tm.at) { tm.fn(); return false; } return true; });

    // инциденты
    incs.forEach(i => {
      const d = i.d;
      if (i.state === 'pending' && t >= i.at) {
        i.state = 'active'; i.startT = t;
        if (d.start) d.start(sim);
        note('inc', `Началось: ${d.title}`);
      }
      if (i.state !== 'active' && i.state !== 'done') return;
      const ti = t - i.startT;
      if (d.update) d.update(sim, ti, i, api);
      if (i.state === 'done') return;
      if (i.revealT === null && (d.silent || !d.reveal || d.reveal(ti))) {
        i.revealT = d.silent ? i.startT : t;
        if (d.message) { toast(d.message.from, d.message.text); note('msg', `${d.message.from}: ${d.message.text}`); }
      }
      (d.extra || []).forEach((x, k) => {
        if (k >= i.extrasShown && ti >= x.at) { i.extrasShown = k + 1; toast(x.from, x.text); note('msg', `${x.from}: ${x.text}`); }
      });
      if (i.revealT === null) return;
      const ok = ti >= (d.minTime || 0) && d.resolved() && (!d.needsReport || i.reported);
      if (ok) {
        if (i.okSince === null) i.okSince = t;
        if (t - i.okSince >= d.hold) {
          i.state = 'done'; i.doneT = i.okSince; note('ok', `Решено: ${d.title}`); app.log(`Решено: ${d.title}`, 'ok');
          if (d.onDone) d.onDone(sim, api);
        }
      } else i.okSince = null;
      if (i.state === 'active' && t - i.revealT > d.deadline) { i.state = 'failed'; note('err', `Не решено в срок: ${d.title}`); app.log(`Не решено в срок: ${d.title}`, 'alarm'); }
    });

    // ошибки и штрафы
    const diag = P.diagnose(sim);
    const ids = new Set(diag.map(a => a.id));
    Object.keys(SOFT).forEach(id => {
      if (id === 'false_report') return;
      const after = SOFT[id].after || 0;
      if (after) {
        // штраф только если состояние держится дольше after секунд (один раз за эпизод)
        st.sustain = st.sustain || {};
        if (ids.has(id)) {
          st.sustain[id] = (st.sustain[id] || 0) + dt;
          if (st.sustain[id] >= after && !st.sustain[id + '_hit'] && !excused(id)) { st.sustain[id + '_hit'] = true; addPenalty(id); }
        } else { st.sustain[id] = 0; st.sustain[id + '_hit'] = false; }
      } else if (ids.has(id) && !prevDiag.has(id) && !excused(id)) addPenalty(id);
    });
    prevDiag = ids;
    // Пока сеть недодает температуру, дом прогреть нельзя — за холод и обратку не штрафуем
    const netShort = sim.env.T1 !== null && sim.env.T1 < P.graphT1(sim.env.T_out) - 5;
    if (ids.has('t2_high') && !netShort) rateAcc.t2 += dt;
    // Холод в квартирах штрафуем, только когда и сам ИТП не держит график (здание инерционно, догоняет само)
    if (ids.has('room') && ids.has('t11_range') && !netShort) rateAcc.room += dt;
    if (ids.has('flood')) rateAcc.flood = (rateAcc.flood || 0) + dt;
    st.reliefTime = o().reliefOpen ? st.reliefTime + dt : 0;
    st.hexOverTime = ids.has('hex_overpressure') ? st.hexOverTime + dt : 0;

    const crit = criticalCheck(diag, st);
    if (crit) { fail(crit); return; }

    // изменения, сделанные сценарием в этом тике, — не действия оператора
    prevControls = snapControls();
    renderHud();
    // конец смены: все инциденты закрыты
    if (incs.every(i => i.state === 'done' || i.state === 'failed' || i.state === 'idle' || (i.d.optional && i.revealT === null)) && timers.length === 0) {
      if (!st.endAt) st.endAt = t + 20;
      if (t >= st.endAt) finish();
    } else st.endAt = null;
  }

  // Ошибки, которые «подстроил» сам сценарий, не штрафуются (например, оставленная сменщиком подпитка до первого действия)
  function excused(id) {
    if (id === 'relief') return incs.some(i => i.d.id === 'makeupLeft' && i.state === 'active' && i.actT === null);
    if (id === 'cavitation' || id === 'no_circulation') return sim.state.pumpTripped && !sim.controls.PUMP;
    return false;
  }

  function addPenalty(id) {
    const p = penalties[id] || (penalties[id] = { pts: SOFT[id].pts, text: SOFT[id].text, count: 0 });
    p.count += 1;
    note('err', `Ошибка: ${SOFT[id].text} (−${SOFT[id].pts})`);
    app.log(`Штраф: ${SOFT[id].text}`, 'warn');
  }

  function report() {
    if (!level || finished) return;
    reports += 1;
    const target = incs.find(i => i.d.needsReport && i.state === 'active' && !i.reported && i.revealT !== null);
    note('act', 'Сообщение диспетчеру теплосети');
    if (target) {
      target.reported = true;
      if (target.actT === null) target.actT = now();
      toast('Диспетчер теплосети', 'Принято. Разбираемся с режимом сети, восстановим в течение нескольких минут.');
      if (target.d.onReport) target.d.onReport(sim, api);
    } else {
      addPenalty('false_report');
      toast('Диспетчер теплосети', 'С нашей стороны параметры в норме. Проверьте оборудование ИТП.');
    }
  }

  // ---------------------------------------------------------------------------
  // Оценка
  // ---------------------------------------------------------------------------
  function incidentScore(i) {
    if (i.state !== 'done') return { total: 0, speed: 0, took: null };
    const took = Math.max(0, i.doneT - i.revealT);
    const n = i.d.norm;
    const speed = took <= n ? 40 : Math.max(0, 40 * (3 * n - took) / (2 * n));
    return { total: Math.round(60 + speed), speed: Math.round(speed), took };
  }

  function computeResult() {
    const rows = incs.filter(i => i.state !== 'idle' && !(i.d.optional && i.revealT === null)).map(i => ({ i, s: incidentScore(i) }));
    const avg = rows.length ? rows.reduce((a, r) => a + r.s.total, 0) / rows.length : 0;
    const pen = [];
    Object.values(penalties).forEach(p => pen.push({ text: `${p.text} × ${p.count}`, pts: p.pts * p.count }));
    const t2 = Math.min(RATE.t2.cap, Math.floor(rateAcc.t2 / RATE.t2.per));
    const room = Math.min(RATE.room.cap, Math.floor(rateAcc.room / RATE.room.per));
    if (t2) pen.push({ text: RATE.t2.text, pts: t2 });
    if (room) pen.push({ text: RATE.room.text, pts: room });
    const flood = Math.min(RATE.flood.cap, Math.floor((rateAcc.flood || 0) / RATE.flood.per));
    if (flood) pen.push({ text: RATE.flood.text, pts: flood });
    const totalPen = pen.reduce((a, p) => a + p.pts, 0);
    const score = Math.max(0, Math.min(100, Math.round(avg - totalPen)));
    const stars = score >= 90 ? 3 : score >= 75 ? 2 : score >= 60 ? 1 : 0;
    return { rows, pen, score, stars, avg: Math.round(avg) };
  }

  function finish() {
    finished = true;
    app.setPaused(true);
    const r = computeResult();
    const prev = store[level.id] || {};
    if (!prev.best || r.score > prev.best) store[level.id] = { best: r.score, stars: Math.max(r.stars, prev.stars || 0) };
    else store[level.id] = { best: prev.best, stars: Math.max(r.stars, prev.stars || 0) };
    saveStore(store);
    app.log(`Смена окончена: ${r.score} баллов`, r.stars ? 'ok' : 'warn');
    showResult(r, null);
  }

  function fail(crit) {
    finished = true;
    app.setPaused(true);
    note('err', `АВАРИЯ: ${crit.title}`);
    app.log(`Смена провалена: ${crit.title}`, 'alarm');
    showResult(computeResult(), crit);
  }

  // ---------------------------------------------------------------------------
  // Интерфейс
  // ---------------------------------------------------------------------------
  function toast(from, text) {
    const box = document.createElement('div');
    box.className = 'level-toast rounded-md p-3';
    box.innerHTML = `<div class="flex items-center gap-2"><span style="color:#B45309">${I.svg('mail', 15)}</span>
      <span class="text-xs font-semibold" style="color:#92400E">${from}</span><span class="text-[11px] mono faint">${fmt(now())}</span>
      <button class="btn btn-sm ml-auto" aria-label="Принято">Принято</button></div>
      <div class="text-sm mt-1.5 leading-5" style="color:var(--ink)">${text}</div>`;
    box.querySelector('button').addEventListener('click', () => box.remove());
    $('levelToasts').prepend(box);
    const item = document.createElement('li');
    item.innerHTML = `<span class="mono faint">${fmt(now())}</span> <span class="font-semibold" style="color:#92400E">${from}:</span> <span class="muted">${text}</span>`;
    $('levelMessages').prepend(item);
    app.log(`Сообщение — ${from}: ${text}`, 'warn');
  }

  function renderHud() {
    if (!level) return;
    const t = now();
    $('levelClock').textContent = fmt(t);
    const open = incs.filter(i => i.state === 'active' && i.revealT !== null).length;
    const done = incs.filter(i => i.state === 'done').length;
    const failed = incs.filter(i => i.state === 'failed').length;
    $('levelStatus').textContent = `Решено: ${done} · не решено в срок: ${failed} · сообщений в работе: ${open}`;
  }

  function showResult(r, crit) {
    const lessonsList = (window.ITPLessons && window.ITPLessons.list) || [];
    const lessonTitle = id => (lessonsList.find(l => l.id === id) || {}).title || id;
    const rows = r.rows.map(({ i, s }) => {
      const state = i.state === 'done' ? `<span class="t-ok font-semibold">решено</span>` : i.state === 'failed' ? `<span class="t-bad font-semibold">не в срок</span>` : i.revealT === null ? '<span class="faint">не началось</span>' : '<span class="t-warn font-semibold">не решено</span>';
      return `<tr><td>${i.d.title}</td><td class="mono">${i.revealT === null ? '—' : fmt(i.revealT)}</td>
        <td class="mono">${i.actT === null ? '—' : '+' + Math.round(i.actT - i.revealT) + ' с'}</td>
        <td class="mono">${s.took === null ? '—' : Math.round(s.took) + ' с'}</td><td class="mono">${i.d.norm} с</td>
        <td>${state}</td><td class="mono text-right font-semibold">${s.total}</td></tr>`;
    }).join('');
    const pens = r.pen.length ? `<ul class="list-disc pl-5 text-sm t-warn">${r.pen.map(p => `<li>${p.text}: <span class="mono font-semibold">−${p.pts}</span></li>`).join('')}</ul>` : '<p class="text-sm t-ok">Штрафов нет.</p>';
    const tl = timeline.slice(-30).map(e => {
      const col = { act: 'log-op', msg: 'log-warn', err: 'log-alarm', ok: 'log-ok', inc: 'log-def', op: 'log-def' }[e.kind] || 'log-def';
      return `<div class="${col}"><span class="faint">${fmt(e.t)}</span> ${e.text}</div>`;
    }).join('');
    const failedInc = incs.filter(i => i.state === 'failed' || (crit && i.state === 'active'));
    const fixes = failedInc.length ? `<h3 class="panel-title mt-4 mb-1">Как нужно было действовать</h3>
      <ul class="text-sm muted space-y-1.5">${failedInc.map(i => `<li><b style="color:var(--ink)">${i.d.title}:</b> ${i.d.fix}
      <button class="btn-link text-xs ml-1" data-go-lesson="${i.d.lesson}">урок «${lessonTitle(i.d.lesson)}»</button></li>`).join('')}</ul>` : '';
    const stars = I.stars(r.stars, 18);
    const box = (icon, css) => `<div class="w-10 h-10 rounded-md flex items-center justify-center flex-none" style="${css}">${I.svg(icon, 22)}</div>`;
    const head = crit
      ? `${box('alarm', 'background:#FEF2F2;color:#DC2626;border:1px solid #FECACA')}<div><div class="panel-title">Смена провалена — критическая авария</div><h2 class="text-lg font-semibold t-bad mt-1">${crit.title}</h2></div>`
      : `${r.stars ? box('flag', 'background:#F0FDF4;color:#16A34A;border:1px solid #BBF7D0') : box('alert', 'background:#FFFBEB;color:#D97706;border:1px solid #FDE68A')}<div><div class="panel-title">Разбор смены · уровень ${level.n}</div>
         <h2 class="text-lg font-semibold mt-1 flex items-center gap-3 ${r.stars ? 't-ok' : 't-warn'}"><span class="mono">${r.score}</span> баллов ${stars}</h2>
         <div class="text-xs faint">${r.stars ? 'Уровень пройден' : 'Нужно 60 баллов, чтобы пройти уровень'} · среднее по инцидентам ${r.avg}, штрафы −${r.pen.reduce((a, p) => a + p.pts, 0)}</div></div>`;
    $('levelModalBody').innerHTML = `
      <div class="flex items-start gap-3">${head}</div>
      ${crit ? `<p class="mt-3 text-sm leading-6" style="color:var(--ink)">${crit.text}</p>
        <p class="mt-2 text-sm"><button class="btn-link" data-go-lesson="${crit.lesson}">Повторить урок «${lessonTitle(crit.lesson)}»</button></p>` : ''}
      <h3 class="panel-title mt-4 mb-1">Инциденты</h3>
      <div class="overflow-x-auto"><table class="w-full text-xs result-table">
        <tr><th>Проблема</th><th>Узнали</th><th>Реакция</th><th>Решили за</th><th>Норматив</th><th>Итог</th><th class="text-right">Баллы</th></tr>${rows}</table></div>
      <h3 class="panel-title mt-4 mb-1">Штрафы</h3>${pens}
      ${fixes}
      <h3 class="panel-title mt-4 mb-1">Хронология</h3>
      <div class="mono text-[11px] leading-5 max-h-48 overflow-y-auto scroll-box px-2 py-1">${tl}</div>
      <div class="mt-4 flex flex-wrap gap-2">
        <button class="btn btn-primary" data-act="restart">${I.svg('reset', 14)}Переиграть уровень</button>
        ${!crit && r.stars && LEVELS.find(l => l.n === level.n + 1) ? `<button class="btn btn-open" data-act="next">Следующий уровень${I.svg('arrowRight', 14)}</button>` : ''}
        <button class="btn" data-act="menu">К списку уровней</button>
        <button class="btn" data-act="exit">Свободный режим</button>
      </div>`;
    const m = $('levelModal');
    m.hidden = false;
    m.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
      m.hidden = true;
      const a = b.dataset.act;
      const lv = level;
      if (a === 'restart') start(lv.id);
      else if (a === 'next') start(LEVELS.find(l => l.n === lv.n + 1).id);
      else if (a === 'menu') { exit(); openMenu(); }
      else exit();
    }));
    m.querySelectorAll('[data-go-lesson]').forEach(b => b.addEventListener('click', () => {
      m.hidden = true; exit();
      if (window.ITPLessons) window.ITPLessons.start(b.dataset.goLesson);
    }));
  }

  // Меню уровней
  function renderMenu() {
    store = loadStore();
    const cards = LEVELS.map(lv => {
      const rec = store[lv.id] || {};
      const open = unlocked(lv);
      const stars = I.stars(rec.stars || 0, 15);
      return `<button ${open ? `data-level="${lv.id}"` : 'disabled'} class="card text-left p-3 ${open ? 'hover:border-slate-400' : 'opacity-60 cursor-not-allowed'}" style="${open ? '' : 'background:#F8FAFC'}">
        <div class="flex items-center gap-2">
          <span class="mono text-[11px] faint">${String(lv.n).padStart(2, '0')}</span>
          <span class="font-semibold text-sm" style="color:var(--ink)">${lv.title}</span>
          <span class="ml-auto">${stars}</span>
        </div>
        <div class="text-[11px] faint mt-1">${lv.difficulty} · ${lv.incidents.filter(i => !i.manual).length} проблем${rec.best ? ` · лучший результат <span class="mono">${rec.best}</span>` : ''}</div>
        <div class="text-xs muted mt-1 leading-5">${open ? lv.intro : `<span class="inline-flex items-center gap-1.5">${I.svg('lock', 13)}Пройдите предыдущий уровень хотя бы на одну звезду.</span>`}</div>
      </button>`;
    }).join('');
    const soon = SOON.map(l => `<div class="p-3 rounded-md border border-dashed" style="border-color:var(--line);background:#F8FAFC">
      <div class="flex items-center gap-2"><span class="mono text-[11px] faint">${String(l.n).padStart(2, '0')}</span><span class="font-semibold text-sm muted">${l.title}</span>
      <span class="ml-auto text-[10px] faint border rounded px-1.5 py-0.5 uppercase" style="border-color:var(--line)">в разработке</span></div>
      <div class="text-[11px] faint mt-1">${l.difficulty}</div><div class="text-xs faint mt-1">${l.short}</div></div>`).join('');
    $('levelList').innerHTML = cards + soon;
    document.querySelectorAll('[data-level]').forEach(b => b.addEventListener('click', () => start(b.dataset.level)));
  }
  function openMenu() { renderMenu(); $('levelMenu').hidden = false; }
  function closeMenu() { $('levelMenu').hidden = true; }

  function setMode(mode) {
    document.querySelectorAll('[data-mode]').forEach(b => {
      const on = b.dataset.mode === mode;
      b.classList.toggle('is-active', on);
    });
  }

  $('levelReport').addEventListener('click', report);
  $('levelRestart').addEventListener('click', restart);
  $('levelExit').addEventListener('click', exit);
  $('levelMenuClose').addEventListener('click', closeMenu);
  $('levelMenu').addEventListener('click', e => { if (e.target.id === 'levelMenu') closeMenu(); });
  document.querySelector('[data-mode="levels"]').addEventListener('click', () => { if (!level) openMenu(); });
  document.querySelector('[data-mode="free"]').addEventListener('click', exitIfActive);
  document.querySelector('[data-mode="lesson"]').addEventListener('click', exitIfActive);

  window.ITPLevels = {
    tick, report, restart, exitIfActive,
    active: () => !!level && !finished,
    inLevel: () => !!level,
    list: LEVELS,
    _debug: () => ({ incs, penalties, rateAcc, st, timeline, t: now() })
  };
})();
