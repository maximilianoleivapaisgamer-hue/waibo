import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import Sidebar from '../components/Sidebar';

const API = process.env.NEXT_PUBLIC_API_URL;

export default function Billing() {
  const router = useRouter();
  const [billing, setBilling] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [plans, setPlans] = useState([]);
  const [payments, setPayments] = useState([]);
  const [bankSettings, setBankSettings] = useState(null);
  const [myReceipts, setMyReceipts] = useState([]);
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [receiptFile, setReceiptFile] = useState(null);
  const [transferAmount, setTransferAmount] = useState('');
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [trial, setTrial] = useState(null);

  const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('whabot_token')}` });
  const showSuccess = (m) => { setSuccess(m); setTimeout(() => setSuccess(''), 5000); };
  const showError = (m) => { setError(m); setTimeout(() => setError(''), 5000); };

  useEffect(() => {
    const token = localStorage.getItem('whabot_token');
    if (!token) { router.push('/'); return; }

    const params = new URLSearchParams(window.location.search);
    if (params.get('mp_return')) showSuccess('✅ Volviste de MercadoPago — verificando el estado de tu suscripción...');
    if (params.toString()) window.history.replaceState({}, '', '/billing');

    loadAll();
    axios.get(`${API}/api/bot/trial`, { headers: getHeaders() })
      .then(r => { if (r.data.in_trial) setTrial(r.data); })
      .catch(() => {});
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [billingRes, subRes, plansRes, paymentsRes, bankRes, receiptsRes] = await Promise.all([
        axios.get(`${API}/api/billing/status`, { headers: getHeaders() }),
        axios.get(`${API}/api/mercadopago/subscription`, { headers: getHeaders() }),
        axios.get(`${API}/api/mercadopago/plans`, { headers: getHeaders() }),
        axios.get(`${API}/api/mercadopago/payments`, { headers: getHeaders() }),
        axios.get(`${API}/api/bank-transfer/settings`, { headers: getHeaders() }),
        axios.get(`${API}/api/bank-transfer/my-receipts`, { headers: getHeaders() }),
      ]);
      setBilling(billingRes.data);
      setSubscription(subRes.data);
      setPlans(plansRes.data);
      setPayments(paymentsRes.data);
      setBankSettings(bankRes.data);
      setMyReceipts(receiptsRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const subscribeToPlan = async (planId) => {
    setSubscribing(true);
    try {
      const res = await axios.post(`${API}/api/mercadopago/subscribe`, { plan_id: planId }, { headers: getHeaders() });
      window.location.href = res.data.checkout_url;
    } catch {
      showError('Error iniciando la suscripción. Intentá de nuevo.');
      setSubscribing(false);
    }
  };

  const payOnce = async (planId) => {
    setSubscribing(true);
    try {
      const res = await axios.post(`${API}/api/mercadopago/pay-once`, { plan_id: planId }, { headers: getHeaders() });
      window.location.href = res.data.checkout_url;
    } catch {
      showError('Error iniciando el pago. Intentá de nuevo.');
      setSubscribing(false);
    }
  };

  const cancelSubscription = async () => {
    if (!confirm('¿Cancelar tu suscripción? Tu bot se va a desactivar al finalizar el período ya pagado.')) return;
    try {
      await axios.post(`${API}/api/mercadopago/cancel`, {}, { headers: getHeaders() });
      showSuccess('Suscripción cancelada');
      loadAll();
    } catch { showError('Error cancelando la suscripción'); }
  };

  const uploadReceipt = async (e) => {
    e.preventDefault();
    if (!receiptFile) return;
    setUploadingReceipt(true);
    const formData = new FormData();
    formData.append('receipt', receiptFile);
    if (transferAmount) formData.append('amount', transferAmount);
    try {
      await axios.post(`${API}/api/bank-transfer/upload-receipt`, formData, {
        headers: { ...getHeaders(), 'Content-Type': 'multipart/form-data' }
      });
      showSuccess('✅ Comprobante recibido — lo vamos a revisar y activar tu cuenta en breve');
      setReceiptFile(null);
      setTransferAmount('');
      setShowTransferForm(false);
      const receiptsRes = await axios.get(`${API}/api/bank-transfer/my-receipts`, { headers: getHeaders() });
      setMyReceipts(receiptsRes.data);
    } catch (err) {
      showError(err.response?.data?.error || 'Error subiendo el comprobante');
    } finally {
      setUploadingReceipt(false);
    }
  };

  if (loading) return (
    <div className="dashboard">
      <Sidebar active="billing" />
      <div className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>
      </div>
    </div>
  );

  return (
    <div className="dashboard">
      <Sidebar active="billing" />
      <div className="main-content">
        <div className="page-header">
          <h1>💳 Mi plan</h1>
          <p>Estado de tu suscripción y facturación</p>
        </div>

        {success && <div className="success-msg">{success}</div>}
        {error && <div className="error-msg">{error}</div>}

        {trial && (
          <div style={{
            marginBottom: 24, padding: '18px 22px', borderRadius: 14,
            display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
            background: trial.expired ? '#FEF2F2' : trial.ending_soon ? '#FFFBEB' : '#F5F3FF',
            border: `1px solid ${trial.expired ? '#FECACA' : trial.ending_soon ? '#FDE68A' : '#DDD6FE'}`,
          }}>
            <span style={{ fontSize: 28 }}>{trial.expired ? '🔴' : trial.ending_soon ? '⚠️' : '🎁'}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: trial.expired ? '#DC2626' : trial.ending_soon ? '#92400E' : '#5B21B6' }}>
                {trial.expired
                  ? 'Tu período de prueba venció'
                  : trial.ending_soon
                    ? `Tu prueba gratuita vence en ${trial.days_left} día${trial.days_left !== 1 ? 's' : ''}`
                    : `Estás en tu prueba gratuita — ${trial.days_left} día${trial.days_left !== 1 ? 's' : ''} restante${trial.days_left !== 1 ? 's' : ''}`}
              </div>
              <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>
                {trial.expired
                  ? 'Elegí un plan para seguir usando Waibo.'
                  : 'Podés contratar un plan ahora o esperar a que termine tu prueba.'}
              </div>
            </div>
          </div>
        )}

        {billing?.status === 'suspended' && (
          <div style={{ background: '#FEF2F2', border: '2px solid #FCA5A5', borderRadius: 14, padding: '24px 28px', marginBottom: 24 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#991B1B', marginBottom: 8 }}>⛔ Tu cuenta está suspendida</div>
            <p style={{ color: '#7F1D1D', marginBottom: 16, lineHeight: 1.6 }}>
              El bot está desactivado en todos tus canales. Para reactivar el servicio, regularizá tu pago usando cualquiera de las opciones de abajo. En cuanto confirmemos el pago, tu cuenta se reactiva automáticamente.
            </p>
            <div style={{ fontSize: 13, color: '#991B1B', background: '#FEE2E2', borderRadius: 8, padding: '10px 14px' }}>
              📩 Si ya realizaste el pago, subí el comprobante más abajo o escribinos al soporte.
            </div>
          </div>
        )}

        {subscription?.subscribed ? (
          <div className="card" style={{ borderLeft: '4px solid var(--green)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{subscription.plan_name}</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--green-dark)', margin: '8px 0' }}>
                  ${Number(subscription.plan_price).toLocaleString('es-AR')}<span style={{ fontSize: 14, fontWeight: 400, color: 'var(--text-muted)' }}>/mes</span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: 12, padding: '4px 12px', borderRadius: 20, fontWeight: 600,
                    background: subscription.status === 'authorized' ? '#EDE9FE' : '#FEF3C7',
                    color: subscription.status === 'authorized' ? '#5B21B6' : '#92400E'
                  }}>
                    {subscription.status === 'authorized' ? '✅ Pago automático activo' : '⏳ Pendiente de confirmación'}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Incluye:</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 6 }}>
                {(subscription.features || []).map(f => (
                  <div key={f} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: 'var(--green)' }}>✓</span> {f}
                  </div>
                ))}
              </div>
            </div>

            {subscription.status === 'authorized' && (
              <button onClick={cancelSubscription} className="btn btn-secondary" style={{ width: 'auto', marginTop: 16, color: '#DC2626' }}>
                Cancelar suscripción
              </button>
            )}
          </div>
        ) : (
          <div>
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 13, color: '#1D4ED8' }}>
              💳 Elegí tu plan y pagá con MercadoPago — el cobro es automático cada mes, sin que tengas que acordarte de pagar a mano.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              {plans.map(plan => (
                <div key={plan.id} className="card">
                  <div style={{ fontWeight: 700, fontSize: 18 }}>{plan.name}</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--green-dark)', margin: '10px 0' }}>
                    ${Number(plan.price).toLocaleString('es-AR')}<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)' }}>/mes</span>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>{plan.description}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                    {(plan.features || []).map(f => (
                      <div key={f} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: 'var(--green)' }}>✓</span> {f}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => subscribeToPlan(plan.id)}
                    disabled={subscribing}
                    className="btn btn-primary"
                    style={{ width: '100%', marginBottom: 8 }}
                  >
                    {subscribing ? 'Redirigiendo...' : '🔄 Suscribirme (cobro automático)'}
                  </button>
                  <button
                    onClick={() => payOnce(plan.id)}
                    disabled={subscribing}
                    className="btn btn-secondary"
                    style={{ width: '100%' }}
                  >
                    💳 Pagar solo este mes
                  </button>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, textAlign: 'center' }}>
                    Con "Pagar solo este mes" vas a tener que volver a pagar manualmente el próximo mes.
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {bankSettings && (
          <div className="card">
            <div className="card-title">🏦 Pagar por transferencia bancaria</div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
              Si preferís transferir en vez de pagar con tarjeta, hacé el depósito y subí el comprobante — activamos tu cuenta en cuanto lo revisemos.
            </p>

            <div style={{ background: 'var(--bg)', borderRadius: 10, padding: 14, marginBottom: 14, fontSize: 13 }}>
              <div style={{ marginBottom: 6 }}><strong>Alias:</strong> {bankSettings.bank_alias}</div>
              <div style={{ marginBottom: 6 }}><strong>CBU:</strong> {bankSettings.bank_cbu}</div>
              <div style={{ marginBottom: 6 }}><strong>Titular:</strong> {bankSettings.bank_account_holder}</div>
              {bankSettings.bank_cuit && <div style={{ marginBottom: 6 }}><strong>CUIT:</strong> {bankSettings.bank_cuit}</div>}
              {bankSettings.instructions && <div style={{ marginTop: 8, color: 'var(--text-muted)' }}>{bankSettings.instructions}</div>}
            </div>

            {!showTransferForm ? (
              <button onClick={() => setShowTransferForm(true)} className="btn btn-secondary" style={{ width: 'auto' }}>
                📤 Ya transferí — subir comprobante
              </button>
            ) : (
              <form onSubmit={uploadReceipt}>
                <div className="form-group">
                  <label>Monto transferido</label>
                  <input type="number" placeholder="59999" value={transferAmount} onChange={e => setTransferAmount(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Comprobante (foto o PDF)</label>
                  <input type="file" accept="image/jpeg,image/png,application/pdf" onChange={e => setReceiptFile(e.target.files[0])} required style={{ padding: '8px 0' }} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" type="submit" disabled={uploadingReceipt} style={{ width: 'auto', padding: '10px 20px' }}>
                    {uploadingReceipt ? 'Subiendo...' : '✅ Enviar comprobante'}
                  </button>
                  <button type="button" onClick={() => setShowTransferForm(false)} className="btn btn-secondary" style={{ width: 'auto' }}>
                    Cancelar
                  </button>
                </div>
              </form>
            )}

            {myReceipts.length > 0 && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Tus comprobantes enviados</div>
                {myReceipts.map(r => (
                  <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                    <span>{new Date(r.created_at).toLocaleDateString('es-AR')} {r.amount ? `· $${Number(r.amount).toLocaleString('es-AR')}` : ''}</span>
                    <span style={{
                      fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 500,
                      background: r.status === 'approved' ? '#EDE9FE' : r.status === 'rejected' ? '#FEE2E2' : '#FEF3C7',
                      color: r.status === 'approved' ? '#5B21B6' : r.status === 'rejected' ? '#DC2626' : '#92400E'
                    }}>
                      {r.status === 'approved' ? '✅ Aprobado' : r.status === 'rejected' ? '❌ Rechazado' : '⏳ En revisión'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {payments.length > 0 && (
          <div className="card">
            <div className="card-title">📋 Historial de pagos (MercadoPago)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {payments.map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13 }}>{new Date(p.created_at).toLocaleDateString('es-AR')}</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>${Number(p.amount).toLocaleString('es-AR')}</span>
                  <span style={{
                    fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 500,
                    background: p.status === 'approved' ? '#EDE9FE' : '#FEE2E2',
                    color: p.status === 'approved' ? '#5B21B6' : '#DC2626'
                  }}>
                    {p.status === 'approved' ? '✅ Aprobado' : '❌ ' + p.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
