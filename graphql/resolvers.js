const argon2 = require('argon2')
const { ObjectId } = require('mongodb')
const { randomBytes } = require('crypto')
const jwt = require('jsonwebtoken')
const curve = require('curve25519-n')
const { GraphQLScalarType } = require('graphql')
const { Kind } = require('graphql/language')
const JSZip = require('jszip')

const {
  JWT_SECRET,
  RESET_PASSWORD_EMAIL,
  RESET_PASSWORD_URL,
  TRIAL_DAYS,
  MONTH_PRICE,
  MAIN_DOMAIN,
  API_DOMAIN,
  WEBHOOK_ENDPOINT,
  ADMIN_IDS,
  AFFILATE_FEE,
  CONFIG_TEMPLATE,
} = require('../config')

module.exports = {
  Date: new GraphQLScalarType({
    name: 'Date',
    description: 'Date custom scalar type',
    parseValue(value) {
      return new Date(value)
    },
    serialize(value) {
      return value.getTime()
    },
    parseLiteral(ast) {
      if (ast.kind === Kind.INT) {
        return parseInt(ast.value, 10)
      }
      return null;
    },
  }),
  Query: {
    getUser: async (obj, args, ctx) => ctx.state.user ? await ctx.db.collection('users').findOne({_id: ObjectId(ctx.state.user._id)}) : null,
    getIPInfo: async (obj, args, ctx) => {
      let ip = ctx.req.headers['x-bb-ip'] || 'unknown'
      let country = ctx.req.headers['x-country'] || 'unknown'
      let VPNServer = await ctx.db.collection('servers').find({ip}).limit(1).count()
      let connected = VPNServer ? true : false
      return { ip, country, connected }
    },
    getExpTime: async (obj, args, ctx) => await ctx.db.collection('subscriptions').findOne({clientId: ctx.state.user._id}).then(res => res.expireAt),
    getRate: async (obj, args, ctx) => await ctx.btc.get_rates('BTC_EUR').then(res => res[0].rate),
    getAffilateBalance: async (obj, args, ctx) => {
      let rewarded = await ctx.db.collection('payments').aggregate([{$match: {ref: ctx.state.user._id, status: 'CONFIRMED'}}, {$group: {_id: null, rewarded: {$sum: '$affilateRewardedSatoshis'}}}]).then(res => res.rewarded)
      let withdrawed = await ctx.db.collection('payments').aggregate([{$match: {ref: ctx.state.user._id}}, {$group: {_id: null, withdrawed: {$sum: '$affilateWithdrawedSatoshis'}}}]).then(res => res.withdrawed)
      return (rewarded - withdrawed)
    },
    getInvoices: async (obj, args, ctx) => await ctx.db.collection('payments').find({clientId: ctx.state.user._id}).sort({createdAt: -1}).toArray()
  },
  Mutation: {
    signUp: async (obj, {username, password, email, ref}, ctx) => {
      let userExists = await ctx.db.collection('users').find({username}).limit(1).count()
      if (userExists) throw new Error("User exists")
      let hash = await argon2.hash(password)
      let token = randomBytes(6).toString('hex')
      let privateKeyBuffer = curve.makeSecretKey(randomBytes(32))
      let privateKey = privateKeyBuffer.toString('base64')
      let publicKey = curve.derivePublicKey(privateKeyBuffer).toString('base64')
      let lastUser = await ctx.db.collection('users').find().sort({octets: -1}).limit(1).toArray().then(res => res[0])
      let octets = (lastUser && !isNaN(lastUser.octets)) ? lastUser.octets + 1 : 1
      let clientId = await ctx.db.collection('users').insertOne({username, password: hash, email, ref, loginTokens: [token], publicKey, privateKey, withdrawedSatoshis: 0, octets, createdAt: new Date()})
      .then(res => res.ops[0]._id.toString())
      let now = new Date()
      await ctx.db.collection('subscriptions').insertOne({clientId, publicKey, expireAt: now.addDays(TRIAL_DAYS), octets})
      return jwt.sign({_id: clientId, token}, JWT_SECRET, { expiresIn: '60 days', noTimestamp: true})
    },
    login: async (obj, {username, password}, ctx) => {
      let user = await ctx.db.collection('users').findOne({username})
      if (!user) throw new Error("Unathorized")
      let valid = await argon2.verify(user.password, password)
      if (!valid) throw new Error("Unathorized")
      let token = randomBytes(6).toString('hex')
      await ctx.db.collection('users').updateOne({username}, {$push: {loginTokens: token}})
      return jwt.sign({_id: user._id, token}, JWT_SECRET, { expiresIn: '60 days', noTimestamp: true})
    },
    changePassword: async (obj, {newPassword, resetPasswordToken}, ctx) => {
      const setPassword = async (_id) => {
        let hash = await argon2.hash(newPassword)
        let token = randomBytes(6).toString('hex')
        await ctx.db.collection('users').updateOne({ _id: ObjectId(_id)}, {$set: {password: hash, loginTokens: [token]}})
        return jwt.sign({_id, token}, JWT_SECRET, { expiresIn: '60 days', noTimestamp: true })
      }
      if (resetPasswordToken) {
        let decoded = jwt.verify(resetPasswordToken, JWT_SECRET)
        if (decoded) return await setPassword(decoded._id)
        else throw new Error('Invalid token')
      }
      else return await setPassword(ctx.state.user._id)
    },
    changeEmail: async (obj, {newEmail}, ctx) => await ctx.db.collection('users').findOneAndUpdate({_id: ObjectId(ctx.state.user._id)}, {$set: {email: newEmail}}).then(res => res.value),
    resetPassword: async (obj, {email}, ctx) => {
      let user = await ctx.db.collection('users').findOne({email})
      if (!user) throw new Error('Incorrect email')
      let resetPasswordToken = jwt.sign({_id: user._id}, JWT_SECRET, { expiresIn: '1h', noTimestamp: true})
      const msg = {
        to: email,
        from: RESET_PASSWORD_EMAIL,
        subject: 'Reset Password',
        text: `Please click ${RESET_PASSWORD_URL + resetPasswordToken}`,
        //html: '<strong>and easy to do anywhere, even with Node.js</strong>',
      }
      await ctx.sgMail.send(msg)
      return "ok"
    },
    verifyResetPasswordToken: async (obj, {resetPasswordToken}, ctx) => {
      let decoded = jwt.verify(resetPasswordToken, JWT_SECRET)
      if (decoded)
        return "ok"
      else throw new Error('Token invalid')
    },
    deleteAccount: async (obj, args, ctx) => {
      await ctx.db.collection('users').deleteOne({_id: ObjectId(ctx.state.user._id)})
      return "ok"
    },
    getInvoice: async (obj, { months, paymentType }, ctx) => {
      let { publicKey, ref } = await ctx.db.collection('users').findOne({_id: ObjectId(ctx.state.user._id)})
      let price = MONTH_PRICE*months
      let invoice = await ctx.btc.create_invoice({
        price,
        currency: 'EUR',
        itemDesc: `VPN · ${months*30} days`,
        notificationURL: API_DOMAIN+WEBHOOK_ENDPOINT,
        redirectURL: MAIN_DOMAIN
      })
      await ctx.db.collection('payments').insertOne({
        clientId: ctx.state.user._id,
        publicKey,
        months,
        price,
        btcPrice: invoice.btcPrice,
        currency: 'EUR',
        paymentType,
        type: 'TOP_UP',
        invoiceUrl: invoice.url,
        invoiceId: invoice.id,
        status: 'UNCONFIRMED',
        createdAt: new Date(invoice.invoiceTime),
        expirationTime: new Date(invoice.expirationTime),
        ref,
        affilateRewardedSatoshis: Math.round(1e8*invoice.btcPrice*AFFILATE_FEE)
      })
      return invoice.url
    },
    addDaysToClient: async (obj, { days, clientId }, ctx) => {
      if (ADMIN_IDS.includes(ctx.state.user._id)) {
        let { publicKey, octets } = await ctx.db.collection('users').findOne({_id: ObjectId(clientId)})
        let subscription = await ctx.db.collection('subscriptions').findOne({clientId})
        let expireAt = subscription ? subscription.expireAt : new Date()
        await ctx.db.collection('subscriptions').updateOne({clientId}, {$set: {publicKey, expireAt: expireAt.addDays(days), octets}}, {upsert: true})
        return 'ok'
      }
      else throw new Error('No-no-no')
    },
    withdrawAffilateRewardBTC: async (obj, { btc, clientId }, ctx) => {
      if (ADMIN_IDS.includes(ctx.state.user._id)) {
        let satoshis = Math.round(1e8*btc)
        await ctx.db.collection('payments').insertOne({clientId, affilateWithdrawedSatoshis: satoshis, status: 'CONFIRMED', type: 'AFFILATE_WITHDRAWAL_BTC'})
        return 'ok'
      }
      else throw new Error('No-no-no')
    },
    withdrawAffilateRewardDays: async (obj, args, ctx) => {
      let rewarded = await ctx.db.collection('payments').aggregate([{$match: {ref: ctx.state.user._id, status: 'CONFIRMED', type: 'TOP_UP'}}, {$group: {_id: null, rewarded: {$sum: '$affilateRewardedSatoshis'}}}]).then(res => res.rewarded)
      let withdrawed = await ctx.db.collection('payments').aggregate([{$match: {ref: ctx.state.user._id, type: 'AFFILATE_WITHDRAWAL'}}, {$group: {_id: null, withdrawed: {$sum: '$affilateWithdrawedSatoshis'}}}]).then(res => res.withdrawed)
      let balance = rewarded - withdrawed
      let rate = await ctx.btc.get_rates('BTC_EUR').then(res => res[0].rate)
      let days = Math.round(30*balance/(1e8*MONTH_PRICE/rate))
      if (days < 1)
        throw new Errow('Insufficient balance')
      let { publicKey, octets } = await ctx.db.collection('users').findOne({_id: ObjectId(ctx.state.user._id)})
      let subscription = await ctx.db.collection('subscriptions').findOne({clientId: ctx.state.user._id})
      let expireAt = subscription ? subscription.expireAt : new Date()
      await ctx.db.collection('subscriptions').updateOne({clientId: ctx.state.user._id}, {$set: {publicKey, octets, expireAt: expireAt.addDays(days)}}, {upsert: true})
      await ctx.db.collection('payments').insertOne({clientId: ctx.state.user._id, affilateWithdrawedSatoshis: balance, status: 'CONFIRMED', type: 'AFFILATE_WITHDRAWAL_DAYS'})
      return 'ok'
    },
    getConfig: async (obj, {country, dnsType, exitCountry}, ctx) => {
      let { privateKey } = await ctx.db.collection('users').findOne({_id: ObjectId(ctx.state.user._id)})
      let server =  await ctx.db.collection('servers').findOne({country})
      let port = exitCountry !== country ? exitCountry.charCodeAt(0).toString() + exitCountry.charCodeAt(1).toString() : null
      let config = CONFIG_TEMPLATE(server, dnsType, privateKey, port)
      return new Buffer.from(config).toString('base64')
    },
    getAllConfigsZIP: async (obj, args, ctx) => {
      let { privateKey } = await ctx.db.collection('users').findOne({_id: ObjectId(ctx.state.user._id)})
      let servers = await ctx.db.collection('servers').find().toArray()
      let countries = [...new Set(servers.map(server => server.country))]
      let zip = new JSZip()
      for (let server of servers) {
        zip.file(`${server.country}.conf`, CONFIG_TEMPLATE(server, 'DNS_SIMPLE', privateKey))
        zip.file(`${server.country} - AdBlock.conf`, CONFIG_TEMPLATE(server, 'DNS_ADBLOCK', privateKey))
        for (let country of countries) {
          if (country !== server.country) {
            let port = country.charCodeAt(0).toString() + country.charCodeAt(1).toString()
            zip.file(`${server.country} - ${country}.conf`, CONFIG_TEMPLATE(server, 'DNS_SIMPLE', privateKey, port))
            zip.file(`${server.country} - ${country} - AdBlock.conf`, CONFIG_TEMPLATE(server, 'DNS_ADBLOCK', privateKey, port))
          }
        }
      }
      return await zip.generateAsync({type: 'base64'})
    }
  }
}
