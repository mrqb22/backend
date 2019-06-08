module.exports = process.env.NODE_ENV === 'production' ? { // production
  PORT: parseInt(process.env.PORT),
  MONGO_URL: process.env.MONGO_URL,
  GRAPHQL_URL: process.env.GRAPHQL_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
  RESET_PASSWORD_EMAIL: process.env.RESET_PASSWORD_EMAIL,
  RESET_PASSWORD_URL: process.env.RESET_PASSWORD_URL,
  TRIAL_DAYS: parseInt(process.env.TRIAL_DAYS),
  BTC_PRIVATE_KEY: process.env.BTC_PRIVATE_KEY,
  BTC_MERCHANT_ID: process.env.BTC_MERCHANT_ID,
  BTC_MERCHANT_URL: process.env.BTC_MERCHANT_URL,
  MONTH_PRICE: parseInt(process.env.MONTH_PRICE),
  WEBHOOK_ENDPOINT:  process.env.WEBHOOK_ENDPOINT,
  MAIN_DOMAIN: process.env.MAIN_DOMAIN,
  API_DOMAIN: process.env.API_DOMAIN,
  ADMIN_IDS: process.env.ADMIN_IDS.split(' '),
  PLAYGROUND_URL: '/playground',
  APOLLO_API_KEY: process.env.APOLLO_API_KEY,
  AFFILATE_FEE: parseFloat(process.env.AFFILATE_FEE),
  CONFIG_TEMPLATE: (server, dnsType, privateKey, port) => `[Interface]
ListenPort = 51280
PrivateKey = ${privateKey}
Address = ${server.address}
DNS = ${server[dnsType]}

[Peer]
PublicKey = ${server.publicKey}
AllowedIPs = 0.0.0.0/0
Endpoint = ${server.endpointIP}:${port || server.endpointPort}`,
} : { // development & test
  PORT: 3001,
  MONGO_URL: '',
  GRAPHQL_URL: '/graphql',
  JWT_SECRET: 'secret',
  SENDGRID_API_KEY: '',
  RESET_PASSWORD_EMAIL: '',
  RESET_PASSWORD_URL: '.../reset/token/',
  TRIAL_DAYS: 1,
  BTC_PRIVATE_KEY: '',
  BTC_MERCHANT_ID: '',
  BTC_MERCHANT_URL: '',
  MONTH_PRICE: 5,
  WEBHOOK_ENDPOINT: 'wh',
  MAIN_DOMAIN: '',
  API_DOMAIN: '',
  ADMIN_IDS: [''],
  PLAYGROUND_URL: '/playground',
  APOLLO_API_KEY: '',
  AFFILATE_FEE: 0.3,
  CONFIG_TEMPLATE: (server, dnsType, privateKey, port) => `[Interface]
ListenPort = 51280
PrivateKey = ${privateKey}
Address = ${server.address}
DNS = ${server[dnsType]}

[Peer]
PublicKey = ${server.publicKey}
AllowedIPs = 0.0.0.0/0
Endpoint = ${server.endpointIP}:${port || server.endpointPort}`,
}
