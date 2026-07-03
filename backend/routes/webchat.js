const express = require('express');
const router = express.Router();
const pool = require('../db');
const { getAIResponse } = require('../services/ai');
const auth = require('../middleware/auth');

// GET /api/webchat/status (autenticado)
router.get('/status', auth, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT webchat_enabled, webchat_title, webchat_color FROM bot_configs WHERE client_id = $1',
      [req.client.id]
    );
    res.json(r.rows[0] || { webchat_enabled: false, webchat_title: 'Chat con nosotros', webchat_color: '#7C3AED' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/webchat/settings (autenticado)
router.put('/settings', auth, async (req, res) => {
  const { webchat_enabled, webchat_title, webchat_color } = req.body;
  try {
    await pool.query(
      'UPDATE bot_configs SET webchat_enabled = $1, webchat_title = $2, webchat_color = $3 WHERE client_id = $4',
      [webchat_enabled, webchat_title || 'Chat con nosotros', webchat_color || '#7C3AED', req.client.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/webchat/:clientId/message (público — lo llama el widget)
router.post('/:clientId/message', async (req, res) => {
  const { clientId } = req.params;
  const { visitorId, message, visitorName } = req.body;
  if (!visitorId || !message) return res.status(400).json({ error: 'Faltan datos' });

  try {
    const clientRes = await pool.query(
      'SELECT c.id, c.active, bc.webchat_enabled, bc.system_prompt, bc.business_info, bc.ai_model FROM clients c LEFT JOIN bot_configs bc ON bc.client_id = c.id WHERE c.id = $1',
      [clientId]
    );
    if (!clientRes.rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });
    const client = clientRes.rows[0];
    if (!client.active) return res.status(403).json({ error: 'Servicio no disponible' });
    if (!client.webchat_enabled) return res.status(403).json({ error: 'Widget no activado' });

    // Obtener o crear conversación
    let convRes = await pool.query(
      `SELECT * FROM conversations WHERE client_id = $1 AND customer_phone = $2 AND channel = 'webchat' ORDER BY created_at DESC LIMIT 1`,
      [clientId, visitorId]
    );
    let conv = convRes.rows[0];
    if (!conv) {
      const newConv = await pool.query(
        `INSERT INTO conversations (client_id, customer_phone, customer_name, channel, status) VALUES ($1,$2,$3,'webchat','bot') RETURNING *`,
        [clientId, visitorId, visitorName || 'Visitante web']
      );
      conv = newConv.rows[0];
    }

    // Guardar mensaje del visitante
    await pool.query(
      'INSERT INTO messages (conversation_id, role, content) VALUES ($1,$2,$3)',
      [conv.id, 'user', message]
    );

    // Obtener historial reciente para contexto
    const histRes = await pool.query(
      'SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY timestamp DESC LIMIT 20',
      [conv.id]
    );
    const history = histRes.rows.reverse().slice(0, -1); // excluir el último (el que acaba de entrar)

    // Base de conocimiento
    const kbRes = await pool.query(
      'SELECT title, content FROM knowledge_base WHERE client_id = $1 LIMIT 10',
      [clientId]
    );
    const kb = kbRes.rows.map(r => `${r.title}: ${r.content}`).join('\n\n');

    const systemPrompt = [
      client.system_prompt || 'Sos un asistente útil.',
      client.business_info ? `\nInfo del negocio: ${client.business_info}` : '',
      kb ? `\nBase de conocimiento:\n${kb}` : '',
      '\nEstás respondiendo en el chat web del negocio. Sé amable, claro y conciso.',
    ].join('');

    const reply = await getAIResponse(systemPrompt, history, message, client.ai_model);

    // Guardar respuesta del bot
    await pool.query(
      'INSERT INTO messages (conversation_id, role, content) VALUES ($1,$2,$3)',
      [conv.id, 'assistant', reply]
    );

    // Actualizar updated_at de la conversación
    await pool.query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [conv.id]);

    res.json({ reply });
  } catch (err) {
    console.error('[webchat/message]', err.message);
    res.status(500).json({ error: 'Error procesando mensaje' });
  }
});

// GET /widget.js?clientId=xxx — sirve el widget embebible
router.get('/widget.js', async (req, res) => {
  const { clientId } = req.query;
  if (!clientId) return res.status(400).send('// clientId requerido');

  try {
    const r = await pool.query(
      'SELECT c.id, bc.webchat_enabled, bc.webchat_title, bc.webchat_color FROM clients c LEFT JOIN bot_configs bc ON bc.client_id = c.id WHERE c.id = $1',
      [clientId]
    );
    if (!r.rows.length) return res.status(404).send('// Cliente no encontrado');
    const cfg = r.rows[0];
    if (!cfg.webchat_enabled) return res.status(200).type('js').send('/* Waibo widget desactivado */');

    const title = (cfg.webchat_title || 'Chat con nosotros').replace(/'/g, "\\'");
    const color = cfg.webchat_color || '#7C3AED';
    const apiUrl = process.env.APP_URL || 'https://whabot-backend-production.up.railway.app';

    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.send(`/* Waibo Chat Widget */
(function(){
  var C='${clientId}',A='${apiUrl}',K='${color}',T='${title}';
  var vid=localStorage.getItem('waibo_v_'+C);
  if(!vid){vid='v'+Math.random().toString(36).slice(2)+'_'+Date.now();localStorage.setItem('waibo_v_'+C,vid);}
  var open=false,busy=false;
  var s=document.createElement('style');
  s.textContent='#wb-w *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;padding:0}'
    +'#wb-btn{position:fixed;bottom:24px;right:24px;width:56px;height:56px;border-radius:50%;background:'+K+';border:none;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,.2);z-index:999999;display:flex;align-items:center;justify-content:center;transition:transform .2s}'
    +'#wb-btn:hover{transform:scale(1.08)}'
    +'#wb-btn svg{width:28px;height:28px;fill:white}'
    +'#wb-p{position:fixed;bottom:90px;right:24px;width:360px;background:white;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,.15);z-index:999998;display:flex;flex-direction:column;overflow:hidden;transition:opacity .2s,transform .2s;max-height:520px}'
    +'#wb-p.h{opacity:0;pointer-events:none;transform:translateY(10px)}'
    +'#wb-hd{background:'+K+';color:white;padding:16px 18px;display:flex;align-items:center;gap:10px}'
    +'#wb-hd .dot{width:8px;height:8px;border-radius:50%;background:#4ade80;flex-shrink:0}'
    +'#wb-hd .ti{font-weight:600;font-size:15px}'
    +'#wb-hd .su{font-size:12px;opacity:.8;margin-top:2px}'
    +'#wb-msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;min-height:220px;max-height:340px}'
    +'.wm{max-width:82%;padding:10px 14px;border-radius:12px;font-size:14px;line-height:1.5;word-wrap:break-word}'
    +'.wm.b{background:#F3F4F6;color:#1A1A2E;align-self:flex-start;border-bottom-left-radius:4px}'
    +'.wm.u{background:'+K+';color:white;align-self:flex-end;border-bottom-right-radius:4px}'
    +'.wm.t{background:#F3F4F6;color:#9CA3AF;font-style:italic;align-self:flex-start}'
    +'#wb-f{padding:12px;border-top:1px solid #E5E7EB;display:flex;gap:8px;align-items:center}'
    +'#wb-i{flex:1;padding:10px 14px;border:1.5px solid #E5E7EB;border-radius:24px;font-size:14px;outline:none}'
    +'#wb-i:focus{border-color:'+K+'}'
    +'#wb-s{width:40px;height:40px;border-radius:50%;background:'+K+';border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0}'
    +'#wb-s:disabled{opacity:.4;cursor:not-allowed}'
    +'#wb-s svg{width:18px;height:18px;fill:white}'
    +'#wb-pw{text-align:center;font-size:11px;color:#9CA3AF;padding:6px 0 8px}'
    +'#wb-pw a{color:'+K+';text-decoration:none}'
    +'@media(max-width:420px){#wb-p{width:calc(100vw - 20px);right:10px;bottom:80px}}';
  document.head.appendChild(s);
  var w=document.createElement('div');
  w.id='wb-w';
  w.innerHTML='<button id="wb-btn" onclick="wbTog()">'
    +'<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>'
    +'</button>'
    +'<div id="wb-p" class="h">'
    +'<div id="wb-hd"><div class="dot"></div><div><div class="ti">'+T+'</div><div class="su">Respondemos al instante</div></div></div>'
    +'<div id="wb-msgs"></div>'
    +'<div id="wb-f">'
    +'<input id="wb-i" placeholder="Escribí tu mensaje..." autocomplete="off" onkeydown="if(event.key===\\'Enter\\'){event.preventDefault();wbSend()}">'
    +'<button id="wb-s" onclick="wbSend()"><svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>'
    +'</div>'
    +'<div id="wb-pw">Powered by <a href="https://waibochat.com" target="_blank">Waibo</a></div>'
    +'</div>';
  document.body.appendChild(w);
  addMsg('b','¡Hola! 👋 ¿En qué te puedo ayudar hoy?');
  window.wbTog=function(){open=!open;document.getElementById('wb-p').classList.toggle('h',!open);if(open)document.getElementById('wb-i').focus();};
  window.wbSend=async function(){
    if(busy)return;
    var inp=document.getElementById('wb-i'),txt=inp.value.trim();
    if(!txt)return;
    inp.value='';
    addMsg('u',txt);
    busy=true;document.getElementById('wb-s').disabled=true;
    var typing=addMsg('t','Escribiendo...');
    try{
      var r=await fetch(A+'/api/webchat/'+C+'/message',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({visitorId:vid,message:txt})});
      var d=await r.json();
      typing.remove();
      addMsg('b',d.reply||'Lo siento, no pude procesar tu mensaje.');
    }catch(e){typing.remove();addMsg('b','Hubo un error. Intentá de nuevo.');}
    busy=false;document.getElementById('wb-s').disabled=false;
  };
  function addMsg(type,text){
    var m=document.getElementById('wb-msgs'),d=document.createElement('div');
    d.className='wm '+type;d.textContent=text;m.appendChild(d);m.scrollTop=m.scrollHeight;return d;
  }
})();`);
  } catch (err) {
    res.status(500).send('// Error: ' + err.message);
  }
});

module.exports = router;
