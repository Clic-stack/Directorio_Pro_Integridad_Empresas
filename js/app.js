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

// LOGIN DE CARGA Y PANEL ADMIN 
 
document.getElementById("btn-login").addEventListener("click", () => {
    document.getElementById("login-form").hidden = false;
});
 
document.getElementById("login-form-element").addEventListener("submit", async (event) => {
    event.preventDefault();
 
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;
    const errorMessageLogin = document.getElementById("error-message-login");
 
    errorMessageLogin.hidden = true;
    document.getElementById("login-form").hidden = true;
    document.getElementById("loading-screen").hidden = false;
 
    // Esta validación sigue siendo solo para el prototipo: las
    // credenciales viajan visibles en el código del navegador, así
    // que NO es segura para producción. Un backend real validaría
    // esto del lado del servidor, nunca comparando aquí.
    const response = await fetch("http://localhost:3000/usuarios");
    const usuarios = await response.json();
 
    const usuarioValido = usuarios.find(
        usuario => usuario.usuario === username && usuario.contrasena === password
    );
 
    setTimeout(() => {
        document.getElementById("loading-screen").hidden = true;
 
        if (usuarioValido) {
            document.getElementById("admin-username").textContent = username;
            document.getElementById("admin-screen").hidden = false;
        } else {
            document.getElementById("login-form-element").reset();
            errorMessageLogin.hidden = false;
            document.getElementById("login-form").hidden = false;
        }
    }, 1000);
});
 
document.getElementById("btn-register").addEventListener("click", () => {
    document.getElementById("admin-screen").hidden = true;
    document.getElementById("form-register").hidden = false;
});

document.getElementById("btn-logout").addEventListener("click", () => {
    document.getElementById("admin-screen").hidden = true;
    document.getElementById("admin-username").textContent = "";
    document.getElementById("login-form-element").reset();
});

// BOTONES DE CERRAR
 
document.getElementById("btn-close-login").addEventListener("click", () => {
    document.getElementById("login-form").hidden = true;
    document.getElementById("login-form-element").reset();
    document.getElementById("error-message-login").hidden = true;
});
 
// REGISTRAR NUEVA EMPRESA
 
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
 
    // Calculo de fecha_vigencia: un año después de la fecha de acreditación. Lo que permite que el directorio siempre se mantenga actualizado
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

document.getElementById("btn-cancel-register").addEventListener("click", () => {
    document.getElementById("form-register-element").reset();
    document.getElementById("form-register").hidden = true;
    document.getElementById("admin-screen").hidden = false;
});

// EDITAR EMPRESA 
 
let companyBeingEdited = null;
 
document.getElementById("btn-edit").addEventListener("click", () => {
    document.getElementById("admin-screen").hidden = true;
    document.getElementById("form-edit").hidden = false;
    document.getElementById("search-edit-company").hidden = false;
    document.getElementById("edit-company-form").hidden = true;
    document.getElementById("search-edit-input").value = "";
    document.getElementById("error-message-edit").hidden = true;
});

document.getElementById("btn-close-search-edit").addEventListener("click", () => {
    document.getElementById("form-edit").hidden = true;
    document.getElementById("admin-screen").hidden = false;
});
 
function runEditSearch() {
    const term = document.getElementById("search-edit-input").value.trim();
    const errorMessage = document.getElementById("error-message-edit");
 
    let company;
    if (!isNaN(Number(term)) && term !== "") {
        company = allCompaniesRaw.find(c => String(c.id) === term);
    } else {
        const termLower = term.toLowerCase();
        company = allCompaniesRaw.find(c => c.nombre.toLowerCase().includes(termLower));
    }
 
    if (!company) {
        errorMessage.hidden = false;
        return;
    }
    errorMessage.hidden = true;
 
    companyBeingEdited = company;
 
    // Llena la tarjeta de resumen (solo lectura)
    const icon = iconsByCategory[company.rubro] || "🏢";
    document.getElementById("edit-summary-icon").textContent = icon;
    document.getElementById("edit-summary-status").textContent = company.estatus;
    document.getElementById("edit-summary-name").textContent = company.nombre;
    document.getElementById("edit-summary-municipality").textContent =
        company.rubro + (company.municipio ? " · " + company.municipio : "");
    document.getElementById("edit-summary-id").textContent = `ID: ${company.id}`;
    document.getElementById("edit-summary-validity").textContent =
        company.fecha_vigencia ? `Vigencia: ${company.fecha_vigencia}` : "";
    document.getElementById("edit-summary-change-status").textContent =
        company.fecha_cambio_estatus ? `Últ. cambio: ${company.fecha_cambio_estatus}` : "";
 
    // Llena el campo oculto con el id real de la empresa
    document.getElementById("edit-company-id").value = company.id;
 
    // Llena el formulario editable con los datos actuales
    document.getElementById("edit-company-name").value = company.nombre;
    document.getElementById("edit-company-category").value = company.rubro;
    document.getElementById("edit-company-municipality").value = company.municipio || "";
    document.getElementById("edit-company-email-1").value = company.contacto.emails[0] || "";
    document.getElementById("edit-company-email-2").value = company.contacto.emails[1] || "";
    document.getElementById("edit-company-email-3").value = company.contacto.emails[2] || "";
    document.getElementById("edit-company-phone").value = company.contacto.telefono || "";
    document.getElementById("edit-company-accreditation-day").value = company.fecha_acreditacion;
 
    document.getElementById("search-edit-company").hidden = true;
    document.getElementById("edit-company-form").hidden = false;
}
 
document.getElementById("btn-search-edit").addEventListener("click", runEditSearch);
 
document.getElementById("search-edit-form").addEventListener("submit", (event) => {
    event.preventDefault();
    runEditSearch();
});
 
document.getElementById("edit-company-form-element").addEventListener("submit", async (event) => {
    event.preventDefault();
 
    const id = document.getElementById("edit-company-id").value;
 
    const nombre = document.getElementById("edit-company-name").value;
    const rubro = document.getElementById("edit-company-category").value;
    const municipioValue = document.getElementById("edit-company-municipality").value;
    const municipio = municipioValue ? municipioValue : null;
 
    const email1 = document.getElementById("edit-company-email-1").value;
    const email2 = document.getElementById("edit-company-email-2").value;
    const email3 = document.getElementById("edit-company-email-3").value;
    const emails = [email1, email2, email3].filter(email => email !== "");
 
    const telefonoValue = document.getElementById("edit-company-phone").value;
    const telefono = telefonoValue ? telefonoValue : null;
 
    const fechaAcreditacion = document.getElementById("edit-company-accreditation-day").value;
 
    // Recalculamos fecha_vigencia por si la fecha de acreditación cambió.
    // estatus, fecha_renovacion y fecha_cambio_estatus NO se tocan aquí,
    // se conservan tal cual venían — no son campos editables en este formulario.
    const vigencyDate = new Date(fechaAcreditacion);
    vigencyDate.setFullYear(vigencyDate.getFullYear() + 1);
    const vigencyDateText = vigencyDate.toISOString().split("T")[0];
 
    const updatedCompany = {
        id: companyBeingEdited.id,
        nombre: nombre,
        rubro: rubro,
        municipio: municipio,
        contacto: {
            emails: emails,
            telefono: telefono
        },
        estatus: companyBeingEdited.estatus,
        fecha_acreditacion: fechaAcreditacion,
        fecha_renovacion: companyBeingEdited.fecha_renovacion,
        fecha_vigencia: vigencyDateText,
        fecha_cambio_estatus: companyBeingEdited.fecha_cambio_estatus
    };
 
    const response = await fetch(`http://localhost:3000/empresas/${id}`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(updatedCompany)
    });
 
    if (response.ok) {
        document.getElementById("form-edit").hidden = true;
        companyBeingEdited = null;
        await getCompany();
    } else {
        alert("Hubo un problema al guardar los cambios. Intenta de nuevo.");
    }
});

document.getElementById("btn-cancel-edit").addEventListener("click", () => {
    document.getElementById("form-edit").hidden = true;
    companyBeingEdited = null;
    document.getElementById("admin-screen").hidden = false;
});
 
// ELIMINAR EMPRESA 
 
document.getElementById("btn-delete").addEventListener("click", () => {
    document.getElementById("admin-screen").hidden = true;
    document.getElementById("form-delete").hidden = false;
    document.getElementById("search-delete-company").hidden = false;
    document.getElementById("delete-company-form").hidden = true;
    document.getElementById("search-delete-input").value = "";
    document.getElementById("error-message-delete").hidden = true;
});

document.getElementById("btn-close-search-delete").addEventListener("click", () => {
    document.getElementById("form-delete").hidden = true;
    document.getElementById("admin-screen").hidden = false;
});
 
function runDeleteSearch() {
    const term = document.getElementById("search-delete-input").value.trim();
    const errorMessage = document.getElementById("error-message-delete");
 
    const company = allCompaniesRaw.find(c => String(c.id) === term);
 
    if (!company) {
        errorMessage.hidden = false;
        return;
    }
    errorMessage.hidden = true;
 
    const icon = iconsByCategory[company.rubro] || "🏢";
    document.getElementById("delete-summary-icon").textContent = icon;
    document.getElementById("delete-summary-status").textContent = company.estatus;
    document.getElementById("delete-summary-name").textContent = company.nombre;
    document.getElementById("delete-summary-municipality").textContent =
        company.rubro + (company.municipio ? " · " + company.municipio : "");
 
    document.getElementById("delete-company-id").value = company.id;
 
    document.getElementById("search-delete-company").hidden = true;
    document.getElementById("delete-company-form").hidden = false;
}
 
document.getElementById("btn-search-delete").addEventListener("click", runDeleteSearch);
 
document.getElementById("search-delete-form").addEventListener("submit", (event) => {
    event.preventDefault();
    runDeleteSearch();
});
 
document.getElementById("delete-company-form-element").addEventListener("submit", async (event) => {
    event.preventDefault();
 
    const id = document.getElementById("delete-company-id").value;
 
    const response = await fetch(`http://localhost:3000/empresas/${id}`, {
        method: "DELETE"
    });
 
    if (response.ok) {
        document.getElementById("form-delete").hidden = true;
        await getCompany();
    } else {
        alert("Hubo un problema al eliminar la empresa. Intenta de nuevo.");
    }
});

document.getElementById("btn-cancel-delete").addEventListener("click", () => {
    document.getElementById("form-delete").hidden = true;
    document.getElementById("admin-screen").hidden = false;
});