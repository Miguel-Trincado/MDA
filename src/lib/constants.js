export const EJECUTIVOS = [
  "Diana Monsalve", "Isabel Ormazabal", "Jessica Jorquera", "Claudio Leiva", "Soledad Gómez",
  "Camila Finschi", "Jorge Díaz", "Monica Cid", "Pamela Lineros",
  "Sandra Soto", "Macarena Bustamante", "Mónica Herrera", "Karen Castillo", "Miguel Trincado",
];

export const ESTADOS = ["Activo", "En espera", "Promesado", "Perdido"];
export const NIVELES_INTERES = ["Alto", "Medio", "Bajo"];
export const ETAPAS = [
  "Cotizado", "Negociación", "Preaprobación bancaria", "Pre-reservado", "Reservado", "Promesado",
];
export const EVAL_BANCARIA = [
  "No iniciada", "Enviado a evaluar", "En evaluación", "Pendiente de antecedentes",
  "Preaprobado", "Rechazado", "Contado",
];
export const ACCIONES = [
  "Llamada", "WhatsApp", "Correo", "Videollamada", "Reunión presencial", "Visita a proyecto",
  "Envío de cotización/propuesta", "Envío de simulación", "Solicitud de documentos",
  "Recepción/revisión de documentos",
];
export const RESPUESTAS = [
  "No contesta", "Pendiente de respuesta", "Solicita información", "Solicita tiempo para evaluar",
  "Contactar más adelante", "Acepta avanzar", "No interesado", "Solicita nueva cotización",
  "Solicita simulación", "Quiere agendar visita/reunión", "Interesado en avanzar",
  "Datos de contacto incorrectos",
];
export const OBJECIONES = [
  "Precio", "Pie", "Monto de la cuota", "Financiamiento / crédito hipotecario",
  "Renta insuficiente", "Sobrecarga financiera", "Plazo de entrega", "Ubicación",
  "Distribución / tipología", "Orientación / vista", "Disponibilidad de unidad",
  "Necesita vender otra propiedad", "Decisión familiar / tercero",
  "Está comparando otros proyectos", "No tiene urgencia de compra", "Sin objeción actual", "Otra",
];
export const PROXIMAS_ACCIONES = [
  "Llamar", "Enviar WhatsApp", "Enviar correo", "Enviar información", "Enviar nueva cotización",
  "Enviar simulación", "Solicitar documentos", "Revisar documentos", "Enviar a evaluación bancaria",
  "Hacer seguimiento evaluación bancaria", "Agendar videollamada", "Agendar reunión",
  "Agendar visita", "Hacer seguimiento", "Contactar en fecha acordada", "Gestionar pre-reserva",
  "Gestionar reserva",
];
export const MOTIVOS_PERDIDA = [
  "No califica para crédito", "Renta insuficiente", "Sobrecarga financiera", "No cuenta con pie",
  "Precio", "Cuota mensual", "Desistió de comprar", "Compró en otro proyecto",
  "Prefiere otra ubicación", "No le gustó el proyecto", "No encontró unidad/tipología adecuada",
  "Plazo de entrega", "No responde después de múltiples intentos", "Datos de contacto incorrectos",
  "Postergó decisión de compra", "Otro",
];

export const ALERT_PRIORITY = {
  "CAMBIO DE EJECUTIVO": 1,
  "CAMBIO DE ESTADO OPP": 2,
  "NUEVO - COMPLETAR GESTIÓN": 3,
  "NUEVA COTIZACIÓN": 4,
  "ACCIÓN VENCIDA": 5,
  "COMPLETAR MOTIVO DE PÉRDIDA": 6,
  "REVISAR ETAPA": 7,
  "COMPLETAR PRÓXIMA ACCIÓN": 8,
  "SIN REVISAR HOY": 9,
  "": 10,
};

export const ALERT_STYLE = {
  "CAMBIO DE EJECUTIVO": "bg-violet-100 text-violet-900 border-violet-300",
  "CAMBIO DE ESTADO OPP": "bg-indigo-100 text-indigo-900 border-indigo-300",
  "COMPLETAR MOTIVO DE PÉRDIDA": "bg-rose-100 text-rose-900 border-rose-300",
  "REVISAR ETAPA": "bg-rose-100 text-rose-900 border-rose-300",
  "ACCIÓN VENCIDA": "bg-rose-100 text-rose-900 border-rose-300",
  "NUEVO - COMPLETAR GESTIÓN": "bg-amber-100 text-amber-900 border-amber-300",
  "NUEVA COTIZACIÓN": "bg-amber-100 text-amber-900 border-amber-300",
  "COMPLETAR PRÓXIMA ACCIÓN": "bg-sky-100 text-sky-900 border-sky-300",
  "SIN REVISAR HOY": "bg-stone-200 text-stone-700 border-stone-300",
  "": "bg-emerald-50 text-emerald-800 border-emerald-200",
};

export const PROYECTO_OBJETIVO = "PILPILEN";

export const MESES_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
export const MESES_ES_LARGO = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
  "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export const DONUT_COLORS = ["#2563EB", "#7C3AED", "#EC4899", "#14B8A6", "#F59E0B", "#F97316", "#84CC16", "#94A3B8"];
export const LINE_COLOR = "#2563EB";
