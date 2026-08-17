const state = { worlds: [], world: null, tab: "overview", sessionId: null };

const $ = (selector) => document.querySelector(selector);
const elements = {
  createView: $("#createView"), worldView: $("#worldView"), worldList: $("#worldList"),
  createForm: $("#createForm"), createNote: $("#createNote"), statusDot: $("#statusDot"),
  adapterLabel: $("#adapterLabel"), tabContent: $("#tabContent"), tabs: $("#tabs"),
  modalBackdrop: $("#modalBackdrop"), modalContent: $("#modalContent"), toast: $("#toast"),
};

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const pretty = (value) => JSON.stringify(value, null, 2);
const titleCase = (value) => String(value).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || `${response.status} ${response.statusText}`);
  return payload;
}

function notify(message, duration = 3200) {
  elements.toast.textContent = message;
  elements.toast.classList.remove("hidden");
  window.clearTimeout(notify.timeout);
  notify.timeout = window.setTimeout(() => elements.toast.classList.add("hidden"), duration);
}

async function loadWorlds() {
  const health = await api("/api/health");
  elements.statusDot.classList.add("online");
  elements.adapterLabel.textContent = `${health.modelAdapter} model`;
  elements.createNote.textContent = health.modelAdapter === "demo"
    ? "Demo mode is active: instant, keyless, and deterministic. Add model credentials when you want original output."
    : `Original generation is active through the ${health.modelAdapter} adapter.`;
  state.worlds = (await api("/api/worlds")).worlds;
  renderWorldList();
}

function renderWorldList() {
  elements.worldList.innerHTML = state.worlds.length ? state.worlds.map((world) => `
    <button class="world-item ${state.world?.id === world.id ? "active" : ""}" data-world-id="${world.id}">
      <b>${escapeHtml(world.title)}</b><small>${escapeHtml(world.genre)} · ${world.artifactTypes.length} packages</small>
    </button>`).join("") : `<div class="world-item"><small>No worlds yet</small></div>`;
  elements.worldList.querySelectorAll("[data-world-id]").forEach((button) => button.addEventListener("click", () => selectWorld(button.dataset.worldId)));
}

function showCreate() {
  state.world = null;
  elements.createView.classList.remove("hidden");
  elements.worldView.classList.add("hidden");
  renderWorldList();
  $("#brief").focus();
}

async function selectWorld(id, tab = state.tab) {
  state.world = await api(`/api/worlds/${id}`);
  state.tab = tab;
  if (!state.sessionId || !state.world.sessions.some((session) => session.id === state.sessionId)) {
    state.sessionId = state.world.sessions.at(-1)?.id || null;
  }
  elements.createView.classList.add("hidden");
  elements.worldView.classList.remove("hidden");
  $("#worldMeta").textContent = `${state.world.canon.genre} · ${state.world.canon.tone.join(" / ")}`;
  $("#worldTitle").textContent = state.world.title;
  $("#worldLogline").textContent = state.world.canon.logline;
  $("#packageCount").textContent = state.world.artifacts.length;
  $("#assetCount").textContent = state.world.assets.length;
  $("#exportButton").href = `/api/worlds/${id}/export`;
  elements.tabs.querySelectorAll("button").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
  renderWorldList();
  renderTab();
}

function lastAudit() { return state.world?.audits.at(-1); }

function renderOverview() {
  const { canon } = state.world;
  const audit = lastAudit();
  elements.tabContent.innerHTML = `
    ${audit ? `<div class="audit-card"><div class="audit-score">${audit.score}</div><div><b>${audit.approved ? "Continuity holds" : "Continuity needs attention"}</b><p>${audit.conflicts.length} conflicts · audited ${new Date(audit.createdAt).toLocaleString()}</p></div></div>` : ""}
    <div class="overview-grid">
      <div>
        <section class="panel"><div class="eyeline">Story engine</div><h2 class="section-title">${escapeHtml(canon.story.centralConflict)}</h2><p class="modal-summary">${escapeHtml(canon.story.premise)}</p><div class="tag-row">${canon.themes.map((theme) => `<span class="tag">${escapeHtml(theme)}</span>`).join("")}</div></section>
        <section class="panel"><div class="eyeline">Cast</div><div class="canon-list">${canon.characters.map((character) => `<div class="canon-card"><b>${escapeHtml(character.name)} · ${escapeHtml(character.role)}</b><p>${escapeHtml(character.goal)} — ${escapeHtml(character.conflict)}</p></div>`).join("")}</div></section>
        <section class="panel"><div class="eyeline">Story beats</div><div class="canon-list">${canon.story.beats.map((beat, index) => `<div class="canon-card"><b>${index + 1}. ${escapeHtml(beat.title)}</b><p>${escapeHtml(beat.summary)} <i>${escapeHtml(beat.turn)}</i></p></div>`).join("")}</div></section>
      </div>
      <div>
        <section class="panel"><div class="eyeline">World rules</div><ul class="fact-list">${canon.rules.map((rule) => `<li>${escapeHtml(rule)}</li>`).join("")}</ul></section>
        <section class="panel"><div class="eyeline">Locations</div><div class="canon-list">${canon.locations.map((location) => `<div class="canon-card"><b>${escapeHtml(location.name)}</b><p>${escapeHtml(location.description)}</p></div>`).join("")}</div></section>
        <section class="panel"><div class="eyeline">Possible endings</div><ul class="fact-list">${canon.story.possibleEndings.map((ending) => `<li>${escapeHtml(ending)}</li>`).join("")}</ul></section>
      </div>
    </div>`;
}

const packageIcons = { narrative: "¶", game_world: "⬡", storyboard: "▤", film_treatment: "◐", photoshoot: "◉", visual_novel: "◇" };
function renderPackages() {
  elements.tabContent.innerHTML = state.world.artifacts.length ? `<div class="package-grid">${state.world.artifacts.map((artifact) => `
    <button class="package-card" data-artifact-id="${artifact.id}"><span class="package-icon">${packageIcons[artifact.type] || "✦"}</span><h3>${escapeHtml(artifact.title)}</h3><p>${escapeHtml(artifact.summary)}</p><footer><span>${titleCase(artifact.type)}</span><span>${artifact.blocks.length} blocks · ${artifact.assetPlan.length} assets</span></footer></button>`).join("")}</div>` : `<div class="empty-panel">No packages yet.</div>`;
  elements.tabContent.querySelectorAll("[data-artifact-id]").forEach((button) => button.addEventListener("click", () => openArtifact(button.dataset.artifactId)));
}

function openArtifact(id) {
  const artifact = state.world.artifacts.find((item) => item.id === id);
  elements.modalContent.innerHTML = `<div class="eyeline">${titleCase(artifact.type)}</div><h2 id="modalTitle">${escapeHtml(artifact.title)}</h2><p class="modal-summary">${escapeHtml(artifact.summary)}</p><pre>${escapeHtml(pretty(artifact.content))}</pre>`;
  elements.modalBackdrop.classList.remove("hidden");
}

function currentSession() { return state.world.sessions.find((session) => session.id === state.sessionId) || null; }
function renderPlay() {
  const session = currentSession();
  if (!session) {
    elements.tabContent.innerHTML = `<div class="empty-panel"><h2 class="section-title">Enter ${escapeHtml(state.world.title)}</h2><p>Start a persistent branching session. Each choice advances canon, relationships, inventory, and world state.</p><button class="secondary-button" id="startSession">Start the story</button></div>`;
    $("#startSession").addEventListener("click", startSession);
    return;
  }
  const scene = session.scenes.find((item) => item.id === session.currentSceneId);
  elements.tabContent.innerHTML = `<div class="play-layout">
    <article class="scene"><div class="scene-visual"><p>${escapeHtml(scene.imagePrompt)}</p></div><div class="scene-body"><div class="eyeline">${escapeHtml(state.world.canon.locations.find((location) => location.id === scene.locationId)?.name || scene.locationId)}</div><h2>${escapeHtml(scene.title)}</h2><div class="scene-narrative">${escapeHtml(scene.narrative)}</div><div class="dialogue">${scene.dialogue.map((line) => `<div class="dialogue-line"><b>${escapeHtml(line.speaker)}</b><span>${escapeHtml(line.text)}</span></div>`).join("")}</div>${scene.isEnding ? `<div class="tag">Ending reached</div>` : `<div class="choices">${scene.choices.map((choice) => `<button class="choice-button" data-choice-id="${choice.id}"><b>${escapeHtml(choice.label)} →</b><small>${escapeHtml(choice.consequenceHint)}</small></button>`).join("")}</div>`}</div></article>
    <aside><section class="panel"><div class="eyeline">Sessions</div><div class="session-list">${state.world.sessions.map((item) => `<button class="${item.id === session.id ? "active" : ""}" data-session-id="${item.id}"><b>${escapeHtml(item.title)}</b><small>${item.scenes.length} scenes · ${item.status}</small></button>`).join("")}</div><button class="secondary-button" id="newSession" style="margin-top:12px;width:100%">New playthrough</button></section><section class="panel"><div class="eyeline">Live state</div><pre style="white-space:pre-wrap;font-size:9px">${escapeHtml(pretty({ variables: session.variables, inventory: session.inventory, relationships: session.relationships }))}</pre></section></aside>
  </div>`;
  elements.tabContent.querySelectorAll("[data-choice-id]").forEach((button) => button.addEventListener("click", () => choose(button.dataset.choiceId, button)));
  elements.tabContent.querySelectorAll("[data-session-id]").forEach((button) => button.addEventListener("click", () => { state.sessionId = button.dataset.sessionId; renderPlay(); }));
  $("#newSession").addEventListener("click", startSession);
}

async function startSession() {
  const button = $("#startSession") || $("#newSession");
  button.disabled = true; button.textContent = "Opening world…";
  try {
    const session = await api(`/api/worlds/${state.world.id}/sessions`, { method: "POST", body: "{}" });
    state.sessionId = session.id;
    await selectWorld(state.world.id, "play");
  } catch (error) { notify(error.message); button.disabled = false; }
}

async function choose(choiceId, button) {
  button.disabled = true;
  button.querySelector("b").textContent = "The world is responding…";
  try {
    await api(`/api/worlds/${state.world.id}/sessions/${state.sessionId}/choose`, { method: "POST", body: JSON.stringify({ choiceId }) });
    await selectWorld(state.world.id, "play");
  } catch (error) { notify(error.message); button.disabled = false; }
}

function mediaPreview(asset) {
  if (asset.kind === "image") return `<img src="${escapeHtml(asset.uri)}" alt="${escapeHtml(asset.alt)}" loading="lazy" />`;
  if (asset.kind === "video") return `<video src="${escapeHtml(asset.uri)}" controls></video>`;
  if (asset.kind === "audio" || asset.kind === "music") return `<audio src="${escapeHtml(asset.uri)}" controls></audio>`;
  return "◈";
}

function renderAssets() {
  const briefs = state.world.artifacts.flatMap((artifact) => artifact.assetPlan.map((brief) => ({ ...brief, artifactType: artifact.type })));
  elements.tabContent.innerHTML = `<form class="compact-form" id="assetForm"><select name="briefId"><option value="">Unplanned asset</option>${briefs.map((brief) => `<option value="${brief.id}">${escapeHtml(brief.title)} · ${titleCase(brief.artifactType)}</option>`).join("")}</select><input name="uri" type="url" required placeholder="https://… generated image, video, or audio" /><button class="secondary-button">Attach asset</button></form>
    ${state.world.assets.length ? `<div class="asset-grid">${state.world.assets.map((asset) => `<article class="asset-card"><div class="asset-preview">${mediaPreview(asset)}</div><div class="asset-body"><h3>${escapeHtml(asset.title)}</h3><p>${escapeHtml(asset.alt)}</p><footer><span>${escapeHtml(asset.kind)}</span><a href="${escapeHtml(asset.uri)}" target="_blank">Open</a></footer></div></article>`).join("")}</div>` : `<div class="empty-panel">No attached media yet. Planned prompts below can be sent to any media model.</div>`}
    <h2 class="section-title" style="margin-top:28px">Asset prompt bank</h2><div class="asset-grid">${briefs.map((brief) => `<article class="asset-card"><div class="asset-preview">${brief.kind === "image" ? "◉" : brief.kind === "video" ? "▶" : "♪"}</div><div class="asset-body"><h3>${escapeHtml(brief.title)}</h3><p>${escapeHtml(brief.prompt)}</p><footer><span>${titleCase(brief.kind)} · ${titleCase(brief.artifactType)}</span><button class="text-button" data-copy="${escapeHtml(brief.prompt)}">Copy prompt</button></footer></div></article>`).join("")}</div>`;
  $("#assetForm").addEventListener("submit", attachAsset);
  elements.tabContent.querySelectorAll("[data-copy]").forEach((button) => button.addEventListener("click", async () => { await navigator.clipboard.writeText(button.dataset.copy); notify("Prompt copied"); }));
}

async function attachAsset(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const briefId = form.get("briefId");
  const brief = state.world.artifacts.flatMap((artifact) => artifact.assetPlan).find((item) => item.id === briefId);
  try {
    await api(`/api/worlds/${state.world.id}/assets`, { method: "POST", body: JSON.stringify({ briefId: briefId || undefined, kind: brief?.kind || "image", title: brief?.title || "Attached asset", uri: form.get("uri"), alt: brief?.title || "World asset", characterIds: brief?.characterIds || [], locationId: brief?.locationId }) });
    await selectWorld(state.world.id, "assets"); notify("Asset attached");
  } catch (error) { notify(error.message); }
}

function renderCanon() {
  elements.tabContent.innerHTML = `<pre class="json-view">${escapeHtml(pretty({ schema: state.world.schema, canon: state.world.canon, metadata: state.world.metadata }))}</pre>`;
}

function renderTab() {
  if (state.tab === "overview") renderOverview();
  else if (state.tab === "packages") renderPackages();
  else if (state.tab === "play") renderPlay();
  else if (state.tab === "assets") renderAssets();
  else renderCanon();
}

elements.createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button[type=submit]");
  const original = button.innerHTML;
  const artifactTypes = [...$("#formatGrid").querySelectorAll("input:checked")].map((input) => input.value);
  if (!artifactTypes.length) { notify("Choose at least one package"); return; }
  button.disabled = true; button.innerHTML = "<span>Building canon and packages…</span><span>◌</span>";
  try {
    const world = await api("/api/worlds", { method: "POST", body: JSON.stringify({ brief: $("#brief").value, artifactTypes }) });
    await loadWorlds(); await selectWorld(world.id); notify(`${world.title} is ready`);
  } catch (error) { notify(error.message, 6000); } finally { button.disabled = false; button.innerHTML = original; }
});

$("#newWorldButton").addEventListener("click", showCreate);
$("#toggleFormats").addEventListener("click", () => {
  const inputs = [...$("#formatGrid").querySelectorAll("input")];
  const check = inputs.some((input) => !input.checked);
  inputs.forEach((input) => { input.checked = check; });
});
elements.tabs.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-tab]");
  if (!button) return;
  state.tab = button.dataset.tab;
  elements.tabs.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
  renderTab();
});
$("#auditButton").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true; button.textContent = "Auditing…";
  try { const audit = await api(`/api/worlds/${state.world.id}/audit`, { method: "POST", body: "{}" }); await selectWorld(state.world.id, "overview"); notify(`Continuity score: ${audit.score}`); }
  catch (error) { notify(error.message); }
  finally { button.disabled = false; button.textContent = "Run continuity audit"; }
});
$("#modalClose").addEventListener("click", () => elements.modalBackdrop.classList.add("hidden"));
elements.modalBackdrop.addEventListener("click", (event) => { if (event.target === elements.modalBackdrop) elements.modalBackdrop.classList.add("hidden"); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape") elements.modalBackdrop.classList.add("hidden"); });

loadWorlds().catch((error) => { elements.adapterLabel.textContent = "Service unavailable"; notify(error.message, 8000); });
