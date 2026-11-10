const $ = (id) => document.getElementById(id);

async function init() {
  if (window.SheetsAuth.isLoggedIn()) {
    location.replace("index.html");
    return;
  }

  $("loginBtn").addEventListener("click", async () => {
    $("loginBtn").disabled = true;
    $("loginBtn").textContent = "Conectando…";
    try {
      await window.SheetsAuth.getAccessToken();
      $("statusText").textContent = "Listo ✓";
      location.replace("index.html");
    } catch (err) {
      console.error(err);
      $("statusText").textContent = "No se pudo conectar. Intenta de nuevo.";
      $("loginBtn").disabled = false;
      $("loginBtn").textContent = "Conectar con Google";
    }
  });
}

init();
