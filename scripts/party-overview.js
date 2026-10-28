const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;
const BaseApplication = HandlebarsApplicationMixin(ApplicationV2);

export default class PartyOverviewApp extends BaseApplication {
  static DEFAULT_OPTIONS = {
    id: "party-overview-t20",
    classes: ["party-overview-t20"],
    tag: "div",
    window: {title: "party-overview-t20.title", resizable: true},
    position: {width: 1180, height: 650},
    actions: {
      refresh: PartyOverviewApp.prototype._onRefresh,
      mode: PartyOverviewApp.prototype._onMode,
      sort: PartyOverviewApp.prototype._onSort,
      skillScroll: PartyOverviewApp.prototype._onSkillScroll,
      openActor: PartyOverviewApp.prototype._onOpenActor
    }
  };

  static PARTS = {
    main: {
      template: "modules/party-overview-t20/templates/party-overview.hbs",
      // Preserva a rolagem entre atualizações (evita a tabela "pular" quando outro jogador altera algo).
      scrollable: [".pot20-table-scroll", ".pot20-skills-viewport"]
    }
  };

  constructor(options = {}) {
    super(options);
    this.mode = "general";
    this.sortKey = "name";
    this.sortDirection = 1;
  }

  async _prepareContext() {
    const actors = this._getPartyActors().map(a => this._getActorDetails(a));
    const skillColumns = this._getSkillColumns(actors);
    this._markLeaders(actors, skillColumns);
    this._prepareSkillRows(actors, skillColumns);
    this._sortActors(actors);

    const totals = actors.reduce((t, a) => {
      t.hp.value += a.hp.value; t.hp.max += a.hp.max;
      t.pm.value += a.pm.value; t.pm.max += a.pm.max;
      return t;
    }, {hp:{value:0,max:0}, pm:{value:0,max:0}});

    return {
      actors, actorCount: actors.length, totalHp: totals.hp, totalPm: totals.pm,
      totalHpPercent: this._percent(totals.hp.value, totals.hp.max),
      totalPmPercent: this._percent(totals.pm.value, totals.pm.max),
      mode: this.mode, sortKey: this.sortKey, isEmpty: actors.length === 0, skillColumns,
      moduleVersion: game.modules.get("party-overview-t20")?.version ?? ""
    };
  }

  _getPartyActors() {
    const scene = game.scenes.active;
    if (!scene) return [];
    const ids = new Set();
    for (const token of scene.tokens) {
      const actor = token.actor;
      if (actor?.hasPlayerOwner) ids.add(actor.id);
    }
    return [...ids].map(id => game.actors.get(id)).filter(Boolean);
  }

  _getActorDetails(actor) {
    const s = actor.system ?? {}, attrs = s.attributes ?? {}, at = s.atributos ?? {};
    const hp = this._resource(attrs.pv), pm = this._resource(attrs.pm);
    const skills = this._extractSkills(s);
    const a = {
      id: actor.id, name: actor.name, img: actor.img || "icons/svg/mystery-man.svg",
      level: this._getT20Level(actor),
      hp, pm,
      defense: this._number(attrs.defesa?.final, attrs.defesa?.value, attrs.defesa?.outro, s.defesa?.final, s.defesa?.value, s.defesa) ?? 0,
      fort: this._skillFromExtracted(skills, ["fortitude", "fort"]),
      reflex: this._skillFromExtracted(skills, ["reflexos","refl","ref"]),
      will: this._skillFromExtracted(skills, ["vontade","vont","von","will"]),
      perception: this._skillFromExtracted(skills, ["percepcao","percepção","perc","per"]),
      stealth: this._skillFromExtracted(skills, ["furtividade","furt"]),
      speed: this._speed(attrs.movement),
      for: this._attr(at,"for"), des: this._attr(at,"des"), con: this._attr(at,"con"),
      int: this._attr(at,"int"), sab: this._attr(at,"sab"), car: this._attr(at,"car"),
      skills
    };
    a.hpPercent = this._percent(hp.value,hp.max);
    a.pmPercent = this._percent(pm.value,pm.max);
    a.hpLow = hp.max > 0 && a.hpPercent <= 50;
    a.speedLabel = `${a.speed}`.replace(".", ",");
    return a;
  }

  _extractSkills(s) {
    const roots = [s.pericias, s.skills, s["perícias"]];
    const result = {};
    for (const root of roots) {
      if (!root || typeof root !== "object") continue;
      for (const [key, item] of Object.entries(root)) {
        if (this._isOficio(key, item)) continue;
        const value = this._number(item?.value, item?.final, item?.total, item);
        if (value !== undefined && result[key] === undefined) {
          result[key] = value;
        }
      }
    }
    return result;
  }

  _getSkillColumns(actors) {
    // Ordem oficial/esperada das perícias exibidas pelo painel.
    // Os aliases permitem encontrar tanto nomes completos quanto chaves abreviadas
    // usadas por diferentes versões do sistema T20.
    const known = [
      {id:"cura", aliases:["cura"], abbr:"CURA", label:"Cura"},
      {id:"luta", aliases:["luta"], abbr:"LUTA", label:"Luta"},
      {id:"acrobacia", aliases:["acrobacia","acro"], abbr:"ACRO", label:"Acrobacia"},
      {id:"adestramento", aliases:["adestramento","ades"], abbr:"ADES", label:"Adestramento"},
      {id:"atletismo", aliases:["atletismo","atle"], abbr:"ATLE", label:"Atletismo"},
      {id:"atuacao", aliases:["atuacao","atuacao","atua"], abbr:"ATUA", label:"Atuação"},
      {id:"cavalgar", aliases:["cavalgar","cava"], abbr:"CAVA", label:"Cavalgar"},
      {id:"conhecimento", aliases:["conhecimento","conh"], abbr:"CONH", label:"Conhecimento"},
      {id:"diplomacia", aliases:["diplomacia","dipl"], abbr:"DIPL", label:"Diplomacia"},
      {id:"enganacao", aliases:["enganacao","engana","enga"], abbr:"ENGA", label:"Enganação"},
      {id:"fortitude", aliases:["fortitude","fort"], abbr:"FORT", label:"Fortitude"},
      {id:"furtividade", aliases:["furtividade","furt"], abbr:"FURT", label:"Furtividade"},
      {id:"guerra", aliases:["guerra","guer"], abbr:"GUER", label:"Guerra"},
      {id:"iniciativa", aliases:["iniciativa","inic"], abbr:"INIC", label:"Iniciativa"},
      {id:"intimidacao", aliases:["intimidacao","inti"], abbr:"INTI", label:"Intimidação"},
      {id:"intuicao", aliases:["intuicao","intu"], abbr:"INTU", label:"Intuição"},
      {id:"investigacao", aliases:["investigacao","inve"], abbr:"INVE", label:"Investigação"},
      {id:"jogatina", aliases:["jogatina","joga"], abbr:"JOGA", label:"Jogatina"},
      {id:"ladinagem", aliases:["ladinagem","ladi"], abbr:"LADI", label:"Ladinagem"},
      {id:"misticismo", aliases:["misticismo","mist"], abbr:"MIST", label:"Misticismo"},
      {id:"nobreza", aliases:["nobreza","nobr"], abbr:"NOBR", label:"Nobreza"},
      {id:"percepcao", aliases:["percepcao","perc"], abbr:"PERC", label:"Percepção"},
      {id:"pilotagem", aliases:["pilotagem","pilo"], abbr:"PILO", label:"Pilotagem"},
      {id:"pontaria", aliases:["pontaria","pont"], abbr:"PONT", label:"Pontaria"},
      {id:"reflexos", aliases:["reflexos","refl"], abbr:"REFL", label:"Reflexos"},
      {id:"religiao", aliases:["religiao","reli"], abbr:"RELI", label:"Religião"},
      {id:"sobrevivencia", aliases:["sobrevivencia","sobr"], abbr:"SOBR", label:"Sobrevivência"},
      {id:"vontade", aliases:["vontade","vont"], abbr:"VONT", label:"Vontade"}
    ];

    const present = new Map();
    for (const actor of actors) {
      for (const [key, value] of Object.entries(actor.skills ?? {})) {
        if (this._isOficio(key)) continue;
        const normalized = this._normalize(key);
        if (!present.has(normalized)) present.set(normalized, key);
      }
    }

    const columns = [];
    const used = new Set();

    for (const skill of known) {
      let actual = null;
      let actualNormalized = null;

      // Primeiro procura correspondência exata; depois aceita chaves que começam
      // pelo alias (ex.: "Acro", "Acrob", "Acrobacia").
      for (const alias of skill.aliases) {
        const aliasNormalized = this._normalize(alias);
        if (present.has(aliasNormalized)) {
          actual = present.get(aliasNormalized);
          actualNormalized = aliasNormalized;
          break;
        }
      }

      if (!actual) {
        for (const [normalized, key] of present) {
          if (skill.aliases.some(alias => normalized.startsWith(this._normalize(alias)))) {
            actual = key;
            actualNormalized = normalized;
            break;
          }
        }
      }

      if (actual && !used.has(actualNormalized)) {
        columns.push({
          key: actual,
          abbr: skill.abbr,
          label: skill.label,
          lookup: skill.id
        });
        used.add(actualNormalized);
      }
    }

    // Perícias adicionais/customizadas continuam aparecendo, exceto Ofício.
    for (const [normalized, actual] of present) {
      if (used.has(normalized) || this._isOficio(normalized)) continue;
      columns.push({
        key: actual,
        abbr: this._safeAbbreviation(actual),
        label: this._skillLabel(actual),
        lookup: normalized
      });
      used.add(normalized);
    }

    return columns;
  }

  _safeAbbreviation(key) {
    const label = this._skillLabel(key);
    const normalized = this._normalize(label);
    let result = normalized.slice(0, 4).toUpperCase();
    if (result.length < 4) result = (result + "XXXX").slice(0, 4);
    return result;
  }

  _prepareSkillRows(actors, skillColumns) {
    for (const actor of actors) {
      actor.skillRows = skillColumns.map(col => ({
        key: col.key,
        value: actor.skills[col.key] ?? 0,
        leader: actor.skills[`${col.key}Leader`] === true
      }));
    }
  }

  _markLeaders(actors, skillColumns) {
    // Destaca o maior valor só quando ele diferencia alguém: se mais da metade
    // do grupo empata (ex.: todos nível 9), ninguém é marcado.
    const mark = (getValue, setLeader) => {
      const values = actors.map(getValue);
      const max = Math.max(...values, 0);
      const ties = values.filter(v => v === max).length;
      const show = actors.length > 1 && ties <= actors.length / 2;
      actors.forEach((actor, i) => setLeader(actor, show && values[i] === max));
    };
    const keys = ["level","defense","fort","reflex","will","perception","stealth","speed","for","des","con","int","sab","car"];
    for (const key of keys) mark(a => a[key] ?? 0, (a, v) => { a[`${key}Leader`] = v; });
    for (const key of ["hp","pm"]) mark(a => a[key].value, (a, v) => { a[`${key}Leader`] = v; });
    for (const col of skillColumns) mark(a => a.skills[col.key] ?? 0, (a, v) => { a.skills[`${col.key}Leader`] = v; });
  }

  _isOficio(key, item = null) {
    const text = this._normalize(`${key} ${item?.name ?? ""} ${item?.label ?? ""} ${item?.nome ?? ""}`);
    return text.includes("oficio") || text.includes("ofício");
  }

  _normalize(text) {
    return `${text ?? ""}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");
  }

  _skillLabel(key) {
    return `${key}`.replace(/[_-]/g," ").replace(/\b\w/g,c=>c.toUpperCase());
  }

  _abbreviation(key) {
    const label = this._skillLabel(key);
    const normalized = this._normalize(label);
    const prefixes = [
      ["acrob", "ACR"], ["adestr", "ADE"], ["atlet", "ATL"], ["atuac", "ATU"],
      ["caval", "CAV"], ["conhec", "CON"], ["cura", "CUR"], ["diplom", "DIP"],
      ["engan", "ENG"], ["fort", "FOR"], ["furt", "FUR"], ["guerra", "GUE"],
      ["inici", "INI"], ["intimid", "INT"], ["intuic", "INTU"], ["investig", "INV"],
      ["jogat", "JOG"], ["ladin", "LAD"], ["luta", "LUT"], ["mistic", "MIS"],
      ["nobrez", "NOB"], ["percep", "PER"], ["pilot", "PIL"], ["pontar", "PON"],
      ["reflex", "REF"], ["relig", "REL"], ["sobreviv", "SOB"], ["vontad", "VON"]
    ];
    const match = prefixes.find(([prefix]) => normalized.startsWith(prefix));
    if (match) return match[1];
    const words = label.split(/\s+/).filter(Boolean);
    const initials = words.map(x => x[0]).join("").toUpperCase();
    if (initials.length >= 3) return initials.slice(0,4);
    const letters = normalized.replace(/[^a-z]/g, "").toUpperCase();
    return (initials + letters).slice(0,3).padEnd(3,"X");
  }

  _getT20Level(actor) {
    const s = actor?.system ?? {};

    const direct = this._number(
      s.nivel?.value,
      s.nivel?.final,
      s.nivel,
      s.level?.value,
      s.level?.final,
      s.level
    );
    if (direct !== undefined && direct > 0) return direct;

    const classLevels = (actor?.items ?? [])
      .filter(item => item.type === "classe")
      .map(item => this._number(
        item.system?.niveis?.value,
        item.system?.niveis,
        item.system?.nivel?.value,
        item.system?.nivel,
        item.system?.level?.value,
        item.system?.level
      ) ?? 0);

    const total = classLevels.reduce((sum, value) => sum + value, 0);
    if (total > 0) return total;

    return this._number(
      s.attributes?.nivel?.value,
      s.attributes?.nivel,
      s.attributes?.level?.value,
      s.attributes?.level
    ) ?? 0;
  }

  _resource(r) {
    if (!r || typeof r !== "object") return {value:0,max:0};
    return {value:this._number(r.value,r.current,r.atual) ?? 0,max:this._number(r.max,r.maximum,r.maximo) ?? 0};
  }
  _attr(root,key) { const x=root?.[key]; return this._number(x?.value,x?.final,x) ?? 0; }
  _skillFromExtracted(skills, aliases) {
    const entries = Object.entries(skills ?? {});

    // Exact T20 IDs first.
    for (const alias of aliases) {
      const exact = entries.find(([key]) => key === alias);
      if (exact) return this._number(exact[1]) ?? 0;
    }

    // Then normalized names/IDs.
    for (const alias of aliases) {
      const normalized = this._normalize(alias);
      const match = entries.find(([key]) => this._normalize(key) === normalized);
      if (match) return this._number(match[1]) ?? 0;
    }

    // Finally, the original 0.4.12 lookup remains the fallback.
    return this._skill({pericias: skills}, aliases);
  }

  _skill(s,keys) {
    for (const root of [s.pericias,s.skills,s["perícias"],s]) {
      if (!root) continue;
      for (const key of keys) {
        const x=root[key], v=this._number(x?.value,x?.final,x?.total,x);
        if (v !== undefined) return v;
      }
    }
    return 0;
  }
  _speed(m) {
    if (m === null || m === undefined) return 0;

    // T20 Bureau: system.attributes.movement is the authoritative source.
    // The sheet renders its walk value as e.g. "9m".
    if (typeof m === "number") return m;
    if (typeof m === "string") {
      const match = m.match(/-?\\d+(?:[.,]\\d+)?/);
      return match ? Number(match[0].replace(",", ".")) : 0;
    }

    const value = this._number(
      m.walk?.value,
      m.walk,
      m.value,
      m.final,
      m.total
    );
    if (value !== undefined) return value;

    // Some schemas store the rendered distance with the unit.
    for (const key of ["walk", "value", "distance"]) {
      const raw = m[key];
      if (typeof raw === "string") {
        const match = raw.match(/-?\\d+(?:[.,]\\d+)?/);
        if (match) return Number(match[0].replace(",", "."));
      }
    }

    return 0;
  }

  _number(...values) {
    for (const value of values) {
      if (value===null || value===undefined || value==="") continue;
      const n=Number(value); if (Number.isFinite(n)) return n;
    }
    return undefined;
  }
  _percent(value,max) { return max>0 ? Math.max(0,Math.min(100,value/max*100)) : 0; }
  _sortActors(actors) {
    const key = this.sortKey;
    actors.sort((a, b) => {
      let av = a[key], bv = b[key];

      if (key === "hp" || key === "pm") {
        av = a[key].value;
        bv = b[key].value;
      }

      // In the Perícias view, columns are backed by actor.skills.
      if (av === undefined) av = a.skills?.[key];
      if (bv === undefined) bv = b.skills?.[key];

      if (key === "name") {
        return `${av ?? ""}`.localeCompare(`${bv ?? ""}`, "pt-BR") * this.sortDirection;
      }

      return ((Number(av) || 0) - (Number(bv) || 0)) * this.sortDirection;
    });
  }

  async _onRefresh(){ await this.render(); }
  async _onMode(_event,target){ this.mode=target.dataset.mode||"general"; await this.render(); }
  async _onSort(_event,target){
    const key=target.dataset.sort; if(!key) return;
    if(this.sortKey===key) this.sortDirection*=-1;
    else {this.sortKey=key;this.sortDirection=key==="name"?1:-1;}
    await this.render();
  }

  _onSkillScroll(_event, target) {
    const viewport = this.element?.querySelector(".pot20-skills-viewport");
    if (!viewport) return;
    const max = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    viewport.scrollLeft = (Number(target.value) / 1000) * max;
  }

  _syncSkillScroll() {
    const viewport = this.element?.querySelector(".pot20-skills-viewport");
    const slider = this.element?.querySelector('.pot20-skills-slider input[type="range"]');
    if (!viewport || !slider) return;

    const updateSlider = () => {
      const max = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      slider.value = max > 0 ? Math.round((viewport.scrollLeft / max) * 1000) : 0;
    };

    if (this._skillScrollHandler) viewport.removeEventListener("scroll", this._skillScrollHandler);
    this._skillScrollHandler = updateSlider;
    viewport.addEventListener("scroll", updateSlider, {passive:true});
    updateSlider();
  }

  _onRender(_context, _options) {
    this._syncSkillScroll();
  }

  /**
   * Atualização vinda de outro cliente (ator, token ou cena alterados).
   * Nunca usa force: true, que faz o Foundry trazer a janela para a frente
   * e restaurá-la se estiver minimizada. Minimizada, só marca como pendente.
   */
  async refreshQuietly() {
    if (!this.rendered) return;
    if (this.minimized) { this._stale = true; return; }
    await this.render();
  }

  async maximize() {
    await super.maximize();
    if (this._stale) { this._stale = false; await this.render(); }
  }

  _onOpenActor(_event,target){ game.actors.get(target.dataset.actorId)?.sheet?.render(true); }
}