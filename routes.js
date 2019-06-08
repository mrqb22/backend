const Router = require('koa-router')
const { graphqlKoa } = require('apollo-server-koa')
const { makeExecutableSchema } = require('graphql-tools')
const koaPlayground = require('graphql-playground-middleware-koa').default
const typeDefs = require('./graphql/types')
const resolvers = require('./graphql/resolvers')
const { btc } = require('./index')

const { WEBHOOK_ENDPOINT, PLAYGROUND_URL, GRAPHQL_URL } = require('./config')

let router = new Router()
const schema = makeExecutableSchema({ typeDefs, resolvers })

router.all(GRAPHQL_URL, graphqlKoa((context) => ({ schema, context, tracing: true, cacheControl: true })))
router.all(PLAYGROUND_URL, koaPlayground({endpoint: GRAPHQL_URL}))

router.post(`/${WEBHOOK_ENDPOINT}`, async (ctx, next) => {
  try {
    let invoice = await btc.get_invoice(ctx.request.body.id)
    if (!invoice) throw new Error('There is no invoice with id ' + ctx.request.body.id)
    let { clientId, publicKey, months, status } = await ctx.db.collection('payments').findOneAndUpdate({invoiceId: invoice.id}, {$set: {status: invoice.status}}).then((res) => res.value)
    if (status !== 'CONFIRMED' && invoice.status === 'CONFIRMED') {
      let subscription = await ctx.db.collection('subscriptions').findOne({clientId})
      let expireAt = subscription ? subscription.expireAt : new Date()
      ctx.db.collection('subscriptions').updateOne({clientId}, {$set: {publicKey, expireAt: expireAt.addDays(months*30)}}, {upsert: true})
    }
    ctx.status = 200
    return
  }
  catch(e) {
    console.error("Webhook error:", e.message)
    ctx.status = 500
    return
  }
})

module.exports = router
