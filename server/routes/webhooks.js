const express = require('express');
const verifyVonageWebhook = require('../middleware/verifyVonageWebhook');
const verifyTwilioWebhook = require('../middleware/verifyTwilioWebhook');
const inboundProcessor = require('../services/inboundProcessor');
const webhookProcessor = require('../services/webhookProcessor');

const router = express.Router();
router.use(express.json());

router.post('/inbound', verifyVonageWebhook, async (req, res, next) => {
  try {
    const { status, body } = await inboundProcessor.processInboundWebhook('vonage', req.body, {
      verified: Boolean(req.webhookVerified?.ok),
    });
    res.status(status).json(body);
  } catch (e) {
    next(e);
  }
});

router.post('/status', verifyVonageWebhook, async (req, res, next) => {
  try {
    const result = await webhookProcessor.processStatusWebhook('vonage', req.body, {
      verified: Boolean(req.webhookVerified?.ok),
    });
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
});

function createProviderWebhookHandler(provider, { verified = false } = {}) {
  return async (req, res, next) => {
    try {
      const path = req.path.endsWith('/status') ? 'status' : 'inbound';
      if (path === 'status') {
        const result = await webhookProcessor.processStatusWebhook(provider, req.body, { verified });
        return res.status(200).json(result);
      }
      const { status, body } = await inboundProcessor.processInboundWebhook(provider, req.body, { verified });
      return res.status(status).json(body);
    } catch (e) {
      return next(e);
    }
  };
}

async function handlerTwilioInbound(req, res, next) {
  try {
    const { status, body } = await inboundProcessor.processInboundWebhook('twilio', req.body, {
      verified: Boolean(req.webhookVerified?.ok),
    });
    res.status(status).json(body);
  } catch (e) {
    next(e);
  }
}

async function handlerTwilioStatus(req, res, next) {
  try {
    const result = await webhookProcessor.processStatusWebhook('twilio', req.body, {
      verified: Boolean(req.webhookVerified?.ok),
    });
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
}

async function handlerMockInbound(req, res, next) {
  try {
    const { status, body } = await inboundProcessor.processInboundWebhook('mock', req.body, { verified: true });
    res.status(status).json(body);
  } catch (e) {
    next(e);
  }
}

async function handlerMockStatus(req, res, next) {
  try {
    const result = await webhookProcessor.processStatusWebhook('mock', req.body, { verified: true });
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
}

module.exports = {
  router,
  createProviderWebhookHandler,
  handlerTwilioInbound,
  handlerTwilioStatus,
  handlerMockInbound,
  handlerMockStatus,
  verifyTwilioWebhook,
};
