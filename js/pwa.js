// Instalación como app: registra el service worker y muestra el botón
// "Instalar" (id btnInstalar) cuando Chrome avisa que se puede instalar.
(function () {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch((err) => console.warn("SW:", err));
  }

  let aviso = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    aviso = e;
    const btn = document.getElementById("btnInstalar");
    if (btn) btn.hidden = false;
  });

  window.addEventListener("appinstalled", () => {
    aviso = null;
    const btn = document.getElementById("btnInstalar");
    if (btn) btn.hidden = true;
  });

  document.addEventListener("click", async (e) => {
    if (!e.target.closest("#btnInstalar") || !aviso) return;
    aviso.prompt();
    await aviso.userChoice;
    aviso = null;
    e.target.closest("#btnInstalar").hidden = true;
  });
})();
