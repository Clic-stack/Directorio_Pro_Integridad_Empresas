let allCompaniesRaw = [];
let allCompanies = [];
let filteredCompanies = [];
let currentPage = 1;
let totalPages = 1;

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

// SOLICITUD DE DATOS A LA API CON JSON SERVER PARA OBTENER LA LISTA DE EMPRESAS
async function getCompany() {
    const response = await fetch('http://localhost:3000/empresas');
    const companies = await response.json();
    console.log(companies);

    allCompaniesRaw = companies;

    const companiesAccredited = companies.filter(company => company.estatus !== "Desacreditada");

    allCompanies = companiesAccredited;
    filteredCompanies = allCompanies;
    totalPages = Math.ceil(filteredCompanies.length / 8);
    getPage(1);
    renderPageNumbers(totalPages);
    
    document.getElementById("company-count").textContent = companiesAccredited.length;
    const totalTypes = document.querySelectorAll("#company-category option[value]:not([value=''])").length;
    document.getElementById("subtitle-category-count").textContent = totalTypes;
    document.getElementById("category-company-count").textContent = totalTypes;
    
};

getCompany();

function renderCard(companies) {
    const cardsHTML = companies.map(company => {
        const icon = iconsByCategory[company.rubro] || "🏢";
        return `<div class="company-card" data-id="${company.id}" data-category="${company.rubro}" data-status="${company.estatus}">
        <div class="top-card">
        <span class="icon-card">${icon}</span>
        <span class="badge">${company.estatus}</span>
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
    const start = (pageNumber - 1) * 8;
    const end = start + 8;
    const pageCompanies = filteredCompanies.slice(start, end);
    renderCard(pageCompanies);
}

function renderPageNumbers(pages) {
    let buttonsHTML = [];
    for (let i = 1; i <= pages; i++) {
        const activeClass = i === currentPage ? "active-page" : "";
        buttonsHTML.push(`<button type="button" data-page="${i}" class="${activeClass}">${i}</button>`);
    }
    document.getElementById("page-numbers").innerHTML = buttonsHTML.join("");
}

document.getElementById("btn-category").addEventListener("click", () => {
    const optionList = document.getElementById("option-list");
    optionList.hidden = !optionList.hidden;
});

document.getElementById("option-list").addEventListener("click", (event) => {
    if (event.target.tagName === "BUTTON") {
        const selectedCategory = event.target.dataset.category;
        filteredCompanies = allCompanies.filter(company => company.rubro === selectedCategory);
        totalPages = Math.ceil(filteredCompanies.length / 8);
        currentPage = 1;
        getPage(1);
        renderPageNumbers(totalPages);
        document.getElementById("option-list").hidden = true;
    }
});

document.getElementById("btn-company").addEventListener("click", () => {
    filteredCompanies = allCompanies;
    totalPages = Math.ceil(filteredCompanies.length / 8);
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

    totalPages = Math.ceil(filteredCompanies.length / 8);
    currentPage = 1;
    getPage(1);
    renderPageNumbers(totalPages);

    const errorMessage = document.getElementById("error-message");
    if (filteredCompanies.length === 0) {
        errorMessage.hidden = false;
    } else {
        errorMessage.hidden = true;
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

// ===================== MENÚ DE CONTACTO =====================
 
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
        if (company.contacto.telefono) {
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

// ===================== LOGIN → CARGA → PANEL ADMIN =====================
 
document.getElementById("btn-login").addEventListener("click", () => {
    document.getElementById("login-form").hidden = false;
});
 
document.getElementById("login-form-element").addEventListener("submit", (event) => {
    event.preventDefault();
    const username = document.getElementById("username").value;
 
    document.getElementById("login-form").hidden = true;
    document.getElementById("loading-screen").hidden = false;
 
    setTimeout(() => {
        document.getElementById("loading-screen").hidden = true;
        document.getElementById("admin-username").textContent = username;
        document.getElementById("admin-screen").hidden = false;
    }, 1000);
});
 
document.getElementById("btn-register").addEventListener("click", () => {
    document.getElementById("admin-screen").hidden = true;
    document.getElementById("form-register").hidden = false;
});
 
// ===================== REGISTRAR NUEVA EMPRESA (POST real) =====================
 
document.getElementById("form-register-element").addEventListener("submit", async (event) => {
    event.preventDefault();
 
    const nombre = document.getElementById("company-name").value;
    const rubro = document.getElementById("company-category").value;
    const municipioValue = document.getElementById("company-municipality").value;
    const municipio = municipioValue ? municipioValue : null;
 
    const email1 = document.getElementById("company-email-1").value;
    const email2 = document.getElementById("company-email-2").value;
    const email3 = document.getElementById("company-email-3").value;
    const emails = [email1, email2, email3].filter(email => email !== "");
 
    const telefonoValue = document.getElementById("company-phone").value;
    const telefono = telefonoValue ? telefonoValue : null;
 
    const fechaAcreditacion = document.getElementById("company-accreditation-day").value;
 
    // La fecha de vigencia sí se puede calcular de una vez: 12 meses
    // después de la fecha de acreditación. fecha_renovacion y
    // fecha_cambio_estatus se quedan en null, porque todavía no ha
    // pasado ninguna de esas dos acciones.
    const vigencyDate = new Date(fechaAcreditacion);
    vigencyDate.setFullYear(vigencyDate.getFullYear() + 1);
    const vigencyDateText = vigencyDate.toISOString().split("T")[0];

    const existentsIds = allCompaniesRaw.map(company => Number(company.id)).filter(id => !isNaN(id));
    const nextId = Math.max(...existentsIds) + 1;
 
    const newCompany = {
        id: nextId,
        nombre: nombre,
        rubro: rubro,
        municipio: municipio,
        contacto: {
            emails: emails,
            telefono: telefono
        },
        estatus: "Acreditada",
        fecha_acreditacion: fechaAcreditacion,
        fecha_renovacion: null,
        fecha_vigencia: vigencyDateText,
        fecha_cambio_estatus: null
    };
 
    const response = await fetch("http://localhost:3000/empresas", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(newCompany)
    });
 
    if (response.ok) {
        document.getElementById("form-register-element").reset();
        document.getElementById("form-register").hidden = true;
        await getCompany();
    } else {
        alert("Hubo un problema al registrar la empresa. Intenta de nuevo.");
    }
});