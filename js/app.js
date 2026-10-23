let allCompanies = [];
let filteredCompanies = [];
let currentPage = 1;
let totalPages = 1;
const COMPANIES_PER_PAGE = 8;
// API en Render (json-server): GET /empresas devuelve el arreglo de empresas
const API_URL = "https://directorio-pro-integridad-empresas.onrender.com";
const DATA_URL = `${API_URL}/empresas`;

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
    if (company.estatus === "En Proceso") return "En Proceso";
    return getVigencyDate(company) < getToday() ? "Desacreditada" : "Acreditada";
}

// Campos obligatorios: id, nombre, rubro, al menos un email, estatus y fecha_acreditacion.
// La fecha_vigencia también es obligatoria: viene del JSON o se calcula con fecha_acreditacion + 365 días.
// Opcionales: logo, municipio, telefono, fecha_renovacion, fecha_cambio_estatus.
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

// SOLICITUD DE DATOS A LA API DE RENDER PARA OBTENER LA LISTA DE EMPRESAS
async function getCompany() {
    // El plan gratuito de Render "duerme" el servidor: la primera consulta puede tardar cerca de 1 minuto
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

function renderCard(companies) {
    const cardsHTML = companies.map(company => {
        const icon = iconsByCategory[company.rubro] || "🏢";
        const iconClass = company.logo ? "icon-card has-logo" : "icon-card";
        const iconContent = company.logo
            ? `<img src="${company.logo}" alt="" class="icon-card-img">`
            : icon;
        const status = getEffectiveStatus(company);
        return `<div class="company-card" data-id="${company.id}" data-category="${company.rubro}" data-status="${status}">
        <div class="top-card">
        <span class="${iconClass}">${iconContent}</span>
        <span class="badge">${status}</span>
        <img src="src/logo_distintivo_pro-integridad.png" alt="Distintivo Pro Integridad" class="logo-card">
        </div>
        <p class="name-card">${company.nombre}</p>
        <p class="detail-card">${company.rubro}${company.municipio ? " · " + company.municipio : ""}</p>
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
    }
});

document.getElementById("btn-company").addEventListener("click", () => {
    filteredCompanies = allCompanies;
    totalPages = Math.ceil(filteredCompanies.length / COMPANIES_PER_PAGE);
    getPage(1);
    renderPageNumbers(totalPages);
});

document.getElementById("search-form").addEventListener("submit", event => {
    event.preventDefault();
    const searchText = document.getElementById("search-input").value;
    const text = searchText.toLowerCase();
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

    const errorMessage = document.getElementById("error-message");
    if (filteredCompanies.length === 0) {
        errorMessage.hidden = false;
    } else {
        errorMessage.hidden = true;
    }

    // Limpia el buscador al terminar y cierra el teclado en celulares
    const searchInput = document.getElementById("search-input");
    searchInput.value = "";
    searchInput.blur();
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
            options.push(`<a class="contact-option" href="mailto:${email}">✉️ ${email}</a>`);
        });
        if (company.contacto?.telefono) {
            options.push(`<a class="contact-option" href="tel:${company.contacto.telefono}">📞 ${company.contacto.telefono}</a>`);
        }
 
        document.getElementById("contact-menu-title").textContent = `Contactar a ${company.nombre}`;
        document.getElementById("contact-menu-options").innerHTML = options.join("");
        document.getElementById("contact-menu").hidden = false;
    }
});
 
document.getElementById("btn-close-contact-menu").addEventListener("click", () => {
    document.getElementById("contact-menu").hidden = true;
});
 
document.getElementById("contact-menu").addEventListener("click", (event) => {
    if (event.target.id === "contact-menu") {
        document.getElementById("contact-menu").hidden = true;
    }
});