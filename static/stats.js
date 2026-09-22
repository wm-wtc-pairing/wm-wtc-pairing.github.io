const SUPER_JUNIORS = [
  { id: "magnus", label: "Magnus + Invictus", caster: /magnus/i, jack: /^invictus$/i },
  { id: "carver", label: "Carver + War Boar", caster: /carver/i, jack: /war boar/i },
  { id: "nostilla", label: "Nostilla + Aberration", caster: /nostilla/i, jack: /^aberration$/i },
  { id: "constance", label: "Constance + Gallant", caster: /constance/i, jack: /^gallant$/i },
];

const DEFENSES = ["Barrier", "Fire Pit", "Spike Trap", "Powder Keg"];
const DEFENSE_RE = /^DEFENSE OPTION\s+\d+\s*-\s*(Barrier|Fire Pit|Spike Trap|Powder Keg)$/i;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function armyListLabel(player) {
  const army = (player?.army || "").trim();
  const theme = (player?.theme || "").trim();
  if (army && theme) return `${army} ${theme}`;
  const faction = (player?.faction || "").replace(" - ", " ").trim();
  return faction || army || theme || "Unknown";
}

function entryNames(list) {
  return (list.entries || []).map((e) => e.name || "");
}

function hasSuperJunior(list, pack) {
  const names = entryNames(list);
  return names.some((n) => pack.caster.test(n)) && names.some((n) => pack.jack.test(n));
}

function defenseType(name) {
  const match = DEFENSE_RE.exec((name || "").trim());
  if (!match) return null;
  return DEFENSES.find((label) => label.toLowerCase() === match[1].toLowerCase()) || match[1];
}

function countMap(values) {
  const map = {};
  for (const value of values) {
    const key = value || "Unknown";
    map[key] = (map[key] || 0) + 1;
  }
  return map;
}

function ranked(map) {
  return Object.entries(map)
    .map(([label, n]) => ({ label, n }))
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
}

function pct(n, total) {
  if (!total) return "0%";
  const value = (n / total) * 100;
  return (value >= 10 ? value.toFixed(0) : value.toFixed(1)) + "%";
}

function hbar(rows, total) {
  const max = Math.max(...rows.map((r) => r.n), 1);
  return `<div class="hbar" role="img" aria-label="Bar chart">
    ${rows.map((row) => `
      <div class="hbar-row">
        <div class="hbar-label">${escapeHtml(row.label)}</div>
        <div class="hbar-track"><div class="hbar-fill" style="width:${(row.n / max) * 100}%"></div></div>
        <div class="hbar-val">${row.n}<span>${pct(row.n, total)}</span></div>
      </div>
    `).join("")}
  </div>`;
}

function collect(data) {
  const teams = data.teams || [];
  const players = teams.flatMap((t) => t.players || []);
  const lists = players.flatMap((p) => (p.lists || []).map((list) => ({ player: p, list })));
  const twoList = players.filter((p) => (p.lists || []).length >= 2);

  const armies = countMap(players.map(armyListLabel));
  const casters = countMap(lists.map((row) => row.list.caster || "Unknown"));

  const castersByArmy = {};
  for (const row of lists) {
    const army = armyListLabel(row.player);
    const caster = row.list.caster || "Unknown";
    if (!castersByArmy[army]) castersByArmy[army] = {};
    castersByArmy[army][caster] = (castersByArmy[army][caster] || 0) + 1;
  }

  const juniors = SUPER_JUNIORS.map((pack) => {
    const hits = lists.filter((row) => hasSuperJunior(row.list, pack));
    const hosts = countMap(hits.map((row) => armyListLabel(row.player)));
    return { ...pack, n: hits.length, hosts };
  });

  const defenses = Object.fromEntries(DEFENSES.map((label) => [label, 0]));
  const defensesByPlayer = Object.fromEntries(DEFENSES.map((label) => [label, 0]));
  for (const row of lists) {
    for (const entry of row.list.entries || []) {
      const type = defenseType(entry.name);
      if (!type) continue;
      defenses[type] = (defenses[type] || 0) + 1;
    }
  }
  for (const player of players) {
    const types = new Set();
    for (const list of player.lists || []) {
      for (const entry of list.entries || []) {
        const type = defenseType(entry.name);
        if (type) types.add(type);
      }
    }
    for (const type of types) {
      defensesByPlayer[type] = (defensesByPlayer[type] || 0) + 1;
    }
  }

  const pairs = countMap(
    twoList.map((p) => {
      const names = p.lists.slice(0, 2).map((l) => (l.caster || "Unknown").trim()).sort();
      return names.join(" / ");
    })
  );

  const sameCaster = twoList.filter((p) => {
    const a = (p.lists[0].caster || "").trim();
    const b = (p.lists[1].caster || "").trim();
    return a && b && a === b;
  }).length;

  return {
    teams: teams.length,
    players: players.length,
    lists: lists.length,
    uniqueCasters: Object.keys(casters).length,
    twoList: twoList.length,
    sameCaster,
    armies,
    casters,
    castersByArmy,
    juniors,
    pairs,
    anyJunior: lists.filter((row) => SUPER_JUNIORS.some((pack) => hasSuperJunior(row.list, pack))).length,
    defenses,
    defensesByPlayer,
  };
}

function renderKpis(stats) {
  document.getElementById("stats-kpis").innerHTML = `
    <div class="stat"><span>Teams</span><strong>${stats.teams}</strong></div>
    <div class="stat"><span>Players</span><strong>${stats.players}</strong></div>
    <div class="stat"><span>Lists</span><strong>${stats.lists}</strong></div>
    <div class="stat"><span>Unique casters</span><strong>${stats.uniqueCasters}</strong></div>
    <div class="stat"><span>Two-list players</span><strong>${stats.twoList}/${stats.players}</strong></div>
    <div class="stat"><span>Lists with a Super Junior</span><strong>${stats.anyJunior}</strong></div>
  `;
}

function fillSelect(select, rows, selected) {
  select.innerHTML = rows.map((row) =>
    `<option value="${escapeHtml(row.value)}"${row.value === selected ? " selected" : ""}>${escapeHtml(row.label)}</option>`
  ).join("");
}

function renderCasterShare(stats, army) {
  const map = stats.castersByArmy[army] || {};
  const rows = ranked(map);
  const total = rows.reduce((sum, row) => sum + row.n, 0);
  document.getElementById("chart-casters").innerHTML = total
    ? hbar(rows, total)
    : `<p class="hint">No lists for this army.</p>`;
}

function renderJuniorHosts(stats, packId) {
  const pack = stats.juniors.find((j) => j.id === packId) || stats.juniors[0];
  const rows = ranked(pack.hosts);
  const hostEl = document.getElementById("chart-junior-hosts");
  if (!rows.length) {
    hostEl.innerHTML = `<p class="hint">No ${escapeHtml(pack.label)} packages in this snapshot.</p>`;
    return;
  }
  hostEl.innerHTML = `<p class="hint">${escapeHtml(pack.label)} shows up in ${pack.n} lists, mostly in:</p>${hbar(rows, pack.n)}`;
}

async function init() {
  const res = await fetch("data/teams.json");
  const data = await res.json();
  const stats = collect(data);

  renderKpis(stats);
  document.getElementById("chart-armies").innerHTML = hbar(ranked(stats.armies), stats.players);
  document.getElementById("chart-juniors").innerHTML = hbar(
    stats.juniors.map((j) => ({ label: j.label, n: j.n })),
    stats.lists
  );
  const defenseTotal = Object.values(stats.defenses).reduce((sum, n) => sum + n, 0);
  document.getElementById("chart-defenses").innerHTML = defenseTotal
    ? hbar(ranked(stats.defenses), defenseTotal)
    : `<p class="hint">No Barrier, Fire Pit, Spike Trap, or Powder Keg entries in this snapshot.</p>`;
  const defensePlayerTotal = Object.values(stats.defensesByPlayer).reduce((sum, n) => sum + n, 0);
  document.getElementById("chart-defenses-players").innerHTML = defensePlayerTotal
    ? hbar(ranked(stats.defensesByPlayer), defensePlayerTotal)
    : `<p class="hint">No players took Barrier, Fire Pit, Spike Trap, or Powder Keg in this snapshot.</p>`;
  document.getElementById("chart-top-casters").innerHTML = hbar(ranked(stats.casters).slice(0, 15), stats.lists);
  document.getElementById("chart-pairs").innerHTML = hbar(ranked(stats.pairs).slice(0, 12), stats.twoList);

  const armySelect = document.getElementById("caster-army");
  const armyRows = ranked(stats.armies).map((row) => ({
    value: row.label,
    label: `${row.label} (${row.n})`,
  }));
  fillSelect(armySelect, armyRows, armyRows[0]?.value);
  renderCasterShare(stats, armySelect.value);
  armySelect.addEventListener("change", () => renderCasterShare(stats, armySelect.value));

  const juniorSelect = document.getElementById("junior-pack");
  fillSelect(
    juniorSelect,
    stats.juniors.map((j) => ({ value: j.id, label: `${j.label} (${j.n})` })),
    stats.juniors[0]?.id
  );
  renderJuniorHosts(stats, juniorSelect.value);
  juniorSelect.addEventListener("change", () => renderJuniorHosts(stats, juniorSelect.value));
}

init().catch((err) => {
  document.getElementById("stats-kpis").innerHTML = `<p class="hint">Could not load team data.</p>`;
  console.error(err);
});
