const API = "../api";
let csrf = "";

const form = document.getElementById("login-form");
const errorBox = document.getElementById("login-error");
const button = document.getElementById("btn-login");

async function init() {
    try {
        const res = await fetch(`${API}/auth.php`, { credentials: "same-origin" });
        const data = await res.json();
        if (data.authenticated) {
            window.location.replace("index.html");
            return;
        }
        csrf = data.csrf;
    } catch {
        showError("No se pudo conectar con el servidor.");
    }
}

function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.hidden = true;
    button.disabled = true;
    try {
        const res = await fetch(`${API}/auth.php?action=login`, {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
            body: JSON.stringify({
                usuario: form.usuario.value.trim(),
                password: form.password.value,
            }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "No se pudo iniciar sesión");
        window.location.replace("index.html");
    } catch (error) {
        showError(error.message);
        form.password.value = "";
        init(); // renueva el token por si la sesión cambió
    } finally {
        button.disabled = false;
    }
});

init();
