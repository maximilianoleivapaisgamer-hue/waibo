const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        business_name VARCHAR(255),
        phone_number VARCHAR(50),
        whatsapp_api_key VARCHAR(500),
        plan VARCHAR(50) DEFAULT 'basic',
        active BOOLEAN DEFAULT true,
        whatsapp_mode VARCHAR(20) DEFAULT 'api',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS bot_configs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
        system_prompt TEXT NOT NULL DEFAULT 'Sos un asistente útil.',
        business_info TEXT,
        welcome_message TEXT DEFAULT '¡Hola! ¿En qué puedo ayudarte?',
        human_handoff_keyword VARCHAR(100) DEFAULT 'humano',
        language VARCHAR(10) DEFAULT 'es',
        active BOOLEAN DEFAULT true,
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
        customer_phone VARCHAR(50) NOT NULL,
        customer_name VARCHAR(255),
        status VARCHAR(50) DEFAULT 'bot',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL,
        content TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS admins (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      ALTER TABLE clients ADD COLUMN IF NOT EXISTS whatsapp_mode VARCHAR(20) DEFAULT 'api';
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS whatsapp_phone_id VARCHAR(100);
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS whatsapp_provider VARCHAR(20) DEFAULT '360dialog';
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS channel VARCHAR(50) DEFAULT 'whatsapp';
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS channel_user_id VARCHAR(255);
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_typing BOOLEAN DEFAULT false;

      CREATE TABLE IF NOT EXISTS instagram_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID REFERENCES clients(id) ON DELETE CASCADE UNIQUE,
        page_id VARCHAR(255),
        page_name VARCHAR(255),
        access_token TEXT,
        instagram_account_id VARCHAR(255),
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS knowledge_base (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
        type VARCHAR(50) DEFAULT 'text',
        title VARCHAR(255),
        content TEXT NOT NULL,
        source_url VARCHAR(500),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS billing (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID REFERENCES clients(id) ON DELETE CASCADE UNIQUE,
        plan VARCHAR(50) DEFAULT 'standard',
        status VARCHAR(50) DEFAULT 'active',
        amount NUMERIC(10,2) DEFAULT 59999,
        last_payment TIMESTAMP,
        next_due TIMESTAMP DEFAULT (NOW() + INTERVAL '30 days'),
        suspended_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );

      ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS bot_name VARCHAR(100) DEFAULT 'Asistente';
      ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS bot_tone VARCHAR(100) DEFAULT 'amigable';
      ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS instagram_comment_keywords TEXT DEFAULT 'precio,info,cuanto,quiero,disponible';
      ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS voice_enabled BOOLEAN DEFAULT true;

      CREATE TABLE IF NOT EXISTS mercadolibre_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID REFERENCES clients(id) ON DELETE CASCADE UNIQUE,
        ml_user_id VARCHAR(100),
        seller_nickname VARCHAR(255),
        access_token TEXT,
        refresh_token TEXT,
        token_expires_at TIMESTAMP,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS tiendanube_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID REFERENCES clients(id) ON DELETE CASCADE UNIQUE,
        store_id VARCHAR(100),
        store_name VARCHAR(255),
        store_url VARCHAR(500),
        access_token TEXT,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS product_cache (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
        source VARCHAR(50) DEFAULT 'tiendanube',
        external_id VARCHAR(255),
        name VARCHAR(500),
        description TEXT,
        price NUMERIC(12,2),
        stock INTEGER,
        url VARCHAR(500),
        image_url VARCHAR(500),
        variants JSONB,
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS appointments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
        customer_phone VARCHAR(50) NOT NULL,
        customer_name VARCHAR(255),
        service_name VARCHAR(255),
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NOT NULL,
        status VARCHAR(50) DEFAULT 'confirmed',
        reminder_sent BOOLEAN DEFAULT false,
        google_event_id VARCHAR(255),
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS services (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        duration_minutes INTEGER DEFAULT 60,
        price NUMERIC(10,2),
        description TEXT,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS tiktok_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID REFERENCES clients(id) ON DELETE CASCADE UNIQUE,
        tiktok_open_id VARCHAR(255),
        tiktok_display_name VARCHAR(255),
        tiktok_avatar_url VARCHAR(500),
        access_token TEXT,
        refresh_token TEXT,
        token_expires_at TIMESTAMP,
        refresh_expires_at TIMESTAMP,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS google_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID REFERENCES clients(id) ON DELETE CASCADE UNIQUE,
        access_token TEXT,
        refresh_token TEXT,
        token_expires_at TIMESTAMP,
        calendar_id VARCHAR(255) DEFAULT 'primary',
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );

      ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS agenda_enabled BOOLEAN DEFAULT false;
      ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS agenda_days TEXT DEFAULT 'lunes,martes,miercoles,jueves,viernes';
      ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS agenda_start_hour INTEGER DEFAULT 9;
      ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS agenda_end_hour INTEGER DEFAULT 18;
      ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS reminder_hours_before INTEGER DEFAULT 2;

      ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS ai_model VARCHAR(100) DEFAULT 'claude-haiku-4-5-20251001';

      ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS business_hours_enabled BOOLEAN DEFAULT false;
      ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS business_hours_start INTEGER DEFAULT 9;
      ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS business_hours_end INTEGER DEFAULT 21;
      ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS business_hours_days TEXT DEFAULT 'lunes,martes,miercoles,jueves,viernes,sabado';
      ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS after_hours_message TEXT DEFAULT 'Gracias por escribirnos. En este momento estamos fuera de horario de atención, pero apenas estemos disponibles te respondemos 🙏';

      ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS followup_enabled BOOLEAN DEFAULT false;
      ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS followup_wait_minutes INTEGER DEFAULT 60;
      ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS followup_max_attempts INTEGER DEFAULT 1;
      ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS followup_message TEXT DEFAULT '¡Hola! 😊 Vi que estabas consultando antes. ¿Seguís interesado? Te ayudo con lo que necesites.';
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS followup_count INTEGER DEFAULT 0;
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_followup_at TIMESTAMP;

      ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS orders_enabled BOOLEAN DEFAULT false;
      ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS has_tested_bot BOOLEAN DEFAULT false;
      ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS facebook_comment_keywords TEXT DEFAULT 'precio,info,cuanto,quiero,disponible';
      ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS owner_notification_phone VARCHAR(50);
      ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS owner_notifications_enabled BOOLEAN DEFAULT false;
      ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS variables_enabled BOOLEAN DEFAULT false;
      ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS smart_scheduling_enabled BOOLEAN DEFAULT false;

      CREATE TABLE IF NOT EXISTS alerts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
        conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        resolved BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS instagram_comments_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
        commenter_username VARCHAR(255),
        comment_text TEXT,
        post_caption VARCHAR(500),
        public_reply TEXT,
        dm_sent TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS mercadolibre_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        item_title VARCHAR(500),
        question_text TEXT,
        answer_text TEXT,
        buyer_name VARCHAR(255),
        order_id VARCHAR(100),
        response_time_ms INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS facebook_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID REFERENCES clients(id) ON DELETE CASCADE UNIQUE,
        page_id VARCHAR(255),
        page_name VARCHAR(255),
        access_token TEXT,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS facebook_comments_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
        commenter_name VARCHAR(255),
        comment_text TEXT,
        post_caption VARCHAR(500),
        public_reply TEXT,
        dm_sent TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS facebook_reviews_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
        reviewer_name VARCHAR(255),
        rating INTEGER,
        review_text TEXT,
        reply_sent TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS menu_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price NUMERIC(10,2) NOT NULL,
        category VARCHAR(100),
        available BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
        conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
        customer_name VARCHAR(255),
        customer_phone VARCHAR(50),
        items JSONB NOT NULL,
        total NUMERIC(10,2),
        delivery_type VARCHAR(50) DEFAULT 'retiro',
        delivery_address TEXT,
        notes TEXT,
        status VARCHAR(50) DEFAULT 'pendiente',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS whatsapp_qr_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID REFERENCES clients(id) ON DELETE CASCADE UNIQUE,
        status VARCHAR(50) DEFAULT 'disconnected',
        phone_number VARCHAR(50),
        connected_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS plans (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        price NUMERIC(10,2) NOT NULL,
        description TEXT,
        features JSONB DEFAULT '[]',
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS mp_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID REFERENCES clients(id) ON DELETE CASCADE UNIQUE,
        plan_id UUID REFERENCES plans(id),
        mp_preapproval_id VARCHAR(255) UNIQUE,
        status VARCHAR(50) DEFAULT 'pending',
        last_payment_status VARCHAR(50),
        last_payment_at TIMESTAMP,
        next_payment_date TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS mp_payments_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
        mp_payment_id VARCHAR(255),
        amount NUMERIC(10,2),
        status VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS bank_transfer_payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
        plan_id UUID REFERENCES plans(id),
        amount NUMERIC(10,2),
        receipt_filename VARCHAR(255),
        receipt_data TEXT,
        receipt_mimetype VARCHAR(100),
        status VARCHAR(50) DEFAULT 'pending',
        reviewed_by VARCHAR(255),
        reviewed_at TIMESTAMP,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS payment_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        bank_alias VARCHAR(255),
        bank_cbu VARCHAR(50),
        bank_account_holder VARCHAR(255),
        bank_cuit VARCHAR(50),
        instructions TEXT,
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS contact_variables (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
        customer_phone VARCHAR(50) NOT NULL,
        field_name VARCHAR(100) NOT NULL,
        field_value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(client_id, customer_phone, field_name)
      );

      CREATE TABLE IF NOT EXISTS scheduled_followups (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
        conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
        customer_phone VARCHAR(50) NOT NULL,
        channel VARCHAR(50) NOT NULL,
        channel_user_id VARCHAR(255),
        scheduled_for TIMESTAMP NOT NULL,
        reason TEXT,
        message TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      );

      INSERT INTO plans (name, price, description, features)
      SELECT 'Estándar', 59999, 'WhatsApp + Instagram + Facebook + Agenda + Base de conocimiento',
        '["WhatsApp Business", "Instagram + Facebook", "Notas de voz", "Base de conocimiento", "Agenda de turnos", "Estadísticas básicas"]'::jsonb
      WHERE NOT EXISTS (SELECT 1 FROM plans WHERE name = 'Estándar');

      INSERT INTO plans (name, price, description, features)
      SELECT 'E-Commerce Pro', 129999, 'Todo lo del Estándar + Mercado Libre + Tiendanube',
        '["Todo del Estándar", "Mercado Libre", "Tiendanube", "Catálogo dinámico", "Estadísticas avanzadas", "Soporte prioritario"]'::jsonb
      WHERE NOT EXISTS (SELECT 1 FROM plans WHERE name = 'E-Commerce Pro');

      CREATE TABLE IF NOT EXISTS data_deletion_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        phone VARCHAR(50) NOT NULL,
        name VARCHAR(255) NOT NULL,
        reason TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        requested_at TIMESTAMP DEFAULT NOW(),
        processed_at TIMESTAMP
      );
    `);
    console.log('✅ Base de datos inicializada correctamente');
  } catch (err) {
    console.error('❌ Error inicializando DB:', err.message);
  } finally {
    client.release();
  }
}

initDB();

module.exports = pool;
