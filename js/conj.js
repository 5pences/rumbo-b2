/* Spanish conjugation engine: rules + irregular table. Exposes window.Conj. */
(function (root) {
  'use strict';

  const PERSONS = ['yo', 'tú', 'él / ella / usted', 'nosotros/as', 'vosotros/as', 'ellos / ellas / ustedes'];
  const TENSES = [
    { k: 'pres', zh: '现在时', es: 'presente de indicativo', lv: 'A1' },
    { k: 'perf', zh: '现在完成时', es: 'pretérito perfecto', lv: 'A2' },
    { k: 'pret', zh: '简单过去时', es: 'pretérito indefinido', lv: 'A2' },
    { k: 'imp', zh: '过去未完成时', es: 'pretérito imperfecto', lv: 'A2' },
    { k: 'fut', zh: '将来时', es: 'futuro simple', lv: 'A2' },
    { k: 'imper', zh: '肯定命令式', es: 'imperativo afirmativo', lv: 'A2' },
    { k: 'cond', zh: '条件式', es: 'condicional simple', lv: 'B1' },
    { k: 'subj', zh: '虚拟式现在时', es: 'presente de subjuntivo', lv: 'B1' },
    { k: 'subjImp', zh: '虚拟式过去未完成时', es: 'imperfecto de subjuntivo', lv: 'B2' },
  ];

  const SERIR_PRET = ['fui', 'fuiste', 'fue', 'fuimos', 'fuisteis', 'fueron'];

  // Fully or partly irregular verbs.
  const IRR = {
    ser: { ov: { pres: ['soy', 'eres', 'es', 'somos', 'sois', 'son'], pret: SERIR_PRET, imp: ['era', 'eras', 'era', 'éramos', 'erais', 'eran'] }, subjStem: 'se', tu: 'sé' },
    ir: { ov: { pres: ['voy', 'vas', 'va', 'vamos', 'vais', 'van'], pret: SERIR_PRET, imp: ['iba', 'ibas', 'iba', 'íbamos', 'ibais', 'iban'] }, subjStem: 'vay', tu: 've', ger: 'yendo', nosImp: 'vamos' },
    estar: { ov: { pres: ['estoy', 'estás', 'está', 'estamos', 'estáis', 'están'], subj: ['esté', 'estés', 'esté', 'estemos', 'estéis', 'estén'] }, pret: 'estuv' },
    haber: { ov: { pres: ['he', 'has', 'ha', 'hemos', 'habéis', 'han'] }, subjStem: 'hay', pret: 'hub', fut: 'habr' },
    tener: { sc: 'ie', yo: 'tengo', pret: 'tuv', fut: 'tendr', tu: 'ten' },
    hacer: { yo: 'hago', pret: 'hic', fut: 'har', pp: 'hecho', tu: 'haz' },
    decir: { sc: 'i', yo: 'digo', pret: 'dij', fut: 'dir', pp: 'dicho', tu: 'di' },
    poder: { sc: 'ue', pret: 'pud', fut: 'podr', ger: 'pudiendo' },
    querer: { sc: 'ie', pret: 'quis', fut: 'querr' },
    saber: { yo: 'sé', subjStem: 'sep', pret: 'sup', fut: 'sabr' },
    poner: { yo: 'pongo', pret: 'pus', fut: 'pondr', pp: 'puesto', tu: 'pon' },
    venir: { sc: 'ie', yo: 'vengo', pret: 'vin', fut: 'vendr', tu: 'ven' },
    salir: { yo: 'salgo', fut: 'saldr', tu: 'sal' },
    dar: { ov: { pres: ['doy', 'das', 'da', 'damos', 'dais', 'dan'], pret: ['di', 'diste', 'dio', 'dimos', 'disteis', 'dieron'], subj: ['dé', 'des', 'dé', 'demos', 'deis', 'den'] } },
    ver: { ov: { pres: ['veo', 'ves', 've', 'vemos', 'veis', 'ven'], pret: ['vi', 'viste', 'vio', 'vimos', 'visteis', 'vieron'], imp: ['veía', 'veías', 'veía', 'veíamos', 'veíais', 'veían'] }, pp: 'visto' },
    traer: { yo: 'traigo', pret: 'traj' },
    caer: { yo: 'caigo' },
    oír: { ov: { pres: ['oigo', 'oyes', 'oye', 'oímos', 'oís', 'oyen'] } },
    reír: { ov: { pres: ['río', 'ríes', 'ríe', 'reímos', 'reís', 'ríen'], pret: ['reí', 'reíste', 'rio', 'reímos', 'reísteis', 'rieron'], subj: ['ría', 'rías', 'ría', 'riamos', 'riais', 'rían'] }, ger: 'riendo' },
    sonreír: { ov: { pres: ['sonrío', 'sonríes', 'sonríe', 'sonreímos', 'sonreís', 'sonríen'], pret: ['sonreí', 'sonreíste', 'sonrió', 'sonreímos', 'sonreísteis', 'sonrieron'], subj: ['sonría', 'sonrías', 'sonría', 'sonriamos', 'sonriáis', 'sonrían'] }, ger: 'sonriendo' },
    andar: { pret: 'anduv' },
    caber: { yo: 'quepo', pret: 'cup', fut: 'cabr' },
    valer: { yo: 'valgo', fut: 'valdr' },
    jugar: { sc: 'u' },
  };

  // Stem-changing verbs (boot pattern): e>ie, o>ue, e>i.
  const SC = {};
  ('pensar cerrar empezar comenzar despertar sentar entender perder preferir sentir divertir recomendar mentir calentar nevar ' +
    'defender encender convertir advertir sugerir herir hervir invertir atender gobernar negar regar sembrar temblar tropezar ' +
    'atravesar confesar apretar merendar encerrar arrepentir').split(' ').forEach(v => { SC[v] = 'ie'; });
  ('volver encontrar recordar contar costar dormir morir mostrar soñar acostar mover devolver almorzar probar volar llover doler ' +
    'soler resolver sonar colgar rogar aprobar comprobar demostrar acordar apostar envolver morder torcer soltar forzar renovar').split(' ').forEach(v => { SC[v] = 'ue'; });
  ('pedir servir repetir seguir conseguir elegir vestir medir despedir impedir competir corregir perseguir derretir').split(' ').forEach(v => { SC[v] = 'i'; });

  const PP = {
    abrir: 'abierto', escribir: 'escrito', volver: 'vuelto', morir: 'muerto', romper: 'roto', cubrir: 'cubierto',
    descubrir: 'descubierto', resolver: 'resuelto', devolver: 'devuelto', envolver: 'envuelto', describir: 'descrito',
    imprimir: 'impreso',
  };

  // -iar / -uar verbs that take a written accent (envío, continúo).
  const ACC = {};
  'enviar confiar esquiar guiar vaciar variar criar continuar actuar situar evaluar graduar efectuar'.split(' ').forEach(v => { ACC[v] = 1; });

  const COMPOUND_BASES = ['tener', 'poner', 'venir', 'hacer', 'traer', 'caer', 'salir', 'valer', 'volver', 'escribir', 'cubrir',
    'pedir', 'seguir', 'sentir', 'contar', 'probar', 'mostrar', 'mover'];

  const ACUTE = { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú' };
  function acute(s) {
    for (let i = s.length - 1; i >= 0; i--) if (ACUTE[s[i]]) return s.slice(0, i) + ACUTE[s[i]] + s.slice(i + 1);
    return s;
  }
  function swapLast(stem, a, b) {
    const i = stem.lastIndexOf(a);
    return i < 0 ? stem : stem.slice(0, i) + b + stem.slice(i + 1);
  }
  // Primary stem change (stressed syllable).
  function chg(stem, type) {
    if (type === 'ie') return swapLast(stem, 'e', 'ie');
    if (type === 'ue') return swapLast(stem, 'o', 'ue');
    if (type === 'i') return swapLast(stem, 'e', 'i');
    if (type === 'u') return swapLast(stem, 'u', 'ue');
    return stem;
  }
  // Secondary change of -ir verbs (pidió, durmió, sintamos).
  function sec(stem, type) {
    return type === 'ue' ? swapLast(stem, 'o', 'u') : swapLast(stem, 'e', 'i');
  }
  // Spelling before a/o for -er/-ir verbs.
  function soft(stem) {
    if (/gu$/.test(stem)) return stem.slice(0, -1);
    if (/qu$/.test(stem)) return stem.slice(0, -2) + 'c';
    if (/g$/.test(stem)) return stem.slice(0, -1) + 'j';
    if (/[aeiou]c$/.test(stem)) return stem.slice(0, -1) + 'zc';
    if (/c$/.test(stem)) return stem.slice(0, -1) + 'z';
    return stem;
  }
  // Spelling before e for -ar verbs.
  function hard(stem) {
    if (/c$/.test(stem)) return stem.slice(0, -1) + 'qu';
    if (/gu$/.test(stem)) return stem.slice(0, -1) + 'ü';
    if (/g$/.test(stem)) return stem + 'u';
    if (/z$/.test(stem)) return stem.slice(0, -1) + 'c';
    return stem;
  }

  function getSpec(inf) {
    if (IRR[inf]) return Object.assign({ known: true }, IRR[inf]);
    const spec = {};
    if (SC[inf]) spec.sc = SC[inf];
    if (PP[inf]) spec.pp = PP[inf];
    if (ACC[inf]) spec.acc = true;
    if (/ducir$/.test(inf)) spec.pret = inf.slice(0, -3) + 'j';
    if (Object.keys(spec).length) { spec.known = true; return spec; }
    for (const b of COMPOUND_BASES) {
      if (inf.length > b.length + 1 && inf.endsWith(b)) {
        const pre = inf.slice(0, -b.length);
        const s = IRR[b] || { sc: SC[b], pp: PP[b] };
        const o = { known: true, sc: s.sc };
        if (s.yo) o.yo = pre + s.yo;
        if (s.pret) o.pret = pre + s.pret;
        if (s.fut) o.fut = pre + s.fut;
        if (s.pp) o.pp = pre + s.pp;
        if (s.tu) o.tu = b === 'hacer' || b === 'salir' ? pre + s.tu : pre + acute(s.tu);
        return o;
      }
    }
    return {};
  }

  const HABER = ['he', 'has', 'ha', 'hemos', 'habéis', 'han'];
  const PRON = ['me', 'te', 'se', 'nos', 'os', 'se'];
  const BOOT = [0, 1, 2, 5];

  function conjugate(raw) {
    let inf = String(raw || '').trim().toLowerCase();
    let refl = false;
    if (/(ar|er|ir|ír)se$/.test(inf)) { refl = true; inf = inf.slice(0, -2); }
    if (!/^[a-záéíóúüñ]*(ar|er|ir|ír)$/.test(inf)) return null;
    const spec = getSpec(inf);
    const cls = inf.endsWith('ar') ? 'ar' : inf.endsWith('er') ? 'er' : 'ir';
    const stem = inf.slice(0, -2);
    const ov = spec.ov || {};
    const sc = spec.sc;
    const uir = cls === 'ir' && /u$/.test(stem) && !/[gq]u$/.test(stem);
    const vowelStem = cls !== 'ar' && (/[aeo]$/.test(stem) || uir);

    const PE = { ar: ['o', 'as', 'a', 'amos', 'áis', 'an'], er: ['o', 'es', 'e', 'emos', 'éis', 'en'], ir: ['o', 'es', 'e', 'imos', 'ís', 'en'] }[cls];
    const pres = ov.pres || PE.map((e, p) => {
      let s = stem;
      const b = BOOT.includes(p);
      if (b && sc) s = chg(s, sc);
      if (b && uir) s += 'y';
      if (b && spec.acc) s = acute(s);
      if (p === 0) {
        if (spec.yo) return spec.yo;
        if (cls !== 'ar') s = soft(s);
      }
      return s + e;
    });

    let pret;
    if (ov.pret) pret = ov.pret;
    else if (spec.pret) {
      const ps = spec.pret;
      pret = ['e', 'iste', 'o', 'imos', 'isteis', /j$/.test(ps) ? 'eron' : 'ieron']
        .map((e, p) => (p === 2 && /c$/.test(ps) ? ps.slice(0, -1) + 'z' : ps) + e);
    } else if (cls === 'ar') {
      pret = ['é', 'aste', 'ó', 'amos', 'asteis', 'aron'].map((e, p) => (p === 0 ? hard(stem) : stem) + e);
    } else if (vowelStem) {
      pret = (uir ? ['í', 'iste', 'yó', 'imos', 'isteis', 'yeron'] : ['í', 'íste', 'yó', 'ímos', 'ísteis', 'yeron']).map(e => stem + e);
    } else {
      pret = ['í', 'iste', 'ió', 'imos', 'isteis', 'ieron']
        .map((e, p) => ((p === 2 || p === 5) && cls === 'ir' && sc ? sec(stem, sc) : stem) + e);
    }

    const imp = ov.imp || (cls === 'ar' ? ['aba', 'abas', 'aba', 'ábamos', 'abais', 'aban'] : ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían']).map(e => stem + e);

    const fb = spec.fut || inf.replace(/ír$/, 'ir');
    const fut = ['é', 'ás', 'á', 'emos', 'éis', 'án'].map(e => fb + e);
    const cond = ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían'].map(e => fb + e);

    const SE = cls === 'ar' ? ['e', 'es', 'e', 'emos', 'éis', 'en'] : ['a', 'as', 'a', 'amos', 'áis', 'an'];
    let subj;
    if (ov.subj) subj = ov.subj;
    else {
      let fixed = spec.subjStem;
      if (!fixed && (spec.yo || ov.pres) && /o$/.test(pres[0])) fixed = pres[0].slice(0, -1);
      subj = SE.map((e, p) => {
        if (fixed) return fixed + e;
        let s = stem;
        const b = BOOT.includes(p);
        if (b && sc) s = chg(s, sc);
        else if (!b && sc && cls === 'ir') s = sec(s, sc);
        if (uir) s += 'y';
        if (b && spec.acc) s = acute(s);
        s = cls === 'ar' ? hard(s) : soft(s);
        return s + e;
      });
    }

    const base = pret[5].slice(0, -3);
    const ab = acute(base);
    const subjImp = [base + 'ra', base + 'ras', base + 'ra', ab + 'ramos', base + 'rais', base + 'ran'];
    const subjImpSe = [base + 'se', base + 'ses', base + 'se', ab + 'semos', base + 'seis', base + 'sen'];

    const pp = spec.pp || (cls === 'ar' ? stem + 'ado' : stem + (/[aeo]$/.test(stem) ? 'ído' : 'ido'));
    let ger = spec.ger;
    if (!ger) {
      if (cls === 'ar') ger = stem + 'ando';
      else if (vowelStem) ger = stem + 'yendo';
      else ger = (cls === 'ir' && sc ? sec(stem, sc) : stem) + 'iendo';
    }

    let imper = [null, spec.tu || pres[2], subj[2], spec.nosImp || subj[3], inf.slice(0, -1) + 'd', subj[5]];
    let perf = HABER.map(x => x + ' ' + pp);

    const out = { inf: refl ? inf + 'se' : inf, refl, known: !!spec.known, ger, pp, pres, perf, pret, imp, fut, imper, cond, subj, subjImp, subjImpSe };
    if (refl) {
      for (const k of ['pres', 'perf', 'pret', 'imp', 'fut', 'cond', 'subj', 'subjImp', 'subjImpSe']) out[k] = out[k].map((f, p) => PRON[p] + ' ' + f);
      out.imper = null;
      out.ger = ger + 'se';
    }
    return out;
  }

  // Verbs offered in the trainer: [infinitive, Chinese].
  const VERBS = [
    ['ser', '是（本质）'], ['estar', '在；处于（状态）'], ['tener', '有'], ['haber', '有（助动词）'], ['hacer', '做'], ['ir', '去'],
    ['poder', '能'], ['querer', '想要；爱'], ['decir', '说'], ['saber', '知道；会'], ['conocer', '认识；了解'], ['dar', '给'],
    ['ver', '看见'], ['poner', '放'], ['salir', '出去；离开'], ['venir', '来'], ['traer', '带来'], ['oír', '听见'], ['caer', '掉落'],
    ['hablar', '说话'], ['trabajar', '工作'], ['estudiar', '学习'], ['comprar', '买'], ['tomar', '拿；喝'], ['escuchar', '听'],
    ['mirar', '看'], ['necesitar', '需要'], ['ayudar', '帮助'], ['viajar', '旅行'], ['preguntar', '问'], ['esperar', '等；希望'],
    ['llevar', '带；穿'], ['dejar', '留下；让'], ['pasar', '经过；发生'], ['llamar', '叫；打电话'], ['cambiar', '改变'],
    ['buscar', '寻找'], ['tocar', '触摸；弹奏'], ['explicar', '解释'], ['sacar', '取出'], ['llegar', '到达'], ['pagar', '付钱'],
    ['jugar', '玩'], ['empezar', '开始'], ['almorzar', '吃午饭'], ['cruzar', '穿过'],
    ['comer', '吃'], ['beber', '喝'], ['aprender', '学会'], ['vender', '卖'], ['correr', '跑'], ['deber', '应该；欠'],
    ['leer', '读'], ['creer', '相信；认为'], ['parecer', '看起来'], ['ofrecer', '提供'], ['nacer', '出生'],
    ['vivir', '生活；住'], ['escribir', '写'], ['abrir', '打开'], ['recibir', '收到'], ['subir', '上升；上去'], ['decidir', '决定'],
    ['compartir', '分享'], ['permitir', '允许'],
    ['pensar', '想；认为'], ['cerrar', '关'], ['entender', '理解'], ['perder', '丢失；输'], ['preferir', '更喜欢'], ['sentir', '感觉；遗憾'],
    ['recomendar', '推荐'],
    ['volver', '回来'], ['encontrar', '找到'], ['recordar', '记得'], ['contar', '数；讲述'], ['costar', '花费'], ['dormir', '睡觉'],
    ['morir', '死'], ['mostrar', '展示'], ['soñar', '做梦'], ['devolver', '归还'],
    ['pedir', '请求；点（菜）'], ['servir', '服务；有用'], ['repetir', '重复'], ['seguir', '继续；跟随'], ['conseguir', '得到；做到'],
    ['elegir', '选择'], ['reír', '笑'],
    ['conducir', '开车'], ['traducir', '翻译'], ['construir', '建造'], ['coger', '拿；乘'], ['dirigir', '领导；指向'], ['proteger', '保护'],
    ['enviar', '寄；发送'], ['continuar', '继续'], ['andar', '走'], ['mantener', '保持'], ['suponer', '假设；猜想'],
    ['levantarse', '起床'], ['llamarse', '名叫'], ['ducharse', '淋浴'], ['acostarse', '上床睡觉'], ['despertarse', '醒来'],
    ['sentarse', '坐下'], ['vestirse', '穿衣服'], ['divertirse', '玩得开心'], ['quedarse', '留下'],
  ];

  function isIrregular(inf) {
    const base = inf.replace(/se$/, '');
    return !!getSpec(base).known || /(car|gar|zar|ger|gir|cer|cir|uir|eer|aer|oír)$/.test(base);
  }

  root.Conj = { conjugate, TENSES, PERSONS, VERBS, isIrregular };
})(typeof window !== 'undefined' ? window : globalThis);
