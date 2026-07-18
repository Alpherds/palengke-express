import { factories } from '@strapi/strapi'
import { randomUUID } from 'node:crypto'

function generateOrderCode(): string {
  const now = new Date()

  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')

  const reference = randomUUID()
    .replace(/-/g, '')
    .slice(0, 8)
    .toUpperCase()

  return `PLX-${year}${month}${day}-${reference}`
}

export default factories.createCoreController(
  'api::order.order',

  ({ strapi }) => ({
    async submit(ctx) {
      try {
        const body = (ctx.request.body ?? {}) as Record<string, unknown>

        const customerName = String(
          body.customer_name ?? '',
        ).trim()

        const productDocumentId = String(
          body.product_document_id ?? '',
        ).trim()

        const quantity = Number(body.quantity)

        /*
        |--------------------------------------------------------------------------
        | Validate customer name
        |--------------------------------------------------------------------------
        */

        if (
          customerName.length < 2
          || customerName.length > 100
        ) {
          return ctx.badRequest(
            'Maglagay ng wastong pangalan.',
          )
        }

        /*
        |--------------------------------------------------------------------------
        | Validate and normalize contact number
        |--------------------------------------------------------------------------
        */

        let contactNumber = String(
          body.contact_number ?? '',
        )
          .trim()
          .replace(/[\s()-]/g, '')

        if (contactNumber.startsWith('+63')) {
          contactNumber = `0${contactNumber.slice(3)}`
        }

        if (!/^09\d{9}$/.test(contactNumber)) {
          return ctx.badRequest(
            'Maglagay ng wastong Philippine mobile number.',
          )
        }

        /*
        |--------------------------------------------------------------------------
        | Validate quantity
        |--------------------------------------------------------------------------
        */

        if (
          !Number.isInteger(quantity)
          || quantity < 1
          || quantity > 100
        ) {
          return ctx.badRequest(
            'Ang quantity ay dapat mula 1 hanggang 100.',
          )
        }

        if (!productDocumentId) {
          return ctx.badRequest(
            'Kailangan pumili ng produkto.',
          )
        }

        /*
        |--------------------------------------------------------------------------
        | Get the current product from Strapi
        |--------------------------------------------------------------------------
        */

        const product = await strapi
          .documents('api::product.product')
          .findOne({
            documentId: productDocumentId,
            status: 'published',
          })

        if (!product || !product.is_active) {
          return ctx.notFound(
            'Hindi available ang napiling produkto.',
          )
        }

        /*
        |--------------------------------------------------------------------------
        | Compute total using the stored price
        |--------------------------------------------------------------------------
        */

        const productPrice = Number(product.price)

        if (
          !Number.isFinite(productPrice)
          || productPrice < 0
        ) {
          return ctx.internalServerError(
            'Invalid ang presyo ng produkto.',
          )
        }

        const totalAmount = Number(
          (productPrice * quantity).toFixed(2),
        )

        const orderCode = generateOrderCode()

        /*
        |--------------------------------------------------------------------------
        | Create the order
        |--------------------------------------------------------------------------
        */

        const order = await strapi
          .documents('api::order.order')
          .create({
            status: 'published',

            data: {
              order_code: orderCode,
              customer_name: customerName,
              contact_number: contactNumber,
              quantity,
              total_amount: totalAmount,
              order_status: 'pending',

              product: product.documentId,
            } as any,
          })

        /*
        |--------------------------------------------------------------------------
        | Return only safe customer-facing data
        |--------------------------------------------------------------------------
        */

        ctx.status = 201

        ctx.body = {
          data: {
            documentId: order.documentId,
            order_code: order.order_code,
            customer_name: order.customer_name,
            contact_number: order.contact_number,
            quantity: order.quantity,
            total_amount: order.total_amount,
            order_status: order.order_status,

            product: {
              documentId: product.documentId,
              product_name: product.product_name,
              price: product.price,
              unit: product.unit,
            },
          },
        }
      } catch (error) {
        strapi.log.error('Order submission failed:', error)

        return ctx.internalServerError(
          'Hindi naisumite ang order. Subukan muli.',
        )
      }
    },
  }),
)