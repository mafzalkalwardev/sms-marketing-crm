/**
 * Nova pattern: voice channel stub.
 * Wire OPENAI_REALTIME or local STT/TTS for production voice.
 */

const config = require('../config');

function voiceStatus() {
  return {
    enabled: false,
    pattern: 'nova',
    note: 'Voice requires STT/TTS provider. Use CLI or WebSocket text channel for now.',
    endpoints: {
      websocket: `ws://localhost:${config.port}/ws`,
    },
  };
}

module.exports = { voiceStatus };
