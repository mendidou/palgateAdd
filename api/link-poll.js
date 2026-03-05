// Polls PalGate linking endpoint once and returns the result.
// Frontend calls this every 3 s until response.user && response.secondary are present.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { id } = req.query;
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
    return res.status(400).json({ error: 'Invalid or missing id' });
  }

  try {
    const upstream = await fetch(
      `https://api1.pal-es.com/v1/bt/un/secondary/init/${id}`,
      {
        headers: {
          'Accept': '*/*',
          'Accept-Language': 'en-us',
          'Content-Type': 'application/json',
          'x-bt-token': ''
        }
      }
    );

    let data;
    try {
      data = await upstream.json();
    } catch {
      data = {};
    }

    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
