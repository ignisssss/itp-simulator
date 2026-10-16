/*
 * lessons.js — обучалки: пошаговые сценарии поверх тренажера ИТП.
 *
 * Урок = стартовое состояние + список шагов. Шаг выполняется, когда его check() возвращает true
 * (или держится true hold секунд). Любая новая авария 🔴 или «ошибка урока» останавливает
 * тренажер, объясняет, что произошло бы на объекте, и откатывает к началу текущего шага.
 * Оценок нет — только отметка «пройдено». Эти же описания потом пригодятся для лайв-уровней.
 */
(function () {
  'use strict';

  const P = window.ITPPhysics;
  const C = P.CONST;
  const app = window.ITPApp;
  const sim = app.sim;
  const $ = id => document.getElementById(id);
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const DONE_KEY = 'itp-lessons-done-v1';

  // ---------------------------------------------------------------------------
  // Куда показывать подсветку: кольцо на схеме [x, y, r] и элемент на пульте
  // ---------------------------------------------------------------------------
  const TARGETS = {
    V1: { svg: [130, 90, 24], el: '#gateBtnV1' },
    V2: { svg: [220, 430, 24], el: '#gateBtnV2' },
    KZR: { svg: [330, 78, 28], el: '[data-ctl="KZR"]' },
    strainer: { svg: [215, 95, 28], el: '#cleanBtn' },
    strainerGauge: { svg: [246, 152, 58] },
    netDrain: { svg: [300, 455, 22], el: '#netDrainBtn' },
    netVent: { svg: [410, 70, 20], el: '#netVentBtn' },
    netValves: { svg: [355, 260, 0], el: '#netDrainBtn, #netVentBtn' },
    pump: { svg: [640, 430, 30], el: '#pumpBtn' },
    makeup: { svg: [590, 500, 22], el: '[data-ctl="MAKEUP"]' },
    drain: { svg: [860, 455, 22], el: '#drainBtn' },
    hex: { svg: [490, 260, 70] },
    building: { svg: [905, 260, 90] },
    relief: { svg: [740, 50, 28] },
    P21: { svg: [708, 470, 46] },
    P11: { svg: [576, 470, 46] },
    Ptop: { svg: [758, 212, 66] },
    T11: { svg: [610, 40, 54] },
    T2: { svg: [69, 386, 52] },
    Phex: { svg: [376, 128, 58] },
    netFill: { el: '#netFillBar' }
  };

  // Удобные проверки
  const c = () => sim.controls;
  const o = () => sim.out;
  const closed = k => c()[k] <= 0 && c()[k + 'cmd'] === 'close';
  const opened = k => c()[k] >= 100 && c()[k + 'cmd'] === 'open';
  const minFill = () => Math.min(o().fill[1], o().fill[2], o().fill[3], o().fill[4]);
  const t11ok = () => o().T11 >= C.T11_MIN && o().T11 <= C.T11_MAX;

  function setGate(k, open) {
    sim.controls[k + 'cmd'] = open ? 'open' : 'close';
    sim.controls[k] = open ? 100 : 0;
  }

  // ---------------------------------------------------------------------------
  // Уроки
  // ---------------------------------------------------------------------------
  const LESSONS = [
    {
      id: 'tour',
      title: 'Знакомство с ИТП',
      short: 'Из чего состоит тепловой пункт и зачем нужен каждый узел.',
      intro: 'Пройдите по схеме вслед за теплоносителем: от ввода теплосети через теплообменник в дом и обратно. Нажимайте на подсвеченный узел и читайте карточку.',
      setup() { P.resetNominal(sim); },
      steps: [
        { text: 'Нажмите на задвижку V1 на вводе теплосети.', why: 'С вводных задвижек начинается любой ИТП: ими его отключают от сети.', target: 'V1', check: ctx => ctx.seen.has('valves') },
        { text: 'Нажмите на грязевик «Гр».', why: 'Фильтр стоит первым после задвижки, чтобы грязь не попала в КЗР и ПТО.', target: 'strainer', check: ctx => ctx.seen.has('strainer') },
        { text: 'Нажмите на регулирующий клапан КЗР.', why: 'Это главный орган регулирования мощности.', target: 'KZR', check: ctx => ctx.seen.has('kzr') },
        { text: 'Нажмите на теплообменник ПТО.', why: 'Здесь тепло переходит из сети в дом без смешения воды.', target: 'hex', check: ctx => ctx.seen.has('hex') },
        { text: 'Нажмите на циркуляционный насос.', why: 'Он крутит воду по стоякам дома.', target: 'pump', check: ctx => ctx.seen.has('pump') },
        { text: 'Нажмите на кран подпитки.', why: 'Подпитка держит статическое давление в доме.', target: 'makeup', check: ctx => ctx.seen.has('makeup') },
        { text: 'Нажмите на предохранительный клапан ПК.', why: 'Защита дома от превышения давления.', target: 'relief', check: ctx => ctx.seen.has('relief') },
        { text: 'Нажмите на дренаж сети (или воздушник).', why: 'Без них участок между задвижками не обслужить.', target: 'netDrain', check: ctx => ctx.seen.has('netdrain') },
        { text: 'Нажмите на здание.', why: 'Потребитель тепла и давления в контуре дома.', target: 'building', check: ctx => ctx.seen.has('building') }
      ],
      outro: [
        'Сетевая вода: V1 → грязевик → КЗР → ПТО → V2, обратно в теплосеть.',
        'Домовая вода: ПТО → стояки и радиаторы → насос → снова ПТО.',
        'Мощность регулирует КЗР, задвижки — только «открыто/закрыто».',
        'Давление в доме держит подпитка, насос дает только перепад.'
      ]
    },

    {
      id: 'shutdown',
      title: 'Вывод ИТП в ремонт и пуск',
      short: 'Правильный порядок отключения и включения задвижек и насоса.',
      intro: 'Нужно отключить ИТП от теплосети (например, по заявке теплоснабжающей организации), а затем снова запустить. Главное правило: отключение — сначала подача, потом обратка; включение — наоборот.',
      setup() { P.resetNominal(sim); },
      steps: [
        { text: 'Закройте задвижку подачи V1.', why: 'Сначала прекращаем поступление горячей воды под высоким давлением (6.5 бар).', target: 'V1', check: () => closed('V1') },
        { text: 'Закройте задвижку обратки V2.', why: 'Теперь участок отсечен с обеих сторон, и ПТО не попадет под давление подачи.', target: 'V2', check: () => closed('V2') },
        { text: 'Выключите циркуляционный насос.', why: 'Тепло больше не поступает, гонять воду незачем.', target: 'pump', check: () => !c().PUMP },
        { text: 'Посмотрите на манометр «P пто»: участок отсечен, но давление в нем осталось. Нажмите «Далее».', why: 'Закрытые задвижки не сбрасывают давление — для ремонта его стравливают дренажом (отдельный урок).', target: 'Phex', ack: true },
        { text: 'Пуск. Сначала включите насос отопления.', why: 'Циркуляция в доме должна быть до того, как пойдет сетевая вода, иначе ПТО «запарится».', target: 'pump', check: () => c().PUMP && o().pumpRunning },
        { text: 'Откройте задвижку обратки V2.', why: 'Обратку открывают первой: ПТО соединяется с низким давлением обратки.', target: 'V2', check: () => opened('V2') },
        { text: 'Откройте задвижку подачи V1.', why: 'Пошла сетевая вода — ПТО начинает греть.', target: 'V1', check: () => opened('V1') && o().G1 > 0 },
        { text: 'Дождитесь выхода на режим: T11 в коридоре 70…80 °C (держится 5 с).', why: 'Температура растет плавно — у системы есть тепловая инерция.', target: 'T11', hold: 5, check: () => t11ok() }
      ],
      outro: [
        'Отключение: V1 (подача) → V2 (обратка) → насос.',
        'Пуск: насос → V2 (обратка) → V1 (подача).',
        'Закрыть обратку при открытой подаче — значит опрессовать ПТО давлением 6.5 бар.',
        'Закрытые задвижки не сбрасывают давление на отсеченном участке.'
      ]
    },

    {
      id: 'strainer',
      title: 'Прочистка фильтра (грязевика)',
      short: 'Отключить, слить, промыть сетку, заполнить и запустить.',
      intro: 'Жильцы жалуются на холодные батареи. Манометры до и после грязевика показывают большой перепад — сетка забита окалиной. Нужно промыть фильтр, не устроив аварию и не пролив сетевую воду.',
      setup() {
        P.resetNominal(sim);
        sim.controls.strainerFouling = 80;
        P.settle(sim, 90);
      },
      mistakes: ['net_drain_leak'],
      steps: [
        { text: 'Оцените перепад на грязевике: разница «P до» и «P после» больше 0.6 бар. Нажмите «Далее».', why: 'Это главный признак засора. Заодно упал расход G1 и температура T11.', target: 'strainerGauge', ack: true },
        { text: 'Закройте задвижку подачи V1.', why: 'Отключение всегда начинают с подачи.', target: 'V1', check: () => closed('V1') },
        { text: 'Закройте задвижку обратки V2.', why: 'Участок с грязевиком отсечен от теплосети.', target: 'V2', check: () => closed('V2') },
        { text: 'Откройте дренаж сети и воздушник.', why: 'Дренаж сбрасывает давление и сливает воду, воздушник впускает воздух — без него вода уходит очень медленно.', target: 'netValves', check: () => c().NET_DRAIN && c().NET_VENT },
        { text: 'Дождитесь 0 бар на манометрах и полного слива участка.', why: 'Вскрывать фильтр можно только без давления и без воды: внутри вода до 95 °C.', target: 'netFill', check: () => o().nodes[2] < 0.1 && o().fill[2] < 0.1 },
        { text: 'Нажмите «Вскрыть и промыть».', why: 'Снимаем крышку, вынимаем и промываем сетку.', target: 'strainer', check: () => c().strainerFouling === 0 },
        { text: 'Закройте дренаж сети.', why: 'Иначе при заполнении вода пойдет в канализацию.', target: 'netDrain', check: () => !c().NET_DRAIN },
        { text: 'Откройте обратку V2 и дождитесь заполнения участка (воздушник открыт).', why: 'Заполняют со стороны обратки — меньшим давлением; воздух выходит через воздушник.', target: 'V2', check: () => opened('V2') && minFill() >= 0.999 },
        { text: 'Закройте воздушник — из него пошла вода.', why: 'Воздух вышел, участок заполнен.', target: 'netVent', check: () => !c().NET_VENT },
        { text: 'Откройте подачу V1.', why: 'Пуск после ремонта: обратка уже открыта, теперь подача.', target: 'V1', check: () => opened('V1') && o().G1 > 0 },
        { text: 'Убедитесь, что перепад на грязевике в норме и T11 вернулась в коридор (держится 5 с).', why: 'Расход восстановился — ПТО снова получает нужное тепло.', target: 'T11', hold: 5, check: () => o().dP_strainer < 0.2 && t11ok() }
      ],
      outro: [
        'Засор видно по перепаду на манометрах до и после фильтра (> 0.6 бар).',
        'Отключение: V1 → V2. Слив: дренаж + воздушник, ждать 0 бар.',
        'Вскрывать только пустой фильтр без давления.',
        'Заполнение: дренаж закрыт, воздушник открыт, V2 → закрыть воздушник → V1.'
      ]
    },

    {
      id: 'regulation',
      title: 'Регулирование температуры КЗР',
      short: 'Вывести дом на 75 °C и не получить штраф за обратку.',
      intro: 'Клапан КЗР открыт слишком мало — в доме недотоп. Ваша задача — подобрать открытие клапана. Меняйте КЗР понемногу (кнопки ±1) и ждите: температура откликается с задержкой.',
      setup() {
        P.resetNominal(sim);
        sim.controls.KZR = 32;
        P.settle(sim, 150);
      },
      steps: [
        { text: 'Посмотрите на T11 — она ниже 70 °C. Нажмите «Далее».', why: 'Мало сетевой воды через ПТО — мало тепла в дом.', target: 'T11', ack: true },
        { text: 'Приоткрывайте КЗР и выведите T11 в 73…77 °C, T2 не выше 55 °C (держится 10 с).', why: 'Рабочая зона клапана здесь около 45…50 %. После каждого изменения ждите 10–20 с.', target: 'KZR', hold: 10, check: () => o().T11 >= 73 && o().T11 <= 77 && o().T2 <= C.T2_MAX },
        { text: 'Теперь кто-то открыл КЗР на 70 %. Посмотрите на T2 — штраф от теплосети. Нажмите «Далее».', why: 'Лишний расход сетевой воды не успевает остыть в ПТО — обратка уходит горячей.', target: 'T2', ack: true, onEnter() { sim.controls.KZR = 70; P.settle(sim, 60); } },
        { text: 'Прикройте КЗР: T2 ≤ 55 °C и T11 в 70…80 °C (держится 10 с).', why: 'Теплосеть штрафует за завышенную обратку: оплачивается лишний расход.', target: 'KZR', hold: 10, check: () => o().T2 <= C.T2_MAX && t11ok() }
      ],
      outro: [
        'Мощность ИТП регулируют расходом сетевой воды через КЗР.',
        'Мало открыт — недотоп; много — перетоп и горячая обратка (штраф).',
        'Меняйте понемногу и ждите: у системы тепловая инерция.'
      ]
    },

    {
      id: 'makeup',
      title: 'Подпитка и завоздушивание',
      short: 'Поднять статическое давление в доме и не перекачать.',
      intro: 'В доме была утечка, давление в контуре упало. Верхние этажи завоздушились — радиаторы холодные. Нужно подпитать систему до штатных 3.5 бар.',
      setup() {
        P.resetNominal(sim);
        sim.state.P21 = 2.2;
        P.settle(sim, 5);
      },
      steps: [
        { text: 'Посмотрите на P21 и давление на 9-м этаже. Нажмите «Далее».', why: 'На 9-м этаже нужен запас ≥ 0.5 бар над столбом воды 27 м (2.65 бар).', target: 'Ptop', ack: true },
        { text: 'Приоткройте кран подпитки на 10…20 %.', why: 'Вода из сетевой обратки через обратный клапан поднимает давление в доме. Маленькое открытие — давление растет медленно и его легко поймать.', target: 'makeup', check: () => c().MAKEUP >= 1 },
        { text: 'Следите за P21: когда он будет 3.3…4.0 бар, закройте подпитку.', why: 'Подпитка идет из обратки 4.5 бар: если не закрыть вовремя, P11 превысит 6 бар и сработает ПК.', target: 'P21', check: () => c().MAKEUP < 0.5 && o().P21 >= 3.3 && o().P21 <= 4.0 },
        { text: 'В реальном доме после подпитки спускают воздух кранами Маевского на верхних этажах. Нажмите «Далее».', why: 'Воздух собирается в самых высоких точках системы.', target: 'building', ack: true }
      ],
      outro: [
        'Статическое давление держит подпитка, а не насос.',
        'Штатно на всасе 3.5 бар: это 27 м дома + запас.',
        'Подпитку открывают ненадолго и следят за манометром — иначе сработает ПК.'
      ]
    },

    {
      id: 'pumpstart',
      title: 'Заполнение и пуск насоса',
      short: 'Почему нельзя включать насос в пустую систему.',
      intro: 'После ремонта в доме контур заполнен лишь частично: давление на всасе около 1 бар. ИТП отключен от сети. Нужно поднять давление и запустить отопление, не сломав насос кавитацией.',
      setup() {
        P.resetNominal(sim);
        setGate('V1', false);
        setGate('V2', false);
        sim.controls.PUMP = false;
        sim.state.P21 = 1.0;
        P.settle(sim, 60);
      },
      steps: [
        { text: 'Не включайте насос! Сначала приоткройте кран подпитки на 10…20 %.', why: 'При P21 < 1.5 бар насос уйдет в кавитацию.', target: 'makeup', check: () => c().MAKEUP >= 1 },
        { text: 'Когда P21 будет 3.3…4.0 бар, закройте подпитку.', why: 'Штатное статическое давление. Перекачали — стравите лишнее дренажом контура.', target: 'P21', check: () => c().MAKEUP < 0.5 && o().P21 >= 3.3 && o().P21 <= 4.0 },
        { text: 'Включите насос.', why: 'Теперь давление на всасе достаточное.', target: 'pump', check: () => o().pumpRunning },
        { text: 'Откройте обратку V2.', why: 'Пуск со стороны обратки.', target: 'V2', check: () => opened('V2') },
        { text: 'Откройте подачу V1.', why: 'Пошло тепло.', target: 'V1', check: () => opened('V1') && o().G1 > 0 },
        { text: 'Дождитесь T11 в коридоре 70…80 °C (держится 5 с).', why: 'Выход на режим.', target: 'T11', hold: 5, check: () => t11ok() }
      ],
      outro: [
        'Насос не создает давление — он только добавляет перепад.',
        'При P21 < 1.5 бар — кавитация: вода вскипает на колесе и разрушает его.',
        'Порядок пуска: подпитка до 3.5 бар → насос → V2 → V1.'
      ]
    },

    {
      id: 'hexpressure',
      title: 'Авария: закрыта обратка',
      short: 'Что делать, если ПТО опрессован давлением подачи.',
      intro: 'Сменщик по ошибке закрыл задвижку обратки V2, а подача V1 осталась открытой. Теплообменник под давлением 6.5 бар — уплотнения могут не выдержать. Устраните аварию и восстановите режим.',
      setup() {
        P.resetNominal(sim);
        setGate('V2', false);
        P.settle(sim, 10);
      },
      steps: [
        { text: 'Срочно закройте подачу V1.', why: 'Источник высокого давления — подача. Отсекаем ее первой.', target: 'V1', check: () => closed('V1') },
        { text: 'Откройте обратку V2.', why: 'Давление в ПТО выравнивается с обраткой (4.5 бар).', target: 'V2', check: () => opened('V2') },
        { text: 'Откройте подачу V1.', why: 'Обычный пуск: обратка уже открыта.', target: 'V1', check: () => opened('V1') && o().G1 > 0 },
        { text: 'Дождитесь T11 в коридоре 70…80 °C (держится 5 с).', why: 'Дом прогревается обратно.', target: 'T11', hold: 5, check: () => t11ok() }
      ],
      outro: [
        'Опрессовка ПТО — когда подача открыта, а обратка закрыта.',
        'Устранение: сначала закрыть подачу, потом открыть обратку.',
        'Не открывайте обратку при открытой подаче на «запертом» ПТО — сначала снимите источник давления.'
      ]
    },

    {
      id: 'relief',
      title: 'Сработал предохранительный клапан',
      short: 'Найти причину, сбросить лишнее давление дренажом.',
      intro: 'Кран подпитки забыли закрыть — давление в доме выросло, ПК сбрасывает воду. Нужно устранить причину и вернуть давление в норму.',
      setup() {
        P.resetNominal(sim);
        sim.controls.MAKEUP = 100;
        P.settle(sim, 20);
      },
      steps: [
        { text: 'Закройте кран подпитки — это причина.', why: 'Подпитка из обратки 4.5 бар + насос 1.8 бар = больше 6 бар.', target: 'makeup', check: () => c().MAKEUP < 0.5 },
        { text: 'Дождитесь, пока ПК закроется (P11 ниже 5.9 бар).', why: 'Клапан сбрасывает излишек и садится сам.', target: 'relief', check: () => !o().reliefOpen },
        { text: 'P21 все еще выше нормы. Откройте дренаж контура дома.', why: 'Лишнюю воду стравливают в дренаж.', target: 'drain', check: () => c().DRAIN },
        { text: 'Когда P21 опустится до 3.3…3.8 бар, закройте дренаж.', why: 'Дренаж быстрый — не упустите: ниже 1.5 бар насос уйдет в кавитацию.', target: 'P21', check: () => !c().DRAIN && o().P21 >= 3.3 && o().P21 <= 3.8 }
      ],
      outro: [
        'Срабатывание ПК — всегда авария, ищите причину (обычно подпитка).',
        'Лишнее давление снимают дренажом, следя за манометром.',
        'Рабочий коридор на всасе — около 3.5 бар.'
      ]
    }
  ];

  // Будущие обучалки (нужно новое оборудование на схеме)
  const SOON = [
    { title: 'Слив контура отопления дома', short: 'Отсечь дом, слить, заполнить снизу вверх со спуском воздуха.' },
    { title: 'Промывка теплообменника', short: 'Накипь в ПТО, отсечение двух сторон, химическая промывка.' },
    { title: 'Замена циркуляционного насоса', short: 'Отсечь насос кранами, снять, поставить новый, пустить.' },
    { title: 'Переход на резервный насос', short: 'Без остановки отопления.' },
    { title: 'Замена манометра', short: 'Трехходовой кран, проверка нуля.' },
    { title: 'Опрессовка системы перед сезоном', short: '1.25 рабочего давления, выдержка 10 мин.' },
    { title: 'Прорыв радиатора в квартире', short: 'Отключить стояк, спустить воду, подпитать после ремонта.' },
    { title: 'Ремонт КЗР через байпас', short: 'Ручное регулирование на время замены клапана.' }
  ];

  // ---------------------------------------------------------------------------
  // Состояние движка
  // ---------------------------------------------------------------------------
  let lesson = null;       // текущий урок
  let stepIdx = 0;
  let snapshot = null;     // состояние на начало шага — для отката
  let allowed = new Set(); // аварии, которые уже были на начало шага
  let holdSince = null;
  let blocked = false;     // открыт модальный экран ошибки/финиша
  const ctx = { seen: new Set() };

  function loadDone() {
    try { return new Set(JSON.parse(localStorage.getItem(DONE_KEY) || '[]')); } catch (e) { return new Set(); }
  }
  function saveDone(set) {
    try { localStorage.setItem(DONE_KEY, JSON.stringify([...set])); } catch (e) { /* без хранилища просто не запоминаем */ }
  }
  let done = loadDone();

  function takeSnapshot() {
    snapshot = JSON.stringify({ controls: sim.controls, state: sim.state });
  }
  function restoreSnapshot() {
    const snap = JSON.parse(snapshot);
    sim.controls = snap.controls;
    sim.state = snap.state;
    P.step(sim, 0);
  }

  function alarmIds() {
    return P.diagnose(sim).filter(a => a.level === 'alarm').map(a => a.id);
  }

  function enterStep(i) {
    stepIdx = i;
    holdSince = null;
    const st = lesson.steps[i];
    if (st && st.onEnter) { st.onEnter(); P.step(sim, 0); }
    takeSnapshot();
    allowed = new Set(alarmIds());
    renderPanel();
    app.syncControlsUI();
    app.render();
  }

  function start(id) {
    lesson = LESSONS.find(l => l.id === id);
    if (!lesson) return;
    closeMenu();
    ctx.seen = new Set();
    lesson.setup();
    P.step(sim, 0);
    app.clearTrend();
    app.log(`Урок: «${lesson.title}»`, 'op');
    $('lessonPanel').hidden = false;
    setMode('lesson');
    app.setPaused(false);
    enterStep(0);
  }

  function exit() {
    lesson = null;
    clearHighlight();
    $('lessonPanel').hidden = true;
    setMode('free');
    app.setPaused(false);
  }

  function restart() { if (lesson) start(lesson.id); }

  function advance() {
    const st = lesson.steps[stepIdx];
    app.log(`✔ ${st.text}`, 'ok');
    if (stepIdx + 1 >= lesson.steps.length) finish();
    else enterStep(stepIdx + 1);
  }

  function finish() {
    done.add(lesson.id);
    saveDone(done);
    clearHighlight();
    stepIdx = lesson.steps.length;
    renderPanel();
    showModal({
      kind: 'ok',
      title: `Урок пройден: «${lesson.title}»`,
      body: `<p class="mb-2">Что запомнить:</p><ul class="list-disc pl-5 space-y-1">${lesson.outro.map(t => `<li>${t}</li>`).join('')}</ul>`,
      buttons: [
        { label: 'К списку уроков', primary: true, action: () => { exit(); openMenu(); } },
        { label: 'Пройти еще раз', action: () => restart() },
        { label: 'Остаться на схеме', action: () => exit() }
      ]
    });
  }

  function mistake(title, text) {
    blocked = true;
    app.setPaused(true);
    app.log(`✖ Ошибка в уроке: ${title}`, 'alarm');
    showModal({
      kind: 'alarm',
      title,
      body: `<p>${text}</p><p class="mt-3 text-slate-400">На тренажере это не страшно. Вернемся к началу шага и попробуем еще раз.</p>`,
      buttons: [{ label: 'Вернуться к шагу', primary: true, action: () => { restoreSnapshot(); app.syncControlsUI(); app.setPaused(false); allowed = new Set(alarmIds()); holdSince = null; app.render(); } }]
    });
  }

  /** Вызывается из главного цикла после шагов модели. */
  function tick() {
    if (!lesson || blocked || stepIdx >= lesson.steps.length) return;
    const diag = P.diagnose(sim);
    const bad = diag.find(a => (a.level === 'alarm' && !allowed.has(a.id)) || (lesson.mistakes || []).includes(a.id));
    if (bad) { mistake(bad.title, bad.text); return; }
    // аварии, которые ушли, больше не «разрешены»
    allowed.forEach(id => { if (!diag.some(a => a.id === id)) allowed.delete(id); });

    const st = lesson.steps[stepIdx];
    if (st.ack) return;
    const ok = st.check(ctx);
    if (st.hold) {
      if (ok) {
        if (holdSince === null) holdSince = sim.state.time;
        if (sim.state.time - holdSince >= st.hold) advance();
      } else holdSince = null;
      renderHold();
    } else if (ok) advance();
  }

  function onInfo(key) {
    if (!lesson) return;
    ctx.seen.add(key);
  }

  // ---------------------------------------------------------------------------
  // Интерфейс
  // ---------------------------------------------------------------------------
  function clearHighlight() {
    $('lessonMarks').innerHTML = '';
    document.querySelectorAll('.lesson-hl').forEach(e => e.classList.remove('lesson-hl'));
  }

  function highlight(key) {
    clearHighlight();
    const t = TARGETS[key];
    if (!t) return;
    if (t.svg && t.svg[2] > 0) {
      const ring = document.createElementNS(SVG_NS, 'circle');
      ring.setAttribute('cx', t.svg[0]);
      ring.setAttribute('cy', t.svg[1]);
      ring.setAttribute('r', t.svg[2]);
      ring.setAttribute('class', 'lesson-ring');
      $('lessonMarks').appendChild(ring);
    }
    if (key === 'netValves') {
      [TARGETS.netDrain, TARGETS.netVent].forEach(tt => {
        const r = document.createElementNS(SVG_NS, 'circle');
        r.setAttribute('cx', tt.svg[0]); r.setAttribute('cy', tt.svg[1]); r.setAttribute('r', tt.svg[2]);
        r.setAttribute('class', 'lesson-ring');
        $('lessonMarks').appendChild(r);
      });
    }
    if (t.el) document.querySelectorAll(t.el).forEach(e => e.classList.add('lesson-hl'));
  }

  function renderHold() {
    const el = $('lessonHold');
    const st = lesson && lesson.steps[stepIdx];
    if (!el || !st || !st.hold) return;
    const left = holdSince === null ? st.hold : Math.max(0, st.hold - (sim.state.time - holdSince));
    el.textContent = holdSince === null ? 'Условие пока не выполнено' : `Держится… осталось ${left.toFixed(0)} с`;
  }

  function renderPanel() {
    if (!lesson) return;
    const total = lesson.steps.length;
    const finished = stepIdx >= total;
    const st = lesson.steps[stepIdx];
    $('lessonTitle').textContent = lesson.title;
    $('lessonIntro').textContent = lesson.intro;
    $('lessonProgress').style.width = (Math.min(stepIdx, total) / total * 100).toFixed(0) + '%';
    $('lessonCounter').textContent = finished ? `Все ${total} шагов выполнены` : `Шаг ${stepIdx + 1} из ${total}`;
    $('lessonStep').textContent = finished ? 'Урок пройден ✔' : st.text;
    $('lessonWhy').textContent = finished ? '' : (st.why || '');
    $('lessonAck').hidden = finished || !st.ack;
    $('lessonHold').hidden = finished || !st.hold;
    renderHold();
    $('lessonSteps').innerHTML = lesson.steps.map((s, i) => {
      const cls = i < stepIdx ? 'text-green-400' : i === stepIdx ? 'text-sky-200 font-semibold' : 'text-slate-500';
      const mark = i < stepIdx ? '✔' : i === stepIdx ? '▶' : '○';
      return `<li class="${cls} flex gap-2"><span class="w-4 flex-none">${mark}</span><span>${s.text}</span></li>`;
    }).join('');
    if (!finished) highlight(st.target); else clearHighlight();
  }

  // Модальное окно урока
  function showModal({ kind, title, body, buttons }) {
    const m = $('lessonModal');
    $('lessonModalIcon').textContent = kind === 'alarm' ? '🔴' : '✅';
    $('lessonModalTitle').textContent = title;
    $('lessonModalTitle').className = 'text-lg font-semibold mt-1 ' + (kind === 'alarm' ? 'text-red-300' : 'text-green-300');
    $('lessonModalKind').textContent = kind === 'alarm' ? 'Ошибка — что произошло бы на объекте' : 'Обучалка завершена';
    $('lessonModalBody').innerHTML = body;
    const bx = $('lessonModalButtons');
    bx.innerHTML = '';
    buttons.forEach(b => {
      const btn = document.createElement('button');
      btn.className = 'px-3 py-1.5 rounded text-sm font-semibold border ' +
        (b.primary ? 'bg-sky-700 border-sky-500 text-white hover:bg-sky-600' : 'bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700');
      btn.textContent = b.label;
      btn.addEventListener('click', () => { m.hidden = true; blocked = false; b.action(); });
      bx.appendChild(btn);
    });
    m.hidden = false;
  }

  // Меню уроков
  function renderMenu() {
    const cards = LESSONS.map((l, i) => `
      <button data-lesson="${l.id}" class="lesson-card text-left p-3 rounded border border-slate-700 bg-slate-900 hover:border-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
        <div class="flex items-center gap-2">
          <span class="mono text-[11px] text-slate-500">${String(i + 1).padStart(2, '0')}</span>
          <span class="font-semibold text-slate-100 text-sm">${l.title}</span>
          ${done.has(l.id) ? '<span class="ml-auto text-[11px] text-green-300 border border-green-600/60 rounded px-1.5 py-0.5">✔ пройдено</span>' : ''}
        </div>
        <div class="text-xs text-slate-400 mt-1 leading-5">${l.short}</div>
        <div class="text-[11px] text-slate-500 mt-1 mono">${l.steps.length} шагов</div>
      </button>`).join('');
    const soon = SOON.map(l => `
      <div class="p-3 rounded border border-dashed border-slate-800 opacity-60">
        <div class="flex items-center gap-2"><span class="font-semibold text-slate-300 text-sm">${l.title}</span>
        <span class="ml-auto text-[11px] text-slate-500 border border-slate-700 rounded px-1.5 py-0.5">скоро</span></div>
        <div class="text-xs text-slate-500 mt-1 leading-5">${l.short}</div>
      </div>`).join('');
    $('lessonList').innerHTML = cards;
    $('lessonSoon').innerHTML = soon;
    $('lessonDoneCount').textContent = `Пройдено ${LESSONS.filter(l => done.has(l.id)).length} из ${LESSONS.length}`;
    document.querySelectorAll('[data-lesson]').forEach(b => b.addEventListener('click', () => start(b.dataset.lesson)));
  }

  function openMenu() { renderMenu(); $('lessonMenu').hidden = false; }
  function closeMenu() { $('lessonMenu').hidden = true; }

  function setMode(mode) {
    document.querySelectorAll('[data-mode]').forEach(b => {
      const on = b.dataset.mode === mode;
      b.classList.toggle('bg-sky-800', on);
      b.classList.toggle('border-sky-500', on);
      b.classList.toggle('text-white', on);
    });
  }

  // Кнопки
  $('lessonAck').addEventListener('click', () => { if (lesson && lesson.steps[stepIdx] && lesson.steps[stepIdx].ack) advance(); });
  $('lessonRestart').addEventListener('click', restart);
  $('lessonExit').addEventListener('click', exit);
  $('lessonAll').addEventListener('click', openMenu);
  $('lessonMenuClose').addEventListener('click', closeMenu);
  $('lessonMenu').addEventListener('click', e => { if (e.target.id === 'lessonMenu') closeMenu(); });
  document.querySelector('[data-mode="free"]').addEventListener('click', () => { if (lesson) exit(); setMode('free'); });
  document.querySelector('[data-mode="lesson"]').addEventListener('click', openMenu);
  setMode('free');

  window.ITPLessons = {
    tick, onInfo, restart,
    active: () => !!lesson,
    list: LESSONS
  };
})();
