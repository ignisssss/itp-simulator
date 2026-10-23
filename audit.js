/*
 * audit.js — комплексная диагностика тренажера ИТП.
 *
 *   node audit.js           — физическое ядро (physics.js), PDF-конспекты, сверка уроков с конспектами
 *   index.html?audit        — то же в браузере + интерфейс «кокпит», цели подсветки всех шагов,
 *                             прохождение всех 20 уроков через пульт и бот по всем 6 сменам
 *
 * В браузере отчет печатается в консоль и показывается поверх страницы; результат — window.ITPAudit.last.
 * Скрипт ничего не меняет в рабочих файлах; прогресс уроков и смен в localStorage восстанавливается.
 */
(function (root) {
  'use strict';
  const isNode = typeof window === 'undefined';

  // ---------------------------------------------------------------------------
  // Протокол проверок
  // ---------------------------------------------------------------------------
  function makeReport() {
    const r = { groups: {}, pass: 0, fail: 0 };
    r.check = (group, name, ok, detail) => {
      (r.groups[group] = r.groups[group] || []).push({ name, ok: !!ok, detail: detail === undefined ? '' : String(detail) });
      if (ok) r.pass += 1; else r.fail += 1;
      return !!ok;
    };
    r.note = (group, name, detail) => { (r.groups[group] = r.groups[group] || []).push({ name, ok: null, detail: String(detail) }); };
    return r;
  }
  function printReport(r) {
    const lines = [];
    Object.keys(r.groups).forEach(g => {
      lines.push('');
      lines.push('== ' + g);
      r.groups[g].forEach(it => lines.push(`  ${it.ok === null ? 'i ' : it.ok ? 'OK' : '!!'}  ${it.name}${it.detail ? ' — ' + it.detail : ''}`));
    });
    lines.push('');
    lines.push(`ИТОГО: пройдено ${r.pass}, ошибок ${r.fail}`);
    return lines.join('\n');
  }

  // ---------------------------------------------------------------------------
  // 1. Физическое ядро и теплотехника
  // ---------------------------------------------------------------------------
  function physicsSuite(P, r) {
    const G = 'Физика';
    const C = P.CONST;
    const run = (sim, s, each) => { for (let i = 0; i < Math.round(s * 10); i++) { P.step(sim, 0.1); if (each) each(sim); } };
    const fresh = cfg => { const sim = P.createSimulator(); if (cfg) { P.setConfig(sim, cfg); P.resetNominal(sim); } return sim; };

    // 1.1 Полный сброс в штатное состояние
    {
      const sim = fresh({ makeupType: 'direct', dhwScheme: '2stage' });
      Object.assign(sim.controls, { P21_COCK: 'zero', RELIEF_ISO: false, PRESS_PUMP: true, KZR_ISO: false, KZR_BYPASS: 60, MAKEUP_AUTO: true, MAKEUP_PUMP: true,
        DHW_B1_VALVE: false, DHW_PUMP: false, DHW_KZR_AUTO: false, DHW_DRAW: 5, KZR: 10, KZRcmd: 10, PUMP: false, V1cmd: 'close', V1: 0, dhwCwFoul: 80, strainerFouling: 70 });
      Object.assign(sim.env, { hexScaling: 1, pump1Fail: true, p21Stuck: 3.5, kzrFail: true, burst: 0.1, houseLeak: 0.05, T1: 80, T_out: -25 });
      Object.assign(sim.state, { hexWashed: true, pump1Replaced: true, gaugeReplaced: true, kzrRepaired: true, P21: 1.2 });
      run(sim, 5);
      P.resetNominal(sim, { forceBase: true });
      const ref = P.createSimulator();
      const diffC = Object.keys(ref.controls).filter(k => JSON.stringify(ref.controls[k]) !== JSON.stringify(sim.controls[k]));
      const diffE = Object.keys(P.defaultEnv()).filter(k => JSON.stringify(P.defaultEnv()[k]) !== JSON.stringify(sim.env[k]));
      r.check(G, 'resetNominal: все органы управления в штатном положении', diffC.length === 0, diffC.join(', ') || 'P21_COCK=work, RELIEF_ISO, KZR_ISO, байпас 0, ГВС и подпитка — как при запуске');
      r.check(G, 'resetNominal: все неисправности и возмущения сняты', diffE.length === 0, diffE.join(', ') || 'hexScaling 0, pump1Fail/kzrFail false, p21Stuck null, burst 0');
      const st = sim.state;
      r.check(G, 'resetNominal: флаги ремонтов сброшены', !st.hexWashed && !st.pump1Replaced && !st.gaugeReplaced && !st.kzrRepaired);
      const spec = { P21_COCK: 'work', RELIEF_ISO: true, PRESS_PUMP: false, KZR_ISO: true, KZR_BYPASS: 0, MAKEUP_AUTO: false, MAKEUP_PUMP: false,
        DHW_B1_VALVE: true, DHW_PUMP: true, DHW_KZR_AUTO: true, DHW_DRAW: 1.5 };
      const bad = Object.keys(spec).filter(k => sim.controls[k] !== spec[k]);
      r.check(G, 'resetNominal: значения из ТЗ аудита (базовая схема)', bad.length === 0, bad.join(', '));
      const pumped = fresh({ makeupType: 'pumped' });
      r.check(G, 'resetNominal при насосной подпитке: станция на дежурстве (РД АВТО, кран открыт)', pumped.controls.MAKEUP_AUTO === true && pumped.controls.MAKEUP === 100);
    }

    // 1.2 Узел КЗР и байпас
    {
      const g1 = (ctl) => { const sim = fresh(); Object.assign(sim.controls, ctl); P.settle(sim, 60); P.step(sim, 0); return sim.out.G1; };
      const base = g1({});
      const isoNoByp = g1({ KZR_ISO: false, KZR_BYPASS: 0, KZR: 100, KZRcmd: 100 });
      const isoByp = g1({ KZR_ISO: false, KZR_BYPASS: 48 });
      const both = g1({ KZR: 18, KZRcmd: 18, KZR_BYPASS: 30 });
      r.check(G, 'КЗР отсечен кранами, байпас закрыт: расход 0 даже при штоке 100 %', isoNoByp === 0, `G1 = ${isoNoByp.toFixed(2)} т/ч`);
      r.check(G, 'КЗР отсечен, байпас 48 %: сетевая вода идет через байпас', Math.abs(isoByp - base) < 0.3, `G1 = ${isoByp.toFixed(2)} т/ч (штатно ${base.toFixed(2)})`);
      r.check(G, 'КЗР 18 % + байпас 30 %: ветки параллельны, Kv складываются', both > g1({ KZR: 18, KZRcmd: 18 }) && both > g1({ KZR_ISO: false, KZR_BYPASS: 30 }), `G1 = ${both.toFixed(2)} т/ч`);
      const sim = fresh();
      Object.assign(sim.controls, { KZR_ISO: false, KZR: 0, KZRcmd: 0, KZR_BYPASS: 50, V2cmd: 'close', V2: 0 });
      run(sim, 3);
      r.check(G, 'Шток КЗР закрыт, вода идет через байпас, закрыта V2: авария «опрессовка ПТО подающим давлением»', P.diagnose(sim).some(a => a.id === 'hex_overpressure'));
      const s2 = fresh();
      Object.assign(s2.controls, { KZR_ISO: false, KZR: 0, KZRcmd: 0, KZR_BYPASS: 50, RELIEF_ISO: false });
      run(s2, 3);
      r.check(G, 'Шток КЗР закрыт, тепло идет через байпас, ПК отсечен: авария «заглушен ПК при работающем нагреве»', P.diagnose(s2).some(a => a.id === 'relief_isolated_alarm'));
    }

    // 1.3 NaN / Infinity / физические пределы в экстремальных режимах
    {
      const KEYS = ['T1', 'T2', 'T11', 'T21', 'T3', 'T4', 'T_dhw_mid', 'T2_after_stage1', 'P11', 'P21', 'G1', 'G2', 'G1_dhw', 'Q', 'Q_dhw', 'P_lock1', 'P_lock2', 'P_hex_net'];
      const isT = k => k[0] === 'T';
      const isP = k => k[0] === 'P';
      let bad = [];
      const watch = (label) => sim => {
        if (bad.length > 5) return;
        const o = sim.out;
        KEYS.forEach(k => {
          const v = o[k];
          if (typeof v !== 'number' || !isFinite(v)) bad.push(`${label}: ${k}=${v}`);
          else if (isT(k) && (v < 0 || v > 150)) bad.push(`${label}: ${k}=${v.toFixed(1)}`);
          else if (isP(k) && (v < 0 || v > 15)) bad.push(`${label}: ${k}=${v.toFixed(2)}`);
          else if (k[0] === 'G' && v < 0) bad.push(`${label}: ${k}=${v.toFixed(2)}`);
        });
        Object.keys(sim.state).forEach(k => { const v = sim.state[k]; if (typeof v === 'number' && !isFinite(v)) bad.push(`${label}: state.${k}=${v}`); });
      };
      const cases = [
        ['все закрыто (V1, V2, КЗР, подпитка)', { V1cmd: 'close', V2cmd: 'close', KZRcmd: 0, MAKEUP: 0 }, '2stage'],
        ['насосы выключены при открытом КЗР и ГВС', { PUMP: false, PUMP2: false, KZRcmd: 100 }, '2stage'],
        ['разбор 0, Нц выкл, КЗР ГВС 100 % вручную', { DHW_DRAW: 0, DHW_PUMP: false, DHW_KZR_AUTO: false, DHW_KZRcmd: 100 }, '1stage'],
        ['оба крана дома закрыты при работающем Н1', { HOUSE_SUP: false, HOUSE_RET: false }, '2stage'],
        ['весь водопровод ГВС заперт при открытой сети', { DHW_B1_VALVE: false, DHW_HEX2_WIN: false, DHW_HEX2_WOUT: false, DHW_ST1_WIN: false, DHW_ST1_WOUT: false, DHW_KZR_AUTO: false, DHW_KZRcmd: 100 }, '2stage'],
        ['отсечен ПК, опрессовка при работающих насосах', { RELIEF_ISO: false, PRESS_PUMP: true }, 'none'],
        ['I ступень перекрыта без обводов, дренажи открыты', { DHW_ST1_IN: false, DHW_ST1_OUT: false, NET_DRAIN: true, NET_VENT: true, DRAIN: true }, '2stage']
      ];
      cases.forEach(([label, ctl, scheme]) => {
        const sim = fresh({ dhwScheme: scheme });
        Object.assign(sim.controls, ctl);
        run(sim, 240, watch(label));
      });
      // мгновенное переключение схем ГВС
      const sim = fresh();
      ['1stage', '2stage', 'none', '2stage', '1stage', 'none'].forEach(sc => { P.setConfig(sim, { dhwScheme: sc }); run(sim, 20, watch('переключение схемы → ' + sc)); });
      // случайные комбинации органов управления
      let seed = 12345;
      const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
      const boolKeys = ['PUMP', 'PUMP2', 'PUMP1_ISO', 'PUMP2_ISO', 'HOUSE_SUP', 'HOUSE_RET', 'HOUSE_DRAIN', 'HOUSE_VENT', 'DRAIN', 'NET_DRAIN', 'NET_VENT',
        'DHW_B1_VALVE', 'DHW_PUMP', 'DHW_KZR_AUTO', 'DHW_NET_SUP', 'DHW_NET_RET', 'DHW_ST1_IN', 'DHW_ST1_OUT', 'DHW_ST1_BYP', 'DHW_ST1_WIN', 'DHW_ST1_WOUT',
        'DHW_ST1_WBYP', 'DHW_HEX2_WIN', 'DHW_HEX2_WOUT', 'DHW_CIRC_IN', 'DHW_CIRC_OUT', 'KZR_ISO', 'RELIEF_ISO', 'PRESS_PUMP', 'MAKEUP_AUTO', 'MAKEUP_PUMP'];
      for (let n = 0; n < 60; n++) {
        const s2 = fresh({ dhwScheme: ['none', '1stage', '2stage'][n % 3], makeupType: n % 2 ? 'pumped' : 'direct' });
        boolKeys.forEach(k => { if (rnd() < 0.25) s2.controls[k] = !s2.controls[k]; });
        s2.controls.KZRcmd = Math.round(rnd() * 100); s2.controls.MAKEUP = rnd() < 0.3 ? Math.round(rnd() * 100) : 0;
        s2.controls.KZR_BYPASS = rnd() < 0.3 ? Math.round(rnd() * 100) : 0; s2.controls.DHW_DRAW = Math.round(rnd() * 60) / 10;
        if (rnd() < 0.3) s2.controls.V1cmd = 'close';
        if (rnd() < 0.2) s2.controls.V2cmd = 'close';
        if (rnd() < 0.2) s2.env.hexScaling = rnd();
        if (rnd() < 0.2) s2.env.burst = 0.05;
        run(s2, 60, watch('случайный режим #' + n));
      }
      r.check(G, 'NaN / Infinity / выход за пределы (0…150 °C, 0…15 бар) в 7 экстремальных режимах, переключении схем и 60 случайных', bad.length === 0, bad.slice(0, 4).join('; ') || 'ни на одном тике');
    }

    // 1.4 Второй закон термодинамики в установившихся режимах
    {
      const viol = [];
      const tol = 0.05;
      const scen = [];
      ['none', '1stage', '2stage'].forEach(sc => [0, 1.5, 5].forEach(d => [20, 48, 90].forEach(k => scen.push({ sc, d, k }))));
      scen.forEach(({ sc, d, k }) => {
        const sim = fresh({ dhwScheme: sc });
        sim.controls.DHW_DRAW = d; P.setKZR(sim, k);
        P.settle(sim, 400); P.step(sim, 0);
        const o = sim.out, tag = `${sc} разбор ${d} КЗР ${k}%`;
        if (o.G1 > 0 && o.G2 > 0) {
          if (o.T11 > o.T1 + tol) viol.push(`${tag}: T11 ${o.T11.toFixed(1)} > T1 ${o.T1.toFixed(1)}`);
          if (o.T2_co < o.T21 - tol) viol.push(`${tag}: T2 ${o.T2_co.toFixed(1)} < T21 ${o.T21.toFixed(1)}`);
        }
        if (o.dhwOn) {
          if (o.T3 > o.T1 + tol) viol.push(`${tag}: T3 ${o.T3.toFixed(1)} > T1`);
          if (o.G1_dhw > 0 && o.G_dhw_total > 0 && o.T2_dhw < o.T_dhw_in - tol) viol.push(`${tag}: T2 ГВС ${o.T2_dhw.toFixed(1)} < T вх ${o.T_dhw_in.toFixed(1)}`);
        }
        if (o.dhw2) {
          if (o.T_dhw_mid > o.T2_mix + tol) viol.push(`${tag}: T_меж ${o.T_dhw_mid.toFixed(1)} > T2 греющей ${o.T2_mix.toFixed(1)}`);
          if (o.T2_after_stage1 < C.T_B1 - tol) viol.push(`${tag}: T2 после I ст. ${o.T2_after_stage1.toFixed(1)} < 5 °C`);
          if (o.T2_after_stage1 > o.T2_mix + tol) viol.push(`${tag}: T2 после I ст. выше, чем до`);
        }
      });
      r.check(G, `Второй закон: нет перехлеста температур в ПТО отопления, I и II ступенях (${scen.length} режимов)`, viol.length === 0, viol.slice(0, 3).join('; '));
      r.note(G, 'Греющая среда I ступени', 'в смешанной схеме это общая обратка (отопление + II ступень), поэтому T_меж сравнивается с T2 смеси, а не с T2 системы отопления');
    }

    // 1.5 Гидравлика 2-ступенчатой схемы: I ступень не зажимает отопление
    {
      const res = [1.5, 5].map(d => { const sim = fresh({ dhwScheme: '2stage' }); sim.controls.DHW_DRAW = d; P.settle(sim, 400); P.step(sim, 0); return sim.out; });
      const ok = res.every(o => o.T11 >= 73 && o.T11 <= 76 && !P.diagnose({ controls: {}, out: o, state: { time: 0, serviceAlarmUntil: -1, strainerAlarmUntil: -1 }, env: {} }).some(a => a.id === 't11_range'));
      r.check(G, '2-ступ. ГВС, КЗР 48 %, −10 °C: T11 в 73…76 °C днем и в пик', ok, res.map((o, i) => `${i ? 'пик' : 'день'}: T11 ${o.T11.toFixed(1)} °C, G1 ${o.G1.toFixed(2)} т/ч`).join('; '));
      const base = fresh(); P.settle(base, 300); P.step(base, 0);
      r.note(G, 'Расчетный расход отопления', `${base.out.G1.toFixed(2)} т/ч при Q ${Math.round(base.out.Q)} кВт и T1/T2 95/${base.out.T2.toFixed(0)} °C — по тепловому балансу; I ступень (Kv ${C.DHW_ST1_KV}) снижает его на ${(base.out.G1 - res[0].G1).toFixed(2)} т/ч`);
    }

    // 1.6 Трехходовой кран манометра P21
    {
      const sim = fresh();
      P.settle(sim, 30);
      const p0 = sim.state.P21;
      sim.controls.P21_COCK = 'zero';
      let minP = 99, cav = false;
      run(sim, 30, s => { minP = Math.min(minP, s.state.P21); if (P.diagnose(s).some(a => a.id === 'cavitation' || a.id === 'pump_trip')) cav = true; });
      r.check(G, 'Кран P21 «0»: исправный прибор показывает 0.0 бар', sim.out.P21_disp === 0);
      r.check(G, 'Кран P21 «0»: давление в трубе не меняется, ложной кавитации нет', Math.abs(minP - p0) < 0.05 && !cav && sim.out.pumpRunning, `P21 факт ${minP.toFixed(2)} бар`);
      sim.env.p21Stuck = 3.5; P.step(sim, 0.1);
      r.check(G, 'Кран P21 «0», залипший прибор: показывает застывшие 3.5 бар', sim.out.P21_disp === 3.5);
    }

    // 1.7 Опрессовка: скорость подъема, ПК, испытательное давление
    {
      const prep = iso => {
        const sim = fresh();
        sim.controls.V1cmd = 'close'; sim.controls.V1 = 0; P.step(sim, 0.1);
        sim.controls.V2cmd = 'close'; sim.controls.V2 = 0;
        Object.assign(sim.controls, { PUMP: false, PUMP2: false, MAKEUP: 0, RELIEF_ISO: iso, PRESS_PUMP: true });
        let maxRate = 0, prev = sim.state.P21, maxP = 0, relief = false;
        run(sim, 90, s => { maxRate = Math.max(maxRate, (s.state.P21 - prev) / 0.1); prev = s.state.P21; maxP = Math.max(maxP, s.state.P21); if (s.out.reliefOpen) relief = true; });
        return { maxRate, maxP, relief };
      };
      const a = prep(false), b = prep(true);
      r.check(G, 'Опрессовка с отсеченным ПК: плавный подъем до 6.25 бар', a.maxP >= 6.2 && a.maxP <= 6.26 && a.maxRate <= 0.5 && !a.relief, `макс. ${a.maxP.toFixed(2)} бар, скорость ≤ ${a.maxRate.toFixed(2)} бар/с`);
      r.check(G, 'Опрессовка без отсечения ПК: ПК открывается на 6.0 бар и не дает набрать 6.25', b.relief && b.maxP < 6.1, `макс. ${b.maxP.toFixed(2)} бар`);
    }

    // 1.8 Сервисные операции и защита от вскрытия под давлением
    {
      const sim = fresh();
      let res = P.replacePump1(sim);
      r.check(G, 'Снять Н1 с открытыми кранами — авария «вскрытие под давлением»', !res.ok && P.diagnose(sim).some(a => a.id === 'open_under_pressure'));
      res = P.repairKZR(sim);
      r.check(G, 'Ремонт привода КЗР без отсечения — отказ', !res.ok);
      res = P.replaceGaugeP21(sim);
      r.check(G, 'Замена манометра при кране РАБ — отказ', !res.ok);
      res = P.washHEX(sim);
      r.check(G, 'Промывка ПТО под давлением — отказ', !res.ok);
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Конспекты PDF (Node: файлы на диске)
  // ---------------------------------------------------------------------------
  function notesSuiteNode(r) {
    const G = 'Конспекты';
    const fs = require('fs'), path = require('path');
    const dir = __dirname;
    const notes = require(path.join(dir, 'docs', 'notes-content.js'));
    const lessonsSrc = fs.readFileSync(path.join(dir, 'lessons.js'), 'utf8');
    const body = lessonsSrc.slice(lessonsSrc.indexOf('const LESSONS = ['), lessonsSrc.indexOf('const notesUrl'));
    const ids = [...body.matchAll(/^ {6}id: '([a-z0-9]+)'/gm)].map(m => m[1]);
    r.check(G, 'Уроков в lessons.js', ids.length === 20, ids.length);
    r.check(G, 'Конспектов в notes-content.js', notes.length === ids.length, notes.length);
    const miss = [];
    ids.forEach((id, i) => {
      const n = notes.find(x => x.id === id);
      const f = path.join(dir, 'docs', 'notes', `${String(i + 1).padStart(2, '0')}-${id}.pdf`);
      if (!n || n.n !== i + 1) miss.push(`${id}: номер конспекта ${n ? n.n : '—'} ≠ ${i + 1}`);
      if (!fs.existsSync(f) || fs.statSync(f).size < 20000) miss.push(`нет или пустой ${path.basename(f)}`);
    });
    r.check(G, 'Для каждого урока есть PDF docs/notes/NN-id.pdf с верным номером', miss.length === 0, miss.join('; ') || '01-tour … 20-kzrbypass');
  }

  // ---------------------------------------------------------------------------
  // 2а. Исходники: управляющие символы (например, \b, превратившийся в backspace) и синтаксис
  // ---------------------------------------------------------------------------
  function sourcesSuiteNode(r) {
    const G = 'Исходники';
    const fs = require('fs'), path = require('path');
    const files = ['physics.js', 'app.js', 'lessons.js', 'levels.js', 'audit.js', 'index.html', 'docs/notes-content.js', 'docs/build-notes.js'];
    const bad = [], syntax = [];
    files.forEach(f => {
      const t = fs.readFileSync(path.join(__dirname, f), 'utf8');
      t.split(/\n/).forEach((line, i) => { if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(line)) bad.push(`${f}:${i + 1}`); });
      if (f.endsWith('.js')) { try { new Function(t.replace(/^#!.*/, '')); } catch (e) { syntax.push(`${f}: ${e.message}`); } }
    });
    r.check(G, 'Нет управляющих символов в исходниках', bad.length === 0, bad.join(', '));
    r.check(G, 'Синтаксис всех JS-файлов', syntax.length === 0, syntax.join('; ') || files.filter(f => f.endsWith('.js')).join(', '));
  }

  // ---------------------------------------------------------------------------
  // 3. Браузер: интерфейс, уроки, смены
  // ---------------------------------------------------------------------------
  const sleep = ms => new Promise(res => setTimeout(res, ms));

  async function browserSuites(r) {
    const A = root.ITPApp, P = root.ITPPhysics, L = root.ITPLessons, LV = root.ITPLevels;
    const q = id => document.getElementById(id);
    const S = () => A.sim, o = () => S().out, c = () => S().controls;
    const consoleErrors = [];
    const onErr = e => consoleErrors.push((e.message || e) + '');
    root.addEventListener('error', onErr);
    const origErr = console.error;
    console.error = (...a) => { consoleErrors.push(a.join(' ')); origErr.apply(console, a); };
    const savedLessons = localStorage.getItem('itp-lessons-done-v1');
    const savedLevels = localStorage.getItem('itp-levels-v1');
    const modalTitle = () => q('lessonModal').hidden ? '' : q('lessonModalTitle').textContent;
    const closeModal = () => { if (!q('lessonModal').hidden) document.querySelector('#lessonModalButtons button:last-child').click(); };

    // ----- 3.1 Экран без прокрутки -----
    {
      const G = 'Интерфейс';
      r.check(G, 'Страница без вертикальной прокрутки', document.documentElement.scrollHeight <= innerHeight + 1, `${document.documentElement.scrollHeight} / ${innerHeight}`);
      const ids = new Map();
      document.querySelectorAll('[id]').forEach(e => ids.set(e.id, (ids.get(e.id) || 0) + 1));
      const dup = [...ids].filter(([, n]) => n > 1).map(([k]) => k);
      r.check(G, 'Нет повторяющихся id', dup.length === 0, dup.join(', '));
      // клик по узлу схемы открывает контекстный пульт
      const node = document.querySelector('#scheme [data-info="strainer"]');
      node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      r.check(G, 'Клик по узлу схемы открывает контекстный пульт', !q('inspector').hidden && q('inspTitle').textContent.length > 0, q('inspTitle').textContent);
      const v1 = q('vV1').closest('.node');
      v1.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      r.check(G, 'Клик по задвижке открывает пульт этой задвижки', !q('inspector').hidden && q('valveToggleBtn').offsetParent !== null);
      A.closeInspector();
    }

    // ----- 3.2 Цели подсветки и видимость на каждом шаге -----
    {
      const G = 'Уроки: цели подсветки';
      const T = L._audit.targets;
      const lessons = L.list;
      r.check(G, 'Уроков в списке', lessons.length === 20 && lessons.every(Boolean), lessons.length);
      const badKey = [], badSel = [], badXY = [];
      lessons.forEach(l => l.steps.forEach((st, i) => { if (!st.target || !T[st.target]) badKey.push(`${l.id}#${i + 1}: «${st.target}»`); }));
      Object.entries(T).forEach(([k, t]) => {
        if (t.el && document.querySelectorAll(t.el).length === 0) badSel.push(`${k}: ${t.el}`);
        const rings = !t.svg ? [] : (Array.isArray(t.svg[0]) ? t.svg : [t.svg]);
        rings.forEach(([x, y, rr]) => { if (!(x >= 0 && x <= 1000 && y >= 0 && y <= 920 && rr > 0)) badXY.push(`${k}: [${x}, ${y}, ${rr}]`); });
      });
      r.check(G, 'Каждый step.target есть в TARGETS', badKey.length === 0, badKey.join('; '));
      r.check(G, 'Каждый селектор пульта из TARGETS находит элемент в DOM', badSel.length === 0, badSel.join('; '));
      r.check(G, 'Каждое кольцо на схеме внутри листа', badXY.length === 0, badXY.join('; '));

      const hidden = [], offView = [], notesBad = [];
      const visible = el => {
        if (!el || el.getClientRects().length === 0) return false;
        if (el.closest('[hidden]')) return false;
        const b = el.getBoundingClientRect();
        // элемент в прокручиваемом пульте узла должен попадать в его видимую часть
        const box = el.closest('#inspector');
        const lim = box ? box.getBoundingClientRect() : { top: 0, left: 0, bottom: innerHeight, right: innerWidth };
        return b.width > 0 && b.height > 0 && b.bottom > lim.top && b.top < lim.bottom && b.right > lim.left && b.left < lim.right &&
          b.top < innerHeight && b.left < innerWidth;
      };
      for (const l of lessons) {
        LV.exitIfActive(); closeModal();
        L.start(l.id); A.setPaused(true);
        await sleep(650);   // лист схемы плавно меняет высоту при смене конфигурации урока
        const href = q('lessonNotes').getAttribute('href');
        const n = String(lessons.indexOf(l) + 1).padStart(2, '0');
        if (href !== `docs/notes/${n}-${l.id}.pdf`) notesBad.push(`${l.id}: ${href}`);
        for (let i = 0; i < l.steps.length; i++) {
          L._audit.gotoStep(i);
          await sleep(0);
          const t = T[l.steps[i].target];
          if (t && t.el) {
            const els = [...document.querySelectorAll(t.el)];
            if (!els.some(visible)) hidden.push(`${l.id}#${i + 1} ${t.el}`);
          }
          if (t && t.svg) {
            const rings = Array.isArray(t.svg[0]) ? t.svg : [t.svg];
            const vb = q('scheme').getAttribute('viewBox').split(/\s+/).map(Number);
            if (rings.some(([x, y]) => x < vb[0] || x > vb[0] + vb[2] || y < vb[1] || y > vb[1] + vb[3])) offView.push(`${l.id}#${i + 1}`);
          }
        }
        L.exit();
      }
      r.check(G, 'На каждом шаге всех уроков цель на пульте видна (док или автоматически открытый пульт узла)', hidden.length === 0, hidden.slice(0, 6).join('; '));
      r.check(G, 'На каждом шаге кольцо цели в кадре схемы', offView.length === 0, offView.join('; '));
      r.check(G, 'Кнопка «Конспект PDF» ведет на свой файл', notesBad.length === 0, notesBad.join('; '));
      const pdfMissing = [];
      for (let i = 0; i < lessons.length; i++) {
        const url = `docs/notes/${String(i + 1).padStart(2, '0')}-${lessons[i].id}.pdf`;
        try { const res = await fetch(url, { method: 'HEAD', cache: 'no-store' }); if (!res.ok) pdfMissing.push(url); } catch (e) { pdfMissing.push(url + ' (' + e.message + ')'); }
      }
      if (location.protocol.startsWith('http')) r.check(G, 'Все 20 PDF-конспектов доступны', pdfMissing.length === 0, pdfMissing.join('; '));
      else r.note(G, 'PDF-конспекты', 'страница открыта как файл: доступность PDF проверяет node audit.js');
    }

    // ----- 3.3 Откат шага восстанавливает и внешние условия -----
    {
      const G = 'Уроки: снимок шага';
      L.start('gaugechange'); A.setPaused(true);
      q('p21CockBtn').click();
      for (let i = 0; i < 5; i++) { P.step(S(), 0.1); L.tick(); }
      // шаг 2: заменить манометр, затем «Сбросить шаг» — манометр снова залипший
      q('replaceGaugeBtn').click();
      const replaced = S().env.p21Stuck === null;
      q('lessonStepReset').click();
      r.check(G, '«Сбросить шаг» откатывает env (замена манометра) и config', replaced && S().env.p21Stuck === 3.5, `p21Stuck после отката: ${S().env.p21Stuck}`);
      L.exit();
    }

    // ----- 3.4 Прохождение всех 20 уроков через пульт -----
    {
      const G = 'Уроки: прохождение через пульт';
      document.querySelector('[data-cfg="dhwScheme"][data-val="2stage"]').click();
      document.querySelector('[data-cfg="makeupType"][data-val="pumped"]').click();
      A.setPaused(true);
      const run = (sec, until) => { for (let i = 0; i < sec * 10; i++) { P.step(S(), 0.1); L.tick(); if (!q('lessonModal').hidden) return; if (until && until()) return; } };
      const startL = id => { LV.exitIfActive(); closeModal(); L.start(id); A.setPaused(true); };
      const setR = (k, v) => { const el = document.querySelector(`[data-ctl="${k}"] input`); el.value = v; el.dispatchEvent(new Event('input')); };
      const ack = () => q('lessonAck').click();
      const node = key => document.querySelector(`#scheme [data-info="${key}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const mf = () => Math.min(o().fill[1], o().fill[2], o().fill[3], o().fill[4]);
      const res = {};
      const done = id => { res[id] = modalTitle(); A.closeInspector(); };
      const SOL = {
        tour() { ['valves', 'strainer', 'kzr', 'hex', 'pump', 'makeup', 'relief', 'netdrain', 'house', 'building'].forEach(k => { node(k); run(0.2); }); },
        shutdown() { q('gateBtnV1').click(); run(10); q('gateBtnV2').click(); run(10); q('pumpBtn').click(); run(0.5); ack(); q('pumpBtn').click(); run(0.5); q('gateBtnV2').click(); run(10); q('gateBtnV1').click(); run(120); },
        strainer() { ack(); q('gateBtnV1').click(); run(10); q('gateBtnV2').click(); run(10); q('tagBtnV1').click(); q('tagBtnV2').click(); run(0.3); q('netDrainBtn').click(); q('netVentBtn').click(); run(40, () => o().fill[2] < 0.1 && o().nodes[2] < 0.1); run(1); q('cleanBtn').click(); run(0.3); q('netDrainBtn').click(); run(0.3); q('tagBtnV1').click(); q('tagBtnV2').click(); run(0.3); q('gateBtnV2').click(); run(30); q('netVentBtn').click(); run(0.3); q('gateBtnV1').click(); run(180); },
        regulation() { ack(); setR('KZRcmd', 47); run(120); ack(); setR('KZRcmd', 47); run(120); },
        makeup() { ack(); setR('MAKEUP', 15); run(30, () => o().P21 >= 3.5); setR('MAKEUP', 0); run(0.5); ack(); },
        pumpstart() { q('gateBtnV2').click(); run(10); setR('MAKEUP', 15); run(90, () => o().P21 >= 3.5); setR('MAKEUP', 0); run(0.5); ack(); q('pumpBtn').click(); run(0.5); q('gateBtnV1').click(); run(180); },
        hexpressure() { q('gateBtnV2').click(); run(10); ack(); run(180); },
        relief() { setR('MAKEUP', 0); run(30, () => !o().reliefOpen); run(0.5); q('drainBtn').click(); run(90, () => o().P21 <= 3.6); q('drainBtn').click(); run(0.5); },
        housedrain() { q('gateBtnV1').click(); run(10); q('pumpBtn').click(); run(0.5); q('houseSupBtn').click(); q('houseRetBtn').click(); run(0.5); q('houseDrainBtn').click(); run(60, () => o().P_house < 0.05); q('houseVentBtn').click(); run(200, () => o().houseFill <= 0.001); run(0.5); ack(); q('houseDrainBtn').click(); run(0.3); q('houseRetBtn').click(); run(0.3); setR('MAKEUP', 40); run(200, () => o().houseFill >= 0.999); run(0.3); q('houseVentBtn').click(); run(60, () => o().P21 >= 3.5); setR('MAKEUP', 0); run(0.5); q('houseSupBtn').click(); run(0.3); q('pumpBtn').click(); run(0.5); q('gateBtnV1').click(); run(180); },
        pumpswap() { ack(); q('pump2Btn').click(); run(1); q('pumpBtn').click(); run(0.5); q('iso1Btn').click(); run(125); },
        kzrmanual() { ack(); document.querySelector('.kzr-step[data-step="1"]').click(); run(0.5); q('kzrManualBtn').click(); run(0.3); setR('KZRcmd', 52); run(120); setR('KZRcmd', 43); run(150); ack(); },
        makeuppump() { ack(); setR('MAKEUP', 100); run(4); q('mpPumpBtn').click(); run(30, () => o().P21 >= 3.55); q('mpPumpBtn').click(); run(3); q('mpAutoBtn').click(); run(3); q('drainBtn').click(); run(20, () => o().P21 < 3.15); q('drainBtn').click(); run(40); },
        dhw1stage() { q('dhwB1Btn').click(); run(1); q('dhwPumpBtn').click(); run(1); q('dhwAutoBtn').click(); run(60); document.querySelector('[data-draw="5.5"]').click(); run(90); document.querySelector('[data-draw="0"]').click(); run(150); },
        dhw2stage() { ack(); document.querySelector('[data-draw="5.5"]').click(); run(80); setR('KZRcmd', 27); run(60); setR('KZRcmd', 48); run(60); },
        hexwash() { ack(); q('gateBtnV1').click(); run(10); q('gateBtnV2').click(); run(10); q('tagBtnV1').click(); q('tagBtnV2').click(); q('pumpBtn').click(); run(1); q('houseSupBtn').click(); q('houseRetBtn').click(); run(1); q('netVentBtn').click(); q('netDrainBtn').click(); run(200, () => o().fill[3] < 0.1 && o().nodes[3] < 0.1); run(1); q('hexWashBtn').click(); run(1); q('netDrainBtn').click(); q('tagBtnV1').click(); q('tagBtnV2').click(); run(1); q('houseSupBtn').click(); q('houseRetBtn').click(); run(1); q('pumpBtn').click(); run(2); q('gateBtnV2').click(); run(120, () => mf() >= 0.999 && c().V2 >= 100); q('netVentBtn').click(); run(1); q('gateBtnV1').click(); run(10); setR('KZRcmd', 48); run(400); },
        pumpchange() { q('iso2Btn').click(); q('pump2Btn').click(); run(3); q('pumpBtn').click(); q('iso1Btn').click(); run(2); q('replacePump1Btn').click(); run(1); q('iso1Btn').click(); run(1); q('pumpBtn').click(); run(1); q('pump2Btn').click(); run(10); },
        gaugechange() { q('p21CockBtn').click(); run(1); q('replaceGaugeBtn').click(); run(1); q('p21CockBtn').click(); run(1); setR('MAKEUP', 15); run(60, () => o().P21 >= 3.5); setR('MAKEUP', 0); run(5); },
        hydrotest() { ack(); q('reliefIsoBtn').click(); run(1); q('pressPumpBtn').click(); run(60, () => o().P21 >= 6.15); q('pressPumpBtn').click(); run(8); q('drainBtn').click(); run(30, () => o().P21 <= 3.6); q('drainBtn').click(); run(1); q('reliefIsoBtn').click(); run(5); },
        burst() { q('pumpBtn').click(); setR('KZRcmd', 0); run(15, () => c().KZR <= 1); run(0.5); q('houseSupBtn').click(); q('houseRetBtn').click(); q('houseDrainBtn').click(); q('houseVentBtn').click(); run(150, () => S().env.burst === 0); run(1); q('houseDrainBtn').click(); q('houseRetBtn').click(); q('houseSupBtn').click(); setR('MAKEUP', 100); run(400, () => o().houseFill >= 0.999); run(0.5); q('houseVentBtn').click(); run(60, () => o().P21 >= 3.45); setR('MAKEUP', 0); run(1); q('pumpBtn').click(); setR('KZRcmd', 48); run(20); },
        kzrbypass() { setR('KZR_BYPASS', 30); run(150); q('kzrIsoBtn').click(); setR('KZR_BYPASS', 48); run(150); q('repairKzrBtn').click(); run(1); q('kzrIsoBtn').click(); setR('KZRcmd', 48); setR('KZR_BYPASS', 0); run(200); }
      };
      let passed = 0;
      for (const l of L.list) {
        startL(l.id);
        try { SOL[l.id](); } catch (e) { res[l.id] = 'исключение: ' + e.message; }
        if (res[l.id] === undefined) done(l.id);
        const ok = (res[l.id] || '').startsWith('Урок пройден');
        if (ok) passed += 1;
        r.check(G, `${String(L.list.indexOf(l) + 1).padStart(2, '0')} ${l.title}`, ok, ok ? '' : (res[l.id] || q('lessonCounter').textContent + ' — ' + q('lessonStep').textContent));
      }
      closeModal();
      // ложные ошибки: заведомо неверные действия должны ловиться
      startL('dhw1stage'); q('dhwAutoBtn').click(); run(20);
      r.check(G, 'Урок 13: греющая вода до открытия В1 — ошибка урока', /без холодной воды/.test(modalTitle()), modalTitle());
      startL('pumpchange'); q('replacePump1Btn').click(); run(1);
      r.check(G, 'Урок 16: снять Н1 с открытыми кранами — ошибка урока', /под давлением/.test(modalTitle()), modalTitle());
      closeModal(); L.exit();
      r.note(G, 'Итог', `${passed}/${L.list.length} уроков пройдено`);
      r.summary = r.summary || {}; r.summary.lessons = `${passed}/${L.list.length}`;
    }

    // ----- 3.5 Бот по всем 6 сменам -----
    {
      const G = 'Смены (бот)';
      const sim = A.sim, oo = () => sim.out, cc = () => sim.controls;
      const setR = (k, v) => { const el = document.querySelector(`[data-ctl="${k}"] input`); el.value = Math.round(v); el.dispatchEvent(new Event('input')); };
      const ids = () => new Set(P.diagnose(sim).map(a => a.id));
      function makeBot() {
        let lastK = 0, proc = null, hp = null, reportedP1 = false, reportedPass = false, reportedT1 = false;
        return function (t) {
          const out = oo(), c2 = cc(), d = ids();
          const pumped = sim.config.makeupType === 'pumped';
          const short = sim.env.T1 !== null && sim.env.T1 < P.graphT1(sim.env.T_out) - 5;
          if (pumped) { if (!c2.MAKEUP_AUTO) q('mpAutoBtn').click(); if (c2.MAKEUP < 90) setR('MAKEUP', 100); }
          if (out.dhwOn) { if (!c2.DHW_KZR_AUTO) q('dhwAutoBtn').click(); if (!c2.DHW_PUMP) q('dhwPumpBtn').click(); }
          if (pumped && short && !reportedT1 && sim.env.T1 < 90) { LV.report(); reportedT1 = true; }
          if (d.has('kzr_fault') && !c2.KZR_MANUAL) q('kzrManualBtn').click();
          if (d.has('pump_fault') && !c2.PUMP2) q('pump2Btn').click();
          if (c2.PUMP && sim.env.pump1Fail && c2.PUMP2) q('pumpBtn').click();
          if (!c2.PUMP && sim.env.pump1Fail && c2.PUMP1_ISO) q('iso1Btn').click();
          const pumpKey = sim.env.pump1Fail ? 'pump2Btn' : 'pumpBtn', pumpOn = sim.env.pump1Fail ? c2.PUMP2 : c2.PUMP;
          if (!hp && d.has('flood')) hp = { s: 0 };
          if (hp) {
            const s = hp.s;
            if (s === 0) { q('houseSupBtn').click(); q('houseRetBtn').click(); q('houseDrainBtn').click(); q('houseVentBtn').click(); if (c2.V1cmd === 'open') q('gateBtnV1').click(); if (pumpOn) q(pumpKey).click(); hp.s = 1; }
            else if (s === 1 && sim.env.burst === 0) { q('houseDrainBtn').click(); q('houseRetBtn').click(); setR('MAKEUP', 40); hp.s = 2; }
            else if (s === 2 && out.houseFill >= 0.999) { q('houseVentBtn').click(); hp.s = 3; }
            else if (s === 3 && out.P21 >= 3.5) { setR('MAKEUP', 0); q('houseSupBtn').click(); hp.s = 4; }
            else if (s === 4) { q(pumpKey).click(); q('gateBtnV1').click(); hp.s = 5; }
            else if (s === 5 && c2.V1 >= 100) hp = null;
            return;
          }
          if (!pumped && out.houseFill >= 0.999 && !c2.DRAIN && !c2.HOUSE_DRAIN) {
            if (out.P21 < 3.3 && !(sim.env.houseLeak > 0 && !pumpOn)) setR('MAKEUP', 15);
            if (out.P21 >= 3.6 && c2.MAKEUP > 0) setR('MAKEUP', 0);
            if (out.P21 > 4.0 && c2.MAKEUP === 0) q('drainBtn').click();
          }
          if (c2.DRAIN && out.P21 <= 3.7) q('drainBtn').click();
          if (sim.state.pumpTripped && !c2.PUMP && !c2.PUMP2 && out.P21 >= 3.3 && sim.env.houseLeak === 0 && c2.MAKEUP === 0) { q(pumpKey).click(); setR('KZRcmd', 50); }
          if (c2.V2cmd === 'close' && !proc) q('gateBtnV2').click();
          if (!pumped && sim.env.P1 < 6 && !reportedP1 && t > 20) { LV.report(); reportedP1 = true; }
          if (!proc && out.dP_strainer > 0.6) proc = { s: 0 };
          if (proc) {
            const s = proc.s;
            if (s === 0) { q('gateBtnV1').click(); proc.s = 1; }
            else if (s === 1 && c2.V1 === 0) { q('gateBtnV2').click(); proc.s = 2; }
            else if (s === 2 && c2.V2 === 0) { q('tagBtnV1').click(); q('tagBtnV2').click(); q('netDrainBtn').click(); q('netVentBtn').click(); proc.s = 3; proc.t = t; }
            else if (s === 3) {
              if (out.nodes[2] < 0.1 && out.fill[2] < 0.1) { q('cleanBtn').click(); q('netDrainBtn').click(); q('tagBtnV1').click(); q('tagBtnV2').click(); q('gateBtnV2').click(); proc.s = 4; }
              else if (t - proc.t > 30 && out.v1Leak && !reportedPass) { LV.report(); reportedPass = true; }
            }
            else if (s === 4 && Math.min(...out.fill.slice(1, 5)) >= 0.999) { q('netVentBtn').click(); q('gateBtnV1').click(); proc.s = 5; }
            else if (s === 5 && c2.V1 >= 100) proc = null;
            return;
          }
          if (t - lastK > 12 && out.G2 > 0 && out.G1 > 0) {
            lastK = t;
            let target = c2.KZRcmd;
            if (sim.env.T1 === 100 || (pumped && short)) target = 92;
            else { let dd = (out.T11_target - out.T11) * 0.6; if (out.T2 > out.T2_max) dd = Math.min(dd, -1); dd = Math.max(-4, Math.min(4, dd)); if (Math.abs(dd) >= 0.5) target = c2.KZRcmd + dd; }
            if (Math.round(target) !== Math.round(c2.KZRcmd)) setR('KZRcmd', Math.max(5, Math.min(100, target)));
          }
        };
      }
      localStorage.setItem('itp-levels-v1', JSON.stringify({ l1: { best: 100, stars: 3 }, l2: { best: 100, stars: 3 }, l3: { best: 100, stars: 3 }, l4: { best: 100, stars: 3 }, l5: { best: 100, stars: 3 } }));
      const scores = [];
      for (const lv of LV.list) {
        LV.exitIfActive();
        P.setConfig(sim, { makeupType: 'pumped', network: 'low', dhwScheme: '1stage' });   // уровень обязан сам выставить свою схему
        A.setPaused(true);
        document.querySelector('[data-mode="levels"]').click();
        document.querySelector(`[data-level="${lv.id}"]`).click();
        A.setPaused(true);
        const cfg = `${sim.config.makeupType}/${sim.config.dhwScheme}`;
        const bot = makeBot(); let t = 0;
        for (let i = 0; i < 45000; i++) { P.step(sim, 0.1); t += 0.1; if (i % 5 === 0) bot(t); LV.tick(); if (!q('levelModal').hidden) break; }
        const dbg = LV._debug();
        const text = q('levelModalBody').innerText;
        const m = text.match(/(\d+)\s*баллов/);
        const score = m ? Number(m[1]) : 0;
        q('levelModal').hidden = true;
        const pens = Object.values(dbg.penalties).map(p => `${p.text} × ${p.count}`);
        const rate = Object.entries(dbg.rateAcc).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v.toFixed(0)} с`);
        const unresolved = dbg.incs.filter(i => i.state !== 'done' && !(i.d.optional && i.revealT === null) && i.state !== 'idle').map(i => i.d.id);
        const reportsOk = dbg.incs.filter(i => i.d.needsReport && i.revealT !== null).every(i => i.reported);
        scores.push(`${lv.n}: ${score}`);
        r.check(G, `Смена ${lv.n} «${lv.title}» [${cfg}]: ${score} баллов`, score >= (lv.n === 6 ? 90 : 60) && unresolved.length === 0 && !/провалена/i.test(text),
          [unresolved.length ? 'не решено: ' + unresolved.join(', ') : '', pens.length ? 'штрафы: ' + pens.join('; ') : 'штрафов нет', rate.length ? 'по времени: ' + rate.join(', ') : ''].filter(Boolean).join(' · '));
        if (dbg.incs.some(i => i.d.needsReport)) r.check(G, `Смена ${lv.n}: «Сообщить диспетчеру» засчитано во всех инцидентах с needsReport`, reportsOk && !dbg.penalties.false_report,
          dbg.incs.filter(i => i.d.needsReport).map(i => `${i.d.id}: ${i.revealT === null ? 'не началось' : i.reported ? 'сообщено' : 'НЕ сообщено'}`).join(', '));
      }
      LV.exitIfActive();
      r.summary = r.summary || {}; r.summary.levels = scores.join(' · ');
    }

    // ----- 3.6 Консоль -----
    root.removeEventListener('error', onErr);
    console.error = origErr;
    r.check('Интерфейс', 'Ошибок в консоли за весь прогон', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | ') || '0');
    if (savedLessons === null) localStorage.removeItem('itp-lessons-done-v1'); else localStorage.setItem('itp-lessons-done-v1', savedLessons);
    if (savedLevels === null) localStorage.removeItem('itp-levels-v1'); else localStorage.setItem('itp-levels-v1', savedLevels);
    P.resetNominal(A.sim, { forceBase: true });
    A.syncControlsUI(); A.setPaused(false); A.render();
  }

  function showOverlay(text, r) {
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;inset:24px;z-index:100;background:#fff;border:1px solid #94A3B8;border-radius:8px;box-shadow:0 20px 40px rgba(15,23,42,.25);display:flex;flex-direction:column';
    box.innerHTML = `<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid #E2E8F0">
      <b style="font-size:15px">Аудит тренажера ИТП</b><span style="font-family:monospace;color:${r.fail ? '#B91C1C' : '#15803D'}">пройдено ${r.pass}, ошибок ${r.fail}</span>
      <button style="margin-left:auto;border:1px solid #CBD5E1;border-radius:4px;padding:2px 10px">Закрыть</button></div>
      <pre style="margin:0;padding:12px 14px;overflow:auto;font:12px/1.5 'JetBrains Mono',Consolas,monospace;white-space:pre-wrap"></pre>`;
    box.querySelector('pre').textContent = text;
    box.querySelector('button').addEventListener('click', () => box.remove());
    document.body.appendChild(box);
  }

  // ---------------------------------------------------------------------------
  // Запуск
  // ---------------------------------------------------------------------------
  if (isNode) {
    const path = require('path');
    require(path.join(__dirname, 'physics.js'));
    const r = makeReport();
    physicsSuite(globalThis.ITPPhysics, r);
    notesSuiteNode(r);
    sourcesSuiteNode(r);
    console.log(printReport(r));
    process.exitCode = r.fail ? 1 : 0;
  } else {
    async function run() {
      const r = makeReport();
      physicsSuite(root.ITPPhysics, r);
      await browserSuites(r);
      const text = printReport(r) + (r.summary ? `\n\nУроки: ${r.summary.lessons}\nСмены: ${r.summary.levels}` : '');
      console.log(text);
      root.ITPAudit.last = { report: r, text };
      showOverlay(text, r);
      return root.ITPAudit.last;
    }
    root.ITPAudit = { run };
    if (/[?&]audit\b/.test(location.search)) setTimeout(run, 1200);
  }
})(typeof window !== 'undefined' ? window : globalThis);
