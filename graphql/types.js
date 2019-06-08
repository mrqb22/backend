module.exports = `
schema {
  query: Query
  mutation: Mutation
}

type Query {
  getUser: User
  getIPInfo: IPInfo!
  getExpTime: Date
  getRate: Float!
  getAffilateBalance: Int!
  getInvoices: [Invoice]
}

type Mutation {
  login(username: String!, password: String!): String!
  signUp(username: String!, password: String!, email: String, ref: String): String!
  changeEmail(newEmail: String!): User!
  changePassword(newPassword: String!, resetPasswordToken: String): String!
  resetPassword(email: String!): String!
  verifyResetPasswordToken(resetPasswordToken: String!): String!
  deleteAccount: String
  getInvoice(months: Int!, paymentType: PaymentType!): String!
  addDaysToClient(days: Int!, clientId: ID!): String!
  withdrawAffilateRewardBTC(btc: Float!, clientId: ID!): String!
  withdrawAffilateRewardDays: String!
  getConfig(country: Country!, exitCountry: Country!, dnsType: DNSType!): String!
  getAllConfigsZIP: String!
}

type User {
  _id: ID!
  username: String!
  email: String
  privateKey: String!
  publicKey: String!
}

type Invoice {
  _id: ID!
  months: Int
  price: Float
  btcPrice: Float
  currency: Currency
  paymentType: PaymentType
  type: InvoiceType
  invoiceUrl: String
  status: InvoiceStatus
  createdAt: Date
  expirationTime: Date
  affilateRewardedSatoshis: Int
}

type IPInfo {
  ip: String!
  connected: Boolean!
  country: String
}

enum PaymentType {
  CRYPTO
}

enum DNSType {
  DNS_SIMPLE
  DNS_ADBLOCK
}

enum Country {
  SE
}

enum Currency {
  EUR
}

enum InvoiceType {
  TOP_UP
  AFFILATE_WITHDRAWAL_BTC
  AFFILATE_WITHDRAWAL_DAYS
  REFUND
}

enum InvoiceStatus {
  CONFIRMED
  UNCONFIRMED
}

scalar Date
`
