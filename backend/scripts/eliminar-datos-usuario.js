/**
 * Script de eliminación de datos de usuario — Derecho al Olvido (Ley 25.326)
 *
 * Uso:
 *   node scripts/eliminar-datos-usuario.js +5411XXXXXXXX
 *   node scripts/eliminar-datos-usuario.js 5411XXXXXXXX
 *
 * Qué hace (enfoque híbrido):
 *   DELETE real  → messages, appointments, orders, contact_variables, scheduled_followups
 *   Anonimizar   → conversations (phone/name → "ELIMINADO"), logs de Instagram/Facebook/ML
 */

require('dotenv').config();
const pool = require('../db');
const fs = require('fs');
const path = require('path');

const phoneRaw = process.argv[2];

if (!phoneRaw) {
  console.error('❌ Uso: node scripts/eliminar-datos-usuario.js +5411XXXXXXXX');
  process.exit(1);
}

// Normalizar: sacar +, espacios, guiones — dejar solo dígitos
const phoneNorm = phoneRaw.replace(/[^0-9]/g, '');

// Buscar también con y sin código de país para mayor cobertura
const phoneVariants = [
  phoneNorm,
  `+${phoneNorm}`,
  phoneRaw.trim(),
];

// Si empieza con 54 (Argentina), agregar también la versión sin 54
if (phoneNorm.startsWith('54') && phoneNorm.length > 10) {
  phoneVariants.push(phoneNorm.slice(2));
}

const timestamp = new Date().toISOString();
const log = [];

function logLine(msg) {
  console.log(msg);
  log.push(`[${new Date().toISOString()}] ${msg}`);
}

async function run() {
  const client = await pool.connect();

  try {
    logLine('='.repeat(60));
    logLine(`SOLICITUD DE ELIMINACIÓN DE DATOS — ${timestamp}`);
    logLine(`Teléfono solicitado : ${phoneRaw}`);
    logLine(`Variantes buscadas  : ${phoneVariants.join(', ')}`);
    logLine('='.repeat(60));

    await client.query('BEGIN');

    // ── 1. Buscar conversaciones afectadas ──────────────────────────
    const convResult = await client.query(
      `SELECT id, client_id, customer_phone, customer_name, channel, created_at
       FROM conversations
       WHERE customer_phone = ANY($1::text[])`,
      [phoneVariants]
    );
    const convIds = convResult.rows.map(r => r.id);
    logLine(`\nConversaciones encontradas: ${convResult.rows.length}`);
    convResult.rows.forEach(r =>
      logLine(`  → [${r.channel}] cliente_id=${r.client_id} | phone=${r.customer_phone} | name=${r.customer_name} | fecha=${r.created_at}`)
    );

    // ── 2. DELETE messages ──────────────────────────────────────────
    let deletedMessages = 0;
    if (convIds.length) {
      const msgResult = await client.query(
        `DELETE FROM messages WHERE conversation_id = ANY($1::uuid[])`,
        [convIds]
      );
      deletedMessages = msgResult.rowCount;
    }
    logLine(`\nMensajes eliminados (DELETE): ${deletedMessages}`);

    // ── 3. DELETE scheduled_followups ──────────────────────────────
    const fuConvResult = convIds.length
      ? await client.query(
          `DELETE FROM scheduled_followups WHERE conversation_id = ANY($1::uuid[]) RETURNING id`,
          [convIds]
        )
      : { rowCount: 0 };
    const fuPhoneResult = await client.query(
      `DELETE FROM scheduled_followups WHERE customer_phone = ANY($1::text[]) RETURNING id`,
      [phoneVariants]
    );
    const deletedFollowups = fuConvResult.rowCount + fuPhoneResult.rowCount;
    logLine(`Seguimientos eliminados (DELETE): ${deletedFollowups}`);

    // ── 4. Anonimizar conversations ─────────────────────────────────
    let anonConv = 0;
    if (convIds.length) {
      const anonResult = await client.query(
        `UPDATE conversations
         SET customer_phone = 'ELIMINADO', customer_name = 'ELIMINADO'
         WHERE id = ANY($1::uuid[])`,
        [convIds]
      );
      anonConv = anonResult.rowCount;
    }
    logLine(`Conversaciones anonimizadas: ${anonConv}`);

    // ── 5. DELETE appointments ──────────────────────────────────────
    const apptResult = await client.query(
      `DELETE FROM appointments WHERE customer_phone = ANY($1::text[]) RETURNING id, service_name, start_time`,
      [phoneVariants]
    );
    logLine(`\nTurnos eliminados (DELETE): ${apptResult.rowCount}`);
    apptResult.rows.forEach(r =>
      logLine(`  → ${r.service_name} | ${r.start_time}`)
    );

    // ── 6. DELETE orders ────────────────────────────────────────────
    const ordResult = await client.query(
      `DELETE FROM orders WHERE customer_phone = ANY($1::text[]) RETURNING id, total, status, created_at`,
      [phoneVariants]
    );
    logLine(`\nPedidos eliminados (DELETE): ${ordResult.rowCount}`);
    ordResult.rows.forEach(r =>
      logLine(`  → orden_id=${r.id} | $${r.total} | ${r.status} | ${r.created_at}`)
    );

    // ── 7. DELETE contact_variables ─────────────────────────────────
    const cvResult = await client.query(
      `DELETE FROM contact_variables WHERE customer_phone = ANY($1::text[]) RETURNING field_name, field_value`,
      [phoneVariants]
    );
    logLine(`\nVariables de contacto eliminadas (DELETE): ${cvResult.rowCount}`);
    cvResult.rows.forEach(r =>
      logLine(`  → ${r.field_name}: ${r.field_value}`)
    );

    // ── 8. Anonimizar logs (sin teléfono directo, solo por convId) ──
    // instagram_comments_log — no tiene phone, no hay forma de vincular sin convId
    // facebook_comments_log — ídem
    // mercadolibre_log — tiene buyer_name, no phone
    // Anonimizamos por coincidencia si hay algún campo útil

    // ML log — anonimizar buyer_name si coincide con algún nombre encontrado
    const namesFound = [...new Set(convResult.rows.map(r => r.customer_name).filter(Boolean))];
    let anonML = 0;
    if (namesFound.length) {
      const mlResult = await client.query(
        `UPDATE mercadolibre_log SET buyer_name = 'ELIMINADO'
         WHERE buyer_name = ANY($1::text[])`,
        [namesFound]
      );
      anonML = mlResult.rowCount;
    }
    logLine(`\nRegistros ML anonimizados: ${anonML}`);

    // Alertas vinculadas a las conversaciones
    let deletedAlerts = 0;
    if (convIds.length) {
      const alertResult = await client.query(
        `DELETE FROM alerts WHERE conversation_id = ANY($1::uuid[])`,
        [convIds]
      );
      deletedAlerts = alertResult.rowCount;
    }
    logLine(`Alertas eliminadas: ${deletedAlerts}`);

    await client.query('COMMIT');

    logLine('\n' + '='.repeat(60));
    logLine('✅ ELIMINACIÓN COMPLETADA EXITOSAMENTE');
    logLine(`   Teléfono          : ${phoneRaw}`);
    logLine(`   Mensajes          : ${deletedMessages} eliminados`);
    logLine(`   Conversaciones    : ${anonConv} anonimizadas`);
    logLine(`   Turnos            : ${apptResult.rowCount} eliminados`);
    logLine(`   Pedidos           : ${ordResult.rowCount} eliminados`);
    logLine(`   Variables         : ${cvResult.rowCount} eliminadas`);
    logLine(`   Seguimientos      : ${deletedFollowups} eliminados`);
    logLine(`   Alertas           : ${deletedAlerts} eliminadas`);
    logLine(`   Logs ML           : ${anonML} anonimizados`);
    logLine('='.repeat(60));
    // Guardar log persistente para auditoría de compliance
    const logsDir = path.join(__dirname, '..', 'logs', 'compliance');
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    const logFile = path.join(logsDir, `baja-${timestamp.replace(/[:.]/g, '-')}.log`);
    fs.writeFileSync(logFile, log.join('\n'), 'utf8');
    logLine(`\nLog guardado en: ${logFile}`);

  } catch (err) {
    await client.query('ROLLBACK');
    logLine(`\n❌ ERROR — se hizo ROLLBACK, ningún dato fue modificado`);
    logLine(`   Detalle: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
