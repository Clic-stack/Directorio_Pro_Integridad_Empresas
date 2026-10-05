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

function getToday() {
    return new Date().toLocaleDateString("sv-SE");
}

function getVigencyDate(company) {
    if (company.fecha_vigencia) return company.fecha_vigencia;
    const [year, month, day] = company.fecha_acreditacion.split("-");
    return `${Number(year) + 1}-${month}-${day}`;
}

function getEffectiveStatus(company) {
    if (company.estatus === "En Proceso") return "En Proceso";
    return getVigencyDate(company) < getToday() ? "Desacreditada" : "Acreditada";
}

async function syncStatuses(companies) {
    const outdated = companies.filter(company => company.estatus !== getEffectiveStatus(company));

    for (const company of outdated) {
        const newStatus = getEffectiveStatus(company);
        const changes = {
            estatus: newStatus,
            fecha_vigencia: getVigencyDate(company),
            // Al vencer, el cambio de estatus se fecha el día de la vigencia
            fecha_cambio_estatus: newStatus === "Desacreditada" ? getVigencyDate(company) : getToday()
        };

        const response = await fetch(`https://directorio-pro-integridad-empresas.onrender.com/empresas/${company.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(changes)
        });

        if (response.ok) Object.assign(company, changes);
    }
}

// SOLICITUD DE DATOS A LA API DE JSON SERVER CON RENDER PARA OBTENER LA LISTA DE EMPRESAS
async function getCompany() {
    const response = await fetch(`https://directorio-pro-integridad-empresas.onrender.com/empresas`);
    const companies = await response.json();
    console.log(companies);

    allCompaniesRaw = companies;

    const companiesAccredited = companies.filter(company => getEffectiveStatus(company) !== "Desacreditada");

    allCompanies = companiesAccredited;
    filteredCompanies = allCompanies;
    totalPages = Math.ceil(filteredCompanies.length / 8);
    getPage(1);
    renderPageNumbers(totalPages);
    
    document.getElementById("company-count").textContent = companiesAccredited.length;
    const totalTypes = document.querySelectorAll("#company-category option[value]:not([value=''])").length;
    document.getElementById("subtitle-category-count").textContent = totalTypes;
    document.getElementById("category-company-count").textContent = totalTypes;
    syncStatuses(companies).catch(console.error);
    
};

getCompany();

function renderCard(companies) {
    const cardsHTML = companies.map(company => {
        const icon = iconsByCategory[company.rubro] || "🏢";
        const iconContent = company.logo
            ? `<img src="${company.logo}" alt="" class="icon-card-img">`
            : icon;
        const status = getEffectiveStatus(company);
        return `<div class="company-card" data-id="${company.id}" data-category="${company.rubro}" data-status="${status}">
        <div class="top-card">
        <span class="icon-card">${iconContent}</span>
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
    document.getElementById("login-form-element").reset();
    const errorMessageLogin = document.getElementById("error-message-login");
 
    errorMessageLogin.hidden = true;
    document.getElementById("login-form").hidden = true;
    document.getElementById("loading-screen").hidden = false;
 
    // Validación implementada solo para prototipo, requiere de un backend real para producción (seguridad real nula hasta que se trabaje con backend real).
    const response = await fetch("https://directorio-pro-integridad-empresas.onrender.com/usuarios");
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
    document.getElementById("error-message-register").hidden = true;
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
    const errorMessageRegister = document.getElementById("error-message-register");
    errorMessageRegister.hidden = true;

    const duplicate = allCompaniesRaw.find(
        company => normalizeName(company.nombre) === normalizeName(nombre)
    );

    if (duplicate) {
        errorMessageRegister.textContent = `Ya existe una empresa con ese nombre (ID: ${duplicate.id}, estatus: ${getEffectiveStatus(duplicate)}).`;
        errorMessageRegister.hidden = false;
        return;
    }
 
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
 
    const submitButton = event.submitter;
    submitButton.disabled = true;

    let response;
    try {
        response = await fetch("https://directorio-pro-integridad-empresas.onrender.com/empresas", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(newCompany)
        });
    } finally {
        submitButton.disabled = false;
    }
 
    if (response.ok) {
        document.getElementById("form-register-element").reset();
        document.getElementById("form-register").hidden = true;
        document.getElementById("admin-screen").hidden = false;
        if (getEffectiveStatus(newCompany) === "Desacreditada") {
            showAdminMessage("Empresa registrada, pero su vigencia ya venció: no aparecerá en el directorio.");
        } else {
            showAdminMessage("Empresa registrada correctamente.");
        }
        await getCompany();
    } else {
        alert("Hubo un problema al registrar la empresa. Intenta de nuevo.");
    }
});

// Ignora mayúsculas, acentos, espacios y signos de puntuación
function normalizeName(name) {
    return name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "");
}

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
 
    if (term === "") {
        errorMessage.hidden = false;
        return;
    }

    // Primero busca por ID exacto (sirve para numéricos y alfanuméricos);
    // si no hay coincidencia, busca por nombre
    let company = allCompaniesRaw.find(c => String(c.id) === term);
    if (!company) {
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
    setStatusBadge(document.getElementById("edit-summary-status"), getEffectiveStatus(company));
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

    function setStatusBadge(element, status) {
        element.textContent = status;
        element.classList.toggle("badge-expired", status === "Desacreditada");
    }
 
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
    const vigencyDate = new Date(fechaAcreditacion);
    vigencyDate.setFullYear(vigencyDate.getFullYear() + 1);
    const vigencyDateText = vigencyDate.toISOString().split("T")[0];
 
    const updatedCompany = {
        id: companyBeingEdited.id,
        nombre: nombre,
        rubro: rubro,
        logo: companyBeingEdited.logo,
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
 
    const response = await fetch(`https://directorio-pro-integridad-empresas.onrender.com/empresas/${id}`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(updatedCompany)
    });
 
    if (response.ok) {
        document.getElementById("form-edit").hidden = true;
        companyBeingEdited = null;
        document.getElementById("admin-screen").hidden = false;
        showAdminMessage("Cambios guardados correctamente.");
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
    setStatusBadge(document.getElementById("delete-summary-status"), getEffectiveStatus(company));
    document.getElementById("delete-summary-name").textContent = company.nombre;
    document.getElementById("delete-summary-municipality").textContent =
        company.rubro + (company.municipio ? " · " + company.municipio : "");
 
    document.getElementById("delete-company-id").value = company.id;

    function setStatusBadge(element, status) {
        element.textContent = status;
        element.classList.toggle("badge-expired", status === "Desacreditada");
    }
 
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
 
    const response = await fetch(`https://directorio-pro-integridad-empresas.onrender.com/empresas/${id}`, {
        method: "DELETE"
    });
 
    if (response.ok) {
        document.getElementById("form-delete").hidden = true;
        document.getElementById("admin-screen").hidden = false;
        showAdminMessage("Empresa eliminada correctamente.");
        await getCompany();
    } else {
        alert("Hubo un problema al eliminar la empresa. Intenta de nuevo.");
    }
});

document.getElementById("btn-cancel-delete").addEventListener("click", () => {
    document.getElementById("form-delete").hidden = true;
    document.getElementById("admin-screen").hidden = false;
});

function showAdminMessage(text) {
    const message = document.getElementById("admin-message");
    message.textContent = text;
    message.hidden = false;
    setTimeout(() => { message.hidden = true; }, 4000);
}