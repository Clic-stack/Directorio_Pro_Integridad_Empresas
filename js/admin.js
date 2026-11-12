const API = "../api";
const PER_PAGE = 20;
const MAX_EMAILS = 5;
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const DAYS_WARN = 30;   // una empresa está "por vencer" cuando le faltan 30 días o menos
const VIG_DAYS = 365;   // vigencia = acreditación + 365 días (el servidor la calcula igual)

let csrf = "";
let empresas = [];
let rubros = [];
let filtered = [];
let page = 1;
let editingId = 0;
let editingEmpresa = null;
let renovarId = 0;
let vista = "todas";    // todas | por_vencer | vencidas | sin_contacto
let resumen = { bajas_vencimiento: 0, renovaciones: 0 };
let bitPage = 1;
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

// Suma días a una fecha "AAAA-MM-DD" (en UTC para que el horario de verano no mueva el día)
function addDays(dateStr, days) {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

// Días que faltan para la vigencia (negativo = ya venció)
function daysLeft(e) {
    return Math.round((Date.parse(`${e.fecha_vigencia}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / 86400000);
}

function plural(n, uno, varios) {
    return `${n} ${n === 1 ? uno : varios}`;
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
    let jsonInvalido = false;
    try { data = await res.json(); } catch { jsonInvalido = true; }
    if (res.status === 401) {
        window.location.replace("login.html");
        throw new Error("Sesión expirada");
    }
    if (jsonInvalido && res.ok) throw new Error("Respuesta no válida del servidor (revisa el log de PHP).");
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
        resumen = data.resumen || resumen;
        fillRubroSelects();
        renderAvisos();
        applyFilters();
    } catch (error) {
        $("tbody").innerHTML = `<tr><td colspan="6" class="alert">${esc(error.message)}</td></tr>`;
    }
}

function fillRubroSelects() {
    const options = rubros.map((r) => `<option value="${r.id}">${esc(r.nombre)}</option>`).join("");
    // Se guarda lo que estaba elegido para devolverlo después de redibujar las opciones
    const rubroForm = $("rubro_id").value;
    const rubroFiltro = $("f-rubro").value;
    $("rubro_id").innerHTML = `<option value="">Selecciona un rubro...</option>${options}`;
    $("f-rubro").innerHTML = `<option value="">Todos los rubros</option>${options}`;
    $("rubro_id").value = rubroForm;
    $("f-rubro").value = rubroFiltro;
}

// ------------------------------------------------------------------ Tabla de empresas
// El estatus no se captura: sale de comparar la vigencia con hoy (el servidor hace lo mismo).
function effectiveStatus(e) {
    return e.fecha_vigencia >= today() ? "Acreditada" : "Desacreditada";
}
const isPorVencer = (e) => effectiveStatus(e) === "Acreditada" && daysLeft(e) <= DAYS_WARN;
const isVencida = (e) => effectiveStatus(e) === "Desacreditada";
const sinContacto = (e) => e.emails.length === 0;

// Cada vista es la misma tabla con un filtro y un botón de acción distinto por fila
const VISTAS = {
    todas: { titulo: "", test: () => true },
    por_vencer: { titulo: `Empresas por vencer (próximos ${DAYS_WARN} días)`, test: isPorVencer, accion: "renovar" },
    vencidas: { titulo: "Empresas dadas de baja por vencimiento", test: isVencida, accion: "renovar" },
    sin_contacto: { titulo: "Empresas sin ningún correo de contacto", test: sinContacto, accion: "edit" },
};

function setVista(nombre) {
    vista = nombre;
    $("f-estatus").value = "";
    $("f-estatus").hidden = nombre !== "todas";
    $("vista-bar").hidden = nombre === "todas";
    $("vista-titulo").textContent = VISTAS[nombre].titulo;
    $("btn-nueva").hidden = !currentUser.isAdmin || nombre !== "todas";
    renderAvisos();
    applyFilters();
}

function renderAvisos() {
    const box = $("avisos");
    if (vista !== "todas") { box.innerHTML = ""; return; }
    const porVencer = empresas.filter(isPorVencer).length;
    const vencidas = empresas.filter(isVencida).length;
    const sinCorreo = empresas.filter(sinContacto).length;
        const avisos = [];
    if (porVencer) {
        avisos.push({ vista: "por_vencer", clase: "aviso-naranja", boton: "Ver empresas",
            texto: `${plural(porVencer, "empresa vence", "empresas vencen")} en los próximos ${DAYS_WARN} días.` });
    }
    if (vencidas) {
        avisos.push({ vista: "vencidas", clase: "aviso-rojo", boton: "Ver empresas",
            texto: `${plural(vencidas, "empresa dada de baja", "empresas dadas de baja")} por vencimiento.` });
    }
    if (sinCorreo) {
        avisos.push({ vista: "sin_contacto", clase: "aviso-amarillo", boton: "Ver empresas",
            texto: `${plural(sinCorreo, "empresa no tiene", "empresas no tienen")} ningún medio de contacto, por lo que no se ${sinCorreo === 1 ? "muestra" : "muestran"} en el directorio público.` });
    }
    if (resumen.renovaciones) {
        avisos.push({ vista: "renovaciones", clase: "aviso-verde", boton: "Ver renovaciones",
            texto: `${plural(resumen.renovaciones, "renovación registrada", "renovaciones registradas")}.` });
    }
    box.innerHTML = avisos.map((a) => `<div class="aviso ${a.clase}">
        <span>${esc(a.texto)}</span>
        <button type="button" class="btn btn-sm" data-vista="${a.vista}">${esc(a.boton)}</button>
    </div>`).join("");
}

function applyFilters() {
    const text = $("f-texto").value.trim().toLowerCase();
    const status = $("f-estatus").value;
    const rubro = $("f-rubro").value;
    const test = VISTAS[vista].test;
    filtered = empresas.filter((e) => {
        if (!test(e)) return false;
        if (rubro && String(e.rubro_id) !== rubro) return false;
        if (status === "PorVencer" && !isPorVencer(e)) return false;
        if (status === "Acreditada" && effectiveStatus(e) !== "Acreditada") return false;
        if (status === "Desacreditada" && effectiveStatus(e) !== "Desacreditada") return false;
        if (!text) return true;
        return e.nombre.toLowerCase().includes(text)
            || (e.municipio || "").toLowerCase().includes(text)
            || e.emails.some((m) => m.toLowerCase().includes(text));
    });
    // En las vistas de vencimiento, lo más urgente va primero
    if (vista === "por_vencer" || vista === "vencidas") {
        filtered.sort((a, b) => a.fecha_vigencia.localeCompare(b.fecha_vigencia));
    }
    page = 1;
    renderTable();
}

function vigenciaCell(e) {
    const dias = daysLeft(e);
    let nota = "";
    if (dias < 0) nota = `venció hace ${plural(-dias, "día", "días")}`;
    else if (dias <= DAYS_WARN) nota = dias === 0 ? "vence hoy" : `faltan ${plural(dias, "día", "días")}`;
    return `${esc(e.fecha_vigencia)}${nota ? `<div class="sub">${esc(nota)}</div>` : ""}`;
}

function rowActions(e) {
    const accion = VISTAS[vista].accion;
    if (accion === "renovar") {
        return '<button type="button" class="btn btn-sm btn-primary" data-action="renovar">Renovar</button>'
            + (vista === "vencidas" && currentUser.isAdmin
                ? '<button type="button" class="btn btn-sm btn-danger" data-action="delete">Eliminar</button>' : "");
    }
    return `<button type="button" class="btn btn-sm" data-action="edit">Editar</button>`
        + (vista === "todas" && currentUser.isAdmin
            ? '<button type="button" class="btn btn-sm btn-danger" data-action="delete">Eliminar</button>' : "");
}

function renderTable() {
    const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
    page = Math.min(page, pages);
    const slice = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

    $("tbody").innerHTML = slice.length ? slice.map((e) => {
        const status = effectiveStatus(e);
        const badge = status === "Acreditada" && isPorVencer(e) ? "PorVencer" : status;
        const label = badge === "PorVencer" ? "Por vencer" : status;
        const logo = e.logo
            ? `<img class="thumb" src="../src/logo/${esc(e.logo)}" alt="" loading="lazy">`
            : `<span class="thumb-empty">🏢</span>`;
        return `<tr data-id="${e.id}">
            <td>${logo}</td>
            <td><strong>${esc(e.nombre)}</strong>${e.municipio ? `<div class="sub">${esc(e.municipio)}</div>` : ""}</td>
            <td class="sub">${esc(e.rubro)}</td>
            <td><span class="badge ${badge}">${esc(label)}</span></td>
            <td class="sub" style="white-space:nowrap">${vigenciaCell(e)}</td>
            <td class="actions">${rowActions(e)}</td>
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
$("avisos").addEventListener("click", (event) => {
    const b = event.target.closest("button[data-vista]");
    if (!b) return;
    if (b.dataset.vista === "renovaciones") {
        $("b-accion").value = "renovar";
        bitPage = 1;
        document.querySelector('.tab[data-tab="bitacora"]').click();
        return;
    }
    setVista(b.dataset.vista);
});
$("vista-volver").addEventListener("click", () => setVista("todas"));

$("tbody").addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const id = Number(button.closest("tr").dataset.id);
    const empresa = empresas.find((e) => e.id === id);
    if (!empresa) return;
    if (button.dataset.action === "edit") openForm(empresa);
    if (button.dataset.action === "renovar") openRenovar(empresa);
    if (button.dataset.action === "delete" && currentUser.isAdmin) await removeEmpresa(empresa);
});

async function removeEmpresa(empresa) {
    if (!confirm(`¿Eliminar "${empresa.nombre}"? Esta acción no se puede deshacer.`)) return;
    try {
        await api(`admin/empresas.php?id=${empresa.id}`, { method: "DELETE" });
        empresas = empresas.filter((e) => e.id !== empresa.id);
        renderAvisos();
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

// Estatus y vigencia se muestran bloqueados: se recalculan al cambiar la fecha de acreditación
function refreshDerived() {
    const acred = $("fecha_acreditacion").value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(acred)) {
        $("fecha_vigencia").value = "";
        return;
    }
    const vigencia = addDays(acred, VIG_DAYS);
    $("fecha_vigencia").value = vigencia;
    $("estatus").value = vigencia >= today() ? "Acreditada" : "Desacreditada";
}
$("fecha_acreditacion").addEventListener("input", refreshDerived);

function openForm(empresa) {
    const form = $("form-empresa");
    editingId = empresa ? empresa.id : 0;
    editingEmpresa = empresa || null;
    $("btn-renovar-form").hidden = !empresa;
    clearErrors();
    form.reset();
    $("dlg-titulo").textContent = empresa ? "Editar empresa" : "Nueva empresa";

    $("emails-list").innerHTML = "";
    const emails = empresa && empresa.emails.length ? empresa.emails : [""];
    emails.forEach((m) => addEmailRow(m));

    if (empresa) {
        $("nombre").value = empresa.nombre;
        $("rubro_id").value = empresa.rubro_id;
        $("municipio").value = empresa.municipio || "";
        $("telefono").value = empresa.telefono || "";
        $("fecha_acreditacion").value = empresa.fecha_acreditacion || "";
    } else {
        $("fecha_acreditacion").value = today();
    }
    // Rubro y fecha de acreditación solo se capturan al crear; después se bloquean
    $("rubro_id").disabled = !!empresa;
    $("fecha_acreditacion").disabled = !!empresa;
    refreshDerived();
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
    const campos = ["nombre", "municipio", "telefono"];
    // Rubro y fecha de acreditación solo se envían al crear (solo el admin crea). Estatus y vigencia nunca se envían: el servidor los calcula.
    if (!editingId) campos.push("rubro_id", "fecha_acreditacion");
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
        renderAvisos();
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

// ------------------------------------------------------------------ Renovar vigencia
function updateRenovarPreview() {
    const fecha = $("fecha_renovacion").value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) { $("ren-preview").textContent = ""; return; }
    const vigencia = addDays(fecha, VIG_DAYS);
    $("ren-preview").textContent = `Nueva vigencia: ${vigencia} (${vigencia >= today() ? "quedará Acreditada" : "seguiría Desacreditada"}).`;
}
$("fecha_renovacion").addEventListener("input", updateRenovarPreview);

function openRenovar(empresa) {
    renovarId = empresa.id;
    const minimo = addDays(empresa.fecha_acreditacion, 1);
    $("ren-nombre").textContent = empresa.nombre;
    $("ren-actual").textContent = `Acreditación actual: ${empresa.fecha_acreditacion} · Vigencia actual: ${empresa.fecha_vigencia}`;
    $("fecha_renovacion").min = minimo;
    $("fecha_renovacion").max = today();
    $("fecha_renovacion").value = today();
    document.querySelector('#form-renovar [data-err="fecha_renovacion"]').textContent = "";
    $("ren-error").hidden = true;
    // Si la empresa se acreditó hoy no hay una fecha posterior válida
    const sinFecha = minimo > today();
    $("ren-guardar").disabled = sinFecha;
    if (sinFecha) {
        $("ren-error").textContent = "Esta empresa se acreditó hoy: aún no hay una fecha posterior para renovar.";
        $("ren-error").hidden = false;
    }
    updateRenovarPreview();
    $("dlg-renovar").showModal();
}

$("btn-renovar-form").addEventListener("click", () => { if (editingEmpresa) openRenovar(editingEmpresa); });
$("ren-cancelar").addEventListener("click", () => $("dlg-renovar").close());

$("form-renovar").addEventListener("submit", async (event) => {
    event.preventDefault();
    $("ren-error").hidden = true;
    const fd = new FormData();
    fd.append("fecha_renovacion", $("fecha_renovacion").value);
    const save = $("ren-guardar");
    save.disabled = true;
    try {
        const data = await api(`admin/empresas.php?id=${renovarId}&action=renovar`, { method: "POST", form: fd });
        const saved = data.empresa;
        $("dlg-renovar").close();
        // Si venía desde el formulario de edición, se deja abierto con los datos nuevos (sin perder lo que se haya escrito)
        if ($("dlg-empresa").open && editingId === saved.id) {
            editingEmpresa = saved;
            $("fecha_acreditacion").value = saved.fecha_acreditacion;
            refreshDerived();
        }
        await loadEmpresas();   // refresca la tabla, los avisos y los contadores
        flash($("msg"), `Vigencia renovada hasta ${saved.fecha_vigencia}.`);
    } catch (error) {
        $("ren-error").textContent = error.message;
        $("ren-error").hidden = false;
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
    ["empresas", "usuarios", "bitacora"].forEach((name) => { $(`tab-${name}`).hidden = tab.dataset.tab !== name; });
    if (tab.dataset.tab === "usuarios") loadUsuarios();
    if (tab.dataset.tab === "bitacora") loadBitacora();
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

// ------------------------------------------------------------------ Bitácora
const ACCIONES = {
    crear: "Alta", editar: "Edición", renovar: "Renovación", eliminar: "Eliminación",
    baja_vencimiento: "Baja por vencimiento", reactivacion: "Reactivación",
    usuario_crear: "Usuario: alta", usuario_rol: "Usuario: cambio de rol",
    usuario_password: "Usuario: cambio de contraseña", usuario_eliminar: "Usuario: baja",
};
const CAMPOS = {
    nombre: "Nombre", rubro: "Rubro", municipio: "Municipio", telefono: "Teléfono", correos: "Correos",
    fecha_acreditacion: "Fecha de acreditación", fecha_vigencia: "Fecha de vigencia", estatus: "Estatus",
    logo: "Logo", vencio_el: "Venció el", vigencia_actual: "Vigencia actual", rol: "Rol", usuario: "Usuario",
};

function fmtValor(v) {
    if (v === null || v === undefined || v === "") return "—";
    return Array.isArray(v) ? (v.length ? v.join(", ") : "—") : String(v);
}

// Renovación: se muestra la acreditación original tal cual, y debajo la fecha de renovación con su vigencia nueva.
// Si la empresa estaba Desacreditada y la renovación la dejó Acreditada, se marca como reactivada.
function detalleRenovacion(cambios) {
    const acred = cambios.fecha_acreditacion || [];
    const vig = cambios.fecha_vigencia || [];
    const est = cambios.estatus;
    const reactivada = est && est[0] === "Desacreditada" && est[1] === "Acreditada";
    return `<ul class="cambios">
        <li>Fecha de acreditación: ${esc(fmtValor(acred[0]))} · Vigencia: ${esc(fmtValor(vig[0]))}</li>
        <li>Fecha de renovación: <b>${esc(fmtValor(acred[1]))}</b> · Vigencia: <b>${esc(fmtValor(vig[1]))}</b></li>
        ${est ? `<li>Estatus: <span class="antes">${esc(fmtValor(est[0]))}</span> → ${esc(fmtValor(est[1]))}${reactivada ? ' <span class="accion reactivacion">Empresa reactivada</span>' : ""}</li>` : ""}
    </ul>`;
}

function detalleCambios(cambios, accion) {
    if (!cambios || !Object.keys(cambios).length) return "";
    if (accion === "renovar" && cambios.fecha_acreditacion && cambios.fecha_vigencia) {
        return detalleRenovacion(cambios);
    }
    return `<ul class="cambios">${Object.entries(cambios).map(([campo, par]) => {
        const [antes, despues] = par;
        const nombre = esc(CAMPOS[campo] || campo);
        if (antes === null || antes === undefined) return `<li>${nombre}: ${esc(fmtValor(despues))}</li>`;
        if (despues === null || despues === undefined) return `<li>${nombre}: <span class="antes">${esc(fmtValor(antes))}</span></li>`;
        return `<li>${nombre}: <span class="antes">${esc(fmtValor(antes))}</span> → ${esc(fmtValor(despues))}</li>`;
    }).join("")}</ul>`;
}

async function loadBitacora() {
    const qs = new URLSearchParams({ pagina: String(bitPage), accion: $("b-accion").value, q: $("b-q").value.trim() });
    try {
        const data = await api(`admin/bitacora.php?${qs}`);
        bitPage = data.pagina;
        $("b-resumen").innerHTML = `Bajas por vencimiento acumuladas: <b>${data.resumen.bajas_vencimiento}</b> · Renovaciones registradas: <b>${data.resumen.renovaciones}</b>`;
        $("b-tbody").innerHTML = data.items.length ? data.items.map((it) => `<tr>
            <td class="sub" style="white-space:nowrap">${esc(it.fecha_hora)}</td>
            <td>${esc(it.usuario)}${it.rol ? `<div class="sub">${esc(it.rol)}</div>` : ""}</td>
            <td><span class="accion ${esc(it.accion)}">${esc(ACCIONES[it.accion] || it.accion)}</span></td>
            <td>${esc(it.empresa_nombre || "—")}</td>
            <td>${detalleCambios(it.cambios, it.accion)}</td>
        </tr>`).join("") : `<tr><td colspan="5" class="sub" style="text-align:center;padding:24px">Sin movimientos</td></tr>`;
        $("b-count").textContent = `${data.total} movimientos`;
        $("b-page-info").textContent = `Página ${data.pagina} de ${data.paginas}`;
        $("b-prev").disabled = data.pagina <= 1;
        $("b-next").disabled = data.pagina >= data.paginas;
    } catch (error) {
        $("b-tbody").innerHTML = `<tr><td colspan="5" class="alert">${esc(error.message)}</td></tr>`;
    }
}

let bitTimer = null;
$("b-q").addEventListener("input", () => {
    clearTimeout(bitTimer);
    bitTimer = setTimeout(() => { bitPage = 1; loadBitacora(); }, 300);
});
$("b-accion").addEventListener("change", () => { bitPage = 1; loadBitacora(); });
$("b-prev").addEventListener("click", () => { bitPage--; loadBitacora(); });
$("b-next").addEventListener("click", () => { bitPage++; loadBitacora(); });

// ------------------------------------------------------------------ Salir
$("btn-logout").addEventListener("click", async () => {
    try { await api("auth.php?action=logout", { method: "POST", json: {} }); } catch { /* ya no hay sesión */ }
    window.location.replace("login.html");
});

init();
