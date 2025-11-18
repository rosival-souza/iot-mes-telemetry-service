import express from 'express';
import bodyParser from 'body-parser';
import mqtt from 'mqtt';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

const MQTT_URL = process.env.MQTT_URL || 'mqtt://localhost:1883';
const TOPIC = 'ska/machine/+/metrics';

const db = new Database('events.db');
db.exec(`
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  machineId TEXT,
  ts INTEGER,
  status TEXT,
  cycleTimeMs INTEGER,
  goodUnits INTEGER DEFAULT 1,
  raw TEXT
);`);

const insertStmt = db.prepare(`INSERT INTO events (id,machineId,ts,status,cycleTimeMs,goodUnits,raw) VALUES (@id,@machineId,@ts,@status,@cycleTimeMs,@goodUnits,@raw)`);

const client = mqtt.connect(MQTT_URL);

client.on('connect', () => {
  console.log('MQTT connected to', MQTT_URL);
  client.subscribe(TOPIC, { qos: 1 });
});

client.on('message', (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    // minimal validation
    if (!payload.machineId || !payload.timestamp) {
      console.warn('invalid payload', payload);
      return;
    }
    const ev = {
      id: uuidv4(),
      machineId: payload.machineId,
      ts: payload.timestamp,
      status: payload.status || 'UNKNOWN',
      cycleTimeMs: payload.cycleTimeMs || null,
      goodUnits: payload.goodUnits || 1,
      raw: JSON.stringify(payload)
    };
    insertStmt.run(ev);
    console.log('event stored', ev.machineId, ev.ts);
  } catch (err) {
    console.error('mqtt message parse error', err);
  }
});

// REST API
const app = express();
app.use(bodyParser.json());

app.get('/machines/:id/events', (req, res) => {
  const id = req.params.id;
  const rows = db.prepare('SELECT * FROM events WHERE machineId = ? ORDER BY ts DESC LIMIT ?').all(id, Number(req.query.limit || 100));
  res.json(rows);
});

app.get('/machines/:id/oee', (req, res) => {
  const id = req.params.id;
  const from = Number(req.query.from || 0);
  const to = Number(req.query.to || Date.now());
  const rows = db.prepare('SELECT * FROM events WHERE machineId = ? AND ts BETWEEN ? AND ?').all(id, from, to);
  if (rows.length === 0) return res.json({ machineId: id, oee: 0, details: {} });

  // Simplified calculations
  const plannedTimeMs = (to - from) || 1;
  const runEvents: any = rows.filter((r: any) => r.status === 'RUN');
  const uptimeMs = runEvents.length * (runEvents[0]?.cycleTimeMs || 0); // simplificação demonstrativa
  const availability = Math.min(1, uptimeMs / plannedTimeMs);

  const producedUnits = rows.length;
  const idealCycleMs = 1000; // param default
  const actualRunTime = runEvents.reduce((s: any, r: any) => s + (r.cycleTimeMs || 0), 0);
  const performance = actualRunTime ? Math.min(1, (idealCycleMs * producedUnits) / actualRunTime) : 0.0;

  const goodUnits: any = rows.reduce((s, r: any) => s + (r.goodUnits || 1), 0);
  const quality = producedUnits ? (goodUnits / producedUnits) : 1;

  const oee = availability * performance * quality;

  res.json({
    machineId: id,
    oee,
    availability,
    performance,
    quality,
    producedUnits,
    samples: rows.length
  });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log('Collector REST on', port));
