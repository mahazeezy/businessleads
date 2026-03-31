const ALLOWED_CATEGORIES = [
  'restaurant', 'hair salon', 'auto repair shop', 'cleaning service',
  'contractor', 'laundromat', 'dentist', 'gym', 'retail store',
  'plumber', 'electrician', 'landscaping', 'daycare', 'nail salon', 'bakery'
];

const rateLimitMap = {};
const RATE_LIMIT = 30; // max requests per IP per minute

function isRateLimited(ip) {
  const now = Date.now();
  if (!rateLimitMap[ip]) rateLimitMap[ip] = [];
  rateLimitMap[ip] = rateLimitMap[ip].filter(t => now - t < 60000);
  if (rateLimitMap[ip].length >= RATE_LIMIT) return true;
  rateLimitMap[ip].push(now);
  return false;
}

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const ip = event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown';
  if (isRateLimited(ip)) {
    return { statusCode: 429, headers, body: JSON.stringify({ error: 'Too many requests. Please wait a moment.' }) };
  }

  try {
    const { type, params } = JSON.parse(event.body);

    if (!type || !params) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing type or params' }) };
    }

    const GOOGLE_KEY = process.env.GOOGLE_API_KEY;

    if (type === 'search') {
      const { city, category } = params;

      if (!city || typeof city !== 'string' || city.length > 100) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid city' }) };
      }
      if (!category || !ALLOWED_CATEGORIES.includes(category)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid category' }) };
      }

      const query = encodeURIComponent(`${category} in ${city}`);
      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&key=${GOOGLE_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    if (type === 'details') {
      const { place_id } = params;

      if (!place_id || typeof place_id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(place_id) || place_id.length > 300) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid place_id' }) };
      }

      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place_id}&fields=name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,opening_hours&key=${GOOGLE_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    if (type === 'claude') {
      const { messages, model, max_tokens } = params;

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid messages' }) };
      }
      if (max_tokens > 500) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'max_tokens too high' }) };
      }

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({ model, max_tokens, messages })
      });
      const data = await res.json();
      return { statusCode: res.status, headers, body: JSON.stringify(data) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown type' }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
