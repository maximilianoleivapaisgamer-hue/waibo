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
  clean = clean.replace(/\n{3,}/g, '\n\n').trim();

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
      const tipo = { image: 'imagen', video: 'video', document: 'archivo', link: 'link' }[r.kind] || r.kind;
      const ya = alreadySent.includes(r.id) ? ' [YA ENVIADO en este chat, no lo repitas]' : '';
      return `- ID "${r.id}" (${tipo}) ${r.name}${r.description ? ': ' + r.description : ''}${ya}`;
    }).join('\n');
    partes.push(`RECURSOS QUE PODÉS ENVIAR:
${lista}

Para mandar un recurso, escribí en una línea aparte [[enviar:ID]] con el ID exacto. El sistema lo manda por vos.
- Mandalos solo cuando viene al caso (piden ver algo, precio, cómo funciona). No los tires al primer "hola".
- Como mucho 1 o 2 por mensaje, y nunca uno marcado como [YA ENVIADO].
- Presentalo con una frase corta (ej: "Te paso un video cortito 👇").`);
  }

  if (labels.length) {
    partes.push(`ETIQUETAS DE WHATSAPP DISPONIBLES: ${labels.join(', ')}
Para etiquetar el chat escribí [[etiqueta:Nombre]] con el nombre exacto de una etiqueta de la lista. Nunca inventes etiquetas.
${labelInstructions ? 'CUÁNDO USAR CADA ETIQUETA Y CUÁNDO ARCHIVAR:\n' + labelInstructions : 'Etiquetá solo cuando la conversación lo deje claro.'}`);
  }

  partes.push(`Para archivar el chat escribí [[archivar]]. Hacelo solo cuando la conversación terminó${labelInstructions ? ' o según las reglas de arriba' : ''}. Nunca archives si el cliente todavía espera una respuesta.
Los tokens [[...]] nunca los ve el cliente: el sistema los saca del mensaje.`);

  return '\n\n' + partes.join('\n\n');
}

module.exports = { extractActions, buildInstructions };
