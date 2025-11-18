const mqtt = require('mqtt');
const client = mqtt.connect(process.env.MQTT_URL || 'mqtt://localhost:1883');

const machineId = process.env.MACHINE_ID || 'M01';
const topic = `ska/machine/${machineId}/metrics`;

client.on('connect', () => {
  console.log('sensor emulator connected');
  setInterval(() => {
    const payload = {
      machineId,
      timestamp: Date.now(),
      status: Math.random() > 0.1 ? 'RUN' : 'STOP',
      cycleTimeMs: Math.floor(800 + Math.random() * 800),
      goodUnits: Math.random() > 0.05 ? 1 : 0
    };
    client.publish(topic, JSON.stringify(payload), { qos: 1 }, () => {
      // console.log('published', payload);
    });
  }, 800);
});
