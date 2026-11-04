const API = "../api";
const PER_PAGE = 20;
const MAX_EMAILS = 5;
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

let csrf = "";
let empresas = [];
let rubros = [];
let filtered = [];
let page = 1;
let editingId = 0;
let passUserId = 0;
let previewUrl = null;

// Rol de la sesión actual (por defecto, el más restrictivo)
let currentUser = { usuario: "", isAdmin: false };

const $ = (id) => document.getElementById(id);

function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => (
        { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
}

function today() {
    return new Date().toLocaleDateString("sv-SE");
}

// ------------------------------------------------------------------ API
async function api(path, { method = "GET", json, form } = {}) {
    const headers = {};
    let body;
    if (method !== "GET") headers["X-CSRF-Token"] = csrf;
    if (json !== undefined) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(json);
    } else if (form) {
        body = form;
    }
    const res = await fetch(`${API}/${path}`, { method, headers, body, credentials: "same-origin" });
    let data = {};
    try { data = await res.json(); } catch { /* respuesta sin JSON */ }
    if (res.status === 401) {
        window.location.replace("login.html");
        throw new Error("Sesión expirada");
    }
    if (!res.ok) {
        const error = new Error(data.error || `Error ${res.status}`);
        error.fields = data.errors || {};
        throw error;
    }
    return data;
}

function flash(box, text) {
    box.textContent = text;
    box.hidden = false;
    clearTimeout(box._t);
    box._t = setTimeout(() => { box.hidden = true; }, 4000);
}

// ------------------------------------------------------------------ Inicio
// Muestra u oculta lo exclusivo de admin y habilita o bloquea sus campos.
// Es solo presentación: los permisos reales se validan en el servidor.
function applyRole(isAdmin) {
    document.querySelectorAll(".isAdmin").forEach((el) => { el.hidden = !isAdmin; });
    document.querySelectorAll(".isAdminForm").forEach((el) => { el.disabled = !isAdmin; });
    document.querySelectorAll(".isEditorOnly").forEach((el) => { el.hidden = isAdmin; });
}

async function init() {
    let me;
    try {
        const res = await fetch(`${API}/auth.php`, { credentials: "same-origin" });
        me = await res.json();
    } catch {
        $("tbody").innerHTML =
            `<tr><td colspan="6" class="alert">No se pudo conectar con el servidor.</td></tr>`;
        return;
    }

    if (!me.authenticated) {
        window.location.replace("login.html");
        return;
    }

    csrf = me.csrf;
    currentUser = { usuario: me.usuario, isAdmin: me.is_admin === true };
    $("who").textContent = `${me.usuario} (${currentUser.isAdmin ? "admin" : "editor"})`;
    applyRole(currentUser.isAdmin);

    await loadEmpresas();
}

async function loadEmpresas() {
    try {
        const data = await api("admin/empresas.php");
        empresas = data.empresas;
        rubros = data.rubros;
        fillRubroSelects();
        applyFilters();
    } catch (error) {
        $("tbody").innerHTML = `<tr><td colspan="6" class="alert">${esc(error.message)}</td></tr>`;
    }
}

function fillRubroSelects() {
    const options = rubros.map((r) => `<option value="${r.id}">${esc(r.nombre)}</option>`).join("");
    $("rubro_id").innerHTML = `<option value="">Selecciona un rubro...</option>${options}`;
    $("f-rubro").innerHTML = `<option value="">Todos los rubros</option>${options}`;
}

// ------------------------------------------------------------------ Tabla de empresas
function effectiveStatus(e) {
    if (e.estatus === "Acreditada" && e.fecha_vigencia < today()) return "Vencida";
    return e.estatus;
}

function applyFilters() {
    const text = $("f-texto").value.trim().toLowerCase();
    const status = $("f-estatus").value;
    const rubro = $("f-rubro").value;
    filtered = empresas.filter((e) => {
        if (rubro && String(e.rubro_id) !== rubro) return false;
        if (status && effectiveStatus(e) !== status) return false;
        if (!text) return true;
        return e.nombre.toLowerCase().includes(text)
            || (e.municipio || "").toLowerCase().includes(text)
            || e.emails.some((m) => m.toLowerCase().includes(text));
    });
    page = 1;
    renderTable();
}

function renderTable() {
    const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
    page = Math.min(page, pages);
    const slice = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

    $("tbody").innerHTML = slice.length ? slice.map((e) => {
        const status = effectiveStatus(e);
        const logo = e.logo
            ? `<img class="thumb" src="../src/logo/${esc(e.logo)}" alt="" loading="lazy">`
            : `<span class="thumb-empty">🏢</span>`;
        return `<tr data-id="${e.id}">
            <td>${logo}</td>
            <td><strong>${esc(e.nombre)}</strong>${e.municipio ? `<div class="sub">${esc(e.municipio)}</div>` : ""}</td>
            <td class="sub">${esc(e.rubro)}</td>
            <td><span class="badge ${status.replace(/\s/g, "")}">${esc(status)}</span></td>
            <td class="sub" style="white-space:nowrap">${esc(e.fecha_vigencia)}</td>
            <td class="actions">
                <button type="button" class="btn btn-sm" data-action="edit">Editar</button>
                ${currentUser.isAdmin ? '<button type="button" class="btn btn-sm btn-danger" data-action="delete">Eliminar</button>' : ""}
            </td>
        </tr>`;
    }).join("") : `<tr><td colspan="6" class="sub" style="text-align:center;padding:24px">Sin resultados</td></tr>`;

    $("count").textContent = `${slice.length} de ${filtered.length} empresas`;
    $("page-info").textContent = `Página ${page} de ${pages}`;
    $("prev").disabled = page <= 1;
    $("next").disabled = page >= pages;
}

$("f-texto").addEventListener("input", applyFilters);
$("f-estatus").addEventListener("change", applyFilters);
$("f-rubro").addEventListener("change", applyFilters);
$("prev").addEventListener("click", () => { page--; renderTable(); });
$("next").addEventListener("click", () => { page++; renderTable(); });

$("tbody").addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const id = Number(button.closest("tr").dataset.id);
    const empresa = empresas.find((e) => e.id === id);
    if (!empresa) return;
    if (button.dataset.action === "edit") openForm(empresa);
    if (button.dataset.action === "delete" && currentUser.isAdmin) await removeEmpresa(empresa);
});

async function removeEmpresa(empresa) {
    if (!confirm(`¿Eliminar "${empresa.nombre}"? Esta acción no se puede deshacer.`)) return;
    try {
        await api(`admin/empresas.php?id=${empresa.id}`, { method: "DELETE" });
        empresas = empresas.filter((e) => e.id !== empresa.id);
        applyFilters();
        flash($("msg"), "Empresa eliminada.");
    } catch (error) {
        alert(error.message);
    }
}

// ------------------------------------------------------------------ Formulario de empresa
function addEmailRow(value = "") {
    const list = $("emails-list");
    if (list.children.length >= MAX_EMAILS) return;
    const row = document.createElement("div");
    row.className = "email-row";
    row.innerHTML = `<input type="email" maxlength="150" placeholder="correo@empresa.com" value="${esc(value)}">
        <button type="button" class="btn btn-sm" data-remove-email title="Quitar">✕</button>`;
    list.appendChild(row);
    $("btn-add-email").disabled = list.children.length >= MAX_EMAILS;
}

$("btn-add-email").addEventListener("click", () => addEmailRow());
$("emails-list").addEventListener("click", (event) => {
    if (!event.target.closest("[data-remove-email]")) return;
    const list = $("emails-list");
    event.target.closest(".email-row").remove();
    if (list.children.length === 0) addEmailRow();
    $("btn-add-email").disabled = list.children.length >= MAX_EMAILS;
});

function setPreview(src) {
    const img = $("logo-prev");
    if (src) { img.src = src; img.hidden = false; } else { img.removeAttribute("src"); img.hidden = true; }
}

function clearErrors() {
    $("form-error").hidden = true;
    document.querySelectorAll("#form-empresa [data-err]").forEach((el) => { el.textContent = ""; });
}

function openForm(empresa) {
    const form = $("form-empresa");
    editingId = empresa ? empresa.id : 0;
    clearErrors();
    form.reset();
    $("dlg-titulo").textContent = empresa ? "Editar empresa" : "Nueva empresa";

    $("emails-list").innerHTML = "";
    const emails = empresa && empresa.emails.length ? empresa.emails : [""];
    emails.forEach((m) => addEmailRow(m));

    if (empresa) {
        $("nombre").value = empresa.nombre;
        $("rubro_id").value = empresa.rubro_id;
        $("estatus").value = empresa.estatus;
        $("municipio").value = empresa.municipio || "";
        $("telefono").value = empresa.telefono || "";
        $("fecha_acreditacion").value = empresa.fecha_acreditacion || "";
        $("fecha_vigencia").value = empresa.fecha_vigencia || "";
    } else {
        $("estatus").value = "Acreditada";
        $("fecha_acreditacion").value = today();
    }
    setPreview(empresa && empresa.logo ? `../src/logo/${empresa.logo}` : null);
    $("remove-wrap").hidden = !(empresa && empresa.logo);
    $("dlg-empresa").showModal();
}

$("btn-nueva").addEventListener("click", () => openForm(null));
$("btn-cancelar").addEventListener("click", () => $("dlg-empresa").close());

$("logo").addEventListener("change", () => {
    const file = $("logo").files[0];
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    if (!file) { setPreview(null); return; }
    if (file.size > MAX_LOGO_BYTES) {
        $("logo").value = "";
        document.querySelector('[data-err="logo"]').textContent = "El logo no debe pesar más de 2 MB.";
        return;
    }
    document.querySelector('[data-err="logo"]').textContent = "";
    previewUrl = URL.createObjectURL(file);
    setPreview(previewUrl);
    $("remove_logo").checked = false;
});

$("remove_logo").addEventListener("change", () => {
    if ($("remove_logo").checked) setPreview(null);
});

$("form-empresa").addEventListener("submit", async (event) => {
    event.preventDefault();
    clearErrors();

    const fd = new FormData();
    const campos = ["nombre", "rubro_id", "municipio", "telefono"];
    // Estatus y fechas solo se envían si es admin (el servidor además los ignora para un editor)
    if (currentUser.isAdmin) campos.push("estatus", "fecha_acreditacion", "fecha_vigencia");
    campos.forEach((name) => fd.append(name, $(name).value.trim()));
    document.querySelectorAll("#emails-list input").forEach((input) => {
        if (input.value.trim()) fd.append("emails[]", input.value.trim());
    });
    const file = $("logo").files[0];
    if (file) fd.append("logo", file);
    if ($("remove_logo").checked) fd.append("remove_logo", "1");

    const save = $("btn-guardar");
    save.disabled = true;
    try {
        const data = await api(`admin/empresas.php${editingId ? `?id=${editingId}` : ""}`, { method: "POST", form: fd });
        const saved = data.empresa;
        const index = empresas.findIndex((e) => e.id === saved.id);
        if (index >= 0) empresas[index] = saved; else empresas.push(saved);
        empresas.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
        $("dlg-empresa").close();
        applyFilters();
        flash($("msg"), editingId ? "Empresa actualizada." : "Empresa creada.");
    } catch (error) {
        $("form-error").textContent = error.message;
        $("form-error").hidden = false;
        Object.entries(error.fields || {}).forEach(([field, message]) => {
            const el = document.querySelector(`#form-empresa [data-err="${field}"]`);
            if (el) el.textContent = message;
        });
    } finally {
        save.disabled = false;
    }
});

// ------------------------------------------------------------------ Pestañas
document.querySelector(".tabs").addEventListener("click", (event) => {
    const tab = event.target.closest(".tab");
    if (!tab) return;
    if (tab.dataset.tab === "usuarios" && !currentUser.isAdmin) return;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
    $("tab-empresas").hidden = tab.dataset.tab !== "empresas";
    $("tab-usuarios").hidden = tab.dataset.tab !== "usuarios";
    if (tab.dataset.tab === "usuarios") loadUsuarios();
});

// ------------------------------------------------------------------ Administradores
async function loadUsuarios() {
    try {
        const data = await api("admin/usuarios.php");
        $("u-tbody").innerHTML = data.usuarios.map((u) => `<tr data-id="${u.id}">
            <td><strong>${esc(u.usuario)}</strong>${u.es_actual ? ' <span class="sub">(tú)</span>' : ""}</td>
            <td>${u.es_actual ? esc(u.rol) : `<select data-action="rol" aria-label="Rol de ${esc(u.usuario)}">
                <option value="admin"${u.rol === "admin" ? " selected" : ""}>admin</option>
                <option value="editor"${u.rol === "editor" ? " selected" : ""}>editor</option>
            </select>`}</td>
            <td class="sub">${esc(u.creado_en)}</td>
            <td class="actions">
                <button type="button" class="btn btn-sm" data-action="pass" data-name="${esc(u.usuario)}">Cambiar contraseña</button>
                ${u.es_actual ? "" : '<button type="button" class="btn btn-sm btn-danger" data-action="del">Eliminar</button>'}
            </td></tr>`).join("");
    } catch (error) {
        flash($("u-msg"), error.message);
    }
}

$("u-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
        await api("admin/usuarios.php", {
            method: "POST",
            json: { usuario: $("u-usuario").value.trim(), password: $("u-password").value, rol: $("u-rol").value },
        });
        $("u-form").reset();
        flash($("u-msg"), "Administrador creado.");
        loadUsuarios();
    } catch (error) {
        alert(error.message);
    }
});

$("u-tbody").addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const id = Number(button.closest("tr").dataset.id);
    if (button.dataset.action === "pass") {
        passUserId = id;
        $("pass-titulo").textContent = `Nueva contraseña para ${button.dataset.name}`;
        $("pass-error").hidden = true;
        $("form-pass").reset();
        $("dlg-pass").showModal();
    }
    if (button.dataset.action === "del") {
        if (!confirm("¿Eliminar este administrador?")) return;
        try {
            await api(`admin/usuarios.php?id=${id}`, { method: "DELETE" });
            flash($("u-msg"), "Administrador eliminado.");
            loadUsuarios();
        } catch (error) {
            alert(error.message);
        }
    }
});

// Cambio de rol desde la tabla
$("u-tbody").addEventListener("change", async (event) => {
    const select = event.target.closest('select[data-action="rol"]');
    if (!select) return;
    const id = Number(select.closest("tr").dataset.id);
    try {
        await api(`admin/usuarios.php?id=${id}`, { method: "POST", json: { rol: select.value } });
        flash($("u-msg"), "Rol actualizado.");
    } catch (error) {
        alert(error.message);
    }
    loadUsuarios(); // refleja el valor real guardado (también si hubo error)
});

$("pass-cancelar").addEventListener("click", () => $("dlg-pass").close());
$("form-pass").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
        await api(`admin/usuarios.php?id=${passUserId}`, { method: "POST", json: { password: $("new-pass").value } });
        $("dlg-pass").close();
        flash($("u-msg"), "Contraseña actualizada.");
    } catch (error) {
        $("pass-error").textContent = error.message;
        $("pass-error").hidden = false;
    }
});

// ------------------------------------------------------------------ Salir
$("btn-logout").addEventListener("click", async () => {
    try { await api("auth.php?action=logout", { method: "POST", json: {} }); } catch { /* ya no hay sesión */ }
    window.location.replace("login.html");
});

init();
