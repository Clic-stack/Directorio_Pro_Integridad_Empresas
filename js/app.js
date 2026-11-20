let allCompanies = [];
let filteredCompanies = [];
let currentPage = 1;
let totalPages = 1;
const COMPANIES_PER_PAGE = 8;
    // API propia en PHP: GET api/empresas.php devuelve el arreglo de empresas vigentes
    const API_URL = "api";
    const DATA_URL = `${API_URL}/empresas.php`;

const iconsByCategory = {
    "Construcción, Arquitectura y Obra Civil": "🏗️",
    "Proveedores de la Construcción, Ferretería y Materiales": "🛠️",
    "Industria Electrónica y Manufactura Avanzada": "🏭",
    "Tecnología, Software y Telecomunicaciones": "💻",
    "Salud, Hospitales y Servicios Médicos": "🏥",
    "Industria Farmacéutica, Equipo Médico y Material de Curación": "💊",
    "Transporte, Logística y Almacenamiento": "🚚",
    "Sector Automotriz, Refacciones y Talleres": "🚗",
    "Servicios Jurídicos, Fiscales y Consultoría Empresarial": "⚖️",
    "Seguridad Privada y Gestión de Riesgos": "🛡️",
    "Servicios Inmobiliarios y Administración de Propiedades": "🏘️",
    "Energía, Medio Ambiente y Sustentabilidad": "♻️",
    "Textil, Confección, Calzado y Uniformes": "👕",
    "Educación, Capacitación y Asociaciones Civiles": "🎓",
    "Marketing, Publicidad, Medios y Eventos": "📢",
    "Turismo, Hotelería y Entretenimiento": "🏨",
    "Muebles, Madera e Interiorismo": "🪑",
    "Servicios Financieros y Seguros": "💰",
    "Servicios Generales y Especializados": "🧰",
    "Agroindustria, Alimentos y Bebidas (Incluye Sector Tequilero)": "🌾",
}

const COPY_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>`;
const CHECK_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>`;


// Los datos los captura el admin: se escapan antes de insertarlos como HTML
function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => (
        { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
}

function getToday() {
    return new Date().toLocaleDateString("sv-SE");
}

// Fecha de vigencia: se toma del JSON (fecha_vigencia). Si el registro no la trae,
// se calcula a partir de la fecha_acreditacion del JSON + 365 días.
function getVigencyDate(company) {
    if (company.fecha_vigencia) return company.fecha_vigencia;
    const date = new Date(`${company.fecha_acreditacion}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 365);
    return date.toISOString().split("T")[0];
}

// Si ya pasó la fecha de vigencia, la empresa pasa a Desacreditada y deja de mostrarse
function getEffectiveStatus(company) {
    return getVigencyDate(company) < getToday() ? "Desacreditada" : "Acreditada";
}

// Campos obligatorios: id, nombre, rubro, al menos un email, estatus y fecha_acreditacion.
// La fecha_vigencia también es obligatoria: viene del JSON o se calcula con fecha_acreditacion + 365 días.
// Opcionales: logo, municipio, telefono, fecha_cambio_estatus.
function isValidCompany(company) {
    return Boolean(
        company &&
        company.id &&
        company.nombre &&
        company.rubro &&
        Array.isArray(company.contacto?.emails) &&
        company.contacto.emails.some(email => email && email.trim() !== "") &&
        company.estatus &&
        /^\d{4}-\d{2}-\d{2}$/.test(company.fecha_acreditacion || "")
    );
}

// SOLICITUD DE DATOS A LA API (api/empresas.php) PARA OBTENER LA LISTA DE EMPRESAS
async function getCompany() {
    document.getElementById("company-container").innerHTML =
        `<p class="detail-card">Cargando empresas...</p>`;
    try {
        const response = await fetch(DATA_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const allRecords = data; // la API devuelve directamente el arreglo de empresas

        // Los registros sin los campos obligatorios no se muestran (se avisan en la consola)
        const companies = allRecords.filter(isValidCompany);
        const discarded = allRecords.filter(company => !isValidCompany(company));
        if (discarded.length > 0) {
            console.warn(`${discarded.length} registro(s) omitidos por faltar campos obligatorios:`, discarded);
        }

        allCompanies = companies.filter(company => getEffectiveStatus(company) !== "Desacreditada");
        filteredCompanies = allCompanies;
        totalPages = Math.ceil(filteredCompanies.length / COMPANIES_PER_PAGE);
        getPage(1);
        renderPageNumbers(totalPages);

        document.getElementById("company-count").textContent = allCompanies.length;
        const totalTypes = document.querySelectorAll("#option-list button[data-category]").length;
        document.getElementById("subtitle-category-count").textContent = totalTypes;
        document.getElementById("category-company-count").textContent = totalTypes;
    } catch (error) {
        console.error(`No se pudo cargar ${DATA_URL}`, error);
        document.getElementById("company-container").innerHTML =
            `<p class="error-message">No se pudo cargar el directorio. Intenta de nuevo más tarde.</p>`;
    }
}

getCompany();

function setActiveFilter(mode) {
    document.getElementById("btn-company").classList.toggle("is-active", mode === "all");
    document.getElementById("btn-category").classList.toggle("is-active", mode === "category");
}

setActiveFilter("all");

let errorTimer;
function showError() {
    const message = document.getElementById("error-message");
    message.hidden = false;
    clearTimeout(errorTimer);
    errorTimer = setTimeout(() => { message.hidden = true; }, 4000);
}
function hideError() {
    clearTimeout(errorTimer);
    document.getElementById("error-message").hidden = true;
}

function renderCard(companies) {
    const cardsHTML = companies.map(company => {
        const icon = iconsByCategory[company.rubro] || "🏢";
        const iconClass = company.logo ? "icon-card has-logo" : "icon-card";
        const iconContent = company.logo
            ? `<img src="src/logo/${escapeHTML(company.logo)}" alt="" class="icon-card-img">`
            : icon;
        const status = getEffectiveStatus(company);
        const singleClass = filteredCompanies.length === 1 ? " is-single" : "";
        return `<div class="company-card${singleClass}" data-id="${escapeHTML(company.id)}" data-category="${escapeHTML(company.rubro)}" data-status="${escapeHTML(status)}">
        <div class="top-card">
        <span class="${iconClass}">${iconContent}</span>
        <span class="badge">${escapeHTML(status)}</span>
        <img src="src/logo_distintivo_pro-integridad.png" alt="Distintivo Pro Integridad" class="logo-card">
        </div>
        <p class="name-card">${escapeHTML(company.nombre)}</p>
        <p class="detail-card">${escapeHTML(company.rubro)}${company.municipio ? " · " + escapeHTML(company.municipio) : ""}</p>
        <button type="button" class="btn-contact">✉️ Contactar</button>
        </div>`;
    });
    const cards = cardsHTML.join("");
    document.getElementById("company-container").innerHTML = cards;
}

function getPage(pageNumber) {
    currentPage = pageNumber;
    const start = (pageNumber - 1) * COMPANIES_PER_PAGE;
    const end = start + COMPANIES_PER_PAGE;
    const pageCompanies = filteredCompanies.slice(start, end);
    renderCard(pageCompanies);
}

function getPageItems(current, total, siblings = 1) {
    const pages = new Set([1, total]);
    for (let p = current - siblings; p <= current + siblings; p++) {
        if (p >= 1 && p <= total) pages.add(p);
    }
    // Al inicio o al final, muestra 3 números para que no se vea vacío
    if (current <= 2) { pages.add(2); pages.add(3); }
    if (current >= total - 1) { pages.add(total - 1); pages.add(total - 2); }

    const sorted = [...pages].filter(p => p >= 1 && p <= total).sort((a, b) => a - b);
    const items = [];
    sorted.forEach((p, i) => {
        if (i > 0 && p - sorted[i - 1] > 1) items.push("...");
        items.push(p);
    });
    return items;
}

function renderPageNumbers(pages) {
    const buttonsHTML = getPageItems(currentPage, pages).map(item => {
        if (item === "...") return `<span class="ellipses">…</span>`;
        const activeClass = item === currentPage ? "active-page" : "";
        return `<button type="button" data-page="${item}" class="${activeClass}">${item}</button>`;
    });
    document.getElementById("page-numbers").innerHTML = buttonsHTML.join("");

    document.getElementById("btn-previous-page").disabled = currentPage <= 1;
    document.getElementById("btn-next-page").disabled = currentPage >= pages;
}

document.getElementById("btn-category").addEventListener("click", () => {
    const optionList = document.getElementById("option-list");
    optionList.hidden = !optionList.hidden;
});

document.getElementById("option-list").addEventListener("click", (event) => {
    if (event.target.tagName === "BUTTON") {
        const selectedCategory = event.target.dataset.category;
        filteredCompanies = allCompanies.filter(company => company.rubro === selectedCategory);
        totalPages = Math.ceil(filteredCompanies.length / COMPANIES_PER_PAGE);
        currentPage = 1;
        getPage(1);
        renderPageNumbers(totalPages);
        document.getElementById("option-list").hidden = true;
        setActiveFilter("category");
        hideError();
    }
});

document.getElementById("btn-company").addEventListener("click", () => {
    filteredCompanies = allCompanies;
    totalPages = Math.ceil(filteredCompanies.length / COMPANIES_PER_PAGE);
    getPage(1);
    renderPageNumbers(totalPages);
    setActiveFilter("all");
    hideError();
});

const searchInput = document.getElementById("search-input");
const suggestionsList = document.getElementById("search-suggestions");

function runSearch(searchText) {
    const text = searchText.trim().toLowerCase();
    filteredCompanies = allCompanies.filter(company => {
        const matchName = company.nombre.toLowerCase().includes(text);
        const matchCategory = company.rubro.toLowerCase().includes(text);
        const matchMunicipality = company.municipio ? company.municipio.toLowerCase().includes(text) : false;
        return matchName || matchCategory || matchMunicipality;
    });

    totalPages = Math.ceil(filteredCompanies.length / COMPANIES_PER_PAGE);
    currentPage = 1;
    getPage(1);
    renderPageNumbers(totalPages);
    setActiveFilter(text === "" ? "all" : "search");

    if (filteredCompanies.length === 0) {
        showError();
    } else {
        hideError();
    }

    // Limpia el buscador al terminar y cierra el teclado en celulares
    suggestionsList.innerHTML = "";
    searchInput.value = "";
    searchInput.blur();
}

document.getElementById("search-form").addEventListener("submit", event => {
    event.preventDefault();
    runSearch(searchInput.value);
});

// Sugerencias mientras se escribe (por nombre de empresa)
searchInput.addEventListener("input", () => {
    const text = searchInput.value.trim().toLowerCase();
    if (text.length < 2) {
        suggestionsList.innerHTML = "";
        return;
    }
    const matches = allCompanies
        .filter(company => company.nombre.toLowerCase().includes(text))
        .slice(0, 6);
    suggestionsList.innerHTML = matches.map(company =>
        `<li><button type="button" data-name="${escapeHTML(company.nombre)}">${escapeHTML(company.nombre)}</button></li>`
    ).join("");
});

suggestionsList.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (button) runSearch(button.dataset.name);
});

// Cierra las sugerencias al hacer clic fuera del buscador
document.addEventListener("click", event => {
    if (!event.target.closest("#search-form")) suggestionsList.innerHTML = "";
});

// Navegación por las sugerencias con el teclado (↑ ↓ Esc)
document.getElementById("search-form").addEventListener("keydown", (event) => {
    const buttons = [...suggestionsList.querySelectorAll("button")];
    if (buttons.length === 0) return;
    const index = buttons.indexOf(document.activeElement);

    if (event.key === "ArrowDown") {
        event.preventDefault();
        buttons[index < buttons.length - 1 ? index + 1 : 0].focus();
    } else if (event.key === "ArrowUp") {
        event.preventDefault();
        if (index > 0) {
            buttons[index - 1].focus();
        } else {
            searchInput.focus();
        }
    } else if (event.key === "Escape") {
        suggestionsList.innerHTML = "";
        searchInput.focus();
    }
});

document.getElementById("page-numbers").addEventListener("click", (event) => {
    if (event.target.tagName === "BUTTON") {
        const pageNumber = Number(event.target.dataset.page);   
        getPage(pageNumber);
        renderPageNumbers(totalPages);
    }
});

document.getElementById("btn-previous-page").addEventListener("click", () => {
    if (currentPage > 1) {
        getPage(currentPage - 1);
        renderPageNumbers(totalPages);
    }
})

document.getElementById("btn-next-page").addEventListener("click", () => {
    if (currentPage < totalPages) {
        getPage(currentPage + 1);
        renderPageNumbers(totalPages);
    }
})

// CONTACTO 
document.getElementById("company-container").addEventListener("click", (event) => {
    if (event.target.classList.contains("btn-contact")) {
        const card = event.target.closest(".company-card");
        const companyId = card.dataset.id;
        const company = filteredCompanies.find(c => String(c.id) === companyId);
 
        if (!company) return;
 
        const options = [];
        company.contacto.emails.forEach(email => {
            options.push(`<div class="contact-row">
                <a class="contact-option" href="mailto:${escapeHTML(email)}">✉️ ${escapeHTML(email)}</a>
                <button type="button" class="btn-copy" data-email="${escapeHTML(email)}" title="Copiar correo" aria-label="Copiar correo ${escapeHTML(email)}">${COPY_ICON}</button>
                </div>`);
        });
        if (company.contacto?.telefono) {
            options.push(`<a class="contact-option" href="tel:${escapeHTML(company.contacto.telefono)}">📞 ${escapeHTML(company.contacto.telefono)}</a>`);
        }
 
        document.getElementById("contact-menu-title").textContent = `Contactar a ${company.nombre}`;
        document.getElementById("contact-menu-options").innerHTML = options.join("");
        document.getElementById("contact-menu").hidden = false;
    }
});

document.getElementById("contact-menu-options").addEventListener("click", async (event) => {
    const button = event.target.closest(".btn-copy");
    if (!button) return;

    const email = button.dataset.email;
    try {
        await navigator.clipboard.writeText(email);
    } catch (error) {
        // Respaldo para navegadores o conexiones sin permiso de portapapeles
        const temp = document.createElement("textarea");
        temp.value = email;
        temp.style.position = "fixed";
        temp.style.opacity = "0";
        document.body.appendChild(temp);
        temp.select();
        document.execCommand("copy");
        temp.remove();
    }

    button.innerHTML = CHECK_ICON;
    button.classList.add("copied");
    button.title = "¡Copiado!";
    setTimeout(() => {
        button.innerHTML = COPY_ICON;
        button.classList.remove("copied");
        button.title = "Copiar correo";
    }, 1500);
});
 
document.getElementById("btn-close-contact-menu").addEventListener("click", () => {
    document.getElementById("contact-menu").hidden = true;
});
 
document.getElementById("contact-menu").addEventListener("click", (event) => {
    if (event.target.id === "contact-menu") {
        document.getElementById("contact-menu").hidden = true;
    }
});