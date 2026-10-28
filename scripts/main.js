let PartyOverviewApp = null;
let partyOverview = null;

Hooks.once("init", () => {
  game.settings.register("party-overview-t20", "enablePlayerAccess", {
    name: "party-overview-t20.settings.enablePlayerAccess.name",
    hint: "party-overview-t20.settings.enablePlayerAccess.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
});

/**
 * Load the application only when it is actually needed.
 *
 * This is intentional: an error anywhere in party-overview.js must NOT prevent
 * this module's sidebar integration from registering. The working 0.4.2
 * proved that renderActorDirectory is the correct hook for this T20/Foundry
 * combination, so the sidebar button is kept independent from the application
 * implementation.
 */
async function loadPartyOverview() {
  if (!PartyOverviewApp) {
    const module = await import("./party-overview.js");
    PartyOverviewApp = module.default;
  }
  if (!partyOverview) partyOverview = new PartyOverviewApp();
  return partyOverview;
}

async function openPartyOverview() {
  try {
    const app = await loadPartyOverview();
    await app.render(true);
  } catch (error) {
    console.error("[Party Overview T20] Não foi possível abrir o painel.", error);
    ui.notifications.error("Party Overview T20: erro ao abrir o painel. Veja o console (F12) para detalhes.");
  }
}

Hooks.on("renderActorDirectory", (_app, html) => {
  if (!game.user.isGM && !game.settings.get("party-overview-t20", "enablePlayerAccess")) return;

  // Keep this intentionally identical to the known-working 0.4.2 integration.
  const header = html.querySelector(".directory-header");
  if (!header || header.querySelector("#party-overview-t20-button")) return;

  const button = document.createElement("button");
  button.id = "party-overview-t20-button";
  button.type = "button";
  button.innerHTML = `<i class="fas fa-users"></i> ${game.i18n.localize("party-overview-t20.button")}`;
  button.addEventListener("click", () => openPartyOverview());
  header.prepend(button);

  console.debug("[Party Overview T20] Botão inserido no ActorDirectory.");
});

/**
 * Estes hooks disparam em TODOS os clientes quando qualquer pessoa altera um
 * ator, token ou cena. Antes cada um chamava render({force: true}), que traz a
 * janela para a frente (e a restaura se minimizada) na tela de todos. Agora a
 * atualização é silenciosa e agrupada: várias mudanças seguidas viram um render só.
 */
let refreshTimer = null;
const refresh = () => {
  if (!partyOverview?.rendered) return;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    try {
      await partyOverview.refreshQuietly();
    } catch (error) {
      console.error("[Party Overview T20] Erro ao atualizar o painel.", error);
    }
  }, 150);
};

const isActiveSceneToken = token => token?.parent?.active === true;

Hooks.on("updateActor", actor => { if (actor.hasPlayerOwner) refresh(); });
Hooks.on("deleteActor", actor => { if (actor.hasPlayerOwner) refresh(); });
Hooks.on("createToken", token => { if (isActiveSceneToken(token)) refresh(); });
Hooks.on("deleteToken", token => { if (isActiveSceneToken(token)) refresh(); });
// Mover um token não muda nada no painel; só reage se o token trocar de ator
// ou se dados próprios de um token não vinculado mudarem.
Hooks.on("updateToken", (token, changes) => {
  if (!isActiveSceneToken(token)) return;
  if ("actorId" in changes || "delta" in changes || "actorLink" in changes) refresh();
});
Hooks.on("updateScene", (_scene, changes) => {
  if (changes.active !== undefined) setTimeout(refresh, 50);
});
Hooks.on("canvasReady", refresh);

globalThis.PartyOverviewT20 = {
  open: openPartyOverview,
  refresh
};
