class MockProvider {
  constructor(channel) {
    this.channel = channel;
    this.sent = [];
  }

  async sendMessage(recipient, message) {
    const result = { provider: `LOCAL_MOCK_${this.channel.toUpperCase()}`, recipient, message, simulated: true };
    this.sent.push(result);
    return result;
  }
}

function createProviders() {
  return {
    sms: new MockProvider('sns-sms'),
    email: new MockProvider('sns-email'),
    whatsapp: new MockProvider('whatsapp')
  };
}

module.exports = { MockProvider, createProviders };
