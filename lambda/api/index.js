function handler() {
  return {
    statusCode: 501,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      error: 'Production API adapter requires API Gateway Cognito claims and approved repository adapters.'
    })
  };
}

module.exports = { handler };
