const net = require('node:net');
const tls = require('node:tls');

class MockProvider {
  constructor(channel) {
    this.channel = channel;
    this.sent = [];
    this.mode = 'LOCAL_MOCK';
  }

  async sendMessage(recipient, message, notification = {}) {
    const result = {
      provider: `LOCAL_MOCK_${this.channel.toUpperCase()}`,
      channel: this.channel,
      recipient,
      message,
      alertId: notification.alertId,
      schoolId: notification.schoolId,
      status: 'simulated',
      simulated: true
    };
    this.sent.push(result);
    return result;
  }

  async sendEmailNotification(notification) {
    return this.sendMessage(notification.recipient, notification.message, notification);
  }

  async sendWhatsAppNotification(notification) {
    return this.sendMessage(notification.recipient, notification.message, notification);
  }
}

function requiredEnvironment(names, environment = process.env) {
  return names.every((name) => typeof environment[name] === 'string' && environment[name].trim().length > 0);
}

function validateSmtpConfiguration(environment = process.env) {
  const port = Number(environment.SMARTBREATH_SMTP_PORT);
  if (![465, 587].includes(port)) {
    throw new Error('SMTP must use port 465 (implicit TLS) or 587 (STARTTLS).');
  }
  if (!requiredEnvironment([
    'SMARTBREATH_SMTP_HOST', 'SMARTBREATH_SMTP_PORT', 'SMARTBREATH_SMTP_USER',
    'SMARTBREATH_SMTP_PASSWORD', 'SMARTBREATH_EMAIL_FROM'
  ], environment)) {
    throw new Error('SMTP configuration is incomplete.');
  }
  return { port, transport: port === 465 ? 'TLS' : 'STARTTLS' };
}

function smtpCommand(socket, command, expected = /^2|^3/) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const onData = (chunk) => {
      buffer += chunk.toString();
      if (!/\r?\n/.test(buffer)) return;
      socket.off('data', onData);
      const code = Number(buffer.slice(0, 3));
      if (!expected.test(String(code))) return reject(new Error(`SMTP command failed (${code}).`));
      resolve();
    };
    socket.on('data', onData);
    socket.write(`${command}\r\n`);
  });
}

async function sendSmtpEmail(notification) {
  const { port, transport } = validateSmtpConfiguration();
  const socket = transport === 'TLS'
    ? tls.connect({ host: process.env.SMARTBREATH_SMTP_HOST, port, rejectUnauthorized: true })
    : net.connect({ host: process.env.SMARTBREATH_SMTP_HOST, port });
  await new Promise((resolve, reject) => {
    socket.once('secureConnect', resolve);
    socket.once('connect', resolve);
    socket.once('error', reject);
  });
  await new Promise((resolve, reject) => {
    const onData = (chunk) => {
      socket.off('data', onData);
      if (!/^2|^3/.test(chunk.toString().slice(0, 3))) reject(new Error('SMTP greeting failed.'));
      else resolve();
    };
    socket.on('data', onData);
  });
  await smtpCommand(socket, `EHLO ${process.env.SMARTBREATH_SMTP_HOST}`);
  if (transport === 'STARTTLS') {
    await smtpCommand(socket, 'STARTTLS');
    const secureSocket = tls.connect({
      socket,
      host: process.env.SMARTBREATH_SMTP_HOST,
      rejectUnauthorized: true
    });
    await new Promise((resolve, reject) => {
      secureSocket.once('secureConnect', resolve);
      secureSocket.once('error', reject);
    });
    await smtpCommand(secureSocket, `EHLO ${process.env.SMARTBREATH_SMTP_HOST}`);
    return sendAuthenticatedSmtp(secureSocket, notification);
  }
  return sendAuthenticatedSmtp(socket, notification);
}

async function sendAuthenticatedSmtp(socket, notification) {
  await smtpCommand(socket, 'AUTH LOGIN');
  await smtpCommand(socket, Buffer.from(process.env.SMARTBREATH_SMTP_USER).toString('base64'));
  await smtpCommand(socket, Buffer.from(process.env.SMARTBREATH_SMTP_PASSWORD).toString('base64'));
  await smtpCommand(socket, `MAIL FROM:<${process.env.SMARTBREATH_EMAIL_FROM}>`);
  await smtpCommand(socket, `RCPT TO:<${notification.recipient}>`);
  await smtpCommand(socket, 'DATA');
  socket.write(
    `From: ${process.env.SMARTBREATH_EMAIL_FROM}\r\nTo: ${notification.recipient}\r\n` +
    `Subject: ${notification.subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n` +
    `${notification.message}\r\n.\r\n`
  );
  await smtpCommand(socket, 'QUIT');
  socket.end();
  return { provider: 'SMTP', channel: 'email', status: 'sent', simulated: false };
}

class EmailProvider {
  constructor({ mock = new MockProvider('email') } = {}) {
    this.mock = mock;
    const configured = [
      'SMARTBREATH_SMTP_HOST', 'SMARTBREATH_SMTP_PORT', 'SMARTBREATH_SMTP_USER',
      'SMARTBREATH_SMTP_PASSWORD', 'SMARTBREATH_EMAIL_FROM'
    ].some((name) => process.env[name]);
    this.mode = configured ? 'SMTP' : 'LOCAL_MOCK';
    if (this.mode === 'SMTP') validateSmtpConfiguration();
  }

  async sendEmailNotification(notification) {
    if (this.mode !== 'SMTP' || notification.simulated) return this.mock.sendEmailNotification(notification);
    return sendSmtpEmail(notification);
  }

  async sendMessage(recipient, message) {
    return this.sendEmailNotification({ recipient, message, simulated: true });
  }
}

class WhatsAppProvider {
  constructor({ mock = new MockProvider('whatsapp') } = {}) {
    this.mock = mock;
    this.mode = process.env.SMARTBREATH_WHATSAPP_ENABLED === 'true' &&
      requiredEnvironment([
        'SMARTBREATH_WHATSAPP_ACCESS_TOKEN',
        'SMARTBREATH_WHATSAPP_PHONE_NUMBER_ID',
        'SMARTBREATH_WHATSAPP_API_VERSION',
        'SMARTBREATH_WHATSAPP_TEMPLATE_NAME'
      ]) ? 'WHATSAPP_CLOUD' : 'LOCAL_MOCK';
  }

  async sendWhatsAppNotification(notification) {
    if (this.mode !== 'WHATSAPP_CLOUD' || notification.simulated) {
      return this.mock.sendWhatsAppNotification(notification);
    }
    const response = await fetch(
      `https://graph.facebook.com/${process.env.SMARTBREATH_WHATSAPP_API_VERSION}/${process.env.SMARTBREATH_WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.SMARTBREATH_WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: notification.recipient,
          type: 'template',
          template: {
            name: process.env.SMARTBREATH_WHATSAPP_TEMPLATE_NAME,
            language: { code: process.env.SMARTBREATH_WHATSAPP_TEMPLATE_LANGUAGE || 'en_US' },
            components: [{ type: 'body', parameters: [{ type: 'text', text: notification.message }] }]
          }
        })
      }
    );
    if (!response.ok) throw new Error(`WhatsApp provider rejected notification (${response.status}).`);
    return { provider: 'WHATSAPP_CLOUD', channel: 'whatsapp', status: 'sent', simulated: false };
  }

  async sendMessage(recipient, message) {
    return this.sendWhatsAppNotification({ recipient, message, simulated: true });
  }
}

function createProviders() {
  const email = new EmailProvider();
  const whatsapp = new WhatsAppProvider();
  return {
    sms: new MockProvider('sns-sms'),
    email,
    whatsapp,
    modes: { email: email.mode, whatsapp: whatsapp.mode }
  };
}

module.exports = {
  MockProvider,
  EmailProvider,
  WhatsAppProvider,
  createProviders,
  requiredEnvironment,
  validateSmtpConfiguration
};
