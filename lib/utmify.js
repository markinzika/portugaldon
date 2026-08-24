'use strict';

const UTMIFY_API_URL = 'https://api.utmify.com.br/api-credentials/orders';
const UTMIFY_TOKEN   = process.env.UTMIFY_TOKEN; // configurar no Vercel → Environment Variables

function mapPaymentMethod(method) {
  if (method === 'multibanco') return 'boleto';
  return 'pix'; // mbway → pix
}

function mapStatus(status) {
  const map = {
    pending:        'waiting_payment',
    waiting_payment:'waiting_payment',
    paid:           'paid',
    failed:         'refused',
    refused:        'refused',
    refunded:       'refunded',
    chargedback:    'chargedback',
  };
  return map[status] || 'waiting_payment';
}

async function sendOrder({ orderId, amount, paymentMethod, status, createdAt, paidAt, customer, utms }) {
  const tracking = {
    src:          utms?.src          || null,
    sck:          utms?.sck          || null,
    utm_source:   utms?.utm_source   || null,
    utm_medium:   utms?.utm_medium   || null,
    utm_campaign: utms?.utm_campaign || null,
    utm_content:  utms?.utm_content  || null,
    utm_term:     utms?.utm_term     || null,
  };

  const body = {
    isTest:        false,
    orderId,
    platform:      'Mão Amiga',
    paymentMethod: mapPaymentMethod(paymentMethod),
    status:        mapStatus(status),
    createdAt:     createdAt || new Date().toISOString(),
    approvedDate:  paidAt    || null,
    customer: {
      name:     customer?.name     || 'Anônimo',
      email:    customer?.email    || 'anonimo@maoamiga.com.br',
      phone:    customer?.phone    || null,
      country:  'BR',
      document: customer?.nif      || null,
    },
    products: [
      {
        id:           'doacao-mao-amiga',
        name:         'Doação Mão Amiga',
        planId:       null,
        planName:     null,
        quantity:     1,
        priceInCents: Math.round(amount * 100),
      },
    ],
    commission: {
      totalPriceInCents:     Math.round(amount * 100),
      gatewayFeeInCents:     0,
      userCommissionInCents: Math.round(amount * 100),
    },
    trackingParameters: tracking,
  };

  try {
    const res = await fetch(UTMIFY_API_URL, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-token':  UTMIFY_TOKEN,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[utmify] Error:', res.status, text);
    } else {
      console.log('[utmify] Order sent:', orderId, status, JSON.stringify(tracking));
    }
  } catch (err) {
    console.error('[utmify] Fetch error:', err.message);
  }
}

module.exports = { sendOrder };
