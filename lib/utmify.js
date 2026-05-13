'use strict';

const UTMIFY_API_URL = 'https://api.utmify.com.br/api-credentials/orders';
const UTMIFY_TOKEN   = 'wQwauqxM3lz5yLfUUn9rQaZQLDuzxmMvWxB1';

async function sendOrder({ orderId, amount, paymentMethod, status, createdAt, paidAt, customer }) {
  const body = {
    orderId,
    platform:      'Coração Solidário',
    paymentMethod: paymentMethod || 'pix',
    status,
    createdAt:     createdAt || new Date().toISOString(),
    approvedDate:  paidAt    || null,
    refundedAt:    null,
    customer: {
      name:     customer?.name  || 'Anónimo',
      email:    customer?.email || 'anonimo@coracaosolidario.pt',
      phone:    customer?.phone || null,
      document: customer?.nif   || null,
    },
    products: [
      {
        id:       'donativo',
        name:     'Donativo ALAAR',
        planId:   null,
        planName: null,
        quantity: 1,
        priceInCents: Math.round(amount * 100),
      },
    ],
    trackingParameters: {
      src:         null,
      sck:         null,
      utm_source:  null,
      utm_medium:  null,
      utm_campaign:null,
      utm_content: null,
      utm_term:    null,
    },
    commission: {
      totalPriceInCents:    Math.round(amount * 100),
      gatewayFeeInCents:    0,
      userCommissionInCents:Math.round(amount * 100),
    },
    isTest: false,
  };

  try {
    const res = await fetch(UTMIFY_API_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'x-api-token':   UTMIFY_TOKEN,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[utmify] Error:', res.status, text);
    } else {
      console.log('[utmify] Order sent:', orderId, status);
    }
  } catch (err) {
    console.error('[utmify] Fetch error:', err.message);
  }
}

module.exports = { sendOrder };
