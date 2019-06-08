const fs = require('fs')
const koa = require('koa')
const bodyParser = require('koa-bodyparser')
const { MongoClient, ObjectId } = require('mongodb')
const jwt = require('koa-jwt')
const { ApolloEngine } = require('apollo-engine')
const btcpay = require('btcpay')
const sgMail = require('@sendgrid/mail')
const router = require('./routes')

const {
  MONGO_URL,
  JWT_SECRET,
  APOLLO_API_KEY,
  PORT,
  BTC_PRIVATE_KEY,
  BTC_MERCHANT_URL,
  BTC_MERCHANT_ID,
  SENDGRID_API_KEY
} = require('./config')

Date.prototype.addDays = function(days) {
  var dat = new Date(this.valueOf())
  dat.setDate(dat.getDate() + days)
  return dat
}

let keyPair = btcpay.crypto.load_keypair(new Buffer.from(BTC_PRIVATE_KEY, 'hex'))
let btc = new btcpay.BTCPayClient(BTC_MERCHANT_URL, keyPair, {merchant: BTC_MERCHANT_ID})
const engine = new ApolloEngine({apiKey: APOLLO_API_KEY})
sgMail.setApiKey(SENDGRID_API_KEY)

const app = new koa()
app.use(bodyParser())
app.use(jwt({ secret: JWT_SECRET, passthrough: true })) // set ctx.state.user
app.use(async (ctx, next) => { //rm ctx.state.user if not auth
  if (ctx.state.user) {
    let isAuthenticated = await ctx.db.collection('users').find({_id: ObjectId(ctx.state.user._id), loginTokens: ctx.state.user.token}).limit(1).count()
    if (!isAuthenticated)
      ctx.state.user = null
  }
  return next()
})
app.use(router.routes()).use(router.allowedMethods());

(async function() {
  let client = await MongoClient.connect(MONGO_URL)
  app.context.db = client.db()
  app.context.btc = btc
  app.context.sgMail = sgMail
  engine.listen({port: PORT, koaApp: app})
})()
