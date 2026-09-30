// SOLICITUD DE DATOS A LA API CON JSON SERVER PARA OBTENER LA LISTA DE EMPRESAS
async function getCompany() {
    const response = await fetch('http://localhost:3000/empresas');
    const companies = await response.json();
    console.log(companies);
    const companiesAccredited = companies.filter(company => company.status || company.estatus !== "Desacreditada");
    const cardsHTML = companiesAccredited.map(company => {
        const icon = iconsByCategory[company.category] || "🏢";
        return `<div class="company-card" data-id="${company.id}" data-category="${company.category}" data-status="${company.status}"> <div class="top-card"> <span class="icon-card">${icono}</span> <span class="badge">${company.status}</span> <img src="src/logo_distintivo_pro-integridad.png" alt="Distintivo Pro Integridad" class="logo-card"> </div> <p class="name-card">${company.name}</p> <p class="detail-card">${company.category}${company.municipality ? " · " + company.municipality : ""}</p> <button type="button" class="btn-contact">✉️ Contactar</button> </div>`;
    });
};

getCompany();

const iconsByCategory = {
    "Construcción, Arquitectura y Obra Civil": "🏗️",
    "Tecnología, Software y Telecomunicaciones": "💻",
    "Salud, Hospitales y Servicios Médicos": "🏥",
    "Transporte, Logística y Almacenamiento": "🚚",
    "Proveedores de la Construcción, Ferretería y Materiales": "🛠️",
    "Servicios Jurídicos, Fiscales y Consultoría Empresarial": "⚖️",
    "Agroindustria, Alimentos y Bebidas (Incluye Sector Tequilero)": "🌾",
    "Seguridad Privada y Gestión de Riesgos": "🛡️",
    "Textil, Confección, Calzado y Uniformes": "👕",
    "Servicios Inmobiliarios y Administración de Propiedades": "🏢",
}