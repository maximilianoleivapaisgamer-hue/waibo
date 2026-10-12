/*
 * Acciones que la IA puede pedir en el canal WhatsApp por QR, escribiendo tokens en
 * su respuesta:
 *   [[enviar:ID]]         manda un recurso de la biblioteca (imagen, video, archivo, link)
 *   [[etiqueta:Nombre]]   pone una etiqueta de WhatsApp Business al chat
 *   [[archivar]]          archiva el chat
 * Los tokens se sacan del texto antes de guardarlo y mandarlo al cliente.
 */

const MAX_RECURSOS_POR_MENSAJE = 2;

function extractActions(text) {
  const actions = [];
  let clean = String(text || '');
  clean = clean.replace(/\[\[\s*enviar\s*:\s*([^\]]+?)\s*\]\]/gi, (_, id) => { actions.push({ type: 'enviar', id: id.trim() }); return ''; });
  clean = clean.replace(/\[\[\s*etiqueta\s*:\s*([^\]]+?)\s*\]\]/gi, (_, name) => { actions.push({ type: 'etiqueta', name: name.trim() }); return ''; });
  clean = clean.replace(/\[\[\s*archivar\s*\]\]/gi, () => { actions.push({ type: 'archivar' }); return ''; });
  clean = clean.replace(/\[\[\s*paso[_ ]hecho\s*\]\]/gi, () => { actions.push({ type: 'paso' }); return ''; });
  clean = clean.replace(/\[\[\s*derivar\s*(?::\s*([^\]]*?))?\s*\]\]/gi, (_, motivo) => { actions.push({ type: 'derivar', name: (motivo || '').trim() }); return ''; });
  clean = clean.replace(/\n{3,}/g, '\n\n').trim();
  // Si la IA deriva al dueño, al cliente no le sale nada.
  if (actions.some((a) => a.type === 'derivar')) clean = '';

  // Máximo 2 recursos por mensaje y sin repetir; la etiqueta y el archivado, una vez cada uno.
  const vistos = new Set();
  const filtradas = [];
  let recursos = 0;
  for (const a of actions) {
    const key = a.type + ':' + (a.id || a.name || '');
    if (vistos.has(key)) continue;
    vistos.add(key);
    if (a.type === 'enviar') {
      if (recursos >= MAX_RECURSOS_POR_MENSAJE) continue;
      recursos++;
    }
    filtradas.push(a);
  }
  // El archivado siempre al final: archivar antes de mandar deja el chat oculto con mensajes nuevos.
  filtradas.sort((a, b) => (a.type === 'archivar') - (b.type === 'archivar'));
  return { clean, actions: filtradas };
}

function buildInstructions({ resources, alreadySent, labels, labelInstructions }) {
  const partes = [];

  if (resources.length) {
    const lista = resources.map((r) => {
      const tipo = { image: 'imagen', video: 'video', document: 'archivo', link: 'link', audio: 'nota de voz grabada por el negocio' }[r.kind] || r.kind;
      const ya = alreadySent.includes(r.id) ? ' [YA ENVIADO en este chat, no lo repitas]' : '';
      return `- ID "${r.id}" (${tipo}) ${r.name}${r.description ? ': ' + r.description : ''}${ya}`;
    }).join('\n');
    partes.push(`RECURSOS QUE PODÉS ENVIAR:
${lista}

Para mandar un recurso, escribí en una línea aparte [[enviar:ID]] con el ID exacto. El sistema lo manda por vos.
- Mandalos solo cuando viene al caso (piden ver algo, precio, cómo funciona). No los tires al primer "hola".
- Como mucho 1 o 2 por mensaje, y nunca uno marcado como [YA ENVIADO].
- Presentalo con una frase corta (ej: "Te paso un video cortito 👇").
- Las notas de voz son audios grabados por el negocio: si una responde justo lo que preguntan, mandala en vez de escribir la explicación larga (ej: "Te mando un audio y te explico 👇").`);
  }

  if (labels.length) {
    partes.push(`ETIQUETAS DE WHATSAPP DISPONIBLES: ${labels.join(', ')}
Para etiquetar el chat escribí [[etiqueta:Nombre]] con el nombre exacto de una etiqueta de la lista. Nunca inventes etiquetas.
${labelInstructions ? 'CUÁNDO USAR CADA ETIQUETA Y CUÁNDO ARCHIVAR:\n' + labelInstructions : 'Etiquetá solo cuando la conversación lo deje claro.'}`);
  } else if (labelInstructions) {
    partes.push(`ETIQUETAS: para etiquetar el chat escribí [[etiqueta:Nombre]] usando solo los nombres de etiqueta que aparecen en estas reglas:
${labelInstructions}`);
  }

  partes.push(`Para archivar el chat escribí [[archivar]]. Hacelo solo cuando la conversación terminó${labelInstructions ? ' o según las reglas de arriba' : ''}. Nunca archives si el cliente todavía espera una respuesta.
Los tokens [[...]] nunca los ve el cliente: el sistema los saca del mensaje.`);

  partes.push(`PASAR AL DUEÑO: si la respuesta no está en tus instrucciones, o el caso es de los que las instrucciones dicen que se frenan o pasan al dueño, NO contestes nada al cliente. Escribí solamente [[derivar:motivo corto]]. El chat pasa a atención humana y se le avisa al dueño. Es mejor que espere unos minutos a que le inventes una respuesta.`);

  return '\n\n' + partes.join('\n\n');
}

// Pasos de venta: la IA solo ve el paso en el que está el chat y el siguiente, así no se
// saltea ni repite. Cuando cumple el paso escribe [[paso_hecho]] y el sistema avanza.
function buildSalesInstructions({ steps, current, resources }) {
  if (!Array.isArray(steps) || !steps.length) return '';
  const nombreRecurso = (id) => resources.find((r) => r.id === id)?.name;
  if (current >= steps.length) {
    return `\n\nPASOS DE VENTA: este cliente ya completó todos los pasos (${steps.map((s) => s.title).join(' → ')}). Seguí la conversación con naturalidad y respondé lo que pregunte.`;
  }
  const paso = steps[current];
  const conRecurso = !!(paso.resource_id && nombreRecurso(paso.resource_id));
  const lineas = [
    `PASOS DE VENTA (${steps.length} en total). El cliente está en el PASO ${current + 1}: "${paso.title}".`,
    paso.instruction ? `Qué hacer en este paso: ${paso.instruction}` : '',
    paso.resource_id && nombreRecurso(paso.resource_id) ? `En este paso se manda el recurso "${nombreRecurso(paso.resource_id)}": el sistema lo envía solo cuando marcás el paso como hecho, no escribas [[enviar]] para él.` : '',
    conRecurso && paso.caption ? `Junto con el recurso el sistema manda este texto, no lo repitas: "${paso.caption}"` : '',
    conRecurso && paso.after_text ? `Después del recurso el sistema manda este mensaje, no lo repitas: "${paso.after_text}"` : '',
    !conRecurso && (paso.caption || paso.after_text) ? `Todavía no hay archivo cargado para este paso: incluí en tu mensaje, adaptado, este texto: "${[paso.caption, paso.after_text].filter(Boolean).join(' ')}". No pongas marcadores como [video] ni digas que falta el archivo.` : '',
    steps[current + 1] ? `Después viene el paso ${current + 2}: "${steps[current + 1].title}". No lo hagas todavía: se hace en tu próxima respuesta.` : 'Es el último paso.',
    `Cuando en esta respuesta cumplas el paso ${current + 1}, escribí [[paso_hecho]] en una línea aparte. Si el cliente pregunta otra cosa, respondele primero; si todavía no corresponde hacer el paso, no lo marques.`
  ];
  return '\n\n' + lineas.filter(Boolean).join('\n');
}

module.exports = { extractActions, buildInstructions, buildSalesInstructions };
