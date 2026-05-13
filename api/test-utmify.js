'use strict';

const UTMIFY_API_URL = 'https://api.utmify.com.br/api-credentials/orders';
const UTMIFY_TOKEN   = 'wQwauqxM3lz5yLfUUn9rQaZQLDuzxmMvWxB1';

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const orderId = `test_${Date.now()}`;
  const body = {
    isTest:        true,
    orderId,
    platform:      'Coração Solidário',
    paymentMethod: 'pix',
    status:        'pending',
    createdAt:     new Date().toISOString(),
    approvedDate:  null,
    customer: {
      name:     'Teste Lead',
      email:    'teste@coracaosolidario.pt',
      phone:    null,
      country:  'PT',
      document: null,
    },
    products: [{
      id:           'donativo-alaar',
      name:         'Donativo ALAAR',
      planId:       null,
      planName:     null,
      quantity:     1,
      priceInCents: 2500,
    }],
    commission: {
      totalPriceInCents:     2500,
      gatewayFeeInCents:     0,
      userCommissionInCents: 2500,
    },
    trackingParameters: {
      src:          'teste',
      sck:          null,
      utm_source:   'teste',
      utm_medium:   'api',
      utm_campaign: 'debug',
      utm_content:  null,
      utm_term:     null,
    },
  };

  try {
    const response = await fetch(UTMIFY_API_URL, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-token':  UTMIFY_TOKEN,
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }

    res.status(200).json({
      utmify_status: response.status,
      utmify_ok:     response.ok,
      utmify_response: json,
      payload_sent:  body,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
