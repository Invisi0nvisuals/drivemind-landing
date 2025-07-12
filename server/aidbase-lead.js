const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const LEADS_FILE = path.join(__dirname, '..', 'drivemind_waitlist_leads.json');

function appendLead(lead) {
  let data = [];
  if (fs.existsSync(LEADS_FILE)) {
    try {
      data = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
    } catch (err) {
      console.error('Failed to parse leads file:', err);
    }
  }
  data.push(lead);
  fs.writeFileSync(LEADS_FILE, JSON.stringify(data, null, 2));
}

async function sendToAidbase(email, source, retries = 0) {
  const payload = {
    email,
    tags: ['drivemind_beta'],
    source
  };

  try {
    const res = await fetch('https://api.aidbase.ai/v1/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer absk-UBTlBowcskRqcQSizQUTeV9d1GZlq0aq'
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const text = await res.text();
      if (retries < 3) {
        console.warn('Aidbase request failed, retrying:', text);
        return sendToAidbase(email, source, retries + 1);
      }
      throw new Error(`Aidbase error: ${text}`);
    }
    return await res.json();
  } catch (err) {
    if (retries < 3) {
      console.warn('Aidbase request error, retrying:', err);
      return sendToAidbase(email, source, retries + 1);
    }
    throw err;
  }
}

app.post('/webhooks/aidbase-lead', async (req, res) => {
  const { email, source, timestamp } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'email required' });
  }
  const lead = { email, source, timestamp: timestamp || new Date().toISOString() };
  appendLead(lead);
  try {
    await sendToAidbase(email, source);
    res.json({ status: 'ok' });
  } catch (err) {
    console.error('Failed to send to Aidbase:', err);
    res.status(500).json({ error: 'Failed to store lead' });
  }
});

module.exports = app;

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log('Server listening on port', port);
  });
}
